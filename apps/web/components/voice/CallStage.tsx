"use client";

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  AtSign,
  ChevronDown,
  MessageSquare,
  Phone,
  RotateCw,
  UserPlus,
} from "@/components/ui/icones";
import { SCREEN_QUALITY, displayNameOf, isGroupChannel } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
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
 * PENDENTE: essa mensagem de sistema **não existe no Streamz** (nem a de
 * chamada perdida). Enquanto não existir, a duração simplesmente não é
 * registrada em lugar nenhum — este comentário já afirmou o contrário, e a
 * correção é criar o tipo de mensagem em `packages/shared` antes de tudo.
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
  // `tick` é o pulso das faixas do SDK — é dele que vem a resolução do selo
  useVoice((s) => s.tick);
  const focado = useVoice((s) => s.focado);
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
   * transmissão e um toque traz tudo de volta.
   */
  const molduraVisivel = ehMobile ? !paisagem || visivel : visivel;

  const definirExpandido = useUI((s) => s.definirPalcoExpandido);
  const palcoExpandido = useUI((s) => s.palcoExpandido);

  const chamando = call.phase === "outgoing" && call.channelId === channelId;
  /** Ninguém na chamada deste canal e nenhuma chamada saindo — ver o `return null`. */
  const semChamada = estados.length === 0 && !chamando;

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
  useEffect(() => {
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

  // O palco saiu da tela (troquei de conversa, entrei num canal de voz, o
  // `DMView` o trocou de lugar na árvore): quem ligou o modo é quem o apaga.
  useEffect(() => () => definirExpandido(false), [definirExpandido]);

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
      // promove somos nós. O `absolute inset-0` sobe até o `relative` da região
      // de conteúdo (`app/app/page.tsx`, a `<div className="relative flex
      // min-w-0 flex-1">` que embrulha o `DMView`) — nenhum dos invólucros do
      // caminho é posicionado, e o `CallSplit` tira o `relative` do dele quando
      // o modo está ligado, justamente para não prender o palco na faixa. O
      // resultado é o pedido: o palco cobre cabeçalho, conversa e coluna da
      // direita, e a barra lateral da esquerda, que é irmã da região, continua.
      // `z-20` porque o cabeçalho da conversa (`HeaderBar`) flutua em `z-10`
      // sobre a mesma região; o véu de modal é `z-50` e continua por cima.
      //
      // Fundo preto puro, que é o token `--black` do Discord (não o preto do
      // Tailwind): prints 1:1 `2026-08-31 160106` (pixels 600,250 e 1200,150) e
      // `101857` (1000,100 e todo o vão entre tiles) dão `#000000`.
      className={`flex flex-col bg-black ${
        expandido ? "absolute inset-0 z-20" : "relative min-w-0 flex-1"
      }`}
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
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-4 py-3 transition-opacity duration-200 ${
          molduraVisivel ? "opacity-100" : "opacity-0"
        }`}
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
              <Avatar user={donoDaTela.user} size="sm" surface="border-black" />
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
          transmissão para proteger uma faixa que nem sempre está na tela. O
          `pb-24` fica: os controles também flutuam, mas embaixo mora a tira de
          miniaturas, que precisa continuar clicável. */}
      <div
        className={
          // ver o mesmo trecho em `VoicePanel`: no celular as folgas são do
          // `PalcoMobile`, porque a de baixo depende da orientação
          ehMobile
            ? "min-h-0 flex-1"
            : // `px-2` = `FOLGA_DO_PALCO` (8px, print 101857 x=1911–1918)
              "min-h-0 flex-1 px-2 pb-24"
        }
      >
        {chamando ? (
          <Chamando nome={destinatario ? displayNameOf(destinatario) : titulo} usuario={destinatario} />
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
          {/* A seta de expandir **não** depende do `temTelaCheia` logo abaixo:
              ela não usa a Fullscreen API nenhuma, é leiaute nosso, e é
              justamente onde aquela não existe (webview com o recurso
              desligado) que ela precisa continuar. Fora do celular pelo mesmo
              motivo do canto: no telefone o palco já é a tela toda. */}
          {!ehMobile && (
            <BotaoDeExpandir
              expandido={expandido}
              onAlternar={() => definirExpandido(!expandido)}
              visivel={visivel}
              moldura={daMoldura}
            />
          )}

          {/* fora do celular: a tela cheia do palco inteiro não é o gesto do
              telefone — lá se toca no tile (ver `PalcoMobile`).

              `temTelaCheia`: onde a Fullscreen API não existe (webview com o
              recurso desligado, WebKit antigo) o canto inteiro sai da tela. O
              par de ícones é uma coisa só — o outro já nasce desabilitado
              ("em breve") —, e um canto que só mostra o que não dá para usar
              é pior que canto nenhum. Melhor isso do que um botão que o
              usuário clica e nada acontece, que foi o defeito daqui. */}
          {!ehMobile && temTelaCheia && (
            <IconesDoCanto
              telaCheia={telaCheia}
              onTelaCheia={alternar}
              visivel={visivel}
              moldura={daMoldura}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * A seta que expande o palco dentro da janela, no canto inferior **esquerdo**.
 *
 * Lugar medido na print `2026-08-31 122612` (1:1, 1919 de largura), onde o
 * Discord põe a seta da faixa de chamada de conversa: centro em x≈407 com a
 * região de conteúdo começando em x≈375 — 32px da borda, ou seja, caixa de 32
 * (`BotaoDeIcone` `md`) com **16 de folga** (`left-4`). O centro vertical é
 * y≈501, o mesmo da fileira de controles, que é a âncora que o `IconesDoCanto`
 * já resolveu do outro lado (`bottom-[30px]`: caixa de 32 com a base a 30
 * centra nos 46 da cápsula de desligar — a conta está lá).
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
 * o desenho que o print fixou. Esta é ação sobre o **leiaute**, e tem o canto
 * dela.
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
  moldura?: { onPointerEnter: () => void; onPointerLeave: () => void };
}) {
  return (
    <div
      {...moldura}
      className={`absolute bottom-[30px] left-4 z-10 transition-opacity duration-200 ${
        visivel ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
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
            className="absolute h-[132px] w-[132px] animate-ping rounded-full bg-status-positive/20"
          />
          {usuario ? (
            // o palco é preto puro (`bg-black`, linha 111 desta função) — o
            // `Avatar` já sabe recortar contra `--black` (`FUNDO_DO_SELO`), então
            // a bolinha usa a cor real do fundo, não mais a aproximação `-lowest`
            <Avatar user={usuario} size="xxl" surface="border-black" />
          ) : (
            <span className="grid h-[120px] w-[120px] place-items-center rounded-full bg-background-base-lowest">
              <Phone size={44} className="text-text-muted" aria-hidden="true" />
            </span>
          )}
        </span>
        <p className="text-xl font-bold text-text-strong">{nome}</p>
        <p className="text-sm text-text-muted">Chamando…</p>
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
            // o anel é a cor do palco (`--black`), que é o que "recorta" um avatar do outro
            <Avatar key={e.user.id} user={e.user} size="xl" surface="border-black" className="rounded-full ring-4 ring-black" />
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
