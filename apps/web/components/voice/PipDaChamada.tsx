"use client";

import { useLayoutEffect, useState } from "react";
import { displayNameOf, donoDaIdentidade } from "@streamz/shared";
import type { TrackPublication } from "livekit-client";
import { Monitor } from "@/components/ui/icones";
import { VideoDaFaixa } from "@/components/voice/TileDeVoz";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useAplicativos } from "@/stores/aplicativos";
import {
  chaveDoTileDeTela,
  minhaTelaAparece,
  usePreviaDaMinhaTela,
} from "@/stores/assinaturas-de-tela";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { chaveDaJanela, useJanelasDeVoz } from "@/stores/janelas-de-voz";
import {
  previaDaMinhaTelaLigada,
  usePreferenciasDeTransmissao,
} from "@/stores/preferencias-de-transmissao";
import { ui, useUI } from "@/stores/ui";
import { participantesDe, telasDe, usuarioDaIdentidade, useVoice } from "@/stores/voice";

/**
 * A miniatura flutuante da transmissão quando o palco da chamada **não** está
 * na tela — o "picture-in-picture" do Discord no canto da conversa.
 *
 * O ganho é não perder a tela de vista ao ir responder alguém noutro canal: a
 * chamada continua (`VoiceLayer` a mantém viva com o app inteiro), e sem isto
 * a transmissão sumia até voltar ao canal de voz. Clicar leva de volta ao
 * palco — o mesmo caminho de `irParaCall` na barra de voz.
 *
 * **Qual transmissão.** Primeiro a de outra pessoa que eu escolhi assistir
 * (`assistindo`): ela já está assinada, então mostrá-la aqui não custa um
 * byte a mais. Só na falta dela vem a **minha** tela nativa (o participante
 * `<meuId>#tela`), e só quando a regra de `minhaTelaAparece` diz que ela
 * aparece — a mesma conta que decide a assinatura em
 * `assinaturas-de-tela.ts`. Pedir aqui por outra regra seria desenhar um
 * quadro preto sempre que as duas discordassem. A minha tela no **navegador**
 * não entra: ela é faixa local, publicada no meu próprio participante, e a
 * captura nativa é o caso que o Discord cobre com a prévia.
 *
 * Transmissão aberta numa janela solta fica de fora: a janela já é o
 * picture-in-picture dela, e duas cópias do mesmo quadro disputariam a mesma
 * faixa (ver `JanelasDeVoz`).
 *
 * **Sem segunda conexão.** O vídeo é o `VideoDaFaixa` do tile, colado na
 * publicação que a sala já tem. Com o `adaptiveStream` da sala, o elemento de
 * 320×180 também é o que diz ao SFU que camada mandar enquanto o palco está
 * fechado.
 *
 * Medidas: 320×180 (16:9), raio de 8 e 16px de folga da borda da coluna e do
 * composer — **não medidas** no Discord, que não tem print 1:1 deste estado no
 * acervo; são a leitura das capturas de referência.
 */

const LARGURA = 320;
const ALTURA = Math.round((LARGURA * 9) / 16);
/** Folga entre a miniatura, a borda direita da coluna e o topo do composer. */
const FOLGA = 16;
/**
 * O `px-2.5` do `<form>` do composer: a caixa dele fica 10px para dentro da
 * borda do formulário, e a miniatura se alinha à caixa, não ao formulário.
 */
const RECUO_DO_COMPOSER = 10;

interface Escolhida {
  publicacao: TrackPublication;
  nome: string;
  minha: boolean;
}

/**
 * O palco desta chamada está na tela? É a mesma pergunta que a página faz
 * para trocar a conversa pelo `VoicePanel` (`palcoAberto` em
 * `app/app/page.tsx`) e que o `DMView` faz para montar o `CallStage`.
 */
