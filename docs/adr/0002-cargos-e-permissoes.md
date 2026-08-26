# ADR-0002: Cargos e permissões por bitfield

**Status:** Aceita e implementada (2026-08-25)
**Data:** 2026-08-25
**Decisores:** Arthur Miranda
**Escopo afetado:** `apps/api/prisma`, `apps/api/src/modules/{guilds,roles,channels,invites}`, `packages/shared`, `apps/web/{stores,components}`

## Contexto

A autorização do Streamz hoje cabe em três valores: `GuildMember.role` é
`OWNER | ADMIN | MEMBER`, e todo o resto é derivado disso —
`GuildsService.isPrivileged` responde "é OWNER ou ADMIN?" e essa única pergunta
decide **tudo**: criar canal, apagar mensagem dos outros, expulsar, banir,
revogar convite, ver canal privado, postar em canal somente-leitura.

Isso não dá paridade com o Discord e já trava as frentes vizinhas:

- não há como dar "pode expulsar" sem dar junto "pode apagar o servidor";
- não há como um canal ter regra própria ("neste canal, ninguém posta exceto o
  cargo Anúncios") — `readOnly` é um booleano global do canal;
- canal privado é uma **allowlist** (`ChannelMember`) que só entende usuário, não
  cargo: não dá para liberar um canal "para o cargo Moderação";
- moderação (agente H), emojis (G) e voz (F) precisam de permissões que não
  existem no modelo (`MODERATE_MEMBERS`, `MANAGE_EMOJIS`, `MUTE_MEMBERS`);
- a UI não tem o que exibir: nome colorido por cargo, seções da lista de membros
  por cargo, chips de cargo no perfil — nada disso é representável.

A referência do projeto (stoatchat/Revolt) usa exatamente o modelo do Discord:
cargos ordenados por `rank`, permissões como bitfield e *overrides* por canal.

## Fatores de decisão

- **Um lugar só para autorizar.** `CLAUDE.md` já fixa `assertCanViewChannel` /
  `assertCanPostChannel` como ponto único; a mudança não pode espalhar `if`s.
- **Não quebrar quem já chama.** Nove módulos chamam os asserts atuais; as
  assinaturas e o tipo `ChannelAccess` têm de continuar valendo.
- **Cálculo puro e testável.** A regra de precedência do Discord é sutil
  (deny→allow, @everyone→cargos→usuário, ADMINISTRATOR ignora override); ela
  precisa ser uma função sem banco, com teste exaustivo.
- **A mesma resposta nos dois lados.** O cliente esconde o que o usuário não
  pode fazer; se o cálculo do web divergir do da API, a UI mente.
- **Migração sem perder acesso.** Canal privado e somente-leitura já existem em
  banco — depois da migração as mesmas pessoas têm de continuar enxergando e
  postando exatamente os mesmos canais.

## Opções consideradas

### Opção 1 — Ampliar o enum `MemberRole`

Acrescentar `MODERATOR`, `EDITOR`, etc.

- **Prós:** mudança mínima; nenhuma tabela nova.
- **Contras:** não resolve nada do que motiva a ADR. Papéis fixos não compõem
  (o dono não consegue criar "só apaga mensagem"), não têm cor, não têm ordem e
  continuam sem regra por canal. Adia o problema com custo de migração igual.

### Opção 2 — Permissões como lista de strings (`["MANAGE_ROLES", …]`)

Cada cargo guarda um array de nomes de permissão.

- **Prós:** legível direto no banco; não tem teto de bits.
- **Contras:** o cálculo vira operação de conjunto sobre arrays em todo request
  (o de canal roda em *toda* mensagem); `allow`/`deny` de override viram dois
  arrays por linha; e o contrato com o cliente fica pesado. O bitfield faz o
  mesmo com `&`, `|` e `~`.

### Opção 3 — Bitfield por cargo + overrides por canal (modelo do Discord)

`Role.permissions` é um inteiro; `ChannelOverride` guarda `allow`/`deny`, também
inteiros, para um cargo **ou** um usuário; a permissão efetiva é uma função pura
de (membro, cargos, overrides).

- **Prós:** é o modelo que a referência do projeto usa, então "paridade com o
  Discord" deixa de ser tradução; o cálculo é aritmética de inteiro, barato o
  bastante para rodar por mensagem; `allow`/`deny` cabem em duas colunas; o
  contrato compartilhado é um número, idêntico nos dois lados.
- **Contras:** o bitfield tem teto (ver "Int e não BigInt"); o valor no banco não
  é legível a olho nu; a precedência precisa ser documentada e testada, porque
  errar a ordem é uma falha de segurança silenciosa.

## Decisão

Adotar a **Opção 3**.

`GuildMember.role` (`OWNER | ADMIN | MEMBER`) **continua existindo** como camada
de compatibilidade, com semântica reduzida e explícita:

| Valor    | Significado depois da ADR                                                |
| -------- | ------------------------------------------------------------------------ |
| `OWNER`  | dono: **ignora** cargos e overrides, tem todas as permissões, é intocável |
| `ADMIN`  | atalho: o membro recebe o cargo **"Administrador"** (`ADMINISTRATOR`)     |
| `MEMBER` | nada além do que `@everyone` e os cargos atribuídos derem                 |

`ADMIN` deixa de ser consultado na autorização: quem decide é o cargo. O enum
sobrevive porque a UI usa (coroa do dono, escudo de admin), `MemberJoinedEvent`
o carrega e nove módulos o leem — remover seria uma segunda migração
cross-cutting sem ganho. Promover/rebaixar via `PATCH /guilds/:id/members/:uid/role`
passa a **atribuir/remover o cargo "Administrador"** junto, para que as duas
representações nunca divirjam.

## Modelo

```prisma
// ── c-cargos ──
model Role {
  id          String   @id @default(cuid())
  guildId     String
  name        String
  /** cor "#RRGGBB"; null = sem cor (o nome herda a cor padrão do tema). */
  color       String?
  /** hierarquia: maior = mais alto. @everyone é sempre 0. */
  position    Int      @default(1)
  /** bitfield de `Permission` (@streamz/shared). */
  permissions Int      @default(0)
  /** exibe os membros deste cargo numa seção própria da lista de membros. */
  hoist       Boolean  @default(false)
  mentionable Boolean  @default(false)
  /** o @everyone, criado junto com o servidor. Um por servidor; nunca apagado. */
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model GuildMemberRole {   // N:N entre membro e cargo
  id      String @id @default(cuid())
  guildId String
  userId  String
  roleId  String
  @@unique([userId, roleId])
  @@index([guildId, userId])
}

model ChannelOverride {   // regra de um canal para um cargo OU um usuário
  id        String @id @default(cuid())
  channelId String
  roleId    String?
  userId    String?
  allow     Int    @default(0)
  deny      Int    @default(0)
  @@unique([channelId, roleId])
  @@unique([channelId, userId])
}
```

**O nome da tabela N:N é `GuildMemberRole`, e não `MemberRole`**, porque
`MemberRole` já é o nome do **enum** do Prisma — modelo e enum não podem
coexistir com o mesmo nome, e renomear o enum quebraria os nove módulos que o
importam de `@streamz/shared`.

`@everyone` **não gera linha** em `GuildMemberRole`: por definição vale para todo
membro do servidor, e materializar uma linha por membro só criaria estado para
manter sincronizado. O cálculo o injeta sempre.

### Int e não BigInt

O bitfield é `Int` (32 bits com sinal), não `BigInt`. O motivo é operacional: os
operadores `&`, `|` e `~` do JavaScript **convertem para 32 bits com sinal**, então
com `BigInt` cada checagem exigiria `BigInt(x) & BigInt(y)` — mais lento, mais
verboso, e um `Number()` esquecido vira bug silencioso. Com `Int`, `hasPermission`
é `(bits & p) === p` em qualquer um dos dois lados, sem conversão.

O preço é o teto: **30 bits utilizáveis** (o bit 31 é o sinal). Hoje são 19
permissões. Ao chegar perto de 30, a migração é trocar a coluna por `BigInt` e o
tipo do contrato por `bigint` — mecânica, e registrada aqui para não ser
descoberta tarde.

## Permissões

```
VIEW_CHANNEL     1<<0    MANAGE_GUILD     1<<7     MUTE_MEMBERS     1<<14
SEND_MESSAGES    1<<1    CREATE_INVITE    1<<8     MODERATE_MEMBERS 1<<15
MANAGE_MESSAGES  1<<2    ATTACH_FILES     1<<9     MANAGE_EMOJIS    1<<16
MANAGE_CHANNELS  1<<3    ADD_REACTIONS    1<<10    VIEW_AUDIT_LOG   1<<17
MANAGE_ROLES     1<<4    MENTION_EVERYONE 1<<11    ADMINISTRATOR    1<<18
KICK_MEMBERS     1<<5    CONNECT          1<<12
BAN_MEMBERS      1<<6    SPEAK            1<<13
```

Os bits são **estáveis para sempre**: o valor fica gravado em cada linha de
`Role` e `ChannelOverride`. Permissão nova entra no **próximo bit livre**;
nenhuma é renumerada nem reciclada.

`@everyone` nasce com
`VIEW_CHANNEL | SEND_MESSAGES | CREATE_INVITE | ATTACH_FILES | ADD_REACTIONS | CONNECT | SPEAK`
— o mesmo conjunto que o Discord dá por padrão.

## Precedência (`computePermissions`)

Função **pura**, em `packages/shared`, usada pela API e pelo cliente:

```
1. dono do servidor            → todas as permissões. Fim.
2. base = @everyone.permissions | (OR das permissões dos cargos do membro)
3. base tem ADMINISTRATOR      → todas as permissões. Fim (ignora overrides).
4. override de @everyone       → p = (p & ~deny) | allow
5. overrides dos cargos do membro, acumulados:
                                 p = (p & ~ΣdenyCargos) | ΣallowCargos
6. override do próprio usuário → p = (p & ~deny) | allow
```

Três detalhes que são a razão de a função existir isolada e testada:

- **`deny` antes de `allow` em cada etapa**, e não deny global antes de allow
  global — senão um `allow` de cargo baixo sobrescreveria um `deny` de cargo alto.
- **Os overrides de cargo somam-se entre si** (não há precedência entre cargos
  no nível do override): `deny` acumulado de todos os cargos do membro é
  aplicado, depois o `allow` acumulado. É o comportamento do Discord.
- **`ADMINISTRATOR` sai antes dos overrides.** Um `deny VIEW_CHANNEL` num canal
  não esconde nada de quem é administrador. Se essa etapa ficasse depois,
  qualquer canal poderia trancar o próprio administrador para fora.

**Hierarquia** é coisa separada da permissão efetiva: mesmo com `MANAGE_ROLES`,
um membro só cria, edita, apaga, reordena ou atribui cargo **estritamente abaixo**
do seu cargo mais alto (`highestPosition`); o dono não tem esse teto. Sem isso,
`MANAGE_ROLES` seria equivalente a `ADMINISTRATOR` em um passo.

## Autorização — como os asserts mudam

As assinaturas e o tipo `ChannelAccess` ficam; a união discriminada
(`tipo: "guild" | "dm"`) continua obrigando o chamador a tratar DM. O que muda é
**o que decide** e um campo novo:

| Antes                                    | Depois                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| `assertCanViewChannel`: privado → allowlist | `VIEW_CHANNEL` na permissão efetiva **daquele canal**    |
| `assertCanPostChannel`: `readOnly` → OWNER/ADMIN | `SEND_MESSAGES` na permissão efetiva                |
| `canModerateChannel`: OWNER/ADMIN        | `MANAGE_MESSAGES` na permissão efetiva                     |
| `assertCanModerate(actor, guild)`        | `assertCanModerate(actor, guild, Permission.X)` — a permissão exigida é do chamador |
| `visibleChannelsForUser` / `viewersOfChannel`: `private` + allowlist | `VIEW_CHANNEL` canal a canal   |

`ChannelAccess` ganha `permissions: number` nos dois ramos — quem já autorizou
não precisa recalcular para uma segunda checagem (ex.: anexar arquivo).
Em DM a permissão é fixa
(`VIEW_CHANNEL | SEND_MESSAGES | ATTACH_FILES | ADD_REACTIONS | CONNECT | SPEAK`):
não há cargo nem override em conversa direta, e `MANAGE_MESSAGES` continua fora,
que é o que faz "em DM só o autor apaga" seguir valendo.

### `private` / `readOnly` viram espelho, não fonte

As colunas `Channel.private` e `Channel.readOnly` **continuam existindo** — a
lista de canais desenha cadeado e megafone a partir delas, e três frentes
paralelas as leem. Mas depois desta ADR elas são **derivadas**: a fonte é o
override de `@everyone` daquele canal.

```
private  ⇔  override(@everyone).deny tem VIEW_CHANNEL
readOnly ⇔  override(@everyone).deny tem SEND_MESSAGES
```

Toda escrita de override chama `sincronizarFlagsDoCanal`, que reescreve as duas
colunas a partir do override — e a criação/edição de canal com
`private`/`readOnly` cria o override correspondente. Uma direção só, sempre a
mesma, senão as duas representações divergem em silêncio.

A allowlist `ChannelMember` também **continua**: ela é a lista que a UI de acesso
ao canal edita. Cada linha passa a ter um override de usuário com
`allow: VIEW_CHANNEL` espelhado, criado/apagado junto.

## Migração de dados

Uma migration (`c-cargos_cargos_e_permissoes`), nesta ordem:

1. cria `Role`, `GuildMemberRole`, `ChannelOverride`; acrescenta
   `Guild.description` e `Guild.iconKey`;
2. para **cada servidor existente**, cria `@everyone` (`isDefault`, position 0,
   permissões padrão) e `Administrador` (`ADMINISTRATOR`, position 1, `hoist`);
3. cada `GuildMember` com `role = 'ADMIN'` ganha uma linha em `GuildMemberRole`
   apontando para o `Administrador` do seu servidor;
4. cada canal com `private = true` ganha `override(@everyone) deny VIEW_CHANNEL`;
   cada canal com `readOnly = true`, `deny SEND_MESSAGES` (mesma linha quando os
   dois são verdadeiros);
5. cada `ChannelMember` de canal **de servidor** vira
   `override(usuário) allow VIEW_CHANNEL` — é a allowlist convertida. Linhas de
   DM/grupo ficam de fora: lá `ChannelMember` significa participante, não
   allowlist.

Depois da migração, **o conjunto de quem vê e de quem posta cada canal é
idêntico ao de antes** — é essa a propriedade que a migração precisa preservar, e
o passo 5 é o que a garante para canal privado.

## Consequências

### Positivas

- Permissão vira dado, não código: o dono compõe o que quiser sem release.
- Regra por canal passa a existir (o que `readOnly` global nunca deu).
- F, G e H ganham as permissões de que precisam (`MUTE_MEMBERS`,
  `MANAGE_EMOJIS`, `MODERATE_MEMBERS`, `VIEW_AUDIT_LOG`) sem tocar no modelo.
- O cliente calcula com **a mesma função** da API, então esconder o que não pode
  ser feito não é uma segunda regra escrita à mão que envelhece sozinha.
- A UI ganha o que precisa para parecer Discord: cor por cargo, seções `hoist`,
  chips no perfil.

### Negativas

- Duas representações de "é admin" (`GuildMember.role` e o cargo Administrador)
  precisam ser escritas juntas. Mitigação: só um método escreve as duas
  (`setRole`), e o assert nunca lê o enum.
- `private`/`readOnly` viram cache. Mitigação: uma função de sincronia, chamada
  de todo caminho de escrita de override.
- `assertCanViewChannel` deixa de ser uma consulta e passa a ser um cálculo
  (cargos do membro + overrides do canal). Roda em toda mensagem. Mitigação: são
  duas queries indexadas (`GuildMemberRole` por `[guildId,userId]`,
  `ChannelOverride` por `channelId`) e aritmética de inteiro; se virar gargalo, o
  passo seguinte é cache por (usuário, servidor) invalidado nos eventos de cargo.
- Teto de 30 bits (acima).

### Riscos

- **Errar a precedência é falha de segurança silenciosa** — ninguém vê um canal
  aparecer para quem não devia até acontecer. Mitigação: `computePermissions` é
  pura e tem teste exaustivo por etapa, incluindo os três detalhes listados acima.
- **Perder acesso na migração.** Mitigação: o passo 5 converte a allowlist antes
  de a autorização passar a ler override; e o e2e sobe com canal privado.
- **Hierarquia esquecida num endpoint novo** transforma `MANAGE_ROLES` em
  `ADMINISTRATOR`. Mitigação: `assertPodeMexerNoCargo` é um método só, chamado
  por criar/editar/apagar/reordenar/atribuir.

## Questões em aberto

- [ ] Cargo mencionável (`mentionable`) é dado guardado, mas `@cargo` ainda não é
      reconhecido no texto da mensagem — depende do parser de menção (frente A).
- [ ] Cargo por conversa de grupo (DM): hoje DM tem permissão fixa. Se grupo
      ganhar "só o dono fala", entra como override de canal sem `guildId`.
- [ ] Auditoria (`VIEW_AUDIT_LOG`) tem bit reservado, mas o log em si é da
      frente H.

## Referências

- Discord — [Permissions](https://discord.com/developers/docs/topics/permissions)
  (bitwise, overwrites, ordem de aplicação).
- Revolt / stoatchat: `Role { permissions, rank }` e overrides por canal.
- Código: `apps/api/src/modules/guilds/guilds.service.ts` (asserts),
  `packages/shared/src/index.ts` (`Permission`, `computePermissions`),
  `docs/adr/0001-unificar-dm-em-channel-message.md` (por que o assert é discriminado).
