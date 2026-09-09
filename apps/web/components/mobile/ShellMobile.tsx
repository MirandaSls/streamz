"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import BarraDeAbas from "@/components/mobile/BarraDeAbas";
import BarraDeVozMobile from "@/components/mobile/BarraDeVozMobile";
import { TelaEmpilhada } from "@/components/mobile/pecas";
import { TelaInicio, TelaNotificacoes, TelaVoce } from "@/components/mobile/telas-base";
import {
  AreaDeToqueLongo,
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
import { haCamadaNoCelular } from "@/hooks/useVoltarNoCelular";
import { destravarSons } from "@/lib/ringtone";
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
  /** já houve um toque nesta sessão? separa navegação de carga inicial. */
  const jaInteragiu = useRef(false);

  /**
   * A quarta coluna do desktop fica desligada: no celular a lista de membros e
   * o cartão de perfil são o painel deslizante do cabeçalho, não uma coluna ao
   * lado. Sem isto o `DMView` montaria os dois ao mesmo tempo.
   */
  useEffect(() => {
    // **atribui**, não alterna: `toggleMembers` invertia o que estivesse lá, e
    // qualquer caminho que ligasse a coluna de volta a trazia junto com o
    // painel deslizante. A store não tem um setter, então o `setState` direto é
    // o que diz "no celular esta coluna não existe" sem ambiguidade.
    useUI.setState({ membersOpen: false });
    // só na montagem: depois disso quem manda é o painel deslizante
  }, []);

  useVoltarDoAndroid(prof);
  useDestravarSons();

  /**
   * Não há ligação aba↔`view` para manter: a aba **Início** abriga os dois
   * valores de `view`, e quem troca entre eles é a rail — a bolha de conversas
   * põe `"dm"`, o ícone de um servidor põe `"guild"`, exatamente como no
   * desktop. Foi a estrutura de quatro abas que precisava dessa costura.
   */
  const view = useUI((s) => s.view);

  /**
   * Delegação do toque na lista da aba. Cada `data-*` abaixo já existia ou é um
   * atributo sem pixel nenhum no arquivo do desktop — nada aqui muda o que a
   * lista desenha.
   */
  function aoTocarNaLista(e: MouseEvent<HTMLDivElement>) {
    const alvo = e.target as HTMLElement | null;
    if (!alvo) return;
    if (alvo.closest("[data-channel-button]")) {
      /*
        Canal de voz: o clique já entrou na chamada (`voice-entrada.ts`), e a
        tela que interessa é o palco, não a conversa de texto do canal.

        A pergunta "que canal é este?" só pode ser feita **depois** do
        `onClick` do botão. Esta escuta é de **captura**, para nunca perder um
        toque, e a captura roda antes do botão — lendo a store aqui a resposta
        era sempre o canal *anterior*, e tocar num canal de voz abria a tela de
        texto dele.

        `setTimeout(…, 0)`, e **não** `queueMicrotask`: o navegador roda um
        ponto de verificação de microtarefas **depois de cada ouvinte**, não
        depois do despacho inteiro — uma microtarefa enfileirada na captura
        ainda corre antes do `onClick` do botão, e o defeito continuava igual.
        Uma macrotarefa espera o despacho terminar, com o `select()` já feito.
      */
      window.setTimeout(() => {
        const canal = useChannels.getState();
        const ativo = canal.channels.find((c) => c.id === canal.activeChannelId);
        mobile.empilhar(ativo?.type === "VOICE" ? "voz" : "canal");
      }, 0);
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
    if (estado.aba === "inicio" && telaDoTopo(estado) === "conversa") return;
    mobile.irParaAba("inicio");
    mobile.empilhar("conversa");
  }, [view, dmAtiva, amigosAbertos]);

  /** Mesma regra para "Amigos", que a caixa de entrada abre pelos pedidos. */
  useEffect(() => {
    if (!jaInteragiu.current || !amigosAbertos) return;
    const estado = useMobile.getState();
    if (estado.aba === "inicio" && telaDoTopo(estado) === "amigos") return;
    mobile.irParaAba("inicio");
    mobile.empilhar("amigos");
  }, [amigosAbertos]);

  const base =
    aba === "inicio" ? (
      <TelaInicio />
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
      {/* o toque longo vale no shell inteiro: é o botão direito do telefone, e
          sem ele os menus de canal, servidor, conversa e membro não existiriam
          (ver `AreaDeToqueLongo`) */}
      <AreaDeToqueLongo>
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
      </AreaDeToqueLongo>

      <BarraDeVozMobile />
      {/*
        A barra de abas **some** quando há tela empilhada — é o que o Discord
        faz, e dá para ver na captura `discord-mobile-chat-canal-2024.png`: a
        conversa aberta vai do cabeçalho ao composer, sem barra nenhuma embaixo.
        Não é só fidelidade: são 48px de timeline de volta num aparelho que tem
        844 de altura, e trocar de seção com uma conversa aberta é justamente o
        que a seta de voltar já resolve.
      */}
      {topo === null && <BarraDeAbas />}

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
 *
 * **Com qualquer camada por cima, esta pilha não se mexe.** A camada tem a
 * própria sentinela (`hooks/useVoltarNoCelular`), e o `popstate` é um evento
 * só: sem esta guarda um "voltar" dentro das configurações fechava a caixa
 * **e** a conversa atrás dela.
 *
 * São **duas** perguntas porque são duas populações diferentes, e nenhuma
 * contém a outra:
 *
 * - `useUI.modals` é o que passa pelo `ModalHost` — configurações, confirmação,
 *   visualizador de imagem.
 * - `haCamadaNoCelular()` é o que sobe por portal sem entrar na store: a folha
 *   de emoji, o cartão de perfil, o painel de sons, a folha do menu de
 *   contexto, o popover ancorado.
 *
 * A segunda foi acrescentada depois de medir: a folha de emoji mora no
 * `Composer`, ou seja **dentro** da tela de canal. Com só a primeira guarda, o
 * ouvinte daqui (que é o primeiro a rodar) desfazia a tela, o React descarregava
 * o `Composer` junto e a folha sumia antes de o ouvinte da camada rodar — aí não
 * havia mais camada nem instantâneo para repor a tela. Um "voltar" fechava a
 * folha **e** saía do canal.
 */
function useVoltarDoAndroid(profundidadeAtual: number) {
  useEffect(() => {
    const aoVoltar = () => {
      if (useUI.getState().modals.length > 0) return;
      if (haCamadaNoCelular()) return;
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

/**
 * Destrava o áudio no **primeiro toque da sessão**.
 *
 * No iPhone nenhum `Audio.play()` funciona antes de um gesto do usuário, e a
 * permissão é por elemento — então o som de mensagem nova e o toque de chamada
 * recebida, que chegam de fora, sairiam mudos até alguém tocar na tela por
 * outro motivo. O `toque-com-gesto.ts` só resolve o som **em curso** (o toque
 * em loop); um som de uma vez só não tem o que retomar.
 *
 * `once` e `passive`: uma vez basta (o documento fica ativado para sempre), e
 * o ouvinte não cancela nada — declarar `passive` evita que ele atrase a
 * rolagem. Fica no shell do celular porque é lá que o problema existe: no
 * desktop e no app do Windows o autoplay já é liberado (o WebView2 recebe
 * `--autoplay-policy=no-user-gesture-required`).
 *
 * **Só um aparelho real prova isto.** O Chromium sem cabeça não aplica a
 * política do iOS, então o render passa igual com e sem esta linha.
 */
function useDestravarSons() {
  useEffect(() => {
    const destravar = () => void destravarSons();
    const opcoes = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", destravar, opcoes);
    window.addEventListener("touchstart", destravar, opcoes);
    return () => {
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("touchstart", destravar);
    };
  }, []);
}
