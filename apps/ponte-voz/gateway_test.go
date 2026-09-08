package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// Degrau 1 do lote A2 (§6 do CONTRATO-F2.md): o aperto de mão inteiro, o
// heartbeat nos dois formatos, o RESUME e o `ValidarToken`.
//
// O lote A1 (cripto + UDP) ainda dá `panic` nesta branch, então tudo que é dele
// entra por duplo — os sufixos `DoA2` existem para não colidir com os duplos do
// `udp_test.go` do outro lote, que vive no mesmo pacote.

const segredoDeTeste = "segredo-de-teste-da-ponte-voz"

// ── duplos ───────────────────────────────────────────────────

type cifradorDoA2 struct {
	chave []byte
}

func (c *cifradorDoA2) Decifrar(pacote []byte) ([]byte, bool) {
	if len(pacote) <= 12 {
		return nil, false
	}
	return pacote[12:], true
}

func (c *cifradorDoA2) Cifrar(cabecalho, opus []byte, _ uint32) []byte {
	return append(append([]byte{}, cabecalho...), opus...)
}

type publicadorDoA2 struct {
	mu           sync.Mutex
	quadros      [][]byte
	desconectou  bool
	erroEscrever error
}

func (p *publicadorDoA2) Escrever(opus []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.erroEscrever != nil {
		return p.erroEscrever
	}
	p.quadros = append(p.quadros, append([]byte{}, opus...))
	return nil
}

func (p *publicadorDoA2) Desconectar() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.desconectou = true
}

func (p *publicadorDoA2) contar() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.quadros)
}

func (p *publicadorDoA2) saiu() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.desconectou
}

// ── a ponte de teste ─────────────────────────────────────────

type ponteDeTeste struct {
	t           *testing.T
	srv         *ServidorDeVoz
	cfg         ConfigDaPonte
	registro    RegistroDeSessoes
	publicador  *publicadorDoA2
	entradas    chan Reivindicacao
	avisos      chan corpoDoAviso
	erroLiveKit error
	cancelar    context.CancelFunc
	fim         chan error
}

