package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// O Voice Gateway do Discord, versão 8, **tolerante ao v4** (§D5.2): o
// Lavalink/koe ainda fala v4 em algumas versões e a única diferença que nos
// atinge é o formato do heartbeat (`d` int no v4, `{t, seq_ack}` no v8) — e a
// regra é **ecoar no mesmo formato que recebeu**.
//
// As libs montam `wss://<endpoint>/?v=8` sem caminho: por isso um host próprio
// (`voz.streamz.chat`) e não um path da API. Aceitamos qualquer caminho.
//
// Opcodes (§D5.2), na direção em que nos importam:
//
//	→ 0 IDENTIFY {server_id, user_id, session_id, token}   valida o JWT
//	→ 1 SELECT_PROTOCOL {protocol:"udp", data:{address, port, mode}}
//	← 2 READY {ssrc, ip, port, modes, heartbeat_interval}
//	→ 3 HEARTBEAT
//	← 4 SESSION_DESCRIPTION {mode, secret_key:[32], dave_protocol_version:0}
//	→ 5 SPEAKING (aceita e ignora — o LiveKit calcula por nível de áudio)
//	← 6 HEARTBEAT_ACK (no formato que recebeu)
//	→ 7 RESUME
//	← 8 HELLO {heartbeat_interval: 13750}
//	← 9 RESUMED
//	  11/13 CLIENTS_CONNECT / CLIENT_DISCONNECT — nunca mandamos
//	  21-31 DAVE/MLS — não implementamos; `dave_protocol_version: 0` faz o
//	        cliente negociar para baixo.
//
// Opcode desconhecido: **ignorar**, nunca fechar. Um close por op novo do
// Discord é o jeito mais rápido de a ponte parar de funcionar sozinha quando
// uma lib for atualizada.

// IntervaloDeHeartbeatMs é o que vai no HELLO. 13750 é o do Discord (§D5.2).
const IntervaloDeHeartbeatMs = 13750

// Os opcodes, na numeração do Discord.
const (
	opIdentify           = 0
	opSelectProtocol     = 1
	opReady              = 2
	opHeartbeat          = 3
	opSessionDescription = 4
	opSpeaking           = 5
	opHeartbeatAck       = 6
	opResume             = 7
	opHello              = 8
	opResumed            = 9
)

// Os códigos de fechamento que usamos. São os do Discord: as libs já sabem
// quais são recuperáveis (4015) e quais não (4004).
const (
	fecharAutenticacaoFalhou    = 4004 // token que não confere: não melhora sozinho
	fecharSessaoInvalida        = 4006 // RESUME de sessão que não conhecemos
	fecharProtocoloDesconhecido = 4012 // SELECT_PROTOCOL que não é "udp"
	fecharModoDesconhecido      = 4016 // modo de criptografia que não temos
)

// Tempos do WS. O cliente bate a cada 13,75 s; três batidas perdidas é queda.
const (
	TempoLimiteDeLeitura = 45 * time.Second
	TempoLimiteDeEscrita = 10 * time.Second
	// TamanhoMaximoDaMensagem: o maior payload legítimo é o IDENTIFY com o
	// JWT dentro (§3 do contrato, o risco nº 1 do §D5.8). 64 KB é folga de
	// sobra e ainda é um teto.
	TamanhoMaximoDaMensagem = 64 * 1024
)

// AudienciaDoToken é o `aud` que o JWT da API tem que trazer (§3 do contrato).
const AudienciaDoToken = "ponte-voz"

// Erros de `ValidarToken` que o gateway distingue.
var (
	// ErrTokenNaoConfere é o caso que importa: assinatura boa, mas o JWT foi
	// emitido para outro bot, outra guild ou outra sessão. Sem esta checagem um
	// token vazado entraria em qualquer sala.
	ErrTokenNaoConfere = errors.New("o token não é desta sessão")
	// ErrSemToken é IDENTIFY sem `token`.
	ErrSemToken = errors.New("IDENTIFY sem token")
)

// dependenciasDaPonte são as peças que o teste troca por duplos: o lote A1
// (cripto) e o LiveKit. Em produção são sempre as de verdade — `NovoServidorDeVoz`
// as preenche e ninguém mexe.
type dependenciasDaPonte struct {
	sortearChave func() ([]byte, error)
	novoCifrador func(modo Modo, chave []byte) (Cifrador, error)
	conectar     func(rei Reivindicacao, log *slog.Logger) (publicadorDeAudio, error)
	avisarQueCai func(cfg ConfigDaPonte, bot, canal string, conectado bool)
}

