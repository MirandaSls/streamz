# Contrato dos bots oficiais

Como acrescentar um bot novo a `apps/bots/` **sem tocar em nenhum outro**.

Escrito junto com a fundação e com o primeiro bot (`musica`). Se alguma coisa
aqui divergir do código, o código está certo e este arquivo tem de ser
corrigido no mesmo PR.

---

## 1. A regra que faz o paralelo funcionar

**Um bot = uma pasta em `src/`, e nada fora dela.**

Não existe registro central para editar. O runtime descobre os bots varrendo
`dist/` (ver `src/runtime/registro.ts`): toda pasta que não seja `runtime/`
e que tenha um `index.js` é um bot. Foi uma decisão deliberada — uma lista
`{ musica, moderacao, niveis, … }` seria mais fácil de ler, mas seria também
**o arquivo em que cinco agentes trabalhando em cinco bots dariam conflito**, e
conflito num registro é do tipo que compila torto e some um bot em silêncio.

O preço: o `tsc` não confere a forma do `default` de cada pasta. Quem confere é
`validarBot()`, na subida, dizendo qual campo falta. Errar custa um container
que não sobe — barulhento, que é o que se quer.

### Arquivos que um bot novo **pode** criar

```
apps/bots/src/<seu-bot>/**       # tudo seu
apps/bots/assets/<seu-bot>.png   # o ícone
apps/bots/scripts/gerar-icone-<seu-bot>.py
```

### Arquivos que um bot novo **precisa** tocar (e são as únicas linhas em comum)

| Arquivo | O que acrescentar | Conflito? |
|---|---|---|
| `docker-compose.yml` | um serviço `bot-<seu-bot>` sob `profiles: ["bots"]` | Só se dois PRs mexerem no mesmo trecho. Ponha o serviço **no fim** do bloco dos bots e o merge resolve sozinho. |
| `apps/bots/package.json` | uma dependência, **se** o seu bot precisar de uma | Idem; a maioria dos bots não precisa. |

### Arquivos que um bot novo **não** toca

`src/runtime/**`, `src/musica/**`, `Dockerfile`, `tsconfig.json`,
`provisionar.ts`. Se você precisou mexer no runtime, o contrato está faltando
alguma coisa — abra a conversa em vez de acrescentar um caso especial.

---

## 2. O mínimo que uma pasta de bot exporta

```ts
// apps/bots/src/boas-vindas/index.ts
import type { Bot } from "../runtime/tipos";

const bot: Bot = {
  nome: "Streamz Boas-vindas",          // vira o `Application.name` no diretório
  descricao: "Recebe quem chega…",      // vira a descrição do diretório
  comandos: [],                          // pode ser vazio: nem todo bot tem `/`
  async aoIniciar(ctx) { /* ligue o que é seu */ },
};

export default bot;
```

Campos opcionais: `aoDesligar`, `intents` (além de `Guilds`, `GuildMessages` e
`MessageContent`, que todos têm), `permissoesPadrao` (bitfield de `Permission`
do `@streamz/shared`, o que a tela de instalação sugere) e `icone` (caminho
relativo à raiz de `apps/bots`).

O tipo completo, com o porquê de cada campo, está em `src/runtime/tipos.ts`.

### Nome e descrição não são decoração

São exatamente o que o `provisionar` grava no `Application` e o que aparece em
"Descobrir aplicativos". Duas regras:

1. **Nome próprio do Streamz.** Nada de nome, logotipo ou descrição de bot de
   terceiro — nem em dado de teste que possa ir para produção. Aqueles bots são
   serviços fechados de outras empresas; usar o nome deles é se passar por eles.
2. **A descrição diz o que o bot *não* faz.** O bot de música avisa que link do
   Spotify vira busca. É mais barato dizer antes do que responder depois.

---

## 3. O que o runtime já faz por você

- conecta com discord.js@14 apontado para a nossa API
  (`rest: { api, version: "10" }` — a única linha que diferencia um bot do
  Streamz de um bot do Discord);
- `login` com espera crescente (o container do bot sobe junto com o da API e os
  primeiros segundos dão `ECONNREFUSED`);
- **registra os comandos de barra globais** na subida, por sobrescrita em bloco:
  o que sumiu do código some do servidor;