func subirPonte(t *testing.T) *ponteDeTeste {
	t.Helper()
	cfg := ConfigDaPonte{
		PortaWs:   0, // o SO escolhe
		PortaUdp:  7883,
		IpPublico: "203.0.113.7",
		Segredo:   segredoDeTeste,
	}
	p := &ponteDeTeste{
		t:          t,
		cfg:        cfg,
		registro:   NovoRegistro(nil),
		publicador: &publicadorDoA2{},
		entradas:   make(chan Reivindicacao, 4),
		avisos:     make(chan corpoDoAviso, 4),
		fim:        make(chan error, 1),
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	p.srv = NovoServidorDeVoz(cfg, p.registro, log)
	p.srv.dep = dependenciasDaPonte{
		sortearChave: func() ([]byte, error) { return make([]byte, 32), nil },
		novoCifrador: func(modo Modo, chave []byte) (Cifrador, error) {
			if len(chave) != 32 {
				return nil, fmt.Errorf("chave de %d bytes", len(chave))
			}
			return &cifradorDoA2{chave: chave}, nil
		},
		conectar: func(rei Reivindicacao, _ *slog.Logger) (publicadorDeAudio, error) {
			p.entradas <- rei
			if p.erroLiveKit != nil {
				return nil, p.erroLiveKit
			}
			return p.publicador, nil
		},
		avisarQueCai: func(_ ConfigDaPonte, bot, canal string, conectado bool) {
			p.avisos <- corpoDoAviso{Bot: bot, Canal: canal, Conectado: conectado}
		},
	}

	ctx, cancelar := context.WithCancel(context.Background())
	p.cancelar = cancelar
	go func() { p.fim <- p.srv.Servir(ctx) }()

	limite := time.Now().Add(3 * time.Second)
	for p.srv.Porta() == 0 {
		if time.Now().After(limite) {
			t.Fatal("o voice gateway não subiu em 3 s")
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Cleanup(func() {
		cancelar()
		select {
		case err := <-p.fim:
			if err != nil {
				t.Errorf("Servir devolveu erro: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Error("Servir não saiu a tempo")
		}
	})
	return p
}

func (p *ponteDeTeste) url() string {
	return fmt.Sprintf("ws://127.0.0.1:%d/?v=8", p.srv.Porta())
}

func (p *ponteDeTeste) discar() *websocket.Conn {
	p.t.Helper()
	ws, _, err := websocket.DefaultDialer.Dial(p.url(), nil)
	if err != nil {
		p.t.Fatalf("não deu para conectar no voice gateway: %v", err)
	}
	p.t.Cleanup(func() { _ = ws.Close() })
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	return ws
}

// tokenDeTeste assina um JWT no shape exato do §3 do CONTRATO-F2.md.
func tokenDeTeste(t *testing.T, ajustar func(*Reivindicacao)) (string, Reivindicacao) {
	t.Helper()
	rei := Reivindicacao{
		Emissor:    "streamz-api",
		Audiencia:  AudienciaDoToken,
		Bot:        "1420000000000000001",
		Servidor:   "1418000000000000002",
		Sessao:     "9f3c000000000000",
		Sala:       "voice:clx9a000",
		Canal:      "1419000000000000003",
		Nome:       "Bot de música",
		Identidade: "bot:1420000000000000001",
		TokenLk:    "token-do-livekit",
		UrlLk:      "ws://livekit-de-teste:7880",
		EmitidoEm:  time.Now().Unix(),
		Expiracao:  time.Now().Add(15 * time.Minute).Unix(),
	}
	if ajustar != nil {
		ajustar(&rei)
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, rei).SignedString([]byte(segredoDeTeste))
	if err != nil {
		t.Fatalf("assinar o JWT de teste: %v", err)
	}
	return token, rei
}

func enviarOp(t *testing.T, ws *websocket.Conn, op int, d any) {
	t.Helper()
	bruto, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("serializar o op %d: %v", op, err)
	}
	corpo, err := json.Marshal(mensagem{Op: op, D: bruto})
	if err != nil {
		t.Fatalf("serializar o envelope do op %d: %v", op, err)
	}
	if err := ws.WriteMessage(websocket.TextMessage, corpo); err != nil {
		t.Fatalf("escrever o op %d: %v", op, err)
	}
}

func lerOp(t *testing.T, ws *websocket.Conn) mensagem {
	t.Helper()
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, bruto, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("ler do voice gateway: %v", err)
	}
	var m mensagem
	if err := json.Unmarshal(bruto, &m); err != nil {
		t.Fatalf("mensagem que não é JSON: %q", bruto)
	}
	return m
}

func codigoDoFechamento(t *testing.T, ws *websocket.Conn) int {
	t.Helper()
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		_, _, err := ws.ReadMessage()
		if err == nil {
			continue
		}
		var fechamento *websocket.CloseError
		if errors.As(err, &fechamento) {
			return fechamento.Code
		}
		t.Fatalf("esperava um close com código e veio: %v", err)
	}
}

// apertoDeMao vai do HELLO ao SESSION_DESCRIPTION e devolve a conexão pronta.
func (p *ponteDeTeste) apertoDeMao(ws *websocket.Conn, token string, rei Reivindicacao) (dadosDeReady, dadosDeSessionDescription) {
	p.t.Helper()

	hello := lerOp(p.t, ws)
	if hello.Op != opHello {
		p.t.Fatalf("a primeira mensagem tinha de ser o HELLO (op %d), veio op %d", opHello, hello.Op)
	}
	var dHello dadosDeHello
	if err := json.Unmarshal(hello.D, &dHello); err != nil {
		p.t.Fatalf("HELLO malformado: %v", err)
	}
	if dHello.IntervaloDeHeartbeat != IntervaloDeHeartbeatMs {
		p.t.Errorf("heartbeat_interval do HELLO = %d, queria %d", dHello.IntervaloDeHeartbeat, IntervaloDeHeartbeatMs)
	}

	enviarOp(p.t, ws, opIdentify, dadosDeIdentify{
		ServerID:  idDoProtocolo(rei.Servidor),
		UserID:    idDoProtocolo(rei.Bot),
		SessionID: rei.Sessao,
		Token:     token,
	})

	pronto := lerOp(p.t, ws)
	if pronto.Op != opReady {
		p.t.Fatalf("esperava READY (op %d), veio op %d", opReady, pronto.Op)
	}
	var dReady dadosDeReady
	if err := json.Unmarshal(pronto.D, &dReady); err != nil {
		p.t.Fatalf("READY malformado: %v", err)
	}

	enviarOp(p.t, ws, opSelectProtocol, map[string]any{
		"protocol": "udp",
		"data": map[string]any{
			"address": "198.51.100.9",
			"port":    50123,
			"mode":    string(ModoAesGcm),
		},
	})

	descricao := lerOp(p.t, ws)
	if descricao.Op != opSessionDescription {
		p.t.Fatalf("esperava SESSION_DESCRIPTION (op %d), veio op %d", opSessionDescription, descricao.Op)
	}
	var dDescricao dadosDeSessionDescription
	if err := json.Unmarshal(descricao.D, &dDescricao); err != nil {
		p.t.Fatalf("SESSION_DESCRIPTION malformado: %v", err)
	}
	return dReady, dDescricao
}

// ── os testes ────────────────────────────────────────────────

func TestApertoDeMaoCompleto(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	token, rei := tokenDeTeste(t, nil)

	pronto, descricao := p.apertoDeMao(ws, token, rei)

	if pronto.SSRC == 0 {
		t.Error("READY.ssrc não pode ser 0 — o SSRC 0 é o que um buffer zerado tem")
	}
	if pronto.IP != p.cfg.IpPublico {
		t.Errorf("READY.ip = %q, queria o IP público %q (nunca um hostname)", pronto.IP, p.cfg.IpPublico)
	}
	if pronto.Porta != p.cfg.PortaUdp {
		t.Errorf("READY.port = %d, queria %d", pronto.Porta, p.cfg.PortaUdp)
	}
	if len(pronto.Modos) != len(ModosAnunciados) {
		t.Fatalf("READY.modes = %v, queria %v", pronto.Modos, ModosAnunciados)
	}
	for i, modo := range ModosAnunciados {
		if pronto.Modos[i] != modo {
			t.Errorf("READY.modes[%d] = %q, queria %q (a ordem do ModosAnunciados é o contrato)", i, pronto.Modos[i], modo)
		}
	}
	if pronto.IntervaloDeHeartbeat != IntervaloDeHeartbeatMs {
		t.Errorf("READY.heartbeat_interval = %d, queria %d", pronto.IntervaloDeHeartbeat, IntervaloDeHeartbeatMs)
	}

	if descricao.Modo != string(ModoAesGcm) {
		t.Errorf("SESSION_DESCRIPTION.mode = %q, queria %q", descricao.Modo, ModoAesGcm)
	}
	if len(descricao.SecretKey) != 32 {
		t.Errorf("secret_key com %d números, queria 32", len(descricao.SecretKey))
	}
	if descricao.DaveProtocolVersion != 0 {
		t.Errorf("dave_protocol_version = %d, queria 0 (não implementamos DAVE/MLS)", descricao.DaveProtocolVersion)
	}

	// A sessão está no registro e o SSRC é o do READY.
	sessao, achou := p.registro.PorSSRC(pronto.SSRC)
	if !achou {
		t.Fatalf("a sessão do SSRC %d não está no registro", pronto.SSRC)
	}
	if sessao.SSRC() != pronto.SSRC {
		t.Errorf("SSRC da sessão = %d, queria %d", sessao.SSRC(), pronto.SSRC)
	}

	// E entramos na sala do LiveKit com o que o JWT trouxe.
	select {
	case entrou := <-p.entradas:
		if entrou.Sala != rei.Sala || entrou.Identidade != rei.Identidade || entrou.TokenLk != rei.TokenLk {
			t.Errorf("entramos na sala errada: %+v", entrou)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("não entramos na sala do LiveKit depois do SESSION_DESCRIPTION")
	}

	// O caminho quente do lote A1: decifrar → publicar.
	esperarPublicador(t, sessao)
	opus, ok := sessao.Decifrar(append(make([]byte, 12), 0xDE, 0xAD))
	if !ok {
		t.Fatal("Decifrar devia funcionar depois do SESSION_DESCRIPTION")
	}
	sessao.Publicar(opus)
	if n := p.publicador.contar(); n != 1 {
		t.Errorf("quadros publicados = %d, queria 1", n)
	}

	// E, quando o WS cai, a API é avisada (§4) e a sessão morre.
	_ = ws.Close()
	select {
	case aviso := <-p.avisos:
		if aviso.Bot != rei.Bot || aviso.Canal != rei.Canal || aviso.Conectado {
			t.Errorf("aviso de queda errado: %+v", aviso)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a API não foi avisada de que a sessão caiu")
	}
	esperarMorte(t, sessao)
	if !p.publicador.saiu() {
		t.Error("a sessão caiu e o publicador continuou na sala do LiveKit")
	}
}

func esperarPublicador(t *testing.T, sessao SessaoDeVoz) {
	t.Helper()
	s, ok := sessao.(*SessaoWs)
	if !ok {
		t.Fatalf("a sessão não é *SessaoWs: %T", sessao)
	}
	limite := time.Now().Add(3 * time.Second)
	for {
		s.mu.RLock()
		tem := s.publicador != nil
		s.mu.RUnlock()
		if tem {
			return
		}
		if time.Now().After(limite) {
			t.Fatal("a faixa do LiveKit não ficou pronta em 3 s")
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func esperarMorte(t *testing.T, sessao SessaoDeVoz) {
	t.Helper()
	limite := time.Now().Add(3 * time.Second)
	for sessao.Viva() {
		if time.Now().After(limite) {
			t.Fatal("a sessão continuou viva depois de o WS cair")
		}
		time.Sleep(2 * time.Millisecond)
	}
}

func TestHeartbeatNosDoisFormatos(t *testing.T) {
	casos := []struct {
		nome     string
		envia    string
		resposta string
	}{
		// v4: `d` é um int e a lib espera o mesmo int de volta.
		{"v4 com d int", `1731000000000`, `1731000000000`},
		// v8: `{t, seq_ack}` e o ACK leva o `t`.
		{"v8 com t e seq_ack", `{"t":1731000000001,"seq_ack":42}`, `{"t":1731000000001}`},
		// v8 sem `t`: ecoa o que veio, em vez de inventar formato.
		{"v8 sem t", `{"seq_ack":7}`, `{"seq_ack":7}`},
	}
	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			p := subirPonte(t)
			ws := p.discar()
			if hello := lerOp(t, ws); hello.Op != opHello {
				t.Fatalf("esperava HELLO, veio op %d", hello.Op)
			}
			corpo := fmt.Sprintf(`{"op":%d,"d":%s}`, opHeartbeat, caso.envia)
			if err := ws.WriteMessage(websocket.TextMessage, []byte(corpo)); err != nil {
				t.Fatalf("escrever o heartbeat: %v", err)
			}
			ack := lerOp(t, ws)
			if ack.Op != opHeartbeatAck {
				t.Fatalf("esperava HEARTBEAT_ACK (op %d), veio op %d", opHeartbeatAck, ack.Op)
			}
			if strings.TrimSpace(string(ack.D)) != caso.resposta {
				t.Errorf("ACK.d = %s, queria %s (ecoar no mesmo formato que recebeu)", ack.D, caso.resposta)
			}
		})
	}
}

// O heartbeat funciona **antes** do IDENTIFY: é o que o cliente faz assim que
// recebe o HELLO, sem esperar mais nada.
func TestHeartbeatAntesDoIdentifyNaoFecha(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)
	if err := ws.WriteMessage(websocket.TextMessage, []byte(`{"op":3,"d":7}`)); err != nil {
		t.Fatalf("escrever: %v", err)
	}
	if ack := lerOp(t, ws); ack.Op != opHeartbeatAck {
		t.Fatalf("esperava HEARTBEAT_ACK, veio op %d", ack.Op)
	}
}

func TestResume(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	token, rei := tokenDeTeste(t, nil)
	pronto, _ := p.apertoDeMao(ws, token, rei)

	// Sessão viva: o RESUME numa conexão nova a adota.
	outra := p.discar()
	if hello := lerOp(t, outra); hello.Op != opHello {
		t.Fatalf("esperava HELLO na segunda conexão, veio op %d", hello.Op)
	}
	enviarOp(t, outra, opResume, dadosDeResume{
		ServerID:  idDoProtocolo(rei.Servidor),
		SessionID: rei.Sessao,
		Token:     token,
	})
	if retomado := lerOp(t, outra); retomado.Op != opResumed {
		t.Fatalf("esperava RESUMED (op %d), veio op %d", opResumed, retomado.Op)
	}
	if _, achou := p.registro.PorSSRC(pronto.SSRC); !achou {
		t.Error("a sessão sumiu do registro depois do RESUME")
	}

	// A conexão antiga, ao morrer, não pode fechar a sessão que a nova adotou.
	_ = ws.Close()
	time.Sleep(200 * time.Millisecond)
	sessao, achou := p.registro.PorSSRC(pronto.SSRC)
	if !achou || !sessao.Viva() {
		t.Fatal("a conexão antiga fechou a sessão que outra conexão tinha adotado")
	}

	// Sessão que não conhecemos: 4006, e o cliente refaz o IDENTIFY.
	terceira := p.discar()
	lerOp(t, terceira)
	enviarOp(t, terceira, opResume, dadosDeResume{
		ServerID:  idDoProtocolo(rei.Servidor),
		SessionID: "sessao-que-nunca-existiu",
		Token:     token,
	})
	if codigo := codigoDoFechamento(t, terceira); codigo != fecharSessaoInvalida {
		t.Errorf("close code = %d, queria %d", codigo, fecharSessaoInvalida)
	}
}

func TestIdentifyComTokenRuimFecha4004(t *testing.T) {
	casos := []struct {
		nome    string
		token   func(t *testing.T) (string, Reivindicacao)
		mexerNo func(*dadosDeIdentify)
	}{
		{
			nome: "assinatura de outro segredo",
			token: func(t *testing.T) (string, Reivindicacao) {
				_, rei := tokenDeTeste(t, nil)
				token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, rei).SignedString([]byte("outro segredo"))
				if err != nil {
					t.Fatal(err)
				}
				return token, rei
			},
		},
		{
			nome: "aud errado",
			token: func(t *testing.T) (string, Reivindicacao) {
				return tokenDeTeste(t, func(r *Reivindicacao) { r.Audiencia = "gateway" })
			},
		},
		{
			nome: "expirado",
			token: func(t *testing.T) (string, Reivindicacao) {
				return tokenDeTeste(t, func(r *Reivindicacao) { r.Expiracao = time.Now().Add(-time.Minute).Unix() })
			},
		},
		{
			nome:    "user_id do IDENTIFY diferente do sub",
			token:   func(t *testing.T) (string, Reivindicacao) { return tokenDeTeste(t, nil) },
			mexerNo: func(d *dadosDeIdentify) { d.UserID = "1420000000000000999" },
		},
		{
			nome:    "session_id do IDENTIFY diferente do sid",
			token:   func(t *testing.T) (string, Reivindicacao) { return tokenDeTeste(t, nil) },
			mexerNo: func(d *dadosDeIdentify) { d.SessionID = "outra-sessao" },
		},
		{
			nome:    "sem token",
			token:   func(t *testing.T) (string, Reivindicacao) { return tokenDeTeste(t, nil) },
			mexerNo: func(d *dadosDeIdentify) { d.Token = "" },
		},
	}
	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			p := subirPonte(t)
			ws := p.discar()
			lerOp(t, ws)
			token, rei := caso.token(t)
			dados := dadosDeIdentify{
				ServerID:  idDoProtocolo(rei.Servidor),
				UserID:    idDoProtocolo(rei.Bot),
				SessionID: rei.Sessao,
				Token:     token,
			}
			if caso.mexerNo != nil {
				caso.mexerNo(&dados)
			}
			enviarOp(t, ws, opIdentify, dados)
			if codigo := codigoDoFechamento(t, ws); codigo != fecharAutenticacaoFalhou {
				t.Errorf("close code = %d, queria %d", codigo, fecharAutenticacaoFalhou)
			}
			if p.registro.Tamanho() != 0 {
				t.Errorf("sobrou sessão no registro depois de um IDENTIFY recusado: %d", p.registro.Tamanho())
			}
		})
	}
}

