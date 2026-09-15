"use client";

import { useEffect, useRef } from "react";
import {
  Apps,
  HeadphoneOff,
  Maximize,
  Maximize2,
  MicOff,
  Minimize2,
  Monitor,
  MonitorX,
  MoreHorizontal,
  Play,
  UserPlus,
  Volume2,
  VolumeX,
} from "@/components/ui/icones";
import type { TrackPublication } from "livekit-client";
import { displayNameOf, type VoiceStateEvent } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import Tooltip from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/primitivos";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { alternarTelaCheiaDe } from "@/components/voice/fullscreen";
import { abrirMenuDeParticipante, abrirVolumeDe } from "@/components/voice/participant-menu";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { useCorDominante } from "@/lib/cor-dominante";
import { usePresence } from "@/stores/presence";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

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

/** Uma vaga do palco, do ponto de vista de quem desenha. */
export interface Tile {
  key: string;
  state: VoiceStateEvent;
  publication: TrackPublication | null;
  tela: boolean;
  /** só para tela: a faixa está assinada porque eu escolhi assistir (ou é minha). */
  assistindo: boolean;
  /** id do dono — o que casa um `focado` guardado como pessoa. */
  userId: string;
  /** há faixa **viva** para desenhar (é o que decide a tela cheia no celular). */
  comVideo: boolean;
}

/** As ações que todo tile precisa, iguais nos dois palcos. */
export interface AcoesDoTile {
  meId?: string;
  falando: ReadonlySet<string>;
  channelId: string;
  onFocar: (chave: string | null) => void;
  onAssistir: (userId: string, chave: string) => void;
  onPararDeAssistir: (userId: string) => void;
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

