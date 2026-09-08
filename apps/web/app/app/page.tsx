"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import MemberList from "@/components/MemberList";
import VoicePanel from "@/components/VoicePanel";
import DiretorioDeApps from "@/components/apps/DiretorioDeApps";
import ChatView from "@/components/chat/ChatView";
import DMView from "@/components/chat/DMView";
import SearchPanel from "@/components/chat/SearchPanel";
import ThreadPanel from "@/components/chat/ThreadPanel";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import DMList from "@/components/layout/DMList";
import GuildRail from "@/components/layout/GuildRail";
import UserFooter from "@/components/layout/UserFooter";
import BarraDeTitulo from "@/components/desktop/BarraDeTitulo";
import ShellMobile from "@/components/mobile/ShellMobile";
import ModalHost from "@/components/modals/ModalHost";
import ContextMenuHost from "@/components/ui/ContextMenu";
import ProfilePopoverHost from "@/components/ui/ProfilePopover";
import TelaDeAbertura from "@/components/ui/TelaDeAbertura";
import Toasts from "@/components/ui/Toasts";
import CallSplit from "@/components/voice/CallSplit";
import { membrosVisiveis } from "@/components/voice/paineis-da-call";
import VoiceLayer from "@/components/voice/VoiceLayer";
import { chatDoCanalAberto } from "@/components/voice/vista-do-canal-de-voz";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRealtime } from "@/hooks/useRealtime";
import { useSettingsRoute } from "@/hooks/useSettingsRoute";
import { useAuth } from "@/stores/auth";
import { useAplicativos } from "@/stores/aplicativos";
import { useActiveChannel, useVoiceChannel } from "@/stores/channels";
import { useActiveDM } from "@/stores/dms";
import { useEmojis } from "@/stores/emojis";
import { useSoundboard } from "@/stores/soundboard";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
// ── d-social ── ausente automático depois de 10 min sem interação
import { useAutoIdle } from "@/stores/presence";
import { useUI } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Layout de 3 colunas do app (ver `design.md`).
 *
 * Esta tela só decide *o que aparece em cada coluna*. Todo o estado de domínio
 * mora nas stores de `stores/`, e os eventos do gateway entram por
 * `useRealtime` — a página não guarda mensagem, canal nem membro.
 */
