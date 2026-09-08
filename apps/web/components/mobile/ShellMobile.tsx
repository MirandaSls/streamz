"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import BarraDeAbas from "@/components/mobile/BarraDeAbas";
import BarraDeVozMobile from "@/components/mobile/BarraDeVozMobile";
import { TelaEmpilhada } from "@/components/mobile/pecas";
import {
  TelaMensagens,
  TelaNotificacoes,
  TelaServidores,
  TelaVoce,
} from "@/components/mobile/telas-base";
import {
  TelaDeAmigos,
  TelaDeCanal,
  TelaDeDM,
  TelaDeVoz,
} from "@/components/mobile/telas-de-conversa";
import ModalHost from "@/components/modals/ModalHost";
import ContextMenuHost from "@/components/ui/ContextMenu";
import ProfilePopoverHost from "@/components/ui/ProfilePopover";
import TelaDeAbertura from "@/components/ui/TelaDeAbertura";
import Toasts from "@/components/ui/Toasts";
import VoiceLayer from "@/components/voice/VoiceLayer";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { mobile, profundidade, telaDoTopo, useMobile } from "@/stores/mobile";
import { ui, useUI } from "@/stores/ui";

/**
 * O app inteiro no formato do celular: abas no rodapé e uma pilha de telas
 * cheias em cima de cada uma.
 *
 * Este shell **substitui** o de quatro colunas de `app/app/page.tsx` abaixo de
 * 768px (ver `hooks/useEhMobile`), e não convive com ele: os dois montariam a
 * mesma `MessageList`, o mesmo `Composer` e a mesma grade de voz, com duas
 * assinaturas em cada store e duas caixas de texto disputando o foco. O que
 * está aqui é só a caixa — GuildRail, ChannelSidebar, DMList, ChatView, DMView,
 * MemberList, FriendsPage, InboxPopover e VoicePanel são os mesmos arquivos que
 * o desktop usa.
 *
 * ## Como uma tela vai para a pilha
 *
 * Sem inventar um segundo caminho de navegação: **o toque na lista é ouvido
 * aqui**, por delegação (`onClickCapture` no bloco da aba). Quem seleciona o
 * canal continua sendo o botão da `ChannelSidebar` e a store de sempre; este
 * shell só percebe que houve um toque num item de lista e empilha a conversa
 * por cima. Foi essa a alternativa a espalhar `if (ehMobile)` pelas colunas.
 *
 * Por que não observar a store em vez do clique: `loadForGuild` seleciona o
 * primeiro canal de texto sozinho ao trocar de servidor, e `openList` reabre a
 * última conversa no boot. Observando o `activeChannelId`, trocar de servidor
 * jogaria a pessoa dentro de uma conversa que ela não pediu — no Discord do
 * celular tocar num servidor mostra a **lista de canais**.
 */
