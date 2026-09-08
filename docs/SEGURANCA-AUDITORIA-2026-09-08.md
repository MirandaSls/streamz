# Auditoria de segurança — Streamz — 2026-09-08

Escopo: `streamz.chat`, `api.streamz.chat`, `livekit.streamz.chat`; monorepo
`/opt/stack/streamz` (API NestJS + Prisma/Postgres, web Next, desktop Tauri,
`packages/shared`); deploy em docker compose neste servidor com Traefik na
frente; mídia em Cloudflare R2; voz em LiveKit self-hosted.

Método: leitura primeiro. Scanner de segredos sobre o histórico inteiro do git,
inspeção do servidor e dos contêineres, sondagens HTTP contra produção, e
revisão de código dos controllers, do gateway, do cliente web e do Tauri. Nada
foi alterado em produção: nenhum `.env`, nenhum contêiner, nenhum segredo
rotacionado, nada em `/opt/stack/traefik`. As correções foram para PRs, e o que
depende de infraestrutura está aqui como recomendação com o comando pronto.

**Nenhum valor de segredo aparece neste documento.** Onde um segredo é citado,
está dito onde ele mora e como trocá-lo, nunca o que ele é.

> ### Nota de método — o clone principal está 157 commits atrasado
>
> A primeira rodada de leitura de código foi feita sobre `/opt/stack/streamz`,
> que está em `b315dcc` enquanto `origin/main` está em `8063e9e` — **157
> commits de diferença**. Isso foi descoberto no meio da auditoria, pelo sintoma
> certo: dois revisores relataram "o soundboard não existe neste código", quando
> os PRs #158 e #160 já o tinham mergeado.
>
> O que foi feito a respeito: o módulo `soundboard` e o delta inteiro dos 157
> commits foram auditados **de novo, contra `origin/main`** — é o que está na
> seção **E**. As conclusões das seções A-D que dependem de código foram
> reconfirmadas contra a árvore atualizada (ver E4).
>
> As **correções** nunca sofreram desse problema: os cinco PRs partem de
> `origin/main`, não do clone atrasado.
>
> Fica a recomendação operacional: `git -C /opt/stack/streamz pull` de vez em
> quando. Um clone principal parado há 157 commits faz qualquer revisão —
> humana ou automatizada — olhar para o software errado.

---

## Sumário executivo

### A pergunta que você fez

> "quero que ele fique seguro, verifique se não tem nada vazado ou dado que seja
> comprometedor"

**Não há segredo vazado.** Esta é a conclusão principal e ela é sólida:

- O `gitleaks` varreu os **416 commits** do repositório e achou **um** item, que
  é a **chave pública** do atualizador do Tauri — pública por definição, é ela
  que o instalador usa para conferir a assinatura. Não é vazamento.
- **Nenhum `.env`, `.key`, `.pem`, `id_rsa`, `livekit.yaml` ou dump de banco
  jamais foi commitado** — nem hoje, nem em commit apagado depois. Verificado
  com `git log --all --diff-filter=A`.
- Peguei cada segredo real do `/opt/stack/streamz/.env` e procurei o valor
  literal dentro do **bundle da web já buildado**, do **instalador do desktop
  descompactado** e da **árvore de trabalho do repositório**. Zero ocorrências
  nos três.
- As imagens Docker publicadas no GHCR **não levam** `.env`, `docs/` nem os
  instaladores.
- Permissões corretas: `/opt/stack/streamz/.env`, `livekit.yaml` e
  `/root/.tauri/streamz.key` estão todos `-rw------- root root`.

Ou seja: **não há nada a rotacionar às pressas.** O que existe é dívida de
robustez, e é disso que trata o resto do relatório.

### O que pede ação sua HOJE

Em ordem de urgência:

| # | O quê | Por quê |
|---|---|---|
| 1 | **Aprovar e publicar o PR do SSRF** (`embeds`) | É o único achado **Crítico**. Qualquer conta autenticada faz a API buscar URL interna e devolver o conteúdo. |
| 2 | **Atualizar as dependências da web** — Next 14.2.35 tem **20 avisos Altos**, entre eles SSRF e negação de serviço | Só o `pnpm audit` já lista 15 avisos abertos contra a versão em produção. |
| 3 | **Trocar o `DOWNLOAD_PASSWORD`** | 11 caracteres, parece frase em português. É a única senha fraca do `.env`. |
| 4 | **Fixar a versão do LiveKit** (`livekit/livekit-server:latest`) | `latest` muda sob seus pés: um `docker compose pull` pode trocar o servidor de voz sem você saber. |

E uma que não é urgente mas é a mais fácil: **aprovar o PR do `.gitignore`**.
Hoje `docs/Reference/` (61 MB de capturas reais do Discord, com foto de perfil e
apelido de gente real) está **não rastreado e não ignorado** — um `git add -A`
distraído publica dados pessoais de terceiros no GitHub, de onde não saem mais.

### O panorama

O código é, no geral, **bem acima da média** para um clone de Discord feito em
poucas semanas. Vários pontos que costumam estar quebrados estão certos aqui, e
vale nomeá-los porque eles é que sustentam o resto:

- **argon2id** com os parâmetros do OWASP, sem bcrypt em lugar nenhum.
- Tokens de e-mail com **256 bits, guardados só em hash**, de uso único e com
  validade. Nem um dump do banco troca a senha de alguém.
- **Rotação real de refresh token**, atômica (dois refreshes concorrentes, só um
  passa).
- **Lockout por conta** (5 falhas / 15 min) somado ao teto por IP — cobre o
  ataque distribuído que o teto por IP sozinho não pega. Confirmado ao vivo:
  10 tentativas e o 11º pedido volta 429.
- **CORS com allowlist de verdade.** Testei `evil.example.com`,
  `streamz.chat.evil.com`, `null` e `localhost`: nenhum reflete. Só
  `https://streamz.chat` recebe `Access-Control-Allow-Origin`.
- **Upload validado por magic bytes**, nunca pelo `Content-Type` que o cliente
  manda. SVG e HTML não passam no sniff, viram `application/octet-stream` e
  saem com `Content-Disposition: attachment` + `nosniff`. Não há XSS
  armazenado por anexo.
- **Token do LiveKit com o mínimo**: `roomJoin` + `canPublish` + `canSubscribe`
  na sala exata do canal, sem `roomAdmin`, sem `roomCreate`, sem `roomList`.
- **Zero `dangerouslySetInnerHTML`** na web inteira. O markdown é um parser
  próprio que produz AST e é renderizado como elementos React — não existe
  caminho que gere HTML.
- **`PLATFORM_ADMIN_EMAILS` é checado por e-mail VERIFICADO.** Trocar o
  e-mail zera `emailVerifiedAt`, então não dá para herdar o painel editando o
  próprio cadastro. Era o ponto mais crítico do escopo e está certo.
- **Sem SQL raw perigoso**: duas ocorrências em toda a API, ambas parametrizadas.
  Zero `$queryRawUnsafe`.

E o módulo mais novo, o **soundboard**, que nunca havia sido auditado, saiu
limpo no essencial: sem IDOR entre servidores em nenhuma das cinco rotas
autenticadas, tipo por magic bytes, chave de R2 imune a traversal, teto de
disparo por usuário.

O que puxa a nota para baixo é concentrado e tem endereço: o módulo `embeds`
(SSRF e ReDoS), o bloqueio de usuário que não vale na DM, e os overrides de
**canal e categoria** — quatro buracos de escalada, sendo os de categoria os
piores, porque propagam para todos os canais sincronizados. Somado à ausência de
cabeçalhos de segurança na web, são cinco temas, e **todos os cinco têm PR
aberto**.

---

## Tabela por item

Severidade: 🔴 Crítica · 🟠 Alta · 🟡 Média · ⚪ Baixa · ✅ ok

| Item | Assunto | Status |
|---|---|---|
| **A1** | Segredos no histórico do git | ✅ **ok** — 416 commits, 1 achado e é a chave **pública** do updater |
| **A2** | Arquivos rastreados indevidos | 🟡 `docs/Reference/`, `docs/ref-ui/`, `updates/`, `.claude/` **não rastreados mas não ignorados** — corrigido no PR #163 |
| **A3** | Segredos no bundle web / instalador | ✅ **ok** — nenhum segredo real encontrado nos dois; só 4 `NEXT_PUBLIC_*`, todas URLs |
| **A4** | PII nos logs | ✅ **ok** — sem token, sem senha, sem IP. ⚪ só o e-mail do admin no boot |
| **A5** | Portas e arquivos expostos no servidor | ✅ **ok** — Postgres e API no loopback; `.env` 600; nada servido por engano |
| **B6** | Autenticação | 🟡 sessão revogada sobrevive até 15 min; 2FA sem teto por conta; enumeração no registro |
| **B7** | Autorização por rota / IDOR | 🟠 bloqueio não vale na DM · 🟡 dois buracos nos overrides de canal · 🟡 castigo com hierarquia legada |
| **E16** | Soundboard (nunca auditado antes) | ✅ sólido — sem IDOR nas 5 rotas, magic bytes, chave imune a traversal · 🟡 duração do áudio só validada no cliente |
| **E17** | Override de **categoria** | 🟠 **Alta** — escrita sem hierarquia e remoção sem trava nenhuma, propagando aos canais sincronizados |
| **E18** | `voice/move` | 🟡 sem `assertCanActOn` — dá para arrastar o dono do servidor |
| **E19** | Resto do delta de 157 commits | ✅ ok — token do LiveKit melhorou, 6 rotas novas todas com guard |
| **E20** | Reconfirmação das seções A-D na árvore nova | ✅ tudo mantido |
| **B8** | Gateway socket.io | 🟡 voz de canal privado vaza para a guild · 🟡 presença em broadcast global · 🟡 socket sobrevive à revogação |
| **B9** | Validação de entrada | 🔴 **SSRF no `embeds`** · ✅ upload, path traversal e redirect aberto ok |
| **B10** | Injeção | 🟠 **ReDoS no `embeds`** · ✅ SQL raw ok · 🟡 busca sem teto de termo |
| **B11** | Cabeçalhos e transporte | 🟡 web sem **nenhum** cabeçalho de segurança — corrigido no PR #164 · ✅ CORS ok |
| **B12** | Rate limiting | ✅ HTTP ok (verificado ao vivo) · 🟡 12 de 18 eventos WS sem teto · ⚪ tetos são por processo (sem Redis) |
| **C13** | Cliente web e Tauri | 🟡 desktop aceita URL de LiveKit arbitrária do JS · 🟡 mic/câmera sem prompt · ✅ zero XSS, capabilities mínimas |
| **D14** | Dependências e infra | 🟠 **20 avisos Altos** no `pnpm audit`, quase todos Next 14.2.35 · 🟡 `livekit:latest` · ✅ `cargo audit` limpo |
| **D15** | Backups | 🟡 existem e são diários, mas **sem cifra e só locais** |

