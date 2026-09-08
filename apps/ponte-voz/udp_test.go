package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"log/slog"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ── o duplo de SessaoDeVoz ───────────────────────────────────
//
// O lote A2 ainda entrega `panic` em `sessao.go`; o §2 do CONTRATO-F2.md diz
// que A1 se testa com um duplo de dez linhas. É este.

type sessaoFalsa struct {
	ssrc     uint32
	cifrador Cifrador

	mu     sync.Mutex
	origem *net.UDPAddr

	viva       atomic.Bool
	publicados chan []byte
}

var _ SessaoDeVoz = (*sessaoFalsa)(nil)

func novaSessaoFalsa(t *testing.T, ssrc uint32, modo Modo, chave []byte) *sessaoFalsa {
	t.Helper()
	var cifrador Cifrador
	if chave != nil {
		var err error
		cifrador, err = NovoCifrador(modo, chave)
		if err != nil {
			t.Fatalf("NovoCifrador: %v", err)
		}
	}
	s := &sessaoFalsa{ssrc: ssrc, cifrador: cifrador, publicados: make(chan []byte, 64)}
	s.viva.Store(true)
	return s
}

func (s *sessaoFalsa) SSRC() uint32 { return s.ssrc }

func (s *sessaoFalsa) Decifrar(pacote []byte) ([]byte, bool) {
	if s.cifrador == nil {
		return nil, false // antes do SESSION_DESCRIPTION não há chave
	}
	return s.cifrador.Decifrar(pacote)
}

func (s *sessaoFalsa) Publicar(opus []byte) {
	select {
	case s.publicados <- opus:
	default:
	}
}

func (s *sessaoFalsa) FixarOrigem(origem *net.UDPAddr) {
	s.mu.Lock()
	s.origem = origem
	s.mu.Unlock()
}

func (s *sessaoFalsa) Origem() *net.UDPAddr {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.origem
}

func (s *sessaoFalsa) Viva() bool { return s.viva.Load() }

// ── a bancada ────────────────────────────────────────────────

type bancada struct {
	servidor *ServidorUDP
	registro RegistroDeSessoes
	cliente  *net.UDPConn
	destino  *net.UDPAddr
	cancelar context.CancelFunc
}

// montarBancada sobe o `ServidorUDP` numa porta efêmera e abre um socket de
// cliente. Porta 0 é de propósito: o teste não pode disputar a 7883 com nada.
func montarBancada(t *testing.T, cfg ConfigDaPonte) *bancada {
	t.Helper()

	cfg.PortaUdp = 0
	registro := NovoRegistro(nil)
	// Silêncio no teste: o que interessa aqui são os bytes, não o log.
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	servidor, err := NovoServidorUDP(cfg, registro, log)
	if err != nil {
		t.Fatalf("NovoServidorUDP: %v", err)
	}
	ctx, cancelar := context.WithCancel(context.Background())
	pronto := make(chan error, 1)
	go func() { pronto <- servidor.Ouvir(ctx) }()

	destino := &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: servidor.Porta()}
	cliente, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("socket do cliente: %v", err)
	}

	t.Cleanup(func() {
		cancelar()
		_ = servidor.Fechar()
		_ = cliente.Close()
		select {
		case err := <-pronto:
			if err != nil {
				t.Errorf("Ouvir devolveu erro: %v", err)
			}
		case <-time.After(2 * time.Second):
			t.Error("Ouvir não voltou depois de fechar o socket")
		}
	})

	return &bancada{servidor: servidor, registro: registro, cliente: cliente, destino: destino, cancelar: cancelar}
}

func (b *bancada) enviar(t *testing.T, pacote []byte) {
	t.Helper()
	if _, err := b.cliente.WriteToUDP(pacote, b.destino); err != nil {
		t.Fatalf("envio: %v", err)
	}
}

func (b *bancada) receber(t *testing.T, espera time.Duration) ([]byte, bool) {
	t.Helper()
	_ = b.cliente.SetReadDeadline(time.Now().Add(espera))
	buffer := make([]byte, TamanhoMaximoDoPacote)
	n, err := b.cliente.Read(buffer)
	if err != nil {
		return nil, false
	}
	return buffer[:n], true
}