export default function ShellMobile() {
  const aba = useMobile((s) => s.aba);
  const pilhas = useMobile((s) => s.pilhas);
  const topo = telaDoTopo({ aba, pilhas });
  const prof = useMobile(profundidade);
  const setMembersOpen = useUI((s) => s.toggleMembers);
  const membersOpen = useUI((s) => s.membersOpen);
  /** já houve um toque nesta sessão? separa navegação de carga inicial. */
  const jaInteragiu = useRef(false);

  /**
   * A quarta coluna do desktop fica desligada: no celular a lista de membros e
   * o cartão de perfil são o painel deslizante do cabeçalho, não uma coluna ao
   * lado. Sem isto o `DMView` montaria os dois ao mesmo tempo.
   */
  useEffect(() => {
    if (membersOpen) setMembersOpen();
    // só na montagem: depois disso quem manda é o painel deslizante
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useVoltarDoAndroid(prof);

  /**
   * A aba e o `view` das stores andam juntos.
   *
   * `view` ("guild" | "dm") é o que diz à `GuildRail` qual item está aceso e ao
   * `DMList` se a conversa aberta é a da tela. No desktop ele muda quando se
   * clica no rail ou no logo; aqui a aba é a mesma decisão, e sem esta ligação a
   * rail acendia o botão de início enquanto a lista de canais de um servidor
   * estava na frente.
   */
  const view = useUI((s) => s.view);
  useEffect(() => {
    if (aba === "servidores") ui.setView("guild");
    else if (aba === "mensagens") ui.setView("dm");
  }, [aba]);
  /** ...e o caminho inverso: o logo da rail volta para "dm" — logo, para a aba. */
  useEffect(() => {
    if (view === "dm" && useMobile.getState().aba === "servidores") mobile.irParaAba("mensagens");
  }, [view]);

  /**
   * Delegação do toque na lista da aba. Cada `data-*` abaixo já existia ou é um
   * atributo sem pixel nenhum no arquivo do desktop — nada aqui muda o que a
   * lista desenha.
   */
  function aoTocarNaLista(e: MouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement | null;
    if (!alvo) return;
    if (alvo.closest("[data-channel-button]")) {
      // canal de voz: o clique já entrou na chamada (`voice-entrada.ts`), então
      // a tela que interessa é o palco
      const canal = useChannels.getState();
      const ativo = canal.channels.find((c) => c.id === canal.activeChannelId);
      mobile.empilhar(ativo?.type === "VOICE" ? "voz" : "canal");
      return;
    }
    if (alvo.closest("[data-dm-button]")) {
      mobile.empilhar("conversa");
      return;
    }
    if (alvo.closest("[data-amigos-button]")) {
      mobile.empilhar("amigos");
    }
  }

  /**
   * Quem abre uma conversa **de fora da lista** — um cartão da caixa de
   * entrada, "Enviar mensagem" num perfil, um link de mensagem, a barra de voz
   * — muda a store sem passar por nenhum item de lista. Aqui isso vira a tela
   * certa, com a aba junto: senão a conversa apareceria empilhada por cima da
   * lista de outra seção.
   *
   * O gatilho é a mudança do `activeId` das conversas, e só **depois do
   * primeiro toque da sessão**. É o que separa navegação de carga: no boot a
   * `openList` reabre sozinha a última conversa, e sem essa condição o app
   * abriria dentro dela — o Discord do celular abre na aba de servidores.
   */
  const dmAtiva = useDMs((s) => s.activeId);
  const amigosAbertos = useFriends((s) => s.open);
  useEffect(() => {
    if (!jaInteragiu.current) return;
    if (view !== "dm" || amigosAbertos) return;
    if (!dmAtiva) return;
    const estado = useMobile.getState();
    if (estado.aba === "mensagens" && telaDoTopo(estado) === "conversa") return;
    mobile.irParaAba("mensagens");
    mobile.empilhar("conversa");
  }, [view, dmAtiva, amigosAbertos]);

  /** Mesma regra para "Amigos", que a caixa de entrada abre pelos pedidos. */
  useEffect(() => {
    if (!jaInteragiu.current || !amigosAbertos) return;
    const estado = useMobile.getState();
    if (estado.aba === "mensagens" && telaDoTopo(estado) === "amigos") return;
    mobile.irParaAba("mensagens");
    mobile.empilhar("amigos");
  }, [amigosAbertos]);

  const base =
    aba === "servidores" ? (
      <TelaServidores />
    ) : aba === "mensagens" ? (
      <TelaMensagens />
    ) : aba === "notificacoes" ? (
      <TelaNotificacoes />
    ) : (
      <TelaVoce />
    );

  return (
    <div
      /* `100dvh`, e não `h-full`: no celular a barra de endereço aparece e some
         durante a rolagem, e `100vh` é a altura da janela **sem** ela — o
         composer ficaria escondido atrás da barra do navegador. `dvh` mede a
         janela como ela está agora, e é também o que acompanha o teclado com o
         `interactiveWidget: "resizes-content"` do `app/layout.tsx`.

         `overflow-hidden` + `overscroll-none`: quem rola é a lista de dentro. Sem
         isto o "puxar para atualizar" do Chrome dispara ao rolar a conversa
         para cima. */
      className="flex h-[100dvh] w-full flex-col overflow-hidden overscroll-none bg-chat pt-[env(safe-area-inset-top)]"
      data-shell-mobile
      onPointerDownCapture={() => {
        jaInteragiu.current = true;
      }}
    >
      <div className="relative min-h-0 flex-1" onClickCapture={aoTocarNaLista}>
        {base}
        {topo === "canal" && (
          <TelaEmpilhada>
            <TelaDeCanal />
          </TelaEmpilhada>
        )}
        {topo === "conversa" && (
          <TelaEmpilhada>
            <TelaDeDM />
          </TelaEmpilhada>
        )}
        {topo === "amigos" && (
          <TelaEmpilhada>
            <TelaDeAmigos />
          </TelaEmpilhada>
        )}
        {topo === "voz" && (
          <TelaEmpilhada>
            <TelaDeVoz />
          </TelaEmpilhada>
        )}
      </div>

      <BarraDeVozMobile />
      <BarraDeAbas />

      {/* os mesmos hospedeiros globais do shell de desktop */}
      <VoiceLayer />
      <ModalHost />
      <ContextMenuHost />
      <ProfilePopoverHost />
      <Toasts />
      <TelaDeAbertura />
    </div>
  );
}

/**
 * O botão "voltar" do Android desfaz uma camada, como em qualquer app.
 *
 * A conta é simples: enquanto houver alguma camada aberta (tela empilhada,
 * painel de membros ou folha), o app mantém **uma** entrada sentinela no
 * histórico. O `popstate` a consome, desfaz uma camada, e o efeito repõe a
 * sentinela se ainda sobrou algo. Sem camada nenhuma, a sentinela é devolvida
 * e o próximo "voltar" sai do site — que é o que se espera.
 *
 * Não há rota por tela de propósito: a web é exportada estática e servida ao
 * app de desktop também; inventar URLs para as telas do celular mudaria o
 * roteamento dos dois.
 */
function useVoltarDoAndroid(profundidadeAtual: number) {
  useEffect(() => {
    const aoVoltar = () => {
      sentinela = false;
      useMobile.getState().voltar();
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    if (profundidadeAtual > 0 && !sentinela) {
      sentinela = true;
      window.history.pushState({ streamzMobile: true }, "");
      return;
    }
    if (profundidadeAtual === 0 && sentinela) {
      // a camada foi fechada pelo botão da tela: a sentinela sobrando faria o
      // primeiro "voltar" do sistema não sair do app
      sentinela = false;
      window.history.back();
    }
  }, [profundidadeAtual]);
}

/** Há uma entrada nossa no histórico agora? Módulo, não estado: é do documento. */
let sentinela = false;
