package main

import (
	"context"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

// ── Lote A1 (cripto + UDP) preenche. ──
//
// Uma porta só, `7883/udp`, para todas as sessões — como o Discord faz. A
// multiplexação é por SSRC, que nós atribuímos no `READY` (§D5.4). O primeiro
// pacote de uma sessão é o de descoberta de IP; a partir dele o endereço de
// origem fica amarrado ao SSRC (`SessaoDeVoz.FixarOrigem`).
//
// Pacote com SSRC desconhecido, ou com o SSRC certo vindo de outro endereço:
// **descartado em silêncio**. Uma porta UDP aberta na internet recebe lixo o
// dia inteiro, e um log por pacote seria o próprio ataque.

const (
	// TamanhoMaximoDoPacote é o buffer de leitura. Um quadro Opus de 20 ms a
	// 128 kbps tem ~320 bytes; 1500 é o MTU e sobra para qualquer extensão.
	TamanhoMaximoDoPacote = 1500

	// LimiteDePacotesPorSegundo é o teto por **IP de origem** (não por
	// IP:porta: quem varre portas não pode escapar do limite mudando de
	// porta). Um bot manda 50 pacotes/s; 500 cabem dez sessões atrás do mesmo
	// NAT com folga, e ainda assim é um teto.
	LimiteDePacotesPorSegundo = 500

	// TetoDeOrigens é o teto de baldes do limitador — um mapa sem teto é o
	// próprio ataque de memória que ele deveria evitar.
	TetoDeOrigens = 4096

	// OciosidadeDaOrigem é quanto tempo um balde parado sobrevive à varredura.
	OciosidadeDaOrigem = 30 * time.Second

	// IntervaloDaVarredura é o passo do faxineiro: filas de sessões mortas e
	// baldes ociosos.
	IntervaloDaVarredura = 10 * time.Second

	// PacotesDoDump é quantos pacotes por sessão saem em hexdump quando
	// `--dump-pacote` está ligado (§5 do CONTRATO-F2.md).
	PacotesDoDump = 10
)

// ServidorUDP é o laço de mídia: um socket, um registro e nada mais.
type ServidorUDP struct {
	cfg      ConfigDaPonte
	conexao  *net.UDPConn
	registro RegistroDeSessoes
	log      *slog.Logger

	mu sync.Mutex
	// filas é uma fila de jitter por SSRC, criada no primeiro quadro que
	// decifra e removida pela varredura quando a sessão morre.
	filas map[uint32]*FilaDeQuadros
	// avisouSemOrigem evita repetir, a 50 pacotes por segundo, o aviso de que
	// chegou RTP antes da descoberta de IP. Um aviso por SSRC: silêncio total
	// aqui seria o modo de falha calado que a fase toda tenta evitar.
	avisouSemOrigem map[uint32]bool
	// avisouDescoberta evita repetir o aviso de descoberta com SSRC
	// desconhecido. Chaveado por IP de origem — ver `avisarDescobertaSemSessao`.
	avisouDescoberta map[string]bool
	// avisouTroca evita repetir o aviso de que a mídia mudou de endereço.
	avisouTroca map[uint32]bool
	// dumps conta quantos pacotes de cada SSRC já saíram em hexdump.
	dumps map[uint32]int

	limitador    *limitadorDeOrigem
	fecharUmaVez sync.Once
}

// NovoServidorUDP abre o socket em `cfg.PortaUdp` (todas as interfaces).
func NovoServidorUDP(cfg ConfigDaPonte, registro RegistroDeSessoes, log *slog.Logger) (*ServidorUDP, error) {
	if log == nil {
		log = slog.Default()
	}
	conexao, err := net.ListenUDP("udp", &net.UDPAddr{Port: cfg.PortaUdp})
	if err != nil {
		return nil, err
	}
	return &ServidorUDP{
		cfg:              cfg,
		conexao:          conexao,
		registro:         registro,
		log:              log,
		filas:            make(map[uint32]*FilaDeQuadros),
		avisouSemOrigem:  make(map[uint32]bool),
		avisouDescoberta: make(map[string]bool),
		avisouTroca:      make(map[uint32]bool),
		dumps:            make(map[uint32]int),
		limitador:        novoLimitadorDeOrigem(LimiteDePacotesPorSegundo, TetoDeOrigens),
	}, nil
}

// Ouvir roda o laço de leitura até o contexto morrer. Bloqueia; o `main.go`
// (A2) o chama numa goroutine.
func (s *ServidorUDP) Ouvir(ctx context.Context) error {
	parou := make(chan struct{})
	defer close(parou)

	// Não existe `ReadFromUDP` com contexto: quem interrompe o laço é o
	// fechamento do socket.
	go func() {
		select {
		case <-ctx.Done():
			_ = s.Fechar()
		case <-parou:
		}
	}()
	go s.varrer(ctx, parou)

	buffer := make([]byte, TamanhoMaximoDoPacote)
	for {
		n, origem, err := s.conexao.ReadFromUDP(buffer)
		if err != nil {
			if errors.Is(err, net.ErrClosed) || ctx.Err() != nil {
				return nil
			}
			var neterr net.Error
			if errors.As(err, &neterr) && neterr.Timeout() {
				continue
			}
			// Erro de socket que não é fechamento: um ICMP de porta fechada
			// vira erro de leitura em alguns sistemas e não pode derrubar a
			// mídia de todas as sessões.
			s.log.Warn("ponte-voz: erro ao ler do socket UDP", "erro", err)
			continue
		}
		s.tratar(buffer[:n], origem)
	}
}

// tratar é o caminho quente: um pacote, uma sessão, um quadro.
//
// `pacote` aponta para o buffer de leitura e **não sobrevive a esta função** —
// o que segue para a fila é o texto claro que o `Open` alocou.
func (s *ServidorUDP) tratar(pacote []byte, origem *net.UDPAddr) {
	if !s.limitador.permitir(origem) {
		return
	}
	if EhPedidoDeDescoberta(pacote) {
		s.responderDescoberta(pacote, origem)
		return
	}

	ssrc, ok := SSRCDoPacote(pacote)
	if !ok {
		return // nem descoberta nem RTP versão 2: lixo
	}
	sessao, ok := s.registro.PorSSRC(ssrc)
	if !ok {
		return // SSRC desconhecido ou sessão morta: silêncio
	}

	s.dump(ssrc, pacote, origem)

	// **Quem autentica o pacote é a tag AEAD, não o endereço de origem.**
	//
	// A primeira versão disto exigia que o RTP viesse exatamente do endereço da
	// descoberta de IP, porta inclusive, e descartava o resto em silêncio. O
	// degrau 4 mostrou que isso não funciona com o mundo real: **o Lavalink faz
	// a descoberta num socket e manda a mídia de outro** — descoberta da porta
	// 54865, RTP da 35159, medido. Todo pacote era descartado, e o sintoma era
	// o pior possível: o bot conecta, o Lavalink toca, o log não acusa nada e
	// não sai som. (O `@discordjs/voice` usa um socket só, e por isso o degrau
	// 3 passava.)
	//
	// A regra passou a ser: se o endereço não é o esperado, **tente decifrar
	// assim mesmo**; se a tag bater, o remetente prova que tem a `secret_key`,
	// que é uma garantia estritamente mais forte do que um par IP:porta — e o
	// endereço é reamarrado. Se não bater, descarta. O custo de um pacote
	// forjado é uma abertura AEAD, e o limitador por origem põe o teto nisso.
	esperada := sessao.Origem()
	if esperada == nil {
		s.avisarSemOrigem(ssrc, origem)
		return
	}

	opus, ok := sessao.Decifrar(pacote)
	if !ok {
		return // tag errada, sem chave ainda, cabeçalho impossível
	}
	if !mesmaOrigem(esperada, origem) {
		// Decifrou vindo de outro endereço: é o socket de mídia do cliente se
		// apresentando. Reamarra e avisa uma vez, porque é uma informação que
		// muda a vida de quem depurar isto depois.
		s.avisarTrocaDeOrigem(ssrc, esperada, origem)
		sessao.FixarOrigem(origem)
	}
	s.filaDe(ssrc, sessao).Enfileirar(opus)
}

// responderDescoberta amarra `ssrc → endereço` e devolve os 74 bytes com o
// endereço **como nós o vimos** — é o NAT do bot que a descoberta revela
// (§D5.4).
func (s *ServidorUDP) responderDescoberta(pacote []byte, origem *net.UDPAddr) {
	ssrc, ok := LerPedidoDeDescoberta(pacote)
	if !ok {
		return
	}
	sessao, ok := s.registro.PorSSRC(ssrc)
	if !ok {
		// **Não** respondemos: o SSRC é atribuído por nós no READY, e responder
		// a um desconhecido daria a qualquer um na internet um refletor de 74
		// bytes. Mas **registramos**, uma vez por origem — porque essa é a
		// única maneira de o dono confirmar que a 7883/udp chegou até aqui.
		//
		// O §12 do documento manda "verificar com `nc -u` antes de culpar o
		// código", e um `nc -u` de fora **nunca** recebe resposta, justamente
		// por causa do parágrafo acima. Sem esta linha, a checagem de firewall
		// que o documento prescreve simplesmente não existe: silêncio de porta
		// fechada e silêncio de porta aberta seriam idênticos.
		s.avisarDescobertaSemSessao(ssrc, origem)
		return
	}
	// Já amarrada a outro endereço: só o primeiro vale, senão qualquer um na
	// internet sequestraria a sessão com um pacote de 74 bytes.
	if anterior := sessao.Origem(); anterior != nil && !mesmaOrigem(anterior, origem) {
		return
	}
	sessao.FixarOrigem(origem)

	resposta := MontarRespostaDeDescoberta(ssrc, origem.IP.String(), uint16(origem.Port))
	if _, err := s.conexao.WriteToUDP(resposta, origem); err != nil {
		s.log.Warn("ponte-voz: falha ao responder a descoberta de IP",
			"ssrc", ssrc, "origem", origem.String(), "erro", err)
		return
	}
	s.log.Info("ponte-voz: descoberta de IP respondida",
		"ssrc", ssrc, "endereco", origem.IP.String(), "porta", origem.Port)
}

// filaDe devolve (criando na primeira vez) a fila de jitter da sessão.
func (s *ServidorUDP) filaDe(ssrc uint32, sessao SessaoDeVoz) *FilaDeQuadros {
	s.mu.Lock()
	defer s.mu.Unlock()
	if fila, existe := s.filas[ssrc]; existe {
		return fila
	}
	fila := NovaFila(sessao.Publicar)
	s.filas[ssrc] = fila
	return fila
}

// avisarSemOrigem loga **uma vez por SSRC** que chegou RTP antes da descoberta
// de IP. É o único caso de descarte que merece log: significa um cliente que
// pulou a descoberta, e sem esta linha seria silêncio sem causa.
// avisarDescobertaSemSessao registra, **uma vez por IP de origem**, um pedido
// de descoberta cujo SSRC não é de sessão nenhuma.
//
// Uma vez por IP, e não por SSRC: quem está testando o firewall manda sempre o
// mesmo SSRC, e quem está varrendo a porta manda um diferente a cada pacote —
// a chave por IP serve aos dois casos e é limitada pelo mesmo balde de fichas
// que já protege o resto do laço.
func (s *ServidorUDP) avisarDescobertaSemSessao(ssrc uint32, origem *net.UDPAddr) {
	chave := origem.IP.String()
	s.mu.Lock()
	novo := !s.avisouDescoberta[chave]
	s.avisouDescoberta[chave] = true
	s.mu.Unlock()
	if novo {
		s.log.Info("ponte-voz: descoberta de IP com SSRC desconhecido; ignorada "+
			"(se você está conferindo o firewall, esta linha é a confirmação de que o pacote chegou)",
			"ssrc", ssrc, "origem", origem.String())
	}
}

// avisarTrocaDeOrigem registra, uma vez por SSRC, que a mídia chegou de um
// endereço diferente do da descoberta — e decifrou.
//
// É o caso do Lavalink (dois sockets), e é uma linha que vale ouro para quem
// for depurar áudio que não sai: diz que o pacote chegou, que a chave está
// certa, e que o par IP:porta mudou.
func (s *ServidorUDP) avisarTrocaDeOrigem(ssrc uint32, antes, agora *net.UDPAddr) {
	s.mu.Lock()
	novo := !s.avisouTroca[ssrc]
	s.avisouTroca[ssrc] = true
	s.mu.Unlock()
	if novo {
		s.log.Info("ponte-voz: a mídia veio de outro endereço e decifrou; reamarrando "+
			"(é o que o Lavalink faz: descoberta num socket, mídia em outro)",
			"ssrc", ssrc, "descoberta", antes.String(), "midia", agora.String())
	}
}

func (s *ServidorUDP) avisarSemOrigem(ssrc uint32, origem *net.UDPAddr) {
	s.mu.Lock()
	novo := !s.avisouSemOrigem[ssrc]
	s.avisouSemOrigem[ssrc] = true
	s.mu.Unlock()
	if novo {
		s.log.Warn("ponte-voz: RTP antes da descoberta de IP; descartando",
			"ssrc", ssrc, "origem", origem.String())
	}
}

// dump é a rede de segurança do risco nº 1 (§5 do CONTRATO-F2.md): os
// primeiros pacotes de cada sessão em hexdump, com os dois tamanhos de
// cabeçalho calculados ao lado.
func (s *ServidorUDP) dump(ssrc uint32, pacote []byte, origem *net.UDPAddr) {
	if !s.cfg.DumpPacote {
		return
	}
	s.mu.Lock()
	n := s.dumps[ssrc]
	if n < PacotesDoDump {
		s.dumps[ssrc] = n + 1
	}
	s.mu.Unlock()
	if n >= PacotesDoDump {
		return
	}
	preambulo, _ := TamanhoDoCabecalhoRTP(pacote)
	comCorpo, _ := TamanhoDoCabecalhoComExtensao(pacote)
	s.log.Info("ponte-voz: dump de pacote",
		"ssrc", ssrc,
		"origem", origem.String(),
		"bytes", len(pacote),
		"extensao", TemExtensao(pacote),
		"cabecalho_preambulo", preambulo,
		"cabecalho_com_extensao", comCorpo,
		"hex", hex.EncodeToString(pacote))
}

// varrer é o faxineiro: filas de sessões que morreram e baldes de origens que
// pararam de mandar. Sem ele, uma sessão que cai deixa a goroutine de drenagem
// viva até o processo terminar.
func (s *ServidorUDP) varrer(ctx context.Context, parou <-chan struct{}) {
	tique := time.NewTicker(IntervaloDaVarredura)
	defer tique.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-parou:
			return
		case <-tique.C:
			s.mu.Lock()
			for ssrc, fila := range s.filas {
				if _, viva := s.registro.PorSSRC(ssrc); !viva {
					fila.Fechar()
					delete(s.filas, ssrc)
					delete(s.avisouSemOrigem, ssrc)
					delete(s.dumps, ssrc)
				}
			}
			s.mu.Unlock()
			s.limitador.varrer()
		}
	}
}

