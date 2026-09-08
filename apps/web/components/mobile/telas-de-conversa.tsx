"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Hash, Lock, Megaphone, Users, UserProfile, Volume2, X } from "@/components/ui/icones";
import { isGroupChannel } from "@streamz/shared";
import ChatView from "@/components/chat/ChatView";
import DMMemberList from "@/components/chat/DMMemberList";
import DMProfilePanel from "@/components/chat/DMProfilePanel";
import DMView from "@/components/chat/DMView";
import FriendsPage from "@/components/friends/FriendsPage";
import MemberList from "@/components/MemberList";
import VoicePanel from "@/components/VoicePanel";
import { BotaoDeToque, CabecalhoMobile } from "@/components/mobile/pecas";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { useActiveChannel, useVoiceChannel } from "@/stores/channels";
import { useActiveDM } from "@/stores/dms";
import { dmTitle } from "@/stores/dms";
import { useMobile } from "@/stores/mobile";
import { resolveStatus, usePresence } from "@/stores/presence";

/**
 * As telas cheias que entram por cima da base de uma aba: a conversa de um
 * canal, a conversa direta, a página de amigos e o palco de uma chamada.
 *
 * Nenhuma delas reescreve a tela do desktop. `ChatView` já sabe existir sem o
 * cabeçalho de 49px (é o `incorporado`, criado para a conversa ao lado do palco
 * de uma call), e `DMView` ganhou o mesmo interruptor. O que este arquivo faz é
 * pôr no lugar do cabeçalho de lá o cabeçalho do celular — 48px, seta de
 * voltar, e as duas ações que cabem no polegar.
 */

/**
 * Painel deslizante da direita: a lista de membros e o perfil do contato, que
 * no desktop são a quarta coluna.
 *
 * Cobre 86% da largura e deixa o resto como véu — é o que o Discord faz, e a
 * faixa que sobra é o alvo de "fechar" mais fácil que existe num telefone.
 */
export function PainelDeslizante({
  rotulo,
  titulo,
  onFechar,
  children,
}: {
  rotulo: string;
  titulo: ReactNode;
  onFechar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onFechar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="anim-overlay fixed inset-0 z-[85] flex justify-end bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="anim-deslizar-direita flex h-full w-[86%] max-w-sm flex-col bg-panel pt-[env(safe-area-inset-top)] shadow-high"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-1">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-txt-primary">
            {titulo}
          </h2>
          <BotaoDeToque label="Fechar" onClick={onFechar}>
            <X size={22} />
          </BotaoDeToque>
        </div>
        {/* as colunas do desktop têm largura fixa; aqui ocupam o painel */}
        <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)] [&>aside]:!w-full">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Toque longo na conversa abre o menu da mensagem.
 *
 * No desktop esse menu é o botão direito; no celular não existe botão direito,
 * e a fileira de ações que aparece no `hover` também não — o dedo não paira.
 * Sobra o toque longo, que é o gesto das duas plataformas.
 *
 * A implementação dispara o **mesmo** evento `contextmenu` que o mouse
 * dispararia, no ponto do toque: assim o menu, os itens e as permissões
 * continuam sendo os do `MessageItem`, e não uma segunda lista para manter em
 * sincronia. O que muda é só o desenho — no celular o `ContextMenuHost` sobe
 * como folha inferior.
 *
 * Dois cuidados que o gesto exige:
 * - **cancelar ao arrastar**: rolar a lista com o dedo parado por meio segundo
 *   não pode virar menu; 10px de movimento já desistem.
 * - **abafar o `contextmenu` nativo**: o Chrome do Android também dispara o
 *   dele no toque longo, e sem isto o menu abriria duas vezes. O do iOS não
 *   dispara — por isso o temporizador é nosso, e não uma escuta do evento.
 */
export function AreaDeToqueLongo({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const origem = useRef<{ x: number; y: number } | null>(null);
  const noDedo = useRef(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;

    const cancelar = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      origem.current = null;
    };

    const aoPressionar = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      noDedo.current = true;
      const alvo = e.target as HTMLElement | null;
      // um toque longo num botão (reagir, abrir imagem) é do botão, não da
      // mensagem: o menu só nasce do corpo dela
      if (!alvo || alvo.closest("button, a, input, textarea")) return;
      const { clientX: x, clientY: y } = e;
      origem.current = { x, y };
      cancelar();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        // a seleção que o sistema começou a desenhar sai de cena: quem pediu
        // menu não pediu texto marcado
        window.getSelection?.()?.removeAllRanges();
        navigator.vibrate?.(10);
        alvo.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
        );
      }, 450);
    };

    const aoMover = (e: PointerEvent) => {
      const inicio = origem.current;
      if (!inicio) return;
      if (Math.abs(e.clientX - inicio.x) > 10 || Math.abs(e.clientY - inicio.y) > 10) cancelar();
    };

    const aoSoltar = () => {
      cancelar();
      // a supressão do `contextmenu` nativo vale só enquanto o dedo esteve em
      // cena; um mouse ligado num tablet continua com o botão direito de sempre
      window.setTimeout(() => {
        noDedo.current = false;
      }, 700);
    };

    const aoMenuNativo = (e: MouseEvent) => {
      if (!noDedo.current || !e.isTrusted) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", aoPressionar);
    el.addEventListener("pointermove", aoMover);
    el.addEventListener("pointerup", aoSoltar);
    el.addEventListener("pointercancel", aoSoltar);
    el.addEventListener("contextmenu", aoMenuNativo, true);
    return () => {
      cancelar();
      el.removeEventListener("pointerdown", aoPressionar);
      el.removeEventListener("pointermove", aoMover);
      el.removeEventListener("pointerup", aoSoltar);
      el.removeEventListener("pointercancel", aoSoltar);
      el.removeEventListener("contextmenu", aoMenuNativo, true);
    };
  }, []);

  return (
    <div ref={caixa} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}

