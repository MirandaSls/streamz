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

	// O logger que chega já traz `sala`, `bot` e `ssrc` da sessão.
	registro := log.With("identidade", rei.Identidade, "lkUrl", rei.UrlLk)
	sala := lksdk.NewRoom(&lksdk.RoomCallback{
		OnDisconnected: func() {
			registro.Warn("o LiveKit desconectou a ponte: o áudio deste bot parou de sair no navegador")
		},
		ParticipantCallback: lksdk.ParticipantCallback{
			// Chega para todo participante da sala; só o nosso interessa — é
			// nele que a API grava o pedido de silêncio (ver `AtributoDeSilencio`).
			OnAttributesChanged: func(mudou map[string]string, p lksdk.Participant) {
				local, ok := p.(*lksdk.LocalParticipant)
				if !ok {
					return
				}
				if _, tocou := mudou[AtributoDeSilencio]; !tocou {
					return
				}
				sincronizarSilencio(local, registro)
			},
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

	// O atributo pode ter chegado entre a entrada na sala e a publicação (o
	// moderador silenciou o bot nesse meio-tempo): o callback rodou sem faixa
	// nenhuma para calar, e não roda de novo enquanto o valor não mudar.
	sincronizarSilencio(sala.LocalParticipant, registro)

	return &Publicador{sala: sala, faixa: faixa, log: registro}, nil
}

// AtributoDeSilencio é o atributo do participante da ponte em que a API grava
// o "silenciar no servidor" de um moderador: "1" cala, "0" devolve o som.
// O nome é contrato com `ATRIBUTO_DE_SILENCIO_DA_PONTE`
// (`apps/api/src/modules/voice/voice.service.ts`) e não muda de um lado só.
//
// Por que existe: a API cala a faixa com `MutePublishedTrack`, mas **devolver**
// o som pela mesma via exige `room.enable_remote_unmute` na config do LiveKit —
// sem ela o servidor recusa, e o bot desmutado pelo moderador seguia mudo até
// sair da call. Mutar e desmutar a **própria** faixa o LiveKit sempre aceita;
// então a API só diz o que quer e quem obedece é a ponte.
const AtributoDeSilencio = "streamz.silenciado"

// faixaMutavel é a fatia de `*lksdk.LocalTrackPublication` que o silêncio usa.
// Existe para o teste não precisar subir um LiveKit.
type faixaMutavel interface {
	Source() livekit.TrackSource
	IsMuted() bool
	SetMuted(muted bool)
}

var _ faixaMutavel = (*lksdk.LocalTrackPublication)(nil)

// silencioPedido lê o pedido da API. `ok` é falso quando ela não disse nada
// (atributo ausente ou apagado): aí a ponte não mexe — quem calou pela API,
// sem atributo, é quem desfaz.
func silencioPedido(atributos map[string]string) (silenciar bool, ok bool) {
	switch atributos[AtributoDeSilencio] {
	case "1":
		return true, true
	case "0":
		return false, true
	}
	return false, false
}

// aplicarSilencio põe as faixas de microfone (a música sai como MICROPHONE,
// ver `Conectar`) no estado pedido e devolve quantas mudaram. Faixa que já
// está no estado certo não é tocada: `SetMuted` repetido manda sinal à toa.
func aplicarSilencio(faixas []faixaMutavel, silenciar bool) int {
	mudaram := 0
	for _, f := range faixas {
		if f.Source() != livekit.TrackSource_MICROPHONE || f.IsMuted() == silenciar {
			continue
		}
		f.SetMuted(silenciar)
		mudaram++
	}
	return mudaram
}

// sincronizarSilencio aplica o que o atributo pede às faixas publicadas por nós.
// `SetMuted` avisa o servidor (`SendMuteTrack`), e é esse aviso — e não o
// `MutePublishedTrack` da API — que faz o SFU voltar a repassar o áudio.
func sincronizarSilencio(local *lksdk.LocalParticipant, log *slog.Logger) {
	silenciar, ok := silencioPedido(local.Attributes())
	if !ok {
		return
	}
	var faixas []faixaMutavel
	for _, pub := range local.TrackPublications() {
		if f, ok := pub.(*lksdk.LocalTrackPublication); ok {
			faixas = append(faixas, f)
		}
	}
	if aplicarSilencio(faixas, silenciar) == 0 {
		return
	}
	if silenciar {
		log.Info("moderador silenciou o bot no servidor: faixa calada")
	} else {
		log.Info("moderador devolveu o som do bot: faixa de volta ao ar")
	}
}

// Escrever entrega um quadro Opus de 20 ms (`DuracaoDoQuadro`).
func (p *Publicador) Escrever(opus []byte) error {
	// Sem a extensão RTP ssrc-audio-level (RFC 6464) o LiveKit nunca marca o
	// participante como ActiveSpeaker: ele não decodifica Opus, só lê esse
	// nível do cabeçalho. O SDK só grava a extensão se AudioLevel != nil.
	nivel := nivelDeAudio(opus)
	return p.faixa.WriteSample(media.Sample{Data: opus, Duration: DuracaoDoQuadro},
		&lksdk.SampleWriteOptions{AudioLevel: &nivel})
}

// nivelDeAudio devolve o nível RFC 6464 (-dBov, 0-127; 127 = silêncio) sem
// decodificar o Opus, para o repasse continuar bit a bit. Quadro de até 3
// bytes é o silêncio (F8 FF FE) que o Lavalink manda entre faixas; qualquer
// outro conta como áudio, com nível fixo alto o bastante para acender o
// círculo de "falando".
func nivelDeAudio(opus []byte) uint8 {
	if len(opus) <= 3 {
		return 127
	}
	return 20
}

// Desconectar sai da sala. Idempotente.
func (p *Publicador) Desconectar() {
	p.desligado.Do(func() {
		p.sala.Disconnect()
		p.log.Info("fora da sala do LiveKit")
	})
}
