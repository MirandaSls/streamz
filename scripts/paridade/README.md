# Passeio de paridade (onda 0.7)

Ferramental do passeio do `docs/PLANO-PARIDADE-DISCORD.md` (§3, passos 4–5, e §4,
onda 0.7): uma **bancada isolada** desta worktree, uma **semente determinística**
com um servidor que tem de tudo, as **capturas** de cada tela do `telas.json`
(desktop 1920×1080 e celular 390×844) e a **folha lado a lado** (nosso × Discord).

| Arquivo | Faz |
|---|---|
| `bancada.sh` | sobe/desce Postgres + API + web em contêineres `paridade-*`, semeia, captura e gera a folha |
| `semente.mjs` | cria o servidor "Paridade" e o entorno pela API/gateway; grava `.claude/paridade/semente.json` |
| `capturar.mjs` | fotografa as telas: `<saída>/<plataforma>/<id>.png` + `resumo.json` |
| `folha.mjs` | `<saída>/folha/<plataforma>/<id>.png` (nosso à esquerda, até 2 referências à direita) + `index.html` |
| `telas.json` | a lista de telas (de outro cartão; não editar ids) |
| `referencias.json` | tela → imagens do catálogo (cartão 0.7c) |

## Rodar do zero

O host não tem node: tudo roda em docker. Da raiz da worktree:

```bash
scripts/paridade/bancada.sh subir      # Postgres, build (shared+api+web), API e web — ~5-10 min
scripts/paridade/bancada.sh semear     # recria o banco, semeia, guarda o modelo — ~2 min
scripts/paridade/bancada.sh capturar   # restaura o modelo e fotografa as 46 telas — ~10 min
scripts/paridade/bancada.sh folha --refs /opt/stack/streamz/.claude/worktrees/referencias
scripts/paridade/bancada.sh status
scripts/paridade/bancada.sh descer     # --limpar apaga o volume do banco; --limpar-tudo também os caches
```

Depois de integrar código novo: `subir` de novo (rebuilda e reinicia; o banco e
a semente ficam) e `capturar`. Semear de novo só quando o schema ou a semente
mudarem.

Variações úteis:

```bash
bancada.sh capturar --so canal-texto,m-chat           # só algumas telas (ids do telas.json)
bancada.sh capturar --plataforma celular
bancada.sh capturar --sem-relogio                     # descarta o relógio congelado como causa
bancada.sh capturar --sem-figurantes                  # sem presença/voz dos membros
bancada.sh capturar --sem-restaurar                   # não volta o banco ao modelo
bancada.sh capturar --listar                          # telas × passos definidos
bancada.sh folha --onda 2                             # só as telas da onda 2
bancada.sh subir --sem-build                          # só reinicia (confere se o .next é o da bancada)
bancada.sh logs api 300
SAIDA=/tmp/paridade bancada.sh capturar               # outra pasta de saída
```

Login da semente, para abrir a bancada por túnel SSH (`-L 43000:localhost:43000
-L 43333:localhost:43333`): `paridade` / `Paridade#2026` (as oito contas da
semente usam a mesma senha).

## A bancada

| Peça | Nome | Onde |
|---|---|---|
| Postgres 16 | `paridade-postgres` | `127.0.0.1:55432`, volume `paridade-pgdata`, bancos `paridade` e `paridade_semente` (o modelo) |
| API (Nest, `node dist/main.js`) | `paridade-api` | `127.0.0.1:43333`, aplica `prisma migrate deploy` ao subir |
| web (`next start`) | `paridade-web` | `127.0.0.1:43000` |
| build | `paridade-preparar` (transitório) | 4 GB / 4 CPUs, `node:22` na worktree montada |
| semente | `paridade-semente` (transitório) | rede `paridade-rede`, fala com `paridade-api:43333` |
| captura / folha | `paridade-captura`, `paridade-folha` | imagem `mcr.microsoft.com/playwright:v1.56.0-noble` |

