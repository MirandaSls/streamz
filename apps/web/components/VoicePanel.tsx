"use client";

import { useRef } from "react";
import { AlertTriangle, MessageSquare, RotateCw, UserPlus, Users, Volume2 } from "@/components/ui/icones";
import type { Channel, NotificationLevel } from "@streamz/shared";
import Tooltip from "@/components/ui/Tooltip";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import { membrosVisiveis } from "@/components/voice/paineis-da-call";
import VistaDoCanalDeVoz from "@/components/voice/VistaDoCanalDeVoz";
import { chatDoCanalAberto } from "@/components/voice/vista-do-canal-de-voz";
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
 * **Quem entra na chamada não é este componente.** Ele já teve um `useEffect`
 * que chamava `connect` na montagem, e o problema era que montar não é uma
 * intenção: um link da caixa de entrada, a busca rápida, as setas do histórico e
 * o F5 montavam o painel e entravam na sala sem que ninguém tivesse pedido. O
 * #131 tirou o efeito — e levou junto o clique, que *era* o pedido. Agora a
 * decisão viaja com a origem do clique até a store
 * (`useChannels.select(canal, "clique")` → `connect`, ver
 * `stores/voice-entrada.ts`), e este painel só desenha o que a store diz.
 *
 * Por isso ele tem **duas caras**, e `conectadoEm === channel.id` é o que as
 * separa:
 *
 * - **na sala**: cabeçalho com filete, a grade (`VoiceGrid`) e os controles;
 * - **fora dela**: a `VistaDoCanalDeVoz` — degradê, nome do canal, quantas
 *   pessoas estão em voz e o botão de entrar. É a tela da print
 *   `2026-09-04 102429`, e chega-se a ela pelo balão da linha do canal, por um
 *   link, ou **desligando** com o canal ainda aberto (`decidirSaida`).
 */
export default function VoicePanel({
  channel,
}: {
  channel: Pick<Channel, "id" | "guildId" | "name" | "type">;
}) {
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const conectadoEm = useVoice((s) => s.channelId);
  const connect = useVoice((s) => s.connect);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const estados = useVoice((s) => s.statesOf(channel.id));
  // o balão é lembrado por canal, e nasce aberto (ver `vista-do-canal-de-voz`)
  const chatAberto = useUI((s) => chatDoCanalAberto(s.chatDaCallPorCanal, channel.id));
  const toggleVoiceChat = useUI((s) => s.toggleVoiceChat);
  // a lista de membros do servidor divide a coluna da direita com a conversa da
  // call, e só cabe um painel (ver `paineis-da-call.ts`): o botão espelha o que
  // está **na tela**, não o `membersOpen` guardado
  const listaVisivel = useUI((s) =>
    membrosVisiveis(chatDoCanalAberto(s.chatDaCallPorCanal, channel.id), s.membersOpen),
  );
  const alternarMembros = useUI((s) => s.alternarMembrosNaCall);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();

  const aqui = conectadoEm === channel.id;
  const conectado = aqui && status === "connected";
  const nome = channel.name ?? "voz";
  // O `useOcultarInativo` existe para tirar a moldura da frente do VÍDEO. Na
  // vista do canal não há vídeo nenhum — sumir com o nome do canal depois de 3s
  // parado seria esconder a única coisa que a tela tem a dizer, e a print
  // mostra o cabeçalho lá.
  const molduraVisivel = !aqui || visivel;

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
        // Na vista do canal o cabeçalho flutua sobre o degradê: na print não há
        // filete nenhum cruzando o palco, e o brilho sobe por trás do nome.
        className={`flex h-[49px] shrink-0 items-center justify-between gap-2 px-4 transition-opacity duration-200 ${
          aqui ? "border-b border-border shadow-header" : ""
        } ${molduraVisivel ? "opacity-100" : "pointer-events-none opacity-0"}`}
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
            onClick={() => toggleVoiceChat(channel.id)}
          >
            <MessageSquare size={20} />
          </IconeDeCabecalho>
          {/* **Membros também aqui.** O canal de voz é um canal do servidor
              como outro qualquer, e a lista da coluna da direita é a mesma do
              canal de texto (`MemberList`: cargos, Disponível, Offline e a
              sub-linha "Em voz"). Sem este botão ela não tinha interruptor
              nenhum dentro da call — quem a desligasse num canal de texto
              ficava sem caminho de volta. `Users` a 20 e não a 22 como na
              toolbar do canal de texto: aqui o vizinho é o balão de 20, e os
              dois saem do mesmo quadro do acervo, então 20 é o que dá a MESMA
              tinta dos dois glifos deste cabeçalho. */}
          <IconeDeCabecalho
            label={listaVisivel ? "Ocultar lista de membros" : "Mostrar lista de membros"}
            active={listaVisivel}
            onClick={() => alternarMembros(channel.id)}
          >
            <Users size={20} />
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
        {aqui ? (
          // `pb-24` também durante o `connecting`: a barra de controles já está
          // na tela desde o clique, e reservar o espaço só no `connected` fazia
          // a grade dar um pulo de 96px no meio da entrada
          <div className="h-full p-4 pb-24">
            {/* **A grade aparece no clique, não no `connected`.** Quem manda
                nela é o estado de voz do servidor (`states`), que já chegou
                pelos eventos `voice.state` — o LiveKit só acrescenta o vídeo.
                Trocar a sala inteira por um spinner enquanto o `getUserMedia` e
                o `publishTrack` terminavam era o "demora muito para entrar" do
                relato: medido em produção, isso passava de um segundo em 23%
                das entradas e de três segundos em 12%. Quem está conectando
                aparece na barra "Conectando…" (`VoiceConnectedBar`), como no
                Discord. */}
            <VoiceGrid channelId={channel.id} nomeDoCanal={nome} guildId={channel.guildId} />
          </div>
        ) : (
          // sem `p-4`: o degradê vai de borda a borda do palco, como na print
          <VistaDoCanalDeVoz
            nome={nome}
            estados={estados}
            onEntrar={() => void connect(channel)}
          />
        )}

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
          // Desligar não fecha mais a coluna quando o canal continua aberto:
          // `decidirSaida("usuario")` mantém o painel de pé e ele volta à vista
          // do canal, com o botão de entrar de novo. Fechar era o que jogava
          // quem desligava num `ChatView` de largura inteira que ninguém pediu.
          <VoiceControls oculto={!visivel} moldura={daMoldura} onLeave={() => void disconnect()} />
        )}
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
