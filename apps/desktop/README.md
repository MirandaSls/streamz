# Streamz Desktop (Tauri 2)

O app desktop embrulha o cliente web numa janela nativa + instalador Windows
(`.exe` NSIS e `.msi`).

`tauri.conf.json` é JSON puro e **não aceita comentários** — as decisões que
precisariam de um comentário lá estão documentadas aqui.

```bash
pnpm --filter @streamz/desktop dev     # janela nativa carregando http://localhost:3000
pnpm --filter @streamz/desktop build   # instalador (precisa de Rust/cargo)
```

## Estratégia de build: export estático

`build.frontendDist` aponta para `../../web/out`, ou seja: **o desktop embute a
web como HTML estático**, e não carrega uma URL remota.

Por que essa opção, e não `frontendDist` apontando para uma URL:

- O app abre e renderiza sem depender do servidor da web estar no ar; só a API
  (REST/WS) precisa estar acessível — que é justamente o que o usuário configura
  por `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`.
- Uma janela apontada para uma origem remota (`http(s)://`) perde o contexto
  local: a CSP e o modelo de permissões do Tauri passam a valer para conteúdo de
  terceiros, e a superfície de ataque de um XSS na web vira acesso ao app nativo.
- Todas as rotas da web (`/`, `/login`, `/register`, `/app`) são client
  components — não há rota de API, middleware, server action nem `next/image`.
  Nada exige servidor Next.

Como o `out/` é gerado: `apps/web/next.config.mjs` liga `output: "export"` **por
ambiente**, não incondicionalmente (senão o deploy web normal, com `next start`,
quebraria):

- `TAURI_ENV_*` — o Tauri injeta essas variáveis no `beforeBuildCommand`, então
  `pnpm --filter @streamz/desktop build` já produz o `out/` automaticamente;
- `NEXT_OUTPUT=export` — chave explícita, para gerar o `out/` na mão:

  ```bash
  NEXT_OUTPUT=export pnpm --filter @streamz/web build   # bash
  $env:NEXT_OUTPUT="export"; pnpm --filter @streamz/web build   # PowerShell
  ```

No export, `trailingSlash: true` faz o Next emitir `out/app/index.html` em vez de
`out/app.html` — o protocolo de asset do Tauri resolve diretório → `index.html`,
então recarregar a janela numa rota interna continua funcionando.

## CSP e `withGlobalTauri`

`app.security.csp` era `null` — ou seja, **sem CSP nenhuma**: qualquer conteúdo
injetado na webview podia carregar script de qualquer origem e falar com qualquer
host. Agora há uma política explícita, por diretiva, em `tauri.conf.json`.

O que cada abertura paga:

| Diretiva | Valor | Por quê |
|---|---|---|
| `default-src` | `'self'` | tudo o que não estiver listado abaixo é negado |
| `script-src` | `'self' 'unsafe-inline'` | o export do Next embute o payload de hidratação em `<script>` inline. O Tauri calcula os hashes desses inlines no build e os injeta na política; quando isso acontece o `'unsafe-inline'` é ignorado pelo browser (hash tem precedência) e ele fica só como rede de segurança |
| `style-src` | `'self' 'unsafe-inline'` | React/LiveKit aplicam estilo inline em elementos |
| `img-src` | `'self' data: blob:` + API | avatares e anexos vêm do proxy da API (`API_PUBLIC_URL`); `blob:`/`data:` cobrem preview local de upload |
| `media-src` | `'self' data: blob: mediastream:` | áudio/vídeo do LiveKit chegam como `MediaStream`/`blob:` |
| `connect-src` | `'self' ipc: http://ipc.localhost` + API + WS + LiveKit | `ipc:`/`http://ipc.localhost` é o canal de IPC do Tauri 2 (sem isso nenhum comando nativo funciona); o resto é REST + Socket.IO + sinalização do LiveKit |
| `worker-src` | `'self' blob:` | o LiveKit cria workers a partir de `blob:` |
| `frame-src`, `object-src`, `form-action` | `'none'` | o app não embute iframe, plugin nem submete formulário nativo |

### Como parametrizar por ambiente

Os valores versionados são os do **dev** (`.env.example`): API em
`http://localhost:3333`, LiveKit self-host em `ws://localhost:7880` e LiveKit
Cloud em `*.livekit.cloud`. Quando `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_LIVEKIT_URL` ou `R2_PUBLIC_BASE_URL` apontarem para outro host, a
CSP precisa listar esse host — CSP não lê variável de ambiente.

Como `tauri.conf.json` é estático, sobrescreva no build com `--config`, que aceita
um caminho de arquivo e faz **merge** sobre a config base. Guarde um arquivo por
ambiente ao lado do `tauri.conf.json` — ex. `src-tauri/tauri.prod.conf.json`:

```json
{
  "app": {
    "security": {
      "csp": {
        "connect-src": "'self' ipc: http://ipc.localhost https://api.streamz.dev wss://api.streamz.dev https://streamz.livekit.cloud wss://streamz.livekit.cloud",
        "img-src": "'self' data: blob: https://api.streamz.dev https://cdn.streamz.dev"
      }
    }
  }
}
```

```bash
pnpm --filter @streamz/desktop tauri build --config tauri.prod.conf.json
```

O merge é **por diretiva**: só as diretivas listadas mudam, mas cada uma que
aparecer substitui a original inteira — repita os valores que ainda valem
(`'self'`, `ipc:`, …).

### `withGlobalTauri: false`

Estava `true` só para o `apps/web/lib/desktop.ts` alcançar
`window.__TAURI__.notification`. Expor a ponte global inteira no `window` para
usar uma função é superfície de ataque desnecessária: qualquer script injetado
(um XSS numa mensagem, por exemplo) herdaria o mesmo acesso. O `desktop.ts` agora
importa `@tauri-apps/api` / `@tauri-apps/plugin-notification` — o que passa pelo
IPC continua limitado pelas capabilities em `capabilities/default.json`.

## Auto-update — desligado de propósito

O `tauri-plugin-updater` **não** está registrado. Ele estava ativo apontando para
`releases.streamz.dev` (domínio que não existe) com `pubkey` placeholder — nessa
configuração o app só produz erro de verificação em runtime, sem nunca atualizar.

Para religar, quando existir chave e servidor de verdade:

1. Gere o par de chaves de assinatura e guarde a privada fora do repo:

   ```bash
   pnpm --filter @streamz/desktop tauri signer generate -w ~/.tauri/streamz.key
   ```

2. `src-tauri/Cargo.toml`: descomente `tauri-plugin-updater = "2"`.
3. `src-tauri/src/main.rs`: volte com
   `.plugin(tauri_plugin_updater::Builder::new().build())`.
4. `src-tauri/capabilities/default.json`: adicione `"updater:default"`.
5. `src-tauri/tauri.conf.json`: preencha `plugins.updater` com a **chave pública**
   e o endpoint real, e troque `bundle.createUpdaterArtifacts` para `true`:

   ```json
   "plugins": {
     "updater": {
       "endpoints": ["https://SEU-SERVIDOR/updater/{{target}}/{{arch}}/{{current_version}}"],
       "pubkey": "<chave pública gerada no passo 1>",
       "windows": { "installMode": "passive" }
     }
   }
   ```

6. Assine o build exportando `TAURI_SIGNING_PRIVATE_KEY` (e
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, se a chave tiver senha).
