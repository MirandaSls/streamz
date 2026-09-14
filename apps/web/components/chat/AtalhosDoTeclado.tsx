"use client";

import { Modal } from "@/components/ui/primitivos";
import {
  Keyboard,
  MessageSquare,
  Mic,
  Paperclip,
  Pin,
  Search,
  Settings,
  Smile,
  Sticker,
  Users,
  type Icone,
} from "@/components/ui/icones";
import { atalhosEfetivos, useAtalhos } from "@/stores/atalhos";
import { useT, type ChaveDeTexto } from "@/lib/i18n";
import { formatShortcut, type ShortcutAction, type ShortcutSpec } from "@/lib/shortcuts";
import { useUI } from "@/stores/ui";

/**
 * Overlay de "Ctrl + /" — a grade de atalhos do Discord, como no cartão
 * "Keyboard Combos" dele.
 *
 * **Origem.** Não há print 1:1 nosso desta tela (ela nem existe no app ainda:
 * o `mostrarAtalhos` de hoje abre Configurações → Teclado, não este cartão) e
 * o CSS bruto medido é o da página de Configurações (`TecladoTab`), não desta
 * grade — a régua de autoridade (ADR-0009 §7) desce então para a **imagem de
 * catálogo**, que aqui não é um print estático mas um **GIF gravado pelo
 * próprio blog do Discord**: `docs/referencias-discord/blog/imagens/
 * 2024-11-how-to-use-keyboard-shortcuts-on-discord-create/
 * 04-referencia-de-atalhos-de-teclado.gif`. Sem `ffmpeg`/Pillow no sandbox
 * (só `python3` sem instalar nada), os quadros saíram de um decodificador
 * GIF89a escrito para este cartão (LZW + composição de quadros; script
 * descartado, não faz parte do app) — daí os rótulos e as combinações abaixo
 * virem de leitura de tela, quadro a quadro, e não de medida de pixel. Escala
 * "não medida": os cartões usam o token mais próximo (§6.6 do PROCESSO), não
 * um número do catálogo.
 *
 * **Correção Ctrl+U → Ctrl+Shift+U.** O cartão que pediu este arquivo listava
 * "Ctrl+U anexar", mas o quadro do próprio Discord mostra "Toggle channel
 * member list or voice text chat: CMD U" e, na mesma grade, "Upload a file:
 * CMD SHIFT U" — são duas ações diferentes. `lib/shortcuts.ts` ganhou as duas
 * (`alternarMembros` em Ctrl+U, `anexar` em Ctrl+Shift+U); ver "medidas" no
 * retorno do cartão.
 *
 * **Categorias.** O Discord agrupa a grade em Messages/Navigation/Voice and
 * Video/Chat/Miscellaneous. "Messages" (editar, apagar, fixar, reagir,
 * responder por tecla única) é o modo de navegação por teclado com anel de
 * foco na mensagem — o Streamz não tem esse modo ainda (as mesmas ações
 * existem, mas só pela barra que aparece no hover/clique, nunca por tecla
 * solta com o foco na mensagem), então a categoria não entra aqui: inventá-la
 * seria mostrar tecla que não faz nada (§6.6 do PROCESSO). As outras quatro
 * batem com o que `lib/shortcuts.ts` cobre, com duas trocas medidas no quadro:
 * "Mark channel/server read" mora em "Chat" no Discord (não em "Navigation"),
 * e "Search" mora em "Miscellaneous" (não em "Chat") — os dois já saíram
 * assim abaixo.
 *
 * **Sem estado de carregar/erro/permissão.** O registro (`SHORTCUTS`) é
 * estático e não pede rede nem cargo — o próprio Discord mostra a mesma grade
 * fixa para qualquer conta. O único estado real é o vazio por categoria (uma
 * categoria pode ficar sem nenhuma ação se `lib/shortcuts.ts` perder as
 * últimas dela) e o hover/foco do × do `Modal`, que já vêm de lá.
 *
 * **Como abrir.** Este componente não está montado em nenhuma tela — pede
 * `app/app/page.tsx` (fora da lista deste cartão) e a troca do que
 * `hooks/useKeyboardShortcuts` faz hoje com `mostrarAtalhos` (abre
 * Configurações → Teclado). Ver "faltando" no retorno do cartão pelas linhas
 * exatas.
 */

/**
 * Tecla ("Ctrl", "Shift", "M"…) no mesmo capuz medido de `TecladoTab.tsx`
 * (`.key__61c93`/`.key_db8087` do CSS bruto da página "Keybinds" — fundo
 * `--background-mod-muted`, borda `--border-subtle`, `radius:4px`, 23px de
 * altura, 12px semibold maiúsculo, relevo `shadow-[inset_0_-4px_0_…]`). É o
 * mesmo capuz de tecla do modal de atalhos do Discord (o CSS não separa os
 * dois), por isso repete aqui em vez de importar de `TecladoTab` — aquele
 * arquivo não exporta a peça, e não está na lista deste cartão. Repetição
 * pequena e com a mesma origem; ver "faltando" (extrair um componente
 * compartilhado).
 */
