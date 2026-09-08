package main

// PROVISÓRIO — ver `LEIA-ME.md` deste diretório. Não é o lote A1; existe só
// para o degrau 3 do lote A2 ter uma ponte que decifra de verdade.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"fmt"

	"golang.org/x/crypto/chacha20poly1305"
)

type cifradorAeadProvisorio struct {
	aead           cipher.AEAD
	tamanhoDoNonce int
}

func NovoCifrador(modo Modo, chave []byte) (Cifrador, error) {
	if len(chave) != 32 {
		return nil, fmt.Errorf("a secret_key tem %d bytes, precisa de 32", len(chave))
	}
	switch modo {
	case ModoAesGcm:
		bloco, err := aes.NewCipher(chave)
		if err != nil {
			return nil, err
		}
		aead, err := cipher.NewGCM(bloco)
		if err != nil {
			return nil, err
		}
		return &cifradorAeadProvisorio{aead: aead, tamanhoDoNonce: 12}, nil
	case ModoXChaCha:
		aead, err := chacha20poly1305.NewX(chave)
		if err != nil {
			return nil, err
		}
		return &cifradorAeadProvisorio{aead: aead, tamanhoDoNonce: 24}, nil
	default:
		return nil, fmt.Errorf("modo desconhecido: %s", modo)
	}
}

func SortearChave() ([]byte, error) {
	chave := make([]byte, 32)
	if _, err := rand.Read(chave); err != nil {
		return nil, err
	}
	return chave, nil
}

// Decifrar: `[cabeçalho][cifrado+tag][nonce de 4 bytes]`, com o nonce estendido
// com zeros até o tamanho que o AEAD quer (§D5.3).
func (c *cifradorAeadProvisorio) Decifrar(pacote []byte) ([]byte, bool) {
	if len(pacote) < 12+16+4 {
		return nil, false
	}
	nonce := make([]byte, c.tamanhoDoNonce)
	copy(nonce, pacote[len(pacote)-4:])
	corpo := pacote[:len(pacote)-4]

	if cabecalho, ok := TamanhoDoCabecalhoRTP(pacote); ok && cabecalho <= len(corpo) {
		if opus, err := c.aead.Open(nil, nonce, corpo[cabecalho:], corpo[:cabecalho]); err == nil {
			return opus, true
		}
	}
	// O caminho de recuperação do §5 do CONTRATO-F2.md: talvez o corpo da
	// extensão entre no AAD.
	if TemExtensao(pacote) {
		if cabecalho, ok := TamanhoDoCabecalhoComExtensao(pacote); ok && cabecalho <= len(corpo) {
			if opus, err := c.aead.Open(nil, nonce, corpo[cabecalho:], corpo[:cabecalho]); err == nil {
				return opus, true
			}
		}
	}
	return nil, false
}

func (c *cifradorAeadProvisorio) Cifrar(cabecalho []byte, opus []byte, contador uint32) []byte {
	sufixo := make([]byte, 4)
	binary.BigEndian.PutUint32(sufixo, contador)
	nonce := make([]byte, c.tamanhoDoNonce)
	copy(nonce, sufixo)

	pacote := append([]byte{}, cabecalho...)
	pacote = c.aead.Seal(pacote, nonce, opus, cabecalho)
	return append(pacote, sufixo...)
}