// Porta é a porta local de verdade, útil quando o teste pede `:0`.
func (s *ServidorUDP) Porta() int {
	if s == nil || s.conexao == nil {
		return 0
	}
	if endereco, ok := s.conexao.LocalAddr().(*net.UDPAddr); ok {
		return endereco.Port
	}
	return 0
}

// Fechar derruba o socket. Idempotente.
func (s *ServidorUDP) Fechar() error {
	var err error
	s.fecharUmaVez.Do(func() {
		err = s.conexao.Close()
		s.mu.Lock()
		for ssrc, fila := range s.filas {
			fila.Fechar()
			delete(s.filas, ssrc)
		}
		s.mu.Unlock()
	})
	return err
}

// mesmaOrigem compara endereço e porta. `net.UDPAddr.String()` seria mais
// curto, mas compara também a zona do IPv6 e aloca a cada pacote.
func mesmaOrigem(a, b *net.UDPAddr) bool {
	if a == nil || b == nil {
		return false
	}
	return a.Port == b.Port && a.IP.Equal(b.IP)
}

// ── fila de jitter ───────────────────────────────────────────

// FilaDeQuadros é a rede de segurança contra rajada (§12 F2, "Jitter").
//
// O `WriteSample` com `Duration: 20ms` deixa o pion cuidar do relógio; se o
// UDP chegar em rajada, a mídia acumula e o atraso cresce sem nunca voltar.
// A fila tem teto de `TetoDaFila` quadros (200 ms) e, cheia, **descarta o mais
// antigo** — atraso é pior que buraco numa música.
//
// Uma fila por sessão, criada por quem consome a sessão no laço de UDP; a
// goroutine de drenagem chama `SessaoDeVoz.Publicar`.
type FilaDeQuadros struct {
	quadros chan []byte
	fechada chan struct{}
	// mu torna o "descarta o mais antigo e põe o novo" um gesto só quando há
	// mais de um produtor. No caminho de produção só o laço de UDP enfileira.
	mu sync.Mutex

	fecharUmaVez sync.Once
	descartados  atomic.Uint64
	publicados   atomic.Uint64
}

