package main

// ── Lote A1 (cripto + UDP) preenche. ──
//
// RTP e o pacote de descoberta de IP: só leitura de bytes, sem estado e sem
// rede. É o arquivo mais fácil de testar e o que mais decide se a fase
// funciona (§12 F2, risco nº 1 e nº 2).

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
	panic("F2 lote A1: TamanhoDoCabecalhoRTP não implementado")
}

// TemExtensao diz se o bit X do primeiro byte está ligado (`0x90` em vez de
// `0x80`). Existe separado porque o caminho de recuperação do `Decifrar`
// precisa saber se vale a pena tentar o AAD alternativo.
func TemExtensao(pacote []byte) bool {
	panic("F2 lote A1: TemExtensao não implementado")
}

// TamanhoDoCabecalhoComExtensao é a leitura **alternativa** do `_rtpsize`: o
// corpo da extensão também entra no AAD, e o cifrado começa depois dele.
//
// Não é a nossa primeira aposta; é a segunda tentativa do `Decifrar` quando a
// primeira falha num pacote com extensão. Custa cinco linhas e tira da mesa o
// risco que mataria a fase inteira em silêncio.
func TamanhoDoCabecalhoComExtensao(pacote []byte) (int, bool) {
	panic("F2 lote A1: TamanhoDoCabecalhoComExtensao não implementado")
}

// EhPedidoDeDescoberta reconhece o pacote de 74 bytes de descoberta de IP
// (tipo `0x0001` no offset 0, §D5.4). Todo pacote que não for isto é RTP.
func EhPedidoDeDescoberta(pacote []byte) bool {
	panic("F2 lote A1: EhPedidoDeDescoberta não implementado")
}

// LerPedidoDeDescoberta tira o SSRC (offset 4-7, big-endian) do pedido.
func LerPedidoDeDescoberta(pacote []byte) (ssrc uint32, ok bool) {
	panic("F2 lote A1: LerPedidoDeDescoberta não implementado")
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
	panic("F2 lote A1: MontarRespostaDeDescoberta não implementado")
}

// SSRCDoPacote lê o SSRC de um pacote RTP (offset 8-11, big-endian). É por ele
// que a porta única acha a sessão (§D5.4).
func SSRCDoPacote(pacote []byte) (uint32, bool) {
	panic("F2 lote A1: SSRCDoPacote não implementado")
}
