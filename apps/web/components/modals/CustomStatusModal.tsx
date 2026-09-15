"use client";

import { useRef, useState } from "react";
import { ChevronDown, SmilePlus, X } from "@/components/ui/icones";
import {
  CUSTOM_STATUS_DURATIONS,
  MAX_CUSTOM_STATUS,
  type CustomStatusDuration,
  type UserStatus,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Select } from "@/components/ui/controls";
import { BotaoDeIcone, Campo, TextInput } from "@/components/ui/primitivos";
import Avatar from "@/components/ui/Avatar";
import EmojiPicker from "@/components/ui/EmojiPicker";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI, type MenuItem } from "@/stores/ui";

/**
 * "Definir status personalizado": emoji, texto, por quanto tempo vale e — na
 * versão medida (2025) do Discord — um seletor compacto de status embutido no
 * próprio campo, não mais um `<select>` "Online/Ausente/…" de rodapé.
 *
 * O prazo é escolhido aqui e calculado no servidor pela mesma função do
 * contrato (`customStatusExpiry`) — a tela e o banco concordam por construção.
 *
 * ## Redesenho (cartão 5c-status-personalizado)
 *
 * Medido em `docs/referencias-discord/tokens/css-bruto/sob-demanda/
 * 99d7da090ff5cf77.css`, módulo `_dbc4b7` (21 classes, o corpo inteiro deste
 * modal) — sem impressão 1:1 própria em `docs/Reference/` (procurada, não
 * encontrada: é modal aberto a partir do menu de status do rodapé, fora do
 * passeio automatizado). Autoridade, do mais forte ao mais fraco: 2 (CSS
 * medido, aqui) > 3 (o gif de 2023 do artigo de suporte, `01-02.gif` da mesma
 * pasta, que mostra um desenho MAIS ANTIGO — banner ilustrado e um `<select>`
 * "Status" de rodapé — descartado onde contradiz o CSS atual).
 *
 * - **Avatar de prévia** (`.profilePreview_dbc4b7{margin-top:8px;
 *   margin-bottom:36px}`, centralizado, `width:100%`): tamanho do avatar em si
 *   não sai desse arquivo (só a moldura) — `xl` (80px) é o maior degrau de
 *   `Avatar.tsx` fora do cartão de perfil completo (`xxl`, 120) — não medido,
 *   ver "nao_verificado" da entrega.
 * - **Campo de texto**: `.formGroup_dbc4b7{position:relative}` com o rótulo
 *   (`.customStatusInputTitle_dbc4b7{width:100%}`) e, ancorado no canto
 *   superior direito da MESMA linha (`.labelSelectorContainer_dbc4b7{position:
 *   absolute;inset-inline-end:0;top:-3px;flex-direction:row-reverse}`), o
 *   seletor compacto de status — é aqui, e não mais num `<select>` de rodapé,
 *   que o Discord deixa trocar Disponível/Ausente/Não perturbar/Invisível sem
 *   sair do modal. Reaproveita a MESMA lista e os MESMOS rótulos do seletor já
 *   medido em `ProfilePopover.tsx` (print `2026-09-03 180020`) — duplicados
 *   aqui porque nenhum dos dois arquivos os exporta e `ProfilePopover.tsx` não
 *   está na lista deste cartão.
 * - **Caixa do campo**: 46 de altura (`.emojiButton_dbc4b7`/`.clearButton_dbc4b7`
 *   `height:46px`), não os 40 do `TextInput` `md` — o cabeçalho do próprio
 *   `TextInput` já registra que este número É o desta tela específica e NÃO
 *   foi generalizado para o primitivo; por isso o `tamanho={46}` numérico
 *   (vira `style`, não classe) só aparece aqui. Botão de emoji 42×46,
 *   ícone 24 (`.emoji_dbc4b7{height:24px;width:24px}`); botão de limpar 40×46,
 *   ícone 16 (`.clearIcon_dbc4b7{height:16px;width:16px}`, cor
 *   `--interactive-text-default`, opacidade .6 → 1 no hover/foco — sem fundo
 *   em nenhum estado). `BotaoDeIcone` ganhou a família `fundo="nenhum-
 *   interativo"` nesta rodada — sem retângulo, tinta em `interactive-text-*`
 *   (repouso/hover/ativo) — exatamente o par que faltava: os dois botões usam
 *   ela agora; a opacidade .6→1 continua por `className`, à parte da família.
 * - **Raio**: `var(--radius-sm)` = 8px nos dois botões (`VARIAVEIS.md`) —
 *   `rounded-lg` no vocabulário deste app, o mesmo que o `tamanho="md"` do
 *   `BotaoDeIcone` já usa por padrão.
 */

