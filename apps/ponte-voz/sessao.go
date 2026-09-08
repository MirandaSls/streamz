package main

import (
	"encoding/hex"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
)

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// Uma sessão de voz: um WebSocket, um SSRC, uma `secret_key`, um endereço de
// origem e uma faixa publicada no LiveKit. É a implementação de `SessaoDeVoz`
// (`contrato.go`) que o laço de UDP do lote A1 enxerga.

// Reivindicacao é o que o JWT do `VOICE_SERVER_UPDATE` carrega — o que a API
// assinou e a ponte confere. Ver "O JWT" no CONTRATO-F2.md; os nomes dos
// campos JSON **são o contrato com o lote B** e não mudam de um lado só.
type Reivindicacao struct {
	Emissor    string `json:"iss"` // "streamz-api"
	Audiencia  string `json:"aud"` // "ponte-voz"
	Bot        string `json:"sub"` // snowflake do bot = `IDENTIFY.user_id`
	Servidor   string `json:"gid"` // snowflake da guild = `IDENTIFY.server_id`
	Sessao     string `json:"sid"` // session_id do gateway compat = `IDENTIFY.session_id`
	Sala       string `json:"sala"`
	Canal      string `json:"canal"` // snowflake do canal de voz
	Nome       string `json:"nome"`  // nome do participante no LiveKit
	TokenLk    string `json:"lk"`    // JWT do LiveKit, já assinado pela API
	UrlLk      string `json:"lkUrl"`
	Expiracao  int64  `json:"exp"`
	EmitidoEm  int64  `json:"iat"`
	Identidade string `json:"ident"` // "bot:<snowflake>" — a identidade no LiveKit
}

// publicadorDeAudio é a fatia do `Publicador` (`livekit.go`) que a sessão usa.
//
// Existe por um motivo só: o teste do aperto de mão não pode subir um LiveKit.
// A ponte de verdade sempre recebe um `*Publicador`.
type publicadorDeAudio interface {
	Escrever(opus []byte) error
	Desconectar()
}

// PacotesNoDump é quantos pacotes de cada sessão saem em hexdump quando a ponte
// roda com `--dump-pacote`. Dez é o bastante para ver o cabeçalho, a extensão e
// o nonce — é a rede de segurança do risco nº 1 da fase (§12 F2).
const PacotesNoDump = 10

// SessaoWs é a sessão de verdade.
type SessaoWs struct {
	rei  Reivindicacao
	ssrc uint32
	log  *slog.Logger
	dump bool

	mu         sync.RWMutex
	cifrador   Cifrador
	origem     *net.UDPAddr
	publicador publicadorDeAudio

	viva     atomic.Bool
	umaVez   sync.Once
	dumpados atomic.Int64

	// Contadores: o log de uma ponte muda é o pior lugar para se estar quando o
	// som não sai. Nenhum deles loga por pacote.
	quadros           atomic.Uint64
	quadrosSemFaixa   atomic.Uint64
	avisouSemFaixa    atomic.Bool
	avisouPrimeiro    atomic.Bool
	avisouErroEscrita atomic.Bool
}

var _ SessaoDeVoz = (*SessaoWs)(nil)

// NovaSessao nasce no `IDENTIFY`, já com o SSRC que vai no `READY`. Ela ainda
// **não** tem cifrador (isso é o `SELECT_PROTOCOL`) nem faixa no LiveKit (isso
// é o primeiro quadro, ou o `SESSION_DESCRIPTION`).
func NovaSessao(rei Reivindicacao, ssrc uint32, log *slog.Logger) *SessaoWs {
	s := &SessaoWs{
		rei:  rei,
		ssrc: ssrc,
		log:  log.With("ssrc", ssrc, "bot", rei.Bot, "canal", rei.Canal, "sala", rei.Sala),
	}
	s.viva.Store(true)
	return s
}

func (s *SessaoWs) SSRC() uint32 { return s.ssrc }

// Reivindicacao é o que o JWT trouxe. O gateway precisa dela para o RESUME e
// para avisar a API quando a sessão cai.
func (s *SessaoWs) Reivindicacao() Reivindicacao { return s.rei }

// LigarDump liga o hexdump dos primeiros pacotes desta sessão (`--dump-pacote`).
func (s *SessaoWs) LigarDump() { s.dump = true }

// Decifrar delega ao `Cifrador` que o `SELECT_PROTOCOL` definiu. Sem chave
// ainda (o cliente mandou RTP antes do `SESSION_DESCRIPTION`, o que acontece):
// `false`, sem log por pacote.
func (s *SessaoWs) Decifrar(pacote []byte) ([]byte, bool) {
	s.mu.RLock()
	cifrador := s.cifrador
	s.mu.RUnlock()

	if cifrador == nil {
		if s.dump {
			s.dumpDePacote(pacote, false, "sem chave ainda")
		}
		return nil, false
	}
	opus, ok := cifrador.Decifrar(pacote)
	if s.dump {
		s.dumpDePacote(pacote, ok, "")
	}
	return opus, ok
}

