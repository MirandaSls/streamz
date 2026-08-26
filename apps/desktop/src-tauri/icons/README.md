# Ícones do app desktop

O Tauri precisa dos ícones referenciados em `tauri.conf.json` (`32x32.png`,
`128x128.png`, `icon.ico`). Gere todos a partir de um PNG quadrado (≥512px):

```bash
pnpm --filter @streamz/desktop tauri icon caminho/para/logo.png
```

Isso cria automaticamente todos os tamanhos nesta pasta. Sem os ícones, o
`tauri build` falha — este é um passo do Dia 5.

> O ícone da bandeja (system tray) reutiliza o ícone da janela já embutido no
> bundle (`app.default_window_icon()` em `src/main.rs`), então **não** há um
> arquivo de ícone separado para o tray: basta gerar os ícones acima.