/**
 * Rótulo do **meu** status, e a lista do seletor compacto — mesmos dados de
 * `ROTULO_DO_MEU_STATUS`/`OPCOES_DE_STATUS` em `ProfilePopover.tsx` (print
 * `2026-09-03 180020`), duplicados aqui: ver o porquê no cabeçalho do arquivo.
 * Sem `chevron`/`description`: lá o seletor é uma linha de 32px com submenu ao
 * lado; aqui é um botão pequeno que abre um menu embaixo — peça mais simples,
 * mesmo conteúdo.
 */
const ROTULO_DO_MEU_STATUS: Record<UserStatus, string> = {
  ONLINE: "Disponível",
  IDLE: "Ausente",
  DND: "Não perturbar",
  OFFLINE: "Invisível",
};

const OPCOES_DE_STATUS: { value: UserStatus | null; dot: UserStatus; label: string }[] = [
  { value: null, dot: "ONLINE", label: "Disponível" },
  { value: "IDLE", dot: "IDLE", label: "Ausente" },
  { value: "DND", dot: "DND", label: "Não perturbar" },
  { value: "OFFLINE", dot: "OFFLINE", label: "Invisível" },
];

/**
 * Largura do menu do seletor compacto: o padrão do `ContextMenu`
 * (`MENU_WIDTH`, 220) — não é o submenu de 300 do cartão de perfil (peça
 * maior, ancorada num cartão de 300 de largura); não há medida própria para
 * este seletor menor. Não verificado.
 */
const LARGURA_DO_SELETOR = 220;

/** Aplica o status escolhido — mesma chamada e mesmo tratamento de erro de `ProfilePopover.tsx`. */
async function aplicarStatus(value: UserStatus | null) {
  try {
    useAuth.getState().setUser(await api.updateStatus(value));
  } catch (e) {
    ui.toast(errorMessage(e, "Não foi possível mudar o status"), "error");
  }
}

