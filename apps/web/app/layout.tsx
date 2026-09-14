import AtualizadorDoAndroid from "@/components/atualizacao/AtualizadorDoAndroid";
import BarraDeTituloMinima from "@/components/desktop/BarraDeTituloMinima";
import AvisoDeInstalacao from "@/components/pwa/AvisoDeInstalacao";
import RegistroDoServiceWorker from "@/components/pwa/RegistroDoServiceWorker";
import PesoDosIcones from "@/components/ui/PesoDosIcones";
import "./tokens.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, Noto_Sans, Source_Code_Pro } from "next/font/google";

/**
 * As fontes do Discord (gg sans, ABC Ginto, gg mono) são proprietárias. Usamos a
 * pilha de fallback que o próprio CSS dele declara (ADR-0009, item 4):
 *
 * - `--font-primary` gg sans → **Noto Sans**: corpo e interface.
 * - `--font-headline` ABC Ginto Nord → **Noto Sans 800**: títulos grandes.
 * - `--font-code` gg mono → **Source Code Pro**: código.
 *
 * Os pesos e o itálico são os que o Discord registra em `@font-face` para a
 * Noto Sans (400–800, com itálico) e para a Source Code Pro (400 e 700). Sem o
 * itálico de verdade, o `*texto*` do markdown sai com itálico sintético.
 */
const fonteSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});

/** Archivo: **só o wordmark** (`MarcaLockup`). É marca, não interface. */
const fonteDisplay = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["800"],
  variable: "--font-display",
  display: "swap",
});

