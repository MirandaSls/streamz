"use client";

import type { DragEvent, MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Lock,
  Megaphone,
  Plus,
  Settings,
  UserPlus,
  Volume2,
  VozTrancada,
} from "@/components/ui/icones";
import { Permission, type Channel } from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { useCan } from "@/stores/permissions";

/**
 * Os handlers de arrasto que o pai pendura na linha (canal ou cabeçalho).
 *
 * Quem guarda o que está sendo arrastado e para onde é a `ChannelSidebar` — a
 * ordem nova é lógica pura dela (`stores/channel-order`). Aqui só se repassa o
 * pacote para o elemento certo, tipado, sem `Record<string, unknown>`.
 */
export interface PropsDeArrasto {
  draggable: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

/**
 * Ícone do canal: voz, anúncio (somente leitura), privado ou texto.
 *
 * Cor por estado, não fixa: a família do botão de ícone medida no cartão
 * 0.4 (`--icon-muted` em repouso, `--icon-strong` selecionado —
 * `docs/referencias-discord/tokens/css-bruto/834050.a72484b38a3a361e.css`,
 * `.interactiveSelected__972a0 .linkButtonIcon__972a0{color:var(--icon-strong)}`
 * contra `.linkButtonIcon__972a0{color:var(--icon-muted)}` em repouso) é o
 * mesmo padrão do texto do canal (repouso apagado, selecionado forte). Aqui o
 * repouso usa `channels-default`, não `icon-muted` — é a cor **medida** do
 * nome de canal (ver `CabecalhoDeCategoria`), e ícone e texto do mesmo item
 * picam a mesma cor na captura.
 *
 * **Voz sem `CONNECT` mostra o cadeado** (`VozTrancada`,
 * `canais/voice-lock.svg`), igual ao canal de texto privado (`Lock`, pelo
 * campo `channel.private` — não há hoje uma segunda checagem de permissão
 * para texto, só o booleano do canal; voz não tem esse booleano, então é
 * `useCan` quem decide). O hook é chamado **antes** de qualquer retorno —
 * regra dos hooks — mesmo para canal de texto, onde o resultado não é usado;
 * o cálculo é o mesmo `useCan` barato que `podeGerenciarCanais` já paga por
 * linha em outros lugares da barra.
 */
export function ChannelIcon({ channel, ativo = false }: { channel: Channel; ativo?: boolean }) {
  const cls = `shrink-0 ${ativo ? "text-icon-strong" : "text-channels-default"}`;
  const podeConectar = useCan(Permission.CONNECT, channel.id);
  if (channel.type === "VOICE") {
    return podeConectar ? (
      <Volume2 size={20} className={cls} aria-hidden="true" />
    ) : (
      <VozTrancada size={20} className={cls} aria-hidden="true" />
    );
  }
  if (channel.type === "ANNOUNCEMENT" || channel.readOnly) {
    return <Megaphone size={20} className={cls} aria-hidden="true" />;
  }
  if (channel.private) return <Lock size={20} className={cls} aria-hidden="true" />;
  return <Hash size={20} className={cls} aria-hidden="true" />;
}

/**
 * Cabeçalho de categoria: nome + chevron (14px, caixa mista) e o "+" de criar
 * canal dentro dela.
 *
 * **O "+" não é de hover.** Medido na print `2026-09-03 201805`: o cursor está
 * sobre o canal "warframe" (os dois botões dele estão acesos) e mesmo assim os
 * três cabeçalhos mostram o "+". Ele era `opacity-0` aqui, e só aparecia quando
 * o ponteiro passava por cima do próprio cabeçalho.
 *
 * Medidas da mesma print (coluna de 294, 1:1 pelo `h-9` do canal, que lá mede
 * 36 exatos):
 *
 * | item | Discord | aqui |
 * |---|---|---|
 * | glifo do "+" | 12×12 | `Plus size={20}` → 11,7 (o quadro do ativo desenha 0,583 do tamanho) |
 * | centro do "+" | x=315,5 | x=318 — a mesma coluna da engrenagem do canal (`pr-1` + botão de 24), que na print está em 315,5 também |
 * | rótulo | começa em x=67 | `mx-2` + `pl-2.5` = 67 |
 * | altura da linha | 12 de conteúdo, centro 29 abaixo do canal anterior | `h-[22px]` com `mt-4` + 2 da linha de solta = 29 |
 * | próximo canal | 42 abaixo do canal anterior | 16+2+22+2 = 42 |
 *
 * **Revalidado na base de 16px (ADR-0009).** Antes o `<html>` media 15,5px e
 * todo valor em `rem` saía ~3% pequeno (§6.3 do PROCESSO); com a raiz em 16px
 * de verdade, `rem`×16 bate exato com o nominal — `pl-2.5` é 10px, `mx-2` é
 * 8px, `h-9` do canal é 36px — e nenhuma das medidas acima precisou mudar de
 * classe, só a conta que as explica deixou de ter arredondamento.
 *
 * **Correção da cor do rótulo:** a nota antiga dizia que a print media
 * (129,130,138) nos três — rótulo, "+"/engrenagem e nome de canal não lido —
 * e chamava isso de `text-text-muted` (`#96979e`). (129,130,138) é
 * `#81828a`, que é `--channels-default`, não `--text-muted`: a nota estava
 * errada sobre qual token bateu, não sobre a classe usada aqui. A classe
 * ficou `text-text-muted` porque a comparação mais recente (revisor visual,
 * print de Discord real) mede o cabeçalho de categoria em `~#a0a0a7`, e
 * `#96979e` (`--text-muted`) erra por ~9 por canal contra esse valor —
 * `#81828a` (`--channels-default`) erra por ~30. Diferença de anti-
 * serrilhado de fonte contra fundo escuro, não dois tokens distintos: fica
 * `text-text-muted`, sem trocar.
 */
export function CabecalhoDeCategoria({
  label,
  collapsed,
  onToggle,
  onCreate,
  onEdit,
  onContextMenu,
  arrasto,
  celular = false,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  onEdit?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  arrasto?: PropsDeArrasto;
  /**
   * No celular o cabeçalho é **caixa alta, com o chevron à esquerda** e sem
   * botão nenhum na linha — medido em `discord-mobile-servidor-2024.png`
   * ("FAVORITES", "CHAT", "COMMUNITY"). Criar canal e editar categoria moram no
   * menu do servidor e no toque longo; uma fileira de alvos de 22px ao lado do
   * rótulo não é tocável de qualquer modo.
   */
  celular?: boolean;
}) {
  return (
    /*
      O `group` existe só pela engrenagem, que é de hover (o "+" não é). Ele não
      mexe no hover dos canais: as regras `group-hover` deles estão na linha do
      canal, que é irmã deste cabeçalho e não descendente dele.
    */
    <div
      className={`group mx-2 flex items-center pr-1 ${celular ? "h-[36px]" : "h-[22px]"}`}
      onContextMenu={onContextMenu}
      {...arrasto}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        /*
          Fonte do corpo e peso médio, não a de display em negrito: medido, o
          Discord usa a mesma família do resto da coluna aqui. E o chevron vem
          **depois** do texto, não antes — o texto começa em x=100, alinhado com
          o nome do servidor acima e com o `#` dos canais abaixo. Com o chevron
          na frente, essa coluna de alinhamento se perdia.
        */
        className={`flex min-w-0 flex-1 items-center gap-1 pl-2.5 text-sm font-medium text-text-muted hover:text-text-default ${
          celular ? "gap-1.5 text-xs font-semibold uppercase tracking-wide" : ""
        }`}
      >
        {/* o chevron troca de lado no celular: na captura ele vem **antes** do
            rótulo, e o rótulo é caixa alta */}
        {celular &&
          (collapsed ? (
            <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
          ))}
        <span className="truncate">{label}</span>
        {!celular &&
          (collapsed ? (
            <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
          ))}
      </button>
      {/* A engrenagem da categoria abre o mesmo modal do item "Editar
          categoria" do menu de contexto. Ao contrário do "+", ela é de hover —
          as classes são as mesmas dos dois botões de hover do canal, para os
          três acenderem igual. Fica à esquerda do "+" para não mover o "+",
          cuja coluna (x=318) está medida na print. */}
      {onEdit && !celular && (
        <BotaoDeIcone
          rotulo="Editar categoria"
          icone={<Settings size={18} />}
          tamanho="sm"
          onClick={onEdit}
          aria-label={`Editar ${label}`}
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
      {onCreate && !celular && (
        <BotaoDeIcone
          rotulo="Criar canal"
          icone={<Plus size={20} />}
          tamanho="sm"
          onClick={onCreate}
          aria-label={`Criar canal em ${label}`}
          className="shrink-0"
        />
      )}
    </div>
  );
}

/**
 * Uma linha de canal **de texto** (inclui anúncio e privado; voz é o
 * `CanalDeVoz`, que tem lista de gente embaixo e cronômetro de chamada).
 *
 * Quem decide qual dos dois desenhar é a `ChannelSidebar`, pelo `type` — por
 * isso os ramos de voz que a linha tinha (o balão da conversa da call, o
 * cronômetro, o realce de quem arrasta um participante) não vêm para cá: eles
 * eram inalcançáveis num canal de texto (`podeSoltarEm` recusa alvo que não
 * seja `VOICE`, e `useVoice.channelId` nunca aponta para um canal de texto).
 * A linha em si não mudou de pixel nesta separação.
 *
 * O estado (ativo, não lido, silenciado, arrastando) chega pronto: a conta é do
 * pai, que é quem tem a store de notificação e o arrasto na mão.
 *
 * **Medidas da linha** (revisadas nesta onda, base de 16px — ADR-0009):
 *
 * | item | Discord | aqui |
 * |---|---|---|
 * | altura | 36, sem vão entre canais (a print `2026-09-03 201805` mostra a linha selecionada com 36px exatos de banda, coluna x=65: `227–262`) | `h-9` = 36px exato na base de 16 |
 * | ícone do canal | 20px | `size={20}` nos quatro ramos do `ChannelIcon` |
 * | vão ícone↔nome | 8px (`docs/referencias-discord/tokens/css-bruto/834050…css` `.link__972a0{gap:8px}`, e `d02d29b0b74f3e61.css` `.channelIcon__5c799{margin-inline-end:8px}` da prévia de canais do onboarding, que reusa os tokens do item de verdade) | era `gap-2.5` (10px), agora `gap-2` (8px) |
 * | cor em repouso | `--channels-default` | `text-channels-default` |
 * | cor selecionada | `--interactive-text-active` (mesmo hex de `--text-strong`, `#fbfbfb`, mas é o token de "item de lista selecionado" — `tokens/VARIAVEIS.md`) | era `text-text-strong`, agora `text-interactive-text-active` |
 * | cor no hover (lido) | `--interactive-text-hover` (`#fbfbfb`) — mais claro que `--text-default` (`#efeff1`), que é o token de texto de mensagem, não de item de lista | era `hover:text-text-default`, agora `hover:text-interactive-text-hover` |
 * | fundo hover / selecionado | `--interactive-background-hover` / `-selected` | `bg-interactive-background-hover` / `-selected` (sem mudança — já batia) |
 *
 * Não lido em repouso ficou em `text-text-strong`: não achei no CSS bruto uma
 * regra de "canal não lido" fora do ponto branco (medido) e do peso da fonte;
 * é o valor que já estava, mantido por não ter divergência medida contra ele.
 */
export function ItemDeCanal({
  channel,
  ativo,
  naoLido,
  silenciado,
  arrastando,
  podeGerenciarCanais,
  arrasto,
  aoAbrirMenu,
  aoSelecionar,
  aoConvidar,
  aoEditar,
}: {
  channel: Channel;
  ativo: boolean;
  naoLido: boolean;
  silenciado: boolean;
  arrastando: boolean;
  podeGerenciarCanais: boolean;
  arrasto: PropsDeArrasto;
  aoAbrirMenu: (e: MouseEvent) => void;
  aoSelecionar: () => void;
  aoConvidar: () => void;
  aoEditar: () => void;
}) {
  const name = channel.name ?? "canal";
  return (
    <div
      role="listitem"
      {...arrasto}
      onContextMenu={aoAbrirMenu}
      className={`group relative mx-2 flex h-9 items-center rounded-lg pl-[10px] pr-1 ${
        arrastando ? "opacity-40" : ""
      } ${
        ativo
          ? "bg-interactive-background-selected text-interactive-text-active"
          : naoLido
            ? "text-text-strong hover:bg-interactive-background-hover"
            : "text-channels-default hover:bg-interactive-background-hover hover:text-interactive-text-hover"
      } ${silenciado && !ativo ? "opacity-50" : ""}`}
    >
      {naoLido && (
        // ponto branco na margem esquerda, como o Discord marca canal não lido
        <span aria-hidden="true" className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-switch-thumb-background-default" />
      )}
      <button
        type="button"
        data-channel-button
        onClick={aoSelecionar}
        aria-current={ativo ? "true" : undefined}
        className={`flex h-full min-w-0 flex-1 items-center gap-2 text-left ${naoLido ? "font-semibold" : "font-medium"}`}
      >
        <ChannelIcon channel={channel} ativo={ativo} />
        <span className="truncate">{name}</span>
      </button>
      {channel.mentionCount > 0 && !ativo && (
        <span
          aria-label={`${channel.mentionCount} menções`}
          className="grid h-4 min-w-4 place-items-center rounded-full bg-status-danger px-1 text-[11px] font-bold leading-none text-control-critical-primary-text-default"
        >
          {channel.mentionCount}
        </span>
      )}

      {/* O hover do canal no Discord mostra DOIS botões: convite e editar.
          Ficam **fora do fluxo** (`absolute`): invisíveis eles ainda
          ocupavam 48px, e era isso que empurrava o cronômetro para longe
          da borda. Só aparecem no hover ou com foco de teclado. */}
      <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        <BotaoDeIcone
          rotulo="Criar convite"
          icone={<UserPlus size={18} />}
          tamanho="sm"
          onClick={aoConvidar}
          aria-label={`Criar convite para ${name}`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        />
        {podeGerenciarCanais && (
          <BotaoDeIcone
            rotulo="Editar canal"
            icone={<Settings size={18} />}
            tamanho="sm"
            onClick={aoEditar}
            aria-label={`Editar ${name}`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          />
        )}
      </span>
    </div>
  );
}