function usePalcoNaTela(channelId: string | null, guildId: string | null): boolean {
  const view = useUI((s) => s.view);
  const canalDeVozAberto = useChannels((s) => s.voiceChannelId);
  const conversaAberta = useDMs((s) => s.activeId);
  const amigosAbertos = useFriends((s) => s.open);
  // o diretório de apps toma a coluna 3 sem trocar o `view`: com ele aberto o
  // palco não está na tela, mesmo que o canal de voz continue "aberto"
  const appsAbertos = useAplicativos((s) => s.aberto);
  if (!channelId || appsAbertos) return false;
  if (guildId) return view === "guild" && canalDeVozAberto === channelId;
  return view === "dm" && !amigosAbertos && conversaAberta === channelId;
}

/** A transmissão da miniatura, pela ordem do cabeçalho; null quando não há. */
function useTransmissaoEscolhida(channelId: string | null): Escolhida | null {
  const meuId = useAuth((s) => s.user?.id ?? null);
  const assistindo = useVoice((s) => s.assistindo);
  const focado = useVoice((s) => s.focado);
  // `tick` é o pulso do SDK: a faixa chega **depois** da assinatura, e sem ele
  // a miniatura só apareceria no próximo re-render por outro motivo
  useVoice((s) => s.tick);
  const janelas = useJanelasDeVoz((s) => s.janelas);
  const previaPorPreferencia = usePreferenciasDeTransmissao(previaDaMinhaTelaLigada);
  const previaDaMinhaTela = usePreviaDaMinhaTela((s) => s.chave);

  if (!channelId || !meuId) return null;
  const emJanela = (dono: string) => !!janelas[chaveDaJanela("tela", dono)];
  const nomeDe = (identity: string) => {
    const user = usuarioDaIdentidade(channelId, identity);
    return user ? displayNameOf(user) : donoDaIdentidade(identity);
  };

  for (const dono of assistindo) {
    if (dono === meuId || emJanela(dono)) continue;
    for (const p of participantesDe(dono)) {
      const pub = telasDe(p).find((t) => !!t.track);
      if (pub) return { publicacao: pub, nome: nomeDe(p.identity), minha: false };
    }
  }

  if (emJanela(meuId)) return null;
  for (const p of participantesDe(meuId)) {
    // só o `#tela`: a identidade sem sufixo é a pessoa, e a tela dela é a
    // local do navegador (ver o cabeçalho)
    if (p.identity === meuId) continue;
    for (const pub of telasDe(p)) {
      const chave = chaveDoTileDeTela(meuId, pub.trackSid);
      if (!minhaTelaAparece(chave, { previaPorPreferencia, previaDaMinhaTela, focado })) continue;
      if (pub.track) return { publicacao: pub, nome: nomeDe(p.identity), minha: true };
    }
  }
  return null;
}

/**
 * Onde a miniatura pousa: o canto inferior direito da **coluna da conversa**,
 * acima do composer.
 *
 * A camada de voz vive fora do leiaute de colunas (ela tem de existir com o
 * app inteiro), então a posição é medida no DOM em vez de herdada: o composer
 * é o `<form>` com campo de texto dentro do `<main>` do shell — e o `<main>` é
 * a coluna da conversa, sem a lista de membros ao lado (no modo servidor ela
 * é irmã dele; na conversa direta ela fica dentro, mas o composer não). Sem
 * composer (canal somente-leitura, página de amigos, diretório de apps) o
 * canto é o do `<main>`, e sem nem ele, o da janela.
 *
 * Remedido quando o composer muda de altura (texto de várias linhas, resposta
 * aberta), quando a coluna muda de largura (lista de membros, thread) e
 * quando o shell troca de filhos (outro canal montou outro composer).
 */