---

## A. Segredos e vazamentos

### A1 — Histórico do git · ✅ ok

```
$ docker run --rm -v /opt/stack/streamz:/repo zricethezav/gitleaks:latest \
    detect -s /repo --no-banner --redact -f json -r /out/gitleaks.json
INF 416 commits scanned.
INF scanned ~6576186 bytes (6.58 MB) in 1.35s
WRN leaks found: 1
```

O único achado:

| Regra | Arquivo | Commit | Veredito |
|---|---|---|---|
| `generic-api-key` | `apps/desktop/src-tauri/tauri.conf.json:72` | `2d76c3ac` | **Falso positivo.** É `plugins.updater.pubkey` — a chave **pública** minisign. Ela *precisa* estar no repositório: é com ela que o app instalado confere a assinatura da atualização. A privada correspondente está em `/root/.tauri/streamz.key`, fora do repo, com permissão `600`. |

Confirmação independente de que nada sensível jamais entrou:

```
$ git log --all --diff-filter=A --name-only --pretty=format: | sort -u \
  | grep -EiI '(^|/)\.env($|\.)|\.key$|\.pem$|id_rsa|livekit\.yaml$|Caddyfile$'
(vazio)
```

**Nenhuma rotação é necessária.** O `.env.example` rastreado só tem placeholders
(`"troque-por-um-segredo-forte"`, `""`), nunca valor real.

### A2 — Arquivos rastreados que não deviam estar · 🟡 Média

Nada indevido está **rastreado**. O problema é o outro:

```
$ git status --short
?? .claude/
?? docs/Reference/
?? docs/ref-ui/
?? updates/
```

Quatro pastas **não rastreadas e não ignoradas** — o `git add -A` de sempre
publica todas. Conteúdo:

| Pasta | Tamanho | O que tem |
|---|---|---|
| `docs/Reference/` | 61 MB, 2135 arquivos | 1125 capturas reais do Discord em pt-BR. Conferi as imagens: mostram **foto de perfil, apelido e nome de servidor de pessoas reais**. Junto vai o acervo de 974 SVG de ícones do Discord — material com direitos de terceiros. |
| `docs/ref-ui/` | 343 arquivos | Mesma origem |
| `updates/` | ~300 MB | 29 instaladores `.exe` |
| `.claude/` | grande | `worktrees/` (já ignorada) + `saida-desktop/`, com mais 22 pastas de instalador |

Repositório privado não muda o cálculo: o que entra no histórico do git é
praticamente impossível de tirar depois, e uma cópia local basta para vazar.

**Corrigido no PR #163.**

### A3 — Segredos no bundle da web e no instalador · ✅ ok

Método: li cada par `CHAVE=valor` do `.env` de produção e procurei o **valor
literal** dentro de cada alvo. Sem imprimir valor nenhum.

| Segredo | Bundle web (`.next`) | Instalador 1.0.1 (NSIS extraído, 43 MB) | Árvore do repo |
|---|---|---|---|
| `POSTGRES_PASSWORD` | não encontrado | não encontrado | não encontrado |
| `DATABASE_URL` | não encontrado | não encontrado | não encontrado |
| `JWT_SECRET` | não encontrado | não encontrado | não encontrado |
| `JWT_REFRESH_SECRET` | não encontrado | não encontrado | não encontrado |
| `SMTP_URL` | não encontrado | não encontrado | não encontrado |
| `LIVEKIT_API_SECRET` | não encontrado | não encontrado | não encontrado |
| `R2_ACCESS_KEY_ID` | não encontrado | não encontrado | não encontrado |
| `R2_SECRET_ACCESS_KEY` | não encontrado | não encontrado | não encontrado |
| `GIPHY_API_KEY` | não encontrado | não encontrado | não encontrado |

O instalador foi descompactado de verdade (`7z x` sobre o NSIS), não só passado
no `strings` — o payload comprimido foi olhado.

**`NEXT_PUBLIC_*` — só quatro, todas URLs**, nenhuma carrega segredo:
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_LIVEKIT_URL`,
`NEXT_PUBLIC_APP_VERSION`. A chave do Giphy fica **só no servidor** — o cliente
pede GIF pela própria API (`/gifs/search`), que é o desenho certo. Nenhuma
variável sem prefixo é lida em componente client.

**Chave privada do Tauri:** `/root/.tauri/streamz.key`, `-rw------- root root`,
fora do repositório e fora do contexto de build do Docker. Correta.

### A4 — PII nos logs · ✅ ok (⚪ uma ressalva)

```
$ docker logs streamz-api --since 24h   # 292 linhas
e-mail          1     ← só "Admin da instância: @mdz <...>" no boot
password        3     ← nomes de rota (/auth/password/...), não valores
passwordHash    0
Bearer          0
eyJ... (JWT)    0
refreshToken    0
"ip"            0
authorization   0
```

Log estruturado em JSON com `reqId` por requisição. Não loga corpo de mensagem,
token nem IP. O único PII é o e-mail do administrador, uma vez, no boot — ⚪
Baixa, e é informação operacional legítima.

⚪ Nota: quando o CORS recusa uma origem, a exceção sai com stack trace
completo. Ruído, não vazamento.

### A5 — Servidor · ✅ ok

```
$ ss -tlnpu
tcp LISTEN 0.0.0.0:80        docker-proxy   ← Traefik
tcp LISTEN 0.0.0.0:443       docker-proxy   ← Traefik
tcp LISTEN 0.0.0.0:22022     sshd
tcp LISTEN 0.0.0.0:7881      docker-proxy   ← LiveKit TCP (precisa ser público)
udp UNCONN 0.0.0.0:7882      docker-proxy   ← LiveKit UDP (precisa ser público)
tcp LISTEN 127.0.0.1:3000    docker-proxy   ← web, só loopback
tcp LISTEN 127.0.0.1:3333    docker-proxy   ← API, só loopback
tcp LISTEN 127.0.0.1:5432    docker-proxy   ← Postgres, só loopback
```

**Nada indevido exposto.** Postgres, API e web só alcançáveis pelo loopback; o
tráfego público passa obrigatoriamente pelo Traefik. O `docker-compose.yml`
publica a porta 7880 do LiveKit (signaling), mas o
`docker-compose.traefik.yml` a remove com `ports: !override` — e o `ss`
confirma que ela **não** está aberta. Redis nem sequer está rodando
(`REDIS_URL` vazio), então não há Redis sem senha exposto.

Sondagens contra produção:

| URL | Resposta |
|---|---|
| `https://streamz.chat/.env` | 404 |
| `https://streamz.chat/../.env` | 404 |
| `https://streamz.chat/livekit.yaml` | 404 |
| `https://api.streamz.chat/.env` | 404 |
| `https://api.streamz.chat/api/../.env` | 404 |
| `https://api.streamz.chat/updates/` | 404 |
| `https://api.streamz.chat/api/updates/` | 404 |
| `https://api.streamz.chat/downloads/` | 404 |
| `https://api.streamz.chat/api/downloads/` | 200 — só `{configurado, disponiveis:[{plataforma,tamanho,atualizadoEm}]}`, **sem listagem de diretório** |
| `https://api.streamz.chat/api/metrics` | 404 (gateado por `METRICS_TOKEN`, que não está configurado) |

Rotas autenticadas todas recusam sem token (`{"message":"Token ausente"}`):
`/api/discover`, `/api/users/me`, `/api/admin/me`, `/api/admin/users`.

Permissões:

```
-rw------- root root  /opt/stack/streamz/.env
-rw------- root root  /opt/stack/streamz/livekit.yaml
-rw------- root root  /root/.tauri/streamz.key
-rw-r--r-- root root  /root/.tauri/streamz.key.pub   ← pública, ok
```

**Força dos segredos do `.env`** (medida sem imprimir valor):

