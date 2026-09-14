"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { TelaDeAplicativos } from "@/components/apps/DiretorioDeApps";
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
import {
  assentar,
  decidirSoltura,
  limitar,
  movimentoReduzido,
  pintarVeu,
  useArrastoHorizontal,
} from "@/hooks/useArrastoHorizontal";
import {
  camadasNoCelular,
  haCamadaNoCelular,
  useVoltarNoCelular,
} from "@/hooks/useVoltarNoCelular";
import { destravarSons } from "@/lib/ringtone";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import {
  mobile,
  profundidade,
  telaDoTopo,
  useMobile,
  type TelaMobile,
} from "@/stores/mobile";
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
 *
 * ## E por arrasto
 *
 * O toque continua sendo o caminho de ida; o arrasto é o outro, e é o que o
 * Discord do celular usa o tempo todo (ver `useGestosDoShell`, mais abaixo):
 * na conversa, arrastar para a direita revela a coluna de canais por baixo e a
 * conversa fica estacionada na borda; arrastar para a esquerda traz a lista de
 * membros.
 */
export default function ShellMobile() {
  const aba = useMobile((s) => s.aba);
  const pilhas = useMobile((s) => s.pilhas);
  const topo = telaDoTopo({ aba, pilhas });
  const prof = useMobile(profundidade);
  const voltar = useMobile((s) => s.voltar);
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

  /** a área das telas (base + pilha), onde o arrasto é ouvido. */
  const regiao = useRef<HTMLDivElement>(null);
  /** a tela do topo da pilha, que é quem o dedo arrasta. */
  const tela = useRef<HTMLDivElement>(null);
  const gaveta = useGestosDoShell(regiao, tela);

  /**
   * Com a gaveta aberta a conversa ainda está na pilha, estacionada na borda.
   * Tocar noutro item da lista **troca** a conversa estacionada em vez de
   * empilhar outra por cima — senão cada canal visitado pela gaveta viraria um
   * "voltar" a mais — e a traz de volta para a frente.
   */
  function abrirTela(destino: TelaMobile) {
    if (gaveta.abertaAgora.current) {
      mobile.trocarTopo(destino);
      gaveta.fechar();
      return;
    }
    mobile.empilhar(destino);
  }

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
        abrirTela(ativo?.type === "VOICE" ? "voz" : "canal");
      }, 0);
      return;
    }
    if (alvo.closest("[data-dm-button]")) {
      abrirTela("conversa");
      return;
    }
    if (alvo.closest("[data-amigos-button]")) {
      abrirTela("amigos");
      return;
    }
    /*
      ── j-bots · F4 ── "Descobrir aplicativos" na rail.

      Mesma regra dos três acima, e pela mesma razão: quem abre o diretório
      continua sendo o botão do `GuildRail` e a store dele (`useAplicativos`);
      este shell só percebe que houve um toque no item e empilha a tela cheia
      por cima. Sem `setTimeout`: ao contrário do canal, aqui não é preciso
      perguntar nada à store depois do `onClick` — a tela é sempre a mesma.
    */
    if (alvo.closest("[data-apps-button]")) {
      abrirTela("aplicativos");
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

  const conteudoDoTopo =
    topo === "canal" ? (
      <TelaDeCanal />
    ) : topo === "conversa" ? (
      <TelaDeDM />
    ) : topo === "amigos" ? (
      <TelaDeAmigos />
    ) : topo === "voz" ? (
      <TelaDeVoz />
    ) : topo === "aplicativos" ? (
      /* ── j-bots · F4 ── o diretório de aplicativos, empilhado pela rail */
      <TelaDeAplicativos aoSair={() => voltar()} />
    ) : null;

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
      className="flex h-[100dvh] w-full flex-col overflow-hidden overscroll-none bg-background-base-lower pt-[env(safe-area-inset-top)]"
      data-shell-mobile
      onPointerDownCapture={() => {
        jaInteragiu.current = true;
      }}
    >
      {/* o toque longo vale no shell inteiro: é o botão direito do telefone, e
          sem ele os menus de canal, servidor, conversa e membro não existiriam
          (ver `AreaDeToqueLongo`) */}
      <AreaDeToqueLongo>
        {/*
          `touch-pan-y`: o navegador continua dono da rolagem vertical (as
          listas rolam como sempre), e o eixo horizontal fica para o arrasto —
          sem isto o primeiro movimento de lado vira um `pointercancel` e a
          conversa nunca acompanha o dedo. Um rolador horizontal lá dentro (as
          abas de Amigos, um bloco de código) continua rolando: o `touch-action`
          só é somado até o rolador mais próximo.
        */}
        <div
          ref={regiao}
          className="relative min-h-0 flex-1 touch-pan-y"
          onClickCapture={aoTocarNaLista}
        >
          {/*
            Com a gaveta aberta a coluna de canais termina **antes** da borda da
            conversa estacionada, e o vão tem a cor da rail. Medido em
            `discord-mobile-servidor-2024.png` (1,9707 px/pt), na linha y=600:
            a lista acaba em x=675, o vão escuro vai de 676 a 690 (15 px =
            7,6 pt → 8) e a conversa começa em 691,5 — 47,5 px = 24 pt até a
            borda. 24 + 8 = 32 de reserva. Sem ela a borda da conversa cobriria
            o contador de não lidas no fim de cada linha de canal.

            A reserva entra quando o eixo trava (uma vez por gesto, não por
            quadro) e sai quando a conversa volta inteira: o que se move com o
            dedo é só `transform`.
          */}
          <div
            className={`h-full ${gaveta.bordaReservada ? "bg-background-base-lowest pr-[32px]" : ""}`}
          >
            {base}
          </div>
          {conteudoDoTopo && (
            <TelaEmpilhada
              key={topo ?? undefined}
              ref={tela}
              /* canto de cima da conversa estacionada: 8 pt, ajuste de arco
                 em `discord-mobile-servidor-2024.png` — a borda de cima está
                 em y=106 px no miolo reto, 108 em x=700 e 116 em x=692, o que
                 fecha com um raio de 16 px = 8 pt. O canto de baixo não aparece
                 na captura (a barra de abas passa por cima dele) e fica reto */
              className={gaveta.bordaReservada ? "overflow-hidden rounded-tl-[8px]" : ""}
            >
              {conteudoDoTopo}
              {gaveta.aberta && (
                /* a conversa estacionada não é interativa: tocar na borda a
                   traz de volta, como no Discord, e nada lá dentro (o composer,
                   um link) recebe o toque por engano */
                <button
                  type="button"
                  aria-label="Voltar para a conversa"
                  className="absolute inset-0 z-50"
                  onClick={() => gaveta.fechar()}
                />
              )}
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

        Com a gaveta aberta ela volta: em `discord-mobile-servidor-2024.png` a
        conversa estacionada aparece na borda e a barra de abas está lá. No
        Discord a barra passa **por cima** da conversa; aqui ela entra no fluxo
        e encurta a área das telas, porque sobrepor exigiria saber a altura da
        barra (que é do `BarraDeAbas`) para reservar embaixo da coluna de
        canais. Com 24 pt de conversa à vista, a diferença não aparece.
      */}
      {(topo === null || gaveta.aberta) && <BarraDeAbas />}

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

/**
 * Largura da conversa que fica à vista com a gaveta aberta: 47,5 px de
 * `discord-mobile-servidor-2024.png` (x 691,5 → 739, linha y=600) ÷ 1,9707 =
 * 24 pt. É também a medida da reserva da coluna de canais (mais o vão de 8).
 */
const BORDA_DA_CONVERSA = 24;

const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;
const TRANSFORM_DA_GAVETA_ABERTA = `translate3d(calc(100% - ${BORDA_DA_CONVERSA}px), 0, 0)`;

type ModoDoArrasto = "abrir-gaveta" | "fechar-gaveta" | "voltar" | "membros";

/** A pilha da aba atual, lida no momento do gesto (não no render). */
function pilhaAgora() {
  const s = useMobile.getState();
  const pilha = s.pilhas[s.aba];
  return { s, pilha, topo: pilha[pilha.length - 1] ?? null };
}

/**
 * A conversa pode ser estacionada na borda? Só na aba Início, com **uma** tela
 * na pilha e essa tela sendo uma conversa: é a única situação em que o que está
 * por baixo dela (a base da aba, rail + canais) é mesmo a coluna que o Discord
 * revela. Com duas telas na pilha a de baixo não está montada, e arrastar
 * mostraria a base no lugar dela.
 */
function podeEstacionar(): boolean {
  const { s, pilha, topo } = pilhaAgora();
  return s.aba === "inicio" && pilha.length === 1 && (topo === "canal" || topo === "conversa");
}

/**
 * O painel de membros/perfil que está na tela, se houver.
 *
 * **Isto é um acoplamento, e está aqui de propósito até ter dono.** O
 * `PainelDeslizante` mora em `telas-de-conversa.tsx`, que não é deste arquivo, e
 * não expõe `ref` nem deslocamento. Para ele acompanhar o dedo sem mexer lá, o
 * shell o encontra pelo que ele já tem de único — o `aside` de diálogo com a
 * `anim-deslizar-direita`, que nenhuma outra peça usa — e escreve o `transform`
 * direto no nó, como faz com a tela empilhada. O jeito certo é o painel receber
 * a `ref` (registrado no PR).
 */
function painelLateral(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>("aside.anim-deslizar-direita[role='dialog']");
}

/**
 * Tira a animação de entrada do caminho: uma animação CSS vence o `transform`
 * inline enquanto roda, e a camada ficaria surda ao dedo nos primeiros 220ms.
 * Fica `none` até o nó sair do DOM — apagar o valor inline religaria a classe,
 * e a entrada tocaria de novo.
 */
function tirarAnimacao(el: HTMLElement | null) {
  if (!el) return;
  el.style.animation = "none";
  el.style.transition = "none";
}

function fecharMembros() {
  if (useMobile.getState().membrosAbertos) useMobile.setState({ membrosAbertos: false });
}

/**
 * Os arrastos do shell.
 *
 * **Na conversa** (canal ou DM empilhado):
 *
 * - **para a direita** revela a base da aba — a rail e a coluna de canais — por
 *   baixo, com a conversa acompanhando o dedo. Soltado além da metade (ou num
 *   arremesso), a conversa fica **estacionada** com 24 pt à vista na borda
 *   direita e a barra de abas volta: é `discord-mobile-servidor-2024.png`. Um
 *   toque na borda, um arrasto para a esquerda em qualquer lugar ou o "voltar"
 *   do sistema a trazem de volta (a gaveta aberta é uma camada do
 *   `useVoltarNoCelular`). A seta do cabeçalho continua desempilhando, como
 *   antes;
 * - **para a esquerda** abre a lista de membros (o mesmo `PainelDeslizante` do
 *   título), que entra acompanhando o dedo. Com ela aberta, arrastá-la para a
 *   direita a fecha.
 *
 * **Em Amigos e no diretório de aplicativos**, com uma tela só na pilha, o
 * arrasto para a direita desempilha — é a volta por gesto de qualquer pilha do
 * iOS, e a base que aparece por baixo é mesmo a tela de destino.
 *
 * O palco da chamada fica de fora: tem gestos próprios (a alça dos controles,
 * a grade), e desempilhar a chamada por um arrasto de lado é o tipo de acidente
 * que só se descobre no meio de uma call.
 *
 * Com movimento reduzido nada acompanha o dedo: soltar decide, e a camada troca
 * de lugar sem animação.
 */
function useGestosDoShell(regiao: RefObject<HTMLDivElement>, tela: RefObject<HTMLDivElement>) {
  const [aberta, setAberta] = useState(false);
  /** a coluna de canais está encolhida para a borda da conversa (gaveta não fechada de todo). */
  const [bordaReservada, setBordaReservada] = useState(false);
  /** o valor de agora, para quem lê fora do render (toque na lista, gesto). */
  const abertaAgora = useRef(false);
  const modo = useRef<ModoDoArrasto | null>(null);
  /** curso do arrasto em curso, em px, medido ao travar o eixo. */
  const curso = useRef(0);
  /** a lista de membros foi aberta por um arrasto que ainda não soltou. */
  const membrosPeloDedo = useRef(false);
  const membrosAbertos = useMobile((s) => s.membrosAbertos);
  const aba = useMobile((s) => s.aba);
  const pilhas = useMobile((s) => s.pilhas);

  const abrir = useCallback(() => {
    abertaAgora.current = true;
    setAberta(true);
    setBordaReservada(true);
    const el = tela.current;
    // o teclado não fica aberto atrás de uma conversa estacionada
    const foco = document.activeElement;
    if (el && foco instanceof HTMLElement && el.contains(foco)) foco.blur();
    tirarAnimacao(el);
    assentar(el, TRANSFORM_DA_GAVETA_ABERTA, true);
  }, [tela]);

  const fechar = useCallback(
    (animar = true) => {
      abertaAgora.current = false;
      setAberta(false);
      const el = tela.current;
      assentar(el, "translate3d(0, 0, 0)", animar, () => {
        // reaberta, ou já agarrada por outro arrasto de gaveta, no meio do
        // caminho: quem soltar esse arrasto decide o resto
        if (abertaAgora.current) return;
        if (modo.current === "abrir-gaveta" || modo.current === "fechar-gaveta") return;
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
        }
        setBordaReservada(false);
      });
    },
    [tela],
  );

  useVoltarNoCelular(aberta, fechar);

  // trocou de aba, a pilha mudou por outro caminho (a caixa de entrada abriu
  // uma DM, a barra de voz abriu o palco): a gaveta não tem mais o que guardar
  useEffect(() => {
    if (abertaAgora.current && !podeEstacionar()) fechar(false);
  }, [aba, pilhas, fechar]);

  useArrastoHorizontal(regiao, {
    ligado: true,
    podeComecar: (e) => {
      if (useUI.getState().modals.length > 0) return false;
      // a própria gaveta aberta é uma camada; qualquer outra por cima manda
      if (camadasNoCelular() > (abertaAgora.current ? 1 : 0)) return false;
      const s = useMobile.getState();
      if (s.folha || s.membrosAbertos) return false;
      if (abertaAgora.current) return true;
      const el = tela.current;
      return !!el && e.target instanceof Node && el.contains(e.target);
    },
    aoTravar: (sentido) => {
      const el = tela.current;
      if (!el) return null;
      const largura = el.offsetWidth;
      if (abertaAgora.current) {
        if (sentido !== -1) return null;
        modo.current = "fechar-gaveta";
        curso.current = largura - BORDA_DA_CONVERSA;
        tirarAnimacao(el);
        return { min: -curso.current, max: 0 };
      }
      const { pilha, topo } = pilhaAgora();
      if (sentido === 1) {
        if (podeEstacionar()) {
          modo.current = "abrir-gaveta";
          curso.current = largura - BORDA_DA_CONVERSA;
          setBordaReservada(true);
          tirarAnimacao(el);
          return { min: 0, max: curso.current };
        }
        if (pilha.length === 1 && (topo === "amigos" || topo === "aplicativos")) {
          modo.current = "voltar";
          curso.current = largura;
          tirarAnimacao(el);
          return { min: 0, max: largura };
        }
        return null;
      }
      if (topo === "canal" || topo === "conversa") {
        modo.current = "membros";
        curso.current = largura;
        if (!movimentoReduzido()) {
          membrosPeloDedo.current = true;
          useMobile.getState().abrirMembros();
        }
        return { min: -largura, max: 0 };
      }
      return null;
    },
    aoMover: (dx) => {
      if (movimentoReduzido()) return;
      const el = tela.current;
      switch (modo.current) {
        case "abrir-gaveta":
        case "voltar":
          if (el) el.style.transform = `translate3d(${dx}px, 0, 0)`;
          return;
        case "fechar-gaveta":
          if (el) el.style.transform = `translate3d(${curso.current + dx}px, 0, 0)`;
          return;
        case "membros": {
          const painel = painelLateral();
          if (!painel) return; // ainda montando: o próximo quadro alcança
          tirarAnimacao(painel);
          const w = painel.offsetWidth;
          const x = limitar(w + dx, 0, w);
          painel.style.transform = `translate3d(${x}px, 0, 0)`;
          pintarVeu(painel.parentElement, w ? 1 - x / w : 1);
          return;
        }
      }
    },
    aoSoltar: (dx, velocidade) => soltar(dx, velocidade),
    // o sistema tomou o toque: tudo volta para onde estava antes do gesto
    aoCancelar: () => soltar(0, 0),
  });

  function soltar(dx: number, velocidade: number) {
    const m = modo.current;
    modo.current = null;
    const el = tela.current;
    const c = curso.current;
    switch (m) {
      case "abrir-gaveta":
        if (decidirSoltura({ progresso: c ? dx / c : 0, velocidade, sentido: 1 })) abrir();
        else fechar();
        return;
      case "fechar-gaveta":
        if (decidirSoltura({ progresso: c ? -dx / c : 0, velocidade, sentido: -1 })) fechar();
        else abrir();
        return;
      case "voltar":
        if (decidirSoltura({ progresso: c ? dx / c : 0, velocidade, sentido: 1 })) {
          assentar(el, "translate3d(100%, 0, 0)", true, () => useMobile.getState().voltar());
        } else {
          assentar(el, "", true);
        }
        return;
      case "membros": {
        membrosPeloDedo.current = false;
        const painel = painelLateral();
        const w = painel?.offsetWidth ?? c;
        const abrirPainel = decidirSoltura({ progresso: w ? -dx / w : 0, velocidade, sentido: -1 });
        if (movimentoReduzido()) {
          if (abrirPainel) useMobile.getState().abrirMembros();
          return;
        }
        if (!painel) {
          // soltou antes de o painel montar: se abre, a entrada dele resolve
          if (!abrirPainel) fecharMembros();
          return;
        }
        assentarPainel(painel, abrirPainel);
        return;
      }
    }
  }

  /*
    O painel acabou de montar por um arrasto: antes da primeira pintura ele sai
    da posição de entrada da animação e vai para fora da tela, de onde o dedo o
    puxa. E o `touch-action` do véu vai para `pan-y` — o painel é um portal, fora
    da área do shell, e sem isto o arrasto de fechar nunca receberia um
    `pointermove` de lado.
  */
  useEfeitoDeLeiaute(() => {
    if (!membrosAbertos) return;
    const painel = painelLateral();
    if (!painel) return;
    if (painel.parentElement) painel.parentElement.style.touchAction = "pan-y";
    if (!membrosPeloDedo.current) return;
    tirarAnimacao(painel);
    painel.style.transform = "translate3d(100%, 0, 0)";
    pintarVeu(painel.parentElement, 0);
  }, [membrosAbertos]);

  /** o painel de membros aberto: arrastá-lo para a direita o fecha. */
  const painelArrastado = useRef<HTMLElement | null>(null);
  useArrastoHorizontal(null, {
    ligado: membrosAbertos,
    podeComecar: (e) => {
      if (useUI.getState().modals.length > 0 || camadasNoCelular() > 0) return false;
      if (useMobile.getState().folha) return false;
      const painel = painelLateral();
      const veu = painel?.parentElement;
      if (!painel || !veu || !(e.target instanceof Node) || !veu.contains(e.target)) return false;
      painelArrastado.current = painel;
      return true;
    },
    aoTravar: (sentido) => {
      const painel = painelArrastado.current;
      if (sentido !== 1 || !painel) return null;
      tirarAnimacao(painel);
      return { min: 0, max: painel.offsetWidth };
    },
    aoMover: (dx) => {
      const painel = painelArrastado.current;
      if (!painel || movimentoReduzido()) return;
      const w = painel.offsetWidth;
      painel.style.transform = `translate3d(${dx}px, 0, 0)`;
      pintarVeu(painel.parentElement, w ? 1 - dx / w : 1);
    },
    aoSoltar: (dx, velocidade) => {
      const painel = painelArrastado.current;
      painelArrastado.current = null;
      if (!painel) return;
      const w = painel.offsetWidth;
      const fecharPainel = decidirSoltura({ progresso: w ? dx / w : 0, velocidade, sentido: 1 });
      if (movimentoReduzido()) {
        if (fecharPainel) fecharMembros();
        return;
      }
      assentarPainel(painel, !fecharPainel);
    },
    aoCancelar: () => {
      const painel = painelArrastado.current;
      painelArrastado.current = null;
      if (painel) assentarPainel(painel, true);
    },
  });

  return { aberta, bordaReservada, abertaAgora, fechar };
}

/** Leva o painel de membros até aberto (0) ou até fora da tela, e aí o fecha. */
function assentarPainel(painel: HTMLElement, aberto: boolean) {
  const veu = painel.parentElement;
  if (aberto) {
    pintarVeu(veu, 1, true);
    assentar(painel, "translate3d(0, 0, 0)", true, () => {
      painel.style.transform = "";
      painel.style.transition = "";
      pintarVeu(veu, null);
    });
    return;
  }
  pintarVeu(veu, 0, true);
  assentar(painel, "translate3d(100%, 0, 0)", true, fecharMembros);
}
