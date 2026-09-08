package main

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

// NovoCifrador constrói o cifrador de um modo com a `secret_key` de 32 bytes
// que nós sorteamos (`crypto/rand`) e mandamos no `SESSION_DESCRIPTION`.
//
// Erro quando a chave não tem 32 bytes ou o modo é desconhecido — os dois
// casos são defeito nosso, não do cliente, e é melhor falhar alto no
// `SELECT_PROTOCOL` do que decifrar lixo para sempre.
func NovoCifrador(modo Modo, chave []byte) (Cifrador, error) {
	panic("F2 lote A1: NovoCifrador não implementado")
}

// SortearChave gera a `secret_key` de 32 bytes do `SESSION_DESCRIPTION`
// (`crypto/rand`). Mora aqui, e não no gateway, porque é a única linha de
// criptografia que o lote A2 precisaria escrever.
func SortearChave() ([]byte, error) {
	panic("F2 lote A1: SortearChave não implementado")
}
