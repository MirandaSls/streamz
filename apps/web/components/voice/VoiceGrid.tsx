"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, UserPlus, Users, Volume2 } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/primitivos";
import PalcoMobile from "@/components/voice/PalcoMobile";
import {
  AvatarDeChamada,
  TileDeConvite,
  VoiceTile,
  type AcoesDoTile,
  type Tile,
} from "@/components/voice/TileDeVoz";
import {
  FAIXA_ALTURA,
  FAIXA_GAP,
  GAP,
  FAIXA_LARGURA,
  FOCO_GAP,
  TETO_DE_TILES_ANIMADOS,
  TRANSICAO_DE_REFLOW,
  alturaDoDestaque,
  estiloDoTile,
  larguraDaTira,
  melhorArranjo,
  proporcaoDaTela,
  palcoUsaFoco,
  posicionarGrade,
  type Arranjo,
  type Retangulo,
} from "@/components/voice/grid-layout";
import { registrarVolumePopover } from "@/components/voice/participant-menu";
import { useEhMobile } from "@/hooks/useEhMobile";
import { janelaDe } from "@/lib/outra-janela";
import { chaveDoTileDeTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { usePreferenciasDoPalco } from "@/stores/preferencias-do-palco";
import { ui } from "@/stores/ui";
import {
  camerasDe,
  participantesDe,
  telasDe,
  useVoice,
} from "@/stores/voice";

/**
 * A grade de participantes de uma sala de voz.
 *
 * Quem manda na grade é o **estado de voz do servidor**, não o LiveKit: sem
 * servidor de mídia configurado a sala continua tendo gente, e é isso que o
 * usuário precisa ver. A faixa de vídeo, quando existe, é casada pelo
 * `identity` do participante (que é o id do usuário) e apenas *enfeita* o tile.
 *
 * A grade **não rola**: o arranjo linhas×colunas é calculado a partir do
 * tamanho real do palco (`grid-layout.ts`), como no Discord. Rolagem aqui seria
 * a admissão de que alguém na sala está fora do campo de visão.
 *
 * **Cada tile é absoluto, e quem anima a mudança de leiaute é o CSS.** O
 * arranjo vira `top/left/width/height` em `posicionarGrade`, e a transição de
 * `TRANSICAO_DE_REFLOW` interpola esses quatro números quando alguém entra,
 * sai, sobe ao palco ou a janela muda de tamanho. É o desenho do Signal
 * Desktop (levantamento de 2026-09-22), e é o único que funciona: `flex`/
 * `grid` não interpolam *contagem* de filhos — entrar na chamada seria sempre
 * um corte seco, que é o que havia aqui antes.
 *
 * **Cada pessoa tem um tile, e cada tela tem outro.** Quem transmite aparece
 * duas vezes — o avatar dela e a transmissão —, que é o que o Discord faz. E dá
 * para assistir a **várias** telas ao mesmo tempo: quem se assiste está em
 * `assistindo` na store, e é isso que decide se a faixa é baixada
 * (`aplicarAssinaturasDeTela`). Tela que ninguém abriu mostra só o convite
 * "Assistir transmissão" sobre a cor da pessoa, sem gastar rede.
 *
 * **Com um tile no palco (foco) o leiaute vira "destaque + faixa".** Medido na
 * print `2026-09-03 203909` (escala 0,8075 = 2777/3439, conferida pelo passo da
 * lista de canais — 26px → 32 — e pela cápsula de controles — 38px → 48):
 * destaque de 1458×823 px = **16:9 exato**, centralizado, com 229px de folga de
 * cada lado; vão de 6px (**8**) até a faixa; tile da faixa de 150×86 px
 * (**188×106**), também centralizado.
 *
 * **E esse leiaute não vale em qualquer lugar.** Na faixa de chamada sobre a
 * conversa o Discord desenha **grade, sempre** — print `2026-09-21 às 15.04.09`:
 * três tiles iguais numa fileira de 344×193,5 numa faixa de 372, transmissão ao
 * vivo junto, sem destaque e sem tira separada. Fora da faixa (palco cheio,
 * expandido, canal de voz) a decisão é aritmética: foco só quando o destaque sai
 * **maior do que a grade daria ao mesmo tile**. As duas regras moram em
 * `palcoUsaFoco`, e quem diz em qual dos dois lugares o palco está é a prop
 * `faixa`.
 *
 * **Há dois palcos, não um.** Numa conversa direta em que ninguém publicou
 * vídeo nem tela, o Discord não desenha tile nenhum: os avatares ficam soltos
 * sobre o fundo, grandes e centralizados, sem moldura e sem pílula de nome (ver
 * `docs/Reference`). A moldura só entra quando há o que emoldurar — e ela volta
 * assim que qualquer um liga a câmera ou transmite. Em canal de voz de servidor
 * o tile vale desde o começo: ali a grade é a própria sala, e a moldura é o que
 * separa uma pessoa da outra numa lista que cresce.
 *
 * **No celular nada disso vale**, e por isso `PalcoMobile` existe: 390pt não
 * comportam duas colunas de 16:9, e o app do Discord no telefone põe um
 * destaque grande com os outros numa tira rolável embaixo. A construção dos
 * tiles (quem tem câmera, quem tem tela, o que está assinado) é a **mesma**;
 * só o arranjo muda. Ver `docs/Reference/mobile/MEDIDAS.md` §12.
 *
 * O **áudio** dos outros não é daqui. Ele fica em `AudioRemotoHost`, montado
 * com o app inteiro: a grade desmonta ao trocar de tela, e a chamada não.
 */

/** Uma vaga do palco: alguém, ou o convite que ocupa a vaga vazia. */
type Celula = { tipo: "tile"; t: Tile } | { tipo: "convite" };

/**
 * Id/sid e tipo (câmera, tela ou convite) de cada vaga, numa string estável.
 *
 * É só isto que decide quantas colunas a grade tem e o tamanho de cada tile
 * (`melhorArranjo`/`posicionarGrade`, em `grid-layout.ts`) — nunca o estado de
 * mídia (mudo, câmera ligada) de quem já está numa vaga. Serve de chave para o
 * memo manual do leiaute (`memoDaGrade`, em `VoiceGrid`): mesma assinatura,
 * mesmo arranjo, sem refazer a conta.
 */
function assinaturaDasCelulas(celulas: readonly Celula[]): string {
  return celulas
    .map((c) => (c.tipo === "tile" ? `t:${c.t.key}:${c.t.tela ? "tela" : "pessoa"}` : "convite"))
    .join("|");
}

/**
 * A transmissão que sobe ao destaque **sozinha**, ou `null` para deixar a
 * grade como está.
 *
 * Só a tela de **outra pessoa** que eu escolhi assistir: abrir uma transmissão
 * e continuar com ela do tamanho de um selo não é o que ninguém pediu. A
 * **minha** nunca — nem a do navegador, nem a da captura nativa —, e isso é
 * medição, não opinião: na print `p2` o usuário está transmitindo pelo Discord
 * do navegador e a própria tela é **mais um card na grade**, ao lado das
 * pessoas, com o selo "Ao vivo"; o palco continua vazio. Era daqui que vinha o
 * "a minha tela não aparece": ela aparecia, mas engolindo o palco inteiro — a
 * regra antiga só excluía a captura nativa do desktop (`minhaTelaNativa`), e no
 * navegador `assistindo` é verdadeiro para a minha própria tela por definição.
 *
 * No desktop ela já volta do SFU só na camada baixa (ver
 * `assinaturas-de-tela.ts`): no destaque seria um vídeo de baixa em tamanho de
 * cinema.
 */
export function telaQueAssumeOPalco(tiles: readonly Tile[], meuId?: string): Tile | null {
  return tiles.find((t) => t.tela && t.assistindo && t.userId !== meuId) ?? null;
}

/**
 * O `style` do invólucro da tira de miniaturas do modo foco.
 *
 * **A largura tem de animar junto com as miniaturas.** É o invólucro que
 * carrega a largura da tira, e quem o centraliza é o `justify-center` do pai:
 * se essa largura mudar em corte seco enquanto o `left` das miniaturas
 * interpola por 200 ms, o bloco inteiro salta de lado no primeiro quadro e a
 * miniatura que sobrou desliza na **direção contrária** ao salto — de três
 * para duas ela pulava ~98px para a direita antes de andar 196 para a
 * esquerda, que é o oposto do que a transição queria mostrar. Com a largura no
 * mesmo token (`--mov-reflow`, pelo `TRANSICAO_DE_REFLOW`), o `justify-center`
 * recentraliza a cada quadro e o único movimento que se vê é o das miniaturas.
 *
 * Função à parte pelo mesmo motivo de `estiloDoTile`: é o contrato que chega ao
 * DOM, e é o que o teste afirma sem precisar de navegador.
 */
export function estiloDaTira(
  quantidade: number,
  animar: boolean,
): { width: number; height: number; transition?: string } {
  return {
    width: larguraDaTira(quantidade),
    height: FAIXA_ALTURA,
    ...(animar ? { transition: TRANSICAO_DE_REFLOW } : {}),
  };
}

/**
 * A vaga de uma miniatura fora da vista da tira do modo foco.
 *
 * Mesmo tamanho fixo do `VoiceTile` (a vaga já vem pronta de `estiloDoTile`,
 * aqui só o **conteúdo** muda), mas sem `<video>` nenhum: `TileDeVoz.tsx` não
 * tem uma prop para pedir "não anexa vídeo" (e não é deste cartão criar uma
 * ali), então o substituto mora aqui. Só aparece enquanto o
 * `IntersectionObserver` da tira confirma que a miniatura está fora do campo
 * de visão — ver `foraDeVista` em `VoiceGrid`.
 */
function MiniaturaForaDaVista() {
  return <div className="h-full w-full rounded-lg bg-chat-background-default" aria-hidden="true" />;
}

export default function VoiceGrid({
  channelId,
  nomeDoCanal,
  guildId = null,
  faixa = false,
  onAdicionar,
}: {
  channelId: string;
  nomeDoCanal?: string;
  /** ação de convidar do estado vazio — e o que distingue servidor de conversa. */
  guildId?: string | null;
  /**
   * O palco é a **faixa de chamada sobre a conversa** (ver `CallSplit`), e não
   * o palco cheio nem o expandido.
   *
   * Muda uma coisa só, e por medida: na faixa o arranjo é sempre a grade (ver
   * `palcoUsaFoco`). Vem de fora porque quem sabe disso é o dono do palco — a
   * faixa é uma escolha do `CallSplit`/`CallStage`, não algo que se deduza do
   * tamanho medido aqui: a mesma altura pode ser faixa numa janela e palco
   * cheio noutra.
   */
  faixa?: boolean;
  /**
   * Chamar mais gente para a chamada, no palco de avatares. Vem de fora porque
   * quem sabe se a conversa aceita mais alguém é o host (grupo aceita, conversa
   * de duas pessoas não), e a grade não precisa aprender isso.
   */
  onAdicionar?: () => void;
}) {
  const me = useAuth((s) => s.user);
  // `tick` é o que traz as mudanças do SDK (faixas entrando e saindo)
  useVoice((s) => s.tick);
  const states = useVoice((s) => s.statesOf(channelId));
  const falando = useVoice((s) => s.falando);
  const focado = useVoice((s) => s.focado);
  const membrosOcultos = useVoice((s) => s.membrosOcultos);
  const alternarMembrosOcultos = useVoice((s) => s.alternarMembrosOcultos);
  const focoAutomatico = useVoice((s) => s.focoAutomatico);
  const assistindo = useVoice((s) => s.assistindo);
  const setFocado = useVoice((s) => s.setFocado);
  const focarAutomaticamente = useVoice((s) => s.focarAutomaticamente);
  const assistir = useVoice((s) => s.assistir);
  const pararDeAssistir = useVoice((s) => s.pararDeAssistir);
  // menu de vídeo do palco (paridade Discord): prévia da própria câmera e
  // mostrar/ocultar quem está sem vídeo — ver `preferencias-do-palco.ts`
  const previaDaCamera = usePreferenciasDoPalco((s) => s.previaDaCamera);
  const mostrarSemVideo = usePreferenciasDoPalco((s) => s.mostrarSemVideo);
  const ehMobile = useEhMobile();
  // elemento em estado (e não em ref): o palco é desmontado quando alguém sobe
  // ao destaque, e um `ref` não avisaria o observador de que voltou
  const [palco, setPalco] = useState<HTMLDivElement | null>(null);
  const tamanho = useTamanho(palco);
  // **A transição só entra a partir do segundo quadro medido.** No primeiro o
  // palco ainda vale 0×0 (o `ResizeObserver` não correu, e no SSR nunca corre),
  // e uma transição ligada ali faria cada tile *inflar do nada* ao entrar na
  // chamada — movimento que ninguém pediu e que a referência não tem. O tile de
  // quem chega depois nasce direto no lugar certo pelo mesmo motivo: nó novo no
  // DOM não tem estado anterior de onde partir; quem anima são os vizinhos, que
  // abrem espaço.
  const jaMedido = useRef(false);
  useEffect(() => {
    if (tamanho.largura > 0 && tamanho.altura > 0) jaMedido.current = true;
  }, [tamanho.largura, tamanho.altura]);

  // Quem transmite pelo app de desktop tem **dois** participantes na sala: a
  // pessoa e o `<userId>#tela` da captura nativa. As faixas dos dois entram nos
  // tiles do dono — o `#tela` nunca vira uma pessoa a mais na grade.
  const tilesBrutos: Tile[] = states.flatMap((state): Tile[] => {
    const meus = participantesDe(state.user.id);
    const sou = state.user.id === me?.id;
    // "Prévia da câmera" desligada some com a câmera só no MEU tile, e só
    // localmente — os outros continuam me vendo normalmente. A câmera de
    // qualquer outra pessoa sempre aparece: não há opção para escondê-la.
    const camera = sou && !previaDaCamera ? null : (meus.flatMap(camerasDe)[0] ?? null);
    const pessoa: Tile = {
      key: state.user.id,
      state,
      // câmera fica no tile da pessoa; tela nunca — ela tem tile próprio
      publication: camera,
      tela: false,
      assistindo: false,
      userId: state.user.id,
      comVideo: !!camera?.track,
    };
    const telas = meus.flatMap((p) =>
      telasDe(p).map((pub): Tile => {
        const key = chaveDoTileDeTela(state.user.id, pub.trackSid);
        // A minha tela pela captura nativa do desktop: vem do `<userId>#tela`,
        // um participante que não é a pessoa. Ela está sempre assinada (em
        // LOW, ver `assinaturas-de-tela.ts`), então aparece como a do navegador.
        const minhaTelaNativa = sou && p.identity !== state.user.id;
        return {
          key,
          state,
          publication: pub,
          tela: true,
          // A minha tela aparece sempre; a dos outros, só quando escolho
          // assistir.
          assistindo: sou || assistindo.has(state.user.id),
          userId: state.user.id,
          comVideo: !!pub.track,
          minhaTelaNativa,
        };
      }),
    );
    return [pessoa, ...telas];
  });

  // "Mostrar participantes sem vídeo" desligado esconde da grade quem não tem
  // câmera nem tela — telas ficam sempre, porque quem transmite é o próprio
  // conteúdo que a preferência quer ver (paridade Discord). Se o filtro
  // esvaziasse o palco (ninguém com câmera ligada), volta a mostrar todo mundo:
  // um palco vazio quando há gente na chamada seria pior que a preferência.
  const semFiltroDeVideo = tilesBrutos.filter((t) => t.tela || t.comVideo);
  const tiles: Tile[] =
    mostrarSemVideo || semFiltroDeVideo.length === 0 ? tilesBrutos : semFiltroDeVideo;

  const telaAssistida = telaQueAssumeOPalco(tiles, me?.id);
  const chaveDaTela = telaAssistida?.key ?? null;
  useEffect(() => {
    if (focoAutomatico && chaveDaTela && focado !== chaveDaTela) {
      focarAutomaticamente(chaveDaTela);
    }
  }, [focoAutomatico, chaveDaTela, focado, focarAutomaticamente]);

  // sem nenhuma faixa publicada, uma conversa direta é fileira de avatares
  const modoAvatares = !guildId && tiles.every((t) => !t.publication && !t.tela);

  const acoes: AcoesDoTile = {
    meId: me?.id,
    falando,
    channelId,
    onFocar: setFocado,
    // assistir e subir ao palco são o mesmo gesto: ninguém abre uma
    // transmissão para vê-la do tamanho de um selo. `setFocado` alterna, então
    // só se chama quando o tile ainda não é o do palco.
    onAssistir: (userId: string, chave: string) => {
      assistir(userId);
      if (focado !== chave) setFocado(chave);
    },
    onPararDeAssistir: pararDeAssistir,
  };

  // **Virtualização da tira de miniaturas do modo foco.** A tira rola de lado
  // e pode ter miniaturas fora do campo de visão o tempo todo (dez pessoas na
  // faixa de 188px cada) — cada uma com um `<video>` decodificando quadro que
  // ninguém está vendo. O `IntersectionObserver` diz quais chaves estão fora
  // da tira; só essas trocam `VoiceTile` por um retângulo vazio do mesmo
  // tamanho (`MiniaturaForaDaVista`) — a vaga continua lá (`estiloDoTile` não
  // muda), só o conteúdo caro some, e o scroll não pula.
  //
  // Começa tudo "dentro" (nada em `foraDeVista` no primeiro quadro, e nunca no
  // servidor, onde não há `IntersectionObserver`): o observer é quem prova
  // que uma miniatura está fora, nunca o contrário — assim a chamada nunca
  // perde vídeo por engano antes de o navegador confirmar que ele não está à
  // vista.
  const [faixaEl, setFaixaEl] = useState<HTMLDivElement | null>(null);
  const [foraDeVista, setForaDeVista] = useState<ReadonlySet<string>>(() => new Set());
  // elemento montado de cada miniatura, para o observer saber o que observar
  // assim que ele nasce (a montagem de um filho pode chegar antes do efeito
  // que cria o observer rodar).
  const miniaturasMontadasRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const observerDaFaixaRef = useRef<IntersectionObserver | null>(null);
  // uma função de `ref` por chave, cacheada: um `ref` inline novo a cada
  // render faria o React soltar o nó velho e pegar o novo em toda
  // renderização, e cada uma dessas trocas mexe no observer — o oposto de "só
  // recalcula quando muda".
  const criadoresDeRefRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  function refDaMiniatura(chave: string) {
    let fn = criadoresDeRefRef.current.get(chave);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        const montadas = miniaturasMontadasRef.current;
        const anterior = montadas.get(chave);
        if (anterior && anterior !== el) observerDaFaixaRef.current?.unobserve(anterior);
        if (el) {
          montadas.set(chave, el);
          observerDaFaixaRef.current?.observe(el);
        } else {
          montadas.delete(chave);
        }
      };
      criadoresDeRefRef.current.set(chave, fn);
    }
    return fn;
  }
  useEffect(() => {
    if (!faixaEl || typeof IntersectionObserver === "undefined") return;
    // o da janela da faixa: na janela solta da chamada, o da principal nunca
    // veria a miniatura cruzar o viewport dela
    const observer = new (janelaDe(faixaEl).IntersectionObserver)(
      (entradas) => {
        setForaDeVista((atual) => {
          let mudou = false;
          const proximo = new Set(atual);
          for (const entrada of entradas) {
            const chave = (entrada.target as HTMLElement).dataset.miniatura;
            if (!chave) continue;
            if (entrada.isIntersecting) {
              if (proximo.delete(chave)) mudou = true;
            } else if (!proximo.has(chave)) {
              proximo.add(chave);
              mudou = true;
            }
          }
          return mudou ? proximo : atual;
        });
      },
      // ~1 miniatura de folga de cada lado: decodifica um pouco antes de
      // entrar de fato na tira, para o vídeo não "acender" durante o scroll.
      { root: faixaEl, rootMargin: `0px ${FAIXA_LARGURA + FAIXA_GAP}px` },
    );
    observerDaFaixaRef.current = observer;
    for (const el of miniaturasMontadasRef.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      observerDaFaixaRef.current = null;
    };
  }, [faixaEl]);

  // O arranjo da grade (`melhorArranjo`/`posicionarGrade`, mais abaixo) só
  // depende da CONTAGEM, do TIPO de cada vaga e do TAMANHO do palco — nunca do
  // estado de mídia de quem já está nele. `s.tick` sobe em ~12 eventos do
  // Room, silenciar/dessilenciar entre eles: sem este memo manual, apertar o
  // mudo de alguém recalculava colunas, linhas e todos os retângulos da grade
  // à toa. `useMemo` não serve aqui porque as duas contas moram em ramos
  // condicionais (foco × grade) depois de vários `return` — um Hook não pode
  // ficar num ramo que nem sempre executa. A saída é este cache manual num
  // `ref`, comparado por uma assinatura estável.
  const memoDoFoco = useRef<{ assinatura: string; arranjo: Arranjo } | null>(null);
  const memoDaGrade = useRef<{ assinatura: string; arranjo: Arranjo; vagas: Retangulo[] } | null>(
    null,
  );

  if (tiles.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-lg font-bold text-text-strong">
            {nomeDoCanal ? `Ninguém em ${nomeDoCanal}` : "Ninguém na sala"}
          </p>
          <p className="max-w-sm text-sm text-text-muted">
            Chame alguém e a conversa começa aqui — quem entrar aparece nesta tela.
          </p>
          {guildId && (
            <Button
              variante="primario"
              tamanho="sm"
              icone={<UserPlus size={16} aria-hidden="true" />}
              onClick={() => ui.openModal({ kind: "invite", guildId })}
              className="mt-1"
            >
              Convidar pessoas
            </Button>
          )}
        </div>
      </div>
    );
  }

  // **O celular tem palco próprio, e ele vale desde a primeira pessoa.** Não
  // há "modo avatares" lá: numa tela de 390pt o destaque já é o rosto grande
  // que o palco de avatares queria dar, e manter dois arranjos no telefone só
  // faria a tela mudar de forma quando alguém liga a câmera.
  if (ehMobile) {
    return <PalcoMobile tiles={tiles} acoes={acoes} focado={focado} meId={me?.id} />;
  }

  if (modoAvatares) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
          {onAdicionar && (
            <Tooltip label="Adicionar pessoas">
              <button
                type="button"
                onClick={onAdicionar}
                aria-label="Adicionar pessoas"
                className="grid h-20 w-20 place-items-center rounded-full text-text-subtle transition hover:bg-background-base-lowest hover:text-text-strong"
              >
                <Plus size={32} />
              </button>
            </Tooltip>
          )}
          {tiles.map((t) => (
            <AvatarDeChamada
              key={t.key}
              tile={t}
              meId={me?.id}
              falando={falando}
              channelId={channelId}
            />
          ))}
        </div>
      </div>
    );
  }

  // Foco: um tile grande em cima, o resto numa faixa embaixo. A chave é a do
  // tile (`userId` ou `userId:sid`), não o id da pessoa — quem assiste a duas
  // telas tem dois tiles do mesmo dono; o casamento por id fica como reserva
  // para quem tenha guardado só a pessoa.
  const candidato =
    (focado ? tiles.find((t) => t.key === focado) : null) ??
    (focado ? tiles.find((t) => t.state.user.id === focado) : null) ??
    null;
  // ...mas só onde o destaque compensa. Na faixa sobre a conversa nunca
  // compensa (o Discord desenha grade ali mesmo com transmissão ao vivo); fora
  // dela vale a comparação com o tile que a grade daria. As duas regras, e as
  // prints que as sustentam, estão em `palcoUsaFoco`; aqui só se descarta o
  // candidato, e aí ele volta a ser um tile da grade como qualquer outro —
  // **sem sair de `resto`**, que é o que impedia a transmissão de sumir.
  const principal =
    candidato &&
    palcoUsaFoco(tiles.length - 1, tamanho.largura, tamanho.altura, faixa)
      ? candidato
      : null;
  const resto = principal ? tiles.filter((t) => t.key !== principal.key) : tiles;
  // Sozinho na call, clicar no próprio card também foca (como no Discord): o
  // destaque é o tile e a tira guarda o mesmo tile em miniatura, que é onde
  // se clica para voltar à grade. Com 2+ a tira não repete o destaque.
  const daTira = principal && resto.length === 0 ? tiles : resto;
  // O teto do Element Call: acima dele o reflow volta a ser seco, porque
  // `top/left/width/height` custam layout e pintura a cada quadro e isso soma
  // ao custo de decodificar os vídeos (ver `TETO_DE_TILES_ANIMADOS`).
  const animar = jaMedido.current && tiles.length <= TETO_DE_TILES_ANIMADOS;

  if (principal) {
    // O medido é a área **inteira** do palco (a raiz), e não o invólucro do
    // destaque: a decisão entre foco e grade precisa de uma medida que não
    // dependa do leiaute escolhido, ou os dois modos se mediriam um ao outro.
    //
    // Memo manual (ver o comentário de `memoDoFoco` lá em cima): o destaque só
    // muda de tamanho quando `daTira.length` ou o palco medido mudam — mute de
    // quem está na tira não é nenhum dos dois.
    // Com a tira oculta o destaque toma o palco inteiro (`naTira` 0), e isso
    // entra na assinatura: alternar não muda `daTira.length`.
    const naTira = membrosOcultos ? 0 : daTira.length;
    // Tela compartilhada (janela específica) tem proporção própria; sem ela o
    // destaque 16:9 mostraria tarjas pretas. Câmera e tela sem faixa: 16:9.
    const proporcaoDoFoco = principal.tela
      ? proporcaoDaTela(principal.publication?.dimensions)
      : proporcaoDaTela(null);
    const assinaturaDoFoco = `${naTira}@${tamanho.largura}x${tamanho.altura}@${proporcaoDoFoco.toFixed(3)}`;
    let foco: Arranjo;
    if (memoDoFoco.current?.assinatura === assinaturaDoFoco) {
      foco = memoDoFoco.current.arranjo;
    } else {
      foco = melhorArranjo(
        1,
        tamanho.largura,
        alturaDoDestaque(tamanho.altura, naTira),
        GAP,
        proporcaoDoFoco,
      );
      memoDoFoco.current = { assinatura: assinaturaDoFoco, arranjo: foco };
    }
    return (
      <div
        ref={setPalco}
        className="relative flex h-full min-h-0 flex-col items-center"
        style={{ gap: membrosOcultos ? 0 : FOCO_GAP }}
      >
        {/* o destaque mantém 16:9 e fica centralizado nos dois eixos, como na
            print: é `melhorArranjo` com uma vaga só. Aqui só o *tamanho* anima
            — quem centraliza é o flexbox, que reposiciona sozinho a cada quadro
            enquanto a caixa cresce ou encolhe. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
          <div
            style={{
              width: foco.largura,
              height: foco.altura,
              ...(animar ? { transition: TRANSICAO_DE_REFLOW } : {}),
            }}
          >
            <VoiceTile tile={principal} {...acoes} grande />
          </div>
        </div>

        {daTira.length > 0 && !membrosOcultos && (
          /* A tira também posiciona cada miniatura de forma absoluta: sem isso
             quem entra empurra as outras num corte seco. O invólucro de largura
             explícita é o que mantém o comportamento de antes — centralizada
             enquanto cabe (`justify-center`) e rolável de lado quando não cabe
             (`overflow-x-auto`), que é o que o Discord faz com dez miniaturas.
             Por que essa largura também **anima**: `estiloDaTira`. É também a
             raiz do `IntersectionObserver` que decide quem, aqui dentro, ainda
             merece `<video>` — ver o comentário de `faixaEl` lá em cima. */
          <div
            ref={setFaixaEl}
            className="flex shrink-0 justify-center overflow-x-auto"
            style={{ height: FAIXA_ALTURA }}
          >
            <div className="relative shrink-0" style={estiloDaTira(daTira.length, animar)}>
              {daTira.map((t, i) => (
                <div
                  key={t.key}
                  ref={refDaMiniatura(t.key)}
                  data-miniatura={t.key}
                  className="absolute"
                  style={estiloDoTile(
                    {
                      esquerda: i * (FAIXA_LARGURA + FAIXA_GAP),
                      topo: 0,
                      largura: FAIXA_LARGURA,
                      altura: FAIXA_ALTURA,
                    },
                    animar,
                  )}
                >
                  {foraDeVista.has(t.key) ? (
                    <MiniaturaForaDaVista />
                  ) : (
                    <VoiceTile tile={t} {...acoes} compacto />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sem miniaturas não há o que ocultar: o botão só existe com a tira.
            Com a tira oculta `faixaEl` volta a null e o observer se desfaz
            sozinho (o efeito depende dele); `foraDeVista` fica velho mas é
            inofensivo, porque a tira nasce de novo e o observer reconfirma. */}
        {daTira.length > 0 && (
          <div
            className="absolute left-1/2 z-10 -translate-x-1/2"
            style={{ bottom: membrosOcultos ? 8 : FAIXA_ALTURA - 12 }}
          >
            <Tooltip label={membrosOcultos ? "Mostrar membros" : "Ocultar membros"}>
              <button
                type="button"
                aria-label={membrosOcultos ? "Mostrar membros" : "Ocultar membros"}
                aria-pressed={membrosOcultos}
                onClick={alternarMembrosOcultos}
                className="flex h-6 items-center gap-0.5 rounded-full bg-background-base-lowest/90 px-2 text-control-overlay-secondary-icon-default shadow-popout backdrop-blur transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-150 ${membrosOcultos ? "rotate-180" : ""}`}
                />
                <Users size={14} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );
  }

  // Com uma pessoa só na sala o Discord não deixa o palco pela metade: a vaga
  // vazia vira o convite. Com mais gente ele some — aí a grade é a própria
  // sala, e o convite continua a um clique na barra lateral.
  const comConvite = !!guildId && resto.length === 1;
  const celulas: Celula[] = [
    ...resto.map((t) => ({ tipo: "tile" as const, t })),
    ...(comConvite ? [{ tipo: "convite" as const }] : []),
  ];

  // Memo manual (ver `memoDaGrade` lá em cima): a assinatura carrega id/sid e
  // tipo (câmera/tela/convite) de cada vaga, não o estado de mídia — silenciar
  // alguém não muda quantas colunas a grade tem.
  const assinaturaDaGrade = `${assinaturaDasCelulas(celulas)}@${tamanho.largura}x${tamanho.altura}`;
  let arranjo: Arranjo;
  let vagas: Retangulo[];
  if (memoDaGrade.current?.assinatura === assinaturaDaGrade) {
    ({ arranjo, vagas } = memoDaGrade.current);
  } else {
    // As linhas deixaram de ser elementos: cada célula recebe o retângulo
    // pronto e fica solta sobre o palco. É o que dá identidade a um tile
    // entre dois leiautes — o mesmo nó do DOM muda de coordenada, e o CSS
    // interpola — em vez de o navegador redesenhar fileiras com um filho a
    // mais ou a menos.
    arranjo = melhorArranjo(celulas.length, tamanho.largura, tamanho.altura);
    vagas = posicionarGrade(celulas.length, arranjo, tamanho.largura, tamanho.altura);
    memoDaGrade.current = { assinatura: assinaturaDaGrade, arranjo, vagas };
  }

  return (
    <div ref={setPalco} className="relative h-full min-h-0 overflow-hidden">
      {celulas.map((c, i) => (
        <div
          key={c.tipo === "tile" ? c.t.key : "convite"}
          className="absolute"
          style={estiloDoTile(vagas[i], animar)}
        >
          {c.tipo === "tile" ? (
            <VoiceTile tile={c.t} {...acoes} />
          ) : (
            <TileDeConvite guildId={guildId as string} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Tamanho útil de um elemento; é o que dá o arranjo sem rolagem. */
function useTamanho(el: HTMLElement | null) {
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new (janelaDe(el).ResizeObserver)(([entrada]) => {
      const r = entrada.contentRect;
      setTamanho({ largura: r.width, altura: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return tamanho;
}

/**
 * O slider fino de volume de um participante.
 *
 * Não vira item do menu de contexto porque aquele menu desenha **ações**, e
 * volume é um controle contínuo. Os degraus (50/100/150/200%) resolvem o caso
 * comum de dentro do menu; isto aqui é o ajuste fino.
 */
export function VoiceVolumePopoverHost() {
  const [popover, setPopover] = useState<{ x: number; y: number; userId: string; nome: string } | null>(
    null,
  );
  const volumes = useVoice((s) => s.volumes);
  const setVolume = useVoice((s) => s.setVolume);

  useEffect(() => {
    registrarVolumePopover((x, y, userId, nome) => setPopover({ x, y, userId, nome }));
    return () => registrarVolumePopover(() => {});
  }, []);

  useEffect(() => {
    if (!popover) return;
    const fechar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setPopover(null);
    };
    window.addEventListener("keydown", fechar);
    window.addEventListener("mousedown", fechar);
    return () => {
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("mousedown", fechar);
    };
  }, [popover]);

  if (!popover) return null;
  const volume = popover.userId in volumes ? volumes[popover.userId] : 1;

  return (
    <div
      role="dialog"
      aria-label={`Volume de ${popover.nome}`}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        left: Math.min(popover.x, window.innerWidth - 240),
        top: Math.min(popover.y, window.innerHeight - 90),
      }}
      className="fixed z-50 w-56 rounded-lg bg-background-surface-higher p-3 shadow-popout anim-menu"
    >
      <p className="truncate pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-text-muted">
        {popover.nome}
      </p>
      <label className="flex items-center gap-2 text-sm text-text-default">
        <Volume2 size={16} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(popover.userId, Number(e.target.value) / 100)}
          aria-label={`Volume de ${popover.nome}`}
          className="flex-1 accent-brand-500"
        />
        <span className="w-9 text-right text-xs text-text-muted">{Math.round(volume * 100)}%</span>
      </label>
    </div>
  );
}
