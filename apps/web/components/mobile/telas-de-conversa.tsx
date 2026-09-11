"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Hash,
  Lock,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Users,
  UserProfile,
  Video,
  Volume2,
  X,
} from "@/components/ui/icones";
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
import { useVoice } from "@/stores/voice";

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
        className="anim-deslizar-direita flex h-full w-[86%] max-w-sm flex-col bg-background-base-lowest pt-[env(safe-area-inset-top)] shadow-popout"
      >
        <div className="flex h-[56px] shrink-0 items-center gap-2 border-b border-border-subtle pl-4 pr-1">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-text-strong">
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
 * Toque longo abre o menu de contexto — de mensagem, de canal, de servidor, de
 * conversa ou de membro.
 *
 * No desktop esses menus são o botão direito; no celular não existe botão
 * direito, e a fileira de ações que aparece no `hover` também não — o dedo não
 * paira. Sobra o toque longo, que é o gesto das duas plataformas. Por isso esta
 * área envolve **o shell inteiro** (`ShellMobile`), e não só a conversa: uma
 * lista de canais sem toque longo é uma lista sem "marcar como lido", sem
 * "silenciar" e sem "configurações do canal".
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
      // Campo de texto tem gesto próprio (cursor, seleção, colar) e não pode
      // ser sequestrado. Fora isso o toque longo vale em **qualquer** lugar,
      // botão de lista incluído: no telefone é o único gesto que existe para o
      // que no desktop é o botão direito, e o menu do canal, do servidor, da
      // conversa e do membro só existem por ele. Quem não tem menu não abre
      // nada — o evento sobe e ninguém o atende.
      if (!alvo || alvo.closest("input, textarea, [contenteditable='true']")) return;
      /*
        **Seleção viva no texto: o dedo ali é ajuste de alça, não pedido de
        menu.** É o que faz "Selecionar Texto" (o item da folha da mensagem)
        servir para alguma coisa: sem esta saída, o primeiro toque para arrastar
        a alça reabria a folha por cima e apagava o que tinha acabado de ser
        marcado.
      */
      const selecao = window.getSelection?.();
      if (selecao && !selecao.isCollapsed) return;
      const { clientX: x, clientY: y } = e;
      origem.current = { x, y };
      cancelar();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        /*
          A seleção **não** é mais apagada aqui. Esta linha era a razão de não
          se conseguir marcar o texto de uma mensagem no celular: o sistema
          começa a desenhar a seleção durante o toque longo e, aos 450ms, nós a
          removíamos para abrir a folha. Quem chega com seleção viva já nem
          arma o temporizador (ver `aoPressionar`), então não há duas coisas
          disputando o mesmo gesto — e a cópia de um trecho passou a ter caminho
          próprio, o item "Selecionar Texto" da folha.
        */
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
      {/*
        `# nome ›`, e é **o título** que abre a lista de membros — é o que a
        captura `discord-mobile-chat-canal-2024.png` mostra: seta de voltar,
        `# general ›` e a lupa à direita. Não há ícone de membros ali.

        A lupa fica de fora: a busca de mensagens não tem tela no celular, e
        §6.6 é clara — botão inerte só existe quando o Discord o tem e nós
        temos o que ele faz. Uma lupa que não busca seria pior que nenhuma.
      */}
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={<Icone size={20} />}
        titulo={nome}
        subtitulo={canal.topic ?? undefined}
        aoTocarNoTitulo={abrirMembros}
        chevron
      />
      <ChatView incorporado />
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
      {/* mesmo padrão do canal: o título é que abre quem está na conversa */}
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={
          outro ? (
            <Avatar user={outro} size="sm" status={resolveStatus(statuses, outro)} surface="border-background-base-lowest" />
          ) : (
            <GroupAvatar iconUrl={dm.iconUrl} size="sm" />
          )
        }
        titulo={titulo}
        aoTocarNoTitulo={abrirMembros}
        chevron
        /*
          Ligar para alguém **de dentro da conversa**. Os dois botões existem no
          cabeçalho do `DMView`, que o celular não desenha (`semCabecalho`), e
          sem eles o único caminho para uma chamada era o toque longo na lista
          de conversas — medido: zero botões de chamada na tela de DM aberta.
          No Discord do celular eles ficam exatamente aqui, no canto direito do
          cabeçalho da conversa.
        */
        acoes={
          <>
            <BotaoDeToque
              label="Iniciar chamada de voz"
              onClick={() => void useVoice.getState().startCall(dm.id, false)}
            >
              <PhoneCall size={22} />
            </BotaoDeToque>
            <BotaoDeToque
              label="Iniciar chamada de vídeo"
              onClick={() => void useVoice.getState().startCall(dm.id, true)}
            >
              <Video size={22} />
            </BotaoDeToque>
          </>
        }
      />
      <DMView semCabecalho />
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
 *
 * O balão à direita abre a **conversa do canal de voz**. No desktop ela é uma
 * coluna ao lado do palco (`CallSplit`); num telefone não há coluna ao lado de
 * nada, então ela entra como mais uma tela da pilha — e o palco volta com a
 * seta, com a chamada intacta. Sem este botão a conversa do canal de voz não
 * teria caminho nenhum no celular: o cabeçalho do `VoicePanel`, que a abre no
 * desktop, é justamente o que o leiaute de celular esconde.
 */
export function TelaDeVoz() {
  const canal = useVoiceChannel();
  const voltar = useMobile((s) => s.voltar);
  const empilhar = useMobile((s) => s.empilhar);
  if (!canal) return null;
  return (
    <>
      <CabecalhoMobile
        aoVoltar={() => voltar()}
        icone={<Volume2 size={20} />}
        titulo={canal.name ?? "voz"}
        acoes={
          <BotaoDeToque label="Conversa do canal" onClick={() => empilhar("canal")}>
            <MessageSquare size={22} />
          </BotaoDeToque>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <VoicePanel key={canal.id} channel={canal} />
      </div>
    </>
  );
}
