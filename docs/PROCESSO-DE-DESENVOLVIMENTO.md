# Como o Streamz é desenvolvido neste servidor

Guia para quem chega agora (pessoa ou sessão do Claude) e precisa mexer no
Streamz sem quebrar o que os outros estão fazendo. Consolidado em 2026-09-02,
depois de um dia com treze PRs (#38 a #50) e três versões do desktop
(0.0.6, 0.0.7, 0.0.8). Tudo aqui foi feito e verificado; onde não foi, está
dito.

## 1. O sistema em uma página

- **Repositório**: `MirandaSls/streamz` (privado). Monorepo pnpm:
  - `apps/api` — NestJS + Prisma + socket.io (gateway de chat e voz).
  - `apps/web` — Next.js + zustand + livekit-client. É o app inteiro; o desktop
    embute o build estático dela (`apps/web/out`).
  - `apps/desktop` — Tauri 2 (Rust). Só a casca: janela, bandeja, auto-update,
    notificações. `decorations: false`; a barra de título é nossa (§7).
  - `packages/shared` — contratos: eventos WS, constantes (`canais.ts`,
    `midia.ts`), tipos.
- **Produção**: este servidor (`143.95.161.17`, Ubuntu, 6 vCPU). Domínios
  `streamz.chat` (web), `api.streamz.chat`, `livekit.streamz.chat`. Traefik em
  `/opt/stack/traefik` (não leia o `.env` dele: o classificador bloqueia). A
  aplicação em `/opt/stack/streamz`, com `docker compose` e três overrides:
  `docker-compose.yml` + `docker-compose.traefik.yml` + `docker-compose.ghcr.yml`
  (este último troca "buildar aqui" por "puxar a imagem que o CI publicou").
- **Segredos**: `/root/.secrets/generated.env`, `/opt/stack/streamz/.env`,
  chave de assinatura do desktop em `/root/.tauri/streamz.key` (§5). Nunca
  copie nem imprima assinaturas e tokens em PR, mensagem ou log.
- **O host não tem node**. Tudo de JS roda em `docker run node:22` (§3).

## 2. Regras de convivência no servidor

Várias sessões do Claude trabalham no mesmo clone ao mesmo tempo. As regras
existem porque cada uma foi aprendida com um estrago.

1. **Nunca dê `checkout`/`switch` em `/opt/stack/streamz`.** O HEAD e o índice
   são compartilhados. Crie uma worktree por branch:
   `git -C /opt/stack/streamz worktree add .claude/worktrees/<nome> -b <tipo>/<slug> origin/main`.
   Trabalhe só dentro dela. Antes de mexer, confira `git status` e
   `git worktree list`.
2. **Não remova worktrees** (`git worktree remove` é bloqueado pelo
   classificador). Deixe para o usuário, com o comando pronto.
3. **Descubra quem está vivo com `ListAgents`** antes de assumir que um arquivo
   é seu. Sessões `interactive`/`busy` estão trabalhando; `Remote Control
   offline` não. Um socket morto (`ENOENT`) significa que a sessão acabou.
4. **Reserve arquivos por mensagem** (`SendMessage`) quando duas sessões vão
   tocar a mesma área: diga quais arquivos são seus e quais não são. Se outra
   sessão discordar com prova (histórico de PR, medição), ceda.
5. **Autorização para ir ao ar vem do usuário, na conversa de quem age.** Uma
   sessão não mergeia por "outra sessão disse que o usuário aprovou". O padrão
   que funcionou: a sessão que implementa abre o PR e avisa; a sessão que tem a
   autorização do usuário mergeia.
6. **Ações que o classificador bloqueia** (não insista; entregue o comando ao
   usuário com `!`): `git worktree remove`, ler `/opt/stack/traefik/`, `psql`
   na tabela `User`, `gh pr review --approve`. `cd X && git log` pode ser
   negado quando `git -C X log` passa.

## 3. Fluxo de uma mudança

### 3.1 Branch e worktree
`feat/…`, `fix/…`, `chore/…`, `docs/…`, sempre a partir de `origin/main`
atualizado. Se o `main` andar enquanto você trabalha, `git merge origin/main`
na sua branch antes de abrir o PR.

### 3.2 Verificação local (obrigatória antes do PR)
Tudo via docker, na worktree:

```
docker run --rm -v /opt/stack/streamz/.claude/worktrees/<nome>:/w -w /w -e CI=1 node:22 bash -lc "
  corepack enable
  pnpm install --frozen-lockfile >/dev/null 2>&1
  pnpm --filter @streamz/shared build
  pnpm --filter @streamz/api exec prisma generate >/dev/null 2>&1
  pnpm --filter @streamz/api exec tsc --noEmit && pnpm --filter @streamz/api test
  pnpm --filter @streamz/web exec tsc --noEmit && pnpm --filter @streamz/web lint
  pnpm --filter @streamz/web test && pnpm --filter @streamz/web build"
```

Sem `shared build` o `tsc` da API falha (ela resolve o `dist`). Sem
`prisma generate` a API acusa `rows` implícito `any`. Rust não compila aqui; o
CI tem um job `clippy + fmt (src-tauri)` que roda em PR quando `apps/desktop/`
muda.

### 3.3 O que typecheck e testes NÃO pegam
Em um dia, cinco erros passaram por tudo isso e só apareceram olhando: três
ícones que viravam mancha preta (caminhos brancos que eram "furo" no SVG
original), um ativo chamado `explore.svg` que não é bússola, e um composer com
50px mortos. Regra: **mudança visual exige renderizar e olhar** (§6.5). Quando
ninguém consegue abrir a tela logada, o PR tem que dizer "não visto em app
rodando", e a validação é o usuário mandar prints.

### 3.4 Commit e PR
- Mensagens em português, no estilo do repo (`git log --oneline -20`):
  `fix(voz): …`, `feat(ui): …`, `chore(desktop): versão 0.0.8`. Corpo com o
  "por quê". Um commit por assunto.
- PR com `gh pr create --base main`. Corpo com: o que acontecia, o que muda,
  arquivos, o que ficou inerte ou fora de escopo, o que não foi verificado, e
  "como testar" com passos manuais. Para mudança visual: tabela
  Discord / nosso antes / nosso depois por item (§6).
- Não mergeie sem autorização do usuário (§2.5).

### 3.5 CI e deploy
- Um push em PR roda `CI` (`typecheck + testes + build`, `build das imagens`).
  Um push em `main` roda o mesmo e, no fim, o job `deploy em produção`
  (`deploy.yml` é chamado pelo `ci.yml`; não tem gatilho próprio).
- Duração típica do `main` completo: 8 a 11 minutos. O deploy é um por vez
  (`concurrency: deploy-producao`); um merge logo atrás do outro **cancela o run
  anterior** e o mais novo leva os dois.
- Merge: `gh pr merge <n> --merge` quando `gh pr view <n> --json mergeStateStatus`
  devolve `CLEAN`.
- Confirmação: `docker ps --filter name=streamz` mostra as imagens
  `ghcr.io/mirandasls/streamz-{web,api}:sha-<7>`; `/api/health` devolve a tag.
- **Falha conhecida e inofensiva**: `build das imagens` cai com
  `@prisma/engines postinstall: Error: aborted` (download dos motores do Prisma
  abortou no runner). É rede. `gh run rerun <id> --failed` resolve.
- Para acompanhar sem poluir: `gh pr checks <n> --watch --interval 30` em
  segundo plano, ou um laço em `gh run view <id> --json status`.

## 4. Onde as coisas estão (mapa de componentes)

| Área | Arquivos |
|---|---|
| Shell do app | `apps/web/app/app/page.tsx` (rail + coluna + conteúdo; `VoiceLayer`, `BarraDeTitulo`) |
| Rail de servidores | `components/layout/GuildRail.tsx` |
| Coluna de DMs / canais | `components/layout/DMList.tsx`, `ChannelSidebar.tsx` |
| Card do usuário (mic/fone/engrenagem) | `components/layout/UserFooter.tsx` (irmão de rail+coluna, atravessa a rail), `voice/VoiceConnectedBar.tsx` |
| Conversa (DM) | `components/chat/DMView.tsx`, `HeaderBar.tsx`, `Composer.tsx`, `MessageList.tsx`, painel de perfil em DM 1:1 |
| Canal de texto | `components/chat/ChatView.tsx` |
| Amigos | `components/friends/FriendsPage.tsx`, `FriendRow.tsx`, `AddFriend.tsx` |
| Caixa de entrada | `components/chat/InboxPopover.tsx` (+ `HeaderPopover.tsx`) |
| Modal "Nova mensagem" | `components/modals/CreateGroupDMModal.tsx` |
| Ícones | `components/ui/icones.tsx` — **único** ponto de importação de ícone (§6.2) |
| Voz (estado) | `stores/voice.ts`, `voice-saida.ts`, `voice-retomada.ts`, `voice-reconexao.ts`, `voicePrefs.ts`, `voiceDevices.ts` |
| Voz (UI) | `components/voice/*` — `VoiceLayer.tsx` (global), `AudioRemotoHost.tsx` (global), `VoiceGrid.tsx`, `CallStage.tsx`, `VoicePanel.tsx`, `VoiceHotkeys.tsx`, `ScreenSharePicker.tsx` |
| Desktop | `components/desktop/BarraDeTitulo.tsx`, `useAtualizacao.ts`, `JanelaSplash.tsx` + `janela-splash.ts` (janelinha de abertura/atualização, rota `app/splash/`); `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/{default,splash}.json` |
| Atalhos | `lib/shortcuts.ts`, `hooks/useKeyboardShortcuts.ts` (M/D de voz são do `VoiceHotkeys`) |
| Gateway de voz | `apps/api/src/modules/gateway/chat.gateway.ts`, `voz-em-um-lugar-so.ts`, `modules/voice/*` |
| Updates do desktop | `apps/api/src/modules/updates/*`; site de download em `modules/downloads/*` |
| Estilos globais | `apps/web/app/globals.css` (foco: anel afastado para botões, 1px colado para campos), `tailwind.config.ts` (tokens) |

## 5. Publicar uma versão do desktop

O app consulta `GET /api/updates/{target}/{arch}/{versão}` na abertura: 204
quando não há nada, ou um manifesto assinado. A chave privada está em
`/root/.tauri/streamz.key` (e no segredo `TAURI_SIGNING_PRIVATE_KEY` do repo);
a pública em `tauri.conf.json`. Perder a privada = ninguém atualiza mais.

Passo a passo, como foi feito para 0.0.6, 0.0.7 e 0.0.8:

1. **Bump** em quatro lugares, numa worktree própria: `apps/desktop/package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (linha 3) e
   `src-tauri/Cargo.lock` (a linha `version` logo abaixo de
   `name = "streamz-desktop"`). Commit `chore(desktop): versão X.Y.Z`, PR,
   merge. Pode ser aberto antes dos outros PRs; o que importa é o `main` na
   hora do build.
2. **Build assinado**: `gh workflow run desktop.yml --ref main -f release=true`.
   Leva ~30 minutos. Pegue o id em `gh run list --workflow=desktop.yml --limit 1`
   e acompanhe com um monitor de até 1 hora (um `until` em bash morre em 10).
   **Ou, de graça, neste servidor:** `scripts/build-desktop-no-servidor.sh`
   (~1 min com cache quente) — ver §5.3, inclusive o que só o Windows prova.
3. **Publicar** (o script usado está em
   `scratchpad/publicar-0.0.8.sh` da sessão que fez; recrie se precisar):
   - `gh run download <id> -R MirandaSls/streamz -n streamz-windows -D <dir>`
     → `nsis/Streamz_X.Y.Z_x64-setup.exe` e `.exe.sig`.
   - copiar o `.exe` para `/opt/stack/streamz/updates/` (o que o atualizador
     baixa) **e** para `/opt/stack/streamz/downloads/` (o que o site serve; ele
     escolhe o mais novo sozinho).
   - no `.env`: `DESKTOP_UPDATE_VERSION`, `DESKTOP_UPDATE_URL`
     (`https://api.streamz.chat/api/updates/arquivo/<nome>`),
     `DESKTOP_UPDATE_SIGNATURE` (conteúdo do `.sig`), `DESKTOP_UPDATE_NOTES`.
   - recriar a API **com a tag que está no ar**, senão o compose tenta puxar
     `:latest` do GHCR e falha com `unauthorized`:
     `STREAMZ_TAG=sha-<7> docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.ghcr.yml --profile livekit up -d api`.
     `docker restart` não serve: não relê o `.env`.
   - verificar: manifesto da versão anterior → 200 com a nova; da nova → 204;
     download do arquivo → 200 com o tamanho certo; `/api/health` ok.
4. O deploy seguinte da web recria a API e **preserva** o `.env`; o manifesto
   continua valendo.
5. O primeiro salto de quem está antes da 0.0.3 é manual (a chave pública mora
   no app instalado).

**A atualização acontece numa janelinha própria** (§5.2), não dentro do app.
`plugins.updater.windows.installMode` é `"quiet"` (o NSIS roda com `/S /R`, sem
janela do instalador). Duas consequências: com
`bundle.windows.nsis.installMode: "perMachine"` o **UAC continua aparecendo**
uma vez por atualização (silêncio é do instalador, não da elevação), e o plugin
chama `exit(0)` logo depois de disparar o instalador — no Windows o app morre em
"Instalando…" e quem reabre é o `/R`, então "Reiniciando…" e o `relaunch()` só
se veem fora dali.

O desktop embute a web: o que entra em `main` depois do build só chega ao
instalado na versão seguinte.

### 5.1 O instalador é o padrão do Tauri (NSIS)

Em 2026-09-03 o PR #79 trouxe um template NSIS próprio (tema escuro, arte,
ícone animado por `SysAnimate32`, fechar sozinho e abrir o app). Custou três
builds de ~35 min (comentário com `{{...}}` quebra o Handlebars; `${__FILEDIR__}`
sem separador final no makensis do Windows; `File` não aceita barra normal) e
o resultado saiu com o **corpo branco** do MUI apesar do cabeçalho escuro. O
usuário viu as prints e preferiu o instalador padrão: o PR seguinte apagou
`nsis/` e deixou só `installerIcon`. Se voltar a esse assunto, o histórico do
#79 tem o template, o `gerar-arte.py` e o harness de fumaça.