// Publicar entrega o quadro Opus ao LiveKit (`livekit.go`). Sessão fechada
// descarta em silêncio.
func (s *SessaoWs) Publicar(opus []byte) {
	if !s.viva.Load() || len(opus) == 0 {
		return
	}
	s.mu.RLock()
	publicador := s.publicador
	s.mu.RUnlock()

	if publicador == nil {
		// Acontece de verdade: o cliente começa a mandar RTP enquanto a entrada
		// na sala do LiveKit ainda está em andamento. Um aviso por sessão.
		n := s.quadrosSemFaixa.Add(1)
		if s.avisouSemFaixa.CompareAndSwap(false, true) {
			s.log.Warn("quadro descartado: ainda não há faixa no LiveKit — se isto não parar, não vai sair som", "quadro", n)
		}
		return
	}
	if err := publicador.Escrever(opus); err != nil {
		if s.avisouErroEscrita.CompareAndSwap(false, true) {
			s.log.Error("WriteSample falhou: o áudio desta sessão não chega ao navegador", "erro", err)
		}
		return
	}
	n := s.quadros.Add(1)
	if s.avisouPrimeiro.CompareAndSwap(false, true) {
		s.log.Info("primeiro quadro Opus publicado no LiveKit", "bytes", len(opus))
	}
	// Um log a cada 1500 quadros são 30 s de música: o bastante para saber que
	// continua tocando, e pouco o bastante para não poluir.
	if n%1500 == 0 {
		s.log.Info("áudio fluindo", "quadros", n, "descartados_sem_faixa", s.quadrosSemFaixa.Load())
	}
}

func (s *SessaoWs) FixarOrigem(origem *net.UDPAddr) {
	s.mu.Lock()
	s.origem = origem
	s.mu.Unlock()
}

func (s *SessaoWs) Origem() *net.UDPAddr {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.origem
}

func (s *SessaoWs) Viva() bool { return s.viva.Load() }

// DefinirCifrador é chamado no `SELECT_PROTOCOL`, com o modo que o cliente
// escolheu e a chave que sorteamos.
func (s *SessaoWs) DefinirCifrador(c Cifrador) {
	s.mu.Lock()
	s.cifrador = c
	s.mu.Unlock()
}

// DefinirPublicador guarda a faixa do LiveKit. Devolve `false` quando a sessão
// já morreu enquanto a entrada na sala acontecia — aí quem chamou desconecta.
func (s *SessaoWs) DefinirPublicador(p publicadorDeAudio) bool {
	if !s.viva.Load() {
		return false
	}
	s.mu.Lock()
	s.publicador = p
	s.mu.Unlock()
	return true
}

// Fechar sai da sala do LiveKit, encerra a fila e marca a sessão como morta.
// Idempotente — o WS pode cair e o UDP ainda ter um pacote em voo.
func (s *SessaoWs) Fechar() {
	s.umaVez.Do(func() {
		s.viva.Store(false)

		s.mu.Lock()
		publicador := s.publicador
		s.publicador = nil
		s.cifrador = nil
		s.mu.Unlock()

		if publicador != nil {
			publicador.Desconectar()
		}
		s.log.Info("sessão de voz encerrada",
			"quadros", s.quadros.Load(),
			"descartados_sem_faixa", s.quadrosSemFaixa.Load())
	})
}

// dumpDePacote é o `--dump-pacote`: os primeiros `PacotesNoDump` pacotes da
// sessão em hexdump, com o tamanho de cabeçalho calculado ao lado. É o que
// transforma "não sai som" em "o AAD tem 16 bytes e devia ter 12".
func (s *SessaoWs) dumpDePacote(pacote []byte, decifrou bool, nota string) {
	n := s.dumpados.Add(1)
	if n > PacotesNoDump {
		return
	}
	cabecalho, valido := tamanhoDeCabecalhoSeguro(pacote)
	cabecalhoExt, validoExt := tamanhoDeCabecalhoComExtensaoSeguro(pacote)
	s.log.Info("dump de pacote",
		"n", n,
		"bytes", len(pacote),
		"cabecalho", cabecalho, "cabecalho_valido", valido,
		"cabecalho_com_extensao", cabecalhoExt, "cabecalho_com_extensao_valido", validoExt,
		"decifrou", decifrou,
		"nota", nota,
		"hexdump", "\n"+hex.Dump(pacote))
}

// As duas funções de `rtp.go` (lote A1) só entram aqui pelo caminho de
// diagnóstico. Um defeito no cálculo do cabeçalho não pode derrubar a ponte
// **pelo log** — seria o pior jeito possível de descobrir o defeito.
func tamanhoDeCabecalhoSeguro(pacote []byte) (n int, ok bool) {
	defer func() {
		if r := recover(); r != nil {
			n, ok = 0, false
		}
	}()
	return TamanhoDoCabecalhoRTP(pacote)
}

func tamanhoDeCabecalhoComExtensaoSeguro(pacote []byte) (n int, ok bool) {
	defer func() {
		if r := recover(); r != nil {
			n, ok = 0, false
		}
	}()
	if !TemExtensao(pacote) {
		return 0, false
	}
	return TamanhoDoCabecalhoComExtensao(pacote)
}
