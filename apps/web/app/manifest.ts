import type { MetadataRoute } from "next";

/**
 * Manifesto do PWA. Os ícones saem do mesmo desenho do pacote de marca — os
 * PNGs vêm de `apps/desktop/src-tauri/icons`, gerados por `tauri icon` a partir
 * de `apps/desktop/logo.svg`; se o símbolo mudar, regenere lá e copie de novo.
 *
 * Este arquivo é uma **rota de metadata** do Next: ele publica
 * `/manifest.webmanifest` e injeta o `<link rel="manifest">` em toda página
 * sozinho. Não existe (nem pode existir) um `public/manifest.webmanifest` ao
 * lado — dois manifestos com `start_url` diferentes é a maneira mais fácil de
 * o app instalado abrir numa tela e o navegador achar que abriu em outra.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streamz",
    short_name: "Streamz",
    description: "Chat de comunidade — voz, vídeo e tela",
    lang: "pt-BR",
    /*
     * O app instalado abre **direto no app**, e não na raiz.
     *
     * `/` é só um redirecionador: `app/page.tsx` monta, lê o `localStorage` e
     * manda para `/app` ou `/login`. Numa aba isso custa um quadro; num ícone
     * na tela de início custa a tela de abertura do sistema inteira mostrando
     * "Carregando…" antes de decidir para onde ir. `/app` já é a tela do
     * produto, e quem não tem sessão continua sendo mandado para `/login` de
     * lá — o mesmo destino, sem o salto extra.
     *
     * **Sem barra no fim, de propósito.** O manifesto só é lido pelo navegador,
     * ou seja, pela web **servida** — e lá o `trailingSlash` é o padrão
     * (`false`): pedir `/app/` levaria um 308 para `/app` a cada abertura do
     * app instalado. O `trailingSlash: true` do `next.config.mjs` vale só no
     * export estático, que é o que o Tauri empacota, e o Tauri não lê
     * manifesto nenhum. (No export a rota existe como `out/app/index.html`,
     * que o protocolo de asset resolve pelos dois caminhos.)
     */
    start_url: "/app",
    /*
     * `scope` explícito porque o padrão do spec depende da barra final do
     * `start_url`: sem `scope`, ele vira o caminho-pai do `start_url` — com
     * `/app` dá `/`, mas bastaria alguém pôr a barra de volta para virar
     * `/app/`, e aí `/login`, `/register` e `/invite/…` ficariam **fora** do
     * escopo, abrindo na aba do navegador, com barra de endereço, em vez de
     * dentro do app instalado. Escrito na mão, isso deixa de depender de um
     * detalhe de pontuação.
     */
    scope: "/",
    display: "standalone",
    /*
     * `any`: o app tem leiaute de retrato (abas no rodapé) **e** aguenta
     * paisagem — a `CONSULTA_MOBILE` de `hooks/useEhMobile.ts` inclui o termo
     * `(pointer: coarse) and (max-height: 599px)` justamente para o telefone
     * deitado continuar no shell de celular. Travar em `portrait` tiraria o
     * vídeo em tela cheia e a chamada deitada, que é como se assiste a uma
     * transmissão de tela no telefone.
     */
    orientation: "any",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    /*
     * Void Ink (`#0b0b0f`) nos dois, e não o `chat` (`#1a1a1e`) que o app
     * pinta no corpo: `background_color` é a cor da tela de abertura que o
     * sistema desenha **antes** de o app existir, e `theme_color` a da barra
     * de status. As duas emolduram o app, e a cor de moldura da marca é o
     * preto (`docs/branding/marca/LEIA-ME.txt`) — que é também o que o
     * `viewport.themeColor` do `app/layout.tsx` declara. Os dois valores têm
     * de continuar iguais.
     */
    icons: [
      /*
       * Duas famílias, de propósito, e nenhuma substitui a outra.
       *
       * `purpose: "any"` é o tile de sempre: o símbolo já vem dentro de um
       * quadrado de cantos arredondados com respiro próprio (`app/icon.svg`,
       * `rx="236"`), e é assim que ele tem de aparecer onde o sistema **não**
       * recorta nada — atalho de área de trabalho, lista de apps do Chrome,
       * aba. Marcar esse desenho como `maskable` faria o Android aplicar a
       * máscara dele por cima da nossa moldura e comer os cantos da marca.
       *
       * `purpose: "maskable"` é o mesmo símbolo desenhado para ser recortado:
       * fundo Void Ink de borda a borda (sem cantos arredondados, sem alfa) e
       * o símbolo **inteiro dentro da zona segura**. A zona segura do spec é
       * um **círculo** de 80% da largura, não um quadrado de 80% — a primeira
       * versão desta imagem coube no quadrado e mesmo assim a máscara redonda
       * do Android cortava os dois cantos de cima do balão. O que vale é o
       * ponto limão mais distante do centro: ele está a **40,05%** da largura,
       * ou seja, encostado no raio de 40% e não além dele (medido com Pillow,
       * varrendo os pixels limão do PNG de 1024 — §6.3 do processo).
       *
       * Sem a segunda família o Android instala o app com o nosso tile dentro
       * de outro tile (o "ícone com moldura branca"); só com ela, a marca
       * perderia os cantos em todo lugar que não recorta. Daí as duas.
       *
       * Como os dois PNGs foram gerados (o host não tem Pillow nem
       * rasterizador — tudo em docker):
       *   1. um SVG de 1024 com `<rect>` cheio `#0B0B0F` e o mesmo grupo de
       *      `app/icon.svg` sob `translate(147.68 123.39) scale(3.0357)` — a
       *      escala que põe o ponto mais distante do desenho (a quina de cima
       *      do balão, a 134,93 do centro no espaço local) exatamente em
       *      409,6px, que é o raio de 40% de 1024;
       *   2. `cairosvg` para 1024×1024, com o alfa achatado sobre Void Ink;
       *   3. Pillow `LANCZOS` para 512 e 192.
       */
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icone-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icone-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