### 5.2 A janelinha de abertura e atualização (`splash`)

Desde o PR #88, abrir e atualizar o Streamz é uma **janela de 300×350** no meio
da tela, como a do Discord — não uma tela dentro do app. O que existe:

- `tauri.conf.json`: a janela `main` nasce `"visible": false` e a janela
  `splash` (300×350, `center`, `resizable: false`, `decorations: false`,
  `transparent: true`, `shadow: false`, `visible: false`) aponta para
  `"url": "splash/"`. Com `trailingSlash: true` o export gera
  `out/splash/index.html`, e o `get_asset` do Tauri tira a barra final e tenta
  `<caminho>/index.html` — a mesma URL serve no `tauri dev` (`next dev`).
- `apps/web/app/splash/page.tsx` → `components/desktop/JanelaSplash.tsx`
  (leiaute medido nas referências, com a tabela no topo do arquivo) e
  `janela-splash.ts` (parte pura, testada).
- **Na abertura**: a janelinha se mostra no primeiro quadro (nasce escondida
  porque o WebView2 pinta um quadro branco antes do primeiro render), chama
  `check()` com teto de 8s e: sem versão nova, erro de rede ou tempo esgotado →
  `show()` + foco na `main` e fecha; com versão nova → `downloadAndInstall`,
  com a porcentagem vinda dos eventos de download. Exibição mínima de 600ms
  para não piscar.
