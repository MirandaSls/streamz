# ADR-0001: Unificar DM e grupo em `Channel`/`Message`

**Status:** Aceita e implementada (2026-08-25)
**Data:** 2026-08-25
**Decisores:** Arthur Miranda
**Escopo afetado:** `apps/api/prisma`, `modules/{dms,gateway,guilds,channels,messages}`, `packages/shared`, `apps/web/app/app/page.tsx`

## Contexto

Hoje o NewDisc tem **duas modelagens paralelas de conversa**:

| Servidor        | DM / grupo      |
| --------------- | --------------- |
| `Channel`       | `DMChannel`     |
| `ChannelMember` | `DMParticipant` |
| `Message`       | `DMMessage`     |

(`apps/api/prisma/schema.prisma`, modelos `DMChannel`/`DMParticipant`/`DMMessage`.)

As duas colunas dessa tabela têm o mesmo formato e propósito, mas só a da
esquerda recebeu as features dos últimos blocos. Concretamente, **a DM não tem**:

- reação (`Reaction` referencia `Message`, não `DMMessage`);
- anexo (`Attachment.messageId` → `Message`);
- edição e remoção (`DMMessage.editedAt` existe na tabela, mas nenhum caminho de
  escrita o preenche — não há handler de editar/apagar DM);
- thread (`parentId` só existe em `Message`);
- busca e paginação por cursor no mesmo formato (`MessagesService.search` e o
  histórico paginado só enxergam `Message`).

E **duplica**, em código:

- `ChatGateway.onDM` é uma cópia reduzida de `onMessage`, com broadcast próprio
  (`user:<id>` em vez de `channel:<id>`);
- `DMsService.assertParticipant` é uma regra de autorização de canal escrita
  fora de `GuildsService.assertCanViewChannel`, que o `CLAUDE.md` define como o
  lugar único dessa checagem;
- `DMsService.toDTO`/`toPublic` repetem `MessagesService.toDTO`/`toPublic`;
- `packages/shared` carrega `DirectMessage` e `DMCreatePayload` como quase-cópias
  de `Message` e `MessageCreatePayload`, e `WS_EVENTS` carrega `dm.create`/
  `dm.new` como quase-cópias de `message.create`/`message.new`.

O custo não é o código de hoje — é que **toda feature de mensagem daqui pra
frente nasce com dois lugares para implementar**, e a segunda implementação é
sistematicamente adiada. Anexos, threads e busca já provaram isso.

A referência de arquitetura do projeto (stoatchat, fork do Revolt) não tem essa
divisão: existe **um** `Channel` com `channel_type` (`SavedMessages`,
`DirectMessage`, `Group`, `TextChannel`, `VoiceChannel`) e **uma** coleção de
mensagens. Toda feature de mensagem vale para todos os tipos por construção.

## Fatores de decisão

- **Uma feature de mensagem, uma implementação.** É o problema que motiva a ADR.
- **Autorização num lugar só.** Hoje a DM fura a regra do projeto.
- **Custo de migração de dados baixo.** O MVP ainda não tem produção.
- **Não piorar o modelo de servidor** para acomodar DM.
- **O web não pode virar um `if (dm)` em cada componente.**

## Opções consideradas

### Opção 1 — Manter separado e portar as features para `DMMessage`

Adicionar `parentId`, `Reaction`/`Attachment` polimórficos (ou tabelas gêmeas
`DMReaction`/`DMAttachment`) e handlers de editar/apagar DM.

- **Prós:** nenhuma migração de dados; mudança incremental, feature a feature.
- **Contras:** dobra permanentemente o custo de cada feature de mensagem, que é
  exatamente o problema. Polimorfismo em `Reaction.messageId` exige abrir mão da
  FK (ou duas colunas nullable com CHECK), o que é pior que unificar.

### Opção 2 — Abstração no código sobre as duas tabelas

Um `ConversationService` com uma interface só, despachando internamente para
`Message` ou `DMMessage`.

- **Prós:** não mexe no banco; o gateway e o web passam a ver uma API só.
- **Contras:** esconde a duplicação em vez de removê-la. Paginação por cursor,
  busca, `include` de reações/anexos e os índices continuam duplicados — e agora
  atrás de uma indireção que dificulta ler o SQL que sai. Troca duplicação
  visível por duplicação escondida.

