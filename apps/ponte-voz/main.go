package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// A ponte de voz: um binário, dois sockets (WS e UDP), nenhum estado em disco.
//
//	ponte-voz [--dump-pacote]
//
// Ambiente (§D5.5) — todas obrigatórias menos a última:
//
//	PONTE_VOZ_PORTA_WS     8080
//	PONTE_VOZ_PORTA_UDP    7883
//	PONTE_VOZ_IP_PUBLICO   143.95.161.17   (IP, não hostname — §D5.4)
//	PONTE_VOZ_SEGREDO      valida o JWT do VOICE_SERVER_UPDATE
//	API_INTERNA_URL        http://api:3333
//
// `LIVEKIT_URL` e as chaves do LiveKit **não** entram aqui: a URL e o token
// chegam dentro do JWT, assinados pela API (§D5.6).
//
// Nada lê `os.Getenv` fora deste arquivo — o resto recebe `ConfigDaPonte`.

// Os padrões das duas portas. São os do compose (§D5.5): repetir o número no
// `.env` de todo mundo só criaria uma chance a mais de errar.
const (
	PortaWsPadrao  = 8080
	PortaUdpPadrao = 7883
)

// TempoLimiteDoAviso é o teto da chamada em `AvisarQueCaiu`. A API está do
// outro lado da rede do compose; se demorar mais que isto, o log basta.
const TempoLimiteDoAviso = 5 * time.Second

// TempoLimiteDoDesligamento é quanto esperamos os dois laços saírem depois do
// SIGTERM antes de desistir e sair mesmo assim.
const TempoLimiteDoDesligamento = 10 * time.Second

func main() {
	dumpPacote := flag.Bool("dump-pacote", false,
		"grava os primeiros pacotes de cada sessão em hexdump — a rede de segurança do `_rtpsize`")
	flag.Parse()

	nivel := slog.LevelInfo
	if *dumpPacote {
		// Quem ligou o dump está caçando um defeito: o resto do log de
		// diagnóstico vem junto.
		nivel = slog.LevelDebug
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: nivel}))
	// `AvisarQueCaiu` é chamada de dentro do gateway sem carregar um logger
	// junto; o padrão é este.
	slog.SetDefault(log)

	cfg, err := ConfigDoAmbiente(*dumpPacote)
	if err != nil {
		log.Error("configuração inválida", "erro", err)
		os.Exit(1)
	}

	ctx, pararDeOuvirSinais := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer pararDeOuvirSinais()

	if err := rodar(ctx, cfg, log); err != nil {
		log.Error("a ponte parou por erro", "erro", err)
		os.Exit(1)
	}
	log.Info("ponte-voz encerrada")
}

// rodar sobe os dois sockets e só volta quando um deles morre ou o contexto
// acaba (SIGTERM).
func rodar(ctx context.Context, cfg ConfigDaPonte, log *slog.Logger) error {
	registro := NovoRegistro(func(ssrc uint32) {
		log.Error("teto de sessões atingido; sessão recusada", "ssrc", ssrc, "teto", TetoDeSessoes)
	})

	udp, err := NovoServidorUDP(cfg, registro, log)
	if err != nil {
		return fmt.Errorf("abrir a porta de mídia %d/udp: %w", cfg.PortaUdp, err)
	}
	defer func() { _ = udp.Fechar() }()

	ws := NovoServidorDeVoz(cfg, registro, log)

	log.Info("ponte-voz de pé",
		"porta_ws", cfg.PortaWs, "porta_udp", udp.Porta(),
		"ip_publico", cfg.IpPublico, "api_interna", cfg.ApiInternaUrl,
		"dump_pacote", cfg.DumpPacote)

	erros := make(chan error, 2)
	go func() { erros <- envolver("laço de UDP", udp.Ouvir(ctx)) }()
	go func() { erros <- envolver("voice gateway", ws.Servir(ctx)) }()

	var primeiro error
	select {
	case primeiro = <-erros:
	case <-ctx.Done():
		log.Info("sinal recebido; desligando com calma")
	}

	// O segundo laço tem o tempo do desligamento gracioso para sair sozinho.
	espera := time.NewTimer(TempoLimiteDoDesligamento)
	defer espera.Stop()
	select {
	case segundo := <-erros:
		if primeiro == nil {
			primeiro = segundo
		} else if segundo != nil {
			log.Warn("o segundo laço também saiu com erro", "erro", segundo)
		}
	case <-espera.C:
		log.Warn("um dos laços não saiu a tempo; encerrando assim mesmo")
	}
	return primeiro
}

func envolver(qual string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", qual, err)
}