- **Com o app já aberto**: a setinha verde da barra (`useAtualizacao.abrir`)
  cria a mesma janela com `splash/?modo=atualizar`, espera o `tauri://created`
  e só então esconde a `main`. Erro vira evento `splash:erro` → toast na
  janela principal, que volta.
- Permissões: `capabilities/splash.json` (janela `splash`) com `updater:default`
  (= `allow-check`, `allow-download`, `allow-install`,
  `allow-download-and-install` na 2.11.0), `process:allow-restart`, `show`,
  `hide`, `set-focus`, `unminimize`, `close` e `start-dragging`; a `default.json`
  (janela `main`) ganhou `core:webview:allow-create-webview-window` e trocou
  `updater:default` por `updater:allow-check`. **Confira os nomes na versão
  presa no `Cargo.lock`** (`permissions/*/autogenerated/` do crate), não de
  memória — foi assim que os desta janela foram escolhidos.
- `main.rs`: o `CloseRequested` só esconde a janela **`main`** (bandeja). Se a
  `splash` também fosse escondida, o rótulo continuaria ocupado e a próxima
  atualização não conseguiria criar a janela.
- A rede de segurança quando o JS da janelinha não sobe continua sendo a
  bandeja ("Abrir Streamz"), porque a `main` nasce invisível.

