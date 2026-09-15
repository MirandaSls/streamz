"use client";

import { useRef } from "react";
import { AlertTriangle, MessageSquare, RotateCw, UserPlus, Users, Volume2 } from "@/components/ui/icones";
import { Permission, type Channel, type NotificationLevel } from "@streamz/shared";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import { membrosVisiveis } from "@/components/voice/paineis-da-call";
import VistaDoCanalDeVoz from "@/components/voice/VistaDoCanalDeVoz";
import { chatDoCanalAberto } from "@/components/voice/vista-do-canal-de-voz";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { AoVivoIndicador } from "@/components/voice/ScreenShareButton";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
import { useEhMobile } from "@/hooks/useEhMobile";
import {
  isChannelMuted,
  levelForChannel,
  useNotifications,
} from "@/stores/notifications";
import { useCan } from "@/stores/permissions";
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
  // a call é NESTE canal: é o que troca a vista do canal pelo palco, logo abaixo
  const aqui = conectadoEm === channel.id;
  // o balão é lembrado por canal, e nasce aberto (ver `vista-do-canal-de-voz`)
  const chatAberto = useUI((s) => chatDoCanalAberto(s.chatDaCallPorCanal, channel.id));
  const toggleVoiceChat = useUI((s) => s.toggleVoiceChat);
  // a lista de membros do servidor divide a coluna da direita com a conversa da
  // call, e só cabe um painel (ver `paineis-da-call.ts`): o botão espelha o que
  // está **na tela**, não o `membersOpen` guardado
  const listaVisivel = useUI((s) =>
    membrosVisiveis(chatDoCanalAberto(s.chatDaCallPorCanal, channel.id), s.membersOpen, aqui),
  );
  const alternarMembros = useUI((s) => s.alternarMembrosNaCall);

  // `CONNECT` — ver o canal na coluna não é poder entrar nele (mesmo bit que a
  // API confere em `voice.service.ts:assertPodeConectar`; a UI só esconde o
  // que ela recusaria, como em qualquer outro `useCan` do projeto). DM/grupo
  // (`guildId` nulo) não tem cargo nem bitfield — lá quem decide é já ser
  // participante da conversa, e `useCan` sempre devolveria `false` sem
  // servidor, então o hook roda (regra dos hooks) mas o resultado só conta
  // para canal de servidor.
  const podeConectarNoServidor = useCan(Permission.CONNECT, channel.id);
  const podeConectar = channel.guildId ? podeConectarNoServidor : true;

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();
  const ehMobile = useEhMobile();

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
      // a tela cheia é a do navegador (ver `fullscreen.ts`), não um `fixed inset-0`.
      // Preto puro (`bg-black`, o `--black` do Discord, não o preto do
      // Tailwind) só enquanto `aqui`: print `2026-08-31 101857`, pixel 1000,100
      // = `#000000` (`CallStage.tsx` já usa o mesmo tom). A `VistaDoCanalDeVoz`
      // — sem conexão — continua com o degradê sobre `background-base-lower`.
      className={`flex h-full flex-col ${aqui ? "bg-black" : "bg-background-base-lower"}`}
      data-voice-panel={channel.id}
    >
      {/* **No celular este cabeçalho não existe.** A tela empilhada já tem o
          `CabecalhoMobile` de 56px com o nome do canal e o voltar
          (`telas-de-conversa.tsx`), e os dois somados comiam 105 dos 844pt de
          um iPhone para dizer o mesmo nome duas vezes. O selo "Você está ao
          vivo" — a única coisa daqui que o palco não repete — volta logo
          abaixo, flutuando sobre o palco. */}
      {!ehMobile && (
      <header
        {...daMoldura}
        // Na vista do canal o cabeçalho flutua sobre o degradê: na print não há
        // filete nenhum cruzando o palco, e o brilho sobe por trás do nome.
        className={`flex h-[49px] shrink-0 items-center justify-between gap-2 px-4 transition-opacity duration-200 ${
          aqui ? "border-b border-border-subtle shadow-elevation-low" : ""
        } ${molduraVisivel ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold text-text-strong">
          <Volume2 size={24} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate">{nome}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <AoVivoIndicador />
          {/* no canal de voz o palco ocupa tudo: este botão é o ÚNICO caminho
              para o chat de texto do canal */}
          <BotaoDeIcone
            rotulo={chatAberto ? "Ocultar chat" : "Abrir chat"}
            icone={<MessageSquare size={20} />}
            ativo={chatAberto}
            comFundo
            onClick={() => toggleVoiceChat(channel.id)}
          />
          {/* **Membros também aqui.** O canal de voz é um canal do servidor
              como outro qualquer, e a lista da coluna da direita é a mesma do
              canal de texto (`MemberList`: cargos, Disponível, Offline e a
              sub-linha "Em voz"). Sem este botão ela não tinha interruptor
              nenhum dentro da call — quem a desligasse num canal de texto
              ficava sem caminho de volta. `Users` a 20 e não a 22 como na
              toolbar do canal de texto: aqui o vizinho é o balão de 20, e os
              dois saem do mesmo quadro do acervo, então 20 é o que dá a MESMA
              tinta dos dois glifos deste cabeçalho. */}
          {/* Decisão do usuário (2026-09-04): dentro do PALCO da call só fica
              o balão da conversa; a lista de membros tem interruptor apenas
              na vista do canal sem entrar. `aqui` e não `conectado`: o palco
              entra no clique, não no `connected` (ver a grade abaixo), e é ele
              que também tira a `MemberList` da coluna da direita
              (`paineis-da-call.ts`) — os dois têm de sumir no mesmo instante,
              senão sobra um botão que não muda nada na tela. */}
          {!aqui && (
            <BotaoDeIcone
              rotulo={listaVisivel ? "Ocultar lista de membros" : "Mostrar lista de membros"}
              icone={<Users size={20} />}
              ativo={listaVisivel}
              comFundo
              onClick={() => alternarMembros(channel.id)}
            />
          )}
          {/* sem sino aqui: no print o cabeçalho do canal de voz tem só o
              balão do chat. Notificação e silêncio continuam no menu de
              contexto do canal, na barra lateral, que é de onde o Discord as
              serve. */}
        </span>
      </header>
      )}

      {aqui && status === "error" && erro && (
        // banner de largura total: uma falha de conexão não é nota de rodapé
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 bg-status-danger px-4 py-2 text-sm font-medium text-control-critical-primary-text-default"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{erro}</span>
          {/* sem primitivo/token para "capa translúcida branca sobre banner de
              perigo" (nem `Button` nem `bg-white/NN` têm par no contrato) — mesmo
              padrão intocado em `CallStage.tsx`; ver "faltando" no cartão m25 */}
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
          <div
            className={
              ehMobile
                ? // No celular quem cuida das folgas é o `PalcoMobile`: a
                  // lateral é dele (`px-3`; 16 de cada lado aqui roubariam 32
                  // dos 390 sem nada a mostrar neles) e a de baixo depende da
                  // orientação — deitado a cápsula de controles flutua sobre o
                  // vídeo em vez de ocupar altura.
                  "h-full"
                : // `px-2 pt-2` = `FOLGA_DO_PALCO` (8px, `grid-layout.ts:38`,
                  // medido print `101857` x=1911–1918): tínhamos `p-4` (16),
                  // o dobro. `pb-24` continua à parte — reserva espaço para a
                  // barra de controles flutuante, não é folga do palco.
                  "h-full px-2 pt-2 pb-24"
            }
          >
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
            podeConectar={podeConectar}
            onEntrar={() => void connect(channel)}
          />
        )}

        {/* No celular o selo de transmissão não tem cabeçalho onde morar: ele
            flutua no alto do palco, que é onde o olho já está. */}
        {ehMobile && aqui && (
          <div className="pointer-events-none absolute inset-x-3 top-2 z-10 flex justify-center [&>*]:pointer-events-auto">
            <AoVivoIndicador />
          </div>
        )}

        {/* `IconesDoCanto` e o convite flutuante ficam fora do celular: o
            primeiro é a tela cheia do palco inteiro (no telefone o gesto é
            tocar no tile, ver `PalcoMobile`) e o segundo cairia debaixo da
            cápsula de controles. Convidar continua no menu do servidor. */}
        {conectado && !ehMobile && (
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
              <BotaoDeIcone
                rotulo="Convidar para voz"
                icone={<UserPlus size={22} />}
                comFundo
                onClick={() =>
                  channel.guildId && ui.openModal({ kind: "invite", guildId: channel.guildId })
                }
              />
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
