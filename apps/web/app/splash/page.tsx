import type { Metadata } from "next";
import JanelaSplash from "@/components/desktop/JanelaSplash";

/**
 * A rota da janelinha do desktop (`out/splash/index.html` no export estático).
 *
 * Ela existe só para o app de desktop: o `tauri.conf.json` aponta a janela
 * `splash` para `splash/` — com `trailingSlash: true` o export gera
 * `out/splash/index.html`, e o protocolo de asset do Tauri resolve
 * `/splash/` → `splash/index.html` (`get_asset` tira a barra final e tenta
 * `<caminho>/index.html`). A mesma URL funciona no `tauri dev`, onde quem serve
 * é o `next dev` em `localhost:3000`.
 *
 * Aberta num navegador, é um cartão parado: sem Tauri não há o que atualizar.
 * Nada daqui entra no bundle do resto do site — é uma rota própria, e o único
 * peso é o símbolo animado.
 */
export const metadata: Metadata = { title: "Streamz" };

export default function PaginaDaSplash() {
  return <JanelaSplash />;
}
