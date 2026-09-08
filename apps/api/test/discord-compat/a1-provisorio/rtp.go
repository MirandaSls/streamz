package main

// PROVISÓRIO — ver `LEIA-ME.md` deste diretório. Não é o lote A1.

import "encoding/binary"

func TamanhoDoCabecalhoRTP(pacote []byte) (int, bool) {
	if len(pacote) < 12 {
		return 0, false
	}
	if pacote[0]>>6 != 2 {
		return 0, false
	}
	tamanho := 12 + 4*int(pacote[0]&0x0F)
	if TemExtensao(pacote) {
		tamanho += 4 // só o preâmbulo: profile (2) + tamanho (2)
	}
	if len(pacote) < tamanho {
		return 0, false
	}
	return tamanho, true
}

func TemExtensao(pacote []byte) bool {
	return len(pacote) >= 1 && pacote[0]&0x10 != 0
}

func TamanhoDoCabecalhoComExtensao(pacote []byte) (int, bool) {
	if !TemExtensao(pacote) {
		return 0, false
	}
	base := 12 + 4*int(pacote[0]&0x0F)
	if len(pacote) < base+4 {
		return 0, false
	}
	palavras := int(binary.BigEndian.Uint16(pacote[base+2 : base+4]))
	tamanho := base + 4 + 4*palavras
	if len(pacote) < tamanho {
		return 0, false
	}
	return tamanho, true
}

func EhPedidoDeDescoberta(pacote []byte) bool {
	return len(pacote) == TamanhoDaDescoberta &&
		binary.BigEndian.Uint16(pacote[0:2]) == DescobertaPedido
}

func LerPedidoDeDescoberta(pacote []byte) (uint32, bool) {
	if !EhPedidoDeDescoberta(pacote) {
		return 0, false
	}
	return binary.BigEndian.Uint32(pacote[4:8]), true
}

func MontarRespostaDeDescoberta(ssrc uint32, endereco string, porta uint16) []byte {
	resposta := make([]byte, TamanhoDaDescoberta)
	binary.BigEndian.PutUint16(resposta[0:2], DescobertaResposta)
	binary.BigEndian.PutUint16(resposta[2:4], 70)
	binary.BigEndian.PutUint32(resposta[4:8], ssrc)
	copy(resposta[8:71], endereco) // 64 bytes com NUL no fim
	binary.BigEndian.PutUint16(resposta[72:74], porta)
	return resposta
}

func SSRCDoPacote(pacote []byte) (uint32, bool) {
	if len(pacote) < 12 {
		return 0, false
	}
	return binary.BigEndian.Uint32(pacote[8:12]), true
}