### 5.3 Instalador sem o Actions (build no próprio servidor)

O runner `windows-latest` custa **2× minuto** em repositório privado e cada
instalador leva ~35 min lá. Desde 2026-09-03 o mesmo `.exe` assinado sai deste
servidor Linux, em Docker, sem gastar nada:

```bash
scripts/build-desktop-no-servidor.sh            # origin/main, assinado
scripts/build-desktop-no-servidor.sh <ref>      # outro commit
scripts/build-desktop-no-servidor.sh --sem-assinar
```

Sai em `.claude/saida-desktop/<versão>-<commit>/`: `Streamz_X.Y.Z_x64-setup.exe`
e `.exe.sig`. Daí em diante o §5 segue igual (copiar para `updates/` e
`downloads/`, preencher o `.env`, recriar a API).

**Como funciona.** `apps/desktop/Dockerfile.xwin` monta `rust:1-bookworm` +
`cargo-xwin` + clang/lld 21 + NSIS + node 22. O `cargo-xwin` baixa a CRT e o
SDK do Windows dos endereços públicos da Microsoft e põe `clang-cl`/`lld-link`
no lugar de `cl.exe`/`link.exe`. **O alvo é o mesmo do CI**
(`x86_64-pc-windows-msvc`): mesma ABI, mesmo `+crt-static` do
`.cargo/config.toml`, mesma `libwebrtc` pré-compilada que o `webrtc-sys` baixa
no Windows. Não é mingw. O empacotador NSIS do `tauri-bundler` já roda no
Linux sem gambiarra: fora do Windows ele chama o `makensis` do PATH e só baixa
o plugin `nsis_tauri_utils.dll`. A assinatura do atualizador é minisign em
Rust puro e funciona em qualquer sistema.

**Números da primeira prova (commit `3221908`, versão 0.0.16):**

| | |
|---|---|
| imagem Docker | ~2 min, 0,8 GB |
| primeira rodada (tudo frio, baixa CRT+SDK do Windows) | ~17 min |
| worktree nova, caches quentes | 3 min 36 s |
| mesma worktree, incremental | ~1 min 20 s |
| caches em volumes | `streamz-xwin-cache` 1,1 GB · `streamz-pnpm` 1,1 GB · `streamz-cargo` 0,8 GB · `streamz-xdg` 23 MB |
| `target/` na worktree | 2,6 GB |
| instalador gerado | 12 643 158 bytes |
| instalador do CI (mesma versão) | 12 585 908 bytes (+0,45 %) |

A assinatura foi conferida contra a **chave pública que está dentro do app**
(`plugins.updater.pubkey` do `tauri.conf.json`): keyID igual e Ed25519
`Signature Verified Successfully` sobre o blake2b do arquivo. É a mesma
verificação que o atualizador faz no cliente.

**Duas armadilhas que custaram rodadas** (estão comentadas no script e no
Dockerfile; não desfaça sem ler):

1. **A UCRT some no link.** O `tauri build` exporta `STATIC_VCRUNTIME=true`, e
   com isso o `static_vcruntime.rs` do `tauri-build` emite
   `/NODEFAULTLIB:libucrt.lib` + `/DEFAULTLIB:ucrt.lib` (CRT estática com UCRT
   **dinâmica** — o que o Windows monta). O `cargo-xwin`, vendo `+crt-static`,
   acrescenta `-nodefaultlib:ucrt -defaultlib:libucrt`, querendo a UCRT
   estática. Um cancela o outro e o binário fica sem UCRT nenhuma: centenas de
   `undefined symbol: cos/sin/strlen/_wassert`. A saída é passar a `ucrt.lib`
   como **arquivo de entrada** (`-C link-arg=<caminho>/ucrt.lib`), que o
   `/NODEFAULTLIB` não alcança. Sintoma enganoso: `cargo xwin build` sozinho
   linka de boa, porque só o `tauri build` liga o `STATIC_VCRUNTIME`.
