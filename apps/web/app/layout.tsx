import "./globals.css";
import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";

/**
 * O Discord usa a "gg sans", fonte proprietária. A Noto Sans é a fallback
 * oficial deles e tem a mesma métrica geral — é o mais perto que dá sem a
 * licença. Carregada pelo next/font: sem request em runtime, sem layout shift.
 */
const fonteSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NewDisc",
  description: "Chat de comunidade — voz, vídeo e tela",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={fonteSans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