Nada disso encosta na produção (`streamz-postgres/-api/-web`, portas 5432/3333/3000):
nomes, rede, volumes e portas são outros, e o script não usa `docker compose`.
Estado local em `.claude/paridade/` (ignorado pelo git): `segredos.env` e
`api.env` (JWT da bancada, gerados uma vez), `semente.json`, `web-build-id` e
`saida/`.

### Decisões

- **`next build` + `next start`, não `next dev`.** O dev compila rota a rota sob
  demanda e segura vários GB (o servidor já caiu por OOM); o build é o que vai
  para produção, e a primeira foto de cada tela não mede compilação. Custo: toda
  mudança de código pede `subir` de novo. O build passa `--no-lint` (lint é da
  verificação) mas **ainda faz o typecheck do Next** — árvore com erro de tipo
  não sobe. As `NEXT_PUBLIC_*` são embutidas no build apontando para
  `localhost:43333`; como a verificação do §3.2 escreve no mesmo `apps/web/.next`
  sem elas (e aí a web apontaria para `localhost:3333`, a produção), o `subir
  --sem-build` compara o `BUILD_ID` com o da bancada e rebuilda se mudou.
- **API como `node dist/main.js` num `node:22`, não a imagem do Dockerfile.** A
  imagem reinstalaria dependências a cada build; aqui o `node_modules` da
  worktree já está instalado (linux), e o que roda é exatamente a árvore da onda.
- **O navegador usa `--network host`** e vê a bancada em `localhost`: é origem
  segura (APIs que exigem contexto seguro funcionam), casa com o CORS e com o
  que foi embutido no build, e é a mesma URL de um túnel SSH. API, banco e
  semente conversam pela rede `paridade-rede`.
- **playwright-core 1.56.0 num volume** (`paridade-pw`). O da worktree é 1.62 e
  procuraria a revisão de Chromium dele, que a imagem 1.56 não tem. Se a
  instalação falhar (sem acesso ao npm), os scripts caem no da worktree e usam o
  Chromium que houver na imagem, com aviso.
- **Um contexto de navegador por tela, com login pela tela de login**: nada vaza
  de uma foto para a outra. `THROTTLE_DISABLED=1` na API é o que permite um
  login por foto (`apps/api/src/app.module.ts:63`).
- **O banco volta ao modelo antes de cada `capturar`** (`CREATE DATABASE …
  TEMPLATE paridade_semente`): abrir canal grava leitura, o modal de convite cria
  convite, a voz deixa estado. Sem restaurar, a segunda rodada não fotografaria a
  mesma coisa que a primeira.
- **Relógio congelado** em `2026-09-10T18:30-03:00`, fuso `America/Sao_Paulo`
  (`context.clock.setFixedTime`): a timeline sai "Hoje às 14:10" em qualquer dia.
  Timers continuam correndo; só `Date` para.
- **Medida 1:1** (§6.3 do PROCESSO): `deviceScaleFactor` 1 nos dois,
  `--font-render-hinting=none --disable-lcd-text`, `animations: "disabled"`,
  cursor de texto transparente, espera de `document.fonts.ready`, rede quieta e
  imagens carregadas. Celular com `isMobile`, `hasTouch` e gestos de **toque**
  (`tap`, toque longo por CDP), porque o `click` do Playwright manda
  `pointerType: "mouse"` e o toque longo do app ignora mouse. As barras de
  rolagem ficam visíveis (o Playwright as esconde por padrão em modo sem cabeça;
  o Discord mostra a dele).

## A semente

**API primeiro.** Registro, perfil, amizade, servidor, canal, categoria, cargo,
convite, conversa e aplicativo vão pelas rotas REST; toda mensagem, reação,
edição, "remover prévia", enquete e voto vai pelo **gateway** (`message.create`
etc.), como manda o CLAUDE.md — as regras de permissão e as mensagens de sistema
(entrada, fixação) saem iguais às de um usuário. A mensagem do bot vai pela
casca de compatibilidade do Discord (`POST /api/v10/channels/:id/messages`, com
`Authorization: Bot`), que é por onde um bot de verdade escreve.

