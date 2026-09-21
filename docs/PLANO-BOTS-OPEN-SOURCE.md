# Plano — trocar os bots oficiais por bots open source de verdade

Escrito em **2026-09-21** contra o `main` em `3fab2e06`. Tudo o que está aqui foi
conferido **no código deste repositório** ou **na API do GitHub / no código dos
projetos** (datas, licenças e commits no §3). Onde não deu para confirmar, está
escrito "**não confirmado**".

O pedido do usuário é explícito e já decidido: os cinco bots oficiais de hoje
(`apps/bots/src/{musica,moderacao,niveis,cargos,boas-vindas}`, escritos por nós
com discord.js contra a nossa casca `discord-compat`) devem dar lugar a **bots
reais do Discord, open source, vendorizados** — o código dos projetos entra no
repositório, apontado para a nossa API, e os nossos são aposentados.

Este documento é o plano executável disso. Ele **não** altera código.

---

## 1. Resumo, e a recomendação em três linhas

**A lacuna que decide tudo não é licença nem estrela de GitHub: é o
subcomando.** O nosso `PUT /api/v10/applications/:id/commands` recusa com
`50035` qualquer opção de tipo 1 (subcomando) e 2 (grupo de subcomando)
(`apps/api/src/modules/discord-compat/rest/application-commands.controller.ts`)
— e o registro é **em bloco**: um único comando com subcomando derruba o
`tree.sync()`/`commands.set()` inteiro e o bot fica **sem nenhum comando**.
Medido nos candidatos: **Vocard usa `commands.hybrid_group` em três cogs**
(`cogs/playlist.py:283`, `cogs/settings.py:66`, `cogs/basic.py:480`), **Muse usa
`addSubcommand` em `/config` e `/favorites`**, **modbot e ReactionRoleBot também**.
Dos seis candidatos sérios, **cinco** batem nessa parede; o único que escapa
(`diwasatreya/Welcome-Bot`) escapa porque **não tem comando de barra nenhum**.

Daí a recomendação, com o número que a sustenta:

1. **Não vendorize os cinco de uma vez.** Vendorizar os cinco são ~50 cartões,
   4 bancos novos (Mongo, MySQL, dois SQLite), 3 licenças a analisar e **4 das 5
   funções não rodam sem trabalho novo na casca**. Começar por um.
2. **Faça primeiro a onda de casca (4 cartões, §8 onda A): subcomandos +
   tolerar comando de tipo 2/3.** É o maior retorno por cartão do documento
   inteiro: desbloqueia os cinco candidatos de uma vez, vale também para
   qualquer bot que um usuário hospede, e é paridade com o Discord que já
   devíamos ter.
3. **Depois vendorize um só: o Vocard** (música, MIT, discord.py 2.7.1, Lavalink
   v4 — exatamente a pilha que o nosso `apps/bots/lavalink/application.yml` já
   copia dele). É a função onde o OSS é claramente melhor que o nosso, e é a que
   o usuário mais quer. **Níveis fica com o nosso** (não existe OSS de nível
   que valha a troca — §3.3). **Moderação e cargos** ficam para a segunda leva,
   com decisão de licença tomada antes. **Boas-vindas** é o único que roda hoje
   sem casca nova, e mesmo assim o candidato é **pior** que o nosso — trocar ali
   seria trocar por menos.

Bloqueio que não é nosso e precisa ser dito na frente: **música não emite som
sem a ponte de voz, e a ponte depende de DNS e firewall que só o dono do
servidor faz** (`PENDENCIAS.md` §1). Isso vale igual para o nosso bot e para o
Vocard — vendorizar não melhora nem piora esse ponto, mas **a prova de áudio
fica bloqueada até lá**.

---

## 2. O terreno, em 2026-09-21

Levantado no código (não no documento): `apps/api/src/modules/discord-compat/`
(73 arquivos), `apps/api/src/modules/interactions/`, `apps/ponte-voz/` (Go).

### O que a casca **tem** (e que a maioria dos planos subestima)

- **REST**: gateway (`/gateway`, `/gateway/bot`), `users/@me`, `users/:id`,
  `POST /users/@me/channels` (DM), `applications/@me`, `oauth2/applications/@me`,
  guilds (`:id`, `/channels`, `/roles`, `/members/:uid`), `channels/:id`,
  `typing`, **mensagens completas** (GET/POST/PATCH/DELETE, `around/before/after`,
  **bulk-delete**), **as seis rotas de reação**, **membros** (`PATCH`, kick,
  `PUT/DELETE .../roles/:rid`), **bans** (`GET`/`PUT`/`DELETE`), **cargos**
  (`POST`/`PATCH`).
- **Upload de arquivo por bot funciona**: `POST /channels/:id/messages` aceita
  `multipart/form-data` com `payload_json` + `files[n]` e pareia com
  `attachments[]` (`rest/corpos.ts`). Vale também no callback de interação e no
  followup. **Não** vale em `PATCH` de mensagem.
- **Gateway**: ops 1,2,3,4,6 aceitos; READY + GUILD_CREATE gordo; **RESUME real**
  (buffer de 500, TTL 3 min); **`zlib-stream` implementado**; `zstd-stream` cai
  para texto com aviso; filtro por intent de verdade.
- **Interactions**: tipos 2 (comando), 3 (componente), 4 (autocomplete) e 5
  (modal). Callbacks **4,5,6,7,8,9**. Componentes V1 **e V2** completos,
  modais, efêmeras de verdade, followups `@original`.
- **Voz**: `apps/ponte-voz` fala o voice gateway v8 (tolerante a v4), os dois
  modos AEAD `_rtpsize`, descoberta de IP, uma porta UDP multiplexada por SSRC,
  e publica Opus no LiveKit **sem transcodificar**.

### O que a casca **não tem** — a lista que importa para este plano

| Lacuna | Onde | Quem bate nela |
|---|---|---|
| **Opção de tipo 1 e 2 (subcomando / grupo)** — `50035` | `rest/application-commands.controller.ts` | Vocard, Muse, modbot, ReactionRoleBot, reaction-light |
| **Comando de tipo 2 e 3 (menu de contexto)** — `50035` | idem | Vocard (`basic.py:70`), modbot, ReactionRoleBot |
| `PATCH /applications/:app/commands/:cmd` | **501 `20012`** (linhas 160 e 225) | caminhos de edição individual de comando |
| `GET /guilds/:id/members` (lista) e `/members/search` | não existe | modbot (`members.fetch({query})`) |
| **op 8 REQUEST_GUILD_MEMBERS** aceito e **ignorado**; sem `GUILD_MEMBERS_CHUNK` | `gateway/servidor.ts:310` | qualquer `guild.members.fetch()` sem id |
| `GUILD_BAN_ADD` / `GUILD_BAN_REMOVE` | nenhum dispatch (banir só emite `GUILD_MEMBER_REMOVE`) | modbot (intent `GuildModeration`) |
| `MESSAGE_DELETE_BULK` (dispatch) | existe a rota, não o evento | bots que registram o próprio bulk |
| `GUILD_UPDATE`, `CHANNEL_PINS_UPDATE`, `PRESENCE_UPDATE`, `GUILD_EMOJIS_UPDATE`, `INVITE_*`, `THREAD_*`, `WEBHOOKS_UPDATE`, `AUTO_MODERATION_*` | sem tradução | vários, em caminhos secundários |
| Convites (`/invites`, `/channels/:id/invites`), webhooks de verdade, audit log (`GET /guilds/:id/audit-logs`), threads, eventos agendados, stage | não existem | modbot, discord-js-bot |
| `DELETE /guilds/:id/roles/:rid`, `PATCH /guilds/:id`, criar/editar/apagar canal, reordenar cargos/canais | não existem | moderação e configuração automática |
| `permission_overwrites` sempre `[]`; `mentions`/`mention_roles` sempre vazios; `avatar` sempre `null` | `traducao/canal.ts`, `traducao/mensagem.ts` | bots que checam permissão **de canal** ou leem menções estruturadas |
| `nick` de servidor **não existe** (`PATCH` com texto → `50013`) | `rest/membros.controller.ts` | bots que renomeiam ao entrar |

Duas observações de método, porque custam rodada:

1. **Os comentários dos nossos próprios bots estão velhos.** `moderacao/servico.ts`,
   `niveis/servico.ts` e `boas-vindas/servico.ts` dizem que `PUT .../roles/:rid`,
   `bans`, `kick` e `POST /users/@me/channels` "não existem na casca". **Existem**
   desde a leva F5 (conferido nos controllers). Quem for mexer nesses arquivos não
   deve acreditar no comentário.
2. **O payload sempre está "certo" para o nosso próprio tipo, e só a lib do outro
   lado discorda.** É a lição repetida da F1, da F2 e da F3
   (`docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §12). Todo cartão deste plano que
   toca contrato termina com uma prova rodando a **lib de verdade**, não um teste
   unitário.

---

## 3. Os candidatos, com prova

Dados colhidos da API do GitHub em **2026-09-21**. "HEAD" é o último commit do
branch padrão; "release" é a última publicada.

> **A licença é eliminatória.** MIT/Apache/BSD/ISC entram. AGPL e
> *source-available* levam parecer explícito (§5.4) — e um deles já eliminou um
> candidato popular.

### 3.1 Música

| | **Vocard** | **Muse** |
|---|---|---|
| Repo | `ChocoMeow/Vocard` | `museofficial/muse` (o `codetheweb/muse` redireciona para cá) |
| Licença | **MIT** (`Copyright (c) 2023 Choco`) | **MIT** (`Copyright (c) 2020 Max Isom`) |
| Estrelas | 606 | 1281 |
| HEAD / release | `9447b0a4`, 2026-05-09 / **v2.7.3**, 2026-05-09 | `690d06af`, 2026-09-20 / **v2.11.8**, 2026-09-20 |
| Pilha | **discord.py 2.7.1** + cliente Lavalink próprio (`voicelink/`) + **Lavalink v4** + **MongoDB** (motor) | TypeScript, **discord.js 14.11.0**, **`@discordjs/voice` 0.19.2**, `@discordjs/opus`, **yt-dlp + ffmpeg**, Prisma + SQLite |
| Compatível com a casca? | **Sim, com um remendo**: discord.py 2.7.1 é **exatamente** a versão das provas F1/F3; `commands.Bot` (não `AutoShardedBot`); **`chunk_guilds_at_startup=False`** (não usa o op 8 que ignoramos) | **Sim** para o transporte: `@discordjs/voice` **0.19.2** é a mesma versão medida no degrau 3 da F2 |
| Veredito | **ENTRA** | **NÃO ENTRA** (motivo abaixo) |

**Por que o Vocard entra.** Três coisas que nenhum outro candidato tem:

1. **Ele já é a nossa referência de fato.** `apps/bots/lavalink/application.yml`
   fixa `lavasrc-plugin:4.8.3` com o comentário "Mesma versão do Vocard" e a
   lista de `clients` do YouTube "são as do Vocard (Vocard-Installer, 2026-08)";
   `apps/bots/src/musica/tokens-do-youtube.ts` copia a estratégia
   `LoadBalance` do `voicelink/ratelimit.py` (30 faixas por conta, 3 h de molho).
   Vendorizar o Vocard é trocar a nossa cópia pela fonte.
2. **Ele resolve o problema que mata o áudio neste servidor.** A nota medida em
   2026-09-15 no `application.yml` diz que, com o IP deste servidor, **nenhum
   cliente do YouTube toca sem conta logada**. O rodízio de contas OAuth é
   nativo do Vocard (`yt_ratelimit` no `settings.json`).
3. Lavalink entrega Opus 48 kHz estéreo pronto — que é o que a ponte repassa ao
   LiveKit **sem transcodificar** (§D5.6 do documento-mãe).

**Por que o Muse não entra — e é por medida, não por gosto.** Muse toca com
**yt-dlp direto**, sem Lavalink e sem OAuth de conta. No IP deste servidor isso
esbarra na mesma parede de "Sign in to confirm you're not a bot" que já foi
**medida** (2026-09-15) — e o Muse não tem rodízio de contas para contornar.
Somando: pilha de áudio inteiramente nova (yt-dlp + ffmpeg + codificação de Opus
no nosso contêiner, em vez de repasse), `YOUTUBE_API_KEY` e credenciais do
Spotify obrigatórias, discord.js **14.11** (mais velho que os 14.27 que usamos),
**só inglês** e **só comando de barra** — ou seja, com os subcomandos que ele usa
recusados, o Muse fica **sem nenhuma forma de ser usado** (o Vocard, híbrido,
ainda responderia no prefixo `?`). Fica registrado como segunda opção se um dia
o Lavalink virar um problema operacional.

**Terceiro candidato, eliminado pela licença — e vale a leitura.**
`bongo-devs/lavamusic` (ex-`appujet/lavamusic`, 742 estrelas, discord.js 14.25 +
`lavalink-client`, a escolha "óbvia" de quem procura por estrelas) declara
`"license": "GPL-3.0"` no `package.json`, **e o arquivo `LICENSE` diz outra
coisa**: *"LAVAMUSIC LICENSE Version 1.0 — Paid License Required: use in public
Discord servers; commercial use; **redistribution (e.g., hosting, sharing with
others)**"*. É *source-available*, não open source: **redistribuir — que é
exatamente o que vendorizar faz — exige licença paga**, e a própria GitHub
marca a licença como `NOASSERTION`. **Não entra, e não é negociável.** É o
melhor argumento deste documento para conferir o arquivo `LICENSE` e nunca o
campo do `package.json`.

### 3.2 Moderação

| | **ModBot (Aternos)** | **discord-js-bot (saiteja-madha)** |
|---|---|---|
| Repo | `aternosorg/modbot` | `saiteja-madha/discord-js-bot` |
| Licença | **MIT** (`Aternos GmbH, 2020-2025`) | **MIT** (`Saiteja Madha, 2025`) |
| Estrelas / HEAD | 182 / `bbaf4ca7`, **2026-09-08** (vivo) · release v3.9.0, 2026-04-23 | 817 / — , **2025-10-24** (11 meses parado) |
| Pilha | discord.js **^14.26.2**, Node ≥22, **MySQL**, Google Vision/YouTube (opcionais) | discord.js v14, Node ≥16, **MongoDB**, painel web embutido |
| Escopo | moderação séria: strikes, bans temporários, filtro de palavrão com regex, detecção de phishing, log de mensagens, modais, menus de contexto | multipropósito: moderação + níveis + boas-vindas + cargos por reação + música + economia + sorteios + tickets |
| Veredito | **ENTRA na segunda leva** (depois da onda A + 3 rotas) | **NÃO ENTRA** |

**ModBot**: o projeto é sério e vivo, mas bate em **quatro** lacunas nossas —
subcomandos, menus de contexto, `members.fetch({query})` (busca de membro, que
não existe) e o intent `GuildModeration` (cujos `GUILD_BAN_*` nunca emitimos).
Some um MySQL novo no compose. Custo honesto: onda A + 3 cartões de API.

**discord-js-bot**: **8 001 arquivos**, com um painel web que traz
`bower_components` inteiro (Bootstrap, CKEditor, Chart.js) dentro do repositório;
módulos que dependem de convites (`INVITE_CREATE`), de contadores que renomeiam
canal (`PATCH /channels/:id`, que não temos) e de economia/anime/imagem que não
queremos. Vendorizar isso é adotar 8 000 arquivos para usar 40. **Não entra** —
mas é a **fonte de referência** se algum dia escrevermos o nosso módulo de
níveis de novo (o `src/handlers/stats.js` é limpo).

**Rejeitado sem tabela**: `Cog-Creators/Red-DiscordBot` (GPL-3.0, 5 713 estrelas,
vivo) — é um *framework* de cogs, não um bot de moderação; adotá-lo é adotar um
ecossistema inteiro de plugins de terceiros, cada um com a licença dele.

### 3.3 Níveis / XP

| | **discord-js-bot (módulo `stats`)** | **NetLevel-Bot** |
|---|---|---|
| Licença | MIT | **GPL-3.0** |
| Estrelas / HEAD | 817 / 2025-10-24 | **13** / **2025-04-07** (parado) |
| Pilha | discord.js v14 + MongoDB | discord.js v14 + canvas + TypeScript |
| Veredito | **NÃO ENTRA** (é módulo de um monólito de 8 000 arquivos) | **NÃO ENTRA** (13 estrelas e um ano e meio parado é menos manutenção do que a nossa própria) |

**Conclusão honesta desta linha: não existe bot de níveis open source, autônomo
e bem mantido.** O que o mercado chama de "alternativa ao MEE6" é sempre um
monólito (Ree6, Logiq, Discordio) ou uma **biblioteca** (`Defxult/discordLevelingSystem`,
MIT) — e usar uma biblioteca é escrever o bot de novo, que é exatamente o que o
usuário quer parar de fazer. O **Lurkr**, que costuma ser citado, **não é open
source**: só o site (`almeidx/lurkr-website`, AGPL) está publicado.
`Ree6-Applications/Ree6` é GPL-3.0 **e** Java/JDA — uma terceira família de lib,
que a nossa casca nunca exercitou (as provas são discord.js e discord.py); se a
URL base do JDA é trocável sem patch, **não confirmado**.

**Recomendação: níveis fica com o nosso.** É o bot com mais lógica pura
testada do repositório (`curva.ts`, `ganho.ts`, `ranking.ts`), e trocá-lo custa
dado migrado para ganhar menos.

### 3.4 Cargos por reação

| | **ReactionRoleBot (Mimickal)** | **reaction-light (eibex)** |
|---|---|---|
| Licença | **AGPL-3.0** ⚠ | **MIT** |
| Estrelas / HEAD | 54 / **`37844305`, 2023-11-26** (quase 3 anos) | 131 / `abac277e`, **2026-05-07** (vivo) · v3.5.2 |
| Pilha | TypeScript, discord.js ^14.9, SQLite/knex | Python, **disnake ≥2.5** (fork do discord.py) |
| Bate em | subcomandos, menu de contexto | subcomandos (grupos em `cogs/{settings,control,message}.py`) |
| Veredito | **NÃO ENTRA** (AGPL + parado desde 2023) | **NÃO ENTRA na primeira leva** |

O `reaction-light` é o melhor dos dois (MIT, vivo, escopo exato), e a única coisa
que o segura é a lib: **disnake não é discord.py**. O nosso remendo de duas
linhas (`Route.BASE` + `DEFAULT_GATEWAY`) provavelmente tem equivalente, mas
nenhuma prova nossa jamais rodou disnake, e as três armadilhas que custaram
fases inteiras (`Content-Type` sem charset, `DEFAULT_GATEWAY`, `with_response`)
só apareceram com a lib de verdade do outro lado. **Custo real: uma prova nova
no molde da F1, antes de qualquer cartão de vendorização.**

Enquanto isso, o nosso `Streamz Cargos` faz o trabalho, tem prova na bancada
(`apps/bots/prova-cargos.sh`) e quatro modos de painel.

### 3.5 Boas-vindas

| | **Welcome-Bot (diwasatreya)** | **Welcome-Bot (InfusionBot)** |
|---|---|---|
| Licença | **Apache-2.0** (sem arquivo `NOTICE` — confirmado, 404) | LGPL-2.1 |
| Estrelas / HEAD | 189 / `62fd3ead`, **2026-08-14** | 83 / 2025-04-17, **arquivado** |
| Pilha | discord.js ^14.16, **`@napi-rs/canvas` + canvas** (cartão de boas-vindas com imagem), `quick.db`/`better-sqlite3` | discord.js, multipropósito |
| Compat | **o único candidato que roda na casca de hoje sem nada novo**: nenhum subcomando, nenhum menu de contexto, nenhum `members.fetch`, nenhum webhook/convite; intents `Guilds, GuildMembers, GuildMessages, MessageContent` — todos suportados; o cartão de imagem usa upload multipart, **que temos** | — |
| Veredito | **ENTRA tecnicamente, mas é uma troca para menos** | **NÃO ENTRA** (arquivado) |

O candidato é **só de prefixo** (`Events.MessageCreate`; não registra comando de
barra nenhum), é inteiramente em inglês, guarda estado num `json.sqlite`
commitado no próprio repositório, e faz **menos** que o nosso (sem DM de
boas-vindas, sem autorole, sem mensagem de saída configurável). O que ele tem e
o nosso não é o **cartão de imagem**. Ver o veredito de produto no §7.5.

**Eliminado com uma linha**: `WelcomerTeam/Welcomer` — **AGPL-3.0**, e a
arquitetura é um daemon de gateway próprio em Go (Sandwich), não a conexão
direta de uma lib (detalhe **não confirmado**; a licença já basta).

---

## 4. A lacuna de compatibilidade — o critério real de viabilidade

Cruzamento do que cada candidato chama contra o que existe em
`apps/api/src/modules/discord-compat/rest/`, `.../gateway/`,
`apps/api/src/modules/interactions/` e `apps/ponte-voz/`.

### 4.1 Tabela mestra

| Lacuna | Vocard | Muse | ModBot | ReactionRoleBot | reaction-light | Welcome-Bot |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Subcomando / grupo (opção 1 e 2)** | **bloqueia** | **bloqueia** | **bloqueia** | **bloqueia** | **bloqueia** | — |
| **Comando tipo 2/3 (menu de contexto)** | **bloqueia** | — | **bloqueia** | **bloqueia** | — | — |
| `PATCH /applications/:app/commands/:cmd` (501) | risco | risco | risco | risco | risco | — |
| `GET /guilds/:id/members` + `?query` | — | — | **bloqueia** | — | — | — |
| op 8 / `GUILD_MEMBERS_CHUNK` | não usa (`chunk_guilds_at_startup=False`) | não confirmado | provável | não (usa `fetch(id)`) | não confirmado | — |
| `GUILD_BAN_ADD/REMOVE` | — | — | degrada | — | — | — |
| Convites / webhooks / audit log | — | — | degrada | — | — | — |
| `permission_overwrites` vazio | degrada | degrada | degrada | degrada | degrada | degrada |
| `name_localizations` descartado | degrada (traduções somem) | — | degrada | — | — | — |
| **Ponte de voz (DNS + 7883/udp)** | **bloqueia o som** | **bloqueia o som** | — | — | — | — |
| Banco novo no compose | **MongoDB** | SQLite (no volume) | **MySQL** | SQLite | SQLite | SQLite |

Legenda: **bloqueia** = o bot não funciona (ou fica sem comandos);
*degrada* = funciona com menos; *risco* = depende do caminho que a lib escolhe.

### 4.2 Lacuna por lacuna: quem depende, e quanto custa

**(a) Subcomandos — opções de tipo 1 e 2.** *A lacuna que decide o plano.*
Quem depende: Vocard (`/playlist …`, `/settings …`, o grupo de `basic.py`), Muse
(`/config`, `/favorites`), ModBot, ReactionRoleBot, reaction-light. Como o
`PUT` é sobrescrita em bloco, **um comando ruim mata todos**: o bot sobe,
conecta, e não tem comando nenhum — o sintoma mudo de sempre.
Custo: **médio, ~2 cartões Opus + 1 Sonnet**. Não precisa de migration
(`ApplicationCommand.options` já é `Json`). Precisa de: validação com os limites
do Discord (25 subcomandos, profundidade 2, subcomando não pode conviver com
opção comum no mesmo nível); `data.options` aninhado no `INTERACTION_CREATE`;
`Interaction.commandName` guardando o caminho completo (`config set-playlist-limit`),
senão a faixa "usou /config" mente; o autocomplete precisa achar a opção em foco
**dentro** do subcomando; e o composer (`lib/comandos-barra.ts`,
`stores/comandos-de-app.ts`, `Composer.tsx`) precisa sugerir e analisar
`/pai filho <args>`.

**(b) Comando de tipo 2 e 3 (menu de contexto).** Quem depende: Vocard
(`app_commands.ContextMenu` em `cogs/basic.py:70`), ModBot, ReactionRoleBot.
**A saída barata é não implementar a UI**: aceitar `type: 2|3` no registro,
guardar, e **nunca despachar**. O `tree.sync()` passa, o bot sobe inteiro, e o
usuário simplesmente não vê aquela entrada no menu do botão direito — que é uma
UI que nem existe no Streamz. Custo: **1 cartão Sonnet**, mais uma divergência
declarada. (A UI de verdade — menu de contexto em mensagem e em usuário, com
`target_id` e `resolved` — é outro projeto, e não pertence a esta leva.)

**(c) `PATCH /applications/:app/commands/:cmd` — hoje 501.** As libs preferem o
`PUT` em bloco, mas há caminhos (edição de um comando só, `edit_command`) que
usam o `PATCH`. Custo: **1 cartão Sonnet** (o `POST` já cria-ou-atualiza pelo
nome; é o mesmo código).

**(d) Busca de membro.** `GET /guilds/:id/members?limit&after` e
`?query=` (que o discord.js chama de `members.fetch({query})`, e que no Discord
é `/members/search`). Só o ModBot depende. Custo: **1 cartão Opus** (paginação
por snowflake e a checagem de acesso de sempre).

**(e) `GUILD_BAN_ADD` / `GUILD_BAN_REMOVE`.** Hoje banir emite só
`member.left` → `GUILD_MEMBER_REMOVE`. Um bot de moderação que escuta ban para
registrar não registra. Custo: **1 cartão Sonnet** na `PonteDeEventos`, e os
eventos internos correspondentes no `ModerationService`.

**(f) O que fica declarado como divergência, e não se conserta agora**:
`permission_overwrites: []` (todo bot que checa permissão **de canal** vê a
permissão **de servidor**); `mentions`/`mention_roles` vazios; `avatar: null`;
`nick` inexistente; convites, webhooks, audit log, threads. Nenhum desses
**bloqueia** os candidatos escolhidos — todos degradam.

**(g) Voz.** Não é lacuna de código: a ponte está escrita, testada em unidade e
com os dois modos AEAD. Falta **DNS + firewall** (§6.4). O que **não** foi
medido contra cliente real continua sendo: o AAD do pacote com extensão RTP
(`0x90`) — a ponte tenta as duas leituras e anota qual venceu — e o degrau 4
(Lavalink de verdade, 3 minutos sem picote).

---

## 5. Como vendorizar sem virar pesadelo de manutenção

### 5.1 Onde o código entra

```
apps/bots-oss/                      # NOVO. Fora de apps/bots de propósito.
  README.md                         # a regra geral (este §, resumido)
  <projeto>/                        # ex.: vocard/
    ORIGEM.md                       # repo, commit, licença, patches, como atualizar
    LICENSE                         # cópia BYTE A BYTE do upstream, jamais editada
    NOTICE-STREAMZ.md               # o que mudamos (exigido pelo Apache §4b; boa prática no MIT)
    upstream/                       # o código do projeto, no commit fixado, SEM UMA LINHA NOSSA
    patches/                        # 0001-apontar-para-o-streamz.patch, 0002-…
    streamz/                        # o que é nosso: aplicativo.json, entrypoint.sh, config, pt-BR
    Dockerfile                      # nosso: copia upstream, aplica patches, instala deps
```

**`apps/bots-oss/` é separado de `apps/bots/` por três motivos concretos:**
o `CONTRATO.md` de `apps/bots` descreve um runtime que o vendorizado não usa;
o `registro.ts` varre `dist/` procurando bots nossos e engasgaria; e o
`Dockerfile` de `apps/bots` constrói o monorepo inteiro, o que um projeto Python
com `requirements.txt` não quer.

**Vendorizado não entra no workspace do pnpm.** Nada de `pnpm-workspace.yaml`,
nada de `pnpm install` na raiz puxando as dependências do Muse ou do ModBot: os
lockfiles são deles, as versões de discord.js são deles (14.11, 14.26, 14.9 —
todas diferentes da nossa 14.27), e um `node_modules` compartilhado
transformaria cada atualização deles numa negociação com o nosso. **Cada projeto
constrói na própria imagem, com o próprio gerenciador.** O preço é imagem maior;
o ganho é que um `git pull` do upstream nunca quebra o `pnpm-lock.yaml`.

**O CI não olha para `apps/bots-oss/`**: `.gitattributes` com
`apps/bots-oss/*/upstream/** linguist-vendored`, e os passos de typecheck/lint/
teste do `.github/workflows/ci.yml` continuam listando os pacotes por nome (já
listam). Um job novo, opcional, constrói as imagens.

### 5.2 `ORIGEM.md` — o arquivo que faz a manutenção existir

Um por projeto, e **o cartão que traz o código não fecha sem ele**:

```markdown
# Origem — Vocard
- Repositório: https://github.com/ChocoMeow/Vocard
- Commit fixado: 9447b0a41075… (main, 2026-05-09)
- Versão marcada: v2.7.3
- Licença: MIT — arquivo LICENSE copiado sem alteração
- Trazido em: 2026-09-__ por <cartão>
- Como foi trazido: tarball de /repos/ChocoMeow/Vocard/tarball/9447b0a4, sem .git
- Removido do snapshot: .github/, .DS_Store, docs do dashboard pago
- Patches aplicados (ordem): 0001-apontar-para-o-streamz.patch, 0002-…
- Como atualizar: scripts/bots-oss/atualizar.sh vocard <commit-novo>
- Divergências conhecidas contra a nossa casca: (lista, com link para o §4)
```

### 5.3 Os nossos ajustes ficam **fora** do upstream

**Patches, não edição no lugar.** `upstream/` é sagrado: comparar com o tarball
do commit tem de dar zero diferença. Tudo o que é nosso é um arquivo em
`patches/`, numerado, com cabeçalho explicando **o porquê** — e o `Dockerfile`
aplica na ordem, falhando alto se um não casar.

Por que patch e não fork com commits nossos em cima: um fork num remoto
separado quebra o build do Docker a partir da raiz do monorepo (e o nosso CI
constrói assim), exige credencial a mais no deploy e esconde a diferença entre
"o que é deles" e "o que é nosso" — que é a única pergunta que importa quando o
upstream muda. Submódulo git tem o mesmo problema e pior: um clone raso do CI
vem sem ele.

**A disciplina dos patches, em três regras:**

1. **Configuração antes de patch.** Se dá para resolver por variável de ambiente
   ou arquivo de config (`settings.json` do Vocard, `.env` do Muse), não é patch.
2. **Um patch, um assunto.** `0001-apontar-para-o-streamz` muda as duas linhas de
   URL e nada mais. Assim, quando o upstream mexer no `http.py`, só um patch
   rejeita.
3. **Todo patch nasce candidato a upstream.** A tradução pt-BR do Vocard
   (`langs/PT.json`) é um *pull request* que o projeto provavelmente aceita —
   e patch aceito lá em cima é patch que a gente nunca mais mantém.

**Atualizar** é `scripts/bots-oss/atualizar.sh <projeto> <commit>`: baixa o
tarball novo, substitui `upstream/`, reaplica os patches em ordem, **para no
primeiro que rejeitar** e imprime o `.rej`; no fim, atualiza o commit no
`ORIGEM.md`. Cadência sugerida: **quando quebrar ou quando houver correção de
segurança**. Vendorizar é congelar de propósito; correr atrás de toda release do
upstream é o pesadelo que este § existe para evitar.

### 5.4 Licenças — o que precisa existir, e onde

| Licença | O que somos obrigados a fazer | Onde |
|---|---|---|
| **MIT / ISC / BSD** (Vocard, ModBot, Muse, reaction-light) | manter o texto da licença e o aviso de copyright **sem alteração** | `apps/bots-oss/<projeto>/LICENSE` |
| **Apache-2.0** (Welcome-Bot) | idem, **mais**: (a) declarar de forma destacada que os arquivos foram modificados — §4(b); (b) repassar o `NOTICE` do upstream se existir. **Confirmado: `diwasatreya/Welcome-Bot` não tem `NOTICE`** (404), então só (a) | `LICENSE` + `NOTICE-STREAMZ.md` |
| **GPL-3.0** (Red, Ree6, NetLevel) | enquanto **hospedamos** e não **distribuímos** o binário, não dispara nada. **Publicar a imagem no `ghcr.io` é distribuição** e passa a exigir a oferta do código-fonte correspondente daquela imagem | seria um `ORIGEM.md` com a oferta escrita |
| **AGPL-3.0** (ReactionRoleBot, Welcomer) | **§13**: quem interage com o software **pela rede** tem de poder obter o código-fonte da **nossa versão modificada**. Como os usuários do Streamz interagem com o bot, teríamos de **publicar o nosso `apps/bots-oss/<projeto>/` (upstream + patches)** num lugar público e linkar — e o repositório do Streamz não é público | exigiria repositório espelho + link na descrição do bot |
| ***Source-available*** (LavaMusic) | **proíbe redistribuição e servidor público sem licença paga**. Vendorizar é redistribuir | **não entra, ponto** |

Leitura honesta da AGPL: ela **não** contamina a API do Streamz — o bot é um
programa separado, que fala com a gente por um protocolo documentado, o que é
agregação. O que ela obriga é a **publicar aquele bot**. É factível, mas é uma
decisão de produto (abrir um pedaço do repositório) e por isso **não entra sem
ADR**. Recomendação: na primeira leva, só MIT/Apache.

Um cartão de verificação vale a pena por si: **o campo `license` do
`package.json` não é a licença.** O LavaMusic diz `GPL-3.0` no `package.json` e
tem um `LICENSE` proprietário. **Lê-se o arquivo.**

### 5.5 Anti-pesadelo, em quatro regras

1. **Nada de "melhorar" o upstream.** Se o bot é feio, é feio. Toda linha nossa
   é dívida na próxima atualização.
2. **Nenhum patch em caminho quente.** Remendo em URL, em token e em texto,
   nunca em lógica de fila, player ou reconexão.
3. **A casca se conserta na casca.** Quando o bot bate numa lacuna (§4), o
   conserto é uma rota nossa — não um patch no bot. Isso vale para *todo* bot
   hospedado por usuário, e não só para o vendorizado.
4. **O `ORIGEM.md` é parte do `Definition of Done`.** Código vendorizado sem
   commit fixado é código órfão em seis meses.

---

## 6. Provisionamento, identidade e execução

### 6.1 Como o bot vendorizado ganha nome, ícone e selo de oficial

Hoje `apps/bots/src/provisionar.ts` varre as pastas de bot, lê o objeto `Bot`
(`nome`, `descricao`, `permissoesPadrao`, `icone`) e faz, para cada um:
`POST /auth/login` → `GET /applications` → `POST /applications` (cria e **grava o
token uma única vez** em `<BOTS_DIR>/<id>.token`, `chmod 600`) →
`PATCH /applications/:id` com `publico: true` (é isso que faz aparecer em
"Descobrir aplicativos") → `POST /admin/applications/:id/oficial` (403 é aviso) →
`POST /applications/:id/icone` (503 sem R2 é aviso).

**O que muda:** um bot vendorizado não exporta objeto `Bot` nenhum. Em vez de
mexer no `provisionar.ts` (que é do contrato de `apps/bots` e não deve conhecer
`bots-oss`), cada projeto declara um **manifesto**:

```jsonc
// apps/bots-oss/vocard/streamz/aplicativo.json
{
  "id": "vocard",
  "nome": "Vocard",                       // o nome do projeto, não o nosso
  "descricao": "Toca música nos canais de voz… Link do Spotify vira busca…",
  "permissoesPadrao": 12291,              // VIEW_CHANNEL|SEND_MESSAGES|CONNECT|SPEAK
  "icone": "streamz/icone.png",
  "variavelDoToken": "VOCARD_TOKEN"       // como o projeto espera receber o token
}
```

e um `apps/bots/src/provisionar-oss.ts` (irmão do atual, **sem tocar nele**) lê
os manifestos de `apps/bots-oss/*/streamz/aplicativo.json` e faz exatamente a
mesma sequência de rotas. O token continua em `.bots/<id>.token`.

**Dois pontos de produto, e são regra do `CONTRATO.md` §2:** (i) o nome é o do
projeto (Vocard), não um nome nosso pregado por cima — usar o nome do Streamz
num código de terceiro é o espelho do que o contrato proíbe na outra direção;
(ii) a descrição continua dizendo **o que o bot não faz** (Spotify vira busca).
O ícone precisa ser **arte nossa ou a do projeto com licença compatível** —
nunca um logotipo de terceiro raspado.

### 6.2 Como o token chega ao processo

Cada projeto lê o token do jeito dele: o Vocard lê `settings.json`
(`"token": …`), o Muse lê `DISCORD_TOKEN`, o ModBot lê `bot.token` do config.
Por isso cada `apps/bots-oss/<projeto>/streamz/entrypoint.sh`:

1. lê `/app/.bots/<id>.token` (o mesmo volume `./.bots:/app/.bots:ro` que os
   nossos bots já montam) **ou** a variável `STREAMZ_BOT_TOKEN_<ID>`;
2. gera o arquivo de configuração do projeto a partir do ambiente (para o Vocard,
   um `settings.json` com `token`, `mongodb_url`, `nodes.DEFAULT` e
   `yt_ratelimit.tokens` vindos de `YOUTUBE_REFRESH_TOKENS`);
3. `exec` no processo do bot.

**Nunca commitar token, e nunca pôr token no `.env` da raiz** — aquele arquivo é
produção viva, lida pela API e pela web (`CONTRATO.md` §6).

### 6.3 Como sobe

`docker-compose.yml`, perfil novo **`bots-oss`** (o `bots` continua sendo o dos
nossos, e os dois não precisam subir juntos):

```yaml
  bot-vocard:
    build: { context: ., dockerfile: apps/bots-oss/vocard/Dockerfile }
    profiles: ["bots-oss"]
    environment:
      STREAMZ_API_URL: http://api:3333/api      # sem /v10 no discord.js; COM /v10 no discord.py
      STREAMZ_GATEWAY_URL: ws://api:3333/gateway
      MONGO_URL: mongodb://mongo:27017
      LAVALINK_HOST: lavalink
      YOUTUBE_REFRESH_TOKENS: ${YOUTUBE_REFRESH_TOKENS:-}
    volumes: [ "./.bots:/app/.bots:ro" ]
    depends_on: [api, lavalink, mongo]
    mem_limit: 384m
  mongo:
    image: mongo:7
    profiles: ["bots-oss"]
    volumes: [ "vocard-mongo:/data/db" ]
    mem_limit: 512m          # o servidor tem 6 vCPU / 15 GB: teto é obrigatório
```

Variáveis novas no `.env.example`: `YOUTUBE_REFRESH_TOKENS` (já existe),
`MONGO_URL`/`MONGO_*` e, por bot, o que o manifesto pedir.
No `docker-compose.traefik.yml`, `cpuset` para não brigar com a API (o override
já faz isso para `lavalink` e `bot-musica`).

**Atenção ao detalhe que separa as duas libs** (e já custou uma fase):
discord.js quer `rest.api` **sem** a versão (`…/api`, a lib acrescenta `/v10`);
discord.py quer `Route.BASE` **com** a versão (`…/api/v10`) **e** a segunda
linha, `DiscordWebSocket.DEFAULT_GATEWAY` — sem ela o bot faz o REST contra nós
e abre o WebSocket **no Discord de verdade**, que recusa o token com 4004.

### 6.4 O bloqueio que não é nosso — diga antes, não depois

Música **não emite som** enquanto o dono do servidor não fizer, na ordem
(`PENDENCIAS.md` §1 e `.env.example` linhas 146-187):

1. **DNS**: `voz.streamz.chat` → **143.95.161.17**, **nuvem cinza** (DNS only) na
   Cloudflare — laranja mata o WS que fica em silêncio entre faixas.
2. **Firewall**: **7883/udp** aberto no sistema **e** no painel do provedor.
   Porta fechada = o bot conecta o WS e nunca fala, **sem erro nenhum**; confira
   com um pacote de descoberta e a linha no log da ponte antes de culpar o
   código.
3. `.env`: `PONTE_VOZ_SEGREDO` (32+ caracteres), `PONTE_VOZ_IP_PUBLICO`,
   `VOZ_DOMAIN=voz.streamz.chat`, `LAVALINK_SENHA`.
4. `docker compose --profile bots-oss up -d --build ponte-voz lavalink mongo bot-vocard`
   (com o override do Traefik em produção, para o WS da ponte ter TLS).
5. Provisionar: a conta precisa estar em `PLATFORM_ADMIN_EMAILS`, com e-mail
   verificado, para o aplicativo receber o selo de oficial.
6. **R2**: sem storage, o ícone não sobe (503, é aviso) e o app fica com a
   inicial do nome.

Isto vale **igual** para o nosso bot de música e para o Vocard. Vendorizar não
desbloqueia nada aqui, e nenhum cartão deste plano deve prometer áudio antes
de (1) e (2) existirem.

---

## 7. O que acontece com os nossos bots

Regra geral: **aposentar é um segundo passo, com data e prova.** O nosso bot sai
do `docker-compose.yml` (e o código, do repositório) **depois** que o
vendorizado passar na prova da bancada e ficar uma semana no ar. Até lá, os dois
convivem em perfis diferentes — o que também dá o caminho de volta.

### 7.1 Streamz Música → **Vocard** (trocar)

- **O que se perde:** os onze comandos em **pt-BR** com apelidos de prefixo
  (`!tocar`, `!fila`, `!agora`…); os textos de erro que explicam a nossa
  realidade (`SEM_PONTE_DE_VOZ`, `SEM_LAVALINK`) — o Vocard vai dizer "não
  consegui conectar" e ponto; a cor de marca `0x9be31f` nos embeds; a regra "só
  quem está no mesmo canal de voz manda nos controles" (o Vocard tem controle
  equivalente, mas por configuração); e o nosso `RodizioDeTokens`, que some
  **sem perda** porque é uma cópia do `voicelink/ratelimit.py` do próprio Vocard.
- **O que se ganha:** playlists por usuário, painel de controle com botões,
  filtros/efeitos, letras, canal de pedidos, i18n de verdade, e um projeto que
  alguém mantém que não somos nós.
- **Dados a migrar: nenhum.** O nosso bot de música **não tem estado**
  (`apps/bots/src/musica/` não grava nada; não há volume no compose).
- **Antes de trocar, a dívida honesta:** o Vocard não tem `PT.json`
  (`langs/` tem DE, EN, ES, FR, JA, KO, PL, RU, UA, VN, ZHCN, ZHTW). Um bot
  oficial do Streamz em inglês é regressão visível. Por isso o cartão B4 existe,
  e por isso ele deve virar PR para o upstream.

### 7.2 Streamz Moderação → **ModBot** (só na segunda leva)

- **O que se perde:** dez comandos em pt-BR; a hierarquia explicada em português
  (`hierarquia.ts`, `formatar.ts`); o canal de registro configurável por
  `/registro-de-moderacao`; e o tratamento de erro que traduz o 404 de rota
  inexistente em frase (`explicarErro`) — útil justamente enquanto a casca tem
  buraco.
- **Dados a migrar:** volume `bot-moderacao-dados`, um JSON por servidor:
  `{versao:1, canalDeRegistro, avisos:{<usuarioId>:[{id,moderador?,motivo,quando}]}, proximoAviso}`.
  O ModBot guarda strikes em MySQL. **É a única migração de dados com conteúdo
  humano do plano** (avisos escritos por moderadores) e merece script próprio,
  não "começa do zero".
- **Veredito:** o ModBot é melhor que o nosso em filtro, phishing e log — mas
  custa onda A + 3 cartões de API + MySQL. **Recomendo esperar** e reavaliar
  depois da onda A.

### 7.3 Streamz Níveis → **fica o nosso** (não trocar)

- Não há candidato (§3.3). O nosso tem curva testada
  (`xpDoNivel(n)=5n²+50n+100`, a mesma família da curva do MEE6), carência de 1
  min, multiplicador, canais ignorados, cargos por nível e ranking paginado.
- **Dados:** volume `niveis-dados`,
  `{versao:1, config:{anuncio,canalDeAnuncio,multiplicador,canaisIgnorados,cargosPorNivel[]}, usuarios:{<id>:{xp,mensagens,ultimoGanhoEm}}}`.
  Migrar isso para um bot que não existe seria perda pura.
- **Recomendação:** manter, e **aproveitar a onda A** para consertar o que o
  próprio bot reclama: o aviso `SEM_ROTA_DE_CARGOS` está **desatualizado** —
  `PUT /guilds/:id/members/:uid/roles/:rid` **existe** hoje. Cargo por nível
  provavelmente já funciona e ninguém percebeu (cartão D1).

### 7.4 Streamz Cargos → **fica o nosso por ora**

- Candidato MIT (`reaction-light`) usa **disnake**, lib que a casca nunca
  exercitou; candidato bem feito (`ReactionRoleBot`) é **AGPL** e está parado
  desde 2023.
- **O que o nosso tem e os dois não:** os quatro modos (`normal`, `unico`,
  `so-adicionar`, `travado`) com decisão pura e testada, o painel em pt-BR, a
  identidade de emoji personalizado **pelo id** (`id:<snowflake>`, não pelo
  nome — a armadilha que quebra painel quando alguém renomeia o emoji) e a
  reconciliação na subida.
- **Dados:** volume `cargos-dados` (**atenção: este bot lê `CARGOS_DIR`, não
  `BOTS_DADOS_DIR`** — é a única exceção do repositório e a armadilha número um
  de qualquer script de migração).
- **Recomendação:** manter; reavaliar se e quando o `reaction-light` ganhar uma
  prova de disnake no molde da F1.

### 7.5 Streamz Boas-vindas → **fica o nosso** (recomendação, não imposição)

- O candidato Apache-2.0 é o único que roda hoje sem casca nova, **e ainda assim
  é troca para menos**: só prefixo, só inglês, sem DM de boas-vindas, sem
  autorole, sem mensagem de saída, estado num `json.sqlite` commitado no repo.
- O nosso tem `{usuario} {nome} {servidor} {contagem}`, DM, autorole, mensagem
  de saída, nasce mudo e tem prova.
- **O que o candidato tem e o nosso não é uma coisa só: o cartão de imagem.** Se
  o usuário quiser isso, o caminho barato **não** é vendorizar o bot inteiro — é
  um cartão no nosso (`@napi-rs/canvas` + `POST /channels/:id/messages` multipart,
  que a casca já suporta). Se ainda assim o usuário quiser vendorizar, o §8
  onda C está escrito e é o mais barato do documento.
- **Dados:** volume `boas-vindas-dados`,
  `{versao:1, entrada:{ligado,canalId,mensagem,dm,mensagemDm}, saida:{…}, autorole:{…}}`.

### 7.6 Resumo do veredito

| Bot nosso | Ação | Motivo em uma linha |
|---|---|---|
| Música | **trocar pelo Vocard** | o OSS é melhor, já é a nossa referência, e não há dado a perder |
| Moderação | **esperar** (ModBot na 2ª leva) | ótimo candidato, mas 4 lacunas e um MySQL |
| Níveis | **manter** | não existe OSS que valha; perderíamos dados e ganharíamos menos |
| Cargos | **manter** | MIT só com disnake (lib sem prova); o bom é AGPL e está parado |
| Boas-vindas | **manter** | o candidato roda hoje, mas faz menos que o nosso |

---

## 8. Cartões de execução

Regras da casa (memória do projeto): um cartão = uma peça; todos na **mesma
worktree**, arquivos disjuntos, **sem git**; subagente **não** roda typecheck,
build, docker nem servidor; quem verifica e commita é o coordenador. Opus para
contrato/API/lógica pesada, Sonnet para o mecânico.

### Onda A — desbloquear a casca (faz-se independente de vendorizar)

| # | Cartão | Arquivos | Modelo | Depende | Pronto quando |
|---|---|---|---|---|---|
| **A1** | **Subcomandos no registro de comandos** — aceitar opções tipo 1 e 2, com os limites do Discord (≤25 subcomandos, profundidade 2, subcomando não convive com opção comum no mesmo nível); `50035` com o caminho do campo | `apps/api/src/modules/discord-compat/rest/application-commands.controller.ts` (+ o schema zod que ele usa) | **Opus** | — | um `PUT` com `/config set-x` e `/playlist add` é aceito e volta no `GET`; teste de unidade dos limites |
| **A2** | **Subcomando na interação** — `data.options` aninhado no `INTERACTION_CREATE`, `Interaction.commandName` com o caminho completo, autocomplete achando a opção em foco dentro do subcomando | `apps/api/src/modules/interactions/interactions.service.ts` (+ `tipos.ts` do módulo) | **Opus** | A1 | um clique em `/config set-playlist-limit 5` chega ao bot com `options:[{type:1,name:"set-playlist-limit",options:[…]}]` |
| **A3** | **Subcomando no composer** — sugerir `/pai filho`, analisar os argumentos, faixa "usou /pai filho" | `apps/web/lib/comandos-barra.ts`, `apps/web/stores/comandos-de-app.ts`, o ramo `/` de `Composer.tsx` | Sonnet | A1, A2 | digitar `/config ` lista os filhos; enviar dispara a interação certa; testes do parser |
| **A4** | **Tolerar comando tipo 2/3** — aceitar e guardar menu de contexto, nunca despachar, divergência declarada | `.../rest/application-commands.controller.ts` (só o ramo do `type`), `CONTRATO-F3.md` | Sonnet | A1 (mesmo arquivo → **em série**) | `tree.sync()` do Vocard (com o `ContextMenu` de `basic.py`) passa inteiro |
| **A5** | **`PATCH` de comando individual** (hoje 501) | `.../rest/application-commands.controller.ts` | Sonnet | A1, A4 (mesmo arquivo → em série) | `PATCH` edita e devolve o comando; 404 `10063` quando não existe |
| **A6** | **Prova da onda A com lib de verdade** — script que roda discord.py 2.7.1 e discord.js 14 registrando comando com subcomando e menu de contexto | `apps/api/test/discord-compat/prova-subcomandos.sh` (+ `.mjs`/`.py` auxiliares) | **Opus** | A1–A5 | as duas libs registram, aparecem no composer e respondem |

> A1, A4 e A5 tocam **o mesmo arquivo**: ou viram um cartão Opus só, ou vão em
> série. É o caso do §6.4 do processo — o coordenador decide na hora de lançar.

### Onda B — vendorizar o Vocard

| # | Cartão | Arquivos | Modelo | Depende | Pronto quando |
|---|---|---|---|---|---|
| **B0** | **ADR da decisão** — vendorizar OSS em vez de escrever os nossos; regras de licença do §5.4; o que fica nosso | `docs/adr/00NN-bots-open-source-vendorizados.md` | **Opus** | — | ADR datada, com as alternativas recusadas (fork, submódulo, reescrita) |
| **B1** | **A forma da vendorização** — `apps/bots-oss/README.md`, modelo de `ORIGEM.md`, `scripts/bots-oss/atualizar.sh`, `.gitattributes` | `apps/bots-oss/README.md`, `apps/bots-oss/MODELO-ORIGEM.md`, `scripts/bots-oss/atualizar.sh`, `.gitattributes` | **Opus** | B0 | o script baixa um commit, reaplica patches e falha alto no `.rej` |
| **B2** | **Snapshot do Vocard** — `upstream/` no commit `9447b0a4` (v2.7.3), `LICENSE` byte a byte, `ORIGEM.md` preenchido | `apps/bots-oss/vocard/{upstream/**,LICENSE,ORIGEM.md}` | Sonnet | B1 | `upstream/` idêntico ao tarball; `ORIGEM.md` com commit, licença e data |
| **B3** | **Patch de apontamento** — `Route.BASE` **com** `/v10` e `DiscordWebSocket.DEFAULT_GATEWAY`, os dois vindos de variável de ambiente | `apps/bots-oss/vocard/patches/0001-apontar-para-o-streamz.patch` | **Opus** | B2 | patch aplica limpo; sem ele, o bot abriria WS no discord.com |
| **B4** | **pt-BR do Vocard** — `langs/PT.json` completo (+ `local_langs/pt-BR.json`), como patch nosso e **candidato a PR upstream** | `apps/bots-oss/vocard/patches/0002-pt-br.patch` | Sonnet | B2 | todas as chaves de `EN.json` traduzidas; nenhuma sobrando |
| **B5** | **Imagem e entrypoint** — `Dockerfile` (python:3.11-slim, aplica patches, `requirements.txt`), `entrypoint.sh` que lê `.bots/<id>.token` e gera o `settings.json` do ambiente | `apps/bots-oss/vocard/{Dockerfile,streamz/entrypoint.sh,streamz/settings.modelo.json}` | Sonnet | B2, B3 | a imagem constrói do contexto da raiz; o token nunca aparece no log |
| **B6** | **Compose** — serviços `bot-vocard` e `mongo` no perfil `bots-oss`, volumes, `mem_limit`, `cpuset` no override do Traefik, variáveis no `.env.example` | `docker-compose.yml`, `docker-compose.traefik.yml`, `.env.example` | Sonnet | B5 | `--profile bots-oss` sobe os dois e nada mais; o perfil `bots` não muda |
| **B7** | **Provisionamento** — `aplicativo.json` + `provisionar-oss.ts` (irmão do atual, **sem tocar** em `provisionar.ts`) | `apps/bots-oss/vocard/streamz/aplicativo.json`, `apps/bots/src/provisionar-oss.ts`, `apps/bots/package.json` (um script) | **Opus** | B1 | cria a Application, grava o token, publica no diretório, marca oficial (403 = aviso), sobe o ícone (503 = aviso) |
| **B8** | **Ícone** — arte própria por script Pillow, como os outros cinco | `apps/bots/scripts/gerar-icone-vocard.py`, `apps/bots-oss/vocard/streamz/icone.png` | Sonnet | — | PNG gerado pelo script, arte própria, nada raspado |
| **B9** | **Prova de bancada** — sobe API + Lavalink + Mongo + Vocard, registra comandos, `?play`/`/tocar` respondem, e o passo de áudio **pula com motivo** se a ponte não estiver no ar | `apps/api/test/discord-compat/prova-vocard.sh` (+ `.mjs`) | **Opus** | A6, B5, B6, B7 | a prova passa sem a ponte, com o passo de áudio marcado como bloqueado |
| **B10** | **Documentação** — `apps/bots-oss/vocard/README.md`, parágrafo novo no `apps/bots/README.md` ("o que é nosso e o que é vendorizado"), item no `PENDENCIAS.md` | os três arquivos | Sonnet | B6 | quem chega entende em 2 minutos onde mexe e onde não mexe |

### Onda C — só se o usuário quiser boas-vindas vendorizado (§7.5)

| # | Cartão | Arquivos | Modelo | Depende | Pronto quando |
|---|---|---|---|---|---|
| **C1** | Snapshot `diwasatreya/Welcome-Bot` (`62fd3ead`, 2026-08-14) + `LICENSE` + `ORIGEM.md` + **`NOTICE-STREAMZ.md`** (Apache §4b) | `apps/bots-oss/welcome-bot/**` | Sonnet | B1 | aviso de modificação presente e datado |
| **C2** | Patch de apontamento (`rest.api`) + patch de idioma pt-BR das mensagens | `apps/bots-oss/welcome-bot/patches/000{1,2}-*.patch` | Sonnet | C1 | sobe apontado para a nossa API |
| **C3** | Dockerfile + entrypoint + compose + manifesto | `apps/bots-oss/welcome-bot/{Dockerfile,streamz/*}`, `docker-compose.yml` | Sonnet | C2, B7 | container sobe e o cartão de imagem chega ao canal (multipart) |

### Onda D — arrumar a casa dos nossos (barata, independente)

| # | Cartão | Arquivos | Modelo | Depende | Pronto quando |
|---|---|---|---|---|---|
| **D1** | **Tirar os avisos mortos** — `SEM_ROTA_DE_CARGOS`, `SEM_ROTA_DE_DM` e a tabela de rotas "que não existem" citam rotas que **existem** desde a F5 | `apps/bots/src/niveis/servico.ts`, `apps/bots/src/boas-vindas/servico.ts`, `apps/bots/src/moderacao/servico.ts` | Sonnet | — | cargo por nível, autorole e DM de boas-vindas exercitados na bancada |
| **D2** | **`GUILD_BAN_ADD`/`REMOVE`** no gateway (pré-requisito do ModBot, útil já) | `apps/api/src/modules/discord-compat/gateway/dispatch.ts`, eventos internos de moderação | Sonnet | — | banir/desbanir chega ao bot com o intent `GuildModeration` |
| **D3** | **`GET /guilds/:id/members`** com `?limit&after` e `?query` (pré-requisito do ModBot) | `apps/api/src/modules/discord-compat/rest/guilds.controller.ts` | **Opus** | — | `members.fetch({query})` do discord.js devolve a lista certa |
| **D4** | **Migração de dados** (só quando um bot nosso for aposentado): lê os JSON de `/dados` e escreve no banco do vendorizado; trata `CARGOS_DIR` ≠ `BOTS_DADOS_DIR` | `scripts/bots-oss/migrar-dados.mjs` | **Opus** | o bot alvo existir | roda em cópia do volume, confere contagem antes/depois, é idempotente |

**Ordem de lançamento sugerida:** A (com A6) → B0/B1 em paralelo com D1/D2/D3 →
B2..B8 em paralelo → B9 → B10. C e D4 só sob pedido.

---

## 9. Riscos, e a recomendação final

### Riscos, do que derruba mais para o que derruba menos

1. **A ponte de voz continuar bloqueada.** DNS e 7883/udp são do dono do
   servidor. Sem eles, a onda B entrega um bot que responde a tudo e não toca
   nada — exatamente o estado de hoje. **Mitigação: a prova B9 não depende de
   áudio**, e o cartão marca o passo como bloqueado com o motivo escrito.
2. **A onda A ser maior do que parece.** Subcomando toca contrato, API, web e
   o composer, que é arquivo disputado. **Mitigação:** A1/A2 Opus, A3 com lista
   fechada de arquivos, e **A6 obrigatório** — a lição das fases F1/F2/F3 é que
   só a lib de verdade acha o defeito.
3. **Manutenção do vendorizado.** Congelar é a escolha certa, mas um dia o
   upstream conserta algo que precisamos. **Mitigação:** `ORIGEM.md` + patches
   numerados + `atualizar.sh`. Sem isso, seis meses viram um fork órfão.
4. **MongoDB no servidor.** Mais um banco, mais 512 MB de teto, mais um backup a
   pensar (o Postgres já tem pendência de backup). **Mitigação:** `mem_limit`
   desde o primeiro dia e a pergunta honesta na revisão: o que se perde usando o
   Vocard sem playlists persistentes?
5. **Regressão de idioma.** Um bot oficial em inglês é visível para todo usuário.
   **Mitigação:** B4 é cartão obrigatório da onda, não "depois".
6. **Licença lida errado.** Já aconteceu neste levantamento (LavaMusic diz
   GPL-3.0 no `package.json` e tem LICENSE proprietário). **Mitigação:** o
   `ORIGEM.md` registra o **texto** da licença, conferido no arquivo, e AGPL/
   *source-available* não entram sem ADR.
7. **Multi-instância.** O `onEvent` local da ponte de eventos e o registro de
   sessões do gateway são por processo. Enquanto a API for um contêiner só, não
   morde. É dívida antiga, e este plano não a aumenta.

### A recomendação, sem bajulação

**Vendorizar os cinco de uma vez é caro demais.** Os números: dos seis
candidatos sérios, **cinco são bloqueados pela mesma lacuna** (subcomando);
**dois** precisam também de menu de contexto; **um** precisa de mais três rotas;
**um** exige decisão de licença AGPL; e **uma das cinco funções — níveis — não
tem candidato nenhum** que sobreviva a uma leitura de data de commit. Somando
vendorização de cinco projetos (~10 cartões cada), a onda de casca e quatro
bancos novos, é um plano de ~50 cartões que entrega, no melhor caso, **um bot
melhor (música), dois empates e dois retrocessos**.

O caminho que eu recomendo, nesta ordem:

1. **Onda A (6 cartões).** Subcomandos e tolerância a menu de contexto. Faça
   mesmo que o resto do plano seja engavetado: é paridade que devíamos ter, e
   vale para qualquer bot que um usuário hospede.
2. **Onda B (11 cartões): vendorize o Vocard, e só ele.** É a função que o
   usuário mais quer, é onde o OSS é claramente melhor, o nosso bot **não tem
   dado a perder**, e a nossa configuração de Lavalink **já é a dele**.
3. **Onda D (4 cartões), em paralelo.** Barata, independente, e conserta uma
   mentira que está no código hoje (rotas "que não existem" e existem).
4. **Reavalie moderação depois da onda A.** Com subcomandos e menus de contexto
   tolerados, o ModBot fica a três cartões de distância — e aí a conta muda.
5. **Níveis, cargos e boas-vindas ficam nossos**, com o porquê escrito no §7.
   Se um dia o `reaction-light` ganhar uma prova de disnake, cargos volta à mesa.

E o conselho que vale mais que o plano: **a casca é o produto.** Cada lacuna
fechada no §4 serve ao Vocard, ao ModBot, ao bot que um usuário escrever amanhã
e ao que ele copiar de um tutorial. Cada patch escrito num bot vendorizado serve
a um bot só, e volta como dívida na próxima atualização. Quando estiver em
dúvida entre remendar o bot e consertar a casca, **conserte a casca**.

---

## 10. Referências conferidas (2026-09-21)

Do repositório: `CLAUDE.md`, `PENDENCIAS.md` §1,
`docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`, `docs/CONTRATO-ONDA-3.md`,
`apps/bots/{README.md,CONTRATO.md,package.json,Dockerfile}`,
`apps/bots/src/{runtime,musica,moderacao,niveis,cargos,boas-vindas}/**`,
`apps/bots/src/provisionar.ts`, `apps/bots/lavalink/application.yml`,
`apps/api/src/modules/discord-compat/**` (73 arquivos),
`apps/api/src/modules/interactions/**`, `apps/ponte-voz/**` e
`apps/ponte-voz/CONTRATO-F2.md`, `docker-compose{,.traefik}.yml`, `.env.example`.

Dos projetos (API do GitHub e arquivos crus, 2026-09-21):

- Vocard — <https://github.com/ChocoMeow/Vocard> · MIT · HEAD `9447b0a4`
  (2026-05-09) · v2.7.3 · `requirements.txt` (`discord.py==2.7.1`, `motor`) ·
  `commands.hybrid_group` em `cogs/playlist.py:283`, `cogs/settings.py:66`,
  `cogs/basic.py:480` · `app_commands.ContextMenu` em `cogs/basic.py:70` ·
  `main.py:224-240` (`Intents.default()`, `chunk_guilds_at_startup=False`) ·
  `settings Example.json` (`yt_ratelimit`)
- Muse — <https://github.com/museofficial/muse> · MIT · HEAD `690d06af`
  (2026-09-20) · v2.11.8 · `package.json` (`discord.js` 14.11.0,
  `@discordjs/voice` 0.19.2, yt-dlp, Prisma) · `addSubcommand` em
  `src/commands/{config,favorites}.ts`
- LavaMusic — <https://github.com/bongo-devs/lavamusic> · **`LICENSE` =
  "LAVAMUSIC LICENSE Version 1.0"** (uso público/comercial/redistribuição exigem
  licença paga) enquanto o `package.json` diz `GPL-3.0`; GitHub classifica como
  `NOASSERTION`
- ModBot — <https://github.com/aternosorg/modbot> · MIT (Aternos GmbH) · HEAD
  `bbaf4ca7` (2026-09-08) · v3.9.0 · `discord.js ^14.26.2`, `mysql2`, Node ≥22 ·
  `members.fetch({query})`, `invites.fetch`, intent `GuildModeration`
- discord-js-bot — <https://github.com/saiteja-madha/discord-js-bot> · MIT ·
  último push 2025-10-24 · 8 001 arquivos, painel com `bower_components`
- Red-DiscordBot — <https://github.com/Cog-Creators/Red-DiscordBot> · GPL-3.0
- Ree6 — <https://github.com/Ree6-Applications/Ree6> · GPL-3.0 · Java/JDA
- NetLevel-Bot — <https://github.com/TFAGaming/NetLevel-Bot> · GPL-3.0 · 13
  estrelas · último push 2025-04-07
- Lurkr — só o site é público (`almeidx/lurkr-website`, AGPL-3.0); o bot **não é
  open source**
- ReactionRoleBot — <https://github.com/Mimickal/ReactionRoleBot> · AGPL-3.0 ·
  HEAD `37844305` (2023-11-26) · v3.1.0
- reaction-light — <https://github.com/eibex/reaction-light> · MIT · HEAD
  `abac277e` (2026-05-07) · v3.5.2 · `requirements.txt` = `disnake>=2.5.0` ·
  grupos em `cogs/{settings,control,message}.py`
- Welcome-Bot (diwasatreya) — <https://github.com/diwasatreya/Welcome-Bot> ·
  Apache-2.0, **sem `NOTICE`** · HEAD `62fd3ead` (2026-08-14) · `discord.js
  ^14.16.3`, `@napi-rs/canvas`, `quick.db` · sem subcomando, sem menu de
  contexto, sem `members.fetch`
- Welcome-Bot (InfusionBot) — LGPL-2.1 · **arquivado**
- Welcomer — <https://github.com/WelcomerTeam/Welcomer> · AGPL-3.0 · Go
