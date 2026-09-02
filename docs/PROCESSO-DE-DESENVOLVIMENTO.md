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
| Desktop | `components/desktop/BarraDeTitulo.tsx`, `useAtualizacao.ts`; `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/default.json` |
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

O desktop embute a web: o que entra em `main` depois do build só chega ao
instalado na versão seguinte.

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

Desktop: 0.0.6 (#38 + #40 + #41), 0.0.7 (+ #42), 0.0.8 (tudo até #50).

## 10. Pendências e o que não foi verificado

- **Nenhum PR de hoje foi visto em app rodando.** Validação pelos prints do
  usuário (§6.5). O que estiver torto vira PR pequeno.
- Navegador do usuário que não carregava após F5 durante uma call (antes do
  #45): sem causa confirmada; pedia-se o erro do Console (F12) antes de limpar
  os dados do site.
- `ScreenSharePicker.tsx` ainda importa do lucide; a sessão do compartilhamento
  de tela reescreve.
- Coluna do modal de configurações foi para 252 assumindo que a medida do
  Discord é da coluna; se for do conteúdo, o alvo é 268.
- Polimentos de voz listados no §7.
- Painel "Ativo agora" e a barra de título no navegador: decisão do usuário.

## 11. Checklist para uma sessão nova

1. `ListAgents`: quem está vivo e no quê. Avise o que vai tocar.
2. Worktree própria a partir de `origin/main`. Nunca `checkout` no clone.
3. Leia `icones.tsx` (topo), `design.md`, `ACERVO.md` antes de mexer em UI.
4. Meça nos prints por `getpixel`; renderize e olhe; registre o que não viu.
5. Verificação completa no docker (§3.2). Tudo verde antes do PR.
6. PR com "como testar" e tabela de medidas. Não mergeie sem o usuário.
7. Depois do merge: confira `docker ps` e, se falhou no Prisma, `rerun --failed`.
8. Versão nova do desktop: §5, na ordem, com `STREAMZ_TAG` no restart.