**Prisma só onde a API não deixa**, e só nisto:

1. **Datas fixas** (último passo): `createdAt` de mensagens, fixação, thread,
   enquete, votos, anexos, contas, servidores, associações, amizades, canais,
   cargos, convites e auditoria; `editedAt`; `lastSeenAt`; e o `ReadState` do
   dono (lido às 18:00, menos o que deve ficar não lido).
2. **E-mail verificado**: a rota exige o token que só o e-mail leva.
3. **Código de convite legível** (`paridade`, `oficina`) no lugar do aleatório.
4. **Anexo sem R2**: a linha `Attachment` solta, apontando para um arquivo que a
   própria web da bancada serve (`/icone-512.png`, `/sw.js`). `POST /uploads`
   dá 503 sem bucket e `POST /uploads/external` só aceita o host do provedor de
   GIF (`apps/api/src/modules/uploads/uploads.service.ts:95`). Quem **vincula** o
   anexo à mensagem continua sendo o `message.create`, com a checagem de "só
   anexo do próprio autor, ainda solto" (`messages.service.ts:180`).

Idempotência: a semente recusa banco que já tem a conta `paridade` (código 3);
`bancada.sh semear` sempre recria o banco antes.

### O que ela cria

| Área | Conteúdo |
|---|---|
| Contas | `paridade` (Pati Ribeiro, dona) + Bia, Caio, Duda, Enzo, Fê, Gabi, Heitor, Íris. Perfis com pronomes, "sobre mim" e cor de faixa; status personalizado (Bia 🎨, Duda 📅, Enzo 🎧) |
| Presença | Bia/Enzo/Fê/Gabi **online**, Caio **ausente**, Duda **não perturbe**, Heitor **offline** (visto 09/09 22:40), Íris **invisível** — ver "Presença" abaixo |
| Amizades | 5 aceitas (Bia, Caio, Duda, Enzo, Gabi), 2 pedidos recebidos (Heitor, Fê), 1 enviado (Íris) |
| Servidor **Paridade** | categorias *Informações* (topo), *Canais de Texto*, *Canais de Voz*; `#boas-vindas` (somente-leitura, canal de sistema — recebe os "X entrou"), `#regras` (somente-leitura), `#anúncios` (anúncio), `#geral`, `#aleatório`, `#bots`, `#equipe` (privado: Bia e Duda), voz *Geral* e *Jogos*; tópicos; descrição e faixa do servidor |
| Cargos | Administrador (vermelho, topo, da dona), Moderação (azul, separado, mencionável: Bia, Duda), Veteranos (laranja: Caio, Gabi), Artistas (verde-água, separado: Bia, Enzo, Heitor) + o cargo gerenciado do bot |
| `#geral` | markdown (ver abaixo), mensagens agrupadas da mesma autora, **resposta** com @ ligado, mensagem **editada**, **fixada** (com a narração "fixou uma mensagem"), **thread** "Revisão do leiaute" com 3 respostas, **enquete** com 5 votos, **anexo de imagem** e **anexo de arquivo**, emoji jumbo, link de **convite** (vira o cartão de convite), **reações** (👍×4 😂 ❤️×3 🔥×2 👀 🎉×2, algumas da dona) e uma menção à dona |
| Bot | aplicativo **Pixel** instalado no Paridade, com 3 comandos de barra globais (`/tocar`, `/status`, `/ajuda` com escolhas) e uma mensagem com **embed + 3 botões** em `#bots` |
| Não lido | `#aleatório` com menção à dona; `#geral` da **Oficina** (segundo servidor, da Duda) com menção à dona → badge nas duas pílulas da rail; DM do Caio com 2 não lidas → avatar com número no topo da rail; caixa de entrada com as duas menções |
| DMs | 1:1 com a Bia (6 mensagens, lida, com spoiler), grupo **Equipe de design** (Bia, Duda, Enzo; 4 mensagens), 1:1 com o Caio (não lida) |