// ServidorDeVoz é o HTTP+WS da ponte.
type ServidorDeVoz struct {
	cfg      ConfigDaPonte
	registro RegistroDeSessoes
	log      *slog.Logger
	dep      dependenciasDaPonte

	atualizador websocket.Upgrader

	mu        sync.Mutex
	ouvinte   net.Listener
	porSessao map[string]*entradaDeSessao
	conexoes  map[*websocket.Conn]struct{}
	geracao   uint64
}

// entradaDeSessao é o que o RESUME procura. `geracao` cresce a cada conexão que
// adota a sessão: a conexão antiga, ao morrer, vê que não é mais a dona e não
// fecha a sessão de baixo da nova.
type entradaDeSessao struct {
	sessao  *SessaoWs
	geracao uint64
}

// NovoServidorDeVoz monta o servidor. Não escuta ainda.
func NovoServidorDeVoz(cfg ConfigDaPonte, registro RegistroDeSessoes, log *slog.Logger) *ServidorDeVoz {
	return &ServidorDeVoz{
		cfg:      cfg,
		registro: registro,
		log:      log,
		dep: dependenciasDaPonte{
			sortearChave: SortearChave,
			novoCifrador: NovoCifrador,
			conectar: func(rei Reivindicacao, log *slog.Logger) (publicadorDeAudio, error) {
				p, err := Conectar(rei, log)
				if err != nil {
					return nil, err
				}
				return p, nil
			},
			avisarQueCai: AvisarQueCaiu,
		},
		atualizador: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			// Bot não manda `Origin`, e quem chega aqui já precisa de um JWT
			// nosso para fazer qualquer coisa. Recusar por origem só quebraria
			// clientes legítimos.
			CheckOrigin: func(*http.Request) bool { return true },
		},
		porSessao: make(map[string]*entradaDeSessao),
		conexoes:  make(map[*websocket.Conn]struct{}),
	}
}

// Servir escuta em `cfg.PortaWs` até o contexto morrer. Além do WS, responde
// `GET /saude` com 200 — é o healthcheck do compose.
func (s *ServidorDeVoz) Servir(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/saude", s.saude)
	mux.HandleFunc("/", s.aoConectar)

	ouvinte, err := net.Listen("tcp", fmt.Sprintf(":%d", s.cfg.PortaWs))
	if err != nil {
		return fmt.Errorf("escutar o WS na porta %d: %w", s.cfg.PortaWs, err)
	}
	s.mu.Lock()
	s.ouvinte = ouvinte
	s.mu.Unlock()

	servidor := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	s.log.Info("voice gateway escutando", "porta", s.Porta(), "ip_publico", s.cfg.IpPublico)

	erroDoServidor := make(chan error, 1)
	go func() { erroDoServidor <- servidor.Serve(ouvinte) }()

	select {
	case err := <-erroDoServidor:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// `Shutdown` não encosta em conexão sequestrada (todo WS é uma): as
		// sessões vivas são fechadas na mão, para o LiveKit e a API saberem.
		s.fecharTudo()
		desligar, cancelar := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelar()
		if err := servidor.Shutdown(desligar); err != nil {
			return fmt.Errorf("desligar o WS: %w", err)
		}
		return nil
	}
}

// Porta é a porta em que o WS está de fato escutando — o teste sobe com `:0`.
func (s *ServidorDeVoz) Porta() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ouvinte == nil {
		return s.cfg.PortaWs
	}
	if addr, ok := s.ouvinte.Addr().(*net.TCPAddr); ok {
		return addr.Port
	}
	return s.cfg.PortaWs
}

func (s *ServidorDeVoz) saude(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, "ok sessoes=%d\n", s.registro.Tamanho())
}