// ── degrau 2: a descoberta de IP ─────────────────────────────

// TestDegrau2DescobertaDeIp é o degrau 2 do §6 do CONTRATO-F2.md, feito em Go
// porque o `main.go` (lote A2) ainda entrega `panic`: sobe só o `ServidorUDP`
// numa porta efêmera, com um duplo de `SessaoDeVoz`, e confere que o pacote de
// 74 bytes volta com o endereço e a porta **que o servidor viu**.
func TestDegrau2DescobertaDeIp(t *testing.T) {
	b := montarBancada(t, ConfigDaPonte{IpPublico: "143.95.161.17"})

	sessao := novaSessaoFalsa(t, b.registro.ProximoSSRC(), ModoAesGcm, nil)
	b.registro.Registrar(sessao)

	b.enviar(t, pedidoDeDescoberta(sessao.SSRC()))

	resposta, ok := b.receber(t, 2*time.Second)
	if !ok {
		t.Fatal("a descoberta de IP não foi respondida")
	}
	if len(resposta) != TamanhoDaDescoberta {
		t.Fatalf("resposta com %d bytes, esperados %d", len(resposta), TamanhoDaDescoberta)
	}
	if tipo := binary.BigEndian.Uint16(resposta[0:2]); tipo != DescobertaResposta {
		t.Fatalf("tipo = %#04x, esperado %#04x", tipo, DescobertaResposta)
	}
	if ssrc := binary.BigEndian.Uint32(resposta[4:8]); ssrc != sessao.SSRC() {
		t.Fatalf("ssrc = %d, esperado %d", ssrc, sessao.SSRC())
	}

	local := b.cliente.LocalAddr().(*net.UDPAddr)
	fim := bytes.IndexByte(resposta[8:72], 0)
	endereco := string(resposta[8 : 8+fim])
	porta := binary.BigEndian.Uint16(resposta[72:74])
	if endereco != "127.0.0.1" {
		t.Fatalf("endereço = %q, esperado 127.0.0.1 (o que o ReadFromUDP viu)", endereco)
	}
	if int(porta) != local.Port {
		t.Fatalf("porta = %d, esperada %d (a porta de origem do cliente)", porta, local.Port)
	}

	// E a origem ficou amarrada ao SSRC.
	if origem := sessao.Origem(); origem == nil || origem.Port != local.Port {
		t.Fatalf("FixarOrigem não amarrou o endereço: %v", origem)
	}
}

// TestDescobertaDeSsrcDesconhecido: nada volta. Uma porta pública que responde
// a qualquer SSRC é um refletor de graça.
func TestDescobertaDeSsrcDesconhecido(t *testing.T) {
	b := montarBancada(t, ConfigDaPonte{})
	b.enviar(t, pedidoDeDescoberta(4242))
	if _, ok := b.receber(t, 300*time.Millisecond); ok {
		t.Fatal("respondemos a descoberta de um SSRC que não existe")
	}
}

// ── o caminho quente: RTP → Decifrar → fila → Publicar ───────

