# Contrato da F2 — voz e a ponte

Escrito pelo coordenador **antes** de os lotes começarem, na branch de
integração `feat/bots-f2`. Serve para os três lotes trabalharem em worktrees
separadas, sem se falarem e sem colidirem.

Fonte da verdade do *conteúdo*: `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` — §8
inteiro (D5.1 a D5.8), §7 (o gateway que a F1 fez), §12 "F2", §15. Fonte da
verdade do *processo*: `docs/PROCESSO-DE-DESENVOLVIMENTO.md` §6.4. O contrato da
fase anterior, que continua valendo para tudo que é API:
`apps/api/src/modules/discord-compat/CONTRATO-F1.md`.

> **A F1 já está na `main`** (PR #179). Use o que ela deixou pronto e não
> reinvente: `RegistroDeSessoes`/`SessaoDoBot` (`gateway/sessao.ts`),
> `GatewayCompatService` (`gateway/servidor.ts`, onde o op 4 hoje é aceito e
> ignorado), `PonteDeEventos` (`gateway/dispatch.ts`, o fan-out por intent),
> `DadosDeCompatService`, `IdsService` (snowflake ↔ cuid),
> `RealtimeService.onEvent`, e o ambiente de prova descartável em
> `apps/api/test/discord-compat/` (`ambiente.sh`, `semear.mjs`, `prova.sh`).

**A entrega da fase, em uma frase:** um bot de música do Discord (Lavalink /
discord-player / `@discordjs/voice`) entra no canal de voz do Streamz e o som
sai no navegador de quem está na call.

---

## 1. Quem escreve o quê

O esqueleto da ponte **já existe nesta branch**, com as assinaturas fechadas e
os corpos em `panic("F2 lote X: … não implementado")`. Cada lote preenche os
corpos dos seus arquivos e não toca nos dos outros — assim os dois lotes de Go
compilam desde o primeiro minuto (`go build ./...` já passa) e o merge não tem
conflito.

| Lote | Arquivos que ele preenche |
|---|---|
| **A1 — cripto + UDP** | `apps/ponte-voz/{cripto.go,rtp.go,udp.go}` + `cripto_test.go`, `rtp_test.go`, `udp_test.go` |
| **A2 — WS + LiveKit** | `apps/ponte-voz/{main.go,gateway.go,sessao.go,livekit.go,Dockerfile}` + os testes deles |
| **B — API: op 4 e `VOICE_SERVER_UPDATE`** | `modules/discord-compat/gateway/voz.ts` (novo), `gateway/servidor.ts` (**uma linha**: rotear o op 4), `gateway/dispatch.ts` (os dois casos de voz + `voice_states` no `GUILD_CREATE`), `modules/voice/voice.service.ts` (+ `voice.module.ts`), `modules/discord-compat/ponte-voz.controller.ts` (novo, a rota interna), `discord-compat.module.ts` |
| **C — deploy + `zlib-stream`** (o mesmo agente do B, depois) | `docker-compose.yml`, `docker-compose.traefik.yml`, `.env.example`, `modules/discord-compat/gateway/compressao.ts` (novo) + teste |

**Arquivos do coordenador — ninguém mais os edita:**
`apps/ponte-voz/{contrato.go,registro.go,go.mod,go.sum}`, este
`CONTRATO-F2.md`, `apps/api/test/discord-compat/prova-voz.sh` e o que ele
chamar.

Precisou de um campo novo no `contrato.go`, de um provider novo, de um erro
novo? **Relate no PR** e siga com o que tem. Quem acha uma peça faltando
relata, não cria (§6.4 do processo).

**Zero sobreposição de arquivo entre A1/A2 e B/C**: a ponte é um diretório novo
em outra linguagem. Entre A1 e A2, a fronteira inteira é o `contrato.go`.

---

## 2. A fronteira entre A1 e A2, em Go

Está toda em `apps/ponte-voz/contrato.go` (leia-o inteiro; é curto e tem os
porquês). O resumo:

```go
type ConfigDaPonte struct { PortaWs, PortaUdp int; IpPublico, Segredo, ApiInternaUrl string; DumpPacote bool }

type Modo string                       // "aead_aes256_gcm_rtpsize" | "aead_xchacha20_poly1305_rtpsize"
var  ModosAnunciados = []string{...}   // a ordem do READY.modes
func ModoSuportado(nome string) (Modo, bool)

// A1 entrega (cripto.go):
type Cifrador interface {
    Decifrar(pacote []byte) (opus []byte, ok bool)          // pacote RTP INTEIRO
    Cifrar(cabecalho, opus []byte, contador uint32) []byte  // só teste/vetor
}
func NovoCifrador(modo Modo, chave []byte) (Cifrador, error)
func SortearChave() ([]byte, error)

// A2 entrega (sessao.go); A1 só consome:
type SessaoDeVoz interface {
    SSRC() uint32
    Decifrar(pacote []byte) (opus []byte, ok bool)
    Publicar(opus []byte)
    FixarOrigem(origem *net.UDPAddr)
    Origem() *net.UDPAddr
    Viva() bool
}

// do coordenador (registro.go), os dois usam:
type RegistroDeSessoes interface { ProximoSSRC() uint32; Registrar(SessaoDeVoz); PorSSRC(uint32) (SessaoDeVoz, bool); Remover(uint32); Tamanho() int }
```

O caminho quente, em uma frase: **A1 lê do socket → acha a sessão pelo SSRC →
`sessao.Decifrar(pacote)` → enfileira (teto de 200 ms) → `sessao.Publicar(opus)`
→ A2 chama `WriteSample`.** A1 nunca precisa saber que o LiveKit existe; A2
nunca precisa saber o que é um nonce.

**A1 testa sem A2** implementando `SessaoDeVoz` com um duplo de dez linhas no
`udp_test.go`. **A2 testa sem A1** com o `Cifrador` que A1 entrega — e, enquanto
ele ainda dá `panic`, com um duplo próprio.

### `go.mod` está fechado — não rode `go mod tidy`

`go.mod` e `go.sum` já listam **todas** as dependências dos dois lotes
(`golang-jwt/jwt/v5`, `gorilla/websocket`, `livekit/server-sdk-go/v2`,
`pion/webrtc/v4`, `x/crypto`). Isso é de propósito: dois agentes editando
`go.mod` colidem, e um `go mod tidy` numa árvore parcial **apaga** as
dependências que o outro lote ainda não importou. Se faltar mesmo alguma coisa,
`go get` e **diga no PR** — o coordenador resolve no merge.

> **Divergência do documento, medida:** o §12 e o prompt dizem `golang:1.23`.
> **Não funciona**: `server-sdk-go/v2@v2.18.1` e `golang.org/x/crypto@v0.57.0`
> exigem `go >= 1.26`. A imagem é **`golang:1.26`** (go1.26.8) e o `go.mod` diz
> `go 1.26.8`. Medido em 2026-09-08; o `Dockerfile` do lote A2 usa a mesma.

---

## 3. O JWT do `VOICE_SERVER_UPDATE` — a fronteira entre B e A2

A API assina, a ponte confere. **HS256** com `PONTE_VOZ_SEGREDO` (a mesma string
nos dois lados; nada de RSA aqui — é um segredo compartilhado entre dois
contêineres do mesmo compose).

```jsonc
// header: {"alg":"HS256","typ":"JWT"}
{
  "iss":   "streamz-api",
  "aud":   "ponte-voz",
  "sub":   "1420…",                 // snowflake do BOT   → IDENTIFY.user_id
  "gid":   "1418…",                 // snowflake da GUILD → IDENTIFY.server_id
  "sid":   "9f3c…",                 // session_id do gateway compat → IDENTIFY.session_id
  "sala":  "voice:clx9a…",          // sala do LiveKit (VoiceService.salaDe)
  "canal": "1419…",                 // snowflake do canal de voz
  "nome":  "Bot de música",         // nome do participante no LiveKit
  "ident": "bot:1420…",             // identidade no LiveKit (§D5.6)
  "lk":    "eyJhbGciOi…",           // token do LiveKit, já assinado pela API
  "lkUrl": "wss://livekit.streamz.chat",
  "iat":   1757336400,
  "exp":   1757337300
}
```

Em Go isso é o `Reivindicacao` de `sessao.go` — **os nomes dos campos JSON são o
contrato e não mudam de um lado só.**

**O que a ponte valida** (`ValidarToken` em `gateway.go`), nesta ordem:
assinatura HS256; `aud == "ponte-voz"`; `exp` no futuro; e então
`sub`/`gid`/`sid` **iguais** ao `user_id`/`server_id`/`session_id` do próprio
`IDENTIFY`. Sem essa última comparação um token vazado entraria em qualquer
sala. Falhou: close **4004**.

**Divergências do documento, decididas aqui:**

1. **`exp` é 15 minutos, não 60 segundos.** O `@discordjs/voice` **reusa o mesmo
   token** ao reconectar o WS de voz (close 4015, queda de rede, reinício da
   ponte) sem pedir um `VOICE_SERVER_UPDATE` novo. Com 60 s, a primeira
   reconexão depois de um minuto de música morre com 4004 e o bot desiste. 15
   min cobre a reconexão e continua sendo um token de vida curta.
2. **O token do LiveKit lá dentro tem `ttl: "6h"`**, não a 1 h do
   `assinarToken` de hoje: o TTL do LiveKit vale na **entrada** na sala, e uma
   reconexão duas horas depois do `/play` precisa entrar de novo.
3. **Tamanho.** O §D5.8 lista "o `token` passar de 1 KB" como o risco nº 1 do
   Lavalink. Ficamos com o JWT (é o desenho do documento) **e medimos**: o lote
   B loga `token.length` ao assinar e o **PR reporta o número**. Se algum
   cliente truncar, a saída documentada é o ticket opaco de 32 bytes com
   `GET /api/interno/ponte-voz/ticket/:t` — não implementado agora, e
   registrado como o primeiro item de dívida da fase.

### O `VOICE_SERVER_UPDATE`, no fio

```jsonc
{ "op": 0, "s": 42, "t": "VOICE_SERVER_UPDATE",
  "d": {
    "token": "<o JWT acima>",
    "guild_id": "1418…",            // string decimal, sempre
    "endpoint": "voz.streamz.chat"  // sem esquema e SEM PORTA (§D5.8, risco 3)
  } }
```

As libs montam `wss://<endpoint>/?v=8` sozinhas. `endpoint` vem de
`PONTE_VOZ_ENDPOINT` (`.env`), com `voz.streamz.chat` de padrão — o script de
prova aponta para o contêiner da ponte, e sem a variável não haveria como.

### O `VOICE_STATE_UPDATE` do próprio bot, no fio

Vai **antes** do `VOICE_SERVER_UPDATE` (é a ordem do §8, e o `@discordjs/voice`
espera os dois; o `session_id` sai daqui):

```jsonc
{ "op": 0, "s": 41, "t": "VOICE_STATE_UPDATE",
  "d": {
    "guild_id": "1418…", "channel_id": "1419…", "user_id": "1420…",
    "session_id": "9f3c…",          // o MESMO `id` da SessaoDoBot do gateway compat
    "member": { /* MembroDoDiscord completo, com `user` */ },
    "deaf": false, "mute": false,
    "self_deaf": true, "self_mute": false, "self_video": false, "self_stream": false,
    "suppress": false, "request_to_speak_timestamp": null
  } }
```

Sair do canal é o mesmo evento com `channel_id: null` — e **sem**
`VOICE_SERVER_UPDATE` atrás.

---

## 4. A rota interna: a ponte avisa que caiu (§D5.7)

Sem ela, uma ponte que morre deixa o bot para sempre na coluna e no palco do
web. A carência de 45 s (`VOICE_RECONNECT_GRACE_MS`) do gateway do web **não se
aplica a bot**: bot que caiu, caiu.

```http
POST {API_INTERNA_URL}/api/interno/ponte-voz/estado
X-Ponte-Segredo: {PONTE_VOZ_SEGREDO}
Content-Type: application/json

{"bot":"1420…","canal":"1419…","conectado":false}
→ 204
```

Lado da API (lote B, `ponte-voz.controller.ts`): compara o segredo em **tempo
constante** (`timingSafeEqual`, como o `autorizarScrape` de `common/metrics.ts`
— nunca `===`), traduz os snowflakes com o `IdsService`, chama
`voice.leave(botUserId, channelId)` e despacha `VOICE_STATE_UPDATE` com
`channel_id: null` para as sessões daquele bot. Segredo ausente na API: a rota
responde **503**, não "liberado" — aqui não existe o caso de conveniência que o
`METRICS_TOKEN` tem.

Lado da ponte (lote A2, `AvisarQueCaiu` em `main.go`): chama e **só loga** se
falhar. Não há o que fazer, e travar o encerramento de uma sessão por causa
disso seria pior.

---

## 5. O `_rtpsize` e a extensão de cabeçalho — leia isto duas vezes

É o risco nº 1 do §15 e o que mata a fase em silêncio.

```
 ┌───────────── 12 bytes ──────────────┐┌──── n ────┐┌─ 16 ─┐┌─ 4 ─┐
 │ 0x80 0x78 seq(2) timestamp(4) ssrc(4)││ Opus cifr.││ tag  ││nonce│
 └─────────────────────────────────────┘└───────────┘└──────┘└─────┘
   ▲ AAD                                    ▲ ciphertext        ▲ contador BE
```

- O **nonce são os 4 últimos bytes do pacote** e sai **antes** de decifrar.
- **AES-256-GCM**: IV de 12 bytes = os 4 bytes **seguidos de 8 zeros**.
- **XChaCha20-Poly1305**: nonce de 24 bytes = os 4 bytes **seguidos de 20
  zeros**.
- A tag de 16 bytes fica colada no ciphertext, que é o que `cipher.AEAD.Open`
  espera: `Open(nil, iv, pacote[cab:len-4], pacote[:cab])`.

**A extensão (`0x90`) — o ponto que ninguém mediu.** O documento afirma que o
AAD é "o cabeçalho, mais CSRCs e o **preâmbulo** de extensão, se houver". Isso
quer dizer `12 + 4×CC + 4`, com o **corpo** da extensão do lado cifrado. É a
nossa primeira aposta e é o que `TamanhoDoCabecalhoRTP` implementa — **mas nós
não medimos contra cliente nenhum**, e é a diferença entre música e silêncio.

Por isso o `Decifrar` de A1 é obrigado a ter o caminho de recuperação: **num
pacote com o bit X, se a primeira tentativa falhar, tente com
`TamanhoDoCabecalhoComExtensao` (corpo da extensão dentro do AAD) e registre,
uma vez por sessão, qual das duas funcionou.** São cinco linhas e tiram da mesa
o defeito que custaria a fase inteira. O PR do A1 **diz qual venceu** no degrau
4 — e, se for a segunda, o coordenador corrige o §D5.3 do documento.

O `--dump-pacote` (lote A2) existe para o mesmo motivo: os primeiros pacotes de
cada sessão saem em hexdump, com o tamanho de cabeçalho calculado ao lado.

---

## 6. As quatro provas, e de quem é cada uma

Cada lote entrega a **saída** da sua prova no corpo do PR. O coordenador roda a
3 e a 4 depois do merge.

| Degrau | O que prova | Quem roda |
|---|---|---|
| **1. Unitário** | `go test ./...`: ida e volta com vetor **gravado** nos dois modos, e um pacote com extensão `0x90`. **Se falhar, nada adiante funciona.** | A1 (e A2 para o que é dele) |
| **2. `nc -u`** | pacote de descoberta de 74 bytes → resposta com o IP certo, com a ponte em docker local | A1 |
| **3. `@discordjs/voice` sozinho** | script Node sem bot toca um `.ogg` → participante `bot:` aparece no LiveKit (`livekit-cli list-participants`, LiveKit descartável) | A2 (coordenador repete no fim) |
| **4. Lavalink v4 + bot de ~200 linhas** | `!play <link do YouTube>` → o som sai num cliente LiveKit de teste; **3 min sem picote**, com contagem de frames e gaps | coordenador |

`go test -race ./...` e `go vet ./...` são obrigatórios nos dois lotes de Go. Do
lado da API vale o §3 do `CONTRATO-F1.md`: cada lote roda `pnpm --filter
@streamz/shared build`, `prisma generate`, `tsc --noEmit` e os testes da API; a
verificação completa é uma vez só, no fim, pelo coordenador.

O degrau 4 usa `!play` por mensagem, **não** `/play`: interactions são a F3.

---

## 7. Deploy — o que é nosso e o que é do usuário (§D5.5)

Nosso (lote C): o serviço `ponte-voz` no `docker-compose.yml` com
`ports: ["7883:7883/udp"]`, os labels do router no `docker-compose.traefik.yml`
com **`ports: !override`** (sem ele o Compose *concatena* as listas — a mesma
pegadinha já documentada no LiveKit), e as `PONTE_VOZ_*` no `.env.example`.

**`/opt/stack/traefik` é território bloqueado.** Só labels no compose do
Streamz. O Traefik **não faz UDP** — por isso a porta de mídia é publicada
direta, sem proxy, e só o WS passa por ele.

Do usuário, e sem isto a fase fica bloqueada: o DNS `voz.streamz.chat` →
`143.95.161.17` (Cloudflare **cinza**, DNS only, pelo mesmo motivo do LiveKit:
timeout de ocioso do proxy num WS que fica em silêncio entre faixas) e abrir
**7883/udp** no firewall do sistema **e** no do provedor. O PR final traz o
passo a passo e o `nc -u` para conferir a porta **antes** de culpar o código.

**Nada de `docker compose up` nos serviços reais e nada de `.env` de produção.**
Tudo em ambiente descartável.

---

## 8. Regras que valem para os três lotes

1. **Nunca `git checkout`/`git switch` em `/opt/stack/streamz`** (há outros
   agentes em `mobile`, `bots-f3` e sub-agentes). Worktree própria;
   **nunca `worktree remove`**.
2. Cada lote parte de **`origin/feat/bots-f2`**, não de `main`, e abre PR
   **contra `feat/bots-f2`**. Ninguém mergeia — só o coordenador, e só nessa
   branch. **Ninguém mergeia em `main`.**
3. **Nomes em português no código novo, Go inclusive** (`sessao.go`,
   `cripto.go`, `Decifrar`, `Publicar`). O protocolo é inglês por natureza:
   `SELECT_PROTOCOL`, `secret_key`, `ssrc` ficam como são.
4. **Mudança mínima fora do escopo. Não refatore ao redor.**
5. **Sem node e sem go no host**: tudo em `docker run --rm` (`golang:1.26`,
   `node:22`, `python:3-slim`).
6. **Nada de `bigint` num `JSON.stringify`** (regra 6 do `CONTRATO-F1.md`): todo
   id que sai para o bot é **string decimal**.
7. Commits em português, cada um terminando com:

   ```
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

8. PR com descrição em português (o que muda, arquivos, o que ficou inerte, o
   que **não** foi verificado, e "como testar" com passos), terminada em:

   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_01PT5Ze54BcXtgjyMfWgWvYy
   ```

9. **Se o documento estiver errado, relate no PR.** O coordenador corrige o
   documento no PR final.

---

## 9. Divergências do documento já conhecidas (e decididas)

- **`golang:1.23` não compila a ponte.** É `golang:1.26` (§2 acima).
- **`exp: 60s` no JWT quebra a reconexão do `@discordjs/voice`.** É 15 min
  (§3).
- **O documento não previa a rota interna com nome nem formato.** Fica
  `POST /api/interno/ponte-voz/estado` com `X-Ponte-Segredo` (§4).
- **O documento não previa `PONTE_VOZ_ENDPOINT`.** Sem ela, não há como o
  script de prova apontar o bot para um contêiner local (§3).
- **O `_rtpsize` com extensão não foi medido por ninguém.** Daí o caminho de
  recuperação obrigatório (§5).
- **`voice_states` no `GUILD_CREATE` sai vazio desde a F1** (`dispatch.ts` diz
  "F2"). O lote B preenche: é dele que o bot de música sabe quem está no canal.
- **`Red: false` do §D5.6 não existe** em
  `lksdk.TrackPublicationOptions@v2.18.1` — não compila. Existe `Stereo`, que o
  documento não cita e que importa mais para música: **use `Stereo: true`**.

### O que o coordenador já mediu, para ninguém repetir (2026-09-08, `golang:1.26`)

O risco nº 2 do §15 ("publicar Opus no LiveKit sem transcodificar — confirmado
no papel, não medido por nós") está **medido no nível da API**: compila e roda.

```
lksdk.NewLocalSampleTrack(webrtc.RTPCodecCapability{MimeTypeOpus, 48000, 2})  → track, nil
track.WriteSample(media.Sample{Data: …, Duration: 20ms}, nil)                 → ok
room.JoinWithToken(url, token, ...ConnectOption) error
chacha20poly1305.NewX(chave32).NonceSize() = 24   Overhead() = 16
```

O que **continua não medido** é o payloader aceitar quadros Opus reais de ponta
a ponta — é o degrau 3.
