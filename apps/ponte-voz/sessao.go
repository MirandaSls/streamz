package main

import (
	"log/slog"
	"net"
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

// SessaoWs é a sessão de verdade.
type SessaoWs struct {
	// A2 preenche.
}

var _ SessaoDeVoz = (*SessaoWs)(nil)

// NovaSessao nasce no `IDENTIFY`, já com o SSRC que vai no `READY`. Ela ainda
// **não** tem cifrador (isso é o `SELECT_PROTOCOL`) nem faixa no LiveKit (isso
// é o primeiro quadro, ou o `SESSION_DESCRIPTION`).
func NovaSessao(rei Reivindicacao, ssrc uint32, log *slog.Logger) *SessaoWs {
	panic("F2 lote A2: NovaSessao não implementado")
}

func (s *SessaoWs) SSRC() uint32 { panic("F2 lote A2: SessaoWs.SSRC não implementado") }

// Decifrar delega ao `Cifrador` que o `SELECT_PROTOCOL` definiu. Sem chave
// ainda (o cliente mandou RTP antes do `SESSION_DESCRIPTION`, o que acontece):
// `false`, sem log por pacote.
func (s *SessaoWs) Decifrar(pacote []byte) ([]byte, bool) {
	panic("F2 lote A2: SessaoWs.Decifrar não implementado")
}

// Publicar entrega o quadro Opus ao LiveKit (`livekit.go`). Sessão fechada
// descarta em silêncio.
func (s *SessaoWs) Publicar(opus []byte) {
	panic("F2 lote A2: SessaoWs.Publicar não implementado")
}

func (s *SessaoWs) FixarOrigem(origem *net.UDPAddr) {
	panic("F2 lote A2: SessaoWs.FixarOrigem não implementado")
}

func (s *SessaoWs) Origem() *net.UDPAddr {
	panic("F2 lote A2: SessaoWs.Origem não implementado")
}

func (s *SessaoWs) Viva() bool { panic("F2 lote A2: SessaoWs.Viva não implementado") }

// DefinirCifrador é chamado no `SELECT_PROTOCOL`, com o modo que o cliente
// escolheu e a chave que sorteamos.
func (s *SessaoWs) DefinirCifrador(c Cifrador) {
	panic("F2 lote A2: SessaoWs.DefinirCifrador não implementado")
}

// Fechar sai da sala do LiveKit, encerra a fila e marca a sessão como morta.
// Idempotente — o WS pode cair e o UDP ainda ter um pacote em voo.
func (s *SessaoWs) Fechar() {
	panic("F2 lote A2: SessaoWs.Fechar não implementado")
}
