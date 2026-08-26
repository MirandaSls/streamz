import type { MetadataRoute } from "next";

/**
 * Manifesto do PWA. Os ícones saem do mesmo desenho do pacote de marca — os
 * PNGs vêm de `apps/desktop/src-tauri/icons`, gerados por `tauri icon` a partir
 * de `apps/desktop/logo.svg`; se o símbolo mudar, regenere lá e copie de novo.
 *
 * `purpose: "any"` e não `maskable`: o símbolo já vem dentro de um tile com
 * cantos arredondados e respiro próprio, e a máscara do Android cortaria a
 * marca. Ver a regra de área de respiro em docs/branding/marca/LEIA-ME.txt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streamz",
    short_name: "Streamz",
    description: "Chat de comunidade — voz, vídeo e tela",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
