"use client";

import { useEffect, useRef, useState } from "react";
import {
  Apps,
  Eye,
  ExternalLink,
  EyeOff,
  HeadphoneOff,
  MicOff,
  Monitor,
  MonitorX,
  Play,
  UserPlus,
} from "@/components/ui/icones";
import type { TrackPublication } from "livekit-client";
import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import Tooltip from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/primitivos";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import {
  alternarTelaCheiaDe,
  soltarTelaCheiaDe,
  suportaTelaCheia,
} from "@/components/voice/fullscreen";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { abrirMenuDaMinhaTela, abrirMenuDeParticipante } from "@/components/voice/participant-menu";
import { podePararDeAssistir } from "@/components/voice/parar-de-assistir";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { useCorDominante } from "@/lib/cor-dominante";
import { chaveDaJanela, useJanelasDeVoz } from "@/stores/janelas-de-voz";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui } from "@/stores/ui";

/**
 * **Um** participante do palco: o tile com vídeo/avatar, o avatar solto da
 * chamada direta, o tile de convite e o `<video>` colado numa faixa do SDK.
 *
 * Saiu de `VoiceGrid.tsx` sem uma linha de desenho mudada quando o palco do
 * celular (`PalcoMobile`) passou a desenhar os mesmos tiles em outro arranjo:
 * os dois precisavam da mesma peça, e importar um do outro faria um ciclo. O
 * que decide **onde** cada tile fica continua em `VoiceGrid`/`PalcoMobile`;
 * aqui é só a peça.
 */

/**
 * Quanto o clique simples espera pelo segundo antes de trocar o foco.
 *
 * Dois cliques na transmissão alternam a tela cheia (é o gesto do Discord) e
 * **não** podem também fixar o tile: sem esta espera o primeiro dos dois
 * cliques já teria trocado o palco antes de o segundo chegar. 250ms é o
 * intervalo em que um duplo clique de fato acontece; um mais lento que isso
 * troca o foco e depois entra na tela cheia — preferível ao contrário, que
 * seria atrasar **todo** clique de foco por meio segundo.
 */
const ESPERA_DO_DUPLO_CLIQUE = 250;

/** Uma vaga do palco, do ponto de vista de quem desenha. */
export interface Tile {
  key: string;
  state: VoiceStateEvent;
  publication: TrackPublication | null;
  tela: boolean;
  /** só para tela: o vídeo aparece — escolhi assistir, é a minha no navegador ou pedi a prévia da minha nativa. */
  assistindo: boolean;
  /** id do dono — o que casa um `focado` guardado como pessoa. */
  userId: string;
  /** há faixa **viva** para desenhar (é o que decide a tela cheia no celular). */
  comVideo: boolean;
  /**
   * A minha tela pela captura nativa do desktop (`<userId>#tela`). Ela não se
   * assina por padrão: sem prévia (`assistindo` falso) o tile mostra o aviso
   * "Você está compartilhando sua tela" em vez do vídeo.
   */
  minhaTelaNativa?: boolean;
}

/** As ações que todo tile precisa, iguais nos dois palcos. */
export interface AcoesDoTile {
  meId?: string;
  falando: ReadonlySet<string>;
  channelId: string;
  onFocar: (chave: string | null) => void;
  onAssistir: (userId: string, chave: string) => void;
  onPararDeAssistir: (userId: string) => void;
  /** "Ver prévia"/"Ocultar prévia" no tile da minha tela nativa. */
  onPreviaDaMinhaTela?: (chave: string, ver: boolean) => void;
}

/**
 * A vaga vazia do palco, como convite.
 *
 * A arte do Discord aqui é ilustração proprietária deles; o que se copia é o
 * **papel** do tile — ocupar a vaga com uma ação em vez de com vazio —, não o
 * desenho. O nosso é o brilho do accent no canto, que é o que a marca tem.
 *
 * Os dois botões da print `2026-08-31 101857` (1:1): "Convidar para voz" e
 * "Escolher atividade", cada um com **40px** de altura contando a borda
 * (coluna x=1355, y=573–612) e **8px** entre eles (linha y=580, x=1524–1531),
 * fundo translúcido sobre a arte (`#18181b` sobre `#070709`) — o `secundario`
 * `md` do primitivo. Atividade não existe no Streamz: pelo §6.6 do PROCESSO o
 * botão fica **visível e desabilitado** com "(em breve)" na dica.
 */
export function TileDeConvite({ guildId }: { guildId: string }) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-lg bg-chat-background-default">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-center gap-2 px-3">
        <Button
          variante="secundario"
          tamanho="md"
          icone={<UserPlus size={16} aria-hidden="true" />}
          onClick={() => ui.openModal({ kind: "invite", guildId })}
        >
          Convidar para voz
        </Button>
        {/* `motivoDesabilitado` faz o que o `span` focável fazia à mão: o
            botão continua no Tab (`aria-disabled`) e a dica "(em breve)" abre
            no hover e no foco — ver o cabeçalho de `primitivos/Button.tsx`. */}
        <Button
          variante="secundario"
          tamanho="md"
          icone={<Apps size={16} aria-hidden="true" />}
          disabled
          motivoDesabilitado="Escolher atividade (em breve)"
        >
          Escolher atividade
        </Button>
      </div>
    </div>
  );
}