function useAncora(ativo: boolean): { right: number; bottom: number } {
  const [ancora, setAncora] = useState({ right: FOLGA, bottom: FOLGA });

  useLayoutEffect(() => {
    if (!ativo) return;
    const shell = document.querySelector<HTMLElement>("[data-shell-desktop]");
    let quadro = 0;
    let observados: Element[] = [];
    const redimensionar = new ResizeObserver(() => agendar());

    const medir = () => {
      quadro = 0;
      const main = shell?.querySelector("main") ?? null;
      const formularios = main
        ? Array.from(main.querySelectorAll("form")).filter((f) =>
            f.querySelector('textarea, [contenteditable="true"]'),
          )
        : [];
      // o último: o composer fica no pé da coluna, e o que viesse antes dele
      // (um campo do cabeçalho) não é o que a miniatura deve evitar
      const composer = formularios[formularios.length - 1] ?? null;
      const alvos = [composer, main].filter((e): e is HTMLElement => !!e);
      if (alvos.length !== observados.length || alvos.some((a, i) => a !== observados[i])) {
        redimensionar.disconnect();
        for (const a of alvos) redimensionar.observe(a);
        observados = alvos;
      }
      const largura = window.innerWidth;
      const altura = window.innerHeight;
      if (composer) {
        const r = composer.getBoundingClientRect();
        setAncora({ right: largura - r.right + RECUO_DO_COMPOSER, bottom: altura - r.top + FOLGA / 2 });
      } else if (main) {
        const r = main.getBoundingClientRect();
        setAncora({ right: largura - r.right + FOLGA, bottom: altura - r.bottom + FOLGA });
      } else {
        setAncora({ right: FOLGA, bottom: FOLGA });
      }
    };
    // coalescido num quadro: a conversa muda o DOM a cada mensagem, e medir
    // uma vez por pintura basta
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };

    medir();
    const mutacoes = new MutationObserver(agendar);
    if (shell) mutacoes.observe(shell, { childList: true, subtree: true });
    window.addEventListener("resize", agendar);
    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      redimensionar.disconnect();
      mutacoes.disconnect();
      window.removeEventListener("resize", agendar);
    };
  }, [ativo]);

  return ancora;
}

/** Volta ao palco da chamada — o mesmo caminho de `irParaCall` na barra de voz. */
function irParaChamada(channelId: string, guildId: string | null): void {
  if (guildId) {
    const guild = useGuilds.getState().guilds.find((g) => g.id === guildId);
    const canal = useChannels.getState().channels.find((c) => c.id === channelId);
    ui.setView("guild");
    if (guild) useGuilds.getState().select(guild);
    if (canal) useChannels.getState().select(canal);
    return;
  }
  const conversa = useDMs.getState().channels.find((d) => d.id === channelId);
  ui.setView("dm");
  if (conversa) useDMs.getState().select(conversa);
}

export default function PipDaChamada() {
  const ehMobile = useEhMobile();
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const palcoNaTela = usePalcoNaTela(channelId, guildId);
  const escolhida = useTransmissaoEscolhida(palcoNaTela ? null : channelId);
  // no celular o shell é outro (abas e telas cheias) e não há coluna onde
  // pousar; a miniatura é coisa do leiaute de colunas
  const visivel = !ehMobile && !palcoNaTela && !!channelId && !!escolhida;
  const { right, bottom } = useAncora(visivel);

  if (!visivel || !escolhida || !channelId) return null;

  const rotulo = escolhida.minha
    ? "Voltar para a chamada — sua transmissão"
    : `Voltar para a chamada — transmissão de ${escolhida.nome}`;

  return (
    <button
      type="button"
      aria-label={rotulo}
      onClick={() => irParaChamada(channelId, guildId)}
      style={{ right, bottom, width: LARGURA, height: ALTURA }}
      className="group fixed z-30 overflow-hidden rounded-lg bg-black shadow-popout anim-menu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      {/* `key` pela faixa: trocar de transmissão remonta o `<video>` em vez de
          reaproveitar um elemento ainda preso à faixa anterior */}
      <VideoDaFaixa key={escolhida.publicacao.trackSid} publication={escolhida.publicacao} />
      {/* o rótulo do tile de tela (`TileDeVoz`), no tamanho que cabe em 320:
          só no hover ou no foco de teclado, como no Discord — em repouso a
          miniatura é só o quadro */}
      <span className="pointer-events-none absolute bottom-2 left-2 flex h-6 max-w-[calc(100%-16px)] items-center gap-1 rounded-lg bg-control-overlay-secondary-background-default pl-1.5 pr-2 text-xs text-control-overlay-secondary-text-default opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="grid h-4 w-4 shrink-0 place-items-center">
          <Monitor size={14} aria-hidden="true" />
        </span>
        <span className="truncate">{escolhida.nome}</span>
      </span>
    </button>
  );
}
