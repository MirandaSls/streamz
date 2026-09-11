# Plano — paridade total com o Discord, exceto a marca

- **Status:** rascunho para aprovação (2026-09-11)
- **Pedido do usuário:** "que a aplicação fique idêntica ao Discord, com exceção do
  ícone do Streamz e da cor padrão, que é o nosso verde. De resto quero alterar
  tudo: ícones menores, fontes, tamanho da fonte, estilo do chat, emojis,
  comandos, tudo."
- **Execução:** o Opus coordena e faz o que é estrutural. O Sonnet 5 executa
  tarefas pequenas, em subagentes de escopo fechado.

Este plano reabre a **ADR-0004** e o **§6.6 do `PROCESSO-DE-DESENVOLVIMENTO.md`**
("cores e tokens: intocados"). O método de trabalho continua o do §6: medir, não
estimar; fase sequencial antes da paralela; lotes disjuntos; verificação uma vez
só, por quem coordena. O que muda é a meta, não o método.

---

## 1. O que fica nosso e o que vira Discord

| Fica **Streamz** | Vira **Discord** |
|---|---|
| Símbolo, wordmark, favicon, ícones do app, splash (`Marca`, `MarcaLockup`) | Toda a escala de superfícies, textos, bordas, elevação (menu mais **claro** que o app, não mais escuro) |
| **Volt Lime `#9BE31F`** no lugar de todo token de marca do Discord (blurple): botão primário, foco, seleção, menção, pílula da rail, faixa padrão do perfil | Cores de status (online, ausente, não perturbe, offline), vermelho de perigo, link, avisos |
| **Texto sobre o accent é escuro (`accent-ink`)**. Branco sobre limão dá 1,57:1; é a única divergência de forma que a cor impõe | Tipografia, tamanhos, pesos, entrelinhas, raios, sombras, espaçamentos, larguras e alturas de cada peça |
| Archivo **só** no wordmark | Ícones (acervo oficial), tamanhos de ícone, emoji (Twemoji), sons de UI |
| | Markdown, composer, autocomplete, UI de comandos de barra, mensagens de bot |
| | Leiaute mobile (abas, gavetas, folhas, toque longo) |

**Fontes.** O Discord usa gg sans, ABC Ginto e gg mono, todas proprietárias e
impossíveis de redistribuir. Por isso adotamos a **pilha de fallback do próprio
Discord**, tirada do CSS dele (`tokens/VARIAVEIS.md`):

| Papel no Discord | Pilha dele | Nós |
|---|---|---|
| `--font-primary` (10.839 usos) | gg sans → **Noto Sans** | Noto Sans (já temos) |
| `--font-headline` (430 usos) | ABC Ginto Nord → **Noto Sans** | Noto Sans 800 |
| `--font-code` (327 usos) | gg mono → **Source Code Pro** | Source Code Pro (OFL) no lugar da JetBrains Mono |

**Emoji.** O Discord desenha emoji com **Twemoji** (licença CC-BY 4.0: pode usar,
com atribuição). Hoje usamos o glifo nativo do sistema, que muda de desenho em
cada SO. O pacote entra **local**, porque o desktop roda offline, com atribuição
em "Sobre".

**Base de fonte.** A raiz do app é 15,5px, a pedido do usuário; o padrão do Discord
é 16px. Paridade pede 16. A escala por preferência continua em Aparência.

---

## 2. Decisões (respondidas pelo usuário em 2026-09-11)

1. **Escopo: paridade visual de tudo e, além disso, criar as features que
   faltam.** A paridade são as ondas 0–9 (§4). As features são uma trilha própria
   (§4b), que começa depois da onda 0 para já nascer com os primitivos novos.
   Continuam **não criar**, pelo §6.6, até o usuário dizer o contrário: Nitro,
   loja, missões, "Ativo agora" e tudo que é monetização (impulsos, cobrança,
   super reações pagas).
2. **Temas: Dark agora; Ash e Onyx na onda 9.** O Light fica fora, porque a regra
   "limão só sobre escuro" exige um accent alternativo, e isso é outra ADR.
