// Vocabulário da ponte de voz: as formas que atravessam os lotes A1 e A2.
//
// Este arquivo é **o contrato entre o lote A1 (cripto + UDP) e o lote A2 (WS +
// LiveKit)** da F2, escrito pelo coordenador antes de os lotes começarem.
// **Ninguém o edita durante a fase** — mudar uma assinatura aqui quebra as duas
// branches ao mesmo tempo. Quem precisar de um campo novo relata no PR, não
// acrescenta (a mesma regra do `tipos.ts` da F1).
//
// Tudo em `package main`, num diretório plano: a ponte é um binário só, com
// sete arquivos, e um pacote a mais só serviria para escrever `ponte.` na
// frente de cada nome.
//
// Ver `apps/ponte-voz/CONTRATO-F2.md` e
// `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §8 (D5.1 a D5.8).
package main

import (
	"net"
	"time"
)

// ── configuração ─────────────────────────────────────────────

// ConfigDaPonte é lida do ambiente uma vez, no `main.go` (A2), e passada por
// valor para quem precisa. Nada lê `os.Getenv` fora do `main.go`: o teste
// precisa poder montar uma config na mão.
type ConfigDaPonte struct {
	// PortaWs é onde o voice gateway escuta HTTP/WS. O Traefik fala com ela
	// por dentro da rede do compose (§D5.5).
	PortaWs int
	// PortaUdp é a porta de mídia, publicada **direta** no host — o Traefik
	// não faz UDP (§D5.5).
	PortaUdp int
	// IpPublico é o que vai no `READY.ip` e na resposta da descoberta de IP.
	// É um IP, nunca um hostname: o cliente manda RTP para ele sem resolver
	// nada (§D5.4).
	IpPublico string
	// Segredo valida (HS256) o JWT que a API assinou e que chega no
	// `IDENTIFY.token` (§ "O JWT" do CONTRATO-F2.md).
	Segredo string
	// ApiInternaUrl é a base da API dentro da rede do compose
	// (`http://api:3333`), para avisar que uma sessão caiu (§D5.7).
	ApiInternaUrl string
	// DumpPacote liga o modo `--dump-pacote`: os primeiros pacotes de cada
	// sessão saem em hexdump no log. É a rede de segurança do risco nº 1 da
	// fase (§12 F2).
	DumpPacote bool
}

// ── criptografia (A1 implementa em cripto.go) ────────────────

// Modo é um dos dois modos AEAD que anunciamos no `READY.modes`. São os dois
// que existem hoje: os `xsalsa20_poly1305*` foram desligados pelo Discord em
// 18/11/2024 (§D5.3).
type Modo string

const (
	// ModoAesGcm é o preferido quando o cliente o oferece — é o que o
	// `@discordjs/voice` escolhe.
	ModoAesGcm Modo = "aead_aes256_gcm_rtpsize"
	// ModoXChaCha é obrigatório: a doc do Discord promete que ele sempre
	// estará na lista, e alguns bots Python só têm ele (o PyNaCl não expõe
	// AES-GCM).
	ModoXChaCha Modo = "aead_xchacha20_poly1305_rtpsize"
)

// ModosAnunciados é o `READY.modes`, **nesta ordem** (§D5.3).
var ModosAnunciados = []string{string(ModoAesGcm), string(ModoXChaCha)}

// ModoSuportado converte o que veio no `SELECT_PROTOCOL.data.mode`.
//
// Falso quando o cliente pede um modo que não temos — e aí a mensagem de log
// tem que dizer o nome recebido, porque a causa quase sempre é um Lavalink
// velho ainda pedindo `xsalsa20_poly1305` (§D5.8, risco 4).
//
// A1 implementa em `cripto.go`.
func ModoSuportado(nome string) (Modo, bool) {
	switch Modo(nome) {
	case ModoAesGcm:
		return ModoAesGcm, true
	case ModoXChaCha:
		return ModoXChaCha, true
	default:
		return "", false
	}
}

// Cifrador decifra (e, só nos testes, cifra) um pacote RTP no layout
// `_rtpsize`: cabeçalho em claro, payload cifrado, tag de 16 bytes, e o
// **nonce de 4 bytes como sufixo do pacote** (§D5.3).
//
// A1 implementa em `cripto.go`.
type Cifrador interface {
	// Decifrar recebe o **pacote RTP inteiro** (do primeiro byte ao último) e
	// devolve o quadro Opus. `false` quando a tag não bate, quando o pacote é
	// curto demais ou quando o cabeçalho é impossível — nunca um `panic`:
	// isto roda em cima de bytes que vieram da internet.
	Decifrar(pacote []byte) (opus []byte, ok bool)

	// Cifrar monta um pacote no mesmo layout. Existe para o teste de ida e
	// volta do degrau 1 e para os vetores gravados; a ponte não cifra nada em
	// produção (o áudio só sobe para o LiveKit, que tem o próprio SRTP).
	//
	// `cabecalho` é o cabeçalho RTP em claro já pronto (12 bytes, ou mais com
	// CSRC/extensão); `contador` é o nonce de 32 bits big-endian.
	Cifrar(cabecalho []byte, opus []byte, contador uint32) []byte
}

