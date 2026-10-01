package main

import "testing"

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