Casos de markdown no `#geral` (a dona escreve um por mensagem, agrupadas):
negrito, itálico (`*` e `_`), sublinhado, riscado, spoiler, código inline, bloco
com linguagem (`ts`), cabeçalhos `#`/`##`/`###`, subtexto `-#`, citação `>` e
`>>>`, listas com aninhamento e numeradas, link automático, link mascarado,
link sem prévia `<…>`, menção `@bia`, menção por id `<@id>`, cargo `<@&id>`,
canal `<#id>`, emoji e timestamp `<t:…:F>`/`<t:…:R>`. **Hoje o renderizador
(`apps/web/lib/markdown-core.ts`) só conhece** negrito/itálico/sublinhado/riscado/
spoiler/código/bloco/`>`/`#`–`###`/link automático/`@usuário`/`<@&id>`/emoji
personalizado; o resto aparece como texto cru. É de propósito: a semente é a
régua da onda 2, que implementa esses casos. Os ids em `<@id>` e `<#id>` são os
cuid internos (o que a web conhece); se a onda 2 decidir por snowflake, é trocar
na função `md-mencoes` do roteiro.

### Presença e voz

Presença no Streamz é ao vivo: ONLINE só existe com socket aberto, e o
`manualStatus` (ausente, não perturbe, invisível) só vale enquanto ele existe
(`apps/api/src/modules/gateway/chat.gateway.ts:210`). Não dá para "semear" um
membro online. Por isso o `capturar.mjs` sobe **figurantes**: um socket por
membro marcado `conectar` no manifesto, e Enzo e Fê (mudo) entram no canal de voz
*Geral* pelo gateway — sem LiveKit o estado de voz existe do mesmo jeito
(`voice.service.ts:392` só checa acesso e tipo de canal). A dona é o navegador.
Um socket auxiliar da dona manda `voice.leave` depois de cada tela que entrou em
voz, para a próxima não herdar a dona dentro da sala (a queda do socket do
navegador só agenda a saída, com carência de reconexão).

### O que ficou de fora, e por quê

| Fora | Por quê |
|---|---|
| Embed rico e botões **renderizados** | `Message` não tem `embeds`/`components`: a casca achata o embed em texto e descarta os componentes (`discord-compat/rest/messages.controller.ts:161-166`, `traducao/embed.ts`). A mensagem é semeada no formato do Discord e sai achatada até a onda 3 |
| Avatar, ícone do servidor, faixa com imagem, emoji personalizado, figurinha, som | todos exigem o storage (R2); sem ele as rotas respondem 503. Avatares saem com as iniciais |
| Mídia de voz (vídeo, "falando", tela) | exige LiveKit. A chamada sai "conectada, sem mídia" (`apps/web/stores/voice.ts:1479`) |
| Bot **online**, resposta efêmera, faixa "usou /comando" | exigem o bot conectado ao gateway de compatibilidade e respondendo interação. O Pixel aparece offline |
| Enquete com prazo | o servidor encerra pelo relógio real (`polls.service.ts:56`): com prazo fixo ela já nasceria encerrada. Semeada sem prazo |
| Prévia de link (Open Graph) | depende da rede e da página de fora; a dona "remove a prévia" (moderação) das mensagens com link externo. O cartão de **convite** fica, porque é local |
| GIFs | sem `GIPHY_API_KEY` o seletor mostra "GIFs não configurados" |
| Presença de celular (ícone de telefone), atividade, "Ativo agora" | não existem no modelo |
| Fórum, eventos, palco | a feature não existe (trilha §4b) |

## As capturas

