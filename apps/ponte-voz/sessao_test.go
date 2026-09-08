package main

import (
	"errors"
	"io"
	"log/slog"
	"net"
	"sync"
	"testing"
)

func sessaoDeTeste(t *testing.T) *SessaoWs {
	t.Helper()
	_, rei := tokenDeTeste(t, nil)
	return NovaSessao(rei, 42, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// Antes do SESSION_DESCRIPTION não há chave: `false`, e **sem log por pacote**
// (o cliente manda RTP antes da hora, e isso é normal).
func TestSessaoSemChaveNaoDecifra(t *testing.T) {
	s := sessaoDeTeste(t)
	if _, ok := s.Decifrar(make([]byte, 40)); ok {
		t.Error("Decifrar devolveu ok sem cifrador")
	}
	s.DefinirCifrador(&cifradorDoA2{chave: make([]byte, 32)})
	opus, ok := s.Decifrar(append(make([]byte, 12), 7, 7, 7))
	if !ok {
		t.Fatal("Decifrar falhou com cifrador definido")
	}
	if len(opus) != 3 {
		t.Errorf("quadro de %d bytes, queria 3", len(opus))
	}
}

func TestSessaoPublicarSemFaixaNaoQuebra(t *testing.T) {
	s := sessaoDeTeste(t)
	for range 5 {
		s.Publicar([]byte{1, 2, 3})
	}
	if n := s.quadrosSemFaixa.Load(); n != 5 {
		t.Errorf("quadros descartados = %d, queria 5", n)
	}
	if s.quadros.Load() != 0 {
		t.Error("contou quadro publicado sem faixa")
	}
}

func TestSessaoPublicarComFaixa(t *testing.T) {
	s := sessaoDeTeste(t)
	p := &publicadorDoA2{}
	if !s.DefinirPublicador(p) {
		t.Fatal("DefinirPublicador recusou uma sessão viva")
	}
	s.Publicar([]byte{9, 9})
	s.Publicar(nil) // quadro vazio não vira sample
	if n := p.contar(); n != 1 {
		t.Errorf("quadros escritos = %d, queria 1", n)
	}

	// Erro do `WriteSample` não pode virar panic nem parar a sessão.
	p.erroEscrever = errors.New("payloader recusou")
	s.Publicar([]byte{1})
	if !s.Viva() {
		t.Error("um erro de escrita matou a sessão")
	}
}

func TestSessaoFecharEhIdempotente(t *testing.T) {
	s := sessaoDeTeste(t)
	p := &publicadorDoA2{}
	s.DefinirPublicador(p)

	s.Fechar()
	s.Fechar()
	s.Fechar()

	if s.Viva() {
		t.Error("a sessão continuou viva depois de Fechar")
	}
	if !p.saiu() {
		t.Error("Fechar não saiu da sala do LiveKit")
	}
	// Um pacote ainda em voo depois do Fechar: nada de panic, nada publicado.
	s.Publicar([]byte{1, 2, 3})
	if n := p.contar(); n != 0 {
		t.Errorf("publicou %d quadros com a sessão fechada", n)
	}
	if _, ok := s.Decifrar(make([]byte, 40)); ok {
		t.Error("decifrou com a sessão fechada")
	}
	if s.DefinirPublicador(&publicadorDoA2{}) {
		t.Error("DefinirPublicador aceitou uma sessão morta")
	}
}

func TestSessaoOrigem(t *testing.T) {
	s := sessaoDeTeste(t)
	if s.Origem() != nil {
		t.Error("Origem devia ser nil antes da descoberta de IP")
	}
	endereco := &net.UDPAddr{IP: net.ParseIP("198.51.100.9"), Port: 50123}
	s.FixarOrigem(endereco)
	if s.Origem().String() != endereco.String() {
		t.Errorf("Origem = %v, queria %v", s.Origem(), endereco)
	}
	if s.SSRC() != 42 {
		t.Errorf("SSRC = %d, queria 42", s.SSRC())
	}
}

// O laço de UDP (lote A1) chama `Decifrar`/`Publicar` de uma goroutine e o WS
// fecha de outra: com `-race`, este teste é o que prova que dá.
func TestSessaoAguentaConcorrencia(t *testing.T) {
	s := sessaoDeTeste(t)
	s.DefinirCifrador(&cifradorDoA2{chave: make([]byte, 32)})
	s.DefinirPublicador(&publicadorDoA2{})

	var grupo sync.WaitGroup
	for range 8 {
		grupo.Add(1)
		go func() {
			defer grupo.Done()
			for range 200 {
				if opus, ok := s.Decifrar(append(make([]byte, 12), 1, 2)); ok {
					s.Publicar(opus)
				}
				s.FixarOrigem(&net.UDPAddr{IP: net.IPv4zero, Port: 1})
				_ = s.Origem()
				_ = s.Viva()
			}
		}()
	}
	grupo.Add(1)
	go func() {
		defer grupo.Done()
		s.Fechar()
	}()
	grupo.Wait()
}

// O `--dump-pacote` chama funções do lote A1 que ainda dão `panic` nesta
// branch: o log de diagnóstico nunca pode derrubar a ponte.
func TestDumpDePacoteNaoQuebraComOA1Inerte(t *testing.T) {
	s := sessaoDeTeste(t)
	s.LigarDump()
	for range PacotesNoDump + 3 {
		if _, ok := s.Decifrar([]byte{0x90, 0x78, 0, 1, 0, 0, 0, 0, 0, 0, 0, 42, 1, 2, 3, 4}); ok {
			t.Error("decifrou sem cifrador")
		}
	}
	if n := s.dumpados.Load(); n != PacotesNoDump+3 {
		t.Errorf("contou %d pacotes, queria %d", n, PacotesNoDump+3)
	}
}
