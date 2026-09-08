package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"log/slog"
	"sync/atomic"

	"golang.org/x/crypto/chacha20poly1305"
)

// ── Lote A1 (cripto + UDP) preenche. ──
//
// Os dois modos AEAD do §D5.3, e só eles. É onde a F2 vive ou morre (§15,
// risco nº 1): um nonce fora de lugar dá silêncio absoluto sem uma linha de
// log. O teste de vetor gravado (`cripto_test.go`) é o **primeiro commit** do
// lote, antes de qualquer socket.
//
// O que não pode ser esquecido, cada um já foi um dia inteiro de alguém:
//
//   - O nonce são os **4 últimos bytes do pacote** e sai antes de decifrar.
//   - AES-256-GCM: IV de 12 bytes = os 4 bytes do sufixo **seguidos de 8
//     zeros** (os 4 primeiro, resto zero).
//   - XChaCha20-Poly1305: nonce de 24 bytes = os 4 bytes **seguidos de 20
//     zeros**.
//   - AAD = `TamanhoDoCabecalhoRTP(pacote)` bytes do começo (`rtp.go`).
//   - A tag de 16 bytes fica junto do ciphertext (é o que `cipher.AEAD.Open`
//     espera), entre o payload e o nonce: `[cabeçalho][cifrado+tag][nonce]`.

// TamanhoDaChave é a `secret_key` do `SESSION_DESCRIPTION`: 32 bytes nos dois
// modos (AES-256 e XChaCha20 querem a mesma coisa).
const TamanhoDaChave = 32

// LeituraDoAad é qual das duas interpretações do `_rtpsize` decifrou um pacote
// **com extensão** (§5 do CONTRATO-F2.md). Num pacote sem o bit X as duas
// coincidem e nada é anotado.
type LeituraDoAad int32

const (
	// LeituraIndefinida: nenhum pacote com extensão decifrou ainda nesta
	// sessão.
	LeituraIndefinida LeituraDoAad = 0
	// LeituraPreambulo é a nossa primeira aposta: só `profile`+`tamanho`
	// entram no AAD e o corpo da extensão vai cifrado.
	LeituraPreambulo LeituraDoAad = 1
	// LeituraCorpoDaExtensao é a alternativa: a extensão inteira entra no AAD.
	LeituraCorpoDaExtensao LeituraDoAad = 2
)

func (l LeituraDoAad) String() string {
	switch l {
	case LeituraPreambulo:
		return "preambulo"
	case LeituraCorpoDaExtensao:
		return "corpo-da-extensao"
	default:
		return "indefinida"
	}
}

// cifradorAead serve os dois modos: a única diferença entre eles é o tamanho
// do nonce (12 contra 24) e ambos são `cipher.AEAD` com tag de 16 bytes. O
// zero-padding do sufixo de 4 bytes até o tamanho do nonce é o mesmo gesto nos
// dois — daí um tipo só.
type cifradorAead struct {
	aead cipher.AEAD
	modo Modo
	// leitura guarda, por sessão (um cifrador nasce por `SELECT_PROTOCOL`),
	// qual interpretação do AAD com extensão venceu. Também serve de ordem das
	// tentativas: quem venceu uma vez é tentado primeiro nas próximas.
	leitura atomic.Int32
}

var _ Cifrador = (*cifradorAead)(nil)

// NovoCifrador constrói o cifrador de um modo com a `secret_key` de 32 bytes
// que nós sorteamos (`crypto/rand`) e mandamos no `SESSION_DESCRIPTION`.
//
// Erro quando a chave não tem 32 bytes ou o modo é desconhecido — os dois
// casos são defeito nosso, não do cliente, e é melhor falhar alto no
// `SELECT_PROTOCOL` do que decifrar lixo para sempre.
func NovoCifrador(modo Modo, chave []byte) (Cifrador, error) {
	if len(chave) != TamanhoDaChave {
		return nil, fmt.Errorf("ponte-voz: secret_key tem %d bytes, esperados %d", len(chave), TamanhoDaChave)
	}
	switch modo {
	case ModoAesGcm:
		bloco, err := aes.NewCipher(chave)
		if err != nil {
			return nil, fmt.Errorf("ponte-voz: aes-256: %w", err)
		}
		gcm, err := cipher.NewGCM(bloco)
		if err != nil {
			return nil, fmt.Errorf("ponte-voz: aes-256-gcm: %w", err)
		}
		return &cifradorAead{aead: gcm, modo: modo}, nil
	case ModoXChaCha:
		aead, err := chacha20poly1305.NewX(chave)
		if err != nil {
			return nil, fmt.Errorf("ponte-voz: xchacha20-poly1305: %w", err)
		}
		return &cifradorAead{aead: aead, modo: modo}, nil
	default:
		return nil, fmt.Errorf("ponte-voz: modo de criptografia desconhecido: %q", string(modo))
	}
}

// SortearChave gera a `secret_key` de 32 bytes do `SESSION_DESCRIPTION`
// (`crypto/rand`). Mora aqui, e não no gateway, porque é a única linha de
// criptografia que o lote A2 precisaria escrever.
func SortearChave() ([]byte, error) {
	chave := make([]byte, TamanhoDaChave)
	if _, err := rand.Read(chave); err != nil {
		return nil, fmt.Errorf("ponte-voz: sortear secret_key: %w", err)
	}
	return chave, nil
}

