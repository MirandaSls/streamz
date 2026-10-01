"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  AlertTriangle,
  AtSign,
  ChevronDown,
  MessageSquare,
  Phone,
  RotateCw,
  UserPlus,
} from "@/components/ui/icones";
import {
  SCREEN_QUALITY,
  displayNameOf,
  isGroupChannel,
  type PublicUser,
  type VoiceStateEvent,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import FileiraDeControles from "@/components/voice/FileiraDeControles";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { classeDaMoldura } from "@/components/voice/moldura-animada";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useOcultarInativo, type PropsDaMoldura } from "@/components/voice/useOcultarInativo";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useEhPaisagem } from "@/hooks/useOrientacao";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { ui, useUI } from "@/stores/ui";
import { participantesDe, telasDe, useVoice } from "@/stores/voice";

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
 * tela: quanto tempo durou é informação de depois, que lá aparece na mensagem
 * de sistema do fim da chamada — na tela, ele só faria a conversa parecer
 * cronometrada.
 *
 * A duração fica registrada mesmo assim: o `Call` guarda início e fim (fechado
 * por `RegistroDeChamadaService` na API) e vira a mensagem de sistema
 * `SYSTEM_CALL` da conversa quando a chamada acaba — "**fulano** iniciou uma
 * chamada que durou 5 horas.", ou "Você perdeu uma chamada de **fulano**..."
 * para quem não entrou.
 *
 * ## Duas maneiras de "aumentar o palco", e elas não são a mesma
 *
 * 1. **Expandir** (a seta de `BotaoDeExpandir`, `ui.palcoExpandido`): o palco
 *    se promove sobre a **região de conteúdo** — cabeçalho da conversa, chat e
 *    coluna da direita ficam atrás dele — e a **barra lateral da esquerda
 *    continua na tela**. É um modo nosso, dentro da janela, e sai no Esc.
 * 2. **Tela cheia** (`IconesDoCanto`, `fullscreen.ts`): a de verdade. No
 *    navegador é a Fullscreen API; no app é emulada (janela em tela cheia mais
 *    o elemento promovido por CSS nosso), porque o Tauri não habilita a tela
 *    cheia de elemento — ver o cabeçalho de `fullscreen.ts`. Some com a barra
 *    lateral, com o navegador e com o sistema.
 *
 * As duas continuam existindo porque respondem a pedidos diferentes ("quero a
 * chamada maior, sem perder a navegação" e "quero só a chamada"), e nenhum dos
 * dois botões mudou de ação: a expansão é botão novo. No Discord a primeira
 * não tem botão próprio — lá quem faz isso é o balão que esconde a conversa
 * (print `2026-09-04 001246`, com o palco ocupando a região e a lateral
 * intacta) e a seta do canto inferior esquerdo da faixa de chamada de conversa
 * (print `2026-08-31 122612`, x≈407 y≈501), que é de onde a nossa saiu.
 */
/**
 * A chave de um tile de **tela** é `"<userId>:<trackSid>"`; a de uma pessoa é
 * só o id dela. É a mesma chave que `chaveDoTileDeTela` monta em
 * `assinaturas-de-tela.ts` — aqui ela é desmontada para o cabeçalho saber de
 * quem é a transmissão que está no destaque.
 */
export function telaNoDestaque(focado: string | null): { userId: string; trackSid: string } | null {
  if (!focado) return null;
  const corte = focado.indexOf(":");
  if (corte < 0) return null;
  return { userId: focado.slice(0, corte), trackSid: focado.slice(corte + 1) };
}

/**
 * O selo de qualidade da transmissão em destaque — `"720p 30FPS"` na print
 * `p5`, onde ele antecede o "AO VIVO" vermelho.
 *
 * **Diz só o que se sabe.** A altura vem das dimensões que o servidor de mídia
 * publica junto com a faixa (`TrackPublication.dimensions`) e vale para
 * qualquer um; a taxa de quadros **não trafega** — ela é escolha de quem
 * transmite (`SCREEN_QUALITY`), e só a minha está nesta máquina. Para a tela de
 * outra pessoa o selo sai `"1080p"`, sem fps, em vez de um número inventado.
 * `null` quando não se sabe nem a resolução: aí fica só o "AO VIVO".
 */
export function seloDaTransmissao(altura?: number | null, fps?: number | null): string | null {
  const partes: string[] = [];
  if (altura) partes.push(`${altura}p`);
  if (fps) partes.push(`${fps}FPS`);
  return partes.length > 0 ? partes.join(" ") : null;
}

/**
 * As classes que dizem **como o palco ocupa espaço** — e são duas coisas
 * diferentes. O resto (`flex flex-col bg-black`) não muda entre os modos.
 *
 * **Expandido**: `absolute inset-0` sobe até o `relative` da região de conteúdo
 * (`app/app/page.tsx`, a `<div className="relative flex min-w-0 flex-1">` que
 * embrulha o `DMView`) — nenhum invólucro do caminho é posicionado, e o
 * `CallSplit` tira o `relative` do dele quando o modo está ligado, justamente
 * para não prender o palco na faixa. O resultado é o pedido: o palco cobre
 * cabeçalho, conversa e coluna da direita, e a barra lateral da esquerda, que é
 * irmã da região, continua. `z-20` porque o cabeçalho da conversa (`HeaderBar`)
 * flutua em `z-10` sobre a mesma região; o véu de modal é `z-50` e segue acima.
 *
 * **Na faixa**: item flexível da coluna do `CallSplit`, que tem altura
 * explícita — e o `min-h-0` é o que faz essa altura valer. Sem ele o
 * `min-height: auto` do item flexível vale o **min-content** do palco, que no
 * modo foco é o destaque em 16:9 (tirado da *largura*) mais os 106 da tira de
 * miniaturas e os 96 (`pb-24`) reservados aos controles flutuantes: ~890px numa
 * janela larga, contra os 199 da faixa. O palco ignorava a faixa e transbordava
 * por cima da conversa — o fundo preto por baixo do texto (nada na conversa é
 * posicionado) e os tiles e os controles por cima dele (esses são), que é
 * exatamente o que as prints `image.pbg` e `aaa.pbg` mostram. E a medida ainda
 * se realimentava: o destaque é dimensionado a partir da área medida, que só
 * era grande porque o palco havia crescido — o ponto fixo é o 16:9 da largura.
 *
 * Clipar o invólucro (`overflow-hidden` no `CallSplit`) **não** é a correção:
 * esconderia o transbordo em vez de evitá-lo, e cortaria junto os popovers da
 * barra de controles, que numa faixa de 199px sobem de propósito para fora do
 * palco (o de "Ajustes de voz" mede até 60vh — ver `VoiceControls`).
 */
export function posicaoDoPalco(expandido: boolean): string {
  return expandido ? "absolute inset-0 z-20" : "relative min-h-0 min-w-0 flex-1";
}

/**
 * A folga **dentro** do palco: o que a área da grade cede ao rodapé.
 *
 * **Sempre 96 (`pb-24`) no desktop, faixa incluída.** Não é mais "onde ficam
 * os controles" que decide — eles continuam flutuando (a fileira do
 * `FileiraDeControles`, `absolute inset-x-0 bottom-5`) e ainda se apagam
 * sozinhos depois de três segundos de mouse parado (`useOcultarInativo`) —, é
 * que a cápsula **cobre** o que estiver por baixo dela sem essa reserva. Numa
 * faixa de 199px a print do usuário (2026-09-28, chamada de DM "Chamando…")
 * mostra exatamente esse defeito: a seta de expandir, a cápsula de controles
 * e os ícones do canto se encavalando na mesma altura, por cima do avatar e
 * do texto "Chamando…" — eram três `absolute` independentes na mesma faixa,
 * sem ninguém abrindo espaço para eles.
 *
 * **O Discord reserva o mesmo, mesmo com a barra flutuando.** Nas prints
 * `2026-08-31 123917`, `122612` e `160106` os controles ficam numa fileira
 * **própria**, abaixo dos tiles/avatares — nunca por cima deles. A print
 * `2026-09-21 às 15.04.09`, que antes justificava não reservar na faixa ("a
 * folga de baixo é a maior das duas, não a menor"), foi tirada com os
 * controles escondidos por inatividade (`useOcultarInativo`): sem a cápsula
 * na tela, claro que o respiro dela não fazia falta — mas ela nem sempre está
 * escondida.
 *
 * Numa faixa de 199 os 96 comem quase metade (~103 de área útil). Por isso
 * `Chamando` (mais abaixo neste arquivo) são dois avatares `xl` (80px), que
 * cabem inteiros nesse vão, em vez de a grade abrir mão da reserva. No palco cheio e no expandido os mesmos 96 são os 68 que a
 * cápsula ocupa (48 de altura a 20 do fundo) mais o respiro, e é onde mora a
 * **tira de miniaturas** do modo foco (`palcoUsaFoco`): destaque em cima,
 * tira encostada no fundo, e ela não flutua nem se esconde — coberta pela
 * cápsula, vira uma fileira de botões que não se clica. O Discord reserva o
 * mesmo ali: na print `2026-09-03 203909` (foco, escala 0,8075) a tira acaba
 * ~74 reais antes do fim da região, e é nesse vão que a barra fica.
 *
 * No celular a decisão é outra e mora no `PalcoMobile`, porque lá a folga de
 * baixo depende da orientação — é o mesmo trecho que o `VoicePanel` tem.
 */
export function folgaDaGrade(ehMobile: boolean): string {
  if (ehMobile) return "min-h-0 flex-1";
  // `px-2` = `FOLGA_DO_PALCO` (8px, print 101857 x=1911–1918); `pb-24` (96,
  // ver o comentário acima) vale em todos os modos desktop agora — faixa,
  // palco cheio e expandido não distinguem mais aqui.
  return "min-h-0 flex-1 px-2 pb-24";
}

/**
 * `useLayoutEffect` no cliente; no servidor o React avisa que não roda — é o
 * mesmo par de `hooks/useEhMobile.ts`.
 */
const useEfeitoDeLeiaute = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Há vídeo no palco: alguém com câmera ligada ou transmitindo tela, entre
 * quem está no canal agora (`estados`, o snapshot que o servidor já manda).
 * É o que decide se a moldura — cabeçalho e controles — pode sumir por
 * inatividade, ou fica sempre na tela: ver `molduraSempre`, dentro de
 * `CallStage`.
 */
export function temVideoNoPalco(estados: VoiceStateEvent[]): boolean {
  return estados.some((e) => e.video || e.screen);
}

export default function CallStage({
  channelId,
  titulo,
  chatAberto,
  onToggleChat,
  faixa = false,
}: {
  channelId: string;
  titulo: string;
  chatAberto: boolean;
  onToggleChat: () => void;
  /**
   * O palco está na **faixa** de 199px sobre a conversa (ver `CallSplit`).
   * Aí o título sai: ele fica a 199px do cabeçalho da conversa, que já diz o
   * mesmo nome, e — medido — o rótulo cai em cima do rosto de quem está na
   * chamada. Na print `2026-08-31 103419` a faixa do Discord não tem título
   * nenhum. Com a conversa fechada o palco é a coluna toda e o título volta.
   */
  faixa?: boolean;
}) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const conectadoAqui = useVoice((s) => s.channelId === channelId);
  // o cabeçalho muda de assunto quando uma transmissão sobe ao destaque: sai o
  // título centralizado, entram a trilha e o selo de qualidade da print `p5`
  const meId = useAuth((s) => s.user?.id);
  // o avatar "sou eu" de `Chamando` (mais abaixo) precisa do usuário inteiro,
  // não só do id
  const meUser = useAuth((s) => s.user);
  // `tick` é o pulso das faixas do SDK — é dele que vem a resolução do selo
  useVoice((s) => s.tick);
  const focado = useVoice((s) => s.focado);
  const setFocado = useVoice((s) => s.setFocado);
  const screenQuality = useVoice((s) => s.screenQuality);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const call = useVoice((s) => s.call);
  const startCall = useVoice((s) => s.startCall);
  const endCall = useVoice((s) => s.endCall);
  const reconnect = useVoice((s) => s.reconnect);
  const conversa = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar, suportada: temTelaCheia } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();
  const ehMobile = useEhMobile();
  const paisagem = useEhPaisagem();

  const definirExpandido = useUI((s) => s.definirPalcoExpandido);
  const palcoExpandido = useUI((s) => s.palcoExpandido);

  const chamando = call.phase === "outgoing" && call.channelId === channelId;
  /** Ninguém na chamada deste canal e nenhuma chamada saindo — ver o `return null`. */
  const semChamada = estados.length === 0 && !chamando;
  /**
   * Quem compartilha a tela enquanto a chamada toca quer conferir o que está no
   * ar. Os avatares de `Chamando` cobriam a transmissão, e ela só aparecia
   * quando o outro lado atendia.
   */
  const transmitindoNoToque = chamando && estados.some((e) => e.user.id === meId && e.screen);

  /**
   * **A moldura só se esconde por inatividade quando há vídeo competindo com
   * ela** — câmera ou tela de alguém no canal (`temVideoNoPalco`). Sobre
   * vídeo, cabeçalho e controles permanentemente na tela atrapalham a
   * imagem, e é para isso que `useOcultarInativo` existe. Sem vídeo não há
   * nada para proteger: a chamada é só os avatares e o texto do
   * palco, e a moldura sumida só esconde o botão de desligar — o defeito da
   * print do usuário (2026-09-28, DM "Chamando…", só voz), onde os controles
   * apagavam por inatividade e sobrava um avatar gigante sem jeito de
   * encerrar a chamada. `chamando` conta como "sem vídeo" mesmo que alguém já
   * tenha câmera ligada na chamada anterior: a chamada saindo ainda não tem
   * palco nenhum para o vídeo disputar.
   */
  const temVideo = temVideoNoPalco(estados);
  const molduraSempre = chamando || !temVideo;
  /** `visivel || molduraSempre` é o que os controles e a seta de expandir usam. */
  const controlesVisiveis = visivel || molduraSempre;

  /**
   * **No celular o dedo não paira, e o ponteiro não fica "se movendo".**
   *
   * `useOcultarInativo` conta três segundos de mouse parado e apaga a moldura.
   * Num telefone esses três segundos começam a correr assim que a chamada abre:
   * a faixa de cima — que é o único caminho para a conversa da DM e para
   * "adicionar pessoas" num grupo — sumia sozinha, e o toque que a traria de
   * volta **atravessa** para o tile debaixo dela (troca o foco, ou abre a tela
   * cheia). Era um botão que só voltava depois de fazer outra coisa.
   *
   * A regra passa a ser a mesma da cápsula de controles (ver `ControlesMobile`):
   * em pé a moldura fica **sempre**, porque é a única superfície de controle da
   * tela; deitado ela some junto com os controles, que ali a tela é a
   * transmissão e um toque traz tudo de volta. `molduraSempre` soma-se a essa
   * conta pelo mesmo motivo do desktop: sem vídeo, nem deitado há o que a
   * moldura atrapalhe.
   */
  const molduraVisivel = molduraSempre || (ehMobile ? !paisagem || visivel : visivel);

  /**
   * O modo só vale **enquanto o botão que o desfaz está na tela**.
   *
   * A regra é essa, e não "enquanto houver chamada", por um caso concreto: eu
   * desligo, mas os outros continuam na call. O palco vira o cartão "entrar na
   * chamada", que não desenha controle nenhum — e um `palcoExpandido` ligado
   * ali é chat escondido sem botão de voltar. O `palcoExpandido` é global (o
   * `CallSplit`, que é irmão daqui, também o lê), então ninguém mais vai
   * desligá-lo.
   */
  const podeExpandir = !ehMobile && !semChamada && (conectadoAqui || chamando);
  // Antes da pintura, e não num `useEffect`: o `CallSplit` esconde a conversa
  // olhando só o `palcoExpandido`, então um quadro com o modo ainda ligado e o
  // palco já recolhido é a conversa sumida sem botão nenhum para trazê-la de
  // volta — o botão que desfaz o modo é o que acabou de sair da tela.
  useEfeitoDeLeiaute(() => {
    if (!podeExpandir) definirExpandido(false);
  }, [podeExpandir, definirExpandido]);

  /**
   * A conta é refeita na **renderização**, e não só pelo efeito acima, porque
   * efeito roda depois da pintura: girar o telefone (ou desligar a chamada)
   * com o modo ligado pintaria um quadro com o palco promovido sobre uma tela
   * que não é mais a dele. **No celular ele nem existe** — lá o palco já é a
   * tela toda e a conversa é outra tela, não uma coluna ao lado.
   */
  const expandido = palcoExpandido && podeExpandir;

  // O duplo clique na DM vira a expansão pedida pelo usuário: palco sobre chat
  // e perfil, transmissão no destaque, pessoas na tira embaixo. A tela cheia
  // continua no botão do canto. `setFocado` alterna, então só chama se a
  // chave ainda não é a do foco; ao recolher, o foco fica onde estava.
  const expandirCom = (chave: string) => {
    if (expandido) {
      definirExpandido(false);
      return;
    }
    definirExpandido(true);
    if (focado !== chave) setFocado(chave);
  };

  // O palco saiu da tela (troquei de conversa, entrei num canal de voz, o
  // `DMView` o trocou de lugar na árvore): quem ligou o modo é quem o apaga.
  // Pelo mesmo motivo do efeito acima, na fase de leiaute.
  useEfeitoDeLeiaute(() => () => definirExpandido(false), [definirExpandido]);

  /**
   * Esc sai do modo **sem desligar a chamada**.
   *
   * Fase de borbulha e `defaultPrevented` respeitado de propósito: modal,
   * popout e menu abertos por cima do palco também fecham no Esc e têm de
   * ganhar — é a mesma regra do Esc da tela cheia de janela (`fullscreen.ts`).
   *
   * Em tela cheia o Esc é do navegador, e ouvi-lo aqui também devolveria o
   * palco à faixa de 199px no mesmo gesto que só queria sair da tela cheia.
   */
  useEffect(() => {
    if (!expandido || telaCheia) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      definirExpandido(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [expandido, telaCheia, definirExpandido]);

  const grupo = conversa ? isGroupChannel(conversa) : false;
  const destinatario = conversa && !grupo ? conversa.others[0] : null;

  // Quem está no destaque, quando o destaque é uma tela. A publicação é
  // procurada pelo `trackSid` da chave (e não pela primeira tela do dono):
  // quem transmite duas telas tem dois tiles, e a resolução é de uma delas.
  const noDestaque = telaNoDestaque(focado);
  const donoDaTela = noDestaque
    ? (estados.find((e) => e.user.id === noDestaque.userId) ?? null)
    : null;
  const publicacaoEmDestaque = noDestaque
    ? (participantesDe(noDestaque.userId)
        .flatMap(telasDe)
        .find((p) => p.trackSid === noDestaque.trackSid) ?? null)
    : null;
  const selo = donoDaTela
    ? seloDaTransmissao(
        publicacaoEmDestaque?.dimensions?.height,
        donoDaTela.user.id === meId ? SCREEN_QUALITY[screenQuality].frameRate : null,
      )
    : null;

  if (semChamada) return null;

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
      // A tela cheia não precisa de classe aqui: no navegador quem promove o
      // elemento é o compositor, e no app o `fullscreen.ts` marca este mesmo
      // elemento com `data-tela-cheia-emulada` (a regra está no `globals.css`).
      //
      // **Expandido é o contrário disso**: não há compositor nenhum, quem
      // promove somos nós — e é `posicaoDoPalco` quem diz como, nos dois modos.
      //
      // Fundo preto puro, que é o token `--black` do Discord (não o preto do
      // Tailwind): prints 1:1 `2026-08-31 160106` (pixels 600,250 e 1200,150) e
      // `101857` (1000,100 e todo o vão entre tiles) dão `#000000`.
      className={`flex flex-col bg-black ${posicaoDoPalco(expandido)}`}
    >
      {erro && conectadoAqui && status === "error" && (
        <div
          role="alert"
          className="z-20 flex shrink-0 items-center gap-2 bg-status-danger px-4 py-2 text-sm font-medium text-control-critical-primary-text-default"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{erro}</span>
          <Button
            variante="secundario"
            tamanho="xs"
            icone={<RotateCw size={12} aria-hidden="true" />}
            onClick={() => void reconnect()}
            className="shrink-0"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ARMADILHA: este cabeçalho é transparente e cobre a faixa inteira do
          topo do palco (~56px). Enquanto ele recebia ponteiro, roubava o hover
          e o clique de tudo que o tile desenha ali em cima — no modo foco o
          tile começa em y=0 e a fileira de ações dele fica a `top-1`, ou seja,
          **dentro** desta faixa. Por isso a caixa e os slots de leiaute são
          `pointer-events-none` e só o conteúdo de verdade (selo e botões)
          volta a receber ponteiro; é o mesmo padrão do selo flutuante do
          celular em `VoicePanel`. Os `onPointerEnter/Leave` de `daMoldura`
          continuam valendo: o React os propaga a partir dos filhos. */}
      <div
        {...daMoldura}
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-4 py-3 ${classeDaMoldura(molduraVisivel, "cima")}`}
      >
        {/* Slots laterais iguais (`flex-1 basis-0`) em vez de 96px fixos: é o
            que mantém o título de fato centralizado — os dois lados dividem a
            sobra. */}
        {/* **Com uma transmissão no destaque o canto esquerdo vira trilha**: é
            o que a print `p5` mostra — `@ Md · (avatar) Tela de Arthur`,
            dizendo de onde se está vendo e o que se está vendo. Sem destaque o
            canto fica **vazio**: aqui já morou um selo "Você está ao vivo" com
            um botão "Parar transmissão", e o Discord não tem nenhum dos dois em
            cabeçalho de palco nenhum (`p2` e `p5`). Quem para a transmissão é o
            botão de tela da barra de controles, que fica aceso enquanto ela
            está no ar.

            Medido em `p5` (2874×1798, **2×** — a cápsula de desligar mede 100px
            ali para os ~48 de sempre, e o "AO VIVO" 32 para os 16 já medidos no
            tile): trilha começando em x=33 (**16** de folga, o `px-4` que o
            cabeçalho já tem) e centrada em y≈50 (**25**, que é o `py-3` sobre
            uma linha de ~26); avatar de 48px (**24**). O "@" sai em cinza
            (`#7a7b83`) e o resto em branco (`#dcdcdf`). */}
        <span className="flex min-w-0 flex-1 basis-0 items-center [&>*]:pointer-events-auto">
          {donoDaTela && (
            <span className="flex w-max items-center gap-2 text-sm font-semibold text-text-strong">
              <span className="flex items-center gap-1 text-text-muted">
                <AtSign size={16} aria-hidden="true" />
                <span className="max-w-[14ch] truncate">{titulo}</span>
              </span>
              <span aria-hidden="true" className="text-text-muted">
                ·
              </span>
              <Avatar
                user={donoDaTela.user}
                size="sm"
                surface="border-black"
              />
              <span className="max-w-[20ch] truncate">
                Tela de {displayNameOf(donoDaTela.user)}
              </span>
            </span>
          )}
        </span>

        {/* título centralizado: o palco é simétrico, e o nome no canto puxaria a
            atenção para fora das pessoas. Na faixa ele não existe — ver `faixa`.
            Expandido o palco **é** a região inteira e cobre o cabeçalho da
            conversa, que era quem dizia o nome: o título volta. */}
        {/* com a transmissão em destaque o nome já está na trilha da esquerda,
            e repeti-lo no meio seria dizer duas vezes a mesma coisa — na `p5`
            o Discord não desenha título nenhum */}
        {(!faixa || expandido) && !donoDaTela && (
          <span className="flex min-w-0 flex-col items-center text-center">
            <span className="max-w-full truncate text-sm font-semibold text-text-strong">
              {titulo}
            </span>
            <span className="text-xs text-text-muted">{subtitulo}</span>
          </span>
        )}

        <span className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2 [&>*]:pointer-events-auto">
          {/* Selo de qualidade + "AO VIVO", colados numa pílula só, no canto
              superior direito (print `p5`, medido em 2×): altura 32 (**16**),
              16 de folga da borda direita, cinza `#4f5059` e vermelho
              `#c23d40` — este último é o `--status-danger` que o selo do tile
              já usa. O cinza **não tem token equivalente** no nosso tema; fica
              no `background-surface-higher`, que é o mais próximo. */}
          {donoDaTela && (
            <span className="flex h-4 shrink-0 items-center overflow-hidden rounded-full text-[12px] font-bold leading-4">
              {selo && (
                <span className="bg-background-surface-higher px-[6px] text-text-strong">
                  {selo}
                </span>
              )}
              <span className="bg-status-danger px-[6px] uppercase text-control-critical-primary-text-default">
                Ao vivo
              </span>
            </span>
          )}
          {grupo && (
            <BotaoDeIcone
              rotulo="Adicionar pessoas"
              icone={<UserPlus size={20} />}
              onClick={() => ui.openModal({ kind: "addGroupMembers", channelId })}
              tamanho="md"
              // 44 no celular (piso de toque do HIG/Material, `ALVO_MINIMO`), 32
              // (o tamanho `md` do primitivo) no desktop — só o `style` muda o
              // alvo sem tocar o raio/cor que o primitivo já resolve
              style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
            />
          )}
          {/* Expandido a conversa está **atrás** do palco: o balão não pode
              continuar dizendo "ocultar" nem marcado como ligado, ou seria um
              botão que se diz ligado sem nada na tela para mostrar. Mostrar a
              conversa então quer dizer recolher o palco antes — e reabrir o
              chat, se quem expandiu também o tinha fechado. */}
          <BotaoDeIcone
            rotulo={chatAberto && !expandido ? "Ocultar conversa" : "Mostrar conversa"}
            ativo={chatAberto && !expandido}
            icone={<MessageSquare size={20} />}
            onClick={() => {
              if (!expandido) {
                onToggleChat();
                return;
              }
              definirExpandido(false);
              if (!chatAberto) onToggleChat();
            }}
            tamanho="md"
            style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
          />
        </span>
      </div>

      {/* Sem `pt-14`: o cabeçalho é flutuante (`absolute`) e se esconde sozinho
          quando o mouse para — reservar altura para ele custava 56px da
          transmissão para proteger uma faixa que nem sempre está na tela. A
          folga de baixo **não** segue o mesmo raciocínio: a cápsula de
          controles cobre o que estiver por baixo mesmo quando some por
          inatividade, então no desktop a reserva vale sempre — o porquê está
          em `folgaDaGrade`. */}
      <div className={folgaDaGrade(ehMobile)}>
        {chamando && !transmitindoNoToque ? (
          <Chamando
            nome={destinatario ? displayNameOf(destinatario) : titulo}
            usuario={destinatario}
            eu={meUser}
          />
        ) : conectadoAqui ? (
          /* Sem tela de espera: a grade é desenhada a partir do estado de voz
             do servidor, que já está aqui, e o `connecting` só quer dizer que a
             mídia ainda está subindo. Trocá-la por um spinner escondia a
             chamada pelo tempo do `getUserMedia` + `publishTrack` — p90 de 3,5s
             medido em produção. Quem conta que a mídia ainda vem é a barra
             "Conectando…" do rodapé. */
          <VoiceGrid
            channelId={channelId}
            nomeDoCanal={titulo}
            // Na faixa a grade é obrigatória, por medida do Discord (print
            // `2026-09-21 às 15.04.09`: três tiles iguais numa fileira, sem
            // destaque nem tira, mesmo com transmissão ao vivo). A aritmética
            // de `palcoUsaFoco` sozinha escolheria destaque aos ~372 de altura,
            // e só o `CallStage` sabe que está na faixa — a altura medida não
            // distingue (a mesma altura é faixa numa janela e palco cheio
            // noutra).
            faixa={faixa && !expandido}
            onExpandir={podeExpandir ? expandirCom : undefined}
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

      {(conectadoAqui || chamando) &&
        (ehMobile ? (
          // No celular `VoiceControls` renderiza `ControlesMobile` por
          // dentro, que já se posiciona sozinho — a seta de expandir e os
          // ícones do canto nem existem aqui (ver as duas condições que
          // sobravam abaixo, agora dentro da `FileiraDeControles`: as duas já
          // eram `!ehMobile`). Embrulhar isto na fileira só para o celular
          // sobraria uma grade disputando posição com o próprio leiaute que
          // `ControlesMobile` já resolve, e mudaria uma tela que não tinha o
          // defeito da faixa.
          <VoiceControls
            oculto={!controlesVisiveis}
            moldura={daMoldura}
            leaveLabel={chamando ? "Cancelar chamada" : "Desligar"}
            onLeave={() => void endCall()}
          />
        ) : (
          // A seta de expandir, a cápsula de controles e os ícones do canto
          // viviam cada um com seu próprio `absolute` na mesma altura — em
          // janela estreita (ou na faixa de 199px sobre uma DM "Chamando…",
          // print do usuário de 2026-09-28) eles se encavalavam e o texto
          // "Chamando…" encostava na cápsula. Um `FileiraDeControles` só
          // resolve os três junto (grade `1fr auto 1fr`), e é quem também
          // esconde a ponta direita, e depois a esquerda, quando a largura
          // não fecha as três.
          <FileiraDeControles
            esquerda={
              // A seta de expandir **não** depende do `temTelaCheia` do lado
              // direito: ela não usa a Fullscreen API nenhuma, é leiaute
              // nosso, e é justamente onde aquela não existe (webview com o
              // recurso desligado) que ela precisa continuar.
              <BotaoDeExpandir
                expandido={expandido}
                onAlternar={() => definirExpandido(!expandido)}
                visivel={controlesVisiveis}
                moldura={daMoldura}
              />
            }
            centro={
              <VoiceControls
                oculto={!controlesVisiveis}
                moldura={daMoldura}
                leaveLabel={chamando ? "Cancelar chamada" : "Desligar"}
                onLeave={() => void endCall()}
              />
            }
            direita={
              // `temTelaCheia`: onde a Fullscreen API não existe (webview com
              // o recurso desligado, WebKit antigo) o canto inteiro sai da
              // tela. O par de ícones é uma coisa só — o outro já nasce
              // desabilitado ("em breve") —, e um canto que só mostra o que
              // não dá para usar é pior que canto nenhum. Melhor isso do que
              // um botão que o usuário clica e nada acontece, que foi o
              // defeito daqui.
              temTelaCheia ? (
                <IconesDoCanto
                  telaCheia={telaCheia}
                  onTelaCheia={alternar}
                  visivel={controlesVisiveis}
                  moldura={daMoldura}
                />
              ) : undefined
            }
          />
        ))}
    </section>
  );
}

/**
 * A seta que expande o palco dentro da janela, no canto inferior **esquerdo**.
 *
 * **A posição não é mais deste componente.** Quem a resolve é a grade do
 * `FileiraDeControles` (`1fr auto 1fr`, `absolute inset-x-0 bottom-5`, ver o
 * cabeçalho de lá) — aqui dentro esta é só a ponta esquerda, um item em
 * fluxo, como a cápsula de controles virou em `VoiceControls`. É a mesma
 * fileira que decide se a seta soma junto com a cápsula e os ícones do canto
 * ou desaparece primeiro numa janela estreita.
 *
 * Lugar medido na print `2026-08-31 122612` (1:1, 1919 de largura), onde o
 * Discord põe a seta da faixa de chamada de conversa: centro em x≈407 com a
 * região de conteúdo começando em x≈375 — 32px da borda — e alinhada com a
 * fileira de controles, o mesmo canto de onde a nossa saiu.
 *
 * **A direção da seta é nossa, e diverge do print de propósito.** No Discord
 * ela aponta para baixo com a chamada aberta porque lá o clique *recolhe* a
 * call inteira; aqui o modo é outro — o palco cresce para baixo, por cima da
 * conversa —, então a seta aponta para onde o palco vai: ▾ para expandir, ▴
 * (a mesma, girada) para devolver o espaço. Uma seta que aponta para o lado
 * oposto do movimento seria pior que a divergência.
 *
 * Fica fora do `IconesDoCanto` porque aquele canto é medido como um par —
 * "ações sobre a janela", diz o cabeçalho de lá — e um terceiro ícone mudaria
 * o desenho que o print fixou. Esta é ação sobre o **leiaute**, e por isso
 * mora na ponta esquerda da fileira, não dentro daquele par.
 */
function BotaoDeExpandir({
  expandido,
  onAlternar,
  visivel,
  moldura,
}: {
  expandido: boolean;
  onAlternar: () => void;
  visivel: boolean;
  moldura?: PropsDaMoldura;
}) {
  return (
    <div
      {...moldura}
      className={classeDaMoldura(visivel, "baixo")}
    >
      <BotaoDeIcone
        rotulo={expandido ? "Recolher o palco" : "Expandir o palco"}
        // `ativo` é o que põe o `aria-pressed` no botão (ver o primitivo): para
        // o leitor de tela este é um interruptor, não dois botões diferentes
        ativo={expandido}
        icone={
          <ChevronDown
            size={20}
            className={`transition-transform duration-150 ${expandido ? "rotate-180" : ""}`}
          />
        }
        tamanho="md"
        comFundo
        onClick={onAlternar}
      />
    </div>
  );
}

/**
 * Chamada saindo: dois avatares lado a lado, eu e quem estou chamando — como
 * no Discord (print de quem liga, 2026-09-28: `Avatar` `xl` de 80px cada,
 * `gap-6` entre os dois, sem nome nem "Chamando…" na tela). O anel pulsante
 * fica só do lado de quem está sendo chamado, nunca do meu — é o que dá tempo
 * ao tempo, sem ele "Chamando…" em texto parece uma tela travada, e do meu
 * lado a "espera" já acabou.
 *
 * **Não mede mais a própria altura.** Dois avatares `xl` cabem inteiros nos
 * ~103px úteis que sobram na faixa de 199px depois da reserva de
 * `folgaDaGrade` (96, `pb-24` — ver o comentário de lá): era o avatar `xxl`
 * de 120px, sozinho, que não cabia, e forçava o encolhimento por
 * `ResizeObserver` que morava aqui. Nome e "Chamando…" continuam no DOM —
 * `sr-only`, nunca somem para quem usa leitor de tela — mas agora saem da
 * tela sempre, não só no aperto: o Discord não escreve nenhum dos dois ali,
 * e um avatar gigante com nome e "Chamando…" por baixo, com os controles
 * sumindo por inatividade, foi exatamente o que a print do usuário
 * (2026-09-28) mostrou de diferente.
 */
function Chamando({
  nome,
  usuario,
  eu,
}: {
  nome: string;
  usuario: PublicUser | null;
  eu: PublicUser | null;
}) {
  return (
    <div className="grid h-full min-h-0 place-items-center overflow-hidden">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-6">
          {eu && (
            // na chamada não se mostra status de presença, como no Discord
            <Avatar user={eu} size="xl" surface="border-black" />
          )}
          <span className="relative grid place-items-center">
            <span
              aria-hidden="true"
              className="absolute h-[88px] w-[88px] animate-ping rounded-full bg-status-positive/20"
            />
            {usuario ? (
              <Avatar user={usuario} size="xl" surface="border-black" />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full bg-background-base-lowest">
                <Phone size={30} className="text-text-muted" aria-hidden="true" />
              </span>
            )}
          </span>
        </div>
        <p className="sr-only">{nome}</p>
        <p className="sr-only">Chamando…</p>
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
  estados: VoiceStateEvent[];
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
            // o anel é a cor do palco (`--black`), que é o que "recorta" um avatar do outro;
            // na chamada não se mostra status de presença (nem esmaecer ausente), como no Discord
            <Avatar
              key={e.user.id}
              user={e.user}
              size="xl"
              surface="border-black"
              className="rounded-full ring-4 ring-black"
            />
          ))}
        </div>
        <p className="text-lg font-bold text-text-strong">{texto}</p>
        <Button
          variante="positivo"
          tamanho="md"
          icone={<Phone size={18} aria-hidden="true" />}
          onClick={onEntrar}
        >
          Entrar na chamada
        </Button>
      </div>
    </div>
  );
}
