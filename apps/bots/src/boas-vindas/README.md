# Streamz Boas-vindas

Recebe quem chega no servidor. Um `guildMemberAdd`, um `guildMemberRemove`, e
nada mais.

**Nasce mudo.** Instalar o bot não faz ele escrever em lugar nenhum: tudo é
desligado por padrão e a primeira mensagem só sai depois de `/boas-vindas canal`.

---

## Comandos

Todos exigem **gerenciar servidor**; quem não tem leva uma recusa efêmera. Cada
um funciona igual como `/comando` e como `!comando` (o runtime cuida disso).

| Comando | O que faz |
|---|---|
| `/boas-vindas canal <#canal>` | escolhe o canal **e liga** as boas-vindas |
| `/boas-vindas mensagem <texto>` | o modelo da mensagem de entrada |
| `/boas-vindas dm [ligar\|desligar]` | manda também por conversa direta (sem valor, alterna) |
| `/boas-vindas ver` | a configuração inteira, num embed |
| `/boas-vindas testar` | dispara como se você tivesse acabado de entrar |
| `/boas-vindas desligar` | para de receber (canal e mensagem ficam guardados) |
| `/saida canal <#canal>` · `/saida mensagem <texto>` · `/saida desligar` | o mesmo, para quem sai |
| `/autorole <@cargo>` · `/autorole desligar` | cargo dado a quem entra |

Apelidos de prefixo: `!bv`, `!boasvindas`, `!tchau`, `!cargo-automatico`.

### Variáveis da mensagem

| | |
|---|---|
| `{usuario}` | a **menção** — `@nome`, que é o que faz o sino tocar no Streamz |
| `{nome}` | nome de exibição (apelido no servidor, se houver) |
| `{servidor}` | nome do servidor |
| `{contagem}` | quantos membros o servidor tem depois da entrada |

`{usuario}` sai como `@usuario` e **não** como `<@id>`: no Streamz é `@nome`
que o cliente desenha como menção (`apps/web/lib/markdown-core.ts`) e que
`mentionsUser` de `@streamz/shared` reconhece para notificar. `<@snowflake>`
sairia como texto cru — uma boas-vindas que não chama a pessoa.

Marcador desconhecido fica como está: quem escreveu `{data}` vê `{data}` e
entende que errou, em vez de ver um buraco.

### Por que `acao` é uma opção, e não um subcomando

`/boas-vindas canal` seria um subcomando, e a casca de compatibilidade
**recusa** subcomando e grupo de subcomando no `PUT` de registro, com 50035
(§9 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`). Então `acao` é uma opção de
texto com escolhas: no `/` a pessoa escolhe da lista; no `!` a primeira palavra
é a ação — exatamente o que digitaria se fossem subcomandos de verdade.

E `/boas-vindas ver` responde em **texto**, e não num embed: a resposta do
prefixo `!` é um `message.reply`, e o `POST /channels/:id/messages` da casca
recusa mensagem sem `content` (`50035 content[BASE_TYPE_REQUIRED]`). Um comando
que responde no `/` e estoura no `!` é pior que um comando sem embed — foi a
primeira execução da prova que pegou isso.

Pelo mesmo motivo o canal e o cargo chegam como **texto** (`#geral`, `@Membro`
ou o id) e não como opção de tipo canal/cargo: o `Contexto` do runtime só expõe
`texto()` e `numero()`, e uma opção `TIPO_CANAL` faria o `getString` do
discord.js lançar. Ver `alvos.ts`.

---

## O estado

**Nenhuma tabela no banco do Streamz.** Um JSON por servidor:

```
/dados/<guildId>.json
```

`BOAS_VINDAS_DIR` muda o diretório (padrão `/dados`); o `docker-compose.yml`
monta ali um volume nomeado, `boas-vindas-dados`.

```json
{
  "versao": 1,
  "entrada": { "ligado": true, "canalId": "…", "mensagem": "…", "dm": false, "mensagemDm": "…" },
  "saida":   { "ligado": false, "canalId": null, "mensagem": "…" },
  "autorole":{ "ligado": false, "cargoId": null }
}
```

- **Escrita atômica**: temporário no mesmo diretório → `fsync` → `rename`. Um
  container morto no meio da escrita não deixa JSON pela metade.
- **Um arquivo por servidor**: corromper um não leva os outros junto.
- **Fila por servidor**: dois comandos no mesmo segundo não se sobrescrevem.
- **Leitura nunca lança**: arquivo ausente, ilegível ou de outra versão cai no
  padrão (tudo desligado), campo a campo (`normalizarConfiguracao`).
- `ligado` sem alvo **é** desligado — a invariante é imposta na normalização, e
  não checada em cada uso.

O `guildId` é conferido contra `^[0-9]{1,32}$` antes de virar caminho.

---

## O que ainda não funciona nesta instância

O **cargo automático** e a **DM** chamam as rotas padrão do discord.js:

| | rota | estado |
|---|---|---|
| autorole | `PUT /guilds/:id/members/:uid/roles/:rid` | a casca não tem |
| DM | `POST /users/@me/channels` | a casca não tem (DM com bot é F5, §9) |

O bot chama assim mesmo — no dia em que a rota existir ele passa a funcionar
sem nenhuma mudança aqui. O que ele não faz é fingir que deu certo: um 404 vira
a frase de `SEM_ROTA_DE_CARGO`/`SEM_ROTA_DE_DM` no log e na resposta de quem
configurou, dizendo **qual rota falta**. A mensagem no canal, que é o miolo do
bot, não depende de nenhuma das duas.

---

## Rodar

```bash
docker compose --profile bots up -d --build bot-boas-vindas
```

Prova ponta a ponta na bancada descartável (sobe e derruba tudo):

```bash
apps/api/test/discord-compat/prova-botbv.sh
apps/api/test/discord-compat/prova-botbv.sh derrubar
```