/**
 * Um participante no palco de avatares: só a foto, o anel de fala e o selo de
 * mudo.
 *
 * O nome não aparece em lugar nenhum — é assim no Discord, e faz sentido: numa
 * chamada direta você sabe com quem está falando, e o rótulo só roubaria
 * espaço do rosto. Ele continua alcançável pelo tooltip e pelo `aria-label`,
 * que é o que mantém a tela utilizável para quem navega por leitor de tela.
 *
 * O menu de contexto (volume, silenciar) segue no botão direito, igual ao tile:
 * trocar de leiaute não pode custar uma capacidade.
 */
export function AvatarDeChamada({
  tile,
  meId,
  falando,
  channelId,
}: {
  tile: Tile;
  meId?: string;
  falando: ReadonlySet<string>;
  channelId: string;
}) {
  const { state } = tile;
  const sou = state.user.id === meId;
  const nome = displayNameOf(state.user);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história.
  // A conta é só esta — `participant.isSpeaking` saiu de cena: era uma segunda
  // fonte, lida no render em vez de reagir a evento, e é dela que vinham as
  // duas divergências (palco aceso e lista apagada; palco piscando).
  const ativo = !state.muted && falando.has(state.user.id);
  const statuses = usePresence((s) => s.statuses);
  const status = resolveStatus(statuses, state.user);
  // ausente esmaece; falar prova presença e desfaz o esmaecido na hora.
  const ausente = status === "IDLE" && !ativo;

  return (
    <Tooltip label={nome}>
      <span
        data-voice-avatar={state.user.id}
        aria-label={nome}
        onContextMenu={(e) => {
          e.preventDefault();
          abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId, noPalco: true });
        }}
        className={`relative inline-grid rounded-full transition ${
          state.reconnecting ? "opacity-50" : ausente ? "opacity-60" : ""
        }`}
      >
        <Avatar
          user={state.user}
          size="xl"
          // o palco de avatares só existe no `CallStage`, que é `--black`: o
          // recorte do selo de mudo/surdo tem de ser da mesma cor do palco
          surface="border-black"
          status={status}
          // o servidor manda sobre o próprio: quem foi mutado/ensurdecido por
          // um moderador mostra o selo "-servidor" mesmo que também tenha se
          // silenciado sozinho (ver `useSilencioDoServidor.ts`)
          voz={
            state.serverDeaf
              ? "surdo-servidor"
              : state.serverMute
                ? "mudo-servidor"
                : state.deafened
                  ? "surdo"
                  : state.muted
                    ? "mudo"
                    : null
          }
          className={`transition ${ativo ? ENCOLHE_AO_FALAR : ""}`}
        />
        {/* O anel fica DENTRO do Ø80: a foto encolhe 2px e ele ocupa a folga.
            Desenhado por fora, o avatar crescia quando a pessoa falava e a
            fileira inteira parecia pular a cada sílaba. */}
        {ativo && <AnelDeFala />}
      </span>
    </Tooltip>
  );
}

/**
 * Um participante: vídeo quando há, avatar quando não.
 *
 * O fundo é a **cor dominante da foto** (ver `lib/cor-dominante.ts`), como no
 * Discord: medido na print `203909`, o fundo do tile e o fundo do avatar são o
 * mesmo pixel — mas **só quando há vídeo ao vivo**. Sem vídeo (ninguém com
 * câmera aberta), o Discord tem tile escuro e avatar redondo centrado
 * (~80px), como a loja mostra (`lojas/appstore-iphone-pt-br/03.png`; proporção
 * e presença, não px — é imagem de catálogo). O tile inteiro pintado com
 * `corDoAvatar(userId)` era o bug: a `Avatar` de baixo, sem foto, cai no
 * **mesmo** hash da **mesma** pessoa (`corDoAvatar` de novo) — as duas cores
 * saem idênticas e o círculo do avatar desaparece contra o próprio fundo,
 * lendo como "iniciais gigantes boiando num retângulo colorido" em vez de um
 * avatar normal num tile escuro (visto em `m-voz.png`: `#1c9330` em 366×614,
 * linha y=400 e coluna x=195). Por isso `usaFundoDaFoto` só é `true` com
 * `video` — aí a cor dominante existe para preencher a moldura atrás do
 * `object-contain`; sem vídeo o tile some no neutro que o `TileDeConvite`
 * (vazio) já usa, e só a `Avatar` fica colorida.
 */