| Chave | Comprimento | Veredito |
|---|---|---|
| `POSTGRES_PASSWORD` | 48 | ✅ forte |
| `JWT_SECRET` | 64 | ✅ forte, diferente do refresh |
| `JWT_REFRESH_SECRET` | 64 | ✅ forte |
| `LIVEKIT_API_SECRET` | 64 | ✅ forte |
| `R2_SECRET_ACCESS_KEY` | 64 | ✅ forte |
| `LIVEKIT_API_KEY` | 7 | ⚪ é o **identificador** da chave, não o segredo. Adivinhável, mas sozinho não serve. |
| `DOWNLOAD_PASSWORD` | 11 | 🟡 **fraca** — ver recomendação R3 |

O boot valida os dois segredos de JWT (`min(16)` e obrigatoriamente
diferentes) e recusa subir com `THROTTLE_DISABLED=1` em produção.

---

## B. API e autenticação

### B6 — Autenticação · 🟡 Média

Base bem construída. Achados, do mais para o menos importante:

**🟡 Média — revogar sessão não mata o access token nem o WebSocket.**
`apps/api/src/common/jwt.guard.ts:37-50` valida a assinatura e consulta o
estado da conta, mas **nunca confere a claim `sid` contra
`RefreshToken.revokedAt`**. Depois de `POST /auth/logout`,
`DELETE /me/sessions/:id` ou de uma troca de senha, o dispositivo revogado
continua com acesso total por até **15 minutos**. Pior no tempo real:
`chat.gateway.ts:161-197` só autentica no `handleConnection`, então o socket já
aberto do dispositivo revogado **fica conectado indefinidamente**, recebendo
mensagens novas.

Isso importa como produto, não só como segurança: "perdi o celular, encerrei a
sessão" hoje não encerra de verdade. A correção é barata porque as peças já
existem — o `sid` já está no token e a linha de sessão já é estável: basta o
guard validar `sid` contra a sessão viva (aproveitando o cache de 60 s que já
existe) e o gateway chamar `disconnectSockets(true)` na sala do usuário.

**🟡 Média — não há guard de autenticação global; o modo de falha é abrir.**
O único `APP_GUARD` é o `ThrottlerGuard`. O `JwtGuard` é aplicado rota a rota, e
**não existe decorator `@Public()`**. Um controller novo que esqueça o
`@UseGuards` fica público sem que teste, lint ou revisão percebam. O inverso
(`APP_GUARD: JwtGuard` + `@Public()` explícito) falha fechado.

Levantamento completo hoje: **177 rotas, 25 sem `JwtGuard`** — e todas as 25 são
legítimas por desenho (9 de auth, 3 de ops, 6 de stream de mídia pública, 2 com
autorização própria no handler, 5 de updates/downloads). Nenhuma rota de admin,
moderação ou escrita está aberta. O risco é o de amanhã, não o de hoje.

Duas exceções que merecem revisão:
- ⚪ `GET /api/dms/:id/icon` (`dms.service.ts:404`) serve o ícone de um grupo de
  DM **sem checar participação**. A defesa é só a imprevisibilidade do cuid.
- ⚪ `GET /api/ready` ecoa a mensagem crua da exceção do driver em
  `checks.postgres.detail` — vaza host/porta quando o banco tosse.

**🟡 Média — 2FA sem teto por conta.** `POST /api/auth/mfa` tem 10/min **por
IP**, mas não incrementa `failedLogins` nem consulta o lockout. O ticket do
primeiro fator vale 5 minutos e **não é consumido no uso**. Com janela TOTP ±1
são 3 códigos válidos em 10⁶ por tentativa: quem já tem a senha e distribui
tentativas por muitos IPs chega a probabilidade relevante dentro dos 5 min.
Códigos de recuperação (~48 bits) estão fora de alcance.

**🟡 Média — enumeração de contas.** Duas vias:
- `POST /auth/register` devolve **409 "E-mail já cadastrado"** vs. **409 "Nome de
  usuário já em uso"** — oráculo direto. Contido pelo teto de 5/hora por IP. É o
  mesmo trade-off que o Discord faz; se for decisão consciente, registre-a,
  porque contradiz o cuidado das outras três rotas.
- `POST /auth/login` tem mensagem idêntica para tudo (✅ correto), mas o **tempo**
  denuncia: conta inexistente retorna antes do `argon2.verify`, então ~1-5 ms
  contra ~50-150 ms. A correção usual é verificar sempre contra um hash argon2
  fixo quando a conta não existe.

**🟡 Média — sem detecção de reuso de refresh token.** A rotação é atômica e
correta, mas se um token vazado é usado antes do legítimo, o dono só descobre
porque o *seu* próximo refresh dá 401. Falta o passo do padrão OAuth: reuso
detectado ⇒ mata a família inteira.

⚪ Baixas: sessão sem vida útil absoluta (cada refresh empurra +7d
indefinidamente); `MIN_PASSWORD_LENGTH = 6`, abaixo do mínimo de 8 do NIST; IP
da sessão vem do `X-Forwarded-For` cru em vez de `req.ip`, então o "IP" na tela
Dispositivos é texto escolhido pelo cliente; `JwtGuard` não exige claim `typ`,
o que hoje não é bypass mas é frágil; `algorithms: ["HS256"]` não é passado
explicitamente (o default da lib já fecha `alg: none`, mas melhor não depender
disso).

**✅ `PLATFORM_ADMIN_EMAILS` — correto.** Era o ponto crítico do escopo:

```ts
// apps/api/src/modules/admin/admins.ts:33-38
if (!conta.email || !conta.emailVerificado) return false;   // ← a trava
return lista.includes(conta.email.toLowerCase());
```

A cadeia fecha porque `PATCH /api/me/email` grava `emailVerifiedAt: null` — o
usuário pode editar o próprio e-mail, mas isso derruba a verificação, e
reverificar exige clicar num token de 256 bits entregue **naquela** caixa
postal. Não existe rota que promova alguém: a lista vive só na env.

⚪ Residual, já documentado no próprio código: excluir a conta do admin libera o
endereço; quem controlar aquela caixa postal depois pode registrar conta nova e
herdar o painel. É inerente ao modelo "admin por e-mail".

### B7 — Autorização por rota / IDOR · 🟠 Alta

O núcleo é **bom**: `GuildsService` concentra `assertCanViewChannel`,
`assertCanPostChannel`, `assertCanActOn` e `rank`, e `computePermissions` é
puro. **Não há IDOR de leitura clássico** — todo `:messageId` é resolvido para o
canal *da mensagem*, nunca para o `:channelId` do caminho.

**🟠 Alta — bloquear alguém não impede que ele continue mandando DM.**
`messages.service.ts:500-511`: `assertPodeEscrever` faz
`if (access.tipo !== "guild") return;` — sai cedo em DM e não checa bloqueio
nenhum. O helper `assertNotBlocked` existe, mas só é chamado na **criação** da
conversa. E `block()` apaga a `Friendship` sem apagar o `ChannelMember`.

Ataque, que é o cenário de assédio na íntegra:
1. A e B já conversaram — o canal existe e ambos são membros.
2. B bloqueia A.
3. A guarda o `channelId` e emite `message.create` pelo socket.
4. Grava e **entrega ao vivo**, porque B segue na sala desde o connect.
5. Pior: `dms.service.ts:234` reexibe conversa escondida quando
   `lastMessageAt > hiddenAt` — cada mensagem **traz a conversa de volta para a
   barra lateral de quem bloqueou**.

O bloqueio é decorativo. **PR aberto.**

**🟡 Média-Alta — override gravável em canal que o ator não enxerga.**
`PUT /api/guilds/:id/channels/:channelId/overrides`
(`roles.service.ts:224-262`): a **escrita** não chama `assertCanViewChannel`,
enquanto a **leitura** dos mesmos overrides chama (`:203`). Um membro com
`MANAGE_ROLES` barrado de um canal privado grava
`{"userId":"<ele mesmo>","allow":1,"deny":0}`; a máscara "não concede o que não
tem" passa porque `VIEW_CHANNEL` está em `DEFAULT_PERMISSIONS`, e
`aposMudarOverrides` já o coloca nas salas. Lê o canal do qual foi excluído.

**🟡 Média — `DELETE` de override sem hierarquia nem máscara.**
`roles.service.ts:264-276` não chama `assertPodeMexerNoCargo` nem valida
permissões. Apagar o override do `@everyone` de um canal privado faz
`syncChannelFlags` derivar `private = false` — **o canal abre para o servidor
inteiro numa única chamada**. Também apaga regra de cargo acima do ator.

Os dois: **PR aberto.**

**🟡 Média — castigo usa hierarquia legada.**
`moderation.service.ts:408-421` compara `rank(actor.role) <= rank(target.role)`
sobre o enum `OWNER 3 / ADMIN 2 / MEMBER 1`, enquanto kick/ban usam **posição de
cargo**. A docstring diz "a mesma regra do kick/ban" — é falso. Um `ADMIN`
legado castiga alguém cujo cargo está posicionado acima do dele.

**🟡 Média — purga de mensagens antes da checagem de `BAN_MEMBERS`.**
`moderation.service.ts:144-149`: com `deleteMessageHours > 0`, um ator sem
`BAN_MEMBERS` recebe 403 — **depois** de até 7 dias de mensagens do alvo já
terem sido apagadas.

**⚪ Baixa — 3 bits de permissão nunca são verificados**, apesar de aparecerem na
interface de cargos. Recontado contra `origin/main` (a primeira contagem, feita
na árvore atrasada, dizia 8 — cinco deles passaram a ser aplicados nos 157
commits):