/** Conversa de um canal de servidor, em tela cheia. */
export function TelaDeCanal() {
  const canal = useActiveChannel();
  const voltar = useMobile((s) => s.voltar);
  const abrirMembros = useMobile((s) => s.abrirMembros);
  const membrosAbertos = useMobile((s) => s.membrosAbertos);

  if (!canal) return null;
  const nome = canal.name ?? "canal";
  const Icone =
    canal.type === "VOICE"
      ? Volume2
      : canal.type === "ANNOUNCEMENT" || canal.readOnly
        ? Megaphone
        : canal.private
          ? Lock
          : Hash;

  return (
    <>
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={<Icone size={20} />}
        titulo={nome}
        subtitulo={canal.topic ?? undefined}
        acoes={
          <BotaoDeToque label="Membros" onClick={abrirMembros}>
            <Users size={22} />
          </BotaoDeToque>
        }
      />
      <AreaDeToqueLongo>
        <ChatView incorporado />
      </AreaDeToqueLongo>
      {membrosAbertos && (
        <PainelDeslizante rotulo="Membros" titulo="Membros" onFechar={() => voltar()}>
          <MemberList />
        </PainelDeslizante>
      )}
    </>
  );
}

/** Conversa direta ou grupo, em tela cheia. */
export function TelaDeDM() {
  const dm = useActiveDM();
  const statuses = usePresence((s) => s.statuses);
  const voltar = useMobile((s) => s.voltar);
  const abrirMembros = useMobile((s) => s.abrirMembros);
  const membrosAbertos = useMobile((s) => s.membrosAbertos);

  if (!dm) return null;
  const titulo = dmTitle(dm);
  const grupo = isGroupChannel(dm);
  const outro = !grupo ? dm.others[0] : undefined;

  return (
    <>
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={
          outro ? (
            <Avatar user={outro} size="sm" status={resolveStatus(statuses, outro)} surface="border-panel" />
          ) : (
            <GroupAvatar iconUrl={dm.iconUrl} size="sm" />
          )
        }
        titulo={titulo}
        acoes={
          <BotaoDeToque label={grupo ? "Participantes" : "Perfil"} onClick={abrirMembros}>
            {grupo ? <Users size={22} /> : <UserProfile size={22} />}
          </BotaoDeToque>
        }
      />
      <AreaDeToqueLongo>
        <DMView semCabecalho />
      </AreaDeToqueLongo>
      {membrosAbertos && (
        <PainelDeslizante
          rotulo={grupo ? "Participantes" : "Perfil"}
          titulo={grupo ? "Participantes" : titulo}
          onFechar={() => voltar()}
        >
          {grupo || !outro ? <DMMemberList dm={dm} /> : <DMProfilePanel user={outro} />}
        </PainelDeslizante>
      )}
    </>
  );
}

/** Página de amigos, em tela cheia (o "Amigos" da lista de conversas). */
export function TelaDeAmigos() {
  const voltar = useMobile((s) => s.voltar);
  return (
    <>
      <CabecalhoMobile aoVoltar={() => voltar()} titulo="Amigos" />
      <div className="flex min-h-0 flex-1 flex-col">
        <FriendsPage />
      </div>
    </>
  );
}

/**
 * Palco da chamada em tela cheia.
 *
 * O cabeçalho aqui não tem "voltar" comum: **voltar não desliga**. Sair da tela
 * devolve a conversa e a chamada continua, com a barra compacta acima das abas
 * — é o comportamento do Discord, e a razão pela qual a barra existe.
 */
export function TelaDeVoz() {
  const canal = useVoiceChannel();
  const voltar = useMobile((s) => s.voltar);
  if (!canal) return null;
  return (
    <>
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={<Volume2 size={20} />}
        titulo={canal.name ?? "voz"}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <VoicePanel key={canal.id} channel={canal} />
      </div>
    </>
  );
}
