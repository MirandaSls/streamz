# Streamz Desktop (Tauri 2)

O app desktop embrulha o cliente web numa janela nativa + instalador Windows
(`.exe` NSIS e `.msi`).

`tauri.conf.json` é JSON puro e **não aceita comentários** — as decisões que
precisariam de um comentário lá estão documentadas aqui.

```bash
pnpm --filter @streamz/desktop dev     # janela nativa carregando http://localhost:3000
pnpm --filter @streamz/desktop build   # instalador (precisa de Rust/cargo no Windows)
```

O instalador também sai **do Linux**, sem gastar runner Windows: veja
`Dockerfile.xwin` aqui do lado e `scripts/build-desktop-no-servidor.sh`
(documentado no §5.3 de `docs/PROCESSO-DE-DESENVOLVIMENTO.md`).

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

## Auto-update

O app procura versão nova **ao abrir** e mostra um cartão no canto (o
`AvisoDeAtualizacao`, na web). Fechar o cartão vale para aquela sessão: ele volta
na próxima abertura, de propósito — um "não perturbe" gravado transformaria um
adiamento em uma versão parada para sempre. Nada é baixado sem clique.

O caminho é: o app consulta `GET /api/updates/{target}/{arch}/{versão}` na API,
que devolve **204** quando não há nada, ou um manifesto assinado quando há. O
pacote só é aceito se a assinatura bater com a chave pública embutida no app —
é isso, e não autenticação, que protege o canal.

### Publicar uma versão

