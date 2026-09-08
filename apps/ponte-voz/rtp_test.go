package main

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"strings"
	"testing"
)

// TestTamanhoDoCabecalhoRTP é a conta do §D5.3: 12 + 4×CC + 4 se o bit X.
func TestTamanhoDoCabecalhoRTP(t *testing.T) {
	casos := []struct {
		nome    string
		pacote  string
		tamanho int
		valido  bool
	}{
		{"0x80 puro", "8078000100000960deadbeef", 12, true},
		{"0x80 com payload", "8078000100000960deadbeef" + strings.Repeat("aa", 40), 12, true},
		{"CC=1", "8178000100000960deadbeef11111111", 16, true},
		{"CC=2", "8278000100000960deadbeef1111111122222222", 20, true},
		{"0x90 (bit X)", "9078000100000960deadbeefbede0001cafebabe", 16, true},
		{"0x91 (bit X + CC=1)", "9178000100000960deadbeef11111111bede0001cafebabe", 20, true},
		{"vazio", "", 0, false},
		{"11 bytes", "8078000100000960deadbe", 0, false},
		{"versão 0", "0078000100000960deadbeef", 0, false},
		{"versão 1", "4078000100000960deadbeef", 0, false},
		{"versão 3", "c078000100000960deadbeef", 0, false},
		{"CC=1 sem o CSRC", "8178000100000960deadbeef", 0, false},
		{"bit X sem o preâmbulo", "9078000100000960deadbeef", 0, false},
	}

	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			pacote, err := hex.DecodeString(caso.pacote)
			if err != nil {
				t.Fatalf("hex inválido: %v", err)
			}
			tamanho, valido := TamanhoDoCabecalhoRTP(pacote)
			if valido != caso.valido || tamanho != caso.tamanho {
				t.Fatalf("= %d,%v; esperado %d,%v", tamanho, valido, caso.tamanho, caso.valido)
			}
		})
	}
}

func TestTemExtensao(t *testing.T) {
	casos := map[string]bool{
		"":                                       false,
		"80":                                     false,
		"8078000100000960deadbeef":               false,
		"9078000100000960deadbeefbede0001":       true,
		"9178000100000960deadbeef11111111bede00": true,
		"90":                                     true,
	}
	for entrada, esperado := range casos {
		pacote, _ := hex.DecodeString(entrada)
		if TemExtensao(pacote) != esperado {
			t.Fatalf("TemExtensao(%q) = %v, esperado %v", entrada, !esperado, esperado)
		}
	}
}

// TestTamanhoDoCabecalhoComExtensao: a leitura alternativa do §5, onde o
// `tamanho` do preâmbulo conta **palavras de 32 bits**.
func TestTamanhoDoCabecalhoComExtensao(t *testing.T) {
	casos := []struct {
		nome    string
		pacote  string
		tamanho int
		valido  bool
	}{
		{"1 palavra", "9078000100000960deadbeefbede0001cafebabe", 20, true},
		{"2 palavras", "9078000100000960deadbeefbede0002cafebabedeadc0de", 24, true},
		{"0 palavras", "9078000100000960deadbeefbede0000", 16, true},
		{"CC=1 e 1 palavra", "9178000100000960deadbeef11111111bede0001cafebabe", 24, true},
		{"sem bit X", "8078000100000960deadbeef", 0, false},
		{"palavras demais para o pacote", "9078000100000960deadbeefbede0009cafebabe", 0, false},
		{"tamanho 0xffff", "9078000100000960deadbeefbedeffffcafebabe", 0, false},
	}
	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			pacote, err := hex.DecodeString(caso.pacote)
			if err != nil {
				t.Fatalf("hex inválido: %v", err)
			}
			tamanho, valido := TamanhoDoCabecalhoComExtensao(pacote)
			if valido != caso.valido || tamanho != caso.tamanho {
				t.Fatalf("= %d,%v; esperado %d,%v", tamanho, valido, caso.tamanho, caso.valido)
			}
		})
	}
}

