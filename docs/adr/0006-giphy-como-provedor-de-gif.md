# ADR-0006: Giphy como provedor de busca de GIF

**Status:** Aceita (2026-08-28)
**Data:** 2026-08-28
**Decisores:** Arthur Miranda
**Escopo afetado:** `apps/api/src/modules/media/gifs.service.ts`,
`apps/api/src/modules/uploads/uploads.service.ts`,
`apps/web/components/media/GifPicker.tsx`, `packages/shared/src/index.ts`,
`.env.example`

## Contexto

A busca de GIF do composer nasceu em cima do Tenor v2 (`TENOR_API_KEY`). **A API
do Tenor foi descontinuada** — é o único motivo desta ADR: não há trade-off a
resolver, há um fornecedor a substituir.

O que o produto precisa do provedor é curto e está no contrato
(`GifResult`/`GifCategory` em `packages/shared`): busca por termo, "em alta" sem
termo, categorias sugeridas, uma miniatura e uma URL de envio. O contrato **não
menciona provedor**, o que reduz a troca a um service e a uma allowlist de host.

Vale dizer o que *não* está em jogo: o GIF escolhido nunca passa pelo nosso
storage (`POST /uploads/external` guarda só a URL), então trocar de provedor não
migra dado nenhum — mensagens antigas seguem apontando para o `media.tenor.com`
que já está publicado, e continuam carregando enquanto aquele CDN servir.

## Opções consideradas

### A. Giphy (API v1)

**A favor:** cobre os quatro endpoints que usamos com o mesmo formato
(`/search`, `/trending`, `/categories`), chave gratuita, e é o provedor que o
próprio comando `/giphy` do composer já anunciava ao usuário.
**Contra:** os termos exigem **atribuição visível** ("Powered by GIPHY") na
superfície que mostra os resultados — dívida de interface que o Tenor não
cobrava. E a chave gratuita tem cota diária, com rate limit por chave, não por
usuário: quem gasta é o servidor.

### B. Klipy / outros agregadores

**A favor:** sem exigência de selo, e alguns oferecem cota maior.
**Contra:** catálogo menor e menos previsível em português, e nenhum deles tem
`/categories` pronto — a grade de categorias do seletor teria de virar lista
fixa nossa, que é justamente o que o código evita hoje.

### C. Índice próprio de GIFs

**Contra:** custo de storage e de curadoria por um recurso que é enfeite do
composer. Descartada sem discussão.

## Decisão

**Opção A.** `GifsService` passa a falar com `https://api.giphy.com/v1/gifs`,
lendo `GIPHY_API_KEY`. A chave segue **opcional**, como R2 e LiveKit: sem ela as
rotas respondem `configured: false` e o seletor mostra o aviso neutro em vez de
erro — nada no app quebra por falta de GIF.

Três detalhes que a troca obrigou a decidir:

- **Rating.** O Tenor filtrava com `contentfilter=medium`. O Giphy devolve o
  rating pedido *e os abaixo dele*, então `rating=pg` reproduz o mesmo recorte
  (G + PG). Não é equivalência exata — são curadorias diferentes —, mas é o
  degrau mais próximo.
- **Miniatura estática de verdade.** O cartão da grade só anima no hover, e o
  `tinygif` do Tenor era animado: a economia existia no papel, não na tela. O
  Giphy expõe `fixed_width_still`, então agora a grade em repouso é realmente
  quadro parado.
- **Allowlist de host.** `hostDeGifPermitido` passa a aceitar `giphy.com` e
  subdomínios, porque a API sorteia o CDN entre `media0..4`. A trava continua
  sendo a mesma coisa que era: sem ela, `POST /uploads/external` viraria um jeito
  de fazer qualquer URL — inclusive de rede interna — passar por anexo validado.

## Consequências

**Positivas**
- O contrato compartilhado não mudou uma linha: web e desktop não souberam da
  troca.
- Grade em repouso ficou mais leve (quadro parado no lugar de GIF pequeno
  animado).

**Negativas**
- **Atribuição obrigatória** no seletor. Entrou como texto ("Powered by GIPHY");
  os termos do Giphy pedem o selo oficial, que é imagem — falta trocar.
- Cota por chave: se a busca de GIF virar uso pesado, o limite é do servidor
  inteiro, não de quem buscou. O cache de 10 min por termo em `GifsService`
  ameniza, não resolve.
- URLs de GIF já enviadas continuam apontando para o `media.tenor.com`. Não há
  como reescrevê-las, e elas quebram no dia em que aquele CDN sair do ar.

## Quando reabrir

Se a cota gratuita do Giphy apertar, ou se a exigência de selo conflitar com a
interface. O caminho da próxima troca é o mesmo desta: reescrever `GifsService`
para o novo formato e ajustar `HOSTS_DE_GIF`. O contrato não entra na conta.