3. **Onde: no servidor** (`/opt/stack/streamz`, worktrees, `docker run node:22`,
   §2–§3). É onde estão o acervo de ícones (`docs/Reference/`) e o
   `publicar-local.sh`. As referências coletadas no Mac
   (`~/Documents/referencias-discord`, 3 GB) sobem por `rsync` para
   `docs/Reference/discord-web/`, que já está no `.gitignore`.
4. **Deploy: uma branch por onda.** As tarefas viram PR em
   `feat/paridade-discord`, que entra na `main` ao fim de cada onda, com os prints
   do usuário. Cada feature da trilha §4b tem PR próprio na `main`, porque é tela
   nova e não deixa visual misto.
5. **Base de fonte 16px** (padrão do Discord) no lugar dos 15,5 atuais. Não foi
   perguntado; vale até o usuário dizer o contrário, e entra na onda 0.2.

---

## 3. Modelo de execução

### Quem faz o quê

| Papel | Modelo | Faz |
|---|---|---|
| **Coordenador** | Opus (a sessão principal) | Onda 0 inteira; escreve os cartões de tarefa; integra; roda a verificação completa **uma vez por onda**; revisa as folhas lado a lado; decide as correções |
| **Executor estrutural** | Opus (subagente) | Tudo que toca arquivo compartilhado, contrato (`packages/shared` / API), estado ou lógica pesada: tokens, primitivos, `Composer`, `MessageItem` + markdown, UI de comandos, renderizador de componentes de bot, shell e gestos do celular, grade de voz |
| **Executor de folha** | Sonnet 5 (subagente) | Uma peça ou tela por cartão, com **lista fechada de arquivos**: abas de configuração, modais, itens da sidebar, popovers, lotes mecânicos de migração (botões, inputs, hex) |
| **Revisor visual** | Opus (subagente) | Compara a nossa captura com a referência, por tela, e devolve divergências com medida (não opinião) |

Cada onda roda como **workflow** (fase de implementação em paralelo, depois
integração e revisão), com até ~15 agentes por execução. Agente **não** roda
typecheck nem build na árvore parcial dos outros (§6.4.4: falso vermelho, e o
servidor já caiu por falta de memória). Quem verifica é o coordenador, no fim.

### Cartão de tarefa (modelo que todo subagente recebe)

```
## <id> — <peça/tela>
Modelo: sonnet | opus
Objetivo: <uma frase>
Pode tocar: <lista fechada de arquivos>
Proibido: tailwind.config.ts, globals.css, icones.tsx, components/ui/primitivos/*,
          app/app/page.tsx, design.md, packages/shared (salvo se o cartão disser)
Referências Discord:
  - imagens: <caminhos em referencias-discord/…, escolhidos no catalogo.json>
  - CSS: <arquivos/classes em tokens/css-bruto/ com as medidas desta peça>
  - prints 1:1: <docs/Reference/Captura de tela …>, quando houver
Medidas-alvo: <tabela preenchida pelo coordenador; o que faltar, o agente mede
              pelo §6.3 ou escreve "não medido">
Pronto quando:
  - [ ] usa só primitivos e tokens (zero hex, zero px arbitrário sem medida)
  - [ ] estados: vazio, carregando, sem permissão, hover, foco, desabilitado
  - [ ] celular: a peça funciona sob `celular:` ou o cartão diz que não se aplica
  - [ ] tabela Discord / antes / depois com a origem de cada número
Entrega: diff + tabela + lista do que NÃO foi verificado. Ícone ou token
         faltando → relata, não cria.
```

### O ciclo de uma onda

1. O coordenador escreve os cartões e reserva os arquivos (`SendMessage` para as
   outras sessões vivas, §2.4).
2. **Implementação em paralelo**: subagentes em worktrees próprias, lotes
   disjuntos.
3. **Integração** na branch da onda; `git merge origin/main`.
4. **Verificação completa** (§3.2) + **passeio de paridade** (onda 0.7), que
   fotografa as telas da onda em desktop 1920×1080 e celular 390×844.
5. **Revisão visual**: folha lado a lado (nosso × referência) por tela → lista de
   divergências medidas.
