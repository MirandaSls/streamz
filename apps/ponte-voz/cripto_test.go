package main

import (
	"bytes"
	"encoding/hex"
	"testing"
)

// Degrau 1 do §6 do CONTRATO-F2.md: "se este teste não passar, nada adiante
// funciona". Tudo aqui é **vetor gravado** — as constantes abaixo estão
// escritas no arquivo, não geradas na hora, justamente para que uma mudança no
// nosso próprio código não mude o alvo junto com o tiro.
//
// Os vetores foram conferidos contra duas implementações independentes, que
// são exatamente as que os clientes usam:
//
//   - AES-256-GCM: `crypto.createCipheriv('aes-256-gcm', …)` do Node 22
//     (OpenSSL) — o caminho do `@discordjs/voice`.
//   - XChaCha20-Poly1305: `crypto_aead_xchacha20poly1305_ietf_encrypt` do
//     libsodium via PyNaCl — o caminho do discord.py.
//
// Os três pacotes de cada modo saíram **byte a byte iguais** nas duas.

const (
	// chaveDoVetor é a `secret_key` de 32 bytes dos vetores.
	chaveDoVetor = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

	// quadroDoVetor é o "quadro Opus" em claro (20 bytes; o primeiro byte,
	// `0xfc`, é um TOC de Opus plausível).
	quadroDoVetor = "fc0102030405060708090a0b0c0d0e0f10111213"

	// cabecalhoSimples: 0x80 (v2, sem extensão, CC=0), PT 0x78 (120),
	// seq 0x0001, timestamp 0x00000960, ssrc 0xdeadbeef. 12 bytes.
	cabecalhoSimples = "8078000100000960deadbeef"

	// cabecalhoComExtensao: o mesmo com o bit X ligado (0x90) + preâmbulo
	// `bede 0001` (profile one-byte, 1 palavra de extensão) + o corpo
	// `cafebabe`. 20 bytes no total; o preâmbulo termina no byte 16.
	cabecalhoComExtensao = "9078000100000960deadbeefbede0001cafebabe"

	// ── Os pacotes gravados ──
	//
	// `simples`: sem extensão, contador 1.
	// `extPreambulo`: com o bit X e o AAD **só até o preâmbulo** (16 bytes) —
	//   a nossa primeira aposta (§5 do CONTRATO-F2.md). Repare que os 4 bytes
	//   do corpo da extensão **não** aparecem em claro: eles são o começo do
	//   ciphertext, que é o que a leitura do documento implica.
	// `extCorpo`: com o bit X e o AAD até o fim do corpo (20 bytes) — a
	//   leitura alternativa, a que o caminho de recuperação tem que salvar.
	//   Aqui `cafebabe` aparece em claro no pacote.

	vetorGcmSimples      = "8078000100000960deadbeefb837cfa9085ff2af57356f9ba5b03b8f772edbd3f09d4e78d6db88014db55e948e169a9a00000001"
	vetorGcmExtPreambulo = "9078000100000960deadbeefbede0001507d58cd9605f02953490f87090c505f33009b2854bc950b70356ab8babdc23c038c1be900000002"
	vetorGcmExtCorpo     = "9078000100000960deadbeefbede0001cafebabe42a7179fbf9e2c2f3841c76b2073c6d45e447f27451a80b35e62f304073d93999c604c0600000003"

	vetorXChaChaSimples      = "8078000100000960deadbeeff5a653236b0597d8c6eead9fc83da01c300ad56845e38fa62a70501d2f39ffdd448681bb00000001"
	vetorXChaChaExtPreambulo = "9078000100000960deadbeefbede0001eeb63497ad1f97b66821be6cfbe721932c365f1ae6c70cacd26bdbc72a5d8ae63577f94a00000002"
	vetorXChaChaExtCorpo     = "9078000100000960deadbeefbede0001cafebabe94c6f134c41a3e4a2ae8ed9b1d8858a68e326bc00d224cd99c9f5846f43100a718ade83c00000003"
)

func bytesDeHex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatalf("hex inválido no vetor: %v", err)
	}
	return b
}