// ConfigDoAmbiente lê as variáveis. **É o único lugar do binário que chama
// `os.Getenv`** — o resto recebe `ConfigDaPonte` por valor, para o teste poder
// montar uma na mão.
func ConfigDoAmbiente(dumpPacote bool) (ConfigDaPonte, error) {
	cfg := ConfigDaPonte{DumpPacote: dumpPacote}

	portaWs, err := inteiroDoAmbiente("PONTE_VOZ_PORTA_WS", PortaWsPadrao)
	if err != nil {
		return cfg, err
	}
	portaUdp, err := inteiroDoAmbiente("PONTE_VOZ_PORTA_UDP", PortaUdpPadrao)
	if err != nil {
		return cfg, err
	}
	cfg.PortaWs = portaWs
	cfg.PortaUdp = portaUdp
	cfg.IpPublico = strings.TrimSpace(os.Getenv("PONTE_VOZ_IP_PUBLICO"))
	cfg.Segredo = os.Getenv("PONTE_VOZ_SEGREDO")
	cfg.ApiInternaUrl = strings.TrimRight(strings.TrimSpace(os.Getenv("API_INTERNA_URL")), "/")

	var faltando []string
	if cfg.IpPublico == "" {
		faltando = append(faltando, "PONTE_VOZ_IP_PUBLICO")
	}
	if cfg.Segredo == "" {
		faltando = append(faltando, "PONTE_VOZ_SEGREDO")
	}
	if len(faltando) > 0 {
		return cfg, fmt.Errorf("faltam variáveis de ambiente: %s", strings.Join(faltando, ", "))
	}
	return cfg, nil
}

func inteiroDoAmbiente(nome string, padrao int) (int, error) {
	bruto := strings.TrimSpace(os.Getenv(nome))
	if bruto == "" {
		return padrao, nil
	}
	valor, err := strconv.Atoi(bruto)
	if err != nil || valor <= 0 || valor > 65535 {
		return 0, fmt.Errorf("%s=%q não é uma porta", nome, bruto)
	}
	return valor, nil
}

// corpoDoAviso é o JSON do §4 do CONTRATO-F2.md.
type corpoDoAviso struct {
	Bot       string `json:"bot"`
	Canal     string `json:"canal"`
	Conectado bool   `json:"conectado"`
}

// clienteDoAviso é reusado entre sessões: abrir um `http.Client` por queda de
// bot vazaria conexões ociosas.
var clienteDoAviso = &http.Client{Timeout: TempoLimiteDoAviso}

// AvisarQueCaiu conta à API que uma sessão morreu, para o bot sumir da coluna
// e do palco do web (§D5.7):
//
//	POST {API_INTERNA_URL}/api/interno/ponte-voz/estado
//	X-Ponte-Segredo: {PONTE_VOZ_SEGREDO}
//	{"bot":"<snowflake>","canal":"<snowflake>","conectado":false}
//
// A carência de 45 s do gateway do web **não** vale para bot: bot que caiu,
// caiu. Falha na chamada é só log — não há o que fazer, e travar o desligamento
// de uma sessão por causa dela seria pior.
func AvisarQueCaiu(cfg ConfigDaPonte, bot string, canal string, conectado bool) {
	log := slog.Default().With("bot", bot, "canal", canal, "conectado", conectado)
	if cfg.ApiInternaUrl == "" {
		log.Warn("API_INTERNA_URL não está definida: a API não vai saber que a sessão caiu, e o bot fica na coluna do web")
		return
	}
	if bot == "" || canal == "" {
		log.Debug("aviso de queda sem bot/canal; nada a contar")
		return
	}

	corpo, err := json.Marshal(corpoDoAviso{Bot: bot, Canal: canal, Conectado: conectado})
	if err != nil {
		log.Error("serializar o aviso de queda falhou", "erro", err)
		return
	}

	ctx, cancelar := context.WithTimeout(context.Background(), TempoLimiteDoAviso)
	defer cancelar()

	url := cfg.ApiInternaUrl + "/api/interno/ponte-voz/estado"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(corpo))
	if err != nil {
		log.Error("montar o aviso de queda falhou", "erro", err, "url", url)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Ponte-Segredo", cfg.Segredo)

	resposta, err := clienteDoAviso.Do(req)
	if err != nil {
		log.Error("avisar a API que a sessão caiu falhou", "erro", err, "url", url)
		return
	}
	defer func() { _ = resposta.Body.Close() }()

	if resposta.StatusCode != http.StatusNoContent && resposta.StatusCode != http.StatusOK {
		log.Error("a API recusou o aviso de queda", "status", resposta.StatusCode, "url", url)
		return
	}
	log.Info("API avisada de que a sessão caiu")
}
