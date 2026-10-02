package main

import (
	"testing"

	"github.com/livekit/protocol/livekit"
)

func TestNivelDeAudio(t *testing.T) {
	casos := []struct {
		nome string
		in   []byte
		want uint8
	}{
		{"quadro vazio", nil, 127},
		{"silencio opus F8 FF FE", []byte{0xF8, 0xFF, 0xFE}, 127},
		{"quadro de 120 bytes", make([]byte, 120), 20},
	}
	for _, c := range casos {
		if got := nivelDeAudio(c.in); got != c.want {
			t.Errorf("%s: got %d, want %d", c.nome, got, c.want)
		}
	}
}

// faixaFalsa anota quantas vezes o `SetMuted` foi chamado: chamar à toa manda
// um sinal ao servidor a cada mudança de atributo.
type faixaFalsa struct {
	fonte   livekit.TrackSource
	calada  bool
	chamado int
}

func (f *faixaFalsa) Source() livekit.TrackSource { return f.fonte }
func (f *faixaFalsa) IsMuted() bool               { return f.calada }
func (f *faixaFalsa) SetMuted(m bool) {
	f.calada = m
	f.chamado++
}

func TestSilencioPedido(t *testing.T) {
	casos := []struct {
		nome      string
		atributos map[string]string
		silenciar bool
		ok        bool
	}{
		{"\"1\" cala", map[string]string{AtributoDeSilencio: "1"}, true, true},
		{"\"0\" devolve o som", map[string]string{AtributoDeSilencio: "0"}, false, true},
		{"ausente: a API não disse nada", map[string]string{}, false, false},
		{"mapa nulo", nil, false, false},
		{"apagado (o LiveKit manda \"\")", map[string]string{AtributoDeSilencio: ""}, false, false},
		{"valor estranho não vira pedido", map[string]string{AtributoDeSilencio: "sim"}, false, false},
	}
	for _, c := range casos {
		silenciar, ok := silencioPedido(c.atributos)
		if silenciar != c.silenciar || ok != c.ok {
			t.Errorf("%s: got (%v, %v), want (%v, %v)", c.nome, silenciar, ok, c.silenciar, c.ok)
		}
	}
}

func TestAplicarSilencio(t *testing.T) {
	t.Run("cala e devolve a faixa de microfone", func(t *testing.T) {
		musica := &faixaFalsa{fonte: livekit.TrackSource_MICROPHONE}

		if n := aplicarSilencio([]faixaMutavel{musica}, true); n != 1 || !musica.calada {
			t.Fatalf("silenciar: mudaram %d, calada=%v", n, musica.calada)
		}
		// o caso do relato: desmutar no servidor tem de devolver o som
		if n := aplicarSilencio([]faixaMutavel{musica}, false); n != 1 || musica.calada {
			t.Fatalf("desmutar: mudaram %d, calada=%v", n, musica.calada)
		}
	})

	t.Run("faixa já no estado pedido não é tocada", func(t *testing.T) {
		musica := &faixaFalsa{fonte: livekit.TrackSource_MICROPHONE, calada: true}
		if n := aplicarSilencio([]faixaMutavel{musica}, true); n != 0 || musica.chamado != 0 {
			t.Fatalf("mudaram %d, SetMuted chamado %d vezes", n, musica.chamado)
		}
	})

	t.Run("só microfone: outra fonte fica como está", func(t *testing.T) {
		tela := &faixaFalsa{fonte: livekit.TrackSource_SCREEN_SHARE_AUDIO}
		if n := aplicarSilencio([]faixaMutavel{tela}, true); n != 0 || tela.calada {
			t.Fatalf("mudaram %d, calada=%v", n, tela.calada)
		}
	})

	t.Run("sem faixa ainda (atributo antes da publicação)", func(t *testing.T) {
		if n := aplicarSilencio(nil, true); n != 0 {
			t.Fatalf("mudaram %d", n)
		}
	})
}
