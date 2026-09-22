"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, UserPlus, Volume2 } from "@/components/ui/icones";
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
  FAIXA_LARGURA,
  FOCO_GAP,
  TETO_DE_TILES_ANIMADOS,
  TRANSICAO_DE_REFLOW,
  alturaDoDestaque,
  estiloDoTile,
  larguraDaTira,
  melhorArranjo,
  palcoUsaFoco,
  posicionarGrade,
} from "@/components/voice/grid-layout";
import { registrarVolumePopover } from "@/components/voice/participant-menu";
import { useEhMobile } from "@/hooks/useEhMobile";
import { chaveDoTileDeTela, usePreviaDaMinhaTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { usePreferenciasPorParticipante } from "@/stores/preferencias-por-participante";
import { ui } from "@/stores/ui";
import {
  aplicarAssinaturasDeTela,
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
 * Pôr a minha no palco também custa caro no desktop: lá ela seria assinada de
 * volta do SFU (ver `assinaturas-de-tela.ts`), que é a volta de 1440p que o
 * "Ver prévia" existe para evitar.
 */
export function telaQueAssumeOPalco(tiles: readonly Tile[], meuId?: string): Tile | null {
  return tiles.find((t) => t.tela && t.assistindo && t.userId !== meuId) ?? null;
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
  const focoAutomatico = useVoice((s) => s.focoAutomatico);
  const assistindo = useVoice((s) => s.assistindo);
  const setFocado = useVoice((s) => s.setFocado);
  const focarAutomaticamente = useVoice((s) => s.focarAutomaticamente);
  const assistir = useVoice((s) => s.assistir);
  const pararDeAssistir = useVoice((s) => s.pararDeAssistir);
  const previaDaMinhaTela = usePreviaDaMinhaTela((s) => s.chave);
  // ESPEC2 item N: quem eu desativei o vídeo não tem tile de câmera — o
  // objeto inteiro (e não um seletor por id) porque o conjunto de quem está
  // desativado é pequeno e a grade já teria de re-renderizar de qualquer
  // jeito quando alguém entra/sai (mesmo padrão de `s.silenciados` no tile).
  const videosDesativados = usePreferenciasPorParticipante((s) => s.videosDesativados);
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
  const tiles: Tile[] = states.flatMap((state): Tile[] => {
    const meus = participantesDe(state.user.id);
    const sou = state.user.id === me?.id;
    // vídeo desativado por mim: o tile trata como se não houvesse câmera
    // nenhuma (cai no avatar, o mesmo ramo de "sem vídeo" de sempre) — não se
    // aplica a mim mesmo, que não aparece no próprio menu com este item
    const camera = videosDesativados[state.user.id] ? null : (meus.flatMap(camerasDe)[0] ?? null);
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
        // um participante que não é a pessoa. Ela **não** se assina sozinha
        // (ver `assinaturas-de-tela.ts`): o tile mostra o aviso "Você está
        // compartilhando sua tela" até eu pedir a prévia ou pô-la no palco.
        const minhaTelaNativa = sou && p.identity !== state.user.id;
        const mostrando = minhaTelaNativa && (previaDaMinhaTela === key || focado === key);
        return {
          key,
          state,
          publication: pub,
          tela: true,
          // No navegador a minha tela é faixa local e aparece sempre; a dos
          // outros, só quando escolho assistir.
          assistindo: minhaTelaNativa ? mostrando : sou || assistindo.has(state.user.id),
          userId: state.user.id,
          comVideo: !!pub.track && (!minhaTelaNativa || mostrando),
          minhaTelaNativa,
        };
      }),
    );
    return [pessoa, ...telas];
  });

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
    // a escolha fica fora da store de voz (ver `usePreviaDaMinhaTela`), então
    // quem a muda reaplica as assinaturas na mão
    onPreviaDaMinhaTela: (chave: string, ver: boolean) => {
      usePreviaDaMinhaTela.setState({ chave: ver ? chave : null });
      // ocultar com a tela no palco tira ela de lá: no destaque ela seguiria
      // assinada, e o aviso em tamanho de cinema não serve para nada
      if (!ver && focado === chave) setFocado(null);
      aplicarAssinaturasDeTela();
    },
  };

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
    candidato && palcoUsaFoco(tiles.length - 1, tamanho.largura, tamanho.altura, faixa)
      ? candidato
      : null;
  const resto = principal ? tiles.filter((t) => t.key !== principal.key) : tiles;
  // O teto do Element Call: acima dele o reflow volta a ser seco, porque
  // `top/left/width/height` custam layout e pintura a cada quadro e isso soma
  // ao custo de decodificar os vídeos (ver `TETO_DE_TILES_ANIMADOS`).
  const animar = jaMedido.current && tiles.length <= TETO_DE_TILES_ANIMADOS;

  if (principal) {
    // O medido é a área **inteira** do palco (a raiz), e não o invólucro do
    // destaque: a decisão entre foco e grade precisa de uma medida que não
    // dependa do leiaute escolhido, ou os dois modos se mediriam um ao outro.
    const foco = melhorArranjo(1, tamanho.largura, alturaDoDestaque(tamanho.altura, resto.length));
    return (
      <div
        ref={setPalco}
        className="flex h-full min-h-0 flex-col items-center"
        style={{ gap: FOCO_GAP }}
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

        {resto.length > 0 && (
          /* A tira também posiciona cada miniatura de forma absoluta: sem isso
             quem entra empurra as outras num corte seco. O invólucro de largura
             explícita é o que mantém o comportamento de antes — centralizada
             enquanto cabe (`justify-center`) e rolável de lado quando não cabe
             (`overflow-x-auto`), que é o que o Discord faz com dez miniaturas. */
          <div
            className="flex shrink-0 justify-center overflow-x-auto"
            style={{ height: FAIXA_ALTURA }}
          >
            <div
              className="relative shrink-0"
              style={{ width: larguraDaTira(resto.length), height: FAIXA_ALTURA }}
            >
              {resto.map((t, i) => (
                <div
                  key={t.key}
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
                  <VoiceTile tile={t} {...acoes} compacto />
                </div>
              ))}
            </div>
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

  const arranjo = melhorArranjo(celulas.length, tamanho.largura, tamanho.altura);
  // As linhas deixaram de ser elementos: cada célula recebe o retângulo pronto
  // e fica solta sobre o palco. É o que dá identidade a um tile entre dois
  // leiautes — o mesmo nó do DOM muda de coordenada, e o CSS interpola — em vez
  // de o navegador redesenhar fileiras com um filho a mais ou a menos.
  const vagas = posicionarGrade(celulas.length, arranjo, tamanho.largura, tamanho.altura);

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
    const ro = new ResizeObserver(([entrada]) => {
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
