"use client";

import { useRef } from "react";
import { AlertTriangle, MessageSquare, Phone, RotateCw, UserPlus } from "lucide-react";
import { displayNameOf, isGroupChannel } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { AoVivoIndicador } from "@/components/voice/ScreenShareButton";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
import { useDMs } from "@/stores/dms";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * A chamada de uma conversa direta ocupando a área principal, como no Discord:
 * o palco de participantes toma o lugar da timeline e a conversa vira uma
 * coluna que se abre e fecha pelo botão de balão.
 *
 * Ela aparece sempre que **alguém** está na chamada daquele canal, não só
 * quando eu estou: é assim que quem chegou depois descobre que a conversa tem
 * uma call rolando e entra sem ninguém precisar ligar de novo.
 *
 * O que o palco **não** mostra é a duração. No Discord o cronômetro não fica na
 * tela: quanto tempo durou é informação de depois, e aparece na mensagem de
 * sistema quando a chamada termina — na tela, ele só faria a conversa parecer
 * cronometrada.
 */
export default function CallStage({
  channelId,
  titulo,
  chatAberto,
  onToggleChat,
}: {
  channelId: string;
  titulo: string;
  chatAberto: boolean;
  onToggleChat: () => void;
}) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const conectadoAqui = useVoice((s) => s.channelId === channelId);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const call = useVoice((s) => s.call);
  const startCall = useVoice((s) => s.startCall);
  const endCall = useVoice((s) => s.endCall);
  const reconnect = useVoice((s) => s.reconnect);
  const conversa = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();

  const chamando = call.phase === "outgoing" && call.channelId === channelId;
  const grupo = conversa ? isGroupChannel(conversa) : false;
  const destinatario = conversa && !grupo ? conversa.others[0] : null;

  if (estados.length === 0 && !chamando) return null;

  const subtitulo = chamando
    ? "Chamando…"
    : estados.length === 1
      ? "1 pessoa na chamada"
      : `${estados.length} pessoas na chamada`;

  return (
    <section
      ref={palco}
      {...doPalco}
      data-call-stage={channelId}
      aria-label={`Chamada em ${titulo}`}
      // a tela cheia é a do navegador (ver `fullscreen.ts`): o elemento é promovido
      // pelo compositor, então não há classe de posicionamento a aplicar aqui
      className="relative flex min-w-0 flex-1 flex-col bg-rail"
    >
      {erro && conectadoAqui && status === "error" && (
        <div
          role="alert"
          className="z-20 flex shrink-0 items-center gap-2 bg-red px-4 py-2 text-sm font-medium text-white"
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

      <div
        {...daMoldura}
        className={`absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-4 py-3 transition-opacity duration-200 ${
          visivel ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Slots laterais iguais (`flex-1 basis-0`) em vez de 96px fixos: é o
            que mantém o título de fato centralizado — os dois lados dividem a
            sobra — sem espremer o selo "ao vivo", que precisa de ~230px e não
            cabia nos 96. */}
        <span className="flex min-w-0 flex-1 basis-0 items-start">
          <AoVivoIndicador />
        </span>

        {/* título centralizado: o palco é simétrico, e o nome no canto puxaria a
            atenção para fora das pessoas */}
        <span className="flex min-w-0 flex-col items-center text-center">
          <span className="max-w-full truncate text-sm font-semibold text-txt-primary">{titulo}</span>
          <span className="text-xs text-txt-muted">{subtitulo}</span>
        </span>

        <span className="flex min-w-0 flex-1 basis-0 justify-end gap-1">
          {grupo && (
            <IconeDoPalco
              label="Adicionar pessoas"
              onClick={() => ui.openModal({ kind: "addGroupMembers", channelId })}
            >
              <UserPlus size={20} />
            </IconeDoPalco>
          )}
          <IconeDoPalco
            label={chatAberto ? "Ocultar conversa" : "Mostrar conversa"}
            ativo={chatAberto}
            onClick={onToggleChat}
          >
            <MessageSquare size={20} />
          </IconeDoPalco>
        </span>
      </div>

      {/* Sem `pt-14`: o cabeçalho é flutuante (`absolute`) e se esconde sozinho
          quando o mouse para — reservar altura para ele custava 56px da
          transmissão para proteger uma faixa que nem sempre está na tela. O
          `pb-24` fica: os controles também flutuam, mas embaixo mora a tira de
          miniaturas, que precisa continuar clicável. */}
      <div className="min-h-0 flex-1 px-4 pb-24">
        {chamando ? (
          <Chamando nome={destinatario ? displayNameOf(destinatario) : titulo} usuario={destinatario} />
        ) : status === "connecting" && conectadoAqui ? (
          <div className="grid h-full place-items-center text-txt-muted">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
              <p>Entrando na chamada…</p>
            </div>
          </div>
        ) : conectadoAqui ? (
          <VoiceGrid
            channelId={channelId}
            nomeDoCanal={titulo}
            // só grupo aceita mais gente: numa conversa de duas pessoas o "+"
            // teria de criar um grupo novo, que é outra decisão e outra tela
            onAdicionar={
              grupo ? () => ui.openModal({ kind: "addGroupMembers", channelId }) : undefined
            }
          />
        ) : (
          <ConviteParaEntrar estados={estados} onEntrar={() => void startCall(channelId, false)} />
        )}
      </div>

      {(conectadoAqui || chamando) && (
        <>
          <VoiceControls
            oculto={!visivel}
            moldura={daMoldura}
            leaveLabel={chamando ? "Cancelar chamada" : "Desligar"}
            onLeave={() => void endCall()}
          />
          <IconesDoCanto
            telaCheia={telaCheia}
            onTelaCheia={alternar}
            visivel={visivel}
            moldura={daMoldura}
          />
        </>
      )}
    </section>
  );
}

/**
 * Chamada saindo: quem está sendo chamado, grande, com o anel pulsando.
 *
 * O anel é o que dá tempo ao tempo — sem ele "Chamando…" em texto parece uma
 * tela travada, e o impulso é clicar de novo.
 */
function Chamando({
  nome,
  usuario,
}: {
  nome: string;
  usuario: { id: string; username: string; avatarUrl?: string | null } | null;
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="relative grid place-items-center">
          <span
            aria-hidden="true"
            className="absolute h-[132px] w-[132px] animate-ping rounded-full bg-green/20"
          />
          {usuario ? (
            <Avatar user={usuario} size="xxl" surface="border-rail" />
          ) : (
            <span className="grid h-[120px] w-[120px] place-items-center rounded-full bg-panel">
              <Phone size={44} className="text-txt-muted" aria-hidden="true" />
            </span>
          )}
        </span>
        <p className="font-display text-xl font-bold text-txt-primary">{nome}</p>
        <p className="text-sm text-txt-muted">Chamando…</p>
      </div>
    </div>
  );
}

/**
 * Estado "a chamada existe e eu não estou nela".
 *
 * É cartão central, e não pílula no rodapé: entrar numa conversa que já começou
 * é a ação principal da tela, e o rodapé é onde moram as ações de quem já está
 * dentro.
 */
function ConviteParaEntrar({
  estados,
  onEntrar,
}: {
  estados: { user: { id: string; username: string; avatarUrl?: string | null } }[];
  onEntrar: () => void;
}) {
  const nomes = estados.map((e) => e.user.username);
  const texto =
    nomes.length === 1
      ? `${nomes[0]} está na chamada`
      : nomes.length === 2
        ? `${nomes[0]} e ${nomes[1]} estão na chamada`
        : `${nomes[0]} e mais ${nomes.length - 1} estão na chamada`;

  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex items-center justify-center -space-x-4">
          {estados.slice(0, 3).map((e) => (
            <Avatar key={e.user.id} user={e.user} size="xl" surface="border-rail" className="rounded-full ring-4 ring-rail" />
          ))}
        </div>
        <p className="font-display text-lg font-bold text-txt-primary">{texto}</p>
        <button
          type="button"
          onClick={onEntrar}
          className="flex h-11 items-center gap-2 rounded-[3px] bg-green px-6 text-base font-semibold text-accent-ink transition hover:brightness-110"
        >
          <Phone size={18} aria-hidden="true" />
          Entrar na chamada
        </button>
      </div>
    </div>
  );
}

function IconeDoPalco({
  label,
  onClick,
  ativo,
  children,
}: {
  label: string;
  onClick: () => void;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={ativo}
        aria-label={label}
        className={`grid h-8 w-8 place-items-center rounded-[4px] transition ${
          ativo ? "bg-sel text-txt-primary" : "text-txt-secondary hover:bg-hov hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