6. **Rodada de correção** (Sonnet, cartões novos, curtos) → repete 4–5 até zerar
   as divergências relevantes.
7. PR da onda → **prints do usuário** nos pontos que ninguém consegue abrir → merge
   na `main` → `publicar-local.sh`.

---

## 4. As ondas

Os números entre parênteses são a estimativa de cartões. O total fica perto de
**130 cartões** em **10 ondas**.

### Onda 0 — Fundação (Opus, sequencial; nada depois dela começa antes)

| # | Entrega | Modelo |
|---|---|---|
| 0.1 | **ADR-0009** "Paridade total com o Discord, exceto a marca": substitui a ADR-0004 (menos a marca e as três regras do accent); reescreve o `design.md` e o §6.6 do PROCESSO | Opus |
| 0.2 | **Tokens como variáveis CSS com os nomes semânticos do Discord** (`--background-base-lower`, `--text-default`, `--control-primary-background-default`…), gerados de `tokens/variaveis-resolvidas.json`; o Tailwind aponta para as variáveis; a escala de marca do Discord vira a escala do limão; elevação corrigida (`overlay` mais claro); base de 16px | Opus |
| 0.3 | **Tipografia**: Archivo sai da UI; entra Source Code Pro por `next/font`; escala de texto do Discord (`escalaTexto` do `tipografia-e-formas.json`) como classes nomeadas | Opus |
| 0.4 | **Primitivos** (a API é do Opus, a implementação sai em cartões Sonnet): `Button` (brand, secundário, perigo, link, outline × pequeno/médio/grande), `Input`/`TextArea`, `Select`, `Switch`/`Checkbox`/`Radio`, `Tooltip`, **um só** `Popout` (substitui as 7 implementações), `Menu`, `Modal`, `Tabs`, `Badge`, `Divider`, `Scroller` | Opus + Sonnet (12) |
| 0.5 | **Ícones**: completar pelo acervo o que ainda é Phosphor ou lucide; tamanhos padrão 16/20/24 como no Discord; folha de contato renderizada | Sonnet (2) + Opus revisa |
| 0.6 | **Emoji**: Twemoji local (sprite ou lazy, medir o peso no desktop), renderizador único, atribuição | Opus |
| 0.7 | **Passeio de paridade** (`scripts/paridade/`): (a) semente determinística com um servidor que tem tudo (canais de todos os tipos, cargos coloridos, membros em todos os status, mensagens com cada caso de markdown, reações, respostas, thread, enquete, bot com embed e componentes, voz); (b) `capturar.mjs` com a lista *tela → rota + passos* em desktop e celular; (c) `referencias.json` (*tela → melhores imagens do catálogo*); (d) `folha.mjs`, que gera a folha lado a lado | Opus |
| 0.8 | **Migração mecânica para os primitivos**, em lotes disjuntos: os 400 `<button>`, os 90 `<input>`, os 7 popovers, os 117 `title=`, os hex e `text-white`/`bg-black` soltos | Sonnet (8) |

**Critério de saída**, mecânico como no §6.4.5:
- `grep` de hex em `apps/web/components` volta vazio (fora da lista de exceções);
- `lucide-react` e `@phosphor-icons/react` só aparecem em `icones.tsx`;
- o app inteiro renderiza com os tokens novos;
- o passeio fotografa todas as telas.

### Onda 1 — Shell do desktop (Sonnet 7 + Opus 1)
Barra de título do Tauri · rail (pílula, tooltip, badge, separador) · sidebar do
servidor (cabeçalho, categoria, canal, membros em voz) · sidebar de DMs ·
cabeçalho do canal (inclui o **sino** e a **caixa de entrada no navegador**) ·
lista de membros · painel do usuário e barra "Voz conectada". O Opus integra o
`page.tsx` e as larguras reais (294 / 267 / rail).

### Onda 2 — Chat (Opus 4 + Sonnet 12)
- **Opus:** `MessageItem` (cozy/compacto, agrupamento, barra no hover, divisores)
  · **markdown completo** (listas, link mascarado, `<t:…>`, `-#`, `>>>`,
  `<#canal>`, `<@id>`, destaque de sintaxe) · **composer** · **UI de comandos de
  barra** (chips de opção, `choices`, seletor de usuário/canal/cargo).