func cifradorDoVetor(t *testing.T, modo Modo) *cifradorAead {
	t.Helper()
	c, err := NovoCifrador(modo, bytesDeHex(t, chaveDoVetor))
	if err != nil {
		t.Fatalf("NovoCifrador(%s): %v", modo, err)
	}
	return c.(*cifradorAead)
}

// TestCriptoVetorGravado é o degrau 1: o vetor gravado decifra e a nossa
// `Cifrar` reproduz **exatamente** os mesmos bytes nos dois modos.
func TestCriptoVetorGravado(t *testing.T) {
	quadro := bytesDeHex(t, quadroDoVetor)

	casos := []struct {
		nome      string
		modo      Modo
		pacote    string
		cabecalho string
		contador  uint32
	}{
		{"gcm/simples", ModoAesGcm, vetorGcmSimples, cabecalhoSimples, 1},
		{"gcm/ext-preambulo", ModoAesGcm, vetorGcmExtPreambulo, cabecalhoComExtensao[:32], 2},
		{"gcm/ext-corpo", ModoAesGcm, vetorGcmExtCorpo, cabecalhoComExtensao, 3},
		{"xchacha/simples", ModoXChaCha, vetorXChaChaSimples, cabecalhoSimples, 1},
		{"xchacha/ext-preambulo", ModoXChaCha, vetorXChaChaExtPreambulo, cabecalhoComExtensao[:32], 2},
		{"xchacha/ext-corpo", ModoXChaCha, vetorXChaChaExtCorpo, cabecalhoComExtensao, 3},
	}

	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			c := cifradorDoVetor(t, caso.modo)
			pacote := bytesDeHex(t, caso.pacote)

			// Ida: decifrar o pacote gravado devolve o quadro em claro.
			opus, ok := c.Decifrar(pacote)
			if !ok {
				t.Fatalf("o vetor gravado não decifrou — é o defeito nº 1 da fase")
			}
			if !bytes.Equal(opus, quadro) {
				t.Fatalf("quadro decifrado = %x, esperado %x", opus, quadro)
			}

			// Volta: cifrar de novo dá o mesmo pacote, byte a byte.
			refeito := c.Cifrar(bytesDeHex(t, caso.cabecalho), quadro, caso.contador)
			if !bytes.Equal(refeito, pacote) {
				t.Fatalf("Cifrar não reproduziu o vetor:\n  saiu  %x\n  vetor %x", refeito, pacote)
			}
		})
	}
}

// TestCriptoIdaEVolta é a ida e volta com chave sorteada, nos dois modos e com
// tamanhos de quadro que um Lavalink real produz.
func TestCriptoIdaEVolta(t *testing.T) {
	for _, modo := range []Modo{ModoAesGcm, ModoXChaCha} {
		chave, err := SortearChave()
		if err != nil {
			t.Fatalf("SortearChave: %v", err)
		}
		c, err := NovoCifrador(modo, chave)
		if err != nil {
			t.Fatalf("NovoCifrador(%s): %v", modo, err)
		}
		cabecalho := bytesDeHex(t, cabecalhoSimples)

		for _, tamanho := range []int{0, 1, 160, 320, 960} {
			quadro := make([]byte, tamanho)
			for i := range quadro {
				quadro[i] = byte(i * 7)
			}
			pacote := c.Cifrar(cabecalho, quadro, uint32(tamanho))
			opus, ok := c.Decifrar(pacote)
			if !ok {
				t.Fatalf("%s: quadro de %d bytes não decifrou", modo, tamanho)
			}
			if !bytes.Equal(opus, quadro) {
				t.Fatalf("%s: quadro de %d bytes voltou diferente", modo, tamanho)
			}
		}
	}
}