1. **Uma vez**, gere o par de chaves e guarde a privada fora do repo:

   ```bash
   pnpm --filter @streamz/desktop tauri signer generate -w ~/.tauri/streamz.key
   ```

   - cole a **pública** em `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`;
   - guarde a **privada** no segredo `TAURI_SIGNING_PRIVATE_KEY` do repositório
     (e a senha dela em `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, se tiver).

   Enquanto a pública estiver vazia, o app roda normalmente e o updater
   simplesmente nunca encontra nada — mas o build de release recusa começar.

2. Suba a `version` em `src-tauri/tauri.conf.json`.

3. Rode o workflow **Desktop (Windows)** com `release: true`. Ele gera o `.exe`,
   o `.sig` e imprime a assinatura no log.

4. Hospede o `.exe` onde o app possa baixá-lo (o mesmo servidor serve) e ponha
   no `.env` da API:

   ```
   DESKTOP_UPDATE_VERSION=0.1.0
   DESKTOP_UPDATE_URL=https://.../Streamz_0.1.0_x64-setup.exe
   DESKTOP_UPDATE_SIGNATURE=<conteúdo do .sig>
   DESKTOP_UPDATE_NOTES=O que mudou nesta versão.
   ```

   Reinicie a API. Não precisa rebuildar imagem: o manifesto é montado do
   ambiente.

Sem essas variáveis a API responde "não há atualização" — que é o estado padrão
e não quebra nada.


## Android: o mesmo crate, sem crate novo

O app de celular **reaproveita este `src-tauri`**: mesmo `tauri.conf.json`,
mesmo `frontendDist: ../../web/out`, mesmos plugins. Não existe `apps/mobile`.
O `tauri android init` gera um projeto Gradle em `src-tauri/gen/android/`, que
fica **versionado** (ver mais abaixo o porquê).

Três coisas precisaram mudar para isso, e nenhuma delas altera o desktop:

1. **O crate virou biblioteca + binário.** No Android não há `main()`: o
   sistema carrega uma `.so` e chama o ponto de entrada que o
   `tauri::mobile_entry_point` gera. Daí o `[lib] crate-type = ["staticlib",
   "cdylib", "rlib"]` no `Cargo.toml`, o app inteiro em `src/lib.rs` e um
   `src/main.rs` de uma linha para o desktop. É o que a doc do Tauri 2 manda
   (<https://v2.tauri.app/start/migrate/from-tauri-1/>, "Mobile support").
   O executável de desktop é o mesmo código, só mudou de arquivo.

2. **`tauri.android.conf.json`** — a config por plataforma. O Tauri aplica esse
   arquivo sobre o `tauri.conf.json` com **JSON Merge Patch (RFC 7396)**:
   objetos mesclam chave a chave, mas **arrays substituem o array inteiro**.
   Por isso o `app.windows` de lá repete a janela em vez de acrescentá-la.
   O que ele resolve:

   - a janela `main` do desktop nasce `"visible": false`, porque quem a mostra é
     a janelinha `splash` depois de checar atualização. **No celular não há
     splash**: sem essa troca o app abriria numa tela preta permanente. Este é
     o item que quebra de verdade; o resto é higiene.
   - `"decorations": false` existe porque a barra de título é nossa (§8 do
     processo). Não há barra de título de sistema num telefone para desligar, e
     o `ShellMobile` não desenha a nossa.
   - `width`/`height`/`minWidth`/`minHeight` não significam nada num telefone.
   - a segunda janela — a `splash` de 300×350 — é o ciclo do atualizador do
     Tauri, que não existe no Android.

   O que **não** está lá de propósito: `app.security.csp`. É a mesma do desktop
   e continua valendo (merge por chave); duas verdades sobre para onde o app
   pode falar seria pior que qualquer economia.

3. **`capabilities/` ganhou `platforms`.** Metade das permissões da janela
   principal é desktop-only (maximizar, arrastar a janela, o atualizador) e a
   ACL do Android não as conhece. `default.json` e `splash.json` declaram
   `["windows", "linux", "macOS"]`; o celular tem o seu `mobile.json`, com
   `["android", "iOS"]` e um conjunto bem menor.

### `bundle.android` e o `versionCode`

O Tauri deriva o `versionCode` da `version` do `tauri.conf.json` pela fórmula
`major * 1000000 + minor * 1000 + patch`. Para a **1.1.0** isso dá
**`1001000`**. Duas consequências práticas:

- a Play recusa upload com `versionCode` menor ou igual ao anterior, e a
  fórmula só cresce se a versão crescer — ou seja, **publicar duas vezes a mesma
  versão não dá**, mesmo que o `.aab` mude. Para isso existe
  `bundle.android.versionCode` (número sequencial próprio) ou
  `autoIncrementVersionCode`;
- `patch` acima de 999 e `minor` acima de 999 colidem com a casa seguinte. Não é
  um problema hoje, mas é o motivo de a fórmula não ser eterna.

`minSdkVersion` é 24 (Android 7.0) — o padrão do Tauri, declarado no arquivo
para ficar explícito em vez de implícito.

### Por que `gen/android/` é versionado

Porque **não existe chave no `tauri.conf.json` para permissão de Android**.
`INTERNET`, `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS` e as
`FOREGROUND_SERVICE*` só entram editando o `AndroidManifest.xml` gerado, e a
configuração de assinatura de release só entra editando o `build.gradle.kts`
gerado. Se a pasta fosse ignorada, um clone novo rodaria `android init` e
produziria um `.apk` **sem as permissões** — o app abriria sem microfone, e o
sintoma apareceria só no telefone.

O `android init` escreve um `.gitignore` próprio dentro de `gen/android/`, que
já exclui `build/`, `.gradle/`, `local.properties` e o `keystore.properties`
(que carrega a senha). É esse arquivo que faz o trabalho; o `.gitignore` da
raiz não sabe de Android.

### Como gerar o `.apk`/`.aab`

```bash
scripts/build-android-no-servidor.sh              # origin/main, assinado
scripts/build-android-no-servidor.sh <ref>
scripts/build-android-no-servidor.sh --sem-assinar
```

Sai em `.claude/saida-android/<versão>-<commit>/`. O keystore de release está
em `/root/.android/streamz.keystore` e a senha em
`/root/.android/streamz.keystore.senha` (chmod 600). **Perder esse keystore é o
mesmo que perder `/root/.tauri/streamz.key`**: a Play só aceita atualização
assinada com a mesma chave, então um keystore perdido significa **nunca mais
atualizar o app** — só publicar um app novo, com outro `applicationId`, e pedir
a todo mundo que reinstale.

### O atualizador do Tauri não vale para Android

O `tauri-plugin-updater` é desktop-only, e por isso ele e o `tauri-plugin-process`
estão num bloco `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`
do `Cargo.toml` — no `.apk` eles nem entram. Na loja quem atualiza é a loja;
num `.apk` baixado à mão, é o usuário. O que existe no lugar é o card "Baixar
atualização" da web (`apps/web/lib/atualizacao-mobile.ts`), que consulta a
mesma rota `/api/updates` e abre `streamz.chat/download` no navegador.