func TestServidorUDPEncaminhaRTP(t *testing.T) {
	for _, modo := range []Modo{ModoAesGcm, ModoXChaCha} {
		t.Run(string(modo), func(t *testing.T) {
			b := montarBancada(t, ConfigDaPonte{})

			chave, err := SortearChave()
			if err != nil {
				t.Fatalf("SortearChave: %v", err)
			}
			sessao := novaSessaoFalsa(t, b.registro.ProximoSSRC(), modo, chave)
			b.registro.Registrar(sessao)

			// 1. Descoberta, para amarrar a origem.
			b.enviar(t, pedidoDeDescoberta(sessao.SSRC()))
			if _, ok := b.receber(t, 2*time.Second); !ok {
				t.Fatal("sem resposta de descoberta")
			}

			// 2. RTP com o SSRC da sessão.
			cifrador, err := NovoCifrador(modo, chave)
			if err != nil {
				t.Fatalf("NovoCifrador: %v", err)
			}
			quadro := []byte{0xfc, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07}
			cabecalho := make([]byte, 12)
			cabecalho[0], cabecalho[1] = 0x80, 0x78
			binary.BigEndian.PutUint16(cabecalho[2:4], 1)
			binary.BigEndian.PutUint32(cabecalho[4:8], 960)
			binary.BigEndian.PutUint32(cabecalho[8:12], sessao.SSRC())
			b.enviar(t, cifrador.Cifrar(cabecalho, quadro, 1))

			select {
			case opus := <-sessao.publicados:
				if !bytes.Equal(opus, quadro) {
					t.Fatalf("quadro publicado = %x, esperado %x", opus, quadro)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("o quadro não chegou ao Publicar")
			}
		})
	}
}

// TestServidorUDPDescartaEmSilencio junta os três descartes do §D5.4: SSRC
// desconhecido, SSRC certo de outro endereço, e RTP antes da descoberta.
func TestServidorUDPDescartaEmSilencio(t *testing.T) {
	b := montarBancada(t, ConfigDaPonte{})

	chave, _ := SortearChave()
	sessao := novaSessaoFalsa(t, b.registro.ProximoSSRC(), ModoAesGcm, chave)
	b.registro.Registrar(sessao)
	cifrador, _ := NovoCifrador(ModoAesGcm, chave)

	rtpDe := func(ssrc uint32) []byte {
		cabecalho := make([]byte, 12)
		cabecalho[0], cabecalho[1] = 0x80, 0x78
		binary.BigEndian.PutUint32(cabecalho[8:12], ssrc)
		return cifrador.Cifrar(cabecalho, []byte{0xfc, 0x00}, 9)
	}

	// (a) RTP antes da descoberta: a origem ainda não está amarrada.
	b.enviar(t, rtpDe(sessao.SSRC()))

	// (b) SSRC que não existe.
	b.enviar(t, rtpDe(9999))

	// (c) lixo puro.
	b.enviar(t, []byte{0x00, 0x01, 0x02})

	select {
	case opus := <-sessao.publicados:
		t.Fatalf("publicamos um pacote que deveria ter sido descartado: %x", opus)
	case <-time.After(300 * time.Millisecond):
	}

	// (d) agora a descoberta amarra **outro** socket, e o primeiro deixa de
	//     poder falar por esta sessão.
	outro, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("segundo socket: %v", err)
	}
	defer outro.Close()
	if _, err := outro.WriteToUDP(pedidoDeDescoberta(sessao.SSRC()), b.destino); err != nil {
		t.Fatalf("envio do segundo socket: %v", err)
	}
	_ = outro.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := outro.Read(make([]byte, TamanhoMaximoDoPacote)); err != nil {
		t.Fatalf("o segundo socket não recebeu a descoberta: %v", err)
	}

	b.enviar(t, rtpDe(sessao.SSRC())) // do socket errado, agora
	select {
	case opus := <-sessao.publicados:
		t.Fatalf("RTP de outro endereço foi publicado: %x", opus)
	case <-time.After(300 * time.Millisecond):
	}
}

// TestDescobertaNaoSequestraSessao: com a origem já amarrada, um segundo
// pedido de outro endereço não move a sessão nem recebe resposta.
func TestDescobertaNaoSequestraSessao(t *testing.T) {
	b := montarBancada(t, ConfigDaPonte{})
	sessao := novaSessaoFalsa(t, b.registro.ProximoSSRC(), ModoAesGcm, nil)
	b.registro.Registrar(sessao)

	b.enviar(t, pedidoDeDescoberta(sessao.SSRC()))
	if _, ok := b.receber(t, 2*time.Second); !ok {
		t.Fatal("sem resposta de descoberta")
	}
	amarrada := sessao.Origem()

	sequestrador, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("socket do sequestrador: %v", err)
	}
	defer sequestrador.Close()
	if _, err := sequestrador.WriteToUDP(pedidoDeDescoberta(sessao.SSRC()), b.destino); err != nil {
		t.Fatalf("envio: %v", err)
	}
	_ = sequestrador.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, err := sequestrador.Read(make([]byte, TamanhoMaximoDoPacote)); err == nil {
		t.Fatal("respondemos ao sequestrador")
	}
	if agora := sessao.Origem(); agora.Port != amarrada.Port {
		t.Fatalf("a origem foi movida de %v para %v", amarrada, agora)
	}
}