// TestCriptoAadComPreambulo prova a nossa primeira aposta: num pacote `0x90`,
// o AAD vai só até o preâmbulo da extensão e o corpo dela é ciphertext.
func TestCriptoAadComPreambulo(t *testing.T) {
	for _, caso := range []struct {
		modo   Modo
		pacote string
	}{
		{ModoAesGcm, vetorGcmExtPreambulo},
		{ModoXChaCha, vetorXChaChaExtPreambulo},
	} {
		c := cifradorDoVetor(t, caso.modo)
		pacote := bytesDeHex(t, caso.pacote)

		if !TemExtensao(pacote) {
			t.Fatalf("%s: o vetor deveria ter o bit X ligado", caso.modo)
		}
		if tamanho, ok := TamanhoDoCabecalhoRTP(pacote); !ok || tamanho != 16 {
			t.Fatalf("%s: cabeçalho com preâmbulo = %d,%v; esperado 16,true", caso.modo, tamanho, ok)
		}
		if _, ok := c.Decifrar(pacote); !ok {
			t.Fatalf("%s: pacote com extensão não decifrou pela leitura do preâmbulo", caso.modo)
		}
		if c.LeituraDoAad() != LeituraPreambulo {
			t.Fatalf("%s: leitura anotada = %s, esperada preambulo", caso.modo, c.LeituraDoAad())
		}
	}
}

// TestCriptoCaminhoDeRecuperacao é o §5 do CONTRATO-F2.md: um pacote cifrado
// pela interpretação **alternativa** (corpo da extensão dentro do AAD) tem que
// decifrar assim mesmo, e a sessão tem que anotar qual venceu.
func TestCriptoCaminhoDeRecuperacao(t *testing.T) {
	for _, caso := range []struct {
		modo   Modo
		pacote string
	}{
		{ModoAesGcm, vetorGcmExtCorpo},
		{ModoXChaCha, vetorXChaChaExtCorpo},
	} {
		c := cifradorDoVetor(t, caso.modo)
		pacote := bytesDeHex(t, caso.pacote)
		quadro := bytesDeHex(t, quadroDoVetor)

		// A primeira aposta tem que falhar neste pacote — se ela passasse, o
		// teste não estaria provando nada.
		if _, ok := c.abrir(pacote, 16); ok {
			t.Fatalf("%s: a leitura do preâmbulo não deveria abrir este pacote", caso.modo)
		}

		opus, ok := c.Decifrar(pacote)
		if !ok {
			t.Fatalf("%s: o caminho de recuperação não salvou o pacote", caso.modo)
		}
		if !bytes.Equal(opus, quadro) {
			t.Fatalf("%s: quadro recuperado = %x", caso.modo, opus)
		}
		if c.LeituraDoAad() != LeituraCorpoDaExtensao {
			t.Fatalf("%s: leitura anotada = %s, esperada corpo-da-extensao", caso.modo, c.LeituraDoAad())
		}

		// E, anotada a leitura, os pacotes seguintes continuam decifrando (a
		// ordem das tentativas inverte, o resultado não muda).
		if _, ok := c.Decifrar(pacote); !ok {
			t.Fatalf("%s: segundo pacote falhou depois de anotar a leitura", caso.modo)
		}
	}
}

// TestCriptoLeituraNaoTrocaNoMeio: anotada uma leitura, um pacote da outra
// interpretação ainda decifra — quem manda é a tag, não a anotação.
func TestCriptoLeituraNaoTrocaNoMeio(t *testing.T) {
	c := cifradorDoVetor(t, ModoAesGcm)

	if _, ok := c.Decifrar(bytesDeHex(t, vetorGcmExtCorpo)); !ok {
		t.Fatal("vetor ext-corpo não decifrou")
	}
	if c.LeituraDoAad() != LeituraCorpoDaExtensao {
		t.Fatalf("leitura = %s", c.LeituraDoAad())
	}
	if _, ok := c.Decifrar(bytesDeHex(t, vetorGcmExtPreambulo)); !ok {
		t.Fatal("vetor ext-preambulo deixou de decifrar depois da anotação")
	}
	// A anotação é do que venceu **primeiro** e não muda mais: é ela que o
	// degrau 4 vai ler no log.
	if c.LeituraDoAad() != LeituraCorpoDaExtensao {
		t.Fatalf("a anotação mudou no meio da sessão: %s", c.LeituraDoAad())
	}
}