2. **"Can't detect any appindicator library".** O `tauri-cli` tem um bloco
   `#[cfg(target_os = "linux")]` que olha o **hospedeiro**, não o alvo: com a
   feature `tray-icon` ligada ele exige o appindicator via `pkg-config` e entra
   em pânico, mesmo compilando para Windows. O resultado só alimentaria as
   dependências do `.deb` e do AppImage, que este build nunca gera. A imagem
   responde com um `.pc` de fachada em vez de arrastar 146 pacotes de GTK.

**O que este build NÃO prova.** Que o instalador instala e que o app abre —
isso continua só o Windows dizendo. O `wine` não serve de substituto aqui: o
stub do NSIS é PE32 (todo instalador NSIS é), então precisaria de wine 32 bits,
e o app depende do WebView2, que o wine não tem. A recomendação prática: gerar
aqui, e antes de publicar em `updates/` instalar uma vez numa máquina Windows.
(O `file` mostra o stub do NSIS como PE32 — todo instalador NSIS é 32 bits; o
binário do app que ele carrega dentro é PE32+ x86-64, e o do CI é igual.)
O build também não é bit a bit reprodutível: duas rodadas do mesmo commit
saíram com ~6 KB de diferença, coisa de timestamp dentro do LZMA do NSIS.
O `desktop.yml` continua no repositório e continua sendo a referência — se algo
divergir, ele é o desempate.

Diferenças conhecidas e aceitas em relação ao artefato do CI: o NSIS é o 3.08
do Debian (no Windows o bundler baixa o 3.11), e o `.exe` sai sem assinatura
Authenticode — igual ao do CI, que também não tem certificado.

## 6. Paridade visual com o Discord (o método)

O objetivo do usuário é "idêntico ao Discord", com uma exceção fixa: **cores e
tokens de paleta não mudam**. Só forma, tamanho, espaçamento e ícone.

### 6.1 Fontes de verdade
- Prints do Discord e do nosso app em `docs/Reference/Captura de tela *.png`,
  1:1 (janela maximizada, zoom 100%, 1919x1079). Os nomes são carimbos de hora;
  o usuário coloca novos e avisa. Se um print for "nosso" ou "do Discord" não
  é óbvio pelo nome: olhe.
- Acervo de ícones oficiais em `docs/Reference/Discord assets icons/`
  (`ACERVO.md` explica): `svg/` (229, exportação oficial do Figma, **preferida**,
  com `MAPA.md` e `USADOS-NA-INTERFACE.md` que cruza cada tela com o arquivo),
  `figma/` (630 gerados da geometria; **nunca** `figma/_suspeitos/`, 48 saem
  errados), `Collections/` (893 PNGs). Cada pasta tem `_folha*.png` (folha de
  contato) para achar o ícone olhando.

### 6.2 Vocabulário de ícones
`apps/web/components/ui/icones.tsx` é o único lugar de onde o app importa
ícone. Ativos do Discord entram pela fábrica `doDiscord`/`QUADRO`, com o
**mesmo nome do componente lucide** que existia (`Search`, `Plus`,
`ChevronDown`…), aceitando `size`, `className` e props de `<svg>`. O que não
tem ativo fica reexportado do Phosphor (marcas utilitárias) ou do lucide (três
sem equivalente) pelo mesmo arquivo, com o motivo em comentário. "Todos é
todos": marca utilitária com ativo no acervo também troca. Não importe de
`lucide-react` nem de `@phosphor-icons/react` fora desse arquivo
(`ScreenSharePicker.tsx` é a única exceção histórica, e está sendo reescrito).

### 6.3 Medir, não estimar
Pillow via docker (o host não tem Pillow nem ImageMagick):

```
docker run --rm -v "/opt/stack/streamz/docs/Reference:/ref:ro" -v "<dir>:/out" \
  -v "<script>.py:/s.py:ro" python:3-slim sh -c "pip install --quiet pillow && python /s.py"
```

Recorte a região, amplie com `Image.NEAREST`, **olhe** o PNG, e tire números de
`getpixel` (varrer uma coluna/linha até a cor mudar dá altura, largura, raio e
posição). Toda medida citada em PR tem que ter vindo daí. Se não dá para medir
com confiança, diga "não medido" em vez de chutar. Um número inventado vira um
pixel errado no app.

### 6.4 Paralelizar sem colidir
Migração grande (83 arquivos) funcionou assim, e é o modelo:
1. **Fase A, sequencial**: fechar o vocabulário inteiro (`icones.tsx`) e
   commitar verde antes de qualquer consumo.
2. **Fase B, paralela**: 3 ou 4 agentes com lotes de arquivos **disjuntos**,
   cada um só trocando imports; proibidos de tocar nos arquivos compartilhados
   (`icones.tsx`, `tailwind.config.ts`, `design.md`, `page.tsx`). Quem acha um
   ícone faltando **relata**, não cria.
3. **Fase C**: tamanhos das superfícies, também por lotes disjuntos, seguida de
   uma passada sequencial de coerência (cabeçalhos que deixaram de casar,
   glifos apertados na casa nova).
4. Typecheck, lint, testes e build **uma vez, no fim**, por quem coordena:
   agentes rodando verificação sobre a árvore parcial dos outros dá falso
   vermelho.