| Bit | Onde é aplicado hoje |
|---|---|
| `ATTACH_FILES` | `messages/messages.service.ts` |
| `ADD_REACTIONS` | `messages/messages.service.ts` |
| `CONNECT` | `voice/voice.service.ts` |
| `SPEAK` | `voice/voice.service.ts`, `soundboard/soundboard.service.ts` |
| **`CREATE_INVITE`** | **nenhum** |
| **`MENTION_EVERYONE`** | **nenhum** |
| **`VIEW_AUDIT_LOG`** | **nenhum** |
| **`MUTE_MEMBERS`** | **nenhum** (fora de teste) |

O risco não é o abuso, é a **falsa sensação de restrição**: um admin desmarca
"Criar convite" e acredita ter fechado a porta do servidor. Decida por bit: ou
aplica, ou tira da interface de cargos.

⚪ Baixas: pin/thread decidem por enum legado e ignoram `MANAGE_MESSAGES`;
editar mensagem e votar em enquete ignoram castigo e somente-leitura; log de
auditoria fica atrás de `MANAGE_GUILD` (quem ganha para editar o ícone lê o log
inteiro); `PlatformAdminService.invalidar()` não tem chamador, então há até 1
min de admin válido após revogação; criar canal comum não exige
`MANAGE_CHANNELS` nem tem teto de quantidade.

**✅ Verificado e correto:** escalada por cargo está **fechada** (`assign` valida
posição, `reorder` valida origem e destino, `validarPermissoes` impede conceder
bit que não se tem, `assertPodeMexerNoCargo` exige estritamente abaixo — não dá
para se dar Administrador). Editar/apagar mensagem alheia: fechado. Ler DM
alheia: fechado. Busca: parte de `visibleChannelsForUser`, o filtro só reduz.
Anexos no R2: presigned de 1 h, proxy exige token escopado ou Bearer +
`assertCanViewChannel`, sem path traversal, MIME por magic bytes.
`R2_PUBLIC_BASE_URL` está **vazio** — o bucket não é público. Kick/ban:
`assertCanActOn` compara posições e o dono é intocável. Convites: `maxUses`
atômico com rollback em transação. Cross-guild: emoji/sticker/override todos
conferem `guildId`. Token do LiveKit: grant mínimo, sala exata, TTL 1 h, sem
`roomAdmin`. Updates/downloads: traversal barrado por `basename` + allowlist de
extensão + containment, com testes; download exige senha comparada em tempo
constante. Painel de admin: `PlatformAdminGuard` em **todas** as rotas.

**Soundboard não existe** neste código — zero ocorrências de "sound" na API e no
schema. Nada a auditar ali.

### B8 — Gateway socket.io · 🟡 Média

**✅ Handshake correto.** Token em `auth.token` ou `query.token`, inválido →
`disconnect(true)`, e revalida o estado da conta. CORS do WS reusa a mesma
allowlist. ⚪ `?token=` na query coloca o JWT no access log do Traefik e no
histórico do navegador — prefira sempre `auth.token`.

**✅ Não dá para entrar em sala sem ser membro.** `CHANNEL_JOIN` chama
`assertCanViewChannel` antes do `socket.join`. Não existe evento de cliente que
entre em `guild:<id>`. E a ressincronização em mudança de permissão é um ponto
forte que vale registrar: `emitChannelChange`, `aposMudarOverrides`,
`resyncMembrosDoCargo` e o ban/kick todos chamam
`leaveChannelRooms`/`resyncChannelRooms` — **perder acesso corta o fluxo ao
vivo**, não espera o F5.

**✅ Os 18 eventos emissíveis pelo cliente têm schema zod e autorização no
service.** Nenhum tem caminho próprio.

**✅ Sem PII no shape serializado.** `toPublicUser` é allowlist explícita: `id`,
`username`, `displayName`, `avatarUrl`, `status`, `customStatusText`,
`customStatusEmoji`. Nada de `email`, `passwordHash`, `totpSecret` ou IP.
Confirmei que o `MESSAGE_INCLUDE` traz a linha `User` inteira para a memória,
**mas** o mapper aplica `toPublicUser` antes de serializar, e um grep por spread
de linha Prisma (`...user`, `...m.author`) na API inteira não retornou nada.

**🟡 Média — voz de canal privado vaza para a guild inteira.**
`voice.service.ts:320-343` faz `emitToGuild` para todo `voice.state` com
`guildId`. Todo membro recebe o evento de **qualquer** canal de voz, inclusive
um com `VIEW_CHANNEL` negado — com `channelId`, o `PublicUser` completo e as
flags `muted`/`deafened`/`video`/`screen`. Um membro comum descobre o id da sala
da moderação, quem está nela e quem compartilha tela. Mesma coisa na carga
inicial (`statesForGuild` só faz `assertMember`). A correção existe pronta no
próprio código: `viewersOfChannel()` + `emitToUsers`, ou simplesmente
`emitToChannel`.

**🟡 Média — presença e perfil em broadcast global.** `chat.gateway.ts:235`
(`this.server.emit`) e `users.service.ts` (`realtime.emitAll`) mandam
`PRESENCE_UPDATE` e `USER_UPDATED` para **todos os sockets da plataforma**, sem
recorte por guild ou amizade. Qualquer conta autenticada monta passivamente o
diretório completo de usuários e um log de quem entra e sai — inclusive de
pessoas com quem não compartilha nada, e inclusive de quem a bloqueou. Não é
vazamento de credencial; é vazamento de presença e metadados em escala.
(Status "invisível" ✅ é tratado antes do broadcast.)

**🟡 Média — 12 de 18 eventos sem rate limit.** `WS_LIMITS` cobre 6. Ficam sem
teto justamente os que interessam a um abusador: `reaction.add` (escrita +
broadcast para a sala inteira a cada chamada — amplificação),
`message.edit`/`message.delete` e `channel.join`. O `ThrottlerGuard` global é de
HTTP e **não alcança o gateway**. Somando: não há limite de conexões por conta,
e cada `handleConnection` roda `visibleChannelsForUser`, que faz um
`filterVisible` por guild em laço sequencial. Uma conta abrindo sockets em laço
é negação de serviço barata.

**🟡 Média — socket sobrevive à revogação.** Mesmo buraco do B6, visto do outro
lado: `SESSIONS_REVOKED` só *pede* ao cliente que saia. Um cliente que ignore o
evento mantém socket autenticado indefinidamente. Correção:
`server.in('user:<id>').disconnectSockets(true)`.

### B9 — Validação de entrada · 🔴 Crítica

**🔴 CRÍTICA — SSRF no unfurl de links.** `GET /api/embeds?url=`
(`embeds.service.ts`), atrás de `JwtGuard`, teto de 60/min — ou seja, alcançável
por **qualquer conta**.

O serviço faz várias coisas certas: só `http:`/`https:`, resolve o DNS e recusa
IP privado, teto de 512 KB, timeout de 5 s. E ainda assim é contornável por dois
caminhos:

1. **Redirect não revalidado** (`embeds.service.ts:96`). O fetch usa
   `redirect: "follow"`, e o `assertPublicHost` roda **uma vez**, sobre o host
   digitado. O atacante aponta para `https://evil.tld/x`, que responde
   `302 Location: http://169.254.169.254/latest/meta-data/`, e o undici segue
   sem checagem nenhuma. Impacto em duas camadas:
   - **SSRF cega sempre** — a requisição interna sai. Serve para varrer portas e
     rede por diferença de tempo.
   - **SSRF com leitura quando o alvo devolve HTML** — o filtro
     `type.includes("html")` barra o metadata da AWS (que é `text/plain`), mas
     **não** barra painel interno, Grafana, Kibana, Jenkins, wiki ou API interna
     que sirva HTML. Nesses casos o `<title>`, o `og:description` e o `og:image`
     **voltam para o atacante no JSON da resposta**.
2. **DNS rebinding** (`:39` vs `:94`). O `assertPublicHost` faz `lookup()` e o
   `fetch` resolve o nome **de novo**. Domínio com TTL 0 devolve IP público na
   primeira consulta e `169.254.169.254` na segunda. TOCTOU clássico.

O que **não** funciona, e vale registrar porque foi testado: `http://2130706433/`
e `http://0177.0.0.1/` são normalizados pelo WHATWG URL para `127.0.0.1` antes
da checagem → bloqueados. `http://[::1]/` e o IPv4-mapped viram hostname com
colchetes, `isIP` devolve 0, o `lookup` falha e a exceção é capturada → **falha
fechado**. `file://` é barrado. **Só o redirect e o rebinding furam.**

⚪ Junto: a lista de faixas privadas não cobre `100.64.0.0/10` (CGNAT),
`192.0.0.0/24`, `198.18.0.0/15` nem multicast, e não há trava de porta.

**PR aberto.**

**✅ Upload — o ponto mais bem feito do módulo.** `sniffImage` reconhece só
PNG/JPEG/GIF/WebP **pelos bytes**; o resto vira `application/octet-stream`. O
`Content-Type` e a extensão que o cliente manda **nunca** são usados como prova.
`assinaturaGif` exige `GIF87a`/`GIF89a` completo.

**✅ SVG/HTML armazenado não vira XSS.** Não passa no sniff → gravado como
`application/octet-stream` → servido com `Content-Disposition: attachment`
(`inline` só quando o tipo real começa com `image/`) + `X-Content-Type-Options:
nosniff` em todas as rotas de mídia. O `filename` passa por `sanitizeFilename`
(`[A-Za-z0-9._-]`), então também não há quebra de header.