func (s *ServidorDeVoz) aoConectar(w http.ResponseWriter, r *http.Request) {
	// As libs montam `wss://<endpoint>/?v=8`, e algumas põem caminho e outras
	// não: qualquer caminho serve, e a versão vem na query só para o log.
	if !websocket.IsWebSocketUpgrade(r) {
		http.Error(w, "ponte-voz: esta porta é o voice gateway; só WebSocket", http.StatusUpgradeRequired)
		return
	}
	ws, err := s.atualizador.Upgrade(w, r, nil)
	if err != nil {
		// O `Upgrade` já respondeu ao cliente.
		s.log.Warn("upgrade para WebSocket falhou", "erro", err, "remoto", r.RemoteAddr)
		return
	}
	c := &conexao{
		srv: s,
		ws:  ws,
		log: s.log.With("remoto", ws.RemoteAddr().String(), "v", r.URL.Query().Get("v")),
	}
	s.registrarConexao(ws)
	defer s.esquecerConexao(ws)
	c.atender()
}

func (s *ServidorDeVoz) registrarConexao(ws *websocket.Conn) {
	s.mu.Lock()
	s.conexoes[ws] = struct{}{}
	s.mu.Unlock()
}

func (s *ServidorDeVoz) esquecerConexao(ws *websocket.Conn) {
	s.mu.Lock()
	delete(s.conexoes, ws)
	s.mu.Unlock()
}

// fecharTudo derruba as conexões vivas no SIGTERM. Cada goroutine de conexão
// vê o erro de leitura e faz o encerramento normal da sua sessão (LiveKit fora,
// API avisada).
func (s *ServidorDeVoz) fecharTudo() {
	s.mu.Lock()
	conexoes := make([]*websocket.Conn, 0, len(s.conexoes))
	for ws := range s.conexoes {
		conexoes = append(conexoes, ws)
	}
	s.mu.Unlock()
	for _, ws := range conexoes {
		_ = ws.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseServiceRestart, "ponte-voz desligando"),
			time.Now().Add(time.Second))
		_ = ws.Close()
	}
}

// ── uma conexão ──────────────────────────────────────────────

type conexao struct {
	srv *ServidorDeVoz
	ws  *websocket.Conn
	log *slog.Logger

	escrita sync.Mutex

	sessao    *SessaoWs
	sessaoID  string
	geracao   uint64
	rei       Reivindicacao
	modoEmUso Modo
}

// mensagem é o envelope do voice gateway. `d` fica cru: o heartbeat precisa ser
// ecoado no mesmo formato em que chegou (int no v4, objeto no v8).
type mensagem struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d,omitempty"`
}

// idDoProtocolo aceita snowflake como string (o normal) **ou** como número cru
// — algumas libs mandam número, e passar por `float64` estragaria os últimos
// dígitos de um snowflake. Aqui o número vira string sem perder um bit.
type idDoProtocolo string

func (i *idDoProtocolo) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || string(b) == "null" {
		*i = ""
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*i = idDoProtocolo(s)
		return nil
	}
	*i = idDoProtocolo(string(b))
	return nil
}

func (i idDoProtocolo) String() string { return string(i) }

type dadosDeIdentify struct {
	ServerID  idDoProtocolo `json:"server_id"`
	UserID    idDoProtocolo `json:"user_id"`
	SessionID string        `json:"session_id"`
	Token     string        `json:"token"`
}

type dadosDeResume struct {
	ServerID  idDoProtocolo `json:"server_id"`
	SessionID string        `json:"session_id"`
	Token     string        `json:"token"`
}

type dadosDeSelectProtocol struct {
	Protocol string `json:"protocol"`
	Data     struct {
		Address string `json:"address"`
		Port    int    `json:"port"`
		Mode    string `json:"mode"`
	} `json:"data"`
}

type dadosDeHello struct {
	IntervaloDeHeartbeat int `json:"heartbeat_interval"`
}

type dadosDeReady struct {
	SSRC                 uint32   `json:"ssrc"`
	IP                   string   `json:"ip"`
	Porta                int      `json:"port"`
	Modos                []string `json:"modes"`
	IntervaloDeHeartbeat int      `json:"heartbeat_interval"`
}

type dadosDeSessionDescription struct {
	Modo string `json:"mode"`
	// `secret_key` é um **array de 32 números** no fio, não base64: um
	// `[]byte` em Go viraria base64 e o cliente não decifraria nada.
	SecretKey           []int `json:"secret_key"`
	DaveProtocolVersion int   `json:"dave_protocol_version"`
}