const fonteMono = Source_Code_Pro({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

/*
 * As três vêm pelo next/font, que baixa e serve os arquivos no build. Isso as
 * mantém em `'self'` e por isso passam na CSP do Tauri (`font-src 'self'
 * data:`) — importar fonts.googleapis.com por URL quebraria o desktop.
 */

/**
 * `metadataBase` é o que faz a og-image e o favicon resolverem em URL absoluta
 * no raspador de link. `WEB_PUBLIC_URL` já existe no .env; sem ela, localhost.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_PUBLIC_URL ?? "http://localhost:3000"),
  title: "Streamz",
  description: "Chat de comunidade — voz, vídeo e tela",
  applicationName: "Streamz",
  openGraph: {
    type: "website",
    siteName: "Streamz",
    locale: "pt_BR",
    title: "Streamz",
    description: "Chat de comunidade — voz, vídeo e tela",
  },
  twitter: { card: "summary_large_image", title: "Streamz" },
  /**
   * As três metas `apple-mobile-web-app-*`, que são o que o Safari lê ao
   * "Adicionar à Tela de Início" — o manifesto ele quase ignora.
   *
   * - `capable`: sem esta, o atalho do iPhone abre **dentro do Safari**, com
   *   barra de endereço e barra de abas comendo ~110px da tela e o gesto de
   *   voltar do navegador por cima da navegação do app. É a diferença entre um
   *   ícone que abre um site e um ícone que abre o app.
   * - `title`: o nome embaixo do ícone. Sem ela o iOS usa o `<title>` da
   *   página, que muda com a rota — o mesmo app instalado duas vezes sairia
   *   com dois nomes.
   * - `statusBarStyle: "black-translucent"`: a barra de status fica
   *   **transparente** e o conteúdo passa por baixo dela. É o par obrigatório
   *   do `viewportFit: "cover"` logo abaixo: os dois juntos é que fazem o
   *   `env(safe-area-inset-top)` do shell de celular valer alguma coisa. Com
   *   `default` o iOS reserva a faixa e pinta de branco — texto preto sobre
   *   branco no topo de um app escuro.
   *
   * Não há `<link rel="apple-touch-icon">` escrito na mão: `app/apple-icon.png`
   * já faz o Next emitir a tag sozinho (conferido no HTML exportado).
   */
  appleWebApp: {
    capable: true,
    title: "Streamz",
    statusBarStyle: "black-translucent",
  },
};

/**
 * A cor que o navegador pinta na barra antes da página carregar: a
 * `--background-base-lowest` do Discord (rail, coluna e barra de título).
 * Literal porque o metadado vira `<meta>` e não enxerga variável CSS. É a do
 * Dark; em Ash e Onyx o script `TEMA_ANTES_DA_PINTURA` e depois
 * `stores/settings.ts#aplicarTema` reescrevem o `content` com a do tema, lida
 * do CSS aplicado.
 *
 * As três linhas de baixo são do leiaute de celular, e cada uma resolve um
 * defeito concreto:
 *
 * - `viewportFit: "cover"` faz a página ir até as bordas físicas do aparelho.
 *   Sem ela o `env(safe-area-inset-*)` responde **zero** em todo lugar, e a
 *   barra de abas do rodapé e o cabeçalho não têm como se afastar do entalhe e
 *   da barra de gestos — o Safari simplesmente não conta as áreas seguras.
 * - `interactiveWidget: "resizes-content"` diz ao navegador para **encolher o
 *   leiaute** quando o teclado abre, em vez de empurrar a página para cima. Com
 *   o padrão (`resizes-visual`) o composer some atrás do teclado e a lista de
 *   mensagens continua medindo a tela inteira; com este, o `100dvh` do shell
 *   passa a ser a altura acima do teclado e o composer fica encostado nele.
 * - `maximumScale`/`userScalable` **não** aparecem aqui de propósito: travar o
 *   zoom é a maneira mais fácil de tornar o app inacessível. O zoom automático
 *   do iOS ao focar um campo é resolvido pelo tamanho da fonte (≥16px em
 *   `globals.css`), que é a causa, e não pela proibição de ampliar.
 */
export const viewport: Viewport = {
  themeColor: "#121214",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/**
 * Aplica o tema salvo **antes da primeira pintura**: sem isto, quem usa Ash ou
 * Onyx veria o Dark (o `:root` de `tokens.css`) até o bundle carregar e a
 * store escrever o atributo — um piscar a cada abertura, pior no app de
 * celular, que carrega mais devagar.
 *
 * Roda síncrono no `<head>`, antes do `<body>` existir. Lê direto o que o
 * `persist` do zustand grava em `localStorage["settings"]`
 * (`{"state": {...}, "version": n}`) e só aceita `ash`/`onyx`: qualquer outra
 * coisa (Dark, versão antiga, JSON quebrado, `localStorage` bloqueado) deixa o
 * `<html>` sem atributo, que é o Dark. A normalização de verdade continua na
 * store (`temaValido`); isto só antecipa o que ela vai escrever.
 *
 * A barra do sistema (`<meta name="theme-color">`) é trocada quando o documento
 * termina de ser lido — antes disso o `<meta>` pode ainda não existir no DOM e
 * o CSS pode não ter carregado; valor vazio não escreve nada.
 *
 * Inline de propósito, e por isso vale igual no site, no export do Tauri (a CSP
 * de lá aceita script inline) e no app de celular. Qualquer mudança no formato
 * salvo da store tem de passar por aqui.
 */
const TEMA_ANTES_DA_PINTURA = `(function(){try{var d=document.documentElement;var s=JSON.parse(localStorage.getItem("settings")||"null");var t=s&&s.state&&s.state.theme;if(t!=="ash"&&t!=="onyx")return;d.setAttribute("data-tema",t);document.addEventListener("DOMContentLoaded",function(){var c=getComputedStyle(d).getPropertyValue("--background-base-lowest").trim();if(!c)return;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c)})}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ── e-configuracoes ── `stores/settings` escreve style/class/lang no <html>
    // antes da hidratação (a preferência tem de valer no primeiro quadro), e o
    // script do tema escreve `data-tema` antes até disso: é exatamente a
    // divergência que o React reclamaria aqui.
    <html
      lang="pt-BR"
      className={`${fonteSans.variable} ${fonteDisplay.variable} ${fonteMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES_DA_PINTURA }} />
      </head>
      <body className="font-sans">
        <BarraDeTituloMinima />
        <PesoDosIcones>{children}</PesoDosIcones>
        {/*
          As duas peças do PWA. Ficam aqui, e não no shell do celular, porque
          valem em **toda** rota: quem chega por um link de convite ou pela
          tela de login também tem de poder instalar, e essas telas não passam
          pelo `ShellMobile`.

          As duas são inertes fora do navegador de celular: o registrador não
          registra nada dentro do Tauri nem em desenvolvimento
          (`deveRegistrarServiceWorker`) e o aviso nasce sem desenhar nada,
          decidindo só depois de montar (ver o cabeçalho de cada um). No HTML
          exportado — o mesmo que o app de desktop empacota — os dois somem
          para dois comentários vazios do React.
        */}
        <RegistroDoServiceWorker />
        <AvisoDeInstalacao />
        {/*
          O auto-update do app Android, aqui pelo mesmo motivo das duas linhas
          acima: vale em **toda** rota. Quem abre o app e para na tela de login
          é justamente quem mais precisa de versão nova, e essa tela não passa
          pelo `ShellMobile` nem pela rota `/app`.

          Fora do app Android ele não desenha nada e não faz nenhuma chamada de
          rede: no site atualizar é recarregar a página, e no app de desktop já
          existe a setinha verde da barra de título, que faz mais.
        */}
        <AtualizadorDoAndroid />
      </body>
    </html>
  );
}
