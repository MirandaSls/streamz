/**
 * Cabeçalhos de segurança que a web devolve em toda resposta.
 *
 * Mora num `.mjs` separado, e não dentro do `next.config.mjs`, para que o teste
 * de regressão (`cabecalhos-de-seguranca.test.ts`) possa importar a lista sem
 * arrastar junto a configuração inteira do Next.
 *
 * ## Por que isto existe
 *
 * Auditoria de 2026-09-08: `curl -I https://streamz.chat/` não devolvia
 * **nenhum** cabeçalho de segurança. Não é falha de configuração do servidor —
 * é que ninguém os põe: o Next não tinha `headers()`, o Traefik não tem
 * middleware `headers` e o Caddyfile de exemplo só faz `reverse_proxy`. O
 * efeito prático era a app poder ser enquadrada em iframe de qualquer site
 * (clickjacking) e o `Referer` completo vazar para todo link externo clicado
 * numa mensagem.
 *
 * ## O que entrou, e o que deliberadamente não entrou
 *
 * A CSP aqui é o **subconjunto que não pode quebrar um SPA React**:
 * `frame-ancestors`, `base-uri`, `object-src` e `form-action`. Nenhum deles
 * restringe de onde vêm script, estilo, imagem ou conexão, então não há risco
 * de derrubar o Giphy, a mídia do R2 ou o WebSocket do LiveKit.
 *
 * `script-src`/`style-src`/`connect-src`/`img-src` ficaram **de fora de
 * propósito**. Fechá-los exige inventariar todo host de mídia que a app
 * consome e, no Next 14 sem middleware de nonce, exigiria `'unsafe-inline'` em
 * `script-src` — o que anula boa parte do ganho. É um passo seguinte, que pede
 * conferência da interface renderizada, não um detalhe a chutar aqui.
 *
 * ## Permissions-Policy
 *
 * `camera`, `microphone` e `display-capture` precisam de `self`: são o canal de
 * voz e o compartilhamento de tela. O resto vai fechado.
 */

/**
 * `Content-Security-Policy` — só as diretivas que independem de inventário de
 * origem. Ver o bloco acima para o que ficou de fora e por quê.
 */
export const CSP = [
  // Ninguém enquadra o Streamz em iframe. Substitui e supera o
  // `X-Frame-Options: DENY`, que continua abaixo só para navegador antigo.
  "frame-ancestors 'none'",
  // Impede que uma injeção de `<base href>` redirecione todo caminho relativo
  // (script, fetch, link) para um servidor de terceiro.
  "base-uri 'self'",
  // A app não usa `<object>`, `<embed>` nem applet. Fechar é de graça.
  "object-src 'none'",
  // Formulário só posta para a própria origem: fecha o roubo de credencial por
  // troca do `action` de um `<form>`.
  "form-action 'self'",
].join("; ");

/**
 * A lista que o `headers()` do `next.config.mjs` devolve para `/:path*`.
 */
export const CABECALHOS_DE_SEGURANCA = [
  {
    key: "Content-Security-Policy",
    value: CSP,
  },
  {
    // 2 anos. `includeSubDomains` alcança `api.` e `livekit.`, que já só
    // atendem em HTTPS/WSS. Sem `preload`: entrar na lista embutida dos
    // navegadores é irreversível na prática e é decisão do dono do domínio.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // Redundante com `frame-ancestors`, mantido para navegador que não
    // implementa CSP nível 2.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Impede o navegador de "adivinhar" que um arquivo declarado como texto é,
    // na verdade, HTML ou script.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Link externo numa mensagem passa a levar só a origem, não o caminho —
    // que num app de chat pode conter id de servidor e de canal.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Voz e compartilhamento de tela precisam de `self`; o resto fica fechado
    // para que um iframe ou script de terceiro não consiga pedir nada.
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "microphone=(self)",
      "display-capture=(self)",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "midi=()",
      "interest-cohort=()",
    ].join(", "),
  },
];