func (c *conexao) atender() {
	defer func() {
		c.encerrarSessao()
		_ = c.ws.Close()
	}()

	c.ws.SetReadLimit(TamanhoMaximoDaMensagem)
	_ = c.ws.SetReadDeadline(time.Now().Add(TempoLimiteDeLeitura))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(TempoLimiteDeLeitura))
	})

	if err := c.enviar(opHello, dadosDeHello{IntervaloDeHeartbeat: IntervaloDeHeartbeatMs}); err != nil {
		c.log.Warn("não deu para mandar o HELLO", "erro", err)
		return
	}

	for {
		_, bruto, err := c.ws.ReadMessage()
		if err != nil {
			c.log.Debug("WS encerrado", "erro", err)
			return
		}
		_ = c.ws.SetReadDeadline(time.Now().Add(TempoLimiteDeLeitura))

		var m mensagem
		if err := json.Unmarshal(bruto, &m); err != nil {
			// Lixo no fio não fecha a conexão: fechar seria o mesmo que dar a
			// um pacote malformado o poder de derrubar a música.
			c.log.Warn("mensagem que não é JSON do voice gateway", "erro", err)
			continue
		}
		if fim := c.despachar(m); fim {
			return
		}
	}
}

// despachar devolve `true` quando a conexão tem de acabar.
func (c *conexao) despachar(m mensagem) bool {
	switch m.Op {
	case opIdentify:
		return c.aoIdentify(m.D)
	case opSelectProtocol:
		return c.aoSelectProtocol(m.D)
	case opHeartbeat:
		return c.aoHeartbeat(m.D)
	case opSpeaking:
		// Aceita e ignora: quem calcula quem está falando é o LiveKit, por
		// nível de áudio (§D5.2).
		return false
	case opResume:
		return c.aoResume(m.D)
	default:
		// **Nunca** fechar por opcode desconhecido: é o jeito mais rápido de a
		// ponte parar de funcionar sozinha quando uma lib for atualizada.
		c.log.Debug("opcode ignorado", "op", m.Op)
		return false
	}
}

func (c *conexao) aoIdentify(d json.RawMessage) bool {
	var dados dadosDeIdentify
	if err := json.Unmarshal(d, &dados); err != nil {
		c.log.Warn("IDENTIFY malformado", "erro", err)
		return c.fechar(fecharAutenticacaoFalhou, "IDENTIFY malformado")
	}
	if c.sessao != nil {
		c.log.Warn("IDENTIFY repetido na mesma conexão; ignorado")
		return false
	}

	rei, err := ValidarToken(c.srv.cfg.Segredo, dados.Token,
		dados.ServerID.String(), dados.UserID.String(), dados.SessionID)
	if err != nil {
		c.log.Warn("IDENTIFY recusado",
			"erro", err,
			"server_id", dados.ServerID, "user_id", dados.UserID, "session_id", dados.SessionID,
			"tamanho_do_token", len(dados.Token))
		return c.fechar(fecharAutenticacaoFalhou, "authentication failed")
	}

	ssrc := c.srv.registro.ProximoSSRC()
	sessao := NovaSessao(rei, ssrc, c.srv.log)
	if c.srv.cfg.DumpPacote {
		sessao.LigarDump()
	}
	c.srv.registro.Registrar(sessao)
	if _, vivo := c.srv.registro.PorSSRC(ssrc); !vivo {
		// O teto de sessões recusou (`registro.go`). Melhor um close com motivo
		// do que um bot que conecta e nunca fala.
		sessao.Fechar()
		c.log.Error("teto de sessões atingido; IDENTIFY recusado", "teto", TetoDeSessoes)
		return c.fechar(websocket.CloseTryAgainLater, "ponte-voz sem espaço para mais sessões")
	}

	c.sessao = sessao
	c.rei = rei
	c.sessaoID = dados.SessionID
	c.geracao = c.srv.adotarSessao(dados.SessionID, sessao)
	c.log = c.log.With("ssrc", ssrc, "bot", rei.Bot, "sala", rei.Sala)
	c.log.Info("IDENTIFY aceito", "guild", rei.Servidor, "canal", rei.Canal, "sessao", dados.SessionID)

	if err := c.enviar(opReady, dadosDeReady{
		SSRC: ssrc,
		// IP público, nunca hostname: o cliente manda RTP para cá sem resolver
		// nada (§D5.4).
		IP:                   c.srv.cfg.IpPublico,
		Porta:                c.srv.cfg.PortaUdp,
		Modos:                ModosAnunciados,
		IntervaloDeHeartbeat: IntervaloDeHeartbeatMs,
	}); err != nil {
		c.log.Warn("não deu para mandar o READY", "erro", err)
		return true
	}
	return false
}