// A1 fornece, em `cripto.go`, a função que constrói o cifrador de um modo com
// a `secret_key` de 32 bytes que nós mesmos sorteamos e mandamos no
// `SESSION_DESCRIPTION` — e é por ela que A2 chega ao `Cifrador`:
//
//	func NovoCifrador(modo Modo, chave []byte) (Cifrador, error)
//
// Erro quando a chave não tem 32 bytes ou o modo é desconhecido. A assinatura
// não é declarada aqui de propósito: uma `var` de função obrigaria A1 a
// atribuir num `init()` em vez de escrever uma função normal.

// ── sessão (A2 implementa em sessao.go; A1 só consome) ───────

// SessaoDeVoz é **tudo** que o laço de UDP (A1) enxerga de uma sessão.
//
// É o encontro entre os dois lotes: A1 lê do socket, encontra a sessão pelo
// SSRC, chama `Decifrar` e entrega o quadro a `Publicar`. Quem constrói a
// sessão, guarda a `secret_key` e fala com o LiveKit é A2 — A1 nunca precisa
// saber que o LiveKit existe.
//
// O teste do lote A1 implementa esta interface com um duplo de dez linhas.
type SessaoDeVoz interface {
	// SSRC é o que **nós** atribuímos no `READY` (um contador por processo) e
	// por onde a multiplexação da porta única acontece (§D5.4).
	SSRC() uint32

	// Decifrar delega ao `Cifrador` que o `SELECT_PROTOCOL` definiu. Antes do
	// `SESSION_DESCRIPTION` não há chave: devolve `false` sem barulho.
	Decifrar(pacote []byte) (opus []byte, ok bool)

	// Publicar entrega um quadro Opus de 20 ms ao LiveKit
	// (`WriteSample`). Nunca bloqueia por muito tempo: a fila com teto é do
	// lado do chamador (A1), e uma sessão fechada descarta em silêncio.
	Publicar(opus []byte)

	// FixarOrigem amarra `ssrc → endereço de origem` no primeiro pacote de
	// descoberta. RTP que chegar de outro endereço com este SSRC é
	// descartado — é a superfície de ataque óbvia de uma porta UDP aberta.
	FixarOrigem(origem *net.UDPAddr)

	// Origem é o que `FixarOrigem` gravou, ou nil antes da descoberta.
	Origem() *net.UDPAddr

	// Viva é falso depois de a sessão fechar (WS caiu, `Fechar` chamado). O
	// laço de UDP usa para limpar o registro sem depender de callback.
	Viva() bool
}

// ── registro de sessões (escrito aqui; os dois lotes usam) ───

// TetoDaFila é o teto da fila de quadros por sessão, em quadros de 20 ms.
//
// Dez quadros são 200 ms (§12 F2, "Jitter"). Cheia, descarta-se o **mais
// antigo**: numa rajada de UDP o que importa é não acumular atraso, e um
// quadro velho já não tem para onde ir.
const TetoDaFila = 10

// DuracaoDoQuadro é o que vai no `media.Sample{Duration: …}`. Todo bot de
// música manda Opus de 20 ms a 48 kHz estéreo — é o que o Lavalink produz e o
// que o WebRTC quer (§D5).
const DuracaoDoQuadro = 20 * time.Millisecond

// TamanhoDaDescoberta é o pacote de descoberta de IP, nos dois sentidos
// (§D5.4).
const TamanhoDaDescoberta = 74

// Os dois tipos do pacote de descoberta (offset 0-1, uint16 big-endian).
const (
	DescobertaPedido   uint16 = 0x0001
	DescobertaResposta uint16 = 0x0002
)

// RegistroDeSessoes é onde as sessões vivas moram, indexadas por SSRC.
//
// Mora aqui, e não num dos lotes, porque os dois mexem nele: A2 registra e
// remove; A1 procura a cada pacote. São trinta linhas e uma trava — não vale
// uma fronteira.
//
// **A implementação é do coordenador** e está em `registro.go`.
type RegistroDeSessoes interface {
	// ProximoSSRC devolve o SSRC a anunciar no `READY`. Começa em 1 e nunca
	// repete no mesmo processo.
	ProximoSSRC() uint32
	Registrar(s SessaoDeVoz)
	PorSSRC(ssrc uint32) (SessaoDeVoz, bool)
	Remover(ssrc uint32)
	// Quantas sessões vivas — só para o log e para o teto de memória.
	Tamanho() int
}
