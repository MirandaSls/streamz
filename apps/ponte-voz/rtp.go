package main

import "encoding/binary"

// ── Lote A1 (cripto + UDP) preenche. ──
//
// RTP e o pacote de descoberta de IP: só leitura de bytes, sem estado e sem
// rede. É o arquivo mais fácil de testar e o que mais decide se a fase
// funciona (§12 F2, risco nº 1 e nº 2).

const (
	// TamanhoFixoDoCabecalhoRTP são os 12 bytes que todo pacote RTP tem antes
	// da lista de CSRC: V/P/X/CC, M/PT, seq, timestamp, ssrc.
	TamanhoFixoDoCabecalhoRTP = 12

	// TamanhoDoPreambuloDeExtensao é `profile` (2 bytes) + `tamanho` (2
	// bytes). O corpo vem depois e é o que a leitura alternativa do `_rtpsize`
	// disputa (ver "O `_rtpsize` e a extensão" no CONTRATO-F2.md).
	TamanhoDoPreambuloDeExtensao = 4

	// TamanhoDoContador é o nonce de 4 bytes colado no fim do pacote (§D5.3).
	TamanhoDoContador = 4

	// versaoRTP é o único valor válido nos dois bits altos do primeiro byte.
	versaoRTP = 2

	// bitDeExtensao é o bit X do primeiro byte (`0x90` em vez de `0x80`).
	bitDeExtensao = 0x10

	// mascaraDeCSRC é o nibble baixo do primeiro byte: quantos CSRC vêm depois
	// do cabeçalho fixo.
	mascaraDeCSRC = 0x0f
)

// TamanhoDoCabecalhoRTP devolve quantos bytes do começo do pacote são
// **cabeçalho em claro** — que é exatamente o AAD do layout `_rtpsize`.
//
// A conta (regra do SRTP, §D5.3):
//
//	12                      cabeçalho fixo
//	+ 4 × CC                lista de CSRC (nibble baixo do primeiro byte)
//	+ 4  se o bit X estiver ligado (primeiro byte `0x90`): o **preâmbulo** da
//	     extensão (profile de 2 bytes + tamanho de 2 bytes)
//
// O **corpo** da extensão fica do lado cifrado. Esta é a leitura que o
// documento afirma e que **ninguém mediu contra um cliente real** — ver
// "O `_rtpsize` e a extensão" no CONTRATO-F2.md: se o degrau 4 mostrar o
// contrário, quem muda é esta função e mais nada.
//
// `false` quando o pacote é curto demais para o cabeçalho que ele mesmo
// declara, ou quando a versão RTP não é 2.
func TamanhoDoCabecalhoRTP(pacote []byte) (int, bool) {
	if len(pacote) < TamanhoFixoDoCabecalhoRTP {
		return 0, false
	}
	if pacote[0]>>6 != versaoRTP {
		return 0, false
	}
	tamanho := TamanhoFixoDoCabecalhoRTP + 4*int(pacote[0]&mascaraDeCSRC)
	if pacote[0]&bitDeExtensao != 0 {
		tamanho += TamanhoDoPreambuloDeExtensao
	}
	// Um cabeçalho maior que o próprio pacote é lixo da internet, não um
	// pacote nosso: quem chamou trata como pacote inválido, sem log.
	if len(pacote) < tamanho {
		return 0, false
	}
	return tamanho, true
}

// TemExtensao diz se o bit X do primeiro byte está ligado (`0x90` em vez de
// `0x80`). Existe separado porque o caminho de recuperação do `Decifrar`
// precisa saber se vale a pena tentar o AAD alternativo.
func TemExtensao(pacote []byte) bool {
	return len(pacote) > 0 && pacote[0]&bitDeExtensao != 0
}