// O IDENTIFY com snowflake como **número** (algumas libs mandam assim) tem de
// funcionar, e sem perder os últimos dígitos por causa de float64.
func TestIdentifyComSnowflakeEmNumero(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)
	token, rei := tokenDeTeste(t, nil)

	corpo := fmt.Sprintf(`{"op":0,"d":{"server_id":%s,"user_id":%s,"session_id":%q,"token":%q}}`,
		rei.Servidor, rei.Bot, rei.Sessao, token)
	if err := ws.WriteMessage(websocket.TextMessage, []byte(corpo)); err != nil {
		t.Fatalf("escrever o IDENTIFY: %v", err)
	}
	if pronto := lerOp(t, ws); pronto.Op != opReady {
		t.Fatalf("esperava READY, veio op %d", pronto.Op)
	}
}

func TestSelectProtocolComModoDesconhecidoFecha4016(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)
	token, rei := tokenDeTeste(t, nil)
	enviarOp(t, ws, opIdentify, dadosDeIdentify{
		ServerID: idDoProtocolo(rei.Servidor), UserID: idDoProtocolo(rei.Bot),
		SessionID: rei.Sessao, Token: token,
	})
	lerOp(t, ws)

	enviarOp(t, ws, opSelectProtocol, map[string]any{
		"protocol": "udp",
		"data":     map[string]any{"address": "198.51.100.9", "port": 50123, "mode": "xsalsa20_poly1305"},
	})
	if codigo := codigoDoFechamento(t, ws); codigo != fecharModoDesconhecido {
		t.Errorf("close code = %d, queria %d", codigo, fecharModoDesconhecido)
	}
}