func TestSSRCDoPacote(t *testing.T) {
	pacote, _ := hex.DecodeString("8078000100000960deadbeef")
	ssrc, ok := SSRCDoPacote(pacote)
	if !ok || ssrc != 0xdeadbeef {
		t.Fatalf("= %#x,%v; esperado 0xdeadbeef,true", ssrc, ok)
	}
	if _, ok := SSRCDoPacote(pacote[:11]); ok {
		t.Fatal("pacote curto devolveu SSRC")
	}
	curto, _ := hex.DecodeString("0078000100000960deadbeef")
	if _, ok := SSRCDoPacote(curto); ok {
		t.Fatal("pacote de versão 0 devolveu SSRC")
	}
}

// pedidoDeDescoberta monta os 74 bytes que um cliente manda (§D5.4).
func pedidoDeDescoberta(ssrc uint32) []byte {
	pedido := make([]byte, TamanhoDaDescoberta)
	binary.BigEndian.PutUint16(pedido[0:2], DescobertaPedido)
	binary.BigEndian.PutUint16(pedido[2:4], TamanhoDaDescoberta-4)
	binary.BigEndian.PutUint32(pedido[4:8], ssrc)
	return pedido
}

func TestDescobertaPedido(t *testing.T) {
	pedido := pedidoDeDescoberta(0x00000007)

	if !EhPedidoDeDescoberta(pedido) {
		t.Fatal("o pedido de 74 bytes não foi reconhecido")
	}
	ssrc, ok := LerPedidoDeDescoberta(pedido)
	if !ok || ssrc != 7 {
		t.Fatalf("SSRC do pedido = %d,%v; esperado 7,true", ssrc, ok)
	}

	// Um pacote RTP nunca é confundido com um pedido: versão 2 põe 0x80/0x90
	// no primeiro byte, e o tipo do pedido é 0x0001.
	rtp, _ := hex.DecodeString("8078000100000960deadbeef" + strings.Repeat("aa", 80))
	if EhPedidoDeDescoberta(rtp) {
		t.Fatal("um pacote RTP foi lido como pedido de descoberta")
	}
	if EhPedidoDeDescoberta(pedido[:73]) {
		t.Fatal("um pedido curto foi aceito")
	}
	resposta := MontarRespostaDeDescoberta(7, "1.2.3.4", 50000)
	if EhPedidoDeDescoberta(resposta) {
		t.Fatal("a nossa própria resposta foi lida como pedido (laço de reflexão)")
	}
	if _, ok := LerPedidoDeDescoberta(nil); ok {
		t.Fatal("nil foi lido como pedido")
	}
}

// TestMontarRespostaDeDescoberta confere o layout byte a byte do §D5.4.
func TestMontarRespostaDeDescoberta(t *testing.T) {
	resposta := MontarRespostaDeDescoberta(0x00000007, "143.95.161.17", 54321)

	if len(resposta) != TamanhoDaDescoberta {
		t.Fatalf("resposta com %d bytes, esperados %d", len(resposta), TamanhoDaDescoberta)
	}
	if tipo := binary.BigEndian.Uint16(resposta[0:2]); tipo != DescobertaResposta {
		t.Fatalf("tipo = %#04x, esperado %#04x", tipo, DescobertaResposta)
	}
	if tamanho := binary.BigEndian.Uint16(resposta[2:4]); tamanho != 70 {
		t.Fatalf("tamanho = %d, esperado 70", tamanho)
	}
	if ssrc := binary.BigEndian.Uint32(resposta[4:8]); ssrc != 7 {
		t.Fatalf("ssrc = %d, esperado 7", ssrc)
	}
	fim := bytes.IndexByte(resposta[8:72], 0)
	if fim < 0 {
		t.Fatal("o endereço não terminou em NUL")
	}
	if endereco := string(resposta[8 : 8+fim]); endereco != "143.95.161.17" {
		t.Fatalf("endereço = %q", endereco)
	}
	if porta := binary.BigEndian.Uint16(resposta[72:74]); porta != 54321 {
		t.Fatalf("porta = %d, esperada 54321", porta)
	}

	// Endereço absurdo (não acontece, mas a porta é pública): trunca em 63 e
	// deixa o NUL, em vez de escrever fora do buffer.
	grande := MontarRespostaDeDescoberta(1, strings.Repeat("z", 200), 1)
	if len(grande) != TamanhoDaDescoberta {
		t.Fatalf("resposta truncada com %d bytes", len(grande))
	}
	if grande[71] != 0 {
		t.Fatal("o endereço truncado comeu o NUL final")
	}
}