func (c *conexao) aoSelectProtocol(d json.RawMessage) bool {
	if c.sessao == nil {
		c.log.Warn("SELECT_PROTOCOL antes do IDENTIFY")
		return c.fechar(fecharAutenticacaoFalhou, "SELECT_PROTOCOL antes do IDENTIFY")
	}
	var dados dadosDeSelectProtocol
	if err := json.Unmarshal(d, &dados); err != nil {
		c.log.Warn("SELECT_PROTOCOL malformado", "erro", err)
		return c.fechar(fecharProtocoloDesconhecido, "SELECT_PROTOCOL malformado")
	}
	if dados.Protocol != "" && dados.Protocol != "udp" {
		c.log.Error("protocolo não suportado; só falamos UDP", "protocolo", dados.Protocol)
		return c.fechar(fecharProtocoloDesconhecido, "unknown protocol")
	}

	modo, ok := ModoSuportado(dados.Data.Mode)
	if !ok {
		// O risco 4 do §D5.8: a mensagem **tem** que dizer o nome recebido, ou
		// a causa (um Lavalink velho pedindo `xsalsa20_poly1305`) fica invisível.
		c.log.Error("modo não suportado: "+dados.Data.Mode+"; atualize o Lavalink",
			"modo_recebido", dados.Data.Mode, "modos_que_temos", ModosAnunciados)
		return c.fechar(fecharModoDesconhecido, "unknown encryption mode: "+dados.Data.Mode)
	}

	chave, err := c.srv.dep.sortearChave()
	if err != nil {
		c.log.Error("sortear a secret_key falhou", "erro", err)
		return c.fechar(websocket.CloseInternalServerErr, "erro interno ao sortear a chave")
	}
	cifrador, err := c.srv.dep.novoCifrador(modo, chave)
	if err != nil {
		c.log.Error("montar o cifrador falhou", "erro", err, "modo", modo)
		return c.fechar(websocket.CloseInternalServerErr, "erro interno ao montar o cifrador")
	}
	c.sessao.DefinirCifrador(cifrador)
	c.modoEmUso = modo

	c.log.Info("SELECT_PROTOCOL aceito",
		"modo", modo,
		"endereco_do_cliente", dados.Data.Address, "porta_do_cliente", dados.Data.Port)

	if err := c.enviar(opSessionDescription, dadosDeSessionDescription{
		Modo:      string(modo),
		SecretKey: comoArrayDeNumeros(chave),
		// DAVE/MLS não implementamos: anunciar 0 faz o cliente negociar para
		// baixo e usar o transporte normal (§D5.2).
		DaveProtocolVersion: 0,
	}); err != nil {
		c.log.Warn("não deu para mandar o SESSION_DESCRIPTION", "erro", err)
		return true
	}

	c.entrarNoLiveKit()
	return false
}

// entrarNoLiveKit sobe a faixa numa goroutine: `JoinWithToken` faz ICE/DTLS e
// leva centenas de milissegundos, e nada disso pode segurar o aperto de mão do
// voice gateway (o cliente já quer mandar RTP).
func (c *conexao) entrarNoLiveKit() {
	sessao, rei, log := c.sessao, c.rei, c.log
	go func() {
		publicador, err := c.srv.dep.conectar(rei, log)
		if err != nil {
			log.Error("não entramos na sala do LiveKit: NÃO VAI SAIR SOM desta sessão no navegador — o RTP continua chegando e sendo decifrado, só não tem para onde ir",
				"erro", err, "sala", rei.Sala, "lkUrl", rei.UrlLk)
			return
		}
		if !sessao.DefinirPublicador(publicador) {
			// A sessão morreu enquanto entrávamos na sala.
			publicador.Desconectar()
		}
	}()
}

