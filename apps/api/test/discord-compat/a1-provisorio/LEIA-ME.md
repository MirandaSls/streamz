# `a1-provisorio` — cripto + UDP de mentira, só para o degrau 3

**Estes três arquivos não são o lote A1 e não entram em `apps/ponte-voz/`.**

O degrau 3 (`prova-voz-degrau3.sh`) precisa de uma ponte que responda à
descoberta de IP e decifre RTP de verdade — senão o `@discordjs/voice` nunca
manda um quadro e o risco nº 2 do §15 ("o payloader de Opus do pion aceita
quadros reais?") continua sem medida. Quando a prova foi escrita, o lote A1
ainda dava `panic` em `cripto.go`, `rtp.go` e `udp.go` na branch `feat/bots-f2`.

Então o script faz assim: copia `apps/ponte-voz/` para uma árvore temporária e,
**se e só se** os arquivos de lá ainda tiverem `panic("F2 lote A1`, sobrepõe
estes três por cima antes de compilar a imagem da prova. Depois que o lote A1
entrar na branch de integração, a condição fica falsa sozinha e a prova passa a
rodar contra o código de verdade — que é o ponto.

O que há aqui é o mínimo para o degrau 3 andar, escrito contra o §D5.3 e o §D5.4
do documento e o §5 do `CONTRATO-F2.md`:

- `cripto.go` — os dois modos AEAD com o nonce de 4 bytes no sufixo e o caminho
  de recuperação da extensão.
- `rtp.go` — tamanho de cabeçalho, descoberta de IP, SSRC.
- `udp.go` — o laço de leitura e a fila com teto.

Não tem os vetores gravados, não tem teste, não tem limite de pacotes por
origem, não conta nada. **O lote A1 é que vale.**
