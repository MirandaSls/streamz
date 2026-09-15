"use client";

import { useState } from "react";
import { Keyboard, RotateCcw } from "@/components/ui/icones";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import { Combo } from "@/components/ui/Tecla";
import { atalhosEfetivos, conflitoDe, useAtalhos } from "@/stores/atalhos";
import { useT, type ChaveDeTexto } from "@/lib/i18n";
import { formatShortcut, shortcutFromEvent, type ShortcutAction } from "@/lib/shortcuts";
import { ui } from "@/stores/ui";

/**
 * Aba "Teclado": a lista dos atalhos, gerada do mesmo registro
 * (`lib/shortcuts`) que `useKeyboardShortcuts` e `VoiceHotkeys` executam, agora
 * **regravável**.
 *
 * Uma fonte só evita o problema clássico desta tela: documentação que continua
 * anunciando um atalho que alguém já mudou. A regravação só sobrescreve a
 * combinação de uma ação — a lista, a ordem e os rótulos continuam vindo do
 * registro. Regravar/restaurar/rebindar é funcionalidade nossa (o Discord não
 * deixa o usuário reconfigurar os atalhos gerais do app, só os de overlay de
 * jogo) — mantida, só com o vocabulário visual do Discord.
 *
 * Redesenho (cartão 6k-teclado-idioma), medido em
 * `docs/referencias-discord/tokens/css-bruto/sob-demanda/
 * 8246233d6a1c5b37.css` (a página "Keybinds" de Configurações do app,
 * classes `defaultKeybind*`) e `.../7a89de758a772c46.css` (a caixa que grava
 * uma combinação nova, `.recorderContainer__2636e`):
 *
 * - **Cartão da lista** = `.defaultKeybindGroup_f82450`: fundo
 *   `--background-surface-higher`, borda `--border-muted`, raio
 *   `--radius-md` (`rounded-md`, 6px na nossa escala), `gap:16px` entre
 *   linhas, `padding:16px 0`. **Sem** linha divisória entre atalhos — antes
 *   deste cartão cada `<li>` tinha `border-b border-border-subtle`, sem
 *   origem nenhuma medida.
 * - **Cada linha** = `.defaultKeybind_f82450`: grade `1fr auto`, padding
 *   horizontal 16px, rótulo em `--font-weight-medium`.
 * - **Cada tecla** = `.key__61c93`/`.key_db8087` (o mesmo "capuz de tecla" do
 *   modal de atalhos do Discord e do combo de clipe, repetido em vários
 *   arquivos): fundo `--background-mod-muted`, borda `--border-subtle` 1px,
 *   `border-radius:4px` (`rounded`), altura **23px**, `padding:3px 6px 4px`,
 *   texto **12px semibold maiúsculo** (`--interactive-text-active`), com
 *   relevo de tecla física (`box-shadow:inset 0 -4px 0
 *   var(--background-mod-muted)`). Teclas da mesma combinação com **3px**
 *   entre si (`margin-inline-end:3px`); combinações alternativas (`zoomMais`
 *   tem duas: Ctrl+= e Ctrl+Shift+=) empilhadas com **4px**
 *   (`.defaultKeybindShortcutGroup_f82450{grid-gap:4px}`). Antes deste
 *   cartão era um único `<kbd>` com a combinação inteira escrita num texto só
 *   (`bg-input-background-default`, sem relevo) — o token de fundo era o de
 *   campo de texto, não o de tecla, e as teclas não eram separadas.
 * - **Gravando** = `.recorderContainer__2636e.recording__2636e`: a aba usava
 *   um `Button` `variante="primario"` (limão) para este estado; o Discord usa
 *   a própria caixa da combinação em **vermelho pulsante**
 *   (`border-color`/`color` em vermelho de aviso, fundo do mesmo vermelho a
 *   8%, sombra pulsando 6px→10px→6px em 1s). Portado com
 *   `border-feedback-critical`/`text-feedback-critical`/
 *   `background-feedback-critical` — os tokens do Discord para esse mesmo
 *   vermelho. A pulsação de sombra é o `shadowPulse__2636e` portado como
 *   `.anim-gravando-atalho` em `app/globals.css` (sombra, não opacidade: o
 *   `animate-pulse` do Tailwind que estava aqui apagava o texto junto).
 *   Foco/hover fora da gravação, medidos: `border-color:var(--border-strong)`
 *   — o valor de *repouso* do `recorderContainer` não aparece neste arquivo
 *   (só hover/foco/gravando), então o repouso usa `border-border-subtle`, a
 *   borda padrão de controle do resto do app.
 * - **As outras linhas desabilitam enquanto uma grava**: comportamento do
 *   próprio Discord ("Keybinds are disabled while this panel is visible",
 *   `docs/referencias-discord/suporte/imagens/discord-basics/
 *   217083547-how-do-i-add-different-keybinds/02.jpg" — captura de um
 *   cliente antigo, então é aproximação de comportamento, não de pixel; ver
 *   "nao_verificado"). Evita regravar duas linhas ao mesmo tempo e criar dois
 *   `capturar` ouvindo o teclado juntos.
 */