export default function AppPage() {
  const router = useRouter();
  // Abaixo de 768px (e fora do app de desktop) o shell é outro: abas no rodapé
  // e telas cheias, como o app do Discord no celular. Ver `hooks/useEhMobile` —
  // a troca acontece antes da pintura, e o leiaute de colunas continua sendo o
  // único que existe a partir de 768.
  const ehMobile = useEhMobile();
  const user = useAuth((s) => s.user);
  const loadFromStorage = useAuth((s) => s.loadFromStorage);

  const view = useUI((s) => s.view);
  const membersOpen = useUI((s) => s.membersOpen);
  const chatDaCallPorCanal = useUI((s) => s.chatDaCallPorCanal);
  const toggleVoiceChat = useUI((s) => s.toggleVoiceChat);
  const activeChannel = useActiveChannel();
  const activeDM = useActiveDM();
  const voiceChannel = useVoiceChannel();
  // o balão nasce aberto e é lembrado canal a canal (ver `vista-do-canal-de-voz`)
  const voiceChatOpen = chatDoCanalAberto(chatDaCallPorCanal, voiceChannel?.id);
  // O palco está na tela quando a voz aponta para o canal de voz aberto — o
  // mesmo `aqui` do `VoicePanel`, que troca a vista do canal pela grade.
  const vozEm = useVoice((s) => s.channelId);
  const palcoAberto = !!voiceChannel && vozEm === voiceChannel.id;
  // ...e disputa a coluna da direita com a lista de membros, que no canal de voz
  // é a mesma do canal de texto. Só cabe um painel: a regra (medida nas prints
  // `2026-09-04 102422`/`102429`) está em `paineis-da-call.ts`. No PALCO não
  // cabe nenhum: ali a lista some mesmo ligada, e volta ao sair. Em canal de
  // texto não há conversa de call nem palco, os dois são falsos e isto vira o
  // próprio `membersOpen` — por isso a linha é uma só para os três casos.
  const listaDeMembros = membrosVisiveis(voiceChatOpen, membersOpen, palcoAberto);
  // ── j-bots · F4 ── "Descobrir aplicativos" toma a coluna 3 (e as da direita)
  // sem trocar o `view`: a coluna 1 e a 2 continuam sendo as que já estavam, que
  // é como o Discord abre o App Directory. Ver `stores/aplicativos.ts`.
  const appsAbertos = useAplicativos((s) => s.aberto);
  const threadParentId = useMessages((s) => s.threadParentId);
  // a busca ocupa a coluna 4 (como no Discord) e tem prioridade sobre thread e membros
  const buscaAberta = useMessages((s) => s.searchResults !== null || s.searching);

  useRealtime(user?.id);
  // ── e-configuracoes ──
  useKeyboardShortcuts();
  useSettingsRoute();
  useAutoIdle(!!user);

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  // Carga inicial ao entrar no app. A lista de servidores só era buscada no
  // `onReconnect` — que, por desenho, não dispara na primeira conexão —, então
  // abrir/recarregar o app deixava o rail vazio até o socket cair e voltar.
  // Emojis e figurinhas vêm junto; depois quem os atualiza é
  // `emoji.updated`/`sticker.updated`.
  useEffect(() => {
    if (!user) return;
    void useGuilds.getState().load();
    void useEmojis.getState().load();
    // os sons do painel de efeitos sonoros vêm na mesma carga: o botão da
    // chamada abre o painel pronto, sem uma volta ao servidor no clique
    void useSoundboard.getState().load();
  }, [user]);
  useEffect(() => {
    if (!user && typeof window !== "undefined" && !localStorage.getItem("user")) {
      router.replace("/login");
    }
  }, [user, router]);

  // Celular: o shell de abas toma o lugar do de colunas. Os hooks acima (sessão,
  // tempo real, atalhos, ausente automático) já rodaram — são os mesmos nos dois
  // leiautes, e é por isso que a decisão fica aqui embaixo e não numa rota.
  if (ehMobile) return <ShellMobile />;

  // `min-w` no shell: abaixo de ~940px o cabeçalho da conversa quebrava — o
  // título espremia os ícones, sobrava um caractere solto à esquerda e o
  // placeholder do composer partia em três linhas. O Discord também tem um piso
  // de largura de janela; sem ele o leiaute de quatro colunas não cabe.
  //
  // `max-md:hidden` (e a regra irmã de `globals.css`, para o telefone deitado)
  // cobrem o único quadro que o `useEhMobile` não alcança: o HTML estático que o
  // navegador pinta **antes** do JS subir. Sem elas, quem abre o site no
  // telefone vê meio segundo de leiaute de 940px com rolagem horizontal. Em
  // janela de computador nenhuma das duas faz nada, e o desktop é o mesmo pixel.
  return (
    <div
      data-shell-desktop
      className="flex h-full min-w-[940px] select-none max-md:hidden"
    >
      {/*
        Rail e coluna dentro do mesmo bloco posicionado, e o card do usuário
        como irmão dos dois.

        O card **atravessa a rail** no Discord: começa a 10px da borda da janela,
        passa por cima dos ícones de servidor e termina 10px antes do fim da
        coluna. Conferido no print — a divisória da rail aparece acima dele e
        some atrás dele. Enquanto ele morava dentro do `<aside>`, ficava preso à
        coluna e essa travessia era impossível.

        O card usa `inset-x-2.5` neste bloco, e não larguras somadas: assim ele
        continua certo se a rail ou a coluna mudarem de tamanho de novo — e elas
        acabaram de mudar.
      */}
      <div className="relative flex shrink-0">
        <GuildRail />
        {view === "dm" ? <DMList /> : <ChannelSidebar />}
        <UserFooter />
      </div>

      {appsAbertos ? (
        /*
          O diretório cobre a coluna 3 **e** a 4: ele já tem uma coluna de
          conteúdo de 1024 medida do Discord, e a lista de membros ao lado dela
          espremeria a grade para três cards. Quem o fecha é o rail (qualquer
          servidor, conversa ou o logo) e o `FecharAoNavegar` logo abaixo.
        */
        <>
          <DiretorioDeApps />
          <FecharAoNavegar />
        </>
      ) : view === "dm" ? (
        <>
          <DMView />
          {activeDM && buscaAberta && <SearchPanel guildId={null} />}
          {/* thread funciona em DM como em qualquer canal (ADR-0001) */}
          {activeDM && !buscaAberta && threadParentId && <ThreadPanel channelId={activeDM.id} />}
        </>
      ) : (
        <>
          {voiceChannel ? (
            // No canal de voz o palco ocupa a área e a conversa do canal abre
            // numa **coluna à direita** — o oposto do que o Discord faz em
            // conversa direta, e quem decide é o `orientacaoDaChamada`, dentro
            // do `CallSplit`, pelo `guildId`. A coluna nasce ABERTA (é assim na
            // print `2026-09-04 102429`) e o balão é lembrado canal a canal.
            <main className="flex min-w-0 flex-1 bg-chat">
              {voiceChatOpen ? (
                <CallSplit
                  guildId={voiceChannel.guildId}
                  titulo={voiceChannel.name ?? "voz"}
                  onFecharChat={() => toggleVoiceChat(voiceChannel.id)}
                  chamada={
                    <VoicePanel
                      // remontar por canal zera a tela para a sala certa
                      key={voiceChannel.id}
                      channel={voiceChannel}
                    />
                  }
                  chat={<ChatView incorporado />}
                />
              ) : (
                <div className="flex min-w-0 flex-1 flex-col">
                  <VoicePanel key={voiceChannel.id} channel={voiceChannel} />
                </div>
              )}
            </main>
          ) : (
            <ChatView />
          )}

          {/* Coluna 4: busca, thread OU lista de membros — uma por vez. Não há
              caso especial de voz: o canal de voz é um canal aberto como outro
              qualquer, com busca e thread na conversa dele, e a mesma lista de
              membros do servidor — que ali cede a vez à conversa da call quando
              as duas estão ligadas (`paineis-da-call.ts`). */}
          {activeChannel &&
            (buscaAberta ? (
              <SearchPanel guildId={activeChannel.guildId} />
            ) : threadParentId ? (
              <ThreadPanel channelId={activeChannel.id} />
            ) : (
              listaDeMembros && <MemberList />
            ))}
        </>
      )}

      <VoiceLayer />
      <ModalHost />
      <ContextMenuHost />
      <ProfilePopoverHost />
      <Toasts />
      {/* f-desktop: só existe dentro do Tauri; desconta a própria altura no
          <html> (ver globals.css) e traz o aviso de atualização */}
      <BarraDeTitulo />
      {/* cobre o shell vazio enquanto sessão, servidores e conversas chegam —
          no site e no desktop. Aparece só se a carga passar de 150ms e sai por
          fade; depois do primeiro boot nunca mais volta */}
      <TelaDeAbertura />
    </div>
  );
}

