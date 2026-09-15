"use client";

import { formatShortcut } from "@/lib/shortcuts";

/**
 * O "capuz de tecla" do Discord, num lugar só. Antes estava copiado em
 * `settings/TecladoTab.tsx` (a página "Teclado" das configurações) e em
 * `chat/AtalhosDoTeclado.tsx` (a grade do Ctrl+/) — as duas cópias com a mesma
 * origem e prontas para envelhecer separadas.
 *
 * Medido em `.key__61c93`/`.key_db8087` (`css-bruto/sob-demanda/
 * 8246233d6a1c5b37.css`, a página "Keybinds"; o modal de atalhos do Discord usa
 * o mesmo capuz, o CSS não separa os dois):
 * - fundo `--background-mod-muted`, borda `--border-subtle` 1px, raio 4px
 *   (`rounded`);
 * - altura **23px**, `padding:3px 6px 4px`;
 * - texto **12px semibold maiúsculo** em `--interactive-text-active`;
 * - relevo de tecla física: `box-shadow:inset 0 -4px 0 var(--background-mod-muted)`.
 *
 * `leading-none` porque a altura já é fixada pelo `h-[23px]` — uma linha alta
 * demais quebraria o relevo da caixa.
 */
export const TECLA =
  "flex h-[23px] min-w-[14px] items-center justify-center rounded border border-border-subtle bg-background-mod-muted px-[6px] pb-1 pt-[3px] text-text-xs font-semibold uppercase leading-none text-interactive-text-active shadow-[inset_0_-4px_0_var(--background-mod-muted)]";

/**
 * Uma combinação ("Ctrl + Shift + M") como fileira de capuzes, **3px** entre
 * si (`margin-inline-end:3px` do mesmo CSS). `texto` é o formato cru do
 * registro de `lib/shortcuts` ("mod+shift+m"); o `formatShortcut` traduz para
 * o rótulo da plataforma.
 */
export function Combo({ texto }: { texto: string }) {
  const teclas = formatShortcut(texto).split(" + ");
  return (
    <span className="flex items-center gap-[3px]">
      {teclas.map((tecla, i) => (
        <span key={i} className={TECLA}>
          {tecla}
        </span>
      ))}
    </span>
  );
}
