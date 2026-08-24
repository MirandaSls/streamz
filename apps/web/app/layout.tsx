import "./globals.css";
import type { Metadata } from "next";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