### Opção 3 — Tabela `Conversation` genérica

`Channel` e `DMChannel` viram ponteiros para uma `Conversation` que possui as
mensagens.

- **Prós:** resolve a duplicação de mensagem sem mexer na semântica de `Channel`.
- **Contras:** três tabelas onde cabe uma; todo acesso ganha um join a mais. É a
  Opção 4 com uma indireção que não paga por si.

### Opção 4 — Unificar em `Channel`/`Message` (o caminho do Revolt)

`Channel.guildId` nullable, `ChannelType` ganha `DM` e `GROUP`, `ChannelMember`
passa a ser também a tabela de participantes, `DMMessage` some dentro de
`Message`.

- **Prós:** uma implementação por feature; a autorização volta para
  `assertCanViewChannel`; alinha com a referência do projeto.
- **Contras:** mudança cross-cutting (banco, api, contrato, web) numa tacada;
  `Channel.guildId` nullable obriga todo código de servidor a considerar o caso
  DM; `ChannelMember` passa a significar duas coisas.

## Decisão

Adotar a **Opção 4**: uma tabela de canal e uma de mensagem, com o tipo do canal
distinguindo servidor, DM e grupo.

O argumento decisivo é que as Opções 1–3 preservam o custo por feature — a única
que o elimina é a que faz DM e canal serem a mesma coisa no banco. E o momento é
agora: o volume de dados é zero e o web tem um único componente de conversa.

## Modelo alvo

```prisma
enum ChannelType {
  TEXT   // canal de texto de servidor
  VOICE  // canal de voz de servidor
  DM     // conversa 1-a-1
  GROUP  // conversa de 3+ pessoas
}

model Channel {
  id        String      @id @default(cuid())
  // null em DM/GROUP: a conversa não pertence a servidor nenhum.
  guildId   String?
  // null em DM (o título é derivado dos participantes); opcional em GROUP.
  name      String?
  type      ChannelType @default(TEXT)
  position  Int         @default(0)
  private   Boolean     @default(false)
  readOnly  Boolean     @default(false)
  // criador do grupo; null em DM e em canal de servidor.
  ownerId   String?
  // chave canônica "a:b" (ids ordenados) só em DM 1-a-1 — garante 1 canal por
  // dupla via upsert atômico. NULLs múltiplos são permitidos no Postgres.
  pairKey   String?     @unique
  createdAt DateTime    @default(now())

  guild    Guild?          @relation(fields: [guildId], references: [id], onDelete: Cascade)
  owner    User?           @relation("ChannelOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  members  ChannelMember[]
  messages Message[]

  @@index([guildId])
}

// Duas leituras, mesma tabela: em canal de servidor privado é a allowlist de
// quem enxerga; em DM/GROUP é a lista de participantes. Nos dois casos a
// pergunta que ela responde é "este usuário tem acesso a este canal?".
model ChannelMember {
  id        String   @id @default(cuid())
  channelId String
  userId    String
  joinedAt  DateTime @default(now())

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([channelId, userId])
  @@index([userId]) // "minhas conversas"
}
```

`Message`, `Reaction` e `Attachment` **não mudam** — passam a valer para DM de
graça. `DMChannel`, `DMParticipant` e `DMMessage` deixam de existir.

## Migração de dados

### O enum obriga a mais de uma migration

`ALTER TYPE ... ADD VALUE` no Postgres adiciona o valor dentro da transação, mas
**o valor novo não pode ser usado na mesma transação** — e o Prisma envolve cada
migration numa. Então a primeira migration só estende o enum:

```sql
-- migrations/<ts>_channel_type_dm/migration.sql
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'DM';
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'GROUP';
```

### Estrutura e cópia (segunda migration)

