# Referências do Discord para o Streamz

Coletadas em 2026-09-11, só de fontes públicas: nada foi feito logado e nenhum
formulário foi enviado. São 3.129 imagens únicas, cerca de 3 GB. Estão versionadas
no repositório a pedido do usuário, para todo agente do plano de paridade
(`docs/PLANO-PARIDADE-DISCORD.md`) tê-las na worktree. São **referência interna,
nunca asset do produto**: o `.dockerignore` as tira do build das imagens, e nada
em `apps/` pode importar daqui.

## Por onde começar

- **`index.html`**: galeria com filtros por fonte, plataforma, grupo e tela, e
  busca por texto. Abre direto no navegador.
- **`COBERTURA.md`**: matriz tela × plataforma, com as lacunas.
- **`tokens/VARIAVEIS.md`**: cores, tipografia, raios e sombras do cliente atual,
  com o refresh visual de 2025, nos temas escuro, claro, darker e midnight.
- **`LINKS.md`**: o que não dava para baixar (Mobbin, kits do Figma, Page Flows…).
- **`TELAS.md`**: o checklist de telas usado para classificar tudo.

## Fontes

| Pasta | O que é | Imagens |
|---|---|---:|
| `suporte/` | Todos os 512 artigos da central de ajuda (support.discord.com) | 2.361 |
| `blog/` | 132 posts do blog com UI: redesign mobile de 2023, refresh do desktop de 2025, features | 480 |
| `desenvolvedores/` | Imagens da doc oficial de API: bots, componentes v2, atividades, OAuth2 | 143 |
| `publico/` | Capturas próprias das páginas públicas (login, registro, convite, descoberta, nitro) em desktop, iPhone e Pixel | 89 |
| `lojas/` | Screenshots oficiais da App Store, do Google Play e da Microsoft Store, mais o histórico do Wayback | 56 |

Cada pasta tem um `manifesto.json`, com a origem e o contexto de cada imagem, e um
`README.md` com as lacunas daquela fonte. O `catalogo.json` junta tudo num
formato só.

## Cuidado ao usar

- **Classificação automática no suporte.** As telas da central de ajuda foram
  rotuladas por palavra-chave e a plataforma pelo formato da imagem (retrato conta
  como celular, paisagem como desktop). Um card alto do desktop pode aparecer como
  mobile. A galeria mostra quando é inferido.
- **Datas.** Parte do material mostra UI antiga, de antes do refresh de 2025. Veja
  o campo de data na galeria.
- **Nomes dos temas.** Ash, Onyx e Dark foram deduzidos das classes CSS; ver
  `tokens/README.md`.
- **Pontos fracos:** web mobile (o Discord mal funciona no navegador do celular),
  Android específico e configurações do canal (convites e integrações).

## Refazer

Os scripts ficam em `ferramentas/` e rodam de dentro dela (`npm i` instala o
`playwright-core`, que usa o Chrome instalado):

```bash
node suporte-coletar.mjs     # central de ajuda (abre o Chrome fora da tela: o headless leva 403)
node publico-capturar.mjs    # capturas das páginas públicas
node publico-tokens.mjs && node publico-tokens-md.mjs   # tokens de CSS
node consolidar.mjs          # catálogo, cobertura e galeria
```