// TestCriptoNuncaEntraEmPanico: isto roda em cima de bytes que vieram da
// internet. Pacote curto, cabeçalho impossível, tag trocada, nonce trocado —
// tudo devolve `false` e ninguém morre.
func TestCriptoNuncaEntraEmPanico(t *testing.T) {
	quadro := bytesDeHex(t, quadroDoVetor)

	for _, modo := range []Modo{ModoAesGcm, ModoXChaCha} {
		c := cifradorDoVetor(t, modo)
		bom := bytesDeHex(t, vetorGcmSimples)
		if modo == ModoXChaCha {
			bom = bytesDeHex(t, vetorXChaChaSimples)
		}

		lixos := map[string][]byte{
			"nil":                      nil,
			"vazio":                    {},
			"um byte":                  {0x80},
			"só o cabeçalho":           bom[:12],
			"cabeçalho + 3 bytes":      bom[:15],
			"sem espaço para a tag":    bom[:12+15+4],
			"versão 0":                 append([]byte{0x00}, bom[1:]...),
			"versão 1":                 append([]byte{0x40}, bom[1:]...),
			"CC=15 sem CSRC":           append([]byte{0x8f}, bom[1:]...),
			"bit X sem preâmbulo":      append([]byte{0x90}, bom[1:13]...),
			"extensão gigante":         bytesDeHex(t, "9078000100000960deadbeefbedeffff00000001"),
			"tudo zero":                make([]byte, 74),
			"cabeçalho maior que tudo": {0x8f, 0x78, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0},
		}
		// Tag corrompida, nonce corrompido, payload corrompido: cada um sozinho.
		for nome, i := range map[string]int{"tag corrompida": len(bom) - 5, "nonce corrompido": len(bom) - 1, "payload corrompido": 13} {
			corrompido := append([]byte(nil), bom...)
			corrompido[i] ^= 0xff
			lixos[nome] = corrompido
		}

		for nome, lixo := range lixos {
			opus, ok := func() (o []byte, k bool) {
				defer func() {
					if r := recover(); r != nil {
						t.Fatalf("%s/%s: Decifrar entrou em pânico: %v", modo, nome, r)
					}
				}()
				return c.Decifrar(lixo)
			}()
			if ok {
				t.Fatalf("%s/%s: lixo decifrou (%x)", modo, nome, opus)
			}
		}

		// E o pacote bom continua bom depois de todo esse lixo.
		opus, ok := c.Decifrar(bom)
		if !ok || !bytes.Equal(opus, quadro) {
			t.Fatalf("%s: o pacote válido parou de decifrar depois do lixo", modo)
		}
	}
}

// TestNovoCifradorRecusa: chave do tamanho errado e modo desconhecido falham
// alto, no `SELECT_PROTOCOL`, e não em silêncio a cada pacote.
func TestNovoCifradorRecusa(t *testing.T) {
	for _, tamanho := range []int{0, 16, 31, 33, 64} {
		if _, err := NovoCifrador(ModoAesGcm, make([]byte, tamanho)); err == nil {
			t.Fatalf("chave de %d bytes foi aceita", tamanho)
		}
	}
	if _, err := NovoCifrador(Modo("xsalsa20_poly1305"), make([]byte, 32)); err == nil {
		t.Fatal("modo desligado pelo Discord em 2024 foi aceito")
	}
	if _, err := NovoCifrador(Modo(""), make([]byte, 32)); err == nil {
		t.Fatal("modo vazio foi aceito")
	}
}

// TestModoSuportado guarda o `READY.modes` e a mensagem de erro do §D5.8.
func TestModoSuportado(t *testing.T) {
	for _, nome := range ModosAnunciados {
		if _, ok := ModoSuportado(nome); !ok {
			t.Fatalf("anunciamos %q no READY e não o suportamos", nome)
		}
	}
	if _, ok := ModoSuportado("xsalsa20_poly1305_lite_rtpsize"); ok {
		t.Fatal("modo desligado pelo Discord foi aceito")
	}
}

// TestSortearChave: 32 bytes e nunca duas iguais.
func TestSortearChave(t *testing.T) {
	primeira, err := SortearChave()
	if err != nil {
		t.Fatalf("SortearChave: %v", err)
	}
	if len(primeira) != TamanhoDaChave {
		t.Fatalf("chave com %d bytes, esperados %d", len(primeira), TamanhoDaChave)
	}
	segunda, err := SortearChave()
	if err != nil {
		t.Fatalf("SortearChave: %v", err)
	}
	if bytes.Equal(primeira, segunda) {
		t.Fatal("duas chaves sorteadas saíram iguais — o crypto/rand não está sendo usado")
	}
}