func TestSelectProtocolQueNaoEhUdpFecha4012(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)
	token, rei := tokenDeTeste(t, nil)
	enviarOp(t, ws, opIdentify, dadosDeIdentify{
		ServerID: idDoProtocolo(rei.Servidor), UserID: idDoProtocolo(rei.Bot),
		SessionID: rei.Sessao, Token: token,
	})
	lerOp(t, ws)

	enviarOp(t, ws, opSelectProtocol, map[string]any{
		"protocol": "webrtc",
		"data":     map[string]any{"mode": string(ModoAesGcm)},
	})
	if codigo := codigoDoFechamento(t, ws); codigo != fecharProtocoloDesconhecido {
		t.Errorf("close code = %d, queria %d", codigo, fecharProtocoloDesconhecido)
	}
}

// A regra que evita a ponte parar de funcionar sozinha quando uma lib for
// atualizada: opcode desconhecido é ignorado, nunca fecha a conexão.
func TestOpcodeDesconhecidoNaoFecha(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)

	for _, op := range []int{5 /* SPEAKING */, 12, 21 /* DAVE */, 31, 99} {
		enviarOp(t, ws, op, map[string]any{"o_que_for": true})
	}
	// A conexão continua viva: o heartbeat depois deles é respondido.
	if err := ws.WriteMessage(websocket.TextMessage, []byte(`{"op":3,"d":9}`)); err != nil {
		t.Fatalf("escrever: %v", err)
	}
	if ack := lerOp(t, ws); ack.Op != opHeartbeatAck {
		t.Fatalf("a conexão não sobreviveu aos opcodes desconhecidos: veio op %d", ack.Op)
	}
}