const TECLA =
  "flex h-[23px] min-w-[14px] items-center justify-center rounded border border-border-subtle bg-background-mod-muted px-[6px] pb-1 pt-[3px] text-text-xs font-semibold uppercase leading-none text-interactive-text-active shadow-[inset_0_-4px_0_var(--background-mod-muted)]";

/** Uma combinação como fileira de capuzes de tecla, 3px entre si (mesma medida de `TecladoTab`). */
function Combo({ texto }: { texto: string }) {
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

/** Categoria → ícone da grade (só decoração; o rótulo de cada cartão já diz a ação). */
interface Categoria {
  titulo: string;
  icone: Icone;
  acoes: ShortcutAction[];
}

/**
 * Agrupamento da grade, na ordem do Discord (ver o cabeçalho do arquivo pelas
 * duas trocas medidas — "marcar como lido" em Chat, "busca" em Diversos — e
 * por que "Messages" não existe aqui).
 */
const CATEGORIAS: Categoria[] = [
  {
    titulo: "Navegação",
    icone: Search,
    acoes: [
      "quickSwitcher",
      "canalAnterior",
      "canalProximo",
      "naoLidoAnterior",
      "naoLidoProximo",
      "servidorAnterior",
      "servidorProximo",
    ],
  },
  {
    titulo: "Voz e vídeo",
    icone: Mic,
    acoes: ["alternarMudo", "alternarSurdo"],
  },
  {
    titulo: "Chat",
    icone: MessageSquare,
    acoes: [
      "caixaDeEntrada",
      "fixadas",
      "alternarMembros",
      "emoji",
      "gif",
      "figurinha",
      "anexar",
      "marcarLido",
      "marcarServidorLido",
    ],
  },
  {
    titulo: "Diversos",
    icone: Settings,
    acoes: ["busca", "configuracoes", "mostrarAtalhos", "zoomMais", "zoomMenos", "zoomPadrao"],
  },
];

/** Ícone de destaque à esquerda de cada cartão — só os que têm um óbvio; o resto usa o da categoria. */
const ICONE_DA_ACAO: Partial<Record<ShortcutAction, Icone>> = {
  busca: Search,
  fixadas: Pin,
  alternarMembros: Users,
  anexar: Paperclip,
  emoji: Smile,
  figurinha: Sticker,
  mostrarAtalhos: Keyboard,
};

export default function AtalhosDoTeclado() {
  const closeModal = useUI((s) => s.closeModal);
  const t = useT();
  const regravados = useAtalhos((s) => s.regravados);
  const specs = atalhosEfetivos(regravados);
  const porAcao = new Map<ShortcutAction, ShortcutSpec>(specs.map((s) => [s.action, s]));
  const mostrarAtalhos = porAcao.get("mostrarAtalhos");

  return (
    <Modal
      aoFechar={closeModal}
      titulo={
        <span className="flex items-center gap-2">
          Combinações de teclado
          {mostrarAtalhos && <Combo texto={mostrarAtalhos.combos[0]} />}
        </span>
      }
      subtitulo="Estes atalhos valem em qualquer tela do app."
      tamanho="grande"
      classeDoCorpo="flex flex-col gap-6"
    >
      {CATEGORIAS.map((categoria) => {
        const itens = categoria.acoes
          .map((acao) => porAcao.get(acao))
          .filter((spec): spec is ShortcutSpec => spec !== undefined);
        // categoria sem nenhuma ação (registro mudou): nada para desenhar, e
        // nada de deixar um título solto sem cartão embaixo dele.
        if (itens.length === 0) return null;

        return (
          <section key={categoria.titulo}>
            <h2 className="mb-3 flex items-center gap-2 text-heading-sm font-semibold text-text-strong">
              <categoria.icone size={16} aria-hidden="true" className="text-text-muted" />
              {categoria.titulo}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {itens.map((spec) => {
                const IconeDoCartao = ICONE_DA_ACAO[spec.action] ?? categoria.icone;
                return (
                  <div
                    key={spec.action}
                    className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-background-surface-higher p-3"
                  >
                    <span className="flex items-center gap-1.5 text-text-sm text-text-default">
                      <IconeDoCartao size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
                      <span className="truncate">{t(spec.label as ChaveDeTexto)}</span>
                    </span>
                    <span className="flex flex-col gap-1">
                      {spec.combos.map((combo) => (
                        <Combo key={combo} texto={combo} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </Modal>
  );
}
