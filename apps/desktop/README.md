# NewDisc Desktop (Tauri 2)

O app desktop embrulha o cliente web numa janela nativa + instalador Windows
(`.exe` NSIS e `.msi`).

`tauri.conf.json` é JSON puro e **não aceita comentários** — as decisões que
precisariam de um comentário lá estão documentadas aqui.

```bash
pnpm --filter @newdisc/desktop dev     # janela nativa carregando http://localhost:3000
pnpm --filter @newdisc/desktop build   # instalador (precisa de Rust/cargo)
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
  `pnpm --filter @newdisc/desktop build` já produz o `out/` automaticamente;
- `NEXT_OUTPUT=export` — chave explícita, para gerar o `out/` na mão:

  ```bash
  NEXT_OUTPUT=export pnpm --filter @newdisc/web build   # bash
  $env:NEXT_OUTPUT="export"; pnpm --filter @newdisc/web build   # PowerShell
  ```

No export, `trailingSlash: true` faz o Next emitir `out/app/index.html` em vez de
`out/app.html` — o protocolo de asset do Tauri resolve diretório → `index.html`,
então recarregar a janela numa rota interna continua funcionando.

## Auto-update — desligado de propósito

O `tauri-plugin-updater` **não** está registrado. Ele estava ativo apontando para
`releases.newdisc.dev` (domínio que não existe) com `pubkey` placeholder — nessa
configuração o app só produz erro de verificação em runtime, sem nunca atualizar.

Para religar, quando existir chave e servidor de verdade:

1. Gere o par de chaves de assinatura e guarde a privada fora do repo:

   ```bash
   pnpm --filter @newdisc/desktop tauri signer generate -w ~/.tauri/newdisc.key
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
