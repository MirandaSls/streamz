import BarraDeTituloMinima from "@/components/desktop/BarraDeTituloMinima";
import PesoDosIcones from "@/components/ui/PesoDosIcones";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Noto_Sans } from "next/font/google";

/**
 * Corpo e densidade da interface. Ficou a Noto Sans do MVP: trocar a fonte do
 * chat mexeria em métrica, altura de linha e leiaute de milhares de linhas, e
 * o rebranding (ADR-0004) não é redesign.
 */
const fonteSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * Archivo: a fonte de título do pacote de marca — wordmark, telas de auth,
 * títulos de modal e categorias. Ver design.md para quando usar cada peso.
 */
const fonteDisplay = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

/** JetBrains Mono: rótulos técnicos — código, código de convite, IDs, atalhos. */
const fonteMono = JetBrains_Mono({
  subsets: ["latin"],
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
};

/**
 * Void Ink: a cor que o navegador pinta na barra antes da página carregar.
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
  themeColor: "#0b0b0f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ── e-configuracoes ── `stores/settings` escreve style/class/lang no <html>
    // antes da hidratação (a preferência tem de valer no primeiro quadro), e é
    // exatamente a divergência que o React reclamaria aqui.
    <html
      lang="pt-BR"
      className={`${fonteSans.variable} ${fonteDisplay.variable} ${fonteMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <BarraDeTituloMinima />
        <PesoDosIcones>{children}</PesoDosIcones>
      </body>
    </html>
  );
}
