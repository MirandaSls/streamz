package main

import "log/slog"

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// O único caminho em que o quadro Opus que saiu do Lavalink chega ao navegador
// **bit a bit igual**: `NewLocalSampleTrack` com `MimeTypeOpus` + `WriteSample`
// (§D5.1). O payloader de Opus do pion só empacota em RTP — não há decode nem
// encode, nem libopus, nem processamento de fala em cima de música.
//
// As opções que importam (§D5.6), e o porquê de cada uma:
//
//	Name:        "musica"
//	Source:      livekit.TrackSource_MICROPHONE
//	DisableDTX:  true    // silêncio entre faixas não pode virar buraco
//	Stereo:      true    // o Lavalink entrega 48 kHz estéreo; sem isto o
//	                     // servidor trata a faixa como fala e o campo some
//
// **Divergência medida (2026-09-08):** o documento manda `Red: false`, mas o
// `lksdk.TrackPublicationOptions` de `server-sdk-go/v2@v2.18.1` **não tem o
// campo `Red`** — não compila. Tem `Stereo`, que o documento não menciona e
// que importa mais para música. Entrar na sala é
// `room.JoinWithToken(url, token, ...ConnectOption)`.
//
// O token do LiveKit **vem pronto** dentro do JWT do `VOICE_SERVER_UPDATE`
// (campo `lk`): a ponte nunca vê `LIVEKIT_API_KEY`/`SECRET`. Os grants que a
// API põe são `roomJoin`, `canPublish: true`, `canSubscribe: false` (bot de
// música não escuta) e `canPublishData: false`.
//
// Risco medido no §15 nº 2: publicar Opus sem transcodificar está confirmado
// **no papel** e não por nós. Se o payloader recusar, o plano B é decodificar
// e reencodificar — muda este arquivo, não o desenho.

// Publicador é a conexão com uma sala do LiveKit e a faixa de áudio nela.
type Publicador struct {
	// A2 preenche.
}

// Conectar entra na sala com a identidade `bot:<snowflake>` e publica a faixa.
//
// `url` e `token` saem da `Reivindicacao`. Falha aqui **não** derruba a sessão
// de voz: o bot continua mandando RTP e nós continuamos decifrando; só não sai
// som. O log tem que dizer isso com todas as letras, senão a depuração vira
// adivinhação.
func Conectar(rei Reivindicacao, log *slog.Logger) (*Publicador, error) {
	panic("F2 lote A2: Conectar não implementado")
}

// Escrever entrega um quadro Opus de 20 ms (`DuracaoDoQuadro`).
func (p *Publicador) Escrever(opus []byte) error {
	panic("F2 lote A2: Publicador.Escrever não implementado")
}

// Desconectar sai da sala. Idempotente.
func (p *Publicador) Desconectar() {
	panic("F2 lote A2: Publicador.Desconectar não implementado")
}