func TestJsonInvalidoNaoFechaAConexao(t *testing.T) {
	p := subirPonte(t)
	ws := p.discar()
	lerOp(t, ws)
	if err := ws.WriteMessage(websocket.TextMessage, []byte(`isto não é json`)); err != nil {
		t.Fatalf("escrever: %v", err)
	}
	if err := ws.WriteMessage(websocket.TextMessage, []byte(`{"op":3,"d":1}`)); err != nil {
		t.Fatalf("escrever: %v", err)
	}
	if ack := lerOp(t, ws); ack.Op != opHeartbeatAck {
		t.Fatalf("a conexão não sobreviveu a um JSON inválido: veio op %d", ack.Op)
	}
}

// Falha ao entrar no LiveKit **não** derruba a sessão de voz (§ livekit.go): o
// bot continua mandando RTP e nós continuamos decifrando; só não sai som.
func TestFalhaNoLiveKitNaoDerrubaASessao(t *testing.T) {
	p := subirPonte(t)
	p.erroLiveKit = errors.New("LiveKit fora do ar")
	ws := p.discar()
	token, rei := tokenDeTeste(t, nil)
	pronto, _ := p.apertoDeMao(ws, token, rei)

	select {
	case <-p.entradas:
	case <-time.After(3 * time.Second):
		t.Fatal("nem tentamos entrar na sala")
	}

	sessao, achou := p.registro.PorSSRC(pronto.SSRC)
	if !achou || !sessao.Viva() {
		t.Fatal("a sessão morreu porque o LiveKit falhou")
	}
	// E o heartbeat continua indo e voltando.
	if err := ws.WriteMessage(websocket.TextMessage, []byte(`{"op":3,"d":3}`)); err != nil {
		t.Fatalf("escrever: %v", err)
	}
	if ack := lerOp(t, ws); ack.Op != opHeartbeatAck {
		t.Fatalf("esperava HEARTBEAT_ACK, veio op %d", ack.Op)
	}
	// Publicar sem faixa não pode entrar em pânico.
	sessao.Publicar([]byte{1, 2, 3})
}