- **Sonnet:** menções · reações · resposta · edição · anexos e lightbox · embed de
  link · seletor de emoji, GIF e figurinha (casca comum) · autocomplete `@ # :` ·
  menu de contexto · fixadas · busca (todos os filtros) · caixa de entrada ·
  painel e lista de threads · enquete · "digitando…" · atalhos faltantes (Ctrl+F,
  Ctrl+P, Ctrl+U, Ctrl+E/G/S, overlay de Ctrl+/).

### Onda 3 — Mensagens de bot (Opus 3; trilha que cruza `shared` → API → web)
- `Message` ganha `embeds` e `components` no contrato.
- A camada `discord-compat` para de achatar o embed (`traducao/embed.ts`) e de
  descartar `components` (`traducao/mensagem.ts`).
- O web renderiza embed rico, botões, selects, modais e Components v2 como o
  Discord.
- Os callbacks de interação 6/7/8/9 são a F5 de `BOTS-COMPATIVEIS-COM-O-DISCORD.md`.

Pode andar em paralelo com as ondas 4–7, porque os arquivos são disjuntos.

### Onda 4 — Voz e vídeo (Opus 1 + Sonnet 6)
Grade e tiles · controles · seletor de tela e prévia do Go Live · chamada de DM
com toque e banner · painel de sons · vista do canal de voz · menus de áudio.

### Onda 5 — Perfil, amigos e DMs (Sonnet 7)
Popout de perfil · modal de perfil completo · editar perfil · status e status
personalizado · página de Amigos e adicionar amigo · cabeçalho e painel de perfil
da DM · DM em grupo.

### Onda 6 — Configurações (Opus 1 + Sonnet ~26, em duas execuções)
- **Opus:** moldura `JanelaDeConfiguracoes`, com menu, busca, os dois tipos de
  fechar e a barra de "alterações não salvas".
- **Sonnet:** um cartão por aba.
  - Usuário: Minha conta, Perfil, Privacidade, Dispositivos, Aplicativos,
    Aparência, Acessibilidade, Voz e vídeo, Notificações, Teclado, Idioma, e o
    **Avançado**, porque o `developerMode` existe sem interruptor, o que parece
    bug.
  - Servidor: Perfil, Engajamento, Emoji, Sons, Membros, Cargos, Convites,
    Acesso, Aplicativos, Auditoria, Banimentos, Denúncias.
  - Canal: Visão geral, Permissões.
  - Grupo de DM: Visão geral, Convites.

### Onda 7 — Modais e telas de conta (Sonnet 12)
- **Modais:** criar servidor (hoje é um `prompt`; vira o modal do Discord só com o
  que existe), entrar em servidor, convite, criar canal, confirmação, troca
  rápida, visualizador de imagem.
- **Telas de conta:** login, registro, esqueci a senha, verificação, 2FA e página
  de convite. Referência: as capturas próprias em `publico/`.

### Onda 8 — Celular (Opus 2 + Sonnet 10)
- **Opus:** shell e **gesto de gaveta** (arrastar, não só tocar) e folhas
  inferiores.
- **Sonnet:** barra de abas; aba Início (rail + canais + DMs); chat no celular;
  toque longo; **entradas que faltam** (busca, fixadas, threads); voz no celular;
  aba Você e configurações no celular; perfil em folha.
- **Referências:** `lojas/`, `blog/` iOS e `suporte/` mobile. O Android recente é
  a lacuna das referências, então vale capturar num emulador com conta de teste
  antes desta onda.

### Onda 9 — Temas e fechamento (Opus 2 + Sonnet 4)
- Ash e Onyx (Light, se decidido), a partir das variáveis de `tokens/`.
- Passada de coerência (§6.4.3).
- Contraste AA com o accent.
- Passeio completo com todas as telas × referência.
- `design.md` final e PENDÊNCIAS.

---

## 4b. Trilha de features (o que o Streamz ainda não tem)

