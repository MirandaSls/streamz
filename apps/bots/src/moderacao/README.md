# Streamz Moderação

O bot oficial de moderação da instância. Uma pasta, como manda o
[`CONTRATO.md`](../../CONTRATO.md) — nada fora daqui, além do ícone
(`assets/moderacao.png`), do script que o gera
(`scripts/gerar-icone-moderacao.py`) e do serviço `bot-moderacao` no fim do
bloco de bots do `docker-compose.yml`.

Nome, arte e descrição são próprios. Os bots que fazem isto no Discord são
serviços fechados de outras empresas; usar o nome ou a arte deles seria se
passar por eles.

## Os comandos

Todos existem como `/comando` e como `!comando`.

| Comando | Exige de quem chama | O que faz |
|---|---|---|
| `/banir <usuário> [motivo] [apagar-mensagens-de: 0\|1\|7]` | Banir membros | bane |
| `/desbanir <ID>` | Banir membros | tira o banimento |
| `/expulsar <usuário> [motivo]` | Expulsar membros | expulsa |
| `/silenciar <usuário> <duração> [motivo]` | Moderar membros | `60s`, `10m`, `1h`, `1d`, `7d` (teto: 28 dias) |
| `/dessilenciar <usuário>` | Moderar membros | solta antes da hora |
| `/limpar <1-100> [de: usuário]` | Gerenciar mensagens | apaga as mensagens recentes do canal |
| `/aviso <usuário> <motivo>` | Moderar membros | registra um aviso |
| `/avisos <usuário>` | Moderar membros | lista os avisos (resposta efêmera) |
| `/limpar-avisos <usuário>` | Moderar membros | apaga a ficha |
| `/registro-de-moderacao [canal]` | Gerenciar servidor | onde publicar cada ação; sem argumento, diz o que está valendo |

Apelidos de prefixo: `!castigo`, `!purgar`, `!advertir`.

### Como se diz *quem*

Menção (`<@123…>`), ID (`123…`) ou **nome de usuário**. A terceira forma é a
que mais importa aqui: no Streamz a menção viaja como texto no corpo da
mensagem (`traducao/mensagem.ts`), então `@fulano` chega ao bot como as sete
letras. O bot procura no cache de membros — que está quente, porque o
`GUILD_CREATE` da nossa casca manda **todos** os membros. Nome ambíguo não
escolhe um: ele lista os IDs e pede que você diga qual.

## As regras de permissão

Em `hierarquia.ts`, pura e testada. Seis linhas, nesta ordem — e a ordem decide
qual frase a pessoa lê:

1. quem chamou tem a permissão do comando;
2. ninguém modera a si mesmo;
3. ninguém manda o bot se moderar;
4. ninguém modera o dono do servidor;
5. ninguém modera quem tem cargo igual ou mais alto — **inclusive o
   administrador**: `ADMINISTRATOR` dá a permissão, não a hierarquia;
6. o bot também precisa estar acima do alvo.

Recusa é sempre **efêmera** e sempre diz qual das seis linhas barrou. Erro da
API vira frase acionável (`servico.ts`), nunca pilha de erro no canal.

**O que estas regras não enxergam:** override de permissão por canal. A casca
manda `permission_overwrites: []` em todo canal (`traducao/canal.ts`), então a
conta é a do servidor. Consequência prática: um `MANAGE_MESSAGES` negado só
naquele canal ainda deixa o `/limpar` passar. É dívida da casca, não deste bot.

## O estado: um JSON por servidor

`/dados/<guildId>.json` — o caminho de estado comum a todos os bots, um volume
nomeado só deste container no compose. Guarda os avisos e o canal de registro.
A imagem já cria `/dados` com dono `node` (ver `apps/bots/CONTRATO.md` §7);
`BOTS_DADOS_DIR` muda o diretório nos testes e na bancada.

**Por que não uma tabela no banco:** a fundação dos bots oficiais não previu
estado, e criar uma tabela significaria mexer em `apps/api` — `schema.prisma`,
migration, módulo —, que é o terreno compartilhado que o contrato manda um bot
novo não pisar. Cinco bots nascendo ao mesmo tempo, cada um com a sua migration,
dariam o conflito que o contrato existe para evitar.

A escrita é **atômica** (temporário no mesmo diretório → `fsync` → `rename`) e
enfileirada por servidor: sem isso, um `docker stop` no meio de um `writeFile`
deixa um JSON truncado, e dois `/aviso` no mesmo segundo perdem um dos dois em
silêncio. Os dois casos têm teste.

**Caminho de migração para o banco:** quando os bots oficiais ganharem estado na
API — a forma natural é `BotGuildState { applicationId, guildId, chave, valor }`
com `GET/PUT /api/v10/applications/:app/guilds/:gid/estado` atrás do
`BotTokenGuard` —, só `estado.ts` muda; a interface já é assíncrona por isso, e
o `versao: 1` gravado no corpo existe para o laço de migração saber o que lê.

## O que depende de rota que a casca ainda não tem

A `discord-compat` de hoje é leitura para servidor e membros. **Não existem**
`PUT /guilds/:id/bans/:uid`, `DELETE /guilds/:id/bans/:uid`,
`DELETE /guilds/:id/members/:uid` nem `PATCH /guilds/:id/members/:uid` — que são
o que `member.ban()`, `member.kick()` e `member.timeout()` do discord.js
emitem. Então `/banir`, `/desbanir`, `/expulsar`, `/silenciar` e
`/dessilenciar` fazem **todas** as conferências, chamam o caminho certo e, com a
rota ausente, respondem uma frase que diz isso — em vez de pendurar ou cuspir
uma pilha de erro. É a mesma postura do bot de música com a ponte de voz.

O comportamento existe no Streamz (`apps/api/src/modules/moderation/` tem
banir, expulsar e silenciar), mas aquelas rotas são do REST interno, atrás do
`JwtGuard`, cujo credencial é o token de uma **pessoa** — e um bot carregando o
JWT de um humano agiria com a identidade dele, que é o oposto do que um
registro de moderação serve para provar. A tabela completa está no cabeçalho de
`servico.ts`.

`/limpar` **funciona hoje**, apagando uma mensagem por vez pelo
`DELETE /channels/:id/messages/:mid`. Isso tem um efeito colateral bom: o
`bulk-delete` do Discord recusa mensagem com mais de 14 dias, e o `DELETE`
unitário não.

## Ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `BOTS_DADOS_DIR` | `/dados` | onde ficam os `<guildId>.json` (comum a todos os bots) |

O resto é do runtime (ver `apps/bots/README.md`).

## Verificar

```bash
docker run --rm -v "$PWD":/w -w /w node:22 bash -lc "corepack enable; \
  pnpm install --frozen-lockfile; pnpm --filter @streamz/shared build; \
  pnpm --filter @streamz/bots exec tsc --noEmit; \
  pnpm --filter @streamz/bots test; pnpm --filter @streamz/bots lint"

# ponta a ponta, na bancada descartável (derruba tudo no fim)
apps/api/test/discord-compat/prova-botmod.sh
apps/api/test/discord-compat/prova-botmod.sh derrubar
```