export function VoiceTile({
  tile,
  meId,
  falando,
  channelId,
  onFocar,
  onAssistir,
  onPararDeAssistir,
  onPreviaDaMinhaTela,
  grande = false,
  compacto = false,
  semAcoes = false,
  raio,
  ajusteDoVideo = "object-contain",
  rotuloPequeno = false,
}: AcoesDoTile & {
  tile: Tile;
  grande?: boolean;
  compacto?: boolean;
  /**
   * Como o vídeo preenche o tile. `contain` é o padrão e o único aceitável
   * para uma **tela compartilhada**: cortar as bordas de uma tela é cortar
   * justamente o texto que a pessoa abriu para ler. Numa **câmera** o telefone
   * pede `cover` — o tile do celular é quase quadrado, e um 16:9 contido nele
   * vira duas tarjas pretas maiores que o rosto.
   */
  ajusteDoVideo?: string;
  /**
   * Rótulo de 20px em vez de 32. A miniatura do desktop tem 188×106 e a do
   * celular 116×78 (menos ainda deitado): a pílula de 32 do `compacto` sobra
   * pelas bordas do tile e cobre metade do rosto. Só o palco do celular passa
   * isto — a faixa do desktop continua com o mesmo pixel.
   */
  rotuloPequeno?: boolean;
  /**
   * Esconde a fileira de ações do canto. No celular ela é um `group-hover`
   * sobre um dedo que não paira: seis alvos de 28px que ninguém consegue
   * acertar e que ficariam **sempre** visíveis, tapando o rosto. Lá as mesmas
   * ações moram no toque longo (menu de participante) e nos controles.
   */
  semAcoes?: boolean;
  /** raio da moldura; o padrão é o `rounded-lg` do desktop. */
  raio?: number;
}) {
  const { state, publication, tela, assistindo } = tile;
  const sou = state.user.id === meId;
  /**
   * A chave da **janela solta**, não `tile.key`: elas divergem para a tela —
   * `chaveDaJanela` usa `${userId}:tela` (fixa), e `tile.key` usa
   * `${userId}:${trackSid}` (`chaveDoTileDeTela`, muda a cada nova
   * transmissão). Assinado com a chave errada, o placeholder nunca casaria com
   * a janela aberta pelo menu de participante (`abrirJanelaSolta`, que também
   * registra com `chaveDaJanela`).
   *
   * Reativo por seletor, e não `jaAberta()`: aquele muda o store como
   * efeito colateral de ler (limpa entrada morta), o que não é seguro dentro
   * do corpo do render. O `pagehide` da janela (`lib/janela-solta.ts`) já
   * chama `fechar()` sozinho, então o registro do store fica em dia sem
   * ajuda daqui — só o `!win.closed` cobre a janela que sumiu sem disparar o
   * evento (aba congelada).
   */
  const chaveJanela = chaveDaJanela(tela ? "tela" : "usuario", tile.userId);
  const janelaDaChave = useJanelasDeVoz((s) => s.janelas[chaveJanela]);
  const emJanela = !!janelaDaChave && !janelaDaChave.win.closed;
  const caixa = useRef<HTMLDivElement>(null);
  /**
   * **Tela cheia do tile nunca é a da janela sozinha** — e no app desktop ela
   * também não é a do navegador.
   *
   * Dentro do Tauri a Fullscreen API do DOM não serve (no Windows o tile fica
   * preso ao interior da janela; no macOS o recurso nem está ligado no
   * WebView), então `alternarTelaCheiaDe` **emula**: janela em tela cheia mais
   * o tile promovido por CSS nosso. O detalhe todo está em `fullscreen.ts`.
   *
   * Por isso `suportaTelaCheia` responde "sim" em qualquer ambiente do app —
   * a emulação não depende de nada que a webview possa recusar — e o botão só
   * some no navegador sem a API (`<iframe>` sem `allow`, WebKit antigo), onde
   * ele seria mesmo inerte.
   *
   * Resolvido num efeito, como em `useTelaCheia`: no HTML do servidor não há
   * `document`, e decidir na primeira renderização deixaria a hidratação
   * discordando da marcação.
   */
  const [podeTelaCheia, setPodeTelaCheia] = useState(false);
  useEffect(() => {
    setPodeTelaCheia(suportaTelaCheia());
  }, []);
  /**
   * O tile pode sumir em tela cheia (a pessoa parou de transmitir, a chamada
   * acabou). O navegador solta a tela cheia do DOM sozinho quando o elemento
   * deixa a página — a janela do Tauri não —, e sem isto sobraria um app sem
   * moldura e sem botão para desfazer. O elemento é capturado na montagem: no
   * desmonte o `ref` já pode ter sido zerado pelo React.
   */
  useEffect(() => {
    const el = caixa.current;
    return () => soltarTelaCheiaDe(el);
  }, []);
  /**
   * O ponteiro está **sobre o retângulo** do tile — e não o `:hover` do CSS.
   *
   * O `group-hover` mentia perto da fileira de ações: o palco desenha faixas
   * transparentes de largura inteira por cima do tile (o cabeçalho do
   * `CallStage`, que é `absolute inset-x-0 top-0 z-10`, e os controles), e
   * subir o cursor até o botão "Tela cheia" — que fica a 4px do topo do tile —
   * levava o ponteiro para dentro dessa faixa. Para o CSS o tile deixava de
   * estar sob o mouse e a fileira se apagava **debaixo da mão**, no meio do
   * movimento de clicar nela. Com a geometria, uma vez visíveis os botões só
   * somem quando o ponteiro sai do tile, que é o que o olho chama de "estar
   * no tile".
   */
  const [pairando, setPairando] = useState(false);
  useEffect(() => {
    if (!pairando) return;
    const aoMover = (e: PointerEvent) => {
      const r = caixa.current?.getBoundingClientRect();
      if (!r) return;
      const dentro =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dentro) setPairando(false);
    };
    // na captura: overlay que pare a propagação não pode deixar a fileira acesa
    window.addEventListener("pointermove", aoMover, true);
    return () => window.removeEventListener("pointermove", aoMover, true);
  }, [pairando]);
  /** clique simples segurado à espera do segundo (ver `ESPERA_DO_DUPLO_CLIQUE`). */
  const cliquePendente = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(cliquePendente.current), []);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história.
  // A conta é só esta — `participant.isSpeaking` saiu de cena: era uma segunda
  // fonte, lida no render em vez de reagir a evento, e é dela que vinham as
  // duas divergências (palco aceso e lista apagada; palco piscando).
  const ativo = !state.muted && falando.has(state.user.id);
  const statuses = usePresence((s) => s.statuses);
  const status = resolveStatus(statuses, state.user);
  // ausente esmaece; falar prova presença e desfaz o esmaecido na hora.
  // Nunca entra no vídeo — só no avatar (câmera desligada) e no rótulo.
  const ausente = status === "IDLE" && !ativo;
  const nome = displayNameOf(state.user);
  // a foto ao vivo, pelo mesmo caminho do `Avatar`: quem troca a foto troca
  // também a cor do tile, sem F5
  const perfil = usePresence((e) => e.profiles[state.user.id]);
  const fundo = useCorDominante((perfil ?? state.user).avatarUrl, corDoAvatar(state.user.id));
  /**
   * A minha tela nativa sem prévia pedida. A faixa pode até estar chegando (a
   * miniatura do hover a assina em baixa), mas o tile continua no aviso: quem
   * decide se ela aparece aqui é o "Ver prévia".
   */
  const minhaTelaOculta = !!tile.minhaTelaNativa && !assistindo;
  /**
   * Só mostra vídeo quando há faixa: tela fechada não tem o que desenhar. E
   * nunca com `emJanela`: a janela solta já decodifica a mesma faixa
   * (`JanelasDeVoz.tsx`); colar o `<video>` aqui **também** seria decodificar
   * duas vezes o quadro que a pessoa já está vendo na outra janela.
   */
  const video = publication?.track && !minhaTelaOculta && !emJanela ? publication : null;
  /** ver o comentário do componente: a cor dominante só pinta o tile quando
   *  há vídeo de verdade atrás dela; sem vídeo o tile fica no neutro do
   *  palco, senão ele se camufla com a cor da `Avatar` sem foto. */
  const usaFundoDaFoto = Boolean(video);
  const podeParar = podePararDeAssistir({ tela, assistindo, sou, minhaTelaNativa: tile.minhaTelaNativa });

  return (
    <div
      ref={caixa}
      data-voice-tile={tile.key}
      // dedo não paira (ver `primitivos/Tooltip.tsx`): num toque o estado
      // ficaria preso aceso, e no celular a fileira nem existe (`semAcoes`)
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setPairando(true);
      }}
      // Um clique põe no palco, e o clique no que já está no palco volta para a
      // grade (`setFocado` alterna). Era duplo clique: ninguém adivinha isso, e
      // a print mostra o Discord trocando de foco com um toque só. Os botões de
      // dentro param a propagação — senão "silenciar" também mexeria no palco.
      //
      // No desktop o foco espera `ESPERA_DO_DUPLO_CLIQUE` porque o **duplo**
      // clique tem outro dono: a tela cheia. Fazer as duas coisas no mesmo
      // gesto é o que o Discord não faz.
      onClick={(e) => {
        // `semAcoes` é o palco do celular, que abre a tela cheia dele com UM
        // toque (`PalcoMobile`) e não tem duplo clique a esperar: ali o atraso
        // seria atraso puro
        if (semAcoes) {
          onFocar(tile.key);
          return;
        }
        if (e.detail > 1) return; // o segundo clique é do `onDoubleClick`
        window.clearTimeout(cliquePendente.current);
        cliquePendente.current = window.setTimeout(() => onFocar(tile.key), ESPERA_DO_DUPLO_CLIQUE);
      }}
      // Dois cliques na transmissão entram/saem da tela cheia, no **mesmo**
      // elemento que o botão "Tela cheia" usa — gesto e botão abrindo caixas
      // diferentes seriam duas telas cheias distintas.
      onDoubleClick={
        semAcoes || !podeTelaCheia
          ? undefined
          : (e) => {
              // botão de dentro já tem ação própria: dois cliques nele não são
              // "dois cliques na transmissão". E o placeholder de janela
              // aberta não tem transmissão nenhuma para colocar em tela
              // cheia — é o mesmo motivo do botão, só que sem elemento
              // `<button>` cobrindo a área toda.
              if ((e.target as HTMLElement).closest("button, [data-placeholder-janela]")) return;
              window.clearTimeout(cliquePendente.current);
              void alternarTelaCheiaDe(caixa.current);
            }
      }
      onContextMenu={(e) => {
        e.preventDefault();
        if (tela && sou) {
          abrirMenuDaMinhaTela(e.clientX, e.clientY);
          return;
        }
        abrirMenuDeParticipante(e.clientX, e.clientY, state.user, {
          sou,
          channelId,
          noPalco: true,
          tela: podeParar ? { onPararDeAssistir: () => onPararDeAssistir(state.user.id) } : undefined,
        });
      }}
      aria-label={`${nome}${tela ? " — tela compartilhada" : ""}`}
      // O tile **emerge** do palco na cor da pessoa só quando há vídeo (ver o
      // comentário do componente): o `<video>` cobre tudo, e a cor dominante
      // só aparece nas bordas do `object-contain`. Sem vídeo o fundo é o
      // neutro do palco — a `Avatar` de baixo é quem fica na cor do hash.
      //
      // Sem linha preta em volta. Sem câmera, o sinal de fala mora no anel do
      // avatar, que é onde o olho já está; com câmera não há avatar, e aí a
      // moldura verde entra (ver o `span` logo depois do vídeo).
      style={{
        ...(usaFundoDaFoto ? { backgroundColor: fundo } : {}),
        ...(raio === undefined ? {} : { borderRadius: raio }),
      }}
      className={`group relative h-full w-full overflow-hidden transition ${
        raio === undefined ? "rounded-lg" : ""
      } ${usaFundoDaFoto ? "" : "bg-chat-background-default"}`}
    >
      {emJanela ? (
        <PlaceholderJanelaAberta chave={chaveJanela} nome={nome} compacto={compacto} />
      ) : video ? (
        <VideoDaFaixa publication={video} espelhar={sou && !tela} ajuste={ajusteDoVideo} />
      ) : tela ? (
        // Sem faixa. Ou a tela não se assiste ainda — e aí o convite logo
        // abaixo é tudo o que há para ver —, ou ela já foi assinada e o
        // primeiro quadro está a caminho: assinar é uma ida e volta ao
        // servidor de mídia, e um retângulo mudo nesse intervalo é
        // indistinguível de uma transmissão quebrada (foi como a tela preta
        // apareceu na print da 0.0.18).
        <span className="grid h-full w-full place-items-center px-3 text-center text-xs text-text-overlay-light/70">
          {assistindo ? "Carregando a transmissão…" : null}
        </span>
      ) : (
        <span className="grid h-full w-full place-items-center">
          {/* o anel acompanha o avatar, e não a caixa: num tile grande a borda
              externa fica longe demais do rosto para ler como "falando". E ele
              é desenhado por DENTRO do avatar — a foto encolhe 2px e o anel
              ocupa a folga —, senão o avatar cresce quando a pessoa fala e o
              tile inteiro parece pular.

              80px no tile do palco (medido na print `2026-08-31 101857`, 1:1:
              avatar de 80 num tile de 760×428) e 64 na faixa de miniaturas
              (medido em `203909`: ~68px num tile de 188×106 — o avatar do
              Discord é quase constante, não uma fração do tile). */}
          <span
            className={`relative inline-grid rounded-full transition-opacity ${
              ausente ? "opacity-60" : ""
            }`}
          >
            <Avatar
              user={state.user}
              size="xl"
              surface="border-chat-background-default"
              status={status}
              className={`transition ${ativo ? ENCOLHE_AO_FALAR : ""} ${
                compacto && rotuloPequeno
                  ? // tira do celular (116×78, só ela passa `rotuloPequeno`): os
                    // 64 da tira do desktop ocupavam 82% da altura e eram
                    // cortados pela borda e pela pílula (passeio de 2026-09-15).
                    // 40 cabe acima da pílula; não medido no Discord, que não
                    // tem captura da tira de miniaturas no celular com escala
                    "h-10 w-10 [&>img]:h-10 [&>img]:w-10 [&>span]:h-10 [&>span]:w-10 [&>span]:text-sm"
                  : compacto
                    ? "h-16 w-16 [&>img]:h-16 [&>img]:w-16 [&>span]:h-16 [&>span]:w-16 [&>span]:text-xl"
                    : ""
              }`}
            />
            {ativo && <AnelDeFala />}
          </span>
        </span>
      )}

      {/* Quem fala com a câmera aberta não tem avatar onde pendurar o anel: o
          sinal vira a moldura do tile. A geometria é a da única moldura de tile
          que o CSS capturado define — `.border__2f4f7.voiceChannelEffect__2f4f7
          {box-shadow:inset 0 0 0 2px …,inset 0 0 0 3px var(--black)}`
          (`sob-demanda/655282.7b25cb505483f3c7.css`), com o raio do tile
          (`--custom-base-tile-border-radius` = 8) —, na cor de fala de todo o
          app (`--status-positive`). A classe de "falando" do tile não está no
          CSS capturado: a cor é a regra, não medida. */}
      {video && ativo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_2px_rgb(var(--status-positive-rgb)),inset_0_0_0_3px_rgb(var(--black-rgb))]"
        />
      )}

      {/* Carência do servidor correndo: a pessoa ainda está na chamada, e some
          só se não voltar. Esmaecer em vez de remover é o que evita a grade
          piscar a cada oscilação de rede de alguém. */}
      {state.reconnecting && (
        <span className="absolute inset-0 grid place-items-center bg-background-scrim text-xs font-semibold text-text-overlay-light">
          Reconectando…
        </span>
      )}

      {/* Convite para abrir uma transmissão que ainda não estou assistindo.
          Pílula discreta, e não a chapa que cobria o tile inteiro: o botão
          gigante escondia justamente o tile que ele anuncia (print nosso
          `2026-09-03 203457`).

          **Medido no CSS do Discord**, que tem a classe deste botão exato — o
          que fica centrado sobre a prévia de uma transmissão
          (`.watchActionContainer__8151b{position:absolute;inset:0;display:flex;
          align-items:center;justify-content:center}` e
          `.watchButton__8151b{border-radius:var(--radius-lg);gap:4px;
          padding:8px 12px}`, `sob-demanda/abe64b8a525be124.css`):
          **8px/12px** de respiro em volta de uma linha de 16 = **32** de altura
          (`h-8` + `px-3` + `leading-4`), **4** entre glifo e rótulo (`gap-1`) e
          raio **16** (`--radius-lg`), que numa pílula de 32 é o `rounded-full`.
          O verde de marca saiu: ali o Discord usa um fundo translúcido, e a
          outra variante do mesmo botão (`.watchButton_ca5185`) nomeia
          justamente o par `--control-overlay-secondary-*` — o mesmo que este
          arquivo já usa para "botão flutuando sobre vídeo" (ver `AcaoDoTile` e
          o "Ver prévia" ao lado). Chapa de marca com sombra sobre a
          transmissão anunciava um CTA de página, não um convite discreto.
          Rótulo curto pela mesma razão: quem lê "Assistir" sobre uma
          transmissão não precisa que lhe repitam o substantivo — a frase
          inteira continua no `aria-label`. */}
      {/* A minha própria transmissão, no desktop: aviso em vez de vídeo, como
          no Discord. Baixar de volta a tela que esta máquina acabou de
          codificar é decodificar 1440p só para se ver — ver
          `assinaturas-de-tela.ts`. O botão reaproveita a pílula de 32px do
          convite ao lado, no cinza secundário: não é um chamado para agir. */}
      {/* Não junto do `emJanela`: com a janela aberta o placeholder de cima já
          cobre o mesmo `inset-0` e conta a história certa ("aberto em outra
          janela"), e não a desta caixa ("Ver prévia"), que não faz sentido
          para uma tela que já está sendo vista — só noutro lugar. */}
      {minhaTelaOculta && !emJanela && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          {!compacto && (
            <span className="text-sm font-semibold text-text-strong">
              Você está compartilhando sua tela
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreviaDaMinhaTela?.(tile.key, true);
            }}
            aria-label="Ver prévia da sua transmissão"
            className={`flex h-8 items-center rounded-full bg-control-secondary-background-default font-semibold text-control-secondary-text-default shadow-popout transition hover:bg-control-secondary-background-hover hover:text-control-secondary-text-hover ${
              compacto ? "w-8 justify-center" : "gap-2 px-3 text-[13px]"
            }`}
          >
            <Eye size={14} aria-hidden="true" />
            {!compacto && "Ver prévia"}
          </button>
        </span>
      )}

      {/* Desfazer o "Ver prévia" da minha captura nativa — o **único** ícone
          que ainda pousa sobre uma transmissão, e ele é nosso: no Discord a
          própria tela não tem prévia para ligar, então também não há o que
          desligar. Sem ele o "Ver prévia" seria de mão única, e prévia ligada
          é faixa assinada (`assinaturas-de-tela.ts`) — o custo que o aviso
          existe para evitar.

          Canto inferior **direito**, e não o de cima: lá mora o "AO VIVO", que
          desde as prints `p2`/`p4`/`p6` não pisca mais no hover. Embaixo à
          esquerda fica o rótulo de nome; esta é a quina que sobra. */}
      {!semAcoes && tile.minhaTelaNativa && assistindo && (
        <div
          className={`absolute bottom-1 right-1 z-20 transition focus-within:opacity-100 ${
            pairando ? "opacity-100" : "opacity-0"
          }`}
        >
          <AcaoDoTile label="Ocultar prévia" onClick={() => onPreviaDaMinhaTela?.(tile.key, false)}>
            <EyeOff size={14} />
          </AcaoDoTile>
        </div>
      )}

      {/* `!emJanela`: abrir a janela solta já assina a transmissão sozinho
          (`useAssinaturaDaTela` em `JanelasDeVoz.tsx`) — mas entre o clique
          que abre a janela e esse efeito rodar há um quadro em que
          `emJanela` já é `true` e `assistindo` ainda não. Sem a checagem, o
          convite "Assistir" piscaria por cima do placeholder nesse instante. */}
      {tela && !assistindo && !tile.minhaTelaNativa && !emJanela && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssistir(state.user.id, tile.key);
          }}
          aria-label={`Assistir à transmissão de ${nome}`}
          className="absolute inset-0 grid place-items-center"
        >
          <span
            className={`flex h-8 items-center rounded-full bg-control-overlay-secondary-background-default text-text-sm font-medium leading-4 text-control-overlay-secondary-text-default transition group-hover:bg-control-overlay-secondary-background-hover ${
              compacto ? "w-8 justify-center" : "gap-1 px-3"
            }`}
          >
            <Play size={16} aria-hidden="true" />
            {!compacto && "Assistir"}
          </span>
        </button>
      )}

      {/* "Ao vivo" é selo próprio no canto **superior direito**, não um pedaço
          do rótulo de nome. No Discord os dois convivem: o nome embaixo à
          esquerda, o aviso de transmissão em cima à direita. Dentro do rótulo
          ele competia com o nome pela mesma linha e sumia junto com ela. */}
      {tela && (
        // **Sempre visível.** Ele sumia no hover porque a fileira de ações
        // morava neste mesmo canto; agora o card de tela não tem fileira
        // nenhuma (ver o bloco de ações lá embaixo), e nas prints `p2`/`p4`/
        // `p6` o "AO VIVO" é o *único* elemento persistente do card — some o
        // motivo de ele piscar debaixo da mão.
        //
        // Medido na print `2026-08-31 123917` (1:1): selo de **16px** de altura
        // (coluna x=610, y=125–140), 59 de largura para "AO VIVO"
        // (linha y=128, x=604–662), a **8px** do topo do tile (tile em y=117) e
        // ~8 da borda direita — `.indicators__2f4f7{inset-inline-end:8px;top:8px}`
        // no CSS. Pílula: `.liveShapeRound_a7acae{border-radius:
        // var(--custom-live-indicator-border-radius)}` = 16; respiro lateral
        // `.live_a7acae{padding:0 6px}`; caixa alta `.liveSmall_a7acae`. O corpo
        // de 12px **não** está no CSS: é o que fecha os 59px com 6+6 de respiro.
        // O vermelho da print (`#a83035`–`#b63439`) sai de `--status-danger`
        // sobre a transmissão escura. No tile compacto a margem cai para 4,
        // como o `.overlayContainer__2f4f7.compact__2f4f7{margin:4px}`.
        <span
          className={`pointer-events-none absolute flex h-[16px] items-center rounded-full bg-status-danger px-[6px] text-[12px] font-bold uppercase leading-[16px] text-control-critical-primary-text-default ${
            compacto ? "right-1 top-1" : "right-2 top-2"
          }`}
        >
          Ao vivo
        </span>
      )}

      {/* Celular: não há hover (a fileira de ações logo abaixo nunca desenha
          lá — `semAcoes`), e o toque longo abre o menu de participante, que
          agora também lista "Parar de assistir" mas é um caminho escondido
          demais para a única saída de uma tela que ocupa a tela inteira. Sem
          este botão, quem tocasse "Assistir transmissão" no destaque ficava
          preso nela até trocar de foco ou sair da chamada — não há print do
          Discord com este botão no celular (a bancada não tem essa captura),
          então a posição (abaixo do selo "Ao vivo", mesma borda direita) é
          nossa, não medição. Só no tile grande: a miniatura da faixa se
          resolve levando-a ao destaque primeiro (toque na faixa). */}
      {semAcoes && grande && podeParar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPararDeAssistir(state.user.id);
          }}
          aria-label={`Parar de assistir a ${nome}`}
          style={{ height: ALVO_MINIMO, width: ALVO_MINIMO, top: 36 }}
          className="absolute right-2 grid place-items-center rounded-full bg-control-overlay-secondary-background-default text-control-overlay-secondary-icon-default backdrop-blur transition hover:bg-control-overlay-secondary-background-hover active:bg-control-overlay-secondary-background-active"
        >
          <MonitorX size={20} />
        </button>
      )}

      {/* O rótulo de nome — que é também onde o mudo mora.
          O Discord não desenha selo circular de microfone no avatar do tile: o
          próprio rótulo vira o aviso, com o glifo cortado ANTES do nome.

          Medidas, print `2026-08-31 101857` (1:1) e CSS
          `.overlayTitle__2f4f7` (`sob-demanda/655282.7b25cb505483f3c7.css`):
          - fundo `--control-overlay-secondary-background-default` (preto a
            52%): sobre o tile `#272324` dá exatamente o `#131111` da print
            (linha y=653, x=395–452);
          - **32px** de altura (coluna x=430, y=638–669) = `padding:6px` + linha
            de 20; a **12px** da borda esquerda (395 − 383) e da de baixo
            (681 − 669), que é o `.overlayContainer__2f4f7{margin:12px}`; 4 no
            compacto (`.compact{margin:4px}`);
          - raio `--custom-base-tile-border-radius` = **8**;
          - sem glifo, `padding-inline:12px`; com glifo, o glifo começa a **8**
            da borda (x=403) e o nome a 6 dele (x=423), e a direita continua 12
            (`.videoDisabledTitle__2f4f7{padding-inline:0 12px}`); o glifo mora
            numa caixa de **16** (`.titleIcon__2f4f7{height:16px;width:16px}`);
          - texto e glifo `--control-overlay-secondary-text-default` (branco:
            pixel x=406, y=653 `#ffffff`).

          **Sempre visível.** Nas prints `2026-09-03 203909` (tile sem vídeo e
          sem mudo: "Puff Daddy") e `2026-08-31 123917` (tile "Md" sem vídeo e
          sem mudo) o rótulo está lá em repouso; o que o esconde no Discord é
          `.overlayTitle__2f4f7.idle{opacity:0}` — o ponteiro parado, que no
          palco já é a moldura inteira que some. */}
      <span
        className={`pointer-events-none absolute flex items-center rounded-lg bg-control-overlay-secondary-background-default text-control-overlay-secondary-text-default transition-opacity ${
          // o ramo de 20px é o do celular (`PalcoMobile`), medido lá
          rotuloPequeno
            ? "h-[20px] gap-1.5 px-[6px] text-[11px]"
            : `h-8 gap-1.5 pr-3 text-sm ${
                tela || state.muted || state.deafened || state.serverMute || state.serverDeaf ? "pl-2" : "pl-3"
              }`
        } ${
          compacto ? "bottom-1 left-1 max-w-[calc(100%-8px)]" : "bottom-3 left-3 max-w-[calc(100%-24px)]"
        } ${
          // câmera e tela nunca esmaecem — só o rótulo do avatar parado
          ausente && !video && !tela ? "opacity-60" : ""
        }`}
      >
        {/* surdo implica mudo: mostrar os dois glifos contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto.
            Branco, e não vermelho: é o que a print 101857 mostra — para o
            mudo por conta própria. O mudo/ensurdecido **pelo servidor**
            (`serverMute`/`serverDeaf`) é vermelho (`status-danger`), como o
            selo do avatar em `AvatarDeChamada`, e manda sobre o próprio: quem
            foi silenciado por um moderador mostra o glifo vermelho mesmo que
            também tenha se mutado sozinho. Na tela compartilhada o glifo é o
            monitor (print 123917, tile "Md" com a transmissão), porque o que
            o rótulo anuncia ali é a tela, não a voz. */}
        {tela ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center">
            <Monitor size={16} role="img" aria-label="Tela compartilhada" />
          </span>
        ) : (
          (state.serverDeaf || state.serverMute || state.deafened || state.muted) && (
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center ${
                state.serverDeaf || state.serverMute ? "text-status-danger" : ""
              }`}
            >
              {state.serverDeaf ? (
                <HeadphoneOff size={16} role="img" aria-label="Áudio desativado pelo servidor" />
              ) : state.serverMute ? (
                <MicOff size={16} role="img" aria-label="Silenciado pelo servidor" />
              ) : state.deafened ? (
                <HeadphoneOff size={16} role="img" aria-label="Sem áudio" />
              ) : (
                <MicOff size={16} role="img" aria-label="Mudo" />
              )}
            </span>
          )
        )}
        <span className="truncate">
          {nome}
          {sou && !tela && " (você)"}
        </span>
        {/* ── j-bots ── depois do nome, dentro do mesmo rótulo: um bot de música
            no palco é um tile como os outros, e sem a pílula ele se passaria por
            gente.
            `caixaEstreita` no rótulo comprimido (`rotuloPequeno`, que só o
            `PalcoMobile` liga). **Medido** no palco de 390×844, com os dois
            valores fotografados lado a lado:
            - sem ela, a pílula de 18 dentro do rótulo de 20 deixa **1px** de
              rótulo acima e abaixo — não estoura a borda, mas os cantos
              arredondados dos dois encostam e a pílula lê como um adesivo
              colado na beirada, e não como um selo dentro de um rótulo;
            - com ela, a pílula fica nos 15 do desktop e sobram **2,5px** de
              cada lado, que é a mesma folga que o rótulo de 32 (`h-8`) dá.
            Onde a caixa não cresce, a pílula também não cresce. */}
        {state.user.bot && <TagDeBot caixaEstreita={rotuloPequeno} />}
      </span>

      {/* Sem fileira de botões no hover — nem no card de pessoa, nem no de
          tela. Paridade com o Discord (prints `2.png`/`3.png`): o tile de
          pessoa não tem NENHUM botão no topo, só o menu de botão direito —
          igual ao card de tela, que já não desenhava fileira nenhuma (o selo
          "AO VIVO" é o único elemento fixo dele).

          As funções não sumiram, mudaram de lugar:
          - clique simples foca a pessoa no palco, duplo clique alterna tela
            cheia (os mesmos gestos de sempre, ver `ESPERA_DO_DUPLO_CLIQUE`);
          - volume, silenciar, colocar/tirar do palco, tela cheia e mais
            opções migraram para o menu de contexto (`onContextMenu` acima),
            que agora é o único caminho de ação do card de pessoa. */}
    </div>
  );
}

/**
 * O tile de quem tem a câmera ou a tela numa **janela solta**
 * (`useJanelasDeVoz` — "Usuário em Nova Janela" / "Transmissão em Nova
 * Janela" do menu de contexto).
 *
 * Nada de vídeo aqui: `VoiceTile` já zera `video` quando `emJanela` (ver o
 * comentário de lá) para não colar a mesma faixa duas vezes — a janela solta
 * decodifica o quadro dela sozinha (`JanelasDeVoz.tsx`). No lugar, o mesmo
 * papel do "Você está compartilhando sua tela" ao lado: ícone discreto,
 * aviso, e o único caminho de volta.
 *
 * O clique na área inteira foca a janela (é a mesma pessoa que clicaria no
 * tile para focar no palco, só que agora o conteúdo está lá, não aqui); o
 * botão para o clique nele mesmo e fecha a janela em vez de focar — voltar a
 * transmissão para o palco, e não trazer a janela para a frente.
 */
function PlaceholderJanelaAberta({
  chave,
  nome,
  compacto,
}: {
  chave: string;
  nome: string;
  compacto: boolean;
}) {
  return (
    <div
      data-placeholder-janela=""
      role="button"
      tabIndex={0}
      aria-label={`Focar a janela de ${nome}`}
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 px-3 text-center"
      onClick={(e) => {
        e.stopPropagation();
        useJanelasDeVoz.getState().focar(chave);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        useJanelasDeVoz.getState().focar(chave);
      }}
    >
      <ExternalLink size={20} className="text-text-overlay-light/70" aria-hidden="true" />
      {!compacto && (
        <span className="text-sm font-semibold text-text-overlay-light">
          Aberto em outra janela
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          useJanelasDeVoz.getState().fechar(chave);
        }}
        className={`flex items-center rounded-full bg-control-overlay-secondary-background-default font-semibold text-control-overlay-secondary-text-default shadow-popout transition hover:bg-control-overlay-secondary-background-hover ${
          compacto ? "h-6 px-2 text-[10px]" : "h-8 px-3 text-[13px]"
        }`}
      >
        Voltar para cá
      </button>
    </div>
  );
}

/** Botão da barra de ações que aparece no hover do tile. */
function AcaoDoTile({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      {/* migração 0.8: fica `<button>` — `BotaoDeIcone` não tem tamanho 28
          (só 24/32/40) nem fundo permanente (`comFundo` só pinta no
          hover/active); aqui o fundo escuro é o **repouso**, para o ícone se
          ler sobre o vídeo mesmo sem hover. Cor pelo par que o próprio
          contrato já usa para "botão redondo flutuando sobre vídeo"
          (`TelaCheiaDeVideo`, `ImageModal`): `control-overlay-secondary`. */}
      <button
        type="button"
        onClick={(e) => {
          // o tile inteiro é clicável (põe no palco): sem isto, silenciar
          // alguém também trocaria o foco
          e.stopPropagation();
          onClick(e);
        }}
        aria-label={label}
        className="grid h-7 w-7 place-items-center rounded bg-control-overlay-secondary-background-default text-control-overlay-secondary-icon-default transition hover:bg-control-overlay-secondary-background-hover"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * `<video>` colado numa faixa do SDK; solta a faixa ao trocar/desmontar.
 *
 * Exportado porque a miniatura ao vivo do hover (`PreviaDeTela`) e a tela cheia
 * do celular (`TelaCheiaDeVideo`) desenham a mesma faixa noutro lugar da tela,
 * e duplicar o `attach`/`detach` é a receita de deixar faixa pendurada quando o
 * pop-up fecha.
 */
export function VideoDaFaixa({
  publication,
  espelhar = false,
  ajuste = "object-contain",
}: {
  publication: TrackPublication;
  espelhar?: boolean;
  /** `object-cover` na miniatura, que é pequena demais para letterbox. */
  ajuste?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const track = publication.track;

  useEffect(() => {
    const el = ref.current;
    if (el && track) track.attach(el);
    return () => {
      if (el && track) track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black ${ajuste} ${espelhar ? "-scale-x-100" : ""}`}
    />
  );
}
