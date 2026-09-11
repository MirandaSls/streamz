# publico/ — páginas públicas do Discord (sem login)

Coleta: **2026-09-11**, Chrome headless (Playwright, `channel: "chrome"`), locale `pt-BR`,
fuso `America/Sao_Paulo`. A Cloudflare não barrou nada e nenhum captcha apareceu.

## O que tem

Três perfis, cada página com `<nn>-<nome>-viewport.png`, `-inteira.png` e `.html` (o
`page.content()` renderizado):

| perfil | emulação | páginas |
|---|---|---|
| `desktop/` | 1440×900, deviceScaleFactor 2 (PNG 2880 px de largura) | 16 (inclui QR com recorte e convite → "Entre aqui") |
| `web-mobile-ios/` | `devices['iPhone 15 Pro']` (393×659, DSF 3, UA do Safari iOS) | 14 |
| `web-mobile-android/` | `devices['Pixel 7']` (412×839, DSF 2,625) | 14 |

| nn | página | `tela` |
|---|---|---|
| 01 | `/login` | autenticação > login |
| 02 | `/login` com o QR pronto + recorte do painel QR (só desktop; no mobile o QR não existe) | autenticação > login por QR |
| 03 | `/reset` sem token (tela do link do e-mail: "Alterar sua senha") | autenticação > esqueci a senha |
| 04 | **SIMULADO**: "Esqueceu sua senha?" com e-mail vazio. O POST foi respondido localmente com o erro de validação da API ("Este campo é obrigatório") | autenticação > esqueci a senha |
| 05 | `/register` | autenticação > registro |
| 06 | `/register` com o dropdown de mês aberto | autenticação > registro |
| 07 | `/app` sem login | autenticação > login |
| 08 | `discord.gg/discord-developers` | modais > página de convite |
| 09 | `/invite/minecraft` | modais > página de convite |
| 10 | convite depois de "Já tem uma conta? Entre aqui" (só desktop) | modais > página de convite |
| 11 | `/servers` | descoberta > descobrir servidores |
| 12 | `/discovery/applications` | descoberta > diretório de apps |
| 13 | `/discovery/applications/159985415099514880` (MEE6) | descoberta > diretório de apps |
| 14 | `/nitro` | descoberta > loja |
| 15 | `/download` | marketing |
| 16 | `/` (home) | marketing |

`manifesto.json` tem uma entrada por arquivo (133): `arquivo`, `tipo` (viewport /
pagina-inteira / html-renderizado / recorte), `url`, `urlFinal`, `status`, `titulo`, `perfil`,
`plataforma` (`desktop` | `web-mobile`), `tela`, `observacao`. A observação traz redirecionamento,
corte, requisições bloqueadas e o modo da captura inteira.

## O que se viu

- **`/app` sem login redireciona para `/login`** nos três perfis. O mobile **não** pede para baixar
  o app: mostra o mesmo login, sem o painel de QR.
- `discord.gg/<código>` redireciona para `discord.com/invite/<código>`, e a landing de convite abre
  nos três perfis. No desktop ela já traz um **cadastro rápido embutido** (nome exibido + data de
  nascimento + "Criar conta"), e "Entre aqui" leva a `/invite/<código>/login`. No mobile é só o card
  do servidor com "Aceitar convite".
- O login desktop mostra o QR (remote auth) ao lado do formulário. Nos perfis mobile o painel
  não aparece. O ponto de corte exato não foi medido (o CSS tem `max-width: 830px`, que é um
  bom candidato).
- `/servers` é a única página em inglês: o Discovery ignorou o `pt-BR`.

## Como refazer

```bash
cd ../ferramentas
node publico-capturar.mjs desktop login login-qr        # uma página ou um lote pequeno por vez
node publico-capturar.mjs web-mobile-ios todas          # ids: rode sem argumentos para listar
```

O manifesto é mesclado por `arquivo`, então rodar de novo substitui só o que foi recapturado.

## Regras e lacunas

- Nenhum login, conta ou formulário enviado. O script **aborta no navegador** todo POST para
  `/api/*/auth/` e `/api/*/invites/`, e isso aparece na observação: o login dispara sozinho
  `auth/conditional/start`, da passkey. A única exceção é a 04, respondida localmente e marcada
  SIMULADO no nome do arquivo.
- As telas pós-envio do "esqueci a senha" ("instruções enviadas") não foram capturadas, porque
  exigiriam enviar um e-mail real.
- **"inteira" tem teto de altura** (~15.000 px físicos, limite do Chrome): nitro e home no desktop,
  e as páginas longas no mobile, saem cortadas. A altura real está na observação. Nas SPAs com
  rolagem interna (diretório de apps, registro no iOS), a viewport é esticada até caber o conteúdo.
  Os primeiros cards do diretório podem aparecer sem imagem (lazy-load).
- O mobile é o Chrome emulando viewport, DPR, toque e UA. **Não é Safari/WebKit de verdade**. No
  mobile, o logo "Discord" do topo do login aparece cortado ("Discor"). É assim que o Chrome
  emulado renderiza; confira num aparelho real antes de copiar.
- O QR da 02 é um código de remote auth vivo na hora da captura, já expirado. Os contadores de
  online e membros dos convites são do momento.
- Os PNGs somam ~200 MB (DSF 2–3).
