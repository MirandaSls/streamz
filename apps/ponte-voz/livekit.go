package main

import (
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
)

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

// NomeDaFaixa é o `TrackPublicationOptions.Name`. O web mostra o participante
// pelo nome do bot, não pelo da faixa; isto é para o `list-participants` e para
// o log.
const NomeDaFaixa = "musica"

// Publicador é a conexão com uma sala do LiveKit e a faixa de áudio nela.
type Publicador struct {
	sala      *lksdk.Room
	faixa     *lksdk.LocalTrack
	log       *slog.Logger
	desligado sync.Once
}

// Conectar entra na sala com a identidade `bot:<snowflake>` e publica a faixa.
//
// `url` e `token` saem da `Reivindicacao`. Falha aqui **não** derruba a sessão
// de voz: o bot continua mandando RTP e nós continuamos decifrando; só não sai
// som. O log tem que dizer isso com todas as letras, senão a depuração vira
// adivinhação.
func Conectar(rei Reivindicacao, log *slog.Logger) (*Publicador, error) {
	if rei.UrlLk == "" || rei.TokenLk == "" {
		return nil, errors.New("o JWT não trouxe `lkUrl`/`lk`: sem eles a ponte não tem como entrar na sala")
	}

	faixa, err := lksdk.NewLocalSampleTrack(webrtc.RTPCodecCapability{
		MimeType:  webrtc.MimeTypeOpus,
		ClockRate: 48000,
		Channels:  2,
	})
	if err != nil {
		return nil, fmt.Errorf("criar a faixa Opus: %w", err)
	}

	registro := log.With("sala", rei.Sala, "identidade", rei.Identidade, "lkUrl", rei.UrlLk)
	sala := lksdk.NewRoom(&lksdk.RoomCallback{
		OnDisconnected: func() {
			registro.Warn("o LiveKit desconectou a ponte: o áudio deste bot parou de sair no navegador")
		},
	})

	// `canSubscribe: false` é um dos grants do token (§D5.6): pedir inscrição
	// automática numa sala onde não podemos assinar é erro na cara do servidor.
	if err := sala.JoinWithToken(rei.UrlLk, rei.TokenLk, lksdk.WithAutoSubscribe(false)); err != nil {
		return nil, fmt.Errorf("entrar na sala %q: %w", rei.Sala, err)
	}

	if _, err := sala.LocalParticipant.PublishTrack(faixa, &lksdk.TrackPublicationOptions{
		Name:       NomeDaFaixa,
		Source:     livekit.TrackSource_MICROPHONE,
		DisableDTX: true, // silêncio entre faixas não pode virar buraco
		Stereo:     true, // música é 48 kHz estéreo; sem isto o servidor trata como fala
	}); err != nil {
		sala.Disconnect()
		return nil, fmt.Errorf("publicar a faixa na sala %q: %w", rei.Sala, err)
	}

	registro.Info("na sala do LiveKit, faixa publicada",
		"identidade_efetiva", sala.LocalParticipant.Identity(),
		"nome", sala.LocalParticipant.Name(),
		"faixa", NomeDaFaixa)

	return &Publicador{sala: sala, faixa: faixa, log: registro}, nil
}

// Escrever entrega um quadro Opus de 20 ms (`DuracaoDoQuadro`).
func (p *Publicador) Escrever(opus []byte) error {
	return p.faixa.WriteSample(media.Sample{Data: opus, Duration: DuracaoDoQuadro}, nil)
}

// Desconectar sai da sala. Idempotente.
func (p *Publicador) Desconectar() {
	p.desligado.Do(func() {
		p.sala.Disconnect()
		p.log.Info("fora da sala do LiveKit")
	})
}