5. Critério de conclusão mecânico (ex.: `grep -rl lucide-react apps/web` só
   pode devolver a exceção conhecida).

### 6.5 Verificação visual
- Renderize o vocabulário inteiro numa folha de contato em `currentColor` e
  olhe. Foi o que pegou os três ícones quebrados.
- Para tela, o ideal é abrir logado; ninguém aqui tem a conta do usuário e não
  se deve usar. Então: aritmética conferida + pedir prints ao usuário. Diga no
  PR o que não foi visto.
- Lista de prints que o usuário tira para validar (mesmo tamanho de janela do
  Discord): Amigos com amigos online, conversa com mensagens, cabeçalho e
  composer, card do usuário em quatro estados e em call, popover do microfone,
  seletor de tela, configurações, menu do servidor, hover de mensagem, popover
  de perfil, modais menores, e o fluxo da call em dois dispositivos.

### 6.6 Decisões já tomadas (não reabrir sem o usuário)
- Cores e tokens: intocados. Nova superfície usa o token existente mais próximo
  e o PR registra a diferença.
- Nitro, Loja, Missões e o painel "Ativo agora": não criar.
- Botões sem função no nosso app (presente e apps no composer, filtros na caixa
  de entrada): existem como visual, inertes, com tooltip, registrados no PR.
- Barra de título e caixa de entrada/ajuda: no desktop moram na barra; no
  navegador ficam no cabeçalho de Amigos (como o Discord web).
- Foco: anel afastado de 2px para botões/links; campos de texto focam com 1px
  colado, no verde do `design.md`.
- Card do usuário: flutuante, 58px, raio 8, atravessa a rail (irmão de rail e
  coluna, `inset-x-2.5`), listas e rail com respiro embaixo (`pb-[78px]`).
- Configurações (usuário, servidor, canal e grupo, todas na mesma moldura
  `components/ui/JanelaDeConfiguracoes.tsx`): **janela flutuante** de 1400×888
  centrada sobre o app escurecido — não página inteira —, com menu de 252,
  busca de 40 e cabeçalho de 48 com o X simples no canto (medido nos prints
  `2026-09-01 1143–1146`, janela de 1920×1032).

## 7. Arquitetura de voz (o que precisa continuar verdade)

- A `Room` do LiveKit vive na store (`stores/voice.ts`, `let sala`), fora do
  React. Nenhum componente a derruba; só `sairDaSalaAtual`/`disconnect`.
- **Áudio remoto é global**: `AudioRemotoHost` em `VoiceLayer` renderiza um
  `<audio>` por participante da sala da store, independente da tela. A grade
  (`VoiceGrid`) é só visual. Sem isso, trocar de DM silenciava a call.
- `sairDaSalaAtual(motivo)` fecha a sala e avisa o gateway; `disconnect` é o
  caminho do usuário e também fecha a coluna. `connect`, `startCall` e
  `acceptCall` usam o primeiro (trocar de canal de voz não pode desmontar o
  painel que pediu a conexão).
- Atalhos de mudo/surdo (Ctrl+Shift+M/D) têm um dono só: `VoiceHotkeys`.
- Estados de voz de DM têm rota REST (`GET /dms/:id/voice-states`); o boot
  retoma a call após F5 se o usuário aparecer como `reconnecting`
  (`stores/voice-retomada.ts`, `sessionStorage`); a reconexão do socket não
  zera `states` antes de ter a resposta.
- Servidor: presença de voz por usuário, carência de 45 s
  (`VOICE_RECONNECT_GRACE_MS`) antes de tirar quem caiu; `POST /dms/:id/call`
  em call já existente entra em silêncio (não toca de novo).
- LiveKit é por identidade e não aceita duas iguais: entrar de outro aparelho
  expulsa a conexão anterior de propósito, com evento `voice.evicted` e a
  mensagem "você entrou de outro dispositivo" (`voz-em-um-lugar-so.ts`).
- Seletor de tela (`ScreenSharePicker`): duas abas (Aplicativos e Tela
  Inteira) e, no rodapé, resolução e taxa de quadros como segmentos sempre
  visíveis, com as opções vindas de `SCREEN_QUALITY` — sem aba de
  dispositivos, sem alternador SD/HD e sem a etapa da engrenagem. **Medidas**
  (prints `2026-08-31 123946`/`124000`, janela do Discord de 1283×718, 1:1
  conferido pelo avatar de 32 da lista de DMs, pela rail de 40+10 e pela barra
  de tarefas de 48): modal 960×606, ou seja 75% da largura e 85% da altura da
  janela — no nosso `Dialog`, `w-[min(1400px,max(75vw,880px))]` e `h-[888px]`
  sob o `max-h-[85vh]` da base, com teto no maior modal do Discord já medido
  (1400×888, janela de configurações) e piso de 880, este não medido. Barra de
  abas 40 (segmento 32), grade de `auto-fill` com mínimo de 300 e 16 entre
  colunas, quadro 16:9 raio 8 e nome com ícone de 16 embaixo. **A grade não é
  de duas colunas fixas**: 2×441 na janela do print, 4×322 numa de 1920 — foi
  o `w-[440px]` fixo que deixava a miniatura grande demais em janela larga.
