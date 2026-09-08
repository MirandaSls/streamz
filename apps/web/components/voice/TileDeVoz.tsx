"use client";

import { useEffect, useRef } from "react";
import {
  HeadphoneOff,
  Maximize,
  Maximize2,
  MicOff,
  Minimize2,
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
import Tooltip from "@/components/ui/Tooltip";
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
 * Sem "Escolher atividade" ao lado: atividade não existe no produto, e um botão
 * que abre um "em breve" é pior que a ausência dele.
 */
export function TileDeConvite({ guildId }: { guildId: string }) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-lg bg-input">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl"
      />
      <button
        type="button"
        onClick={() => ui.openModal({ kind: "invite", guildId })}
        className="relative flex h-9 items-center gap-2 rounded-[3px] bg-border-strong px-4 text-sm font-semibold text-txt-primary transition hover:bg-border-strong-hover"
      >
        <UserPlus size={16} aria-hidden="true" />
        Convidar para voz
      </button>
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
          surface="border-void"
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
 * mesmo pixel. Quem não tem foto fica na cor do avatar sem imagem, que já é
 * estável por id.
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
      // O tile **emerge** do palco na cor da pessoa (ver o comentário do
      // componente). Sem foto, `corDoAvatar` — e com vídeo o `<video>` cobre
      // tudo, então a cor só aparece nas bordas do `object-contain`.
      //
      // Moldura que não existe mais: nem a linha preta, nem a borda verde de
      // quem fala. No Discord o tile não tem borda em estado nenhum — o sinal
      // de fala mora no anel do avatar, que é onde o olho já está.
      style={{ backgroundColor: fundo, ...(raio === undefined ? {} : { borderRadius: raio }) }}
      className={`group relative h-full w-full overflow-hidden transition ${
        raio === undefined ? "rounded-lg" : ""
      }`}
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
        <span className="grid h-full w-full place-items-center px-3 text-center text-xs text-white/70">
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
              surface="border-input"
              className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""} ${
                compacto
                  ? "h-16 w-16 [&>img]:h-16 [&>img]:w-16 [&>span]:h-16 [&>span]:w-16 [&>span]:text-xl"
                  : ""
              }`}
            />
            {ativo && <AnelDeFala />}
          </span>
        </span>
      )}

      {/* Carência do servidor correndo: a pessoa ainda está na chamada, e some
          só se não voltar. Esmaecer em vez de remover é o que evita a grade
          piscar a cada oscilação de rede de alguém. */}
      {state.reconnecting && (
        <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-semibold text-white">
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
            className={`flex h-8 items-center rounded-full bg-accent font-semibold text-accent-ink shadow-high transition group-hover:brightness-110 ${
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
        // hover a pergunta já é outra
        <span
          className={`pointer-events-none absolute rounded-[4px] bg-red font-bold uppercase leading-none tracking-[0.02em] text-white transition-opacity ${
            semAcoes ? "" : "group-hover:opacity-0 group-focus-within:opacity-0"
          } ${compacto ? "right-1.5 top-1.5 px-1 py-0.5 text-[9px]" : "right-3 top-3 px-1.5 py-1 text-[10px]"}`}
        >
          Ao vivo
        </span>
      )}

      {/* O rótulo de nome — que é também onde o mudo mora.
          O Discord não desenha selo circular de microfone no avatar do tile: o
          próprio rótulo vira o aviso, com o glifo cortado ANTES do nome.
          Pílula de 32px de altura, a 12px da borda esquerda e da de baixo —
          medida nas duas prints: 101857 a 1:1 dá 32 e 12; 203909 dá 26px e
          8–9px de folga, que na escala de 0,8075 são os mesmos 32 e 12. Na
          faixa de miniaturas a folga cai para 4px, que é o que a print mostra.
          Ela só existe quando tem o que dizer: no tile sem mudo e sem vídeo o
          Discord não desenha rótulo nenhum. Volta quando há estado a informar —
          mudo, surdo, transmissão — e no hover, para quem quiser conferir o
          nome. Com vídeo ela fica sempre: aí o quadro é uma imagem em
          movimento, e o rosto de hoje não é o de ontem. */}
      <span
        className={`pointer-events-none absolute flex items-center gap-1.5 rounded-lg bg-black/50 text-white transition-opacity ${
          // 20px literal: `h-5` daria 19,4 com a raiz de 15,5. O ramo de 32
          // continua em `h-8` porque é o do **desktop**, e mexer nele moveria
          // um pixel numa tela que este trabalho não pode tocar.
          rotuloPequeno ? "h-[20px] px-[6px] text-[11px]" : "h-8 px-2 text-sm"
        } ${
          compacto ? "bottom-1 left-1 max-w-[calc(100%-8px)]" : "bottom-3 left-3 max-w-[calc(100%-24px)]"
        } ${
          video || tela || state.muted || state.deafened
            ? ""
            : semAcoes
              ? // no celular não há hover para revelar o nome: ou ele está na
                // tela, ou não existe caminho para lê-lo
                ""
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        {/* surdo implica mudo: mostrar os dois glifos contaria duas vezes a
            mesma coisa. "Silenciado por você" não entra — é estado meu, não
            dele, e vive no menu de contexto.
            Branco, e não vermelho: no Discord o alarme é a presença do glifo,
            não a cor dele — e o vermelho sobre preto a 50% é o que menos se lê
            de perto. */}
        {(state.deafened || state.muted) && !tela && (
          <span className="grid h-4 w-4 shrink-0 place-items-center">
            {state.deafened ? (
              <HeadphoneOff size={14} role="img" aria-label="Sem áudio" />
            ) : (
              <MicOff size={14} role="img" aria-label="Mudo" />
            )}
          </span>
        )}
        <span className="truncate">
          {nome}
          {sou && !tela && " (você)"}
        </span>
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
                    <VolumeX size={14} className={silenciado ? "text-red" : undefined} />
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
      <button
        type="button"
        onClick={(e) => {
          // o tile inteiro é clicável (põe no palco): sem isto, silenciar
          // alguém também trocaria o foco
          e.stopPropagation();
          onClick(e);
        }}
        aria-label={label}
        className="grid h-7 w-7 place-items-center rounded bg-black/60 text-white transition hover:bg-black/80"
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