// TamanhoDoCabecalhoComExtensao é a leitura **alternativa** do `_rtpsize`: o
// corpo da extensão também entra no AAD, e o cifrado começa depois dele.
//
// Não é a nossa primeira aposta; é a segunda tentativa do `Decifrar` quando a
// primeira falha num pacote com extensão. Custa cinco linhas e tira da mesa o
// risco que mataria a fase inteira em silêncio.
//
// O campo `tamanho` do preâmbulo conta **palavras de 32 bits** (RFC 3550
// §5.3.1), não bytes — errar isso é o mesmo silêncio de errar o nonce.
func TamanhoDoCabecalhoComExtensao(pacote []byte) (int, bool) {
	preambulo, ok := TamanhoDoCabecalhoRTP(pacote)
	if !ok || !TemExtensao(pacote) {
		return 0, false
	}
	// Os dois bytes imediatamente antes do fim do preâmbulo são o `tamanho`.
	palavras := int(binary.BigEndian.Uint16(pacote[preambulo-2 : preambulo]))
	tamanho := preambulo + 4*palavras
	if len(pacote) < tamanho {
		return 0, false
	}
	return tamanho, true
}

// EhPedidoDeDescoberta reconhece o pacote de 74 bytes de descoberta de IP
// (tipo `0x0001` no offset 0, §D5.4). Todo pacote que não for isto é RTP.
//
// O discriminador de verdade é o tipo: um pacote RTP de versão 2 sempre começa
// com `0x80`/`0x90`, nunca com `0x00`. Aceitamos um pedido **maior** que 74
// bytes (alguma implementação que encha o resto) porque a alternativa —
// deixá-lo cair no caminho de RTP e ser descartado em silêncio — é exatamente
// o modo de falha calado que a fase inteira está tentando evitar. A resposta
// continua sendo de 74 bytes, então não há amplificação.
func EhPedidoDeDescoberta(pacote []byte) bool {
	return len(pacote) >= TamanhoDaDescoberta &&
		binary.BigEndian.Uint16(pacote[0:2]) == DescobertaPedido
}

// LerPedidoDeDescoberta tira o SSRC (offset 4-7, big-endian) do pedido.
func LerPedidoDeDescoberta(pacote []byte) (ssrc uint32, ok bool) {
	if !EhPedidoDeDescoberta(pacote) {
		return 0, false
	}
	return binary.BigEndian.Uint32(pacote[4:8]), true
}

// MontarRespostaDeDescoberta monta os 74 bytes da resposta (§D5.4):
//
//	0-1   uint16 BE  0x0002
//	2-3   uint16 BE  70
//	4-7   uint32 BE  ssrc
//	8-71  string terminada em NUL, 64 bytes  — o endereço
//	72-73 uint16 BE  porta
//
// `endereco` e `porta` são o que **nós** vimos no `ReadFromUDP`, não o que o
// cliente disse: é justamente o NAT dele que a descoberta existe para revelar.
func MontarRespostaDeDescoberta(ssrc uint32, endereco string, porta uint16) []byte {
	resposta := make([]byte, TamanhoDaDescoberta)
	binary.BigEndian.PutUint16(resposta[0:2], DescobertaResposta)
	// O campo `tamanho` conta o que vem **depois** dele: 74 - 4 = 70.
	binary.BigEndian.PutUint16(resposta[2:4], TamanhoDaDescoberta-4)
	binary.BigEndian.PutUint32(resposta[4:8], ssrc)
	// 64 bytes para o endereço, e o último tem que sobrar para o NUL: um IPv6
	// com zona ainda cabe folgado em 63, mas truncar em silêncio é melhor que
	// escrever fora do buffer.
	if len(endereco) > 63 {
		endereco = endereco[:63]
	}
	copy(resposta[8:72], endereco)
	binary.BigEndian.PutUint16(resposta[72:74], porta)
	return resposta
}

// SSRCDoPacote lê o SSRC de um pacote RTP (offset 8-11, big-endian). É por ele
// que a porta única acha a sessão (§D5.4).
func SSRCDoPacote(pacote []byte) (uint32, bool) {
	if len(pacote) < TamanhoFixoDoCabecalhoRTP {
		return 0, false
	}
	if pacote[0]>>6 != versaoRTP {
		return 0, false
	}
	return binary.BigEndian.Uint32(pacote[8:12]), true
}