- **No navegador não existe seletor nosso**: "Compartilhar tela" chama
  `getDisplayMedia` direto (`restricoesDeCaptura`, preset da store) e publica;
  cancelar o diálogo do browser não é erro e não vira toast. O modal de
  miniaturas é só do desktop, e a qualidade no navegador se ajusta na aba Voz
  das configurações, com os mesmos `SegmentosDeQualidade` do rodapé. A barra
  branca "Você está compartilhando sua tela inteira" que cobre o cabeçalho é do
  Firefox, não nossa — não dá para mover nem esconder.
- Ainda aquém do Discord (não é defeito): botão de voltar para call em outro
  servidor cai no primeiro canal de texto; barra "conectado" sem cronômetro nem
  quem fala; sem "ocupado" para quem liga durante uma call; diálogos invisíveis
  com o palco em tela cheia; sem PiP.

## 8. Barra de título do desktop

- `tauri.conf.json`: `decorations: false`. Permissões em
  `capabilities/default.json`: `core:window:allow-minimize`,
  `allow-toggle-maximize`, `allow-internal-toggle-maximize`,
  `allow-is-maximized`, `allow-close`, `allow-start-dragging`. Nome errado de
  permissão quebra o app sem erro de build: confira contra
  `node_modules/@tauri-apps/api/gen/schemas/desktop-schema.json`.
- `BarraDeTitulo.tsx` (32px, só quando `isTauri()`): setas com histórico real
  (`stores/historico*.ts`), título da tela no centro, caixa de entrada, ajuda,
  botão verde de atualização (hook `useAtualizacao`, substitui o card antigo),
  separador, controles de 32px com 4px de gap, `data-tauri-drag-region`.
  Controles sem foco por mouse e sem tooltip. `body` desconta a altura por
  `--barra-de-titulo`.
- Limitação conhecida: sem moldura nativa, o Windows 11 não mostra o menu de
  "snap" ao pousar no maximizar (o Discord tem a mesma).
- Ctrl+I abre a caixa de entrada.

## 9. Histórico de 2026-09-02

| PR | O quê |
|---|---|
| #38 | Voz em um lugar só: entrar de outro aparelho derruba a conexão anterior e avisa |
| #39 | Bump 0.0.6 |
| #40 | Vocabulário de ícones do Discord (88 ativos), 83 arquivos migrados, tamanhos das superfícies, card flutuante |
| #41 | Card do usuário atravessa a rail |
| #42 | Barra de título própria + botão de atualização |
| #43 | Bump 0.0.7 |
| #44 | Tela de conversa medida contra o Discord (cabeçalho, perfil em DM, composer, coluna) |
| #45 | A chamada sobrevive à navegação (5 defeitos) |
| #46 | Foco dos campos com uma borda só |
| #47 | Tela de Amigos medida contra o Discord |
| #48 | Barra polida, caixa de entrada e modal "Nova mensagem" como no Discord |
| #49 | Bump 0.0.8 |
| #50 | Popover do microfone nasce do botão, não da setinha |
| #51 | Este documento |
| #52 | O quadro dos ícones recortava no arquivo, não no desenho (`10 10 80 80`) |
| #53 | Bump 0.0.9 |
| #54 | Não lidas por conversa, notificações do Windows, mídia sem prompt e ping na barra de voz |
| #55 | A parte visual da call medida contra o Discord |
| #56 | Lista de membros, Amigos e Adicionar amigo como no Discord |
| #57 | Configurações: navegação, campos, ícone do servidor, cargos e convites como no Discord |
| #58 | Cabeçalho de canal, busca e boas-vindas como no Discord |
| #59 | Menu de contexto, tooltip, popover de perfil e modal como no Discord |
| #60 | Composer, embed e mensagem como no Discord |
| #61–#62, #66–#67, #69 | Compartilhamento de tela nativo no desktop: enumerar fontes, capturar sem a borda amarela, publicar no LiveKit pelo Rust, seletor com miniaturas, áudio do sistema (WASAPI) |
| #63–#64, #68 | Coluna de canais, rota de remover ícone, rail e rodapé medidos |
| #65, #70 | Bumps 0.0.10 e 0.0.11 |
| #71 | **CRT estática no Windows** (`.cargo/config.toml` na raiz): a libwebrtc do `livekit` vem com /MT e o link da 0.0.11 quebrou com LNK2038 — o clippy não pega porque não linka |
| #72 | Palco da call abre numa faixa fixa (~215px), não em metade da coluna |
| #73 | Sons originais do Discord (`public/sons/`), badge de não lidas na borda (rail com miolo de 16px), cronômetro colado na borda (botões do hover fora do fluxo), amizade nova põe a conversa no topo dos dois lados |
| #74 | Sons do Discord em todo caminho: mudo/surdo pelo botão do rodapé (o som foi para a store), entrar e transmissão de tela com arquivo, nada mais sintetizado |
| #99 | GIF animado como foto de perfil e banner: o GIF pula o recorte (canvas achata a animação) e sobe inteiro, com teto de 8 MB, lado de 2048px, assinatura `GIF87a`/`GIF89a` conferida e content-type real no proxy |