**Sobre o `image/*` para chave sem extensão** — avaliei como pedido, e o risco é
⚪ **Baixo**, não Médio. `image/*` não é MIME válido, mas os bytes por trás
**sempre** passaram por `validarImagemDePerfil`, que só aceita
PNG/JPEG/GIF/WebP reais, e a resposta vai com `nosniff`, que impede o navegador
de reinterpretar como `text/html`. Nem polyglot GIF/HTML renderiza. Continua
valendo corrigir por higiene — um dia alguém tira o `nosniff`.

**✅ Path traversal — não encontrado.** Toda chave do R2 é construída no
servidor (`attachments/${randomUUID()}/...`), `sanitizeFilename` faz
`split(/[/\\]/).pop()`, e no download a chave vem do banco, nunca da URL. Os
dois pontos que tocam o filesystem local estão travados com defesa em
profundidade explícita: `basename` → allowlist de extensão → prefixo
`resolve(dir)+sep`.

**✅ Redirect aberto — não existe.** Nenhum `returnTo`/`next`/`callbackUrl` em
auth ou convites. E os links de e-mail são montados de `WEB_PUBLIC_URL`, nunca
de `req.headers.host` — **não há host header poisoning**.

**✅ Limites de tamanho:** mensagem 2000 chars, guild/canal 2-64, anexo 25 MB
imposto **duas vezes** (multer + service), emoji 256 KB/128 px, sticker 512
KB/320 px, avatar com teto próprio e 8 MB para GIF.

⚪ `ValidationPipe` sem `forbidNonWhitelisted` — com `whitelist: true` as
propriedades desconhecidas já são removidas, então não há mass-assignment; a
diferença é 400 contra remoção silenciosa.

### B10 — Injeção · 🟠 Alta

**🟠 Alta — ReDoS na extração de meta tags.** `embeds.service.ts:124-128` — o
mesmo módulo do SSRF, por outro caminho. O padrão
`<meta[^>]+...[^>]*content=...` tem dois quantificadores sobre `[^>]` com
literais obrigatórios que nunca casam numa entrada preparada: cada `<meta` é um
ponto de partida e o motor testa todas as posições → **O(n²)**. Não é injeção de
regex (o `prop` é sempre literal), é a forma do padrão.

Medição do auditor com string sintética: 10 KB → 0,12 s · 20 KB → 0,48 s ·
40 KB → **1,97 s**. O teto de leitura é **512 KB** (≈164× o caso de 40 KB) e
`meta()` é chamado **8 vezes** por página. O `TIMEOUT_MS` não protege — o
`clearTimeout` roda antes do `parse()`. O cache não protege — basta variar a
query string. **Node é single-threaded: isso trava a API inteira**, não a
requisição.

Gatilho: uma página que responda `text/html` com `"<meta".repeat(N)` sem `>`.
**PR aberto** (mesmo do SSRF — é o mesmo arquivo e o mesmo tema).

**✅ SQL raw — limpo.** Duas ocorrências em toda a API, ambas tagged template
parametrizado. **Zero** `$queryRawUnsafe`, `$executeRawUnsafe` e `Prisma.raw`.
Nenhum `orderBy` vem do cliente. Os três filtros que o cliente escolhe têm
allowlist. Sem `eval`, `new Function`, `exec` ou `spawn`.

**✅ Demais regex — lineares.** O único `RegExp` construído de dado dinâmico é o
de menção `@username`, e ele **escapa** o valor antes; além disso o username já
é `^[a-zA-Z0-9_.-]{3,32}$` e o alvo é limitado a 2000 chars.

**🟡 Média — busca sem teto de termo.** Nenhuma coluna de texto tem índice
trigram/GIN, então todo `contains` + `mode:"insensitive"` vira `ILIKE '%…%'` com
seq scan, e nenhuma rota de busca tem `@Throttle` próprio.
`messages.controller.ts:21,56`: `q` **sem mínimo** (`q=a` varre tudo) e **sem
máximo**. O `take` limita o retorno, não o custo do scan. Idem
`discovery.service.ts:40`. ⚪ `read-state.service.ts:62-72` faz `findMany` de
candidatas a menção **sem `take`**: quem spammar `@vitima` faz cada
`GET /me/unread` dela carregar tudo.

### B11 — Cabeçalhos e transporte · 🟡 Média

**🟡 Média — a web servia sem nenhum cabeçalho de segurança:**

```
$ curl -sI https://streamz.chat/
HTTP/2 200
cache-control: s-maxage=31536000, stale-while-revalidate
content-type: text/html; charset=utf-8
x-nextjs-cache: HIT
x-powered-by: Next.js
```

Sem CSP, sem HSTS, sem `X-Frame-Options`, sem `nosniff`, sem `Referrer-Policy`,
sem `Permissions-Policy`. E não é configuração errada do servidor: **ninguém os
punha** — o `next.config.mjs` não tinha `headers()`, o Traefik não tem
middleware `headers` e o `Caddyfile.example` só faz `reverse_proxy`. O concreto
é clickjacking (a app era enquadrável em iframe de qualquer site) e o `Referer`
completo vazando para todo link externo clicado numa mensagem — num chat, o
caminho carrega id de servidor e de canal.

**Corrigido no PR #164.** A API continua sem `helmet` — ver recomendação R6.

**✅ CORS — correto, testado ao vivo:**

| Origem enviada | `Access-Control-Allow-Origin` |
|---|---|
| `https://evil.example.com` | — (recusada) |
| `https://streamz.chat.evil.com` | — (recusada) |
| `null` | — (recusada) |
| `http://localhost:3000` | — (recusada) |
| `https://streamz.chat` | `https://streamz.chat` + `credentials: true` |

Allowlist real, sem reflexo de origem, sem `origin: "*"` com credenciais.

**✅ TLS:** os três domínios só atendem em HTTPS/WSS; o Traefik faz o
redirecionamento e tem a lista de IPs da Cloudflare em
`forwardedheaders.trustedips`. O painel do Traefik está atrás de basic auth.

⚪ `x-powered-by: Express` e `x-powered-by: Next.js` — divulgação de versão de
stack. Trivial, mas é uma linha de configuração.

**Cookies:** não se aplica — a autenticação não usa cookie (ver C13).

### B12 — Rate limiting · ✅ ok no HTTP

Verificado **ao vivo** contra produção, com e-mail inexistente:

```
$ for i in $(seq 1 15); do curl -X POST .../api/auth/login ... ; done
01:400 02:400 ... 10:400 11:429 12:429 13:429 14:429 15:429
```

Corta na 11ª. Tetos por rota:

| Rota | Teto |
|---|---|
| global | 300 / 60 s |
| `POST /auth/login` e `/auth/refresh` | 10 / 60 s |
| `POST /auth/register` | 5 / 3600 s |
| `POST /auth/mfa` e `/auth/reset-password` | 10 / 60 s |
| `forgot-password` e `resend-verification` | 5 / 3600 s |
| download do instalador | 8 / 60 s |

Somado ao **lockout por conta** (5 falhas / 15 min), cobre também o ataque
distribuído. `TRUST_PROXY=1` está configurado, então o teto por IP funciona
atrás do Traefik em vez de punir todo mundo junto.

🟡 Lacuna: os eventos do WebSocket (ver B8). ⚪ E os tetos são **por processo**:
`REDIS_URL` está vazio, então `ThrottlerStorageRedisService` não é usado. Com
uma instância isso funciona; subir uma segunda réplica de API **dobra
silenciosamente todos os tetos**.

⚪ `updates.controller.ts` tem `@SkipThrottle()` na classe inteira e sem
autenticação — por desenho, já que o atualizador não sabe autenticar. Significa
drenagem de banda anônima ilimitada.

---

## C. Cliente

### C13 — Web e desktop · 🟡 Média

**✅ XSS — nada encontrado.** Grep por
`dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write|eval(|new Function`
em `apps/web`: **zero ocorrências**. O markdown é parser próprio
(`lib/markdown-core.ts` produz AST tipada, `lib/markdown.tsx` renderiza como
elementos React) — **nenhum caminho gera HTML**, então não precisa de
sanitizador. Nome de usuário, cargo e servidor entram como filhos JSX,
escapados pelo React.

**✅ Esquemas `javascript:`/`data:` bloqueados na origem**, em três lugares
independentes: o autolink do markdown, o `extractFirstUrl` do shared e o
`partesDaUrl` da mídia — todos ancorados em `^https?://`. O `youtubeVideoId`
valida host contra allowlist e o id contra `^[A-Za-z0-9_-]{11}$` antes de montar
o iframe. As 4 ocorrências de `target="_blank"` têm `rel="noreferrer"`, que já
implica `noopener` em todo navegador atual.

**🟡 Média — o desktop aceita URL e token de LiveKit arbitrários vindos do JS.**
`apps/desktop/src-tauri/src/tela/transmissao.rs:48-49,138`: o comando
`iniciar_tela` valida o `fonte_id` (recusa id inexistente) mas passa `url` e
`token` **crus** para `Room::connect`. Comandos customizados do Tauri v2 **não**
passam pela ACL das capabilities. Um XSS no código empacotado manda
`url: "wss://servidor-do-atacante"` e o processo nativo publica **tela +
áudio do sistema** (WASAPI loopback) num servidor arbitrário, em alta resolução,
fora do controle do LiveKit legítimo. Correção barata: validar o host contra
allowlist compilada.