  return (
    <Tooltip label={nome}>
      <span
        data-voice-avatar={state.user.id}
        aria-label={nome}
        onContextMenu={(e) => {
          e.preventDefault();
          abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId });
        }}
        className={`relative inline-grid rounded-full transition ${
          state.reconnecting ? "opacity-50" : ""
        }`}
      >
        <Avatar
          user={state.user}
          size="xl"
          // o palco de avatares só existe no `CallStage`, que é `--black`: o
          // recorte do selo de mudo/surdo tem de ser da mesma cor do palco
          surface="border-black"
          voz={state.deafened ? "surdo" : state.muted ? "mudo" : null}
          className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""}`}
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
  const caixa = useRef<HTMLDivElement>(null);
  const silenciado = useVoice((s) => !!s.silenciados[state.user.id]);
  const toggleSilenciado = useVoice((s) => s.toggleSilenciado);
  // quem está mudo nunca "fala": o anel verde tem de contar a mesma história.
  // A conta é só esta — `participant.isSpeaking` saiu de cena: era uma segunda
  // fonte, lida no render em vez de reagir a evento, e é dela que vinham as
  // duas divergências (palco aceso e lista apagada; palco piscando).
  const ativo = !state.muted && falando.has(state.user.id);
  const nome = displayNameOf(state.user);
  // a foto ao vivo, pelo mesmo caminho do `Avatar`: quem troca a foto troca
  // também a cor do tile, sem F5
  const perfil = usePresence((e) => e.profiles[state.user.id]);
  const fundo = useCorDominante((perfil ?? state.user).avatarUrl, corDoAvatar(state.user.id));
  /** só mostra vídeo quando há faixa: tela fechada não tem o que desenhar. */
  const video = publication?.track ? publication : null;
  /** ver o comentário do componente: a cor dominante só pinta o tile quando
   *  há vídeo de verdade atrás dela; sem vídeo o tile fica no neutro do
   *  palco, senão ele se camufla com a cor da `Avatar` sem foto. */
  const usaFundoDaFoto = Boolean(video);

  return (
    <div
      ref={caixa}
      data-voice-tile={tile.key}
      // Um clique põe no palco, e o clique no que já está no palco volta para a
      // grade (`setFocado` alterna). Era duplo clique: ninguém adivinha isso, e
      // a print mostra o Discord trocando de foco com um toque só. Os botões de
      // dentro param a propagação — senão "silenciar" também mexeria no palco.
      onClick={() => onFocar(tile.key)}
      onContextMenu={(e) => {
        e.preventDefault();
        abrirMenuDeParticipante(e.clientX, e.clientY, state.user, { sou, channelId });
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
      {video ? (
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
          <span className="relative inline-grid rounded-full">
            <Avatar
              user={state.user}
              size="xl"
              surface="border-chat-background-default"
              className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""} ${
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
          Pílula de 32px de altura, e não a chapa que cobria o tile inteiro: o
          botão gigante escondia justamente o tile que ele anuncia (print nosso
          `2026-09-03 203457`). Não há print do Discord com este botão — os 32
          são a medida do resto da interface, não medição. */}
      {tela && !assistindo && (
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
            className={`flex h-8 items-center rounded-full bg-brand-500 font-semibold text-control-primary-text-default shadow-popout transition group-hover:brightness-110 ${
              compacto ? "w-8 justify-center" : "gap-2 px-3 text-[13px]"
            }`}
          >
            <Play size={14} aria-hidden="true" />
            {!compacto && "Assistir transmissão"}
          </span>
        </button>
      )}

      {/* "Ao vivo" é selo próprio no canto **superior direito**, não um pedaço
          do rótulo de nome. No Discord os dois convivem: o nome embaixo à
          esquerda, o aviso de transmissão em cima à direita. Dentro do rótulo
          ele competia com o nome pela mesma linha e sumia junto com ela. */}
      {tela && (
        // some no hover: as ações do tile moram neste mesmo canto, e as duas
        // coisas empilhadas viravam um borrão vermelho com botões por cima. O
        // selo diz "isto é uma transmissão", que é informação de relance — no
        // hover a pergunta já é outra.
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
          className={`pointer-events-none absolute flex h-[16px] items-center rounded-full bg-status-danger px-[6px] text-[12px] font-bold uppercase leading-[16px] text-control-critical-primary-text-default transition-opacity ${
            semAcoes ? "" : "group-hover:opacity-0 group-focus-within:opacity-0"
          } ${compacto ? "right-1 top-1" : "right-2 top-2"}`}
        >
          Ao vivo
        </span>
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
        className={`pointer-events-none absolute flex items-center rounded-lg bg-control-overlay-secondary-background-default text-control-overlay-secondary-text-default ${
          // o ramo de 20px é o do celular (`PalcoMobile`), medido lá
          rotuloPequeno
            ? "h-[20px] gap-1.5 px-[6px] text-[11px]"
            : `h-8 gap-1.5 pr-3 text-sm ${tela || state.muted || state.deafened ? "pl-2" : "pl-3"}`
        } ${
          compacto ? "bottom-1 left-1 max-w-[calc(100%-8px)]" : "bottom-3 left-3 max-w-[calc(100%-24px)]"
        }`}
      >
        {/* surdo implica mudo: mostrar os dois glifos contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto.
            Branco, e não vermelho: é o que a print 101857 mostra. Na tela
            compartilhada o glifo é o monitor (print 123917, tile "Md" com a
            transmissão), porque o que o rótulo anuncia ali é a tela, não a voz. */}
        {tela ? (
          <span className="grid h-4 w-4 shrink-0 place-items-center">
            <Monitor size={16} role="img" aria-label="Tela compartilhada" />
          </span>
        ) : (
          (state.deafened || state.muted) && (
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              {state.deafened ? (
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

      {/* Ações do hover, no canto superior direito. Numa tela **já assistida** o
          que falta não é "assistir", é sair dela: entra o botão de parar,
          pequeno, ao lado do "…" que a print mostra no tile da faixa. */}
      {!semAcoes && (
        <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          {tela
            ? assistindo &&
              !sou && (
                <AcaoDoTile
                  label={`Parar de assistir a ${nome}`}
                  onClick={() => onPararDeAssistir(state.user.id)}
                >
                  <MonitorX size={14} />
                </AcaoDoTile>
              )
            : !sou && (
                <>
                  <AcaoDoTile
                    label={`Volume de ${nome}`}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      abrirVolumeDe(r.left, r.bottom, state.user.id, nome);
                    }}
                  >
                    <Volume2 size={14} />
                  </AcaoDoTile>
                  <AcaoDoTile
                    label={silenciado ? `Reativar ${nome}` : `Silenciar ${nome}`}
                    onClick={() => toggleSilenciado(state.user.id)}
                  >
                    <VolumeX size={14} className={silenciado ? "text-status-danger" : undefined} />
                  </AcaoDoTile>
                </>
              )}
          <AcaoDoTile
            label={grande ? "Sair do palco" : "Colocar no palco"}
            onClick={() => onFocar(tile.key)}
          >
            {grande ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </AcaoDoTile>
          {!compacto && (
            <AcaoDoTile label="Tela cheia" onClick={() => void alternarTelaCheiaDe(caixa.current)}>
              <Maximize size={14} />
            </AcaoDoTile>
          )}
          <AcaoDoTile
            label={`Mais opções de ${nome}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              abrirMenuDeParticipante(r.left, r.bottom + 4, state.user, { sou, channelId });
            }}
          >
            <MoreHorizontal size={14} />
          </AcaoDoTile>
        </div>
      )}
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