func TestServidorUDPPortaEFecharSaoIdempotentes(t *testing.T) {
	registro := NovoRegistro(nil)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	servidor, err := NovoServidorUDP(ConfigDaPonte{PortaUdp: 0}, registro, log)
	if err != nil {
		t.Fatalf("NovoServidorUDP: %v", err)
	}
	if servidor.Porta() <= 0 {
		t.Fatalf("Porta() = %d", servidor.Porta())
	}
	if err := servidor.Fechar(); err != nil {
		t.Fatalf("primeiro Fechar: %v", err)
	}
	if err := servidor.Fechar(); err != nil {
		t.Fatalf("segundo Fechar devolveu erro: %v", err)
	}
}

// ── a fila de jitter ─────────────────────────────────────────

// TestFilaDescartaOMaisAntigo é o §12 F2, "Jitter": cheia, a fila joga fora o
// quadro **mais velho**, porque atraso acumulado é pior que um buraco.
func TestFilaDescartaOMaisAntigo(t *testing.T) {
	pegou := make(chan struct{})
	solta := make(chan struct{})
	recebidos := make(chan byte, 64)
	var uma sync.Once

	fila := NovaFila(func(opus []byte) {
		uma.Do(func() {
			close(pegou)
			<-solta // segura o primeiro quadro para a fila encher atrás dele
		})
		recebidos <- opus[0]
	})
	defer fila.Fechar()

	// Quadro 0: a goroutine de drenagem o pega e trava dentro do `publicar`.
	fila.Enfileirar([]byte{0})
	<-pegou

	// Quadros 1..TetoDaFila: cabem todos.
	for i := 1; i <= TetoDaFila; i++ {
		if !fila.Enfileirar([]byte{byte(i)}) {
			t.Fatalf("o quadro %d não coube numa fila de teto %d", i, TetoDaFila)
		}
	}

	// O seguinte não cabe: o mais antigo (1) sai.
	if fila.Enfileirar([]byte{byte(TetoDaFila + 1)}) {
		t.Fatal("a fila aceitou um quadro além do teto sem descartar")
	}
	if fila.Descartados() != 1 {
		t.Fatalf("Descartados() = %d, esperado 1", fila.Descartados())
	}

	close(solta)

	esperados := []byte{0}
	for i := 2; i <= TetoDaFila+1; i++ {
		esperados = append(esperados, byte(i))
	}
	for _, esperado := range esperados {
		select {
		case veio := <-recebidos:
			if veio != esperado {
				t.Fatalf("saiu o quadro %d, esperado %d (o descartado tinha de ser o 1)", veio, esperado)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("o quadro %d nunca saiu da fila", esperado)
		}
	}
}

func TestFilaPublicaEmOrdem(t *testing.T) {
	recebidos := make(chan byte, TetoDaFila)
	fila := NovaFila(func(opus []byte) { recebidos <- opus[0] })
	defer fila.Fechar()

	for i := 0; i < TetoDaFila; i++ {
		if !fila.Enfileirar([]byte{byte(i)}) {
			t.Fatalf("descarte inesperado no quadro %d", i)
		}
		select {
		case veio := <-recebidos:
			if veio != byte(i) {
				t.Fatalf("saiu %d, esperado %d", veio, i)
			}
		case <-time.After(time.Second):
			t.Fatalf("o quadro %d não foi publicado", i)
		}
	}
	if fila.Publicados() != uint64(TetoDaFila) {
		t.Fatalf("Publicados() = %d, esperado %d", fila.Publicados(), TetoDaFila)
	}
}

func TestFilaFecharEhIdempotente(t *testing.T) {
	fila := NovaFila(func([]byte) {})
	fila.Fechar()
	fila.Fechar() // um segundo `close` do canal entraria em pânico
}

// ── o limitador por origem ───────────────────────────────────

func TestLimitadorPorOrigem(t *testing.T) {
	limitador := novoLimitadorDeOrigem(10, TetoDeOrigens)
	relogio := time.Now()
	limitador.agora = func() time.Time { return relogio }

	origem := &net.UDPAddr{IP: net.ParseIP("203.0.113.7"), Port: 1234}
	for i := 0; i < 10; i++ {
		if !limitador.permitir(origem) {
			t.Fatalf("o pacote %d foi barrado dentro do limite", i)
		}
	}
	if limitador.permitir(origem) {
		t.Fatal("o pacote 11 passou com o balde vazio")
	}

	// Mudar de porta não renova o crédito: a chave é o IP.
	if limitador.permitir(&net.UDPAddr{IP: net.ParseIP("203.0.113.7"), Port: 4321}) {
		t.Fatal("trocar a porta de origem renovou o crédito")
	}
	// Outro IP tem o balde dele.
	if !limitador.permitir(&net.UDPAddr{IP: net.ParseIP("198.51.100.9"), Port: 1234}) {
		t.Fatal("outro IP foi barrado pelo balde do primeiro")
	}

	// Um segundo depois, o balde está cheio de novo.
	relogio = relogio.Add(time.Second)
	for i := 0; i < 10; i++ {
		if !limitador.permitir(origem) {
			t.Fatalf("o pacote %d foi barrado depois da reposição", i)
		}
	}

	// E a varredura joga fora os baldes parados.
	relogio = relogio.Add(2 * OciosidadeDaOrigem)
	limitador.varrer()
	if len(limitador.baldes) != 0 {
		t.Fatalf("sobraram %d baldes depois da varredura", len(limitador.baldes))
	}
	if limitador.permitir(nil) {
		t.Fatal("origem nil foi permitida")
	}
}

func TestLimitadorTemTeto(t *testing.T) {
	limitador := novoLimitadorDeOrigem(10, 4)
	relogio := time.Now()
	limitador.agora = func() time.Time { return relogio }

	for i := 0; i < 4; i++ {
		origem := &net.UDPAddr{IP: net.IPv4(198, 51, 100, byte(i)), Port: 1}
		if !limitador.permitir(origem) {
			t.Fatalf("a origem %d foi barrada antes do teto", i)
		}
	}
	if limitador.permitir(&net.UDPAddr{IP: net.IPv4(198, 51, 100, 200), Port: 1}) {
		t.Fatal("o mapa passou do teto de origens")
	}
	if len(limitador.baldes) > 4 {
		t.Fatalf("o mapa cresceu além do teto: %d", len(limitador.baldes))
	}
}

// ── degrau 2 com `nc -u` de verdade ──────────────────────────

// TestDegrau2ComNc não roda no `go test ./...`: ele **segura a porta 7883** por
// alguns segundos para que um `nc -u` de fora mande os 74 bytes e veja a
// resposta. É a versão do degrau 2 com um cliente que não é código nosso.
//
//	go test -run TestDegrau2ComNc -v &            # com PONTE_VOZ_TESTE_NC=1
//	printf '\x00\x01\x00\x46\x00\x00\x00\x01'; head -c 66 /dev/zero | nc -u -w2 127.0.0.1 7883 | xxd
func TestDegrau2ComNc(t *testing.T) {
	if os.Getenv("PONTE_VOZ_TESTE_NC") == "" {
		t.Skip("degrau 2 manual: rode com PONTE_VOZ_TESTE_NC=1 e mande o pacote com nc -u")
	}

	registro := NovoRegistro(nil)
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	servidor, err := NovoServidorUDP(ConfigDaPonte{PortaUdp: 7883, IpPublico: "143.95.161.17"}, registro, log)
	if err != nil {
		t.Fatalf("NovoServidorUDP: %v", err)
	}
	defer servidor.Fechar()

	sessao := novaSessaoFalsa(t, registro.ProximoSSRC(), ModoAesGcm, nil)
	registro.Registrar(sessao)
	t.Logf("ponte-voz de teste em :%d, SSRC %d — mande o pacote de 74 bytes", servidor.Porta(), sessao.SSRC())

	ctx, cancelar := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelar()
	if err := servidor.Ouvir(ctx); err != nil {
		t.Fatalf("Ouvir: %v", err)
	}
	if sessao.Origem() == nil {
		t.Fatal("ninguém mandou a descoberta de IP durante a janela")
	}
	t.Logf("origem amarrada: %v", sessao.Origem())
}