func TestSaudeResponde200(t *testing.T) {
	p := subirPonte(t)
	resposta, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/saude", p.srv.Porta()))
	if err != nil {
		t.Fatalf("GET /saude: %v", err)
	}
	defer func() { _ = resposta.Body.Close() }()
	if resposta.StatusCode != http.StatusOK {
		t.Errorf("GET /saude = %d, queria 200 (é o HEALTHCHECK do compose)", resposta.StatusCode)
	}
	corpo, _ := io.ReadAll(resposta.Body)
	if !strings.HasPrefix(string(corpo), "ok") {
		t.Errorf("corpo do /saude = %q", corpo)
	}
}

// As libs montam `wss://<endpoint>/?v=8` — mas nem todas põem a barra. Qualquer
// caminho tem de virar voice gateway.
func TestQualquerCaminhoViraWs(t *testing.T) {
	p := subirPonte(t)
	for _, caminho := range []string{"/?v=8", "/?v=4", "/qualquer/coisa", ""} {
		url := fmt.Sprintf("ws://127.0.0.1:%d%s", p.srv.Porta(), caminho)
		ws, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			t.Fatalf("discar %q: %v", url, err)
		}
		if hello := lerOp(t, ws); hello.Op != opHello {
			t.Errorf("%q: esperava HELLO, veio op %d", url, hello.Op)
		}
		_ = ws.Close()
	}
}

