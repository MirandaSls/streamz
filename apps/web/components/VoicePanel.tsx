"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, MessageSquare, RotateCw, UserPlus, Volume2 } from "@/components/ui/icones";
import {
  displayNameOf,
  type Channel,
  type NotificationLevel,
  type VoiceStateEvent,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { AoVivoIndicador } from "@/components/voice/ScreenShareButton";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
import {
  isChannelMuted,
  levelForChannel,
  useNotifications,
} from "@/stores/notifications";
import { ui, useUI, type MenuItem } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Painel de voz/vídeo/tela de um canal de VOZ — a coluna 3 inteira, com o chat
 * de texto do mesmo canal numa coluna **à direita** quando aberto (ver
 * `CallSplit`, que escolhe esse leiaute por ser canal de servidor).
 *
 * Aqui não há conexão nenhuma: quem conecta, guarda estado e fala com o
 * LiveKit é a store `stores/voice.ts`. Este componente só monta a tela em cima
 * do que ela expõe — o que permite ao painel ser fechado (trocar de canal de
 * texto) sem derrubar a call, que é como o Discord se comporta.
 *
 * Clicar no canal **conecta na hora**, como no Discord: o canal de voz não é
 * uma tela para visitar, é a sala. A antessala continua existindo, mas só como
 * estado de espera enquanto a conexão não sobe — e como saída para quem caiu,
 * com o botão de entrar de novo.
 */
export default function VoicePanel({
  channel,
  onLeave,
}: {
  channel: Pick<Channel, "id" | "guildId" | "name" | "type">;
  onLeave?: () => void;
}) {
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const conectadoEm = useVoice((s) => s.channelId);
  const connect = useVoice((s) => s.connect);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const estados = useVoice((s) => s.statesOf(channel.id));
  const chatAberto = useUI((s) => s.voiceChatOpen);
  const toggleVoiceChat = useUI((s) => s.toggleVoiceChat);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();

  const aqui = conectadoEm === channel.id;
  const conectado = aqui && status === "connected";
  const nome = channel.name ?? "voz";

  // Clicar no canal já é a intenção de entrar — o Discord conecta no clique, e
  // uma tela intermediária com "Entrar" transforma um clique em dois. Só entra
  // quando não há conexão neste canal, para não reconectar a cada re-render.
  useEffect(() => {
    if (!aqui) void connect(channel);
    // `channel.id` basta: trocar de canal remonta o painel (key na página)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  async function sair() {
    await disconnect();
    onLeave?.();
  }

  return (
    <div
      ref={palco}
      {...doPalco}
      // a tela cheia é a do navegador (ver `fullscreen.ts`), não um `fixed inset-0`
      className="flex h-full flex-col bg-chat"
      data-voice-panel={channel.id}
    >
      <header
        {...daMoldura}
        className={`flex h-[49px] shrink-0 items-center justify-between gap-2 border-b border-border px-4 shadow-header transition-opacity duration-200 ${
          visivel ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold text-txt-primary">
          <Volume2 size={24} className="shrink-0 text-txt-muted" aria-hidden="true" />
          <span className="truncate">{nome}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <AoVivoIndicador />
          {/* no canal de voz o palco ocupa tudo: este botão é o ÚNICO caminho
              para o chat de texto do canal */}
          <IconeDeCabecalho
            label={chatAberto ? "Ocultar chat" : "Abrir chat"}
            active={chatAberto}
            onClick={toggleVoiceChat}
          >
            <MessageSquare size={20} />
          </IconeDeCabecalho>
          {/* sem sino aqui: no print o cabeçalho do canal de voz tem só o
              balão do chat. Notificação e silêncio continuam no menu de
              contexto do canal, na barra lateral, que é de onde o Discord as
              serve. */}
        </span>
      </header>

      {aqui && status === "error" && erro && (
        // banner de largura total: uma falha de conexão não é nota de rodapé
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 bg-red px-4 py-2 text-sm font-medium text-white"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{erro}</span>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="flex shrink-0 items-center gap-1.5 rounded-[3px] bg-white/15 px-2 py-1 text-xs font-semibold transition hover:bg-white/25"
          >
            <RotateCw size={12} aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* a barra de controles flutua sobre a grade (Discord) — por isso ela fica
          fora do bloco de conteúdo, que ocupa a área toda sem rolar */}
      <div className="relative min-h-0 flex-1">
        <div className={`h-full p-4 ${conectado ? "pb-24" : ""}`}>
          {aqui && status === "connecting" ? (
            <div className="grid h-full place-items-center text-txt-muted">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
                <p>Entrando na sala…</p>
              </div>
            </div>
          ) : aqui ? (
            <VoiceGrid channelId={channel.id} nomeDoCanal={nome} guildId={channel.guildId} />
          ) : (
            <Antessala
              nome={nome}
              estados={estados}
              onEntrar={() => void connect(channel)}
            />
          )}
        </div>

        {conectado && (
          <>
            {/* Convidar mora no canto inferior esquerdo do palco, alinhado com a
                barra: é a ação de "esta sala está vazia demais", e no print ela
                nunca entra na fileira dos controles da chamada. */}
            <div
              {...daMoldura}
              className={`absolute bottom-8 left-6 z-10 transition-opacity duration-200 ${
                visivel ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <IconeDeCabecalho
                label="Convidar para voz"
                onClick={() =>
                  channel.guildId && ui.openModal({ kind: "invite", guildId: channel.guildId })
                }
              >
                <UserPlus size={22} />
              </IconeDeCabecalho>
            </div>

            <IconesDoCanto
              telaCheia={telaCheia}
              onTelaCheia={alternar}
              visivel={visivel}
              moldura={daMoldura}
            />
          </>
        )}

        {conectado && (
          <VoiceControls oculto={!visivel} moldura={daMoldura} onLeave={() => void sair()} />
        )}
      </div>
    </div>
  );
}

/**
 * A antessala: quem já está na sala e o convite para entrar.
 *
 * Mostrar as pessoas antes é o que transforma "canal de voz" em "sala com
 * gente" — é a informação que decide se você entra agora ou depois.
 */
function Antessala({
  nome,
  estados,
  onEntrar,
}: {
  nome: string;
  estados: VoiceStateEvent[];
  onEntrar: () => void;
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg bg-panel px-8 py-10 text-center">
        {estados.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {estados.slice(0, 6).map((e) => (
                <span key={e.user.id} className="flex flex-col items-center gap-1.5">
                  <Avatar user={e.user} size="xl" surface="border-panel" />
                  <span className="max-w-20 truncate text-xs text-txt-muted">
                    {displayNameOf(e.user)}
                  </span>
                </span>
              ))}
            </div>
            {estados.length > 6 && (
              <p className="text-sm text-txt-muted">e mais {estados.length - 6}</p>
            )}
          </>
        ) : (
          <>
            <span className="grid h-20 w-20 place-items-center rounded-full bg-chat">
              <Volume2 size={36} className="text-txt-muted" aria-hidden="true" />
            </span>
            <p className="text-sm text-txt-muted">Ninguém está em {nome} agora.</p>
          </>
        )}

        <button
          type="button"
          onClick={onEntrar}
          className="h-11 rounded-[3px] bg-green px-8 text-base font-semibold text-accent-ink transition hover:brightness-110"
        >
          Entrar na Voz
        </button>
      </div>
    </div>
  );
}

const NIVEIS: { valor: NotificationLevel; rotulo: string }[] = [
  { valor: "ALL", rotulo: "Todas as mensagens" },
  { valor: "MENTIONS", rotulo: "Apenas @menções" },
  { valor: "NONE", rotulo: "Nada" },
];

function abrirMenuDeNotificacoes(
  e: React.MouseEvent<HTMLButtonElement>,
  channelId: string,
  guildId: string | null,
) {
  const r = e.currentTarget.getBoundingClientRect();
  const atual = levelForChannel(channelId, guildId);
  const silenciado = isChannelMuted(channelId, guildId);
  const store = useNotifications.getState();
  const itens: MenuItem[] = [
    {
      label: silenciado ? "Reativar canal" : "Silenciar canal",
      onSelect: () =>
        void (silenciado ? store.unmuteChannel(channelId) : store.muteChannel(channelId, null)),
    },
    { separator: true },
    ...NIVEIS.map((n) => ({
      label: n.rotulo,
      control: "radio" as const,
      checked: atual === n.valor,
      onSelect: () => void store.setChannelLevel(channelId, n.valor),
    })),
  ];
  ui.openContextMenu(r.left, r.bottom + 4, itens);
}

function IconeDeCabecalho({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** ligado (o chat aberto, por exemplo) fica branco, como na toolbar do canal. */
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active || undefined}
        className={`grid h-8 w-8 place-items-center rounded-[4px] transition hover:bg-hov hover:text-txt-primary ${
          active ? "text-txt-primary" : "text-txt-secondary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