**🟡 Média — o desktop desliga o pedido de permissão de microfone e câmera.**
`apps/desktop/src-tauri/src/main.rs:54` injeta
`--auto-accept-camera-and-microphone-capture` no WebView2. O comentário
justifica pela experiência ("o Discord não pergunta"), mas o efeito é que
**qualquer `getUserMedia()` no webview liga mic e câmera sem prompt e sem
indicação**. Não é explorável sozinho, mas remove a última barreira: com XSS, o
atacante grava áudio e vídeo em silêncio.

**🟡 Média — refresh token de 7 dias em `localStorage`.**
`apps/web/lib/session.ts:14-15,26-46`.

Uma correção à premissa do escopo: **não existe cofre multiconta.** Procurei
`cofre|multiconta|switchAccount|trocarConta` no monorepo inteiro; o único
resultado é um comentário em `ProfilePopover.tsx:696` — *"não há multiconta:
trocar de conta é sair e entrar de novo"*. Então o cenário "todas as contas de
uma vez" **não se aplica**: é uma conta por navegador.

Avaliando o impacto real: o *access* token em `localStorage` acrescenta pouco
(XSS já faz requisições autenticadas em nome do usuário). O que o **refresh**
acrescenta é **persistência** — ele é rotacionado a cada uso, mas é exfiltrável
num único disparo e vale sessão nova indefinidamente fora do navegador da
vítima, mesmo depois de o XSS ser corrigido e a aba fechada. É a diferença entre
"sequestro enquanto a aba está aberta" e "takeover permanente". Cookie
`HttpOnly; Secure; SameSite` resolveria, ao custo de repensar o desktop, que é
export estático e depende do token em JS.

**✅ O cenário "XSS no site vira acesso ao Tauri" NÃO se aplica.** A janela
principal não tem chave `url` — carrega `frontendDist: "../../web/out"`, ou
seja, os arquivos estáticos empacotados no instalador, não `https://streamz.chat`.
Não há `dangerousRemoteDomainIpcAccess` nem
`dangerousDisableAssetCspModification` em lugar nenhum, e `withGlobalTauri` é
`false`. **Um XSS no site em produção não alcança o IPC do desktop.** O que
alcança é XSS no código empacotado — e é por isso que os dois achados acima
importam.

**✅ Capabilities do Tauri — mínimas, e este é o ponto forte da configuração.**
Janela `main`: `core:default`, dez permissões de janela,
`core:webview:allow-create-webview-window`, `notification:default`,
`updater:allow-check`, `process:allow-restart`. Janela `splash`: subconjunto.
**Nenhum `shell:allow-execute`, `shell:allow-open`, `fs:allow-*`, `http:default`
ou `opener`** — os plugins sequer estão no `Cargo.toml`. Não há como abrir
`file://` nem executável.

⚪ `core:webview:allow-create-webview-window` é genérica: JS no webview pode
criar janela com URL remota. A janela nova teria rótulo fora de
`["main"]`/`["splash"]`, então **não herda IPC nenhum** — o risco fica em
phishing (janela sem decoração, com o nome Streamz).

**✅ Updater — correto.** Endpoint **HTTPS**
(`https://api.streamz.chat/api/updates/{{target}}/{{arch}}/{{current_version}}`)
e `pubkey` minisign presente, ou seja **verificação de assinatura ligada**. Isso
é o que torna segura a instalação silenciosa elevada do NSIS `perMachine`; se a
`pubkey` fosse removida, viraria execução remota de código imediata.

⚪ CSP do Tauri tem `'unsafe-inline'` em `script-src` (exigência prática do
export estático), o que tira o valor anti-XSS dela. **Não há `'unsafe-eval'`**.
O `connect-src` está bem fechado, mas `img-src https:` e `media-src https:` são
curinga — servem de canal de exfiltração por URL de imagem. E
`http://localhost:3333` / `ws://localhost:7880` são entradas de
desenvolvimento que ficaram no config de release.

**✅ Comandos Rust — cinco, todos em `src/tela/mod.rs`.** Nenhum recebe caminho
de arquivo nem executa comando; o único parâmetro sensível é o par URL/token
acima.

---

## D. Dependências e infraestrutura

### D14 — Dependências e imagens · 🟠 Alta

```
$ docker run --rm -v /opt/stack/streamz:/w -w /w node:22 \
    sh -c "corepack enable && pnpm audit --json"
57 avisos: 20 altos, 30 moderados, 7 baixos
```

Concentração clara — **Next 14.2.35 responde por 15 dos avisos**, entre eles
três de **SSRF** e vários de negação de serviço:

| Pacote | Versão | Altos | Destaques |
|---|---|---|---|
| `next` | 14.2.35 | 6 | SSRF em rewrites, SSRF em Server Actions, SSRF em WebSocket upgrades, bypass de middleware, DoS em Server Components |
| `multer` | 2.0.2 | 4 | DoS por limpeza incompleta, recursão descontrolada, campos aninhados |
| `nodemailer` | 6.10.1 | 2 | leitura de arquivo arbitrária via `raw`, DoS no addressparser |
| `postcss` | 8.4.31 | 2 | leitura de arquivo arbitrária via `sourceMappingURL` |
| `lodash` | 4.17.21 | 1 | injeção de código via `_.template` |
| `glob`, `picomatch`, `tmp` | — | 3 | ferramenta de build, não runtime |

Nem todos são alcançáveis nesta app (as SSRF do Next em rewrites e Server
Actions dependem de recursos que o projeto não usa — a web é toda client
component, sem rota de API e sem middleware). Mas `multer` e `nodemailer` estão
no caminho quente: upload de anexo e envio de e-mail.

**✅ `cargo audit` do desktop — nenhuma vulnerabilidade.**

```
$ docker run --rm -v .../src-tauri:/w:ro -w /w rust:latest \
    sh -c 'cargo install cargo-audit --locked && cargo audit'
warning: 8 allowed warnings found        (saída com código 0)
```

As 8 são de manutenção, não falhas: sete crates marcados **unmaintained**
(`proc-macro-error`, os cinco `unic-*`, e mais um) e `glib 0.18.5` com um
`unsound` em `VariantStrIter` (RUSTSEC-2024-0429). Todos entram por dependência
transitiva do Tauri/GTK, nenhum é exercido por código nosso. Nada a fazer agora;
some sozinho quando o Tauri atualizar.

**🟡 `livekit/livekit-server:latest`.** Tag móvel num serviço exposto na
internet (7881/TCP e 7882/UDP): um `docker compose pull` de rotina pode trocar o
servidor de voz por outra versão sem que ninguém decida isso. Os outros dois
estão fixados corretamente (`postgres:16-alpine`, `traefik:v3.7`).

**✅ Postgres:** senha de 48 caracteres, publicado só em `127.0.0.1:5432`.
**✅ Redis:** não está rodando (`REDIS_URL` vazio) — não há Redis sem senha
exposto. **✅ LiveKit:** **não** está em modo `--dev` (`Cmd: ["--config",
"/etc/livekit.yaml"]`), o segredo da API tem 64 caracteres, `turn: enabled:
false`, `logging: level: info`. O `livekit.yaml` está `600` e no `.gitignore`.

### D15 — Backups · 🟡 Média

Existem, e são automáticos:

```
$ systemctl list-timers | grep streamz
Wed 2026-09-09 03:21:31  streamz-backup.timer → streamz-backup.service
                                                (/usr/local/bin/streamz-backup.sh)
$ ls -la /opt/backup/postgres/
10 arquivos  streamz-AAAAMMDD-HHMMSS.sql.gz  -rw------- root root  (332 KB total)
```

Diários, retenção de ~10 dias, permissão `600` num diretório `700`.

O que falta:

- 🟡 **Sem cifra.** É `gzip`, não `gpg`/`age`. Qualquer cópia do disco — snapshot
  do VPS, backup do provedor, disco descartado — entrega o banco inteiro:
  e-mails, hashes de senha, o conteúdo de todas as mensagens privadas.
- 🟡 **Só locais.** Estão no mesmo servidor que o banco. Perdeu o VPS, perdeu os
  dois. Não há cópia fora do host.

Como os dumps contêm PII de todos os usuários, os dois pontos merecem correção
junta — ver R8.

---

## E. Soundboard e o delta de 157 commits

Esta seção existe por causa da nota de método lá em cima: o módulo `soundboard`
e tudo que mudou entre `b315dcc` e `origin/main` foram auditados **contra a
árvore atualizada**, depois que a defasagem foi descoberta.

### E16 — Módulo `soundboard` · ✅ sólido no essencial (⚪ três ressalvas)

Era item explícito do escopo e tinha escapado por completo. O veredito é bom:

| Vetor | Veredito |
|---|---|
| IDOR entre servidores — listar | ✅ `assertMember` |
| IDOR — upload | ✅ `assertCanModerate(MANAGE_EMOJIS)` |
| IDOR — apagar | ✅ permissão **e** `row.guildId !== guildId → 404` |
| IDOR — tocar som de outra guild | ✅ `resolverSom` recusa; DM sem guild recusada |
| Tocar exige estar na call e poder falar | ✅ `assertCanViewChannel` + `SPEAK` + estar na sala |
| Destino do evento | ✅ `emitToUsers(naSala, …)`, não a guild inteira |
| Limite de tamanho | ✅ 512 KB **duas vezes** (multer + service) |
| Tipo por magic bytes | ✅ `sniffAudio`; nunca o `Content-Type` do cliente |
| Path traversal na chave do R2 | ✅ `soundboard/${guildId}/${randomUUID()}.${ext}` |
| Teto por servidor | ✅ 24 sons |
| Rate limit do disparo | ✅ 1/s **por usuário** (Redis `SET NX PX` ou mapa em memória) |
| Vazamento de PII no evento | ✅ `toPublicUser` |
| Guards | ✅ `JwtGuard` nas 5 rotas autenticadas |

**🟡 Média — a duração do áudio só é validada no cliente.** `audio.ts` confere
tamanho e magic bytes; o teto de 5,5 s (`MAX_SOUNDBOARD_DURACAO_MS`) é medido no
navegador com um `<audio>`, e a limitação está assumida no comentário do código.
Só que o cliente **também não corta a reprodução**. Quem tem `MANAGE_EMOJIS`
sobe por `curl` um MP3 de 512 KB a ~8 kbps (8-9 minutos), entra na chamada e
dispara: todo mundo na sala toca o arquivo inteiro, sem corte e sem botão de
parar — só o deslizador de volume ou ficar surdo. O teto de 1 som/segundo não
ajuda, porque o áudio é longo, não repetido. **A correção barata não é decodificar
no servidor: é cortar a reprodução no cliente** (`tocarEfeitoSonoro` para o
`<audio>` em `MAX_SOUNDBOARD_DURACAO_MS`).

⚪ Baixas: a rota pública do áudio tem `@SkipThrottle()` — o id é `cuid`, então
não é enumerável, mas quem tiver a URL puxa 512 KB do R2 em laço sem teto
(custo de egresso). O sniff de MP3 aceita qualquer arquivo prefixado com `ID3`,
então o bucket vira hospedagem de 24 × 512 KB de conteúdo arbitrário por
servidor (servir é seguro: `nosniff` + `audio/*`). O `soundboardEmojiSchema`
valida só tamanho (`max(16)`), não conteúdo. E o teto de 24 tem TOCTOU
(`count()` antes do upload, sem unicidade no banco).

### E17 — Override de **categoria** · 🟠 Alta (dois achados)

Os canais sincronizados **herdam** os overrides da categoria, e as rotas de
categoria são novas (vieram nos 157 commits). Elas repetem — e pioram — a
assimetria que o PR #166 fechou no canal:

**🟠 Alta — `setOverride` de categoria não checa hierarquia de cargo.**
`categories.service.ts:182-203`. O gêmeo de canal chama
`assertPodeMexerNoCargo` (compara `role.position` com o `rank` do ator); a
versão de categoria **não**, apesar de o comentário em `:172-174` afirmar "as
mesmas duas travas do override de canal". Bob, com `MANAGE_ROLES` num cargo
baixo, nega `VIEW_CHANNEL` ao cargo "Staff" na categoria — e
`aposMudarOverrides` copia a regra para **todos os canais sincronizados**. O
mesmo pedido no canal seria recusado.

**🟠 Alta — `removeOverride` de categoria não tem trava nenhuma.**
`categories.service.ts:223-235`: só `MANAGE_ROLES` + categoria da guild. Sem
hierarquia, sem a máscara "não concede o que não tem", sem visibilidade.
**Apagar um override que nega é conceder**: um `DELETE` do override do
`@everyone` abre a categoria privada e todos os canais sincronizados dela para o
servidor inteiro. Agravante: `aposMudarOverrides` faz
`channelOverride.deleteMany({channelId})` e recria a partir da categoria — ou
seja, a remoção **apaga também as regras próprias** desses canais.

Ressalva justa nos dois: quem tem `ADMINISTRATOR` ou é dono é imune, porque
`computePermissions` retorna antes de aplicar overrides. O alvo real são cargos
altos sem `ADMINISTRATOR`.

**Corrigido no PR #166**, que foi estendido para cobrir a categoria.

### E18 — `voice/move` sem hierarquia · 🟡 Média

`voice.service.ts:281-282` chama só
`assertCanModerate(actorId, guildId, Permission.MOVE_MEMBERS)`. A norma do
próprio projeto para ação **contra um membro** é `assertCanActOn` (permissão
**mais** `rank`), usada em `kick`, `ban` e castigo. Aqui falta o `rank`:
qualquer um com `MOVE_MEMBERS` arrasta **o dono do servidor** de canal em canal,
em laço (não há teto próprio; só os 300/min por IP).

As outras três travas do `move` estão certas e documentadas: destino é canal de
voz da mesma guild, o alvo está em voz naquela guild, e o alvo passa por
`assertCanViewChannel` + `CONNECT` — então não dá para empurrar ninguém para
dentro de canal privado. Falta só a hierarquia. Ver recomendação R10.

### E19 — O resto do delta · ✅ ok

| Item | Veredito |
|---|---|
| Token do LiveKit | ✅ **melhorou** — `canPublish`/`canPublishSources` agora derivam de `SPEAK`/`STREAM`; sala exata, TTL 1 h, sem `roomAdmin`/`roomCreate`/`roomList`/`hidden`/`recorder` |
| Entrar/publicar em voz | ✅ endurecido — `CONNECT` para entrar; `flagsPermitidas` corrige mudo/câmera/tela no `join` e no `update` |
| Rotas novas (6) | ✅ **todas** sob `JwtGuard` (guard de classe). A única sem guard é o áudio do soundboard, deliberada |
| Eventos WS novos (6) | ✅ **todos servidor→cliente**; nenhum `@SubscribeMessage` novo, então `WS_LIMITS` não precisou mudar |
| Herança categoria→canal | ✅ cálculo correto; `dessincronizarDaCategoria` copia antes de dessincronizar e é chamada em todos os caminhos de escrita |
| Servidor legado ao ganhar categorias | ✅ o risco maior, e está certo: `syncedWithCategory` nasce `false` e a rotina de arrumação não a liga — **nenhum canal privado antigo vira público** |
| `permissoes-legado.ts` | ✅ escopo `where: { guildId }` (nunca toca DM), idempotente, preserva os demais bits |
| `messages.service.ts` | ✅ **melhorou** — passou a exigir `ATTACH_FILES` e `ADD_REACTIONS` |
| `read-state`, `inbox`, `users`, `onboarding`, `dms`, `friends`, `invites`, `discovery` | ✅ `assertCanViewChannel` mantido; eventos só para `user:<id>` do próprio dono; sempre `toPublicUser` |

### E20 — Reconfirmações na árvore atualizada · ✅ tudo mantido

As conclusões das seções A-D que dependiam de código foram refeitas contra
`origin/main`:

| Afirmação | Reconfirmada? |
|---|---|
| `toPublicUser` é allowlist (sem `email`/`passwordHash`) | ✅ 7 campos; `common/dto.ts` só ganhou DTOs novos |
| `PLATFORM_ADMIN_EMAILS` exige e-mail **verificado** | ✅ o módulo `admin/` **não foi tocado** nos 157 commits |
| `ValidationPipe` global `{ whitelist, transform }` | ✅ `main.ts` não aparece no diff |
| `CORS_OPTIONS` com allowlist, sem `*` | ✅ `common/cors.ts` não aparece no diff |
| Sem `$queryRawUnsafe`/`$executeRawUnsafe` | ✅ zero ocorrências — inclusive zero `$queryRaw` de qualquer forma |
| `WS_LIMITS` cobre só 6 eventos | ✅ inalterado — o achado B8 continua valendo |

---

## Correções feitas nesta auditoria

Nenhum PR foi mergeado. Todos partem de `origin/main` e foram verificados em
`docker node:22` (sem node no host).

