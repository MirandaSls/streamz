"use client";

import type { MouseEvent } from "react";
import { MessageSquare, Settings, UserPlus, Volume2 } from "@/components/ui/icones";
import type { Channel } from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import Cronometro from "@/components/voice/Cronometro";
import VoiceChannelMembers from "@/components/voice/VoiceChannelMembers";
import { preaquecerCadeiaDeVoz } from "@/stores/voice";
import type { PropsDeArrasto } from "@/components/layout/sidebar/CategoriaEItemDeCanal";

/**
 * Uma linha de canal **de voz**, com quem está dentro logo abaixo.
 *
 * É a irmã do `ItemDeCanal` e não a mesma peça, porque três coisas só existem
 * aqui e as duas linhas são redesenhadas em cartões diferentes: o balão que
 * abre a conversa da call, o cronômetro de quem está conectado neste canal e o
 * realce de "solte a pessoa aqui". A linha em si (altura, recuo, cores, botões
 * de hover) é a mesma da de texto, copiada sem mudar um pixel nesta separação —
 * se as duas divergirem, é porque a medida do Discord diverge.
 *
 * O estado (ativo, não lido, silenciado, arrastando, conectado) chega pronto do
 * pai, que é quem tem a store de notificação, a de voz e o arrasto na mão.
 */
export function CanalDeVoz({
  channel,
  ativo,
  naoLido,
  silenciado,
  arrastando,
  alvoDeMembro,
  conectado,
  vozDesde,
  podeGerenciarCanais,
  podeMoverMembros,
  arrasto,
  aoAbrirMenu,
  aoEntrar,
  aoAbrirConversa,
  aoConvidar,
  aoEditar,
  aoArrastarMembro,
  aoFimDoArrasto,
}: {
  channel: Channel;
  ativo: boolean;
  naoLido: boolean;
  silenciado: boolean;
  arrastando: boolean;
  /** alvo do arrasto de um participante: realce no canal inteiro. */
  alvoDeMembro: boolean;
  /** estou na chamada **deste** canal. */
  conectado: boolean;
  /** desde quando estou na chamada, para o cronômetro (`null` = fora). */
  vozDesde: number | null;
  podeGerenciarCanais: boolean;
  /** `MOVE_MEMBERS`: sem ela o participante não é arrastável. */
  podeMoverMembros: boolean;
  arrasto: PropsDeArrasto;
  aoAbrirMenu: (e: MouseEvent) => void;
  aoEntrar: () => void;
  aoAbrirConversa: () => void;
  aoConvidar: () => void;
  aoEditar: () => void;
  aoArrastarMembro: (userId: string) => void;
  aoFimDoArrasto: () => void;
}) {
  const name = channel.name ?? "canal";
  return (
    <>
      <div
        role="listitem"
        {...arrasto}
        onContextMenu={aoAbrirMenu}
        className={`group relative mx-2 flex h-9 items-center rounded-lg pl-[10px] pr-1 ${
          arrastando ? "opacity-40" : ""
        } ${alvoDeMembro ? "bg-interactive-background-hover ring-2 ring-inset ring-brand-500" : ""} ${
          ativo
            ? "bg-interactive-background-selected text-text-strong"
            : naoLido
              ? "text-text-strong hover:bg-interactive-background-hover"
              : "text-channels-default hover:bg-interactive-background-hover hover:text-text-default"
        } ${silenciado && !ativo ? "opacity-50" : ""}`}
      >
        {naoLido && (
          // ponto branco na margem esquerda, como o Discord marca canal não lido
          <span aria-hidden="true" className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-switch-thumb-background-default" />
        )}
        <button
          type="button"
          data-channel-button
          // `"clique"`: num canal de VOZ isto **entra na chamada**, sem
          // antessala nem prompt (ver `stores/voice-entrada.ts`)
          onClick={aoEntrar}
          // passar o mouse por um canal de voz é o aviso mais barato de que o
          // clique pode vir: aproveita para pagar o chunk e o `.wasm` da
          // supressão avançada antes da hora (ver `preaquecerCadeiaDeVoz`,
          // que não faz nada para quem não a escolheu)
          onPointerEnter={preaquecerCadeiaDeVoz}
          aria-current={ativo ? "true" : undefined}
          className={`flex h-full min-w-0 flex-1 items-center gap-2.5 text-left ${naoLido ? "font-semibold" : "font-medium"}`}
        >
          {/* Conectado = ícone verde (`--icon-feedback-positive` #5eb479, medido
              em 101842.png linha y=368 x=102–109): é o único sinal de "você está
              aqui" no ícone — o Discord não pinta o nome do canal (medido na
              mesma linha, x=161 y=368–372: #fbfbed, branco, igual a qualquer
              canal ativo). Fora da chamada o ícone continua neutro. */}
          <Volume2
            size={20}
            className={`shrink-0 ${conectado ? "text-icon-feedback-positive" : "text-channels-default"}`}
            aria-hidden="true"
          />
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
        {/* Cronômetro da call: alinhado à direita, a 10px da borda da linha,
            como no Discord. Some no hover, que é quando os dois botões do
            canal tomam o lugar dele. */}
        {conectado && vozDesde !== null && (
          <Cronometro
            desde={vozDesde}
            // mesmo verde do ícone (`--text-feedback-positive`, igual a
            // `--icon-feedback-positive`, #5eb479): medido no "0:00" da
            // 101842.png, linha y=368 x=320–356 — os traços cheios saem
            // #3eaf5c/#43b45c, a mesma tinta sobre o fundo #121214.
            // `text-status-positive` (#3d9e60) é outro token, de outro
            // contexto (bolinha "Disponível"): próximo, mas não é este.
            className="ml-auto mr-1.5 shrink-0 text-xs text-text-feedback-positive group-hover:hidden"
          />
        )}

        {/* O hover do canal no Discord mostra DOIS botões: convite e editar.
            Ficam **fora do fluxo** (`absolute`): invisíveis eles ainda
            ocupavam 48px, e era isso que empurrava o cronômetro para longe
            da borda. Só aparecem no hover ou com foco de teclado. */}
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {/* O balão do canal de VOZ, que a print `image (1).png` mostra à
              esquerda do convite e da engrenagem: ele abre a conversa **da
              call** (a coluna de 450 da direita, ver `PainelDeChatDaCall`).
              Só existe em canal de voz — no de texto a conversa é a própria
              coluna, e o botão não teria o que abrir. */}
          <BotaoDeIcone
            rotulo="Abrir conversa"
            icone={<MessageSquare size={18} />}
            tamanho="sm"
            onClick={aoAbrirConversa}
            aria-label={`Abrir a conversa de ${name}`}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          />
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
      <VoiceChannelMembers
        channelId={channel.id}
        guildId={channel.guildId}
        podeMover={podeMoverMembros}
        onArrastarMembro={aoArrastarMembro}
        onFimDoArrasto={aoFimDoArrasto}
      />
    </>
  );
}