`capturar.mjs` tem o mapa **tela → passos** (o objeto `PASSOS`); `--listar`
mostra quais ids do `telas.json` têm passo. Cada foto sai em
`<saída>/<plataforma>/<id>.png`; uma tela que falha vira `<id>.falha.png` (a tela
como estava) e entra no `resumo.json` com o erro, sem derrubar as outras. O
resumo também guarda, por tela, os erros de console e as respostas HTTP ≥ 400
(fora os 503 esperados de voz e GIF). `--so` junta o resultado ao `resumo.json`
que já existe.

Resumo dos passos (desktop): `login`/`registro`/`convite-pagina` sem login;
`amigos-*` na home; `dm-*` pela lista de conversas; tudo de canal abre o
servidor Paridade pela rail e o canal pelo nome exato; mensagem específica é
achada pelo id do manifesto (`#mensagem-<id>`, `MessageItem.tsx:672`) e
centralizada; `mensagem-hover`/`mensagem-menu` usam a mensagem do Enzo;
`modal-confirmacao` é "Apagar Mensagem" numa mensagem da dona (sem confirmar);
`config-minha-conta`/`config-aparencia` pelo deep link `?settings=`
(`hooks/useSettingsRoute.ts`); `voz-chamada` e `painel-usuario-voz` entram na
voz *Geral*; `rail-tooltip` é o hover na Oficina (com badge). Celular: abas
pela barra `Seções`, rail compacta, toque longo por CDP na mensagem do Enzo,
membros pelo título do cabeçalho.

## A folha

`folha.mjs` lê `<saída>` e o `referencias.json` e compõe um HTML por tela
(nossa captura à esquerda, até 2 referências à direita, legenda com id, onda,
`o_que`, nota e escala de cada referência), fotografado pelo Chromium da imagem
do Playwright — sem Pillow. Aceita as duas formas do `referencias.json`: a plana
(`{ "<id>": [{ "arquivo", "nota" }] }`) e a aninhada por plataforma que o 0.7c
gravou (`{ "desktop": { "<id>": [...] } }`, com `{ "lacuna": "…" }` onde não há
imagem boa — a folha mostra o motivo). Caminho relativo é tentado contra
`--refs` e contra `--refs/docs/referencias-discord`; absoluto (os prints 1:1 de
`/opt/stack/streamz/docs/Reference`, que o `bancada.sh` monta no mesmo caminho)
vale como está. O `index.html` lista toda folha existente, com selos de "captura
falhou", "sem referência"/"lacuna" e "referência não encontrada".

## Onde a primeira execução deve falhar (olhar primeiro)

1. **Rede no build** (`subir`): `corepack` baixa o pnpm 9.12 na primeira vez
   (fica no volume `paridade-corepack`) e o `next build` baixa as fontes do
   `next/font/google` (`apps/web/app/layout.tsx`). Sem internet, o build morre aí.
2. **Typecheck do `next build`** numa árvore com a onda em andamento, ou **OOM**
   (saída 137) no teto de 4 GB do `paridade-preparar` — o typecheck do Next roda
   num processo à parte, fora do `--max-old-space-size`. Se for memória, subir o
   `--memory` da função `preparar` do `bancada.sh` (e não rodar junto de outro
   build no host).
3. **`npm install playwright-core@1.56.0`** no volume (`capturar`, `folha`):
   precisa do registro npm. Sem ele, cai no 1.62 da worktree com o Chromium 1.56
   da imagem — funciona na maioria das vezes, sem garantia.
4. **Semente**:
   - a corrida do eco `message.new` (o cliente conecta antes de o servidor
     terminar o `join` das salas; mitigado com `channel.join` explícito e 1,5 s de
     espera — se der "sem message.new em 12000 ms", é aqui);
   - o `PATCH …/channels/positions` só com categorias;
   - o `PUT /api/v10/applications/:snowflake/commands` (schema de opções/escolhas);
   - o `@everyone` no `#anúncios`.
   A mensagem de erro diz a etapa (`▶ n. …`).
