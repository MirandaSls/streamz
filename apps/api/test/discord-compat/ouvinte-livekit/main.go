// Ouvinte de teste: entra numa sala do LiveKit, assina a faixa do participante
// `bot:` e **mede** o que chega — contagem de quadros, buracos e jitter.
//
// É o "segundo participante que grava o áudio recebido" do degrau 4 do §12 do
// documento. Não toca nada em produção: recebe URL e token por ambiente e sai.
//
//	OUVINTE_URL=ws://livekit:7880 \
//	OUVINTE_TOKEN=<jwt> \
//	OUVINTE_SEGUNDOS=180 \
//	go run .
//
// Por que Go e não um cliente de navegador: o `livekit-client` de JS precisa de
// um navegador de verdade para o WebRTC. O SDK de Go entrega os pacotes RTP na
// mão, que é exatamente o que a medição quer — sem headless, sem áudio de
// mentira, sem uma camada a mais entre o defeito e nós.
//
// O que ele imprime, e o que cada número quer dizer:
//
//	quadros      pacotes RTP recebidos na faixa do bot
//	esperados    segundos × 50 (um quadro Opus a cada 20 ms)
//	buracos      saltos na numeração de sequência do RTP (pacote perdido)
//	picotes      intervalos de chegada acima de 120 ms — o que se ouve
//	maior_gap    o pior deles
//
// "Sem picote por 3 minutos" (o critério do degrau 4) é: `picotes` em zero e
// `quadros` perto de `esperados`.
package main

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/pion/webrtc/v4"
)

// LimiteDePicote é o intervalo entre dois quadros a partir do qual um ouvido
// humano percebe. Um quadro de 20 ms com 100 ms de atraso ainda cabe no buffer
// de jitter do cliente; 120 ms já é um tranco.
const LimiteDePicote = 120 * time.Millisecond

type medida struct {
	mu         sync.Mutex
	quadros    int
	buracos    int
	picotes    int
	maiorGap   time.Duration
	primeiro   time.Time
	ultimo     time.Time
	ultimaSeq  uint16
	temSeq     bool
	intervalos []time.Duration
}

func (m *medida) registrar(seq uint16, agora time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.quadros++
	if m.primeiro.IsZero() {
		m.primeiro = agora
	} else {
		gap := agora.Sub(m.ultimo)
		m.intervalos = append(m.intervalos, gap)
		if gap > LimiteDePicote {
			m.picotes++
		}
		if gap > m.maiorGap {
			m.maiorGap = gap
		}
	}
	m.ultimo = agora

	if m.temSeq {
		// Diferença de 1 é o normal; 0 e negativo são reordenação (o UDP faz
		// isso e não é buraco); acima de 1 é pacote que não chegou.
		if d := seq - m.ultimaSeq; d > 1 && d < 1000 {
			m.buracos += int(d - 1)
		}
	}
	m.ultimaSeq = seq
	m.temSeq = true
}

func (m *medida) relatar(segundos int) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	esperados := segundos * 50
	var mediana time.Duration
	if len(m.intervalos) > 0 {
		ordenado := append([]time.Duration(nil), m.intervalos...)
		sort.Slice(ordenado, func(i, j int) bool { return ordenado[i] < ordenado[j] })
		mediana = ordenado[len(ordenado)/2]
	}

	fmt.Printf("quadros=%d esperados=%d (%.1f%%)\n", m.quadros, esperados,
		100*float64(m.quadros)/float64(max(esperados, 1)))
	fmt.Printf("buracos=%d picotes(>%v)=%d maior_gap=%v mediana=%v\n",
		m.buracos, LimiteDePicote, m.picotes, m.maiorGap.Round(time.Millisecond),
		mediana.Round(100*time.Microsecond))

	if m.quadros == 0 {
		fmt.Println("VEREDITO: NADA CHEGOU — nenhum quadro na faixa do bot")
		return 1
	}
	// 90% é folgado de propósito: o começo da medição pega a faixa no meio da
	// negociação, e alguns quadros se perdem antes de o assinante estar pronto.
	if m.quadros < esperados*9/10 {
		fmt.Println("VEREDITO: FALTOU ÁUDIO — menos de 90% dos quadros esperados")
		return 1
	}
	if m.picotes > 0 {
		fmt.Println("VEREDITO: PICOTE — houve intervalo audível entre quadros")
		return 1
	}
	fmt.Println("VEREDITO: OK — som contínuo pelo período medido")
	return 0
}

func main() {
	url := os.Getenv("OUVINTE_URL")
	token := os.Getenv("OUVINTE_TOKEN")
	if url == "" || token == "" {
		fmt.Fprintln(os.Stderr, "faltam OUVINTE_URL e OUVINTE_TOKEN")
		os.Exit(2)
	}
	segundos := 180
	if v := os.Getenv("OUVINTE_SEGUNDOS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			segundos = n
		}
	}

	m := &medida{}
	pronto := make(chan string, 1)

	sala := lksdk.NewRoom(&lksdk.RoomCallback{
		ParticipantCallback: lksdk.ParticipantCallback{
			OnTrackSubscribed: func(faixa *webrtc.TrackRemote, pub *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
				// Só o bot interessa: numa call de verdade há gente falando na
				// mesma sala, e contar o microfone de alguém como música
				// esconderia justamente o defeito que procuramos.
				if !strings.HasPrefix(rp.Identity(), "bot:") {
					return
				}
				select {
				case pronto <- rp.Identity():
				default:
				}
				fmt.Printf("faixa do bot assinada: participante=%s codec=%s\n",
					rp.Identity(), faixa.Codec().MimeType)
				go func() {
					for {
						pacote, _, err := faixa.ReadRTP()
						if err != nil {
							return
						}
						m.registrar(pacote.SequenceNumber, time.Now())
					}
				}()
			},
		},
	})

	if err := sala.JoinWithToken(url, token); err != nil {
		fmt.Fprintf(os.Stderr, "não deu para entrar na sala: %v\n", err)
		os.Exit(1)
	}
	defer sala.Disconnect()
	fmt.Printf("na sala %q como %q; esperando a faixa do bot…\n", sala.Name(), sala.LocalParticipant.Identity())

	select {
	case id := <-pronto:
		fmt.Printf("medindo %d s a partir de agora (%s)\n", segundos, id)
	case <-time.After(60 * time.Second):
		fmt.Println("VEREDITO: NENHUM PARTICIPANTE `bot:` PUBLICOU em 60 s")
		os.Exit(1)
	}

	time.Sleep(time.Duration(segundos) * time.Second)
	os.Exit(m.relatar(segundos))
}
