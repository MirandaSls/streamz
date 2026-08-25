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