| PR | Tema | Severidade | Verificação |
|---|---|---|---|
| [#163](https://github.com/MirandaSls/streamz/pull/163) | `.gitignore`: `docs/Reference/`, `docs/ref-ui/`, `updates/`, `.claude/` | A2 — Média | `git check-ignore` nos quatro; confirmado que `apps/api/src/modules/downloads/` **não** é ignorado |
| [#164](https://github.com/MirandaSls/streamz/pull/164) | Cabeçalhos de segurança da web | B11 — Média | 69 arquivos / 674 testes verdes, `tsc --noEmit` limpo, config verificada nos modos servidor e export |
| [#167](https://github.com/MirandaSls/streamz/pull/167) | `embeds`: SSRF (redirect + rebinding) e ReDoS | B9 🔴 **Crítica** / B10 🟠 Alta | `tsc` limpo, **398 testes em 37 arquivos** verdes, eslint limpo; 26 testes novos |
| [#165](https://github.com/MirandaSls/streamz/pull/165) | Bloqueio passa a valer na DM já existente | B7 — 🟠 Alta | `tsc` limpo, **382 testes em 37 arquivos** verdes; 10 testes novos |
| [#166](https://github.com/MirandaSls/streamz/pull/166) | Override de canal **e de categoria** | B7 Média-Alta / E17 🟠 **Alta** | `tsc` limpo, testes verdes; 2 commits, com prova de que os testes pegam a falha |

Detalhes que valem registro:

- **#167** trocou o `fetch` por `node:http`/`node:https` com um `lookup` próprio.
  É a correção certa e não a paliativa: o IP conferido é **exatamente** o IP em
  que o socket conecta, então não sobra janela entre conferir e conectar — o que
  fecha o rebinding e o redirect de uma vez, para toda conexão da cadeia. O
  `dispatcher` do undici seria o caminho canônico, mas undici não é dependência
  do projeto (só `undici-types`, via `@types/node`), e conectar direto no IP com
  o `Host` na mão quebraria o SNI do TLS.
  A medição do ReDoS foi refeita com a regex antiga e é pior do que a estimativa
  inicial: **24 KB = 1,0 s · 39 KB = 2,5 s · 98 KB = 16,2 s** — com teto de
  leitura de 512 KB. Depois da correção: **537 KB em 1,3 ms**.
- **#166** prova que os testes pegam a falha: revertendo só o service, os casos
  de escalada falham e os do caminho legítimo continuam passando. E confirma
  que **não há impasse** — `computePermissions` devolve todas as permissões ao
  dono e a quem tem `ADMINISTRATOR` **antes** dos overrides, então um canal cujo
  `@everyone` nega tudo continua consertável por eles.
  O segundo commit estendeu a correção à **categoria** (achado E17), depois que
  a auditoria da árvore atualizada mostrou que as rotas novas de categoria
  repetiam a mesma assimetria — e pior, porque propagam a todos os canais
  sincronizados. O `assertPodeMexerNoCargo` subiu para o `GuildsService`, para
  que canal e categoria passem pela mesma trava em vez de duas cópias que
  divergem com o tempo.
- **#165** decidiu, com razão, **não** aplicar a checagem a DM em grupo: num
  grupo o canal não é de uma dupla, e recusar o envio porque alguém ali bloqueou
  alguém calaria a conversa para todos. O grupo já se defende na entrada.

O que **não** virou PR, por decisão: achados Médios e Baixos vão como
recomendação, e nada de infraestrutura foi tocado.

---

## Recomendações — com o comando pronto

### R1 — Publicar as correções (hoje)

Revise e mergeie os PRs acima; o do `embeds` primeiro, que é o único Crítico.
Depois publique pelo caminho local de sempre (`docs/PROCESSO-DE-DESENVOLVIMENTO.md`),
já que o CI foi removido em 2026-09-03.

### R2 — Atualizar as dependências (esta semana)

O salto do Next 14 → 15 não é trivial e merece PR próprio, com a interface
conferida. Os outros três são diretos:

```bash
cd /opt/stack/streamz
docker run --rm -v /opt/stack/streamz:/w -w /w node:22 sh -c '
  corepack enable
  pnpm --filter @streamz/api  up multer@^2.2.0 nodemailer@^7.0.11
  pnpm --filter @streamz/web  up postcss@^8.5.23
  pnpm audit
'
```

### R3 — Trocar o `DOWNLOAD_PASSWORD` (hoje, 2 minutos)

É a única senha fraca do `.env` — 11 caracteres, com cara de frase em português.
Ela protege o download do instalador.

```bash
# gere uma nova
openssl rand -base64 24

# edite /opt/stack/streamz/.env, troque DOWNLOAD_PASSWORD=, e recarregue a API
cd /opt/stack/streamz
docker compose -f docker-compose.yml -f docker-compose.traefik.yml \
               -f docker-compose.ghcr.yml up -d --force-recreate streamz-api
```

Lembre de avisar quem usa o link de download — a senha antiga para de valer.

### R4 — Fixar a versão do LiveKit (hoje, 5 minutos)

```bash
# descubra a versão que está rodando agora
docker exec streamz-livekit /livekit-server --version

# em docker-compose.yml, troque
#   image: livekit/livekit-server:latest
# por
#   image: livekit/livekit-server:v1.9.1        # a versão que apareceu acima
```

Isso é mudança em arquivo do repositório: faça em PR, como o resto.

### R5 — Fechar o vazamento de voz e de presença (B8)

Duas mudanças pequenas, com o helper já pronto no código:

- `voice.service.ts:339` — trocar `emitToGuild` por `emitToChannel(channelId, …)`
  (ou `viewersOfChannel()` + `emitToUsers`), e filtrar `statesForGuild` por
  visibilidade.
- `chat.gateway.ts:235` e `users.service.ts` — trocar `server.emit`/`emitAll` por
  emissão às guilds em comum e aos amigos, em vez de à plataforma inteira.

### R6 — `helmet` na API

A API responde sem HSTS e sem `nosniff` (o PR #164 cobre só a web):

```bash
docker run --rm -v /opt/stack/streamz:/w -w /w node:22 sh -c '
  corepack enable && pnpm --filter @streamz/api add helmet'
```

E em `apps/api/src/main.ts`, antes do `requestIdMiddleware`:

```ts
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
```

As duas desativações são necessárias: a API serve mídia consumida pela web de
outra origem, e uma CSP na API não protege nada (ela não serve HTML).

### R7 — Fechar a revogação de sessão (B6 + B8)

O achado com maior impacto de produto. As peças já existem — o `sid` está no
token e a linha de sessão é estável:

1. `common/jwt.guard.ts` — validar `sid` contra `RefreshToken.revokedAt`,
   aproveitando o cache de 60 s do `AccountStatusService`.
2. `gateway/chat.gateway.ts` — em `avisarSessoesEncerradas` e na desativação de
   conta, chamar `server.in('user:<id>').disconnectSockets(true)`.

### R8 — Cifrar e tirar os backups do servidor

Os dumps têm PII de todos os usuários — e-mail, hash de senha e o conteúdo de
todas as mensagens privadas.

```bash
# 1. gere a chave e GUARDE-A FORA DESTE SERVIDOR (sem ela o backup é inútil)
apt install -y age
age-keygen -o /root/.age/backup.key      # chmod 600
grep 'public key' /root/.age/backup.key  # anote a pública

# 2. em /usr/local/bin/streamz-backup.sh, encadeie a cifra:
#      ... | gzip | age -r <CHAVE_PUBLICA> > "$destino.sql.gz.age"

# 3. mande para o R2 (a conta já existe), num bucket separado e privado
#    rclone copy /opt/backup/postgres r2:streamz-backups --max-age 48h
```

Restaurar: `age -d -i /root/.age/backup.key arquivo.sql.gz.age | gunzip | psql`.

### R10 — `voice/move` usar `assertCanActOn` (E18)

Uma linha, e alinha o `move` com o `kick`/`ban`/castigo:

```ts
// apps/api/src/modules/voice/voice.service.ts:282
- await this.guilds.assertCanModerate(actorId, guildId, Permission.MOVE_MEMBERS);
+ await this.guilds.assertCanActOn(actorId, guildId, userId, Permission.MOVE_MEMBERS);
```

Confira a assinatura de `assertCanActOn` em `guilds.service.ts` antes — o
`kick` (`:1016`) e o `ban` (`:1041`) são o modelo.

### R11 — Cortar a reprodução do som no cliente (E16)

O servidor não tem decodificador de áudio, então o teto de duração não dá para
impor no upload sem uma dependência nova. Mas dá para impor onde o dano
acontece: em `apps/web/lib/soundboard-audio.ts`, `tocarEfeitoSonoro` para o
`<audio>` depois de `MAX_SOUNDBOARD_DURACAO_MS`. Fecha o "MP3 de 9 minutos na
chamada" sem tocar na API.

### R9 — Verificações que ficaram de fora

- **O bucket do R2 é privado de verdade?** O código está certo —
  `R2_PUBLIC_BASE_URL` está vazio, então todo anexo sai por URL assinada de 1 h e
  a autorização por canal vale. Mas isso é o *cliente*: se o bucket estiver com
  acesso público ligado no painel da Cloudflare (domínio `r2.dev` ou domínio
  personalizado), qualquer um que descubra uma chave baixa o arquivo sem passar
  pela API. Não dá para verificar daqui sem credencial. **Confira no painel:**
  R2 → bucket `streamz` → *Settings* → *Public access* deve estar **desativado**.
  Ligar `R2_PUBLIC_BASE_URL` um dia desliga **toda** a autorização de anexo de
  uma vez — vale um comentário de alerta em `storage.service.ts:108`.
- **Teste dinâmico autenticado** (IDOR na prática, sessão revogada, o SSRF ao
  vivo): exigiria criar contas de teste em produção. Toda a análise de
  autorização deste relatório é por leitura de código.
- **`/opt/stack/traefik`**: lido, não alterado — a política do projeto é pedir ao
  usuário. Não tem middleware `headers`, o que motivou o PR #164 resolver pelo
  Next.
- **Enumeração por tempo medida ao vivo**: o teto de 10/min cortou antes de dar
  para medir com confiança. O achado vem da leitura do código.

---

## Como reproduzir esta auditoria

```bash
# segredos no histórico
docker run --rm -v /opt/stack/streamz:/repo zricethezav/gitleaks:latest \
  detect -s /repo --no-banner --redact

# nada sensível já commitado
git -C /opt/stack/streamz log --all --diff-filter=A --name-only --pretty=format: \
  | sort -u | grep -EiI '\.env|\.key$|\.pem$|id_rsa|livekit\.yaml$'

# portas públicas
ss -tlnpu

# cabeçalhos
curl -sI https://streamz.chat/ ; curl -sI https://api.streamz.chat/api/health

# CORS
curl -s -D - -o /dev/null -H 'Origin: https://evil.example.com' \
  https://api.streamz.chat/api/health | grep -i access-control

# dependências
docker run --rm -v /opt/stack/streamz:/w -w /w node:22 \
  sh -c 'corepack enable && pnpm audit'
```