```sql
-- 1. Channel passa a aceitar conversa sem servidor
ALTER TABLE "Channel" ALTER COLUMN "guildId" DROP NOT NULL;
ALTER TABLE "Channel" ALTER COLUMN "name"    DROP NOT NULL;
ALTER TABLE "Channel" ADD COLUMN "ownerId"   TEXT;
ALTER TABLE "Channel" ADD COLUMN "pairKey"   TEXT;
ALTER TABLE "Channel" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Channel_pairKey_key" ON "Channel"("pairKey");
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChannelMember" ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. DMChannel → Channel (ids preservados; são cuid, não colidem com os de Channel)
INSERT INTO "Channel" ("id","guildId","name","type","position","private","readOnly","ownerId","pairKey","createdAt")
SELECT d."id", NULL, d."name",
       CASE WHEN d."isGroup" THEN 'GROUP'::"ChannelType" ELSE 'DM'::"ChannelType" END,
       0, false, false, d."ownerId", d."pairKey", d."createdAt"
FROM "DMChannel" d;

-- 3. DMParticipant → ChannelMember
INSERT INTO "ChannelMember" ("id","channelId","userId","joinedAt")
SELECT p."id", p."dmChannelId", p."userId", CURRENT_TIMESTAMP
FROM "DMParticipant" p;

-- 4. DMMessage → Message (DM não tinha thread: parentId nasce NULL)
INSERT INTO "Message" ("id","channelId","authorId","content","parentId","createdAt","editedAt")
SELECT m."id", m."dmChannelId", m."authorId", m."content", NULL, m."createdAt", m."editedAt"
FROM "DMMessage" m;
```

Sem `ON CONFLICT DO NOTHING` de propósito: colisão de cuid aqui seria bug, e
falhar alto é melhor que perder mensagem em silêncio.

### Conferência antes do drop

```sql
SELECT
  (SELECT count(*) FROM "DMMessage")                    AS mensagens_origem,
  (SELECT count(*) FROM "Message" m
     JOIN "Channel" c ON c."id" = m."channelId"
    WHERE c."guildId" IS NULL)                          AS mensagens_destino,
  (SELECT count(*) FROM "DMParticipant")                AS participantes_origem,
  (SELECT count(*) FROM "ChannelMember" cm
     JOIN "Channel" c ON c."id" = cm."channelId"
    WHERE c."guildId" IS NULL)                          AS participantes_destino;
```

### Drop (terceira migration, depois de validar)

```sql
DROP TABLE "DMMessage";
DROP TABLE "DMParticipant";
DROP TABLE "DMChannel";
```

> **Foi o que se fez** (não havia produção): a migration
> `20260825150000_unificar_dm_em_channel` estende o enum, altera `Channel`/
> `ChannelMember` e dropa as três tabelas antigas, sem `INSERT ... SELECT`. O SQL
> acima fica registrado aqui para o dia em que houver dados que não se pode perder.

## Impacto na API

### Autorização — o ponto que precisa de cuidado

`assertCanViewChannel` passa a cobrir os dois mundos, e o retorno vira uma união
discriminada para que **o compilador force cada chamador a decidir o que fazer
em DM**:

```ts
type AcessoAoCanal =
  | { tipo: "guild"; channel: ChannelRow; member: GuildMemberRow }
  | { tipo: "dm"; channel: ChannelRow };

async assertCanViewChannel(userId: string, channelId: string): Promise<AcessoAoCanal> {
  const channel = await this.prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, guildId: true, type: true, private: true, readOnly: true },
  });
  if (!channel) throw new NotFoundException("Canal não encontrado");

  // DM/grupo: acesso é participar, e ponto — não há papel nem allowlist.
  if (channel.guildId === null) {
    const participante = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!participante) throw new ForbiddenException("Você não participa desta conversa");
    return { tipo: "dm", channel };
  }

  const member = await this.assertMember(userId, channel.guildId);
  if (channel.private && !this.isPrivileged(member.role)) {
    // allowlist, exatamente como hoje
  }
  return { tipo: "guild", channel, member };
}
```

Chamadores que hoje leem `member.role` e passam a precisar de um ramo DM
explícito:

- `assertCanPostChannel` — `readOnly` não existe em DM: em `tipo: "dm"` basta o
  view. (Se um dia grupo tiver "só o dono fala", entra aqui.)
- `MessagesService.remove` — hoje `canModerate = member.role é OWNER/ADMIN`. Em
  DM não há moderador: só o autor apaga.
- `MessagesService.create` — troca `assertMember` pelo assert acima.