A régua de cada feature é o **comportamento** do Discord, não só a tela. A
especificação sai dos artigos da central de ajuda, que estão inteiros em
`referencias-discord/suporte/` (`api/artigos.json` tem o texto de todos os 512).
Cada feature segue as regras do `CLAUDE.md`:
- o contrato em `packages/shared` vem antes;
- escrita de mensagem vai por WS;
- a autorização é central (`assertCanViewChannel`…);
- permissão nova ocupa o próximo bit livre;
- toda mudança de schema vira migration.

**Divisão de trabalho, por feature:**
1. O **Opus** escreve uma mini-especificação (comportamento, contrato, modelo de
   dados, permissões, eventos WS) e, se for decisão de arquitetura, a ADR.
2. O **Opus** faz o backend e o contrato.
3. O **Sonnet** faz as telas, com cartão igual ao das ondas.
4. O **Opus** revisa.

Tamanho: **P** até 3 cartões, **M** de 4 a 8, **G** 9 ou mais.

| Prioridade | Feature | Tam. | Toca | Depende de |
|---|---|---|---|---|
| 1 | Threads na sidebar sob o canal + threads, busca e fixadas no celular | M | web | ondas 1, 8 |
| 1 | Menções `<@id>`/`<#canal>` gravadas por id (hoje grava `@username`) | M | shared, api, web | onda 2 |
| 1 | Pastas na rail e reordenar servidores arrastando | M | shared, api, prisma, web | onda 1 |
| 1 | Pedidos de mensagem (DM de desconhecido vai para uma caixa separada) | M | api, prisma, web | onda 5 |
| 2 | **Fórum** (tipo de canal, posts como thread, tags, ordenação, galeria) | G | shared, api, prisma, web | ondas 2–3 |
| 2 | **Eventos agendados** (criar, RSVP, lembrete, canal de voz/palco/externo) | G | shared, api, prisma, web | onda 1 |
| 2 | **Palco** (falantes × plateia, levantar a mão, moderador; permissão no LiveKit) | G | shared, api, voz, web | onda 4 |
| 2 | **Onboarding completo** (perguntas, canais e cargos padrão) + triagem de regras + "Canais e cargos" | G | shared, api, prisma, web | onda 6 |
| 2 | Anúncios: publicar e seguir canal em outro servidor | M | api, prisma, web | onda 2 |
| 2 | **Descobrir servidores** (a API `discover` existe, falta a tela) | M | web (+ api) | onda 7 |
| 3 | **AutoMod** (regras de palavra, spam e menções; ações) | G | shared, api, prisma, web | onda 6 |
| 3 | **Webhooks** (criar, token, execução compatível com a API do Discord) | M | api, prisma, web, discord-compat | onda 3 |
| 3 | Modelos de servidor, widget, aba de figurinhas, convites e integrações do canal | M | api, prisma, web | onda 6 |
| 3 | Criar servidor com modelo e ícone (substitui o `prompt`) | P | web (+ api) | onda 7 |
| 3 | Modo streamer, abas "Texto e imagens" e "Avançado" | P | web | onda 6 |
| 3 | Perfil por servidor (apelido, avatar e banner por servidor) | M | shared, api, prisma, web | onda 5 |
| 4 | **Notificação push** (FCM/APNs; hoje só existe notificação local) | G | api, desktop (Android/iOS) | onda 8 |
| 4 | Login por QR (o app logado autoriza o navegador) | M | api, web, mobile | onda 7 |
| 4 | Janela flutuante de chamada (popout, janela extra do Tauri) | M | desktop, web | onda 4 |
| 4 | Onboarding do app no celular + tela antes do pedido de permissão | P | web, desktop | onda 8 |
| 5 | **Conexões** (OAuth por provedor: Spotify, Twitch, YouTube, Steam…) | G | api, prisma, web | onda 6 |
| 5 | **Atividades** (Embedded App SDK: iframe na chamada, protocolo RPC) | G | api, web, voz | ondas 3–4 |
| 5 | Widget Android na tela inicial | M | desktop (Android) | onda 8 |
| — | Overlay de jogo | — | — | **Fora**: exige injeção nativa no jogo (DirectX/Vulkan) no Windows. Não cabe no Tauri sem um projeto próprio |