/**
 * ── j-bots · F4 ── fecha o diretório quando a pessoa navega por outro caminho.
 *
 * O rail já fecha o diretório nos cliques dele (servidor, conversa, logo), mas
 * a **coluna 2** continua ali ao lado enquanto o diretório está aberto: clicar
 * num canal na `ChannelSidebar` ou numa conversa na `DMList` selecionaria o
 * canal por baixo e a tela continuaria mostrando a grade de aplicativos — o
 * mesmo defeito que o `fecharAmigos(false)` do rail existe para evitar na
 * página Amigos.
 *
 * É um componente, e não um `useEffect` no corpo da página, porque assim o
 * efeito só existe **enquanto o diretório está aberto**: o valor de
 * `activeChannel` no instante em que ele abriu não é uma navegação, e é dele
 * que a comparação parte.
 *
 * **A guarda compara valores, e não "é a primeira execução".** A primeira
 * versão contava execuções (`primeira.current = false; return;`) e o diretório
 * fechava sozinho no mesmo quadro em que abria: o modo estrito do React roda
 * cada efeito **duas vezes** em desenvolvimento, a segunda passada já achava a
 * bandeira baixada e chamava `fechar()`. Guardar os ids e comparar é imune a
 * isso — as duas passadas veem o mesmo canal, e só uma navegação de verdade
 * muda o valor.
 */
function FecharAoNavegar() {
  const fechar = useAplicativos((s) => s.fechar);
  const canalId = useActiveChannel()?.id ?? null;
  const dmId = useActiveDM()?.id ?? null;
  const aoAbrir = useRef<{ canalId: string | null; dmId: string | null } | null>(null);
  useEffect(() => {
    aoAbrir.current ??= { canalId, dmId };
    if (aoAbrir.current.canalId !== canalId || aoAbrir.current.dmId !== dmId) fechar();
  }, [canalId, dmId, fechar]);
  return null;
}