`DMsService.assertParticipant` some.

### REST

| Hoje                          | Depois                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `POST /dms` (abrir 1-a-1)     | continua — cria `Channel` com `type: DM` e `pairKey`                              |
| `POST /dms/group`             | continua — cria `Channel` com `type: GROUP`                                       |
| `GET /dms` (listar conversas) | continua — `Channel` com `guildId IS NULL` onde o usuário é `ChannelMember`       |
| `GET /dms/:id/messages`       | **some** — `GET /channels/:id/messages` já pagina por cursor                      |
| —                             | `GET /channels/:id/messages/search` e `/thread` passam a valer em DM              |

`DMsController` encolhe para o que é específico de DM: abrir, criar grupo,
listar. Leitura de mensagem é do `MessagesController`.

### WebSocket

| Hoje         | Depois                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| `dm.create`  | **some** → `message.create` (o payload já tem `channelId`)                     |
| `dm.new`     | **some** → `message.new`                                                      |
| —            | `message.edit`, `message.delete`, `reaction.add/remove` e `typing` valem em DM |

`ChatGateway.onDM` é deletado e o broadcast unifica em `channel:<id>`. Mas o
`onJoin` sozinho não basta: hoje quem recebe DM sem estar com a conversa aberta é
alcançado pela sala pessoal `user:<id>`. Para preservar isso, **no
`handleConnection` o socket entra nas salas de todas as conversas do usuário**
(uma query por conexão, sobre o `@@index([userId])` que `ChannelMember` já tem):

```ts
const conversas = await this.prisma.channelMember.findMany({
  where: { userId, channel: { guildId: null } },
  select: { channelId: true },
});
for (const c of conversas) client.join(this.room(c.channelId));
```

A sala `user:<id>` continua existindo para eventos de usuário (`guild.removed` e
uma futura notificação de conversa nova).

### Contrato (`packages/shared`)

- `Channel.guildId` vira `string | null` e `Channel.name` vira `string | null`
  — **breaking** para o web.
- `ChannelType` ganha `"DM" | "GROUP"`.
- `DirectMessage` e `DMCreatePayload` são removidos; `Message` e
  `MessageCreatePayload` servem os dois casos.
- `WS_EVENTS.DM_CREATE`/`DM_NEW` são removidos.
- `DMChannelView` **fica**, mas como projeção e não entidade: é `Channel` mais
  `others: PublicUser[]`, os participantes exceto quem está olhando — informação
  por espectador, que não cabe na tabela.

## Impacto no web

`apps/web/app/app/page.tsx` tem hoje dois estados de conversa (`activeChannel` e
`activeDM`), duas listas de mensagens e dois composers, com `dmMode` alternando
entre eles. Depois da unificação:

- um estado só de conversa ativa (`Channel`), com `guildId === null` decidindo se
  o cabeçalho mostra `#nome` ou o título derivado dos participantes;
- um caminho de envio só (`message.create`) e um handler de recebimento só
  (`message.new`);
- a DM ganha, sem código novo, o que a timeline de canal já faz: reagir, editar,
  apagar, responder em thread, anexar e buscar;
- `lib/api.ts` perde `dmHistory` (passa a usar o histórico de canal).

O `dmMode` do rail continua — é navegação, não modelo.

## Consequências

### Positivas

- Uma implementação por feature de mensagem; o backlog de "portar X para DM"
  deixa de existir.
- A autorização de canal volta a ter um lugar só, como o `CLAUDE.md` manda, e o
  tipo de retorno passa a **obrigar** o chamador a considerar DM.
- `packages/shared` encolhe: dois tipos e dois eventos a menos.
- O modelo passa a comportar o que hoje não é representável — voz em grupo de DM,
  mensagens salvas (`SavedMessages` do Revolt) — sem tabela nova.

### Negativas

- `Channel.guildId` nullable é uma armadilha permanente: toda query nova de
  servidor precisa filtrar por `guildId` (as atuais já filtram, porque partem de
  um `guildId` concreto). O assert discriminado limita o estrago, mas não cobre
  quem for direto ao Prisma.
