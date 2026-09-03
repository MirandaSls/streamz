"use client";

import { useRef, useState } from "react";
import { ChevronDown, Headphones, HeadphoneOff, Mic, MicOff, Settings } from "@/components/ui/icones";
import { customStatusOf, displayNameOf } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import Tooltip from "@/components/ui/Tooltip";
import VoiceConnectedBar from "@/components/voice/VoiceConnectedBar";
import { MenuDeEntrada, MenuDeSaida } from "@/components/voice/menus-de-audio";
import { useAuth } from "@/stores/auth";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, useUI } from "@/stores/ui";
import { useVoicePrefs } from "@/stores/voicePrefs";

/** Botão de ícone do rodapé (32px, hover claro). */
function FooterButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid h-8 w-8 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Microfone e áudio: o botão e, colada nele, a seta que escolhe o aparelho.
 *
 * Desligado é **ícone vermelho sobre véu vermelho**, não ícone vermelho solto.
 * O véu é o que diferencia "está desligado" de "passar o mouse aqui desliga" —
 * sem ele, mudo e não-mudo têm a mesma silhueta e a cor sozinha precisa fazer
 * todo o trabalho, o que falha para quem não distingue vermelho.
 */
function FooterSplit({
  label,
  labelDaSeta,
  off,
  onClick,
  menu,
  children,
}: {
  label: string;
  labelDaSeta: string;
  off: boolean;
  onClick: () => void;
  /** função, e não nó pronto: listar aparelhos pede permissão de mídia. */
  menu: () => React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const seta = useRef<HTMLButtonElement>(null);
  /**
   * A caixa se alinha pelo **par**, não pela setinha.
   *
   * Medido no print: o popover do Discord começa na borda esquerda do botão do
   * microfone. Ancorado na setinha, o nosso nascia ~33px à direita disso — a
   * caixa parecia pendurada no canto do botão em vez de sair dele.
   */
  const par = useRef<HTMLDivElement>(null);

  const cor = off
    ? "bg-red/15 text-red hover:bg-red/25"
    : "text-txt-secondary hover:bg-hov hover:text-txt-primary";

  return (
    <div ref={par} className="flex items-center gap-px">
      <Tooltip label={label}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={off}
          className={`grid h-8 w-8 place-items-center rounded-l-[4px] rounded-r-[1px] transition ${cor}`}
        >
          {children}
        </button>
      </Tooltip>
      <Tooltip label={labelDaSeta}>
        <button
          ref={seta}
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={labelDaSeta}
          aria-expanded={aberto}
          className={`grid h-8 w-4 place-items-center rounded-r-[4px] rounded-l-[1px] transition ${cor}`}
        >
          <ChevronDown size={16} />
        </button>
      </Tooltip>

      <PopoverFlutuante
        ancora={par}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        rotulo={labelDaSeta}
        largura={288}
        denso
      >
        {/* sem fechar a cada clique: o menu tem sub-tela e um deslizador, e
            fechar no primeiro toque impediria os dois */}
        <div role="menu" aria-label={labelDaSeta}>
          {menu()}
        </div>
      </PopoverFlutuante>
    </div>
  );
}

/**
 * Rodapé das colunas laterais — o "painel do usuário" do Discord: avatar com
 * status, nome, e os controles de microfone, áudio e configurações.
 */
export default function UserFooter() {
  const painel = useRef<HTMLDivElement>(null);
  const user = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const openProfile = useUI((s) => s.openProfile);
  const openModal = useUI((s) => s.openModal);
  const muted = useVoicePrefs((s) => s.muted);
  const deafened = useVoicePrefs((s) => s.deafened);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const toggleDeafen = useVoicePrefs((s) => s.toggleDeafen);

  if (!user) return null;
  // o status personalizado chega por presença, não pelo `user` da sessão
  const vivo = resolveUser(profiles, user);
  const status = resolveStatus(statuses, vivo);

  return (
    /**
     * O card **flutua**: sai do fluxo da coluna e a lista rola por trás dele.
     *
     * Era um rodapé em fluxo, encostado nas três bordas e da largura inteira da
     * coluna. Medido no print do Discord, o card de lá tem 58px de altura, raio
     * de 8px, borda de 1px e 10px de recuo dos três lados — e a lista continua
     * atrás: dá para ver um avatar cortado pela borda de cima do card, e o
     * divisor da coluna reaparece embaixo dele.
     *
     * A diferença não é enfeite. Encostado nas bordas, o painel lê como o fim da
     * coluna; recuado, lê como uma peça por cima dela — que é o que ele é, já
     * que não pertence a nenhuma conversa da lista.
     *
     * `pb` na lista (ver `DMList` e `ChannelSidebar`) é o que garante que o
     * último item ainda seja alcançável por baixo do card.
     */
    <div
      ref={painel}
      className="pointer-events-auto absolute inset-x-2.5 bottom-2.5 z-20 flex flex-col overflow-hidden rounded-lg border border-border bg-footer"
    >
      {/* f-voz: a barra da call sobe junto, como parte da mesma pilha flutuante */}
      <VoiceConnectedBar />
      <div className="flex h-[58px] shrink-0 items-center gap-2 px-3.5">
        <button
          type="button"
          /*
            O cartão nasce do **painel**, não do botão do nome: no print
            `2026-09-03 180020` ele encosta na borda esquerda da janela (x=10, a
            mesma folga do painel) e a base fica 6px acima do topo dele.
            Ancorado no botão, saía à direita — por cima da lista de conversas —
            e com uma folga que o Discord não tem.
          */
          onClick={(e) => openProfile(user, anchorOf(painel.current ?? e.currentTarget), true)}
          aria-label="Meu perfil"
          className="-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-[4px] py-1 pl-1 pr-2 text-left transition hover:bg-hov"
        >
          <Avatar user={vivo} size="md" status={status} surface="border-footer" />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold leading-[19px] text-txt-primary">
              {displayNameOf(user)}
            </span>
            {/* o status personalizado tem prioridade sobre o rótulo do estado:
                é o que o Discord mostra quando a pessoa escreveu algo */}
            <span className="block truncate text-xs leading-[13px] text-txt-muted">
              {customStatusOf(vivo) ?? STATUS_LABEL[status]}
            </span>
          </span>
        </button>

        <FooterSplit
          label={muted ? "Desativar mudo" : "Silenciar"}
          labelDaSeta="Escolher microfone"
          off={muted}
          onClick={toggleMute}
          menu={() => <MenuDeEntrada />}
        >
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </FooterSplit>

        <FooterSplit
          label={deafened ? "Reativar áudio" : "Desativar áudio"}
          labelDaSeta="Escolher saída de áudio"
          off={deafened}
          onClick={toggleDeafen}
          menu={() => <MenuDeSaida />}
        >
          {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
        </FooterSplit>

        <FooterButton
          label="Configurações do usuário"
          onClick={() => openModal({ kind: "settings" })}
        >
          <Settings size={20} />
        </FooterButton>
      </div>
    </div>
  );
}