// Decifrar recebe o **pacote RTP inteiro** e devolve o quadro Opus.
//
// Nunca dá `panic` e nunca loga por pacote: isto roda em cima de bytes que
// vieram da internet, e uma porta UDP pública recebe lixo o dia inteiro.
//
// Num pacote com o bit X, se a primeira leitura do AAD falhar, tenta a
// alternativa (corpo da extensão dentro do AAD) e **anota, uma vez por sessão,
// qual venceu** — §5 do CONTRATO-F2.md.
func (c *cifradorAead) Decifrar(pacote []byte) ([]byte, bool) {
	preambulo, valido := TamanhoDoCabecalhoRTP(pacote)
	if !valido {
		return nil, false
	}
	if !TemExtensao(pacote) {
		// Sem o bit X as duas leituras são o mesmo número: uma tentativa só.
		return c.abrir(pacote, preambulo)
	}

	comCorpo, temCorpo := TamanhoDoCabecalhoComExtensao(pacote)

	// A leitura que já venceu nesta sessão é sempre a primeira tentativa: o
	// caminho de recuperação não pode custar uma abertura AEAD jogada fora a
	// cada 20 ms pelo resto da música.
	tentativas := [2]LeituraDoAad{LeituraPreambulo, LeituraCorpoDaExtensao}
	if LeituraDoAad(c.leitura.Load()) == LeituraCorpoDaExtensao {
		tentativas = [2]LeituraDoAad{LeituraCorpoDaExtensao, LeituraPreambulo}
	}

	for _, leitura := range tentativas {
		cabecalho := preambulo
		if leitura == LeituraCorpoDaExtensao {
			if !temCorpo || comCorpo == preambulo {
				continue // extensão de corpo vazio: as duas leituras coincidem
			}
			cabecalho = comCorpo
		}
		if opus, ok := c.abrir(pacote, cabecalho); ok {
			c.anotarLeitura(leitura, cabecalho)
			return opus, true
		}
	}
	return nil, false
}

// abrir é a tentativa em si: nonce do sufixo, AAD de `cabecalho` bytes, e o
// resto (cifrado + tag) para o `Open`.
func (c *cifradorAead) abrir(pacote []byte, cabecalho int) ([]byte, bool) {
	fim := len(pacote) - TamanhoDoContador
	// Precisa caber pelo menos a tag; um payload de zero byte é legítimo.
	if fim < cabecalho+c.aead.Overhead() {
		return nil, false
	}
	nonce := make([]byte, c.aead.NonceSize())
	copy(nonce, pacote[fim:])
	opus, err := c.aead.Open(nil, nonce, pacote[cabecalho:fim], pacote[:cabecalho])
	if err != nil {
		return nil, false
	}
	return opus, true
}

// anotarLeitura registra **uma vez por sessão** qual interpretação do AAD
// venceu num pacote com extensão. É a medida que o §5 do CONTRATO-F2.md pede e
// que o degrau 4 vai ler no log.
func (c *cifradorAead) anotarLeitura(leitura LeituraDoAad, cabecalho int) {
	if c.leitura.CompareAndSwap(int32(LeituraIndefinida), int32(leitura)) {
		slog.Default().Info("ponte-voz: leitura do AAD com extensão RTP definida para a sessão",
			"leitura", leitura.String(),
			"cabecalho", cabecalho,
			"modo", string(c.modo),
			"primeira_aposta", leitura == LeituraPreambulo)
	}
}

// LeituraDoAad é o que `anotarLeitura` gravou: `LeituraIndefinida` enquanto
// nenhum pacote com extensão tiver decifrado. Não faz parte do `Cifrador` do
// `contrato.go` — existe para o teste e para quem for ler o §D5.3 depois do
// degrau 4.
func (c *cifradorAead) LeituraDoAad() LeituraDoAad {
	return LeituraDoAad(c.leitura.Load())
}

// Cifrar monta um pacote no mesmo layout. Existe para o teste de ida e volta
// do degrau 1 e para os vetores gravados; a ponte não cifra nada em produção.
//
// `cabecalho` entra inteiro como AAD e inteiro em claro no começo do pacote —
// é assim que o teste do caminho de recuperação produz a leitura alternativa:
// basta passar o cabeçalho **com** o corpo da extensão.
func (c *cifradorAead) Cifrar(cabecalho []byte, opus []byte, contador uint32) []byte {
	var sufixo [TamanhoDoContador]byte
	binary.BigEndian.PutUint32(sufixo[:], contador)

	nonce := make([]byte, c.aead.NonceSize())
	copy(nonce, sufixo[:])

	pacote := make([]byte, 0, len(cabecalho)+len(opus)+c.aead.Overhead()+TamanhoDoContador)
	pacote = append(pacote, cabecalho...)
	pacote = c.aead.Seal(pacote, nonce, opus, cabecalho)
	return append(pacote, sufixo[:]...)
}