5. **Seletores mais frágeis** (lidos em 2026-09-11, **com a onda 0.8 migrando
   componentes para os primitivos na mesma worktree** — os números de linha
   abaixo já andaram durante a leitura): o botão da caixa de entrada e o
   `aria-label` do popout dela (`InboxPopover.tsx:138`); as abas "Perfil do
   servidor"/"Cargos" por texto (`ServerSettingsModal.tsx`); o fluxo "Mais opções
   → Perfil" do `perfil-modal` (`ProfilePopover.tsx:541`); o chip da thread pelo
   nome; `Control+K`; o título do cabeçalho no celular (`m-membros`,
   `telas-de-conversa.tsx:264`); o ponto do toque longo; a espera por
   `main header h1` ao abrir canal no desktop (`ChatView.tsx`/`HeaderBar.tsx`).
6. **Relógio congelado**: se o app estranhar o `Date` parado (renovação de token,
   reconexão), rodar com `--sem-relogio` separa a causa.
7. **Voz**: se o "Desconectar" (`VoiceConnectedBar.tsx:187`, agora
   `BotaoDeIcone`) não aparecer sem LiveKit, `voz-chamada` e
   `painel-usuario-voz` estouram o tempo — o `.falha.png` mostra o estado.
8. **Arquivos de root** na worktree (`dist/`, `.next/`, `.claude/paridade/`): os
   contêineres rodam como root; o host também, então não trava nada, mas vale
   saber.

## Referências de código (o não óbvio)

- `apps/api/src/modules/gateway/chat.gateway.ts:66` — `WS_LIMITS` (10 mensagens de
  rajada, 1/s): a semente espera e repete no "Devagar".
- `chat.gateway.ts:162` — `handleConnection` entra nas salas depois do connect do
  cliente; `:265` — comando antes disso é ignorado em silêncio.
- `chat.gateway.ts:210` — `markOnline`: presença = socket + `manualStatus`.
- `apps/api/src/modules/voice/voice.service.ts:392` — `join` sem LiveKit.
- `apps/web/stores/voice.ts:833` e `:1479` — a web emite `voice.join` antes da
  mídia e trata 503 como "sem mídia".
- `apps/api/src/modules/read-state/read-state.service.ts:137` — menção só conta
  depois do `lastReadAt`; "nunca abri" conta tudo.
- `apps/api/src/modules/guilds/guilds.service.ts:158` — servidor novo aponta o
  canal de sistema para o `#geral` (a semente troca para `#boas-vindas`);
  `:176` — a rail ordena por `createdAt` do servidor (Paridade antes da Oficina);
  `:200` — canais por `position` só.
- `apps/web/stores/guilds.ts:126` e `apps/web/stores/channels.ts:129` — o app
  pré-seleciona o primeiro servidor e o primeiro canal de texto (e o marca como
  lido) no boot.
- `apps/api/src/modules/onboarding/onboarding.service.ts:185` — "X entrou no
  servidor" só com canal de sistema.
- `apps/api/src/modules/discord-compat/rest/messages.controller.ts:161` — embed
  achatado; `:166` — componentes descartados.
- `apps/web/components/layout/ChannelSidebar.tsx:759` (`data-channel-button`),
  `:217` (`Criar canal em …`), `:986` (menu do servidor).
- `apps/web/components/layout/GuildRail.tsx:201` (rótulo com "(não lido)"),
  `:499` ("Adicionar um servidor"), `:318` ("Criar um servidor").
- `apps/web/components/mobile/telas-de-conversa.tsx:147` e `:184` — o toque
  longo ignora `pointerType: "mouse"` e arma aos 450 ms.
- `apps/web/components/mobile/BarraDeAbas.tsx:121` — `nav[aria-label="Seções"]`.
- `apps/web/lib/instalacao.ts:26` — a chave que dispensa o aviso de instalação
  do PWA (o `capturar.mjs` a grava antes de a página carregar).
- `apps/web/components/ui/TelaDeAbertura.tsx:75` — a tela de abertura que a
  captura espera sumir.