// NovaFila cria a fila e sobe a goroutine que drena para `publicar`.
func NovaFila(publicar func(opus []byte)) *FilaDeQuadros {
	f := &FilaDeQuadros{
		quadros: make(chan []byte, TetoDaFila),
		fechada: make(chan struct{}),
	}
	go func() {
		for {
			select {
			case <-f.fechada:
				return
			case quadro := <-f.quadros:
				if publicar != nil {
					publicar(quadro)
				}
				f.publicados.Add(1)
			}
		}
	}()
	return f
}

// Enfileirar põe um quadro na fila; devolve `false` quando teve de descartar
// um quadro velho para caber (o chamador só usa isso para contar no log).
func (f *FilaDeQuadros) Enfileirar(opus []byte) bool {
	select {
	case f.quadros <- opus:
		return true
	default:
	}

	f.mu.Lock()
	select {
	case <-f.quadros: // o mais antigo sai
	default:
	}
	select {
	case f.quadros <- opus:
	default: // outro produtor encheu no meio: o quadro novo é que se perde
	}
	f.mu.Unlock()

	f.descartados.Add(1)
	return false
}

// Descartados e Publicados são para o log e para o teste — o contrato não os
// exige, e ninguém decide nada com eles no caminho quente.
func (f *FilaDeQuadros) Descartados() uint64 { return f.descartados.Load() }
func (f *FilaDeQuadros) Publicados() uint64  { return f.publicados.Load() }