export default function TecladoTab() {
  const t = useT();
  const regravados = useAtalhos((s) => s.regravados);
  const regravar = useAtalhos((s) => s.regravar);
  const restaurar = useAtalhos((s) => s.restaurar);
  const restaurarTudo = useAtalhos((s) => s.restaurarTudo);
  const [gravando, setGravando] = useState<ShortcutAction | null>(null);

  // `atalhosEfetivos([])` nunca é vazio (o registro de `lib/shortcuts` é
  // estático, 17 ações) — não existe "vazio" real para cobrir aqui, e um
  // texto de lista-vazia morto no bundle seria funcionalidade que a tela não
  // tem motivo pra ter. Ver "nao_verificado".
  const specs = atalhosEfetivos(regravados);

  function capturar(e: React.KeyboardEvent, action: ShortcutAction) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setGravando(null);
      return;
    }
    const combo = shortcutFromEvent(e);
    // só modificador ainda não é atalho: seguir ouvindo até vir uma tecla
    if (!combo) return;
    const conflito = conflitoDe(combo, action, regravados);
    if (conflito) {
      ui.toast(
        `${formatShortcut(combo)} já é "${t(conflito.label as ChaveDeTexto)}".`,
        "error",
      );
      return;
    }
    regravar(action, combo);
    setGravando(null);
  }

  return (
    <>
      <p className="mb-3 text-text-sm text-text-muted">{t("teclado.intro")}</p>

      <div className="flex flex-col gap-4 rounded-md border border-border-muted bg-background-surface-higher py-4">
        {specs.map((spec) => {
          const emGravacao = gravando === spec.action;
          const outraGravando = gravando !== null && !emGravacao;
          const alterado = spec.action in regravados;
          const rotulo = t(spec.label as ChaveDeTexto);
          return (
            <div key={spec.action} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4">
              <span className="min-w-0 truncate text-text-md font-medium text-text-default">
                {rotulo}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 justify-self-end">
                {emGravacao ? (
                  <button
                    type="button"
                    autoFocus
                    onKeyDown={(e) => capturar(e, spec.action)}
                    onBlur={() => setGravando(null)}
                    aria-label={`Gravando atalho de ${rotulo}`}
                    className="anim-gravando-atalho flex h-[23px] items-center gap-1.5 rounded border border-border-feedback-critical bg-background-feedback-critical px-2 text-text-xs font-semibold text-text-feedback-critical outline-none celular:h-[44px]"
                  >
                    <Keyboard size={14} aria-hidden="true" />
                    Aperte a combinação (Esc cancela)
                  </button>
                ) : (
                  <>
                    <span className="flex flex-col items-end gap-1">
                      {spec.combos.map((combo) => (
                        <Combo key={combo} texto={combo} />
                      ))}
                    </span>
                    <BotaoDeIcone
                      rotulo={`Regravar o atalho de ${rotulo}`}
                      onClick={() => setGravando(spec.action)}
                      tamanho="sm"
                      icone={<Keyboard size={16} />}
                      desabilitado={outraGravando}
                      motivoDesabilitado="Termine a gravação em andamento primeiro"
                      className="celular:h-[44px] celular:w-[44px]"
                    />
                    {alterado && (
                      <BotaoDeIcone
                        rotulo={`Voltar ao atalho padrão de ${rotulo}`}
                        onClick={() => restaurar(spec.action)}
                        tamanho="sm"
                        icone={<RotateCcw size={14} />}
                        desabilitado={outraGravando}
                        motivoDesabilitado="Termine a gravação em andamento primeiro"
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {Object.keys(regravados).length > 0 && (
        <Button
          variante="secundario"
          tamanho="sm"
          onClick={() => restaurarTudo()}
          disabled={gravando !== null}
          className="mt-4 celular:h-[44px]"
        >
          {t("config.restaurar")}
        </Button>
      )}
    </>
  );
}
