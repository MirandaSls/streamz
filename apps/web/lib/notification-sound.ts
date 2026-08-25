/**
 * Som curto de notificação, embutido no bundle.
 *
 * É um WAV de 220 ms (8 kHz, 8 bits) gerado como dois tons — bastam ~3 KB em
 * base64. Embutir evita um arquivo estático a mais e, principalmente, evita o
 * atraso de rede logo quando o som precisa tocar.
 *
 * O browser só deixa tocar áudio depois de alguma interação do usuário; por
 * isso `tocarSomDeNotificacao` engole a rejeição em silêncio em vez de derrubar
 * o fluxo de mensagens.
 */
const SOM_WAV_BASE64 =
  "UklGRgQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YeAGAACAgoSFgn55d3l/h4yMhnx0cXR+iZGRiXxxbHB8ipSV" +
  "jH1vaGx6i5eZkH5tZGh3i5qdk4BsYWR0ipuhl4JsX2FxiZ2kmoVsXV1uh52nnodtW1pqhZ6poopuWldng56rpY5wWVRjgJ2tqJFy" +
  "WFFgfZyvrJV0WE9cepuwr5h2WU1Ydpmxspx5WUtVc5extaB9WklRb5Wxt6SAXEhOa5KxuaiEXkdLZ4+wu6yIYEdIY4uvva+MYkdF" +
  "X4itvrOQZUdDW4Ssv7aUaEdAV4CpwLmYbEg/U3ynwLycb0o9T3ikwL+hc0w8S3OhwMGld047SG+ev8SpfFA6RWqavsWtgFM6QmaW" +
  "vMexhVY6P2GSusi1iVk7PF2OuMm4jl08OlmJtsq8kmE9OFSFs8q/l2U/N1CAsMnCnGlBNk17rMnEoG1DNUl3qMjGpHJGNEZypMbI" +
  "qXZJNENtoMXKrXtMNUBonMPLsYBPNT1kmMDMtIVTNjtgk77MuIpXODlbjrvMu45bOThXirfMvZNgOzdThbTLwJdkPjZQgLDKwpxp" +
  "QDVNe6zJxKBtQzVJd6jHxaRyRzZHcqTFxqh3SjZEbp/Dx6t7TjdCaZvAyK6AUjlBZZa9yLGFVjs/YpK6x7SJWj0+Xo22xraNXj8+" +
  "W4mzxbiRY0I9WISvxLqVZ0Q9VYCrwruZa0g+UnynwLyccEs/UHijvryfdE5AT3Sfu7yieFJBTXCbuLykfFZDTG2WtbumgFpFTGqS" +
  "sruohF5IS2eOr7mqh2JKTGWKq7irimZNTGOHp7arjWlQTWGDpLOskG1TTmCAoLGrknFXUF99nK6rlHRaUl56mKuqlnheVF54laip" +
  "l3thVl52kaWnmH5lWV90jqGlmIBpXGBzi56jmIJsYGJyiJqgl4RwY2RyhZadloVzZ2dyg5OZlIZ2a2pzgY+VkYZ5b250gIuQjoZ7" +
  "dHJ3f4eLiYR+enl8f4KAfoCEhYJ8eHuCiYiBeHV7hY2Kf3RyfImQinxwcX6Nkol4bXGBkZSHdGpyhZWUg29odIqYk39rZ3ePm5J6" +
  "Z2d7k5yPdWRpgJidi3Bha4acnYZqX26MoJuAZV9zkqOYemBfeJillHRdYX+dpY9tWmWFoqSJZ1hpjKaigmFXbpSqn3tbWHWbq5p0" +
  "V1t8oayUbFRehKerjWRSZIysqIVdUWqUr6R9V1JxnLGfdFJVeaSymGtPWYKqsZFjTF6LsK6IW0tllLSqf1RMbZ22pHVPT3alt51s" +
  "SlOArbaVY0hZirO0jFpGYZS3r4JSR2mduql3TEpzpryibUdOfa67mWNEVIi1uY9aQlySurSFUUNlnb6uekpFb6bApm9ESXqvv51k" +
  "QVCFt72TWj9XkL25iFE/YZvBs3xJQWumw6txQ0V2r8OiZT5LgrfBl1s8U46+vYxRO1yaw7eASD1npcWvc0JBc6/Gpmc9R3+4xJtc" +
  "Ok+Lv8GPUjlYl8S7g0k6Y6PHs3ZBPm+uyKpqPEN7t8efXjhLiL/Ek1M3VJXFvodKOF+hyLd6QTtrrMqubTtAeLbJo2E3SIW+xpdV" +
  "NVGSxcGKSzZbnsm6fUI4Z6rLsXA8PXS0y6ZjN0SBvcibWDVNjsTEjk00WJvJvYFEN2SnzLRzPTtwssyqZjdCfrvKnlo1SovDxpFP" +
  "NFWYyL+ERjZgpMu3dz46ba/MrWo5QHq5y6FeNUiHwceVUjRSlMfBiEg1XaHKuXtAOWmszK9tOj52tsukYTZGhL7ImFY1T5HFwotL" +
  "NVqdybt+QzhmqcuycT09c7PKp2U4RYC7yJtZNk6NwsOPTzZYmce8gkY5ZKXJs3U/PXCvyaloO0R9uMeeXThMib/DklM4VpbEvIVK" +
  "OWGhx7R4Qz1trMerbD5EebTGoGE7S4a8wpRXOlWSwbyITjtfncS1fEY/a6fFrHBBRHawxKJlPkuCuMGXWz1Ujr28i1I9XpnAtX9L" +
  "QGijwqx0RUV0rMGjaUJMf7O/mF9AVIq5uo1WQF2VvLSCT0Nnn76sd0pHcqe+o21GTXyuvJpjRFSHtLiPW0RdkbiyhVRGZpq6q3tO" +
  "SnCjuqNxS096qriaaElVhK+1kWBIXY2zsIdZSmaWtap+VE1vnrWidVBSeKS0mmxOWIGpsZJlTl+KrayJXk9mkq+ngFlRbpmwoHhW" +
  "VnefrplwVFt/pKySalRhh6eoimRUaI6po4JgV2+UqZ57XFp2maiXdFtffZ2mkW5aZISgo4pqW2qKop+DZl1wj6KafWNgdpOhlHhi" +
  "ZHyXn49zYmmCmZyJcGNuhpqYhG1lc4qZlH9raHiNmJB7a2x8j5aLeGxwgJCTh3ZtdIOQkIN1cHiFjoyAdXN7hoyIfnd3foaIhH56" +
  "fICDgg==";

const SOM_DATA_URI = `data:audio/wav;base64,${SOM_WAV_BASE64}`;

/** Elemento reaproveitado: criar um `Audio` por mensagem vazaria memória. */
let audio: HTMLAudioElement | null = null;

/** Toca o blip de notificação. `volume` vai de 0 a 1. */
export function tocarSomDeNotificacao(volume = 1): void {
  if (typeof Audio === "undefined") return;
  try {
    audio ??= new Audio(SOM_DATA_URI);
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // autoplay bloqueado (sem interação ainda): silêncio, não erro
    });
  } catch {
    // sem suporte a áudio: notificação visual já aconteceu
  }
}