func (c *conexao) aoHeartbeat(d json.RawMessage) bool {
	// **Ecoar no mesmo formato que recebeu** (§D5.2): o v4 manda `d` como int
	// e espera int de volta; o v8 manda `{t, seq_ack}` e espera `{t}`.
	resposta := json.RawMessage("null")
	switch {
	case len(d) == 0:
		resposta = json.RawMessage("null")
	case d[0] == '{':
		var objeto map[string]json.RawMessage
		if err := json.Unmarshal(d, &objeto); err == nil {
			if t, tem := objeto["t"]; tem {
				resposta = json.RawMessage(`{"t":` + string(t) + `}`)
			} else {
				resposta = d
			}
		} else {
			resposta = d
		}
	default:
		// Número cru (v4) ou qualquer outra coisa: volta igual.
		resposta = d
	}
	if err := c.enviarCru(opHeartbeatAck, resposta); err != nil {
		c.log.Warn("não deu para mandar o HEARTBEAT_ACK", "erro", err)
		return true
	}
	return false
}

func (c *conexao) aoResume(d json.RawMessage) bool {
	var dados dadosDeResume
	if err := json.Unmarshal(d, &dados); err != nil {
		c.log.Warn("RESUME malformado", "erro", err)
		return c.fechar(fecharSessaoInvalida, "RESUME malformado")
	}
	entrada, achou := c.srv.acharSessao(dados.SessionID)
	if !achou {
		// A sessão já morreu (ou nunca existiu neste processo). O cliente trata
		// 4006 como "identifique de novo", que é exatamente o que queremos: o
		// JWT ainda vale 15 min (§3 do contrato).
		c.log.Info("RESUME de sessão que não conhecemos; peça um IDENTIFY", "session_id", dados.SessionID)
		return c.fechar(fecharSessaoInvalida, "session no longer valid")
	}
	rei := entrada.sessao.Reivindicacao()
	if _, err := ValidarToken(c.srv.cfg.Segredo, dados.Token,
		dados.ServerID.String(), rei.Bot, dados.SessionID); err != nil {
		c.log.Warn("RESUME recusado", "erro", err, "session_id", dados.SessionID)
		return c.fechar(fecharAutenticacaoFalhou, "authentication failed")
	}

	c.sessao = entrada.sessao
	c.rei = rei
	c.sessaoID = dados.SessionID
	c.geracao = c.srv.adotarSessao(dados.SessionID, entrada.sessao)
	c.log = c.log.With("ssrc", entrada.sessao.SSRC(), "bot", rei.Bot, "sala", rei.Sala)
	c.log.Info("RESUME aceito", "session_id", dados.SessionID)

	if err := c.enviarCru(opResumed, json.RawMessage("null")); err != nil {
		c.log.Warn("não deu para mandar o RESUMED", "erro", err)
		return true
	}
	return false
}

// encerrarSessao fecha a sessão desta conexão — a menos que outra conexão a
// tenha adotado por RESUME no meio do caminho.
func (c *conexao) encerrarSessao() {
	if c.sessao == nil {
		return
	}
	if !c.srv.soltarSessao(c.sessaoID, c.geracao) {
		c.log.Debug("outra conexão adotou a sessão; nada a fechar aqui")
		return
	}
	c.srv.registro.Remover(c.sessao.SSRC())
	c.sessao.Fechar()
	// §4 do contrato: bot que caiu, caiu — sem a carência de 45 s do web.
	if c.srv.dep.avisarQueCai != nil {
		c.srv.dep.avisarQueCai(c.srv.cfg, c.rei.Bot, c.rei.Canal, false)
	}
}

func (c *conexao) enviar(op int, d any) error {
	bruto, err := json.Marshal(d)
	if err != nil {
		return fmt.Errorf("serializar op %d: %w", op, err)
	}
	return c.enviarCru(op, bruto)
}

func (c *conexao) enviarCru(op int, d json.RawMessage) error {
	corpo, err := json.Marshal(mensagem{Op: op, D: d})
	if err != nil {
		return fmt.Errorf("serializar o envelope do op %d: %w", op, err)
	}
	c.escrita.Lock()
	defer c.escrita.Unlock()
	if err := c.ws.SetWriteDeadline(time.Now().Add(TempoLimiteDeEscrita)); err != nil {
		return err
	}
	return c.ws.WriteMessage(websocket.TextMessage, corpo)
}

// fechar manda o close com código e devolve `true` — o chamador está sempre no
// `return c.fechar(...)`.
func (c *conexao) fechar(codigo int, motivo string) bool {
	_ = c.ws.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(codigo, motivo),
		time.Now().Add(TempoLimiteDeEscrita))
	return true
}

// ── o registro de sessões por session_id (para o RESUME) ─────

