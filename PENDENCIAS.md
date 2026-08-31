# Pendências

O que **ainda não está pronto**. Item concluído sai daqui: o histórico fica no
git, o *porquê* das decisões em `docs/adr/` e a arquitetura vigente no
`CLAUDE.md`. Uma lista que acumula `~~riscados~~` para de ser lida, e foi o que
aconteceu com a versão anterior deste arquivo — ela ainda listava como pendente
o registry, o build de imagem e a escolha de deploy, três coisas em produção há
dias.

**Conferido contra o que está no ar em 2026-08-31.** Ao mexer aqui, confira de
novo em vez de confiar no texto: a distância entre este arquivo e a realidade é
o único defeito que ele pode ter.

## Estado atual

A instância de produção roda em `streamz.chat` (API em `api.`, LiveKit em
`livekit.`), com Postgres, R2, Giphy, SMTP e LiveKit self-hosted configurados. O
CD publica sozinho a cada merge no `main` (ADR-0007). Nada abaixo bloqueia rodar
o projeto em dev — `pnpm db:up && pnpm dev` sobe tudo.

## Configurar as dependências opcionais

R2, LiveKit, SMTP, Giphy e Redis são opcionais por decisão de arquitetura: sem a
credencial, a rota correspondente responde `503` com o motivo e o resto do app
segue de pé. **Cada variável está documentada no `.env.example`**, com o que ela
liga e o que quebra sem ela — é para lá que apontam os "ver PENDENCIAS.md" das
mensagens de erro da API.

## 1. Recursos incompletos

### Selo do Giphy
`GifPicker.tsx` mostra o texto "Powered by GIPHY". Os termos do Giphy pedem o
**selo oficial em imagem** (ver ADR-0006). É trocar o `<span>` pelo asset.

### Versão no rodapé das configurações
`NEXT_PUBLIC_APP_VERSION` não é passada no build da imagem web
(`.github/workflows/ci.yml`), então o rodapé do menu de configurações mostra
sempre `0.0.1`. A API já resolveu o equivalente — `APP_VERSION` vem da tag do
deploy. Basta acrescentar a variável aos `build-args`, como as outras
`NEXT_PUBLIC_*`.

### Auto-update do desktop
O `tauri-plugin-updater` está **desligado** de propósito: apontava para
`releases.streamz.dev`, que não existe, com `pubkey` placeholder — ligado assim,
só gera erro em runtime. Para religar:

1. gerar o par de chaves e guardar a privada **fora do repo**
   (`pnpm --filter @streamz/desktop tauri signer generate -w ~/.tauri/streamz.key`);
2. publicar um endpoint real de releases
   (`/updater/{{target}}/{{arch}}/{{current_version}}`) servindo o JSON assinado;
3. reativar plugin + capability + `plugins.updater` + `createUpdaterArtifacts` e
   assinar o build com `TAURI_SIGNING_PRIVATE_KEY`.

Passo a passo em `apps/desktop/README.md`, seção "Auto-update".

### Assinatura do instalador Windows
Sem Azure Trusted Signing, o `.exe` dispara o alerta do SmartScreen em quem
baixa. O instalador em si já é gerado pelo workflow `Desktop (Windows)`.

## 2. Backlog de features

- **Login social (OAuth)** — o modelo `OAuthAccount` e o `linkedProviders` do
  contrato já existem, mas nenhum provedor é vinculável: falta rota de
  authorize/callback e credencial de app. Por provedor: registrar o app, guardar
  `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` e **exigir e-mail verificado no provedor**
  antes de vincular — sem isso, quem controlasse um e-mail alheio entraria na
  conta de outra pessoa. Hoje `linkedProviders` responde sempre `[]`.
- **Apelido por servidor (`/nick`)** — o comando já existe no composer (tratado
  como `"apelido"`, por isso não se acha procurando por "nick") e responde com um
  toast de "ainda não está disponível". Falta a coluna de apelido em
  `GuildMember`, a rota que a edita e a leitura no `displayNameOf` da lista de
  membros.
- **"Seguir" canal de anúncios** de outro servidor — o item do menu existe
  desabilitado; não há modelo de canal seguido.
- **Menção a cargo não vira notificação dedicada** — ela conta no badge, na
  faixa amarela e na caixa de entrada, mas o texto da notificação é o mesmo de
  uma menção comum.
- **Cargo apagado deixa `<@&id>` órfão** no histórico — a marcação vira "@cargo"
  em vez de sumir. É o comportamento do Discord, mas hoje é acidente, não
  decisão.
- **`ADMINISTRATOR` sem aviso na UI de cargos** — quem marca o bit não é avisado
  de que está entregando todas as permissões, presentes e futuras.

## 3. Limites conhecidos (não são bugs hoje)

Coisas corretas para **uma instância** da API, que é o que roda. Viram trabalho
no dia em que houver uma segunda — e nenhuma delas se resolve com uma flag:

- **Token bucket do WebSocket** (`gateway/rate-limit.ts`) vive no socket, então
  cada instância limita só o que passa por ela. Para o que ele existe — conter
  o flood de **um** cliente — isso basta; um teto global de verdade é outro
  requisito, não um conserto deste.
- **Faxina diária por processo** — o `@nestjs/schedule` do `modules/maintenance`
  roda em toda instância; com mais de uma, o job repete. É inofensivo (as
  rodadas apagam o mesmo conjunto e a segunda não acha nada), então não corre.
  Quando correr, o detalhe que morde: `pg_advisory_lock` é **de sessão**, e o
  pool do Prisma não garante a mesma conexão entre o lock e o unlock — tem de
  ser `pg_try_advisory_xact_lock` dentro de um `$transaction`, o que por sua vez
  briga com a exclusão em lotes (`TAMANHO_DO_LOTE`), feita justamente para não
  segurar transação longa. Um job de release resolve sem esse conflito.

O **estado de voz não está nesta lista**: `VoiceStateStore` tem implementação
Redis (`RedisVoiceStateStore`), escolhida no boot quando há `REDIS_URL`. O
`CLAUDE.md` e este arquivo afirmavam o contrário até 2026-08-31.

## 4. Comportamentos do navegador (não têm conserto no nosso lado)

- **Notificação do navegador** só dispara depois que o usuário concede a
  permissão (pedida uma vez por sessão, ver `lib/desktop.ts`).
- **Som de notificação** só toca depois da primeira interação com a página —
  regra de autoplay, igual em todos os navegadores.
- **Contador no ícone** usa `setBadgeCount` no Tauri ≥ 2.1 e o Badging API no
  navegador (só em PWA instalado). Onde não houver, vira no-op.

## 5. Fora do repo

Anotado aqui porque não tem outro lugar óbvio, e quem for operar precisa saber:

- **Backup do Postgres** é um timer systemd no servidor
  (`streamz-backup.timer` → `/usr/local/bin/streamz-backup.sh`), `pg_dump`
  diário às 03:20 em `/opt/backup/postgres`, retenção de 14 dias. Mora no mesmo
  disco do banco — protege contra erro humano, **não** contra perda do disco.
  Mandar os dumps para o R2 é a pendência que fecha isso.
- **`METRICS_TOKEN`** precisa ser preenchida no `.env` do servidor para o
  `/api/metrics` voltar a responder; sem ela o endpoint fica em 404 em produção,
  que é o padrão seguro (ver `autorizarScrape`).