- `ChannelMember` passa a significar duas coisas conforme o tipo do canal. O
  Revolt aceita o mesmo trade-off; a mitigação é o comentário no schema e o fato
  de a pergunta que a tabela responde ser a mesma nos dois casos.
- Anexo em DM aumenta a superfície de custo (R2) e de moderação para conversas
  privadas. É consequência de dar as features à DM — desejada, mas real.
- Migração cross-cutting: banco, 5 módulos da api, contrato e a página principal
  do web num intervalo só.

### Riscos

- **Regressão silenciosa de autorização** ao trocar o assert. Mitigação: fazer a
  união discriminada *primeiro*, sem o ramo DM, e deixar o typecheck apontar cada
  chamador antes de mexer no comportamento.
- **Perda de mensagem na cópia.** Mitigação: as contagens acima antes do `DROP`,
  e o drop numa migration separada, aplicada depois da validação.
- **`ALTER TYPE` dentro da transação da migration** derruba a migration.
  Mitigação: a separação em migrations descrita acima.

## Plano de execução

| Fase | O que                                                                                                                                | Verificação                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 0    | Pré-requisito: as frentes paralelas em andamento mescladas — isto toca `gateway`, `guilds`, `channels`, `messages`, `dms`, `shared` e o web | branch única                            |
| 1    | Migrations do enum e da estrutura + cópia, tabelas antigas ainda de pé                                                                  | as queries de conferência batem         |
| 2    | `assertCanViewChannel` discriminado + chamadores; `MessagesService` cobrindo DM                                                         | typecheck nos 3 pacotes                 |
| 3    | Gateway: deletar `onDM`, join das conversas no connect; remover `dm.*` de `shared`                                                      | 2 usuários trocando DM, reagindo, editando |
| 4    | Web: um caminho de conversa só                                                                                                         | DM e canal com o mesmo componente       |
| 5    | Migration de drop das tabelas antigas                                                                                                  | histórico de DM intacto depois do drop  |

## Como ficou implementado (2026-08-25)

- `GuildsService.assertCanViewChannel` devolve `ChannelAccess` (`tipo: "guild" |
  "dm"`); `assertCanPostChannel` deixa passar DM; `canModerateChannel` responde
  false em DM — `MessagesService.remove` usa isso (em DM só o autor apaga).
- `DMsService` encolheu para abrir/criar grupo/listar/sair; ao nascer uma
  conversa, `RealtimeService.joinChannelRooms` põe os participantes já conectados
  na sala. No connect, o gateway entra nas salas de todas as conversas do usuário.
- `ChatGateway.onDM`, `dm.create`, `dm.new`, `DirectMessage` e `GET /dms/:id/messages`
  foram removidos. `GuildChannelType` restringe o que se cria num servidor.
- Web: `useDMs` só guarda lista + conversa ativa; a timeline é `useMessages`
  (sala da conversa marcada como *sticky* no `socket-adapter`, para seguir
  recebendo enquanto se navega pelo servidor). `DMView` reaproveita
  `MessageList`/`Composer`/`SearchPanel`; thread funciona em DM.
- Mensagem de conversa desconhecida (alguém abriu DM comigo) recarrega a lista.

## Questões em aberto

- [ ] Grupo tem papéis (dono pode remover participante)? `ownerId` existe e só
      serve para passar a posse ao sair. Se sim, `ChannelMember` ganha `role`.
- [ ] "Mensagens salvas" (canal só seu, `SavedMessages` no Revolt)? É um valor a
      mais no enum e nada de código novo.
- [x] Sair de um grupo **apaga** o `ChannelMember` (como no Revolt); o último a
      sair leva o grupo.

## Referências

- Revolt / stoatchat: um `Channel` com `channel_type` e uma coleção de mensagens
  — ver `produto.md`.
- Código atual: `apps/api/prisma/schema.prisma` (`DMChannel`, `DMParticipant`,
  `DMMessage`), `apps/api/src/modules/dms/dms.service.ts`,
  `apps/api/src/modules/gateway/chat.gateway.ts` (`onDM`),
  `apps/api/src/modules/guilds/guilds.service.ts` (`assertCanViewChannel`).
- [Postgres — `ALTER TYPE ... ADD VALUE`](https://www.postgresql.org/docs/current/sql-altertype.html)
