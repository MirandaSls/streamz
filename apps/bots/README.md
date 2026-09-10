# `@streamz/bots` — os bots oficiais do Streamz

Bots que **nós** escrevemos, com nome do Streamz, hospedados nesta instância, e
que aparecem em "Descobrir aplicativos" como aplicativos oficiais.

Não são clones de bots de terceiros. Aqueles (todo mundo sabe quais) são
serviços fechados rodando na infraestrutura de quem os fez, conectados ao
`discord.com` com o token deles — não há nada que o Streamz possa expor que os
faça falar com a gente (§2 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`). O que
dá para fazer é escrever os nossos, e é isto.

| | |
|---|---|
| **Runtime comum** | `src/runtime/` — conexão, registro de comandos, roteamento de `/` e `!`, log, reconexão, desligamento |
| **Bots** | `src/musica/` (**Streamz Música**). Os próximos: moderação, níveis, boas-vindas, cargos por reação, tickets |
| **Como acrescentar um** | [`CONTRATO.md`](./CONTRATO.md) |
| **Deploy** | `docker-compose.yml`, profile `bots`: um container por bot, mais o `lavalink` |

---

## Streamz Música

Onze comandos, cada um com um apelido de prefixo:

| Comando | O que faz | `!` |
|---|---|---|
| `/tocar <busca ou link>` | entra no seu canal de voz e toca; tocando, entra na fila | `!tocar`, `!play`, `!p` |
| `/fila` | o que está tocando e o que vem depois | `!fila`, `!queue`, `!q` |
| `/agora` | a faixa atual, com barra de progresso | `!agora`, `!np` |
| `/pular` | próxima da fila | `!pular`, `!skip`, `!s` |
| `/pausar` · `/continuar` | pausa e volta | `!pause`, `!resume` |
| `/parar` | limpa a fila e sai do canal | `!parar`, `!stop`, `!sair` |
| `/volume <0-100>` | volume | `!vol` |
| `/embaralhar` | embaralha a fila | `!shuffle` |
| `/remover <n>` | tira a faixa n da fila | `!rm` |
| `/repetir <off\|faixa\|fila>` | modo de repetição | `!loop` |

Fontes: YouTube (busca e link), SoundCloud, Bandcamp, Twitch, Vimeo e HTTP
direto. **Link do Spotify vira busca** — o Spotify não entrega áudio a
terceiros, então o que toca é a gravação equivalente encontrada. Está dito na
descrição do bot no diretório, de propósito.

Só quem está no **mesmo canal de voz** manda nos controles.

### O que ele faz hoje sem a ponte de voz

Sobe, conecta, registra os comandos, aparece no diretório, entra em servidores
e responde a **todos** os comandos. O que não faz é emitir som: para isso a
ponte (`apps/ponte-voz`) precisa estar no ar. Nesse estado, `/tocar` responde
que a voz ainda não está configurada — em vez de pendurar esperando um
`VOICE_SERVER_UPDATE` que a API não vai mandar.

---

## Rodar

Não há node no host deste servidor: tudo em contêiner.

```bash
# typecheck + testes + lint
docker run --rm -v "$PWD":/w -w /w node:22 bash -lc "corepack enable; \
  pnpm install --frozen-lockfile; pnpm --filter @streamz/shared build; \
  pnpm --filter @streamz/bots exec tsc --noEmit; \
  pnpm --filter @streamz/bots test; pnpm --filter @streamz/bots lint"

# provisionar (cria/atualiza os Application, grava os tokens)
BOTS_EMAIL=… BOTS_SENHA=… STREAMZ_API_URL=https://api.streamz.chat/api \
  pnpm --filter @streamz/bots provisionar

# subir
docker compose --profile bots up -d --build lavalink bot-musica
```

## Ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `BOTS` | todos | quais bots este processo roda (`musica`, ou `a,b`) |
| `STREAMZ_API_URL` | `http://localhost:3333/api` | a nossa API, **sem** `/v10` |
| `STREAMZ_BOT_TOKEN` | — | o token, quando o container roda um bot só |
| `STREAMZ_BOT_TOKEN_<ID>` | — | o token de um bot específico |
| `BOTS_DIR` | `/opt/stack/streamz/.bots` | onde ficam os `<id>.token` (chmod 600) |
| `BOTS_DADOS_DIR` | `/dados` | o estado dos bots que têm estado (§5 do `CONTRATO.md`) |
| `BOTS_PREFIXO` | `!` | o prefixo da alternativa ao `/` |
| `LOG_FORMATO` / `LOG_NIVEL` | `json` / `info` | log |
| `BOTS_DEBUG` | — | `1` liga o `debug` do discord.js |
| `LAVALINK_HOST` / `LAVALINK_PORT` / `LAVALINK_SENHA` | `lavalink` / `2333` / `streamz` | o servidor de áudio |
| `LAVALINK_BUSCA` | `ytsearch` | plataforma de busca padrão |
| `MUSICA_VOLUME_PADRAO` | `60` | volume ao entrar |
| `BOTS_EMAIL` / `BOTS_SENHA` / `BOTS_TOKEN` | — | só no `provisionar` |
