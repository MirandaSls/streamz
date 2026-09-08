"use client";

import { useEffect, useState } from "react";
import { Plus, UserPlus, Volume2 } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
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
  GAP,
  distribuir,
  melhorArranjo,
} from "@/components/voice/grid-layout";
import { registrarVolumePopover } from "@/components/voice/participant-menu";
import { useEhMobile } from "@/hooks/useEhMobile";
import { chaveDoTileDeTela } from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { ui } from "@/stores/ui";
import { camerasDe, participantesDe, telasDe, useVoice } from "@/stores/voice";

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

export default function VoiceGrid({
  channelId,
  nomeDoCanal,
  guildId = null,
  onAdicionar,
}: {
  channelId: string;
  nomeDoCanal?: string;
  /** ação de convidar do estado vazio — e o que distingue servidor de conversa. */
  guildId?: string | null;
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
  const ehMobile = useEhMobile();
  // elemento em estado (e não em ref): o palco é desmontado quando alguém sobe
  // ao destaque, e um `ref` não avisaria o observador de que voltou
  const [palco, setPalco] = useState<HTMLDivElement | null>(null);
  const tamanho = useTamanho(palco);

  // Quem transmite pelo app de desktop tem **dois** participantes na sala: a
  // pessoa e o `<userId>#tela` da captura nativa. As faixas dos dois entram nos
  // tiles do dono — o `#tela` nunca vira uma pessoa a mais na grade.
  const tiles: Tile[] = states.flatMap((state): Tile[] => {
    const meus = participantesDe(state.user.id);
    const sou = state.user.id === me?.id;
    const camera = meus.flatMap(camerasDe)[0] ?? null;
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
    const telas = meus.flatMap(telasDe).map(
      (pub): Tile => ({
        key: chaveDoTileDeTela(state.user.id, pub.trackSid),
        state,
        publication: pub,
        tela: true,
        // A minha transmissão é sempre exibida, como no Discord: no navegador
        // porque a faixa é local, e no desktop porque a store assina de volta o
        // `<userId>#tela` da captura nativa (ver `assinaturas-de-tela.ts`).
        // Esconder a própria tela atrás de "Assistir" seria pedir permissão a
        // si mesmo — e foi por não haver esse pedido que ela ficou preta.
        assistindo: sou || assistindo.has(state.user.id),
        userId: state.user.id,
        comVideo: !!pub.track,
      }),
    );
    return [pessoa, ...telas];
  });

  // transmissão que eu **estou assistindo** assume o palco sozinha (Discord).
  // Só quando ninguém escolheu nada à mão — ver `focoAutomatico` na store —, e
  // só depois de assistida: subir ao palco uma tela fechada daria o convite
  // "Assistir transmissão" em tamanho de cinema.
  const telaAssistida = tiles.find((t) => t.tela && t.assistindo) ?? null;
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

  if (tiles.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-lg font-bold text-txt-primary">
            {nomeDoCanal ? `Ninguém em ${nomeDoCanal}` : "Ninguém na sala"}
          </p>
          <p className="max-w-sm text-sm text-txt-muted">
            Chame alguém e a conversa começa aqui — quem entrar aparece nesta tela.
          </p>
          {guildId && (
            <button
              type="button"
              onClick={() => ui.openModal({ kind: "invite", guildId })}
              className="mt-1 flex h-9 items-center gap-2 rounded-[3px] bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
            >
              <UserPlus size={16} aria-hidden="true" />
              Convidar pessoas
            </button>
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
                className="grid h-20 w-20 place-items-center rounded-full text-txt-secondary transition hover:bg-panel hover:text-txt-primary"
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
  const principal =
    (focado ? tiles.find((t) => t.key === focado) : null) ??
    (focado ? tiles.find((t) => t.state.user.id === focado) : null) ??
    null;
  const resto = principal ? tiles.filter((t) => t.key !== principal.key) : tiles;

  if (principal) {
    const foco = melhorArranjo(1, tamanho.largura, tamanho.altura);
    return (
      <div className="flex h-full min-h-0 flex-col items-center" style={{ gap: FOCO_GAP }}>
        {/* o destaque mantém 16:9 e fica centralizado nos dois eixos, como na
            print: é `melhorArranjo` com uma vaga só */}
        <div
          ref={setPalco}
          className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        >
          <div style={{ width: foco.largura, height: foco.altura }}>
            <VoiceTile tile={principal} {...acoes} grande />
          </div>
        </div>

        {resto.length > 0 && (
          <div
            className="flex shrink-0 justify-center overflow-x-auto"
            style={{ gap: FAIXA_GAP, height: FAIXA_ALTURA }}
          >
            {resto.map((t) => (
              <div
                key={t.key}
                className="shrink-0"
                style={{ width: FAIXA_LARGURA, height: FAIXA_ALTURA }}
              >
                <VoiceTile tile={t} {...acoes} compacto />
              </div>
            ))}
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
  const linhas = distribuir(celulas.length, arranjo.colunas);
  let indice = 0;

  return (
    <div
      ref={setPalco}
      className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden"
      style={{ gap: GAP }}
    >
      {linhas.map((quantos, linha) => {
        const fatia = celulas.slice(indice, indice + quantos);
        indice += quantos;
        return (
          <div key={linha} className="flex shrink-0 justify-center" style={{ gap: GAP }}>
            {fatia.map((c) => (
              <div
                key={c.tipo === "tile" ? c.t.key : "convite"}
                style={{ width: arranjo.largura, height: arranjo.altura }}
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
      })}
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
      className="fixed z-50 w-56 rounded-lg bg-overlay p-3 shadow-high anim-menu"
    >
      <p className="truncate pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-txt-muted">
        {popover.nome}
      </p>
      <label className="flex items-center gap-2 text-sm text-txt-normal">
        <Volume2 size={16} aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(popover.userId, Number(e.target.value) / 100)}
          aria-label={`Volume de ${popover.nome}`}
          className="flex-1 accent-accent"
        />
        <span className="w-9 text-right text-xs text-txt-muted">{Math.round(volume * 100)}%</span>
      </label>
    </div>
  );
}