Desktop: 0.0.6 (#38 + #40 + #41), 0.0.7 (+ #42), 0.0.8 (tudo até #50),
0.0.10 (até #64), 0.0.11 (até #71, primeira com a tela nativa), 0.0.12 (até #73).

**Sons.** `lib/ringtone.ts` e `lib/notification-sound.ts` tocam arquivos de
`apps/web/public/sons/` (origem: `docs/Reference/audio/`, fora do git). **Nada
é sintetizado** — os tons de Web Audio de entrar/alguém-entrou saíram quando o
arquivo de entrada chegou.
Mapeamento final (origem → nosso arquivo → quando toca):

| origem | nosso | quando |
|---|---|---|
| `discord-notification.mp3` | `mensagem.mp3` | mensagem nova |
| `discord-call-sound.mp3` | `chamada.mp3` | chamada recebida (loop) e o ringback de quem liga |
| `discord mute.mp3` | `mudo.mp3` | mutar o microfone **e** ficar surdo |
| `discord-unmute-sound.mp3` | `desmudo.mp3` | desmutar **e** religar o áudio |
| `user_join.mp3` | `entrar.mp3` | eu entrei **e** alguém entrou |
| `discord connect and disconect.mp3` | `sair.mp3` | eu saí **e** alguém saiu |
| `discord_start_screan.mp3` | `transmissao-iniciada.mp3` | a minha transmissão de tela começou |
| `discord-stream-stop.mp3` | `transmissao-encerrada.mp3` | a minha transmissão terminou |
| `discord-user-moved.mp3` | `movido.mp3` | movido de canal — **sem chamador** (a API não move ninguém) |

O som de mudo/surdo mora dentro de `useVoicePrefs.toggleMute`/`toggleDeafen`,
não em quem chama: assim o botão do rodapé, a barra da call e o atalho soam
igual, e fora de qualquer chamada também. Tocá-lo no `VoiceHotkeys` de novo
dobrava o aviso — por isso ele lá só dispara a ação. O volume é o
`outputVolume` das configurações (inclusive nos dois `<audio>` de toque, via
`prepararToque`); o interruptor mestre `notificationSound` e o interruptor por
som (`stores/sons.ts`) valem para todos; a prévia da aba Notificações passa
`forcar` e ignora os dois.

## 10. Pendências e o que não foi verificado

- **Nenhum PR de hoje foi visto em app rodando.** Validação pelos prints do
  usuário (§6.5). O que estiver torto vira PR pequeno.
- Navegador do usuário que não carregava após F5 durante uma call (antes do
  #45): sem causa confirmada; pedia-se o erro do Console (F12) antes de limpar
  os dados do site.
- `ScreenSharePicker.tsx` ainda importa do lucide; a sessão do compartilhamento
  de tela reescreve.
- Coluna do modal de configurações: os 252 estavam certos — no print da janela
  flutuante a coluna mede 252 de borda a borda.
- Polimentos de voz listados no §7.
- Painel "Ativo agora" e a barra de título no navegador: decisão do usuário.
- **O instalador novo (§5.1) nunca rodou no Windows.** O `.nsi` compila aqui,
  mas cor, leiaute, animação, fechar-sozinho e abrir-o-app dependem do build do
  CI e de alguém instalando.
- **`installMode` continua `perMachine`, e por isso toda atualização pede UAC.**
  Só `currentUser` seria 100% silencioso (é o que o Discord faz). A troca não é
  só mudar a linha: o template do Tauri detecta instalação anterior lendo
  `SHCTX`, e o `SetContext` do `utils.nsh` aponta `SHCTX` para HKCU quando o
  modo é `currentUser` — ou seja, o instalador por usuário **não enxerga** a
  instalação perMachine que está na máquina hoje (0.0.12) e deixaria duas
  cópias: arquivos em `Program Files` + entrada em HKLM, mais uma cópia em
  `%LOCALAPPDATA%`. A varredura de WiX no topo do `PageReinstall` também não
  ajuda: ela só casa com desinstaladores que começam com `msiexec`. Migrar
  exige um passo próprio no template (ler `HKLM\...\Uninstall\Streamz` e
  chamar o desinstalador antigo por `ExecShell "runas"`, um UAC único), e isso
  precisa ser testado numa máquina que já tenha a versão perMachine — não dá
  para verificar daqui.
- **Janela branca no boot do desktop**: resolvida no papel pelo PR #88 (a
  `main` nasce `"visible": false` e quem a mostra é a janelinha, que também
  nasce escondida e se mostra no primeiro quadro), mas **nunca vista num
  Windows** — nem ela, nem o canto arredondado por `transparent: true` no
  WebView2, nem o ciclo de atualização pela janelinha.

## 11. Checklist para uma sessão nova

1. `ListAgents`: quem está vivo e no quê. Avise o que vai tocar.
2. Worktree própria a partir de `origin/main`. Nunca `checkout` no clone.
3. Leia `icones.tsx` (topo), `design.md`, `ACERVO.md` antes de mexer em UI.
4. Meça nos prints por `getpixel`; renderize e olhe; registre o que não viu.
5. Verificação completa no docker (§3.2). Tudo verde antes do PR.
6. PR com "como testar" e tabela de medidas. Não mergeie sem o usuário.
7. Depois do merge: confira `docker ps` e, se falhou no Prisma, `rerun --failed`.
8. Versão nova do desktop: §5, na ordem, com `STREAMZ_TAG` no restart.