export default function CustomStatusModal() {
  const closeModal = useUI((s) => s.closeModal);
  const me = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const statuses = usePresence((s) => s.statuses);

  const [emoji, setEmoji] = useState<string | null>(me?.customStatusEmoji ?? null);
  const [text, setText] = useState(me?.customStatusText ?? "");
  const [duration, setDuration] = useState<CustomStatusDuration>("never");
  const [escolhendo, setEscolhendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const seletorRef = useRef<HTMLButtonElement>(null);

  // "Sem permissão": não existe aqui — status personalizado é sempre sobre a
  // própria conta, sem bit de `computePermissions` nenhum de por meio. O único
  // jeito de a tela abrir sem conta válida é a sessão cair com o modal já
  // montado (`me` vira null no meio); sem usuário não há o que editar, então a
  // caixa se fecha sozinha em vez de renderizar um formulário quebrado.
  if (!me) {
    closeModal();
    return null;
  }

  const tinha = Boolean(me.customStatusText || me.customStatusEmoji);
  const meuStatus = resolveStatus(statuses, me);

  function abrirSeletorDeStatus() {
    const r = seletorRef.current?.getBoundingClientRect();
    if (!r) return;
    ui.openContextMenu(
      r.left,
      r.bottom + 4,
      OPCOES_DE_STATUS.map<MenuItem>((o) => ({
        label: o.label,
        forte: true,
        icon: (
          <span className="block h-2.5 w-2.5">
            <IconeDeStatus status={o.dot} className="h-full w-full" />
          </span>
        ),
        onSelect: () => void aplicarStatus(o.value),
      })),
      LARGURA_DO_SELETOR,
    );
  }

  async function salvar(limpar = false) {
    if (salvando) return;
    setErro(null);
    setSalvando(true);
    try {
      setUser(
        await api.updateCustomStatus({
          text: limpar ? null : text.trim() || null,
          emoji: limpar ? null : emoji,
          duration: limpar ? "never" : duration,
        }),
      );
      closeModal();
    } catch (e) {
      const mensagem = errorMessage(e, "Não foi possível salvar o status");
      setErro(mensagem);
      ui.toast(mensagem, "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      title="Definir um status personalizado"
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
          {/* "Limpar" é destrutivo e fica isolado à esquerda: entre os outros
              dois ele viraria mais um botão de confirmação */}
          {tinha && (
            <button
              type="button"
              disabled={salvando}
              onClick={() => void salvar(true)}
              className="mr-auto h-[38px] rounded-[3px] px-2 text-text-sm font-medium text-status-danger transition hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              Limpar status
            </button>
          )}
        </>
      }
    >
      {/* Avatar de prévia — `.profilePreview_dbc4b7`: centralizado, 8 acima, 36
          abaixo. Tamanho não medido (ver cabeçalho do arquivo). `surface`: o
          selo de status precisa da cor do fundo onde o avatar pousa, que aqui
          é o corpo do `Dialog` (`--background-surface-high`). */}
      <div className="mb-9 mt-2 flex w-full items-center justify-center">
        <Avatar user={me} size="xl" status={meuStatus} surface="border-background-surface-high" />
      </div>

      <Campo
        htmlFor="statusText"
        rotulo={
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate">O que está pegando, {me.username}?</span>
            {/* Seletor compacto de status — `.labelSelectorContainer_dbc4b7`,
                canto superior direito do `.formGroup`. Abre embaixo (não ao
                lado, como o submenu do cartão de perfil): é um botão pequeno,
                não uma linha de 32px com espaço para um painel encostado. */}
            <button
              ref={seletorRef}
              type="button"
              disabled={salvando}
              onClick={abrirSeletorDeStatus}
              aria-haspopup="menu"
              className="-mt-[3px] flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-text-sm font-normal text-text-muted transition hover:text-text-default disabled:pointer-events-none disabled:opacity-50"
            >
              <IconeDeStatus status={meuStatus} className="h-2.5 w-2.5" />
              {ROTULO_DO_MEU_STATUS[meuStatus]}
              <ChevronDown size={12} />
            </button>
          </span>
        }
        erro={erro}
      >
        <div className="relative">
          <TextInput
            id="statusText"
            tamanho={46}
            disabled={salvando}
            erro={Boolean(erro)}
            value={text}
            maxLength={MAX_CUSTOM_STATUS}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void salvar();
              }
            }}
            placeholder="Nenhum status definido"
            prefixo={
              <BotaoDeIcone
                rotulo="Escolher emoji do status"
                icone={emoji ? <span className="text-xl leading-none">{emoji}</span> : <SmilePlus size={24} />}
                tamanhoDoIcone={24}
                // 42×46 fixo por `style` (não classe: `tamanho` numérico do
                // primitivo já usa essa via, e 46 ≥ 44 já cobre o piso de
                // toque do celular — sem precisar de variante `celular:`,
                // que o `style` inline venceria de qualquer jeito).
                style={{ width: 42, height: 46 }}
                fundo="nenhum-interativo"
                disabled={salvando}
                className={emoji ? "" : "opacity-60 hover:opacity-100 focus-visible:opacity-100"}
                onClick={() => setEscolhendo((v) => !v)}
              />
            }
            sufixo={
              emoji ? (
                <BotaoDeIcone
                  rotulo="Remover emoji"
                  icone={<X size={16} />}
                  tamanhoDoIcone={16}
                  style={{ width: 40, height: 46 }}
                  fundo="nenhum-interativo"
                  disabled={salvando}
                  className="opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setEmoji(null)}
                />
              ) : undefined
            }
          />
          {escolhendo && (
            <EmojiPicker
              className="absolute left-0 top-[50px] z-10"
              onClose={() => setEscolhendo(false)}
              onPick={(e) => {
                setEmoji(e);
                setEscolhendo(false);
              }}
            />
          )}
        </div>
      </Campo>
      <p
        className={`mt-1 text-text-xs ${
          text.length >= MAX_CUSTOM_STATUS ? "text-text-feedback-critical" : "text-text-muted"
        }`}
      >
        {text.length}/{MAX_CUSTOM_STATUS}
      </p>

      <div className="mt-5">
        {/* do prazo mais longo para o mais curto, como no Discord ("Hoje"
            antes de "1 hora"); a ordem do contrato é a inversa */}
        <Select
          semDivisoria
          label="Limpar depois de"
          value={duration}
          disabled={salvando}
          options={[...CUSTOM_STATUS_DURATIONS]
            .reverse()
            .map((d) => ({ value: d.value, label: d.label }))}
          onChange={(v) => setDuration(v as CustomStatusDuration)}
        />
      </div>
    </Dialog>
  );
}