- roteia `interactionCreate` **e** o prefixo `!` para o mesmo `executar(ctx)`;
- log estruturado (uma linha de JSON por evento, com `bot` e `nivel`);
- reconexão do gateway (é do discord.js) com o ciclo de vida no log;
- desligamento limpo em SIGTERM/SIGINT, chamando o `aoDesligar` de cada bot.

Você escreve `executar(ctx)`. O `ctx` é o mesmo para `/comando` e `!comando`:
`ctx.texto("opcao")`, `ctx.numero("opcao")`, `ctx.pensando()`,
`ctx.responder(...)`, `ctx.guildId`, `ctx.canalId`, `ctx.usuarioId`,
`ctx.bot.cliente`, `ctx.bot.log`.

**Efêmera degrada.** `responder({ efemera: true })` vira `flags: 64` de verdade
no comando de barra e uma resposta normal no prefixo `!` — um canal de texto não
tem esse conceito, e engolir a resposta seria pior.

**A última opção de texto engole a linha.** No prefixo `!`, marque
`restoDaLinha: true` na opção que recebe frase (`!tocar caetano veloso`), senão
ela chega com uma palavra só e o resto some em silêncio.

---

## 4. O passo a passo

1. `mkdir apps/bots/src/<seu-bot>` e escreva o `index.ts` do §2.
2. Comandos: um `Comando` por arquivo ou todos num `comandos.ts` — dentro da
   sua pasta, à sua escolha.
3. Ícone: um script em `scripts/gerar-icone-<seu-bot>.py` (Pillow em
   `python:3-slim`, como o da música), saída em `assets/<seu-bot>.png`. **Arte
   própria**; não copie ativo de terceiro.
4. Teste o que for lógica pura (`*.spec.ts`, vitest). O runtime não precisa de
   teste seu.
5. Serviço no `docker-compose.yml`, copiando o `bot-musica` e trocando
   `BOTS`/`container_name`.
6. Verificação, no docker (não há node no host):
   ```bash
   docker run --rm -v "$PWD":/w -w /w node:22 bash -lc "corepack enable; \
     pnpm install --frozen-lockfile; pnpm --filter @streamz/shared build; \
     pnpm --filter @streamz/bots exec tsc --noEmit; \
     pnpm --filter @streamz/bots test; pnpm --filter @streamz/bots lint"
   ```
7. Prova na bancada descartável: copie `apps/api/test/discord-compat/prova-botmus.sh`
   com o **seu** prefixo de container (`bot<algo>-`) e derrube tudo no fim.

---

## 5. Provisionamento e token

`pnpm --filter @streamz/bots provisionar` cria o que faltar. É idempotente e a
chave é o `nome`. Ele:

1. entra com `BOTS_EMAIL`/`BOTS_SENHA` (ou `BOTS_TOKEN`);
2. cria a `Application` se não existir e **grava o token** em
   `<BOTS_DIR>/<id>.token` (padrão `/opt/stack/streamz/.bots/`), `chmod 600`
   num diretório `chmod 700`;
3. escreve nome, descrição e `permissoesPadrao`, e liga `publico: true`
   (é o que faz aparecer no diretório);
4. marca como **oficial** (`POST /api/admin/applications/:id/oficial`, atrás do
   `PlatformAdminGuard`) — sem conta de administrador o bot funciona igual, só
   não vem na frente do diretório;
5. envia o ícone (503 sem R2 configurado é aviso, não erro).

**O token em claro só existe uma vez**, na criação. Se o aplicativo já existe e
o arquivo sumiu, o script avisa e não faz nada — regenerar derruba o bot que
estiver no ar. Com `--regenerar-token` ele regenera de propósito.

Nunca commite token. Nunca ponha token no `.env` da raiz: aquele arquivo é
produção viva, lido pela API e pela web.

---

## 6. Voz

Só o bot de música precisa disso hoje, mas a regra vale para qualquer bot que
entre numa call: **tocar exige a ponte de voz (`apps/ponte-voz`) no ar**. Sem
ela a API nem chega a mandar o `VOICE_SERVER_UPDATE` — ela recusa assinar o
token e só registra no log. Um bot que espere esse evento sem relógio fica
pendurado para sempre.

O jeito certo está em `src/musica/servico.ts`: escute o evento cru
(`Events.Raw`), marque os servidores para os quais o `VOICE_SERVER_UPDATE`
chegou, e ao entrar num canal espere com prazo. Estourou, responda uma frase
clara e destrua o player.