// Fechar encerra a goroutine de drenagem. Idempotente.
func (f *FilaDeQuadros) Fechar() {
	f.fecharUmaVez.Do(func() { close(f.fechada) })
}

// ── limitador de pacotes por origem ──────────────────────────

// limitadorDeOrigem é um balde de fichas por IP de origem. Existe porque a
// porta é pública: sem ele, um refletor de 74 bytes e um laço de decifragem
// ficam à disposição de qualquer um (§D5.4).
type limitadorDeOrigem struct {
	mu     sync.Mutex
	baldes map[string]*baldeDeFichas
	limite float64
	teto   int
	agora  func() time.Time // injetável no teste
}

type baldeDeFichas struct {
	fichas float64
	ultimo time.Time
}

func novoLimitadorDeOrigem(limite, teto int) *limitadorDeOrigem {
	return &limitadorDeOrigem{
		baldes: make(map[string]*baldeDeFichas),
		limite: float64(limite),
		teto:   teto,
		agora:  time.Now,
	}
}

// permitir gasta uma ficha do balde da origem. Chave é o **IP**, não IP:porta.
func (l *limitadorDeOrigem) permitir(origem *net.UDPAddr) bool {
	if origem == nil {
		return false
	}
	chave := origem.IP.String()

	l.mu.Lock()
	defer l.mu.Unlock()

	agora := l.agora()
	balde, existe := l.baldes[chave]
	if !existe {
		if len(l.baldes) >= l.teto {
			l.expirarSemTrava(agora)
		}
		if len(l.baldes) >= l.teto {
			return false // mapa cheio de origens vivas: nega o desconhecido
		}
		balde = &baldeDeFichas{fichas: l.limite, ultimo: agora}
		l.baldes[chave] = balde
	}

	// Reposição contínua: `limite` fichas por segundo, com o próprio limite de
	// teto (uma rajada nunca vale mais que um segundo de crédito).
	balde.fichas += agora.Sub(balde.ultimo).Seconds() * l.limite
	if balde.fichas > l.limite {
		balde.fichas = l.limite
	}
	balde.ultimo = agora

	if balde.fichas < 1 {
		return false
	}
	balde.fichas--
	return true
}

// varrer joga fora os baldes parados há mais de `OciosidadeDaOrigem`.
func (l *limitadorDeOrigem) varrer() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.expirarSemTrava(l.agora())
}

func (l *limitadorDeOrigem) expirarSemTrava(agora time.Time) {
	for chave, balde := range l.baldes {
		if agora.Sub(balde.ultimo) > OciosidadeDaOrigem {
			delete(l.baldes, chave)
		}
	}
}