func (s *ServidorDeVoz) adotarSessao(sessaoID string, sessao *SessaoWs) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.geracao++
	s.porSessao[sessaoID] = &entradaDeSessao{sessao: sessao, geracao: s.geracao}
	return s.geracao
}

func (s *ServidorDeVoz) acharSessao(sessaoID string) (*entradaDeSessao, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entrada, achou := s.porSessao[sessaoID]
	if !achou || !entrada.sessao.Viva() {
		return nil, false
	}
	return entrada, true
}

// soltarSessao devolve `true` quando quem chamou ainda era o dono — só ele
// fecha a sessão.
func (s *ServidorDeVoz) soltarSessao(sessaoID string, geracao uint64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	entrada, achou := s.porSessao[sessaoID]
	if !achou || entrada.geracao != geracao {
		return false
	}
	delete(s.porSessao, sessaoID)
	return true
}

// comoArrayDeNumeros transforma a `secret_key` em `[1, 2, …]`, que é o que o
// fio do Discord tem e o que as libs esperam.
func comoArrayDeNumeros(chave []byte) []int {
	numeros := make([]int, len(chave))
	for i, b := range chave {
		numeros[i] = int(b)
	}
	return numeros
}

// ── o JWT (§3 do CONTRATO-F2.md) ─────────────────────────────

// A `Reivindicacao` é o nosso `jwt.Claims`. As seis funções abaixo existem só
// porque o `golang-jwt/v5` as pede; a validação de verdade está logo depois.
func (r Reivindicacao) GetExpirationTime() (*jwt.NumericDate, error) {
	if r.Expiracao == 0 {
		return nil, nil
	}
	return jwt.NewNumericDate(time.Unix(r.Expiracao, 0)), nil
}

func (r Reivindicacao) GetIssuedAt() (*jwt.NumericDate, error) {
	if r.EmitidoEm == 0 {
		return nil, nil
	}
	return jwt.NewNumericDate(time.Unix(r.EmitidoEm, 0)), nil
}

func (r Reivindicacao) GetNotBefore() (*jwt.NumericDate, error) { return nil, nil }
func (r Reivindicacao) GetIssuer() (string, error)              { return r.Emissor, nil }
func (r Reivindicacao) GetSubject() (string, error)             { return r.Bot, nil }
func (r Reivindicacao) GetAudience() (jwt.ClaimStrings, error) {
	if r.Audiencia == "" {
		return nil, nil
	}
	return jwt.ClaimStrings{r.Audiencia}, nil
}

// ValidarToken confere o JWT que chegou no `IDENTIFY.token`: assinatura HS256
// com `cfg.Segredo`, `aud == "ponte-voz"`, `exp` no futuro, e — o que importa
// de verdade — `sub`/`gid`/`sid` **iguais** ao `user_id`/`server_id`/
// `session_id` do próprio IDENTIFY. Sem essa comparação, um token vazado
// entraria em qualquer sala.
//
// Falha: close 4004 (`Authentication failed`), que as libs tratam como
// irrecuperável — é o certo, o token não vai melhorar sozinho.
func ValidarToken(segredo, token, serverID, userID, sessionID string) (Reivindicacao, error) {
	var rei Reivindicacao
	if token == "" {
		return rei, ErrSemToken
	}
	if segredo == "" {
		// Nunca deve acontecer: o `main.go` exige a variável. Se acontecer, é
		// melhor recusar tudo do que aceitar tudo.
		return rei, errors.New("PONTE_VOZ_SEGREDO vazio: a ponte recusa qualquer token")
	}

	analisador := jwt.NewParser(
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithAudience(AudienciaDoToken),
		jwt.WithExpirationRequired(),
	)
	if _, err := analisador.ParseWithClaims(token, &rei, func(*jwt.Token) (any, error) {
		return []byte(segredo), nil
	}); err != nil {
		return Reivindicacao{}, fmt.Errorf("JWT recusado: %w", err)
	}

	// A comparação que impede um token vazado de entrar em qualquer sala.
	if rei.Bot != userID || rei.Servidor != serverID || rei.Sessao != sessionID {
		return Reivindicacao{}, fmt.Errorf(
			"%w: o JWT é de bot=%s guild=%s sessao=%s e o IDENTIFY diz bot=%s guild=%s sessao=%s",
			ErrTokenNaoConfere, rei.Bot, rei.Servidor, rei.Sessao, userID, serverID, sessionID)
	}
	return rei, nil
}