A ordem segue o valor para quem usa e o que já está pronto em cada onda. As
prioridades 1 e 2 correm em paralelo com as ondas 4–7, em arquivos disjuntos das
ondas. A trilha soma perto de **110 cartões** (cerca de 30 do Opus, entre
especificação, backend e revisão, e 80 do Sonnet), além dos cerca de 130 da
paridade.

---

## 5. Material que os subagentes recebem

| Material | Onde | Para quê |
|---|---|---|
| Galeria e catálogo (3.129 imagens, por tela e plataforma) | `referencias-discord/index.html`, `catalogo.json` | escolher a referência de cada cartão |
| Cobertura e lacunas por tela | `referencias-discord/COBERTURA.md` | saber onde a referência é fraca |
| Tokens do Discord (cor por tema, tipografia, raios, sombras, breakpoints) | `referencias-discord/tokens/` | onda 0.2–0.3 e medidas de toda peça |
| CSS bruto do cliente logado (303 arquivos) | `referencias-discord/tokens/css-bruto/` | medida exata de padding, altura e fonte por classe, sem estimar |
| Capturas próprias (login, registro, convite, descoberta), desktop e celular | `referencias-discord/publico/` | onda 7 |
| Imagens de bots (componentes v2, embeds, modais, comandos) | `referencias-discord/desenvolvedores/` | ondas 2–3 |
| Prints 1:1 do usuário e acervo de ícones | `docs/Reference/` (só no servidor) | medir com `getpixel` (§6.3), ícones (§6.2) |

---

## 6. Riscos

- **Decisão travada.** A ADR-0004 e o §6.6 proíbem mexer em cor e token; sem a
  ADR-0009 aprovada, nada de onda 0.
- **Texto sobre o accent.** O Discord põe branco sobre o blurple, nós pomos
  escuro sobre o limão. É uma regra mecânica dentro do `Button`, não uma decisão
  por tela.
- **Várias sessões no mesmo repo** (bots, voz, desktop). Reserva de arquivos por
  mensagem (§2.4) e `merge origin/main` a cada onda; a branch de integração não
  pode envelhecer.
- **Arquivos grandes misturando lógica e visual** (`Composer`, `MessageItem`,
  `ChannelSidebar`, `ProfilePopover`, `AplicativosTab`). Esses são sempre do Opus,
  e o visual se separa da lógica antes de mudar.
- **Tamanho do Twemoji** no pacote do desktop e do Android: medir antes de
  escolher entre sprite e arquivo por emoji.
- **Base 15,5 → 16** muda todas as medidas já feitas. Se entrar, entra na onda 0.2,
  antes de qualquer medição nova.
- **Sons de UI.** Os 9 `.mp3` de `public/sons/` são os originais do Discord (commits
  `f4217c1`/`a1f6dcc`): risco de licença que já existe e que este plano não cria
  nem resolve.
- **Verificação.** Ninguém abre a conta do usuário (§6.5). O passeio usa a semente
  própria numa instância local; o que depende de dado real vai para os prints do
  usuário.
- **Features tocam backend, contrato e banco.** Cada uma exige migration, bits de
  permissão e eventos WS novos, e o `CLAUDE.md` vale inteiro. É por isso que o
  backend é sempre do Opus. Palco, push, conexões e atividades pedem ADR antes do
  código.
- **Custo.** São cerca de 240 cartões somando paridade e features, mais as
  rodadas de correção. As ondas 0, 2, 3 e 8 e o backend das features concentram
  o Opus; o resto é majoritariamente Sonnet.

---

## 7. Primeiros passos (depois da aprovação deste plano)

1. `rsync` de `~/Documents/referencias-discord` → servidor, em
   `docs/Reference/discord-web/`.
2. Commitar este plano numa branch `docs/plano-paridade-discord` e abrir o PR.
3. Onda 0.1: a ADR-0009 em rascunho, para o usuário aprovar. Ela é a autorização
   formal para mexer em cor e token.
4. Ondas 0.2–0.7, em sequência, pelo Opus. O primeiro workflow paralelo é o 0.4
   (primitivos) + 0.8 (migração).
