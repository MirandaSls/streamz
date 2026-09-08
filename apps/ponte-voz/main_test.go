package main

import "testing"

func TestConfigDoAmbiente(t *testing.T) {
	t.Run("o mínimo, com as portas no padrão", func(t *testing.T) {
		t.Setenv("PONTE_VOZ_PORTA_WS", "")
		t.Setenv("PONTE_VOZ_PORTA_UDP", "")
		t.Setenv("PONTE_VOZ_IP_PUBLICO", "143.95.161.17")
		t.Setenv("PONTE_VOZ_SEGREDO", "abc")
		t.Setenv("API_INTERNA_URL", "")

		cfg, err := ConfigDoAmbiente(false)
		if err != nil {
			t.Fatalf("erro: %v", err)
		}
		if cfg.PortaWs != PortaWsPadrao || cfg.PortaUdp != PortaUdpPadrao {
			t.Errorf("portas = %d/%d, queria %d/%d", cfg.PortaWs, cfg.PortaUdp, PortaWsPadrao, PortaUdpPadrao)
		}
		if cfg.IpPublico != "143.95.161.17" || cfg.Segredo != "abc" {
			t.Errorf("config = %+v", cfg)
		}
		if cfg.DumpPacote {
			t.Error("DumpPacote ligado sem a bandeira")
		}
	})

	t.Run("tudo definido", func(t *testing.T) {
		t.Setenv("PONTE_VOZ_PORTA_WS", "9090")
		t.Setenv("PONTE_VOZ_PORTA_UDP", "7999")
		t.Setenv("PONTE_VOZ_IP_PUBLICO", " 203.0.113.7 ")
		t.Setenv("PONTE_VOZ_SEGREDO", "segredo")
		t.Setenv("API_INTERNA_URL", "http://api:3333/")

		cfg, err := ConfigDoAmbiente(true)
		if err != nil {
			t.Fatalf("erro: %v", err)
		}
		if cfg.PortaWs != 9090 || cfg.PortaUdp != 7999 {
			t.Errorf("portas = %d/%d", cfg.PortaWs, cfg.PortaUdp)
		}
		if cfg.IpPublico != "203.0.113.7" {
			t.Errorf("IpPublico = %q (o espaço em volta tem de sair)", cfg.IpPublico)
		}
		if cfg.ApiInternaUrl != "http://api:3333" {
			t.Errorf("ApiInternaUrl = %q (a barra do fim tem de sair, ou a rota vira //api/interno)", cfg.ApiInternaUrl)
		}
		if !cfg.DumpPacote {
			t.Error("--dump-pacote não chegou na config")
		}
	})

	t.Run("sem IP público e sem segredo", func(t *testing.T) {
		t.Setenv("PONTE_VOZ_IP_PUBLICO", "")
		t.Setenv("PONTE_VOZ_SEGREDO", "")
		_, err := ConfigDoAmbiente(false)
		if err == nil {
			t.Fatal("a ponte subiu sem IP público nem segredo")
		}
	})

	t.Run("porta que não é número", func(t *testing.T) {
		t.Setenv("PONTE_VOZ_IP_PUBLICO", "203.0.113.7")
		t.Setenv("PONTE_VOZ_SEGREDO", "segredo")
		t.Setenv("PONTE_VOZ_PORTA_WS", "oito mil")
		if _, err := ConfigDoAmbiente(false); err == nil {
			t.Fatal("aceitou uma porta que não é número")
		}
	})
}
