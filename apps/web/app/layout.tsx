import "./globals.css";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Streamz",
  description: "Chat de comunidade — voz, vídeo e tela",
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
      <body className="font-sans">{children}</body>
    </html>
  );
}