func TestValidarToken(t *testing.T) {
	_, rei := tokenDeTeste(t, nil)

	bom, _ := tokenDeTeste(t, nil)
	t.Run("token bom", func(t *testing.T) {
		obtido, err := ValidarToken(segredoDeTeste, bom, rei.Servidor, rei.Bot, rei.Sessao)
		if err != nil {
			t.Fatalf("ValidarToken devolveu erro: %v", err)
		}
		if obtido.Sala != rei.Sala || obtido.TokenLk != rei.TokenLk || obtido.UrlLk != rei.UrlLk {
			t.Errorf("a reivindicação voltou incompleta: %+v", obtido)
		}
	})

	t.Run("aud errado", func(t *testing.T) {
		token, r := tokenDeTeste(t, func(r *Reivindicacao) { r.Audiencia = "outra-coisa" })
		_, err := ValidarToken(segredoDeTeste, token, r.Servidor, r.Bot, r.Sessao)
		if !errors.Is(err, jwt.ErrTokenInvalidAudience) {
			t.Errorf("erro = %v, queria ErrTokenInvalidAudience", err)
		}
	})

	t.Run("expirado", func(t *testing.T) {
		token, r := tokenDeTeste(t, func(r *Reivindicacao) {
			r.EmitidoEm = time.Now().Add(-time.Hour).Unix()
			r.Expiracao = time.Now().Add(-time.Minute).Unix()
		})
		_, err := ValidarToken(segredoDeTeste, token, r.Servidor, r.Bot, r.Sessao)
		if !errors.Is(err, jwt.ErrTokenExpired) {
			t.Errorf("erro = %v, queria ErrTokenExpired", err)
		}
	})

	t.Run("sem exp", func(t *testing.T) {
		token, r := tokenDeTeste(t, func(r *Reivindicacao) { r.Expiracao = 0 })
		if _, err := ValidarToken(segredoDeTeste, token, r.Servidor, r.Bot, r.Sessao); err == nil {
			t.Error("um token sem exp tem de ser recusado")
		}
	})

	t.Run("sub diferente do user_id do IDENTIFY", func(t *testing.T) {
		_, err := ValidarToken(segredoDeTeste, bom, rei.Servidor, "1420000000000000999", rei.Sessao)
		if !errors.Is(err, ErrTokenNaoConfere) {
			t.Errorf("erro = %v, queria ErrTokenNaoConfere", err)
		}
	})

	t.Run("gid diferente do server_id do IDENTIFY", func(t *testing.T) {
		_, err := ValidarToken(segredoDeTeste, bom, "1418000000000000999", rei.Bot, rei.Sessao)
		if !errors.Is(err, ErrTokenNaoConfere) {
			t.Errorf("erro = %v, queria ErrTokenNaoConfere", err)
		}
	})

	t.Run("sid diferente do session_id do IDENTIFY", func(t *testing.T) {
		_, err := ValidarToken(segredoDeTeste, bom, rei.Servidor, rei.Bot, "outra-sessao")
		if !errors.Is(err, ErrTokenNaoConfere) {
			t.Errorf("erro = %v, queria ErrTokenNaoConfere", err)
		}
	})

	t.Run("assinatura de outro segredo", func(t *testing.T) {
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, rei).SignedString([]byte("outro segredo"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ValidarToken(segredoDeTeste, token, rei.Servidor, rei.Bot, rei.Sessao); !errors.Is(err, jwt.ErrTokenSignatureInvalid) {
			t.Errorf("erro = %v, queria ErrTokenSignatureInvalid", err)
		}
	})

	t.Run("alg none", func(t *testing.T) {
		token, err := jwt.NewWithClaims(jwt.SigningMethodNone, rei).SignedString(jwt.UnsafeAllowNoneSignatureType)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ValidarToken(segredoDeTeste, token, rei.Servidor, rei.Bot, rei.Sessao); err == nil {
			t.Error("um token com alg=none tem de ser recusado")
		}
	})

	t.Run("sem token", func(t *testing.T) {
		if _, err := ValidarToken(segredoDeTeste, "", rei.Servidor, rei.Bot, rei.Sessao); !errors.Is(err, ErrSemToken) {
			t.Errorf("erro = %v, queria ErrSemToken", err)
		}
	})

	t.Run("segredo vazio recusa tudo", func(t *testing.T) {
		if _, err := ValidarToken("", bom, rei.Servidor, rei.Bot, rei.Sessao); err == nil {
			t.Error("sem segredo a ponte tem de recusar, não aceitar")
		}
	})
}

// §4 do CONTRATO-F2.md: a rota interna, o cabeçalho e o corpo.
func TestAvisarQueCaiu(t *testing.T) {
	type pedido struct {
		caminho string
		segredo string
		corpo   corpoDoAviso
	}
	recebidos := make(chan pedido, 1)
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var corpo corpoDoAviso
		_ = json.NewDecoder(r.Body).Decode(&corpo)
		recebidos <- pedido{caminho: r.URL.Path, segredo: r.Header.Get("X-Ponte-Segredo"), corpo: corpo}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer api.Close()

	cfg := ConfigDaPonte{Segredo: segredoDeTeste, ApiInternaUrl: api.URL}
	AvisarQueCaiu(cfg, "1420000000000000001", "1419000000000000003", false)

	select {
	case p := <-recebidos:
		if p.caminho != "/api/interno/ponte-voz/estado" {
			t.Errorf("caminho = %q", p.caminho)
		}
		if p.segredo != segredoDeTeste {
			t.Errorf("X-Ponte-Segredo = %q", p.segredo)
		}
		if p.corpo.Bot != "1420000000000000001" || p.corpo.Canal != "1419000000000000003" || p.corpo.Conectado {
			t.Errorf("corpo = %+v", p.corpo)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a API não recebeu o aviso")
	}

	// Sem API_INTERNA_URL a chamada não pode travar nem entrar em pânico.
	AvisarQueCaiu(ConfigDaPonte{Segredo: segredoDeTeste}, "1", "2", false)
	// Uma API que não responde 204 também é só log.
	api.Close()
	AvisarQueCaiu(cfg, "1", "2", false)
}
