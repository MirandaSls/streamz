"use client";

import { HeadphoneOff, MicOff, Users } from "@/components/ui/icones";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import type { UserStatus } from "@streamz/shared";
import Marca from "@/components/ui/Marca";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePresence } from "@/stores/presence";

/**
 * Como o Discord chama cada estado. "Disponível" e "Não perturbar" são as
 * palavras do print `2026-09-03 180020` (lista de membros e seletor de status);
 * OFFLINE fica "Offline" porque é o que se vê **dos outros** — "Invisível" é só
 * o nome da minha própria escolha, e mora no cartão do usuário.
 */
export const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: "Disponível",
  IDLE: "Ausente",
  DND: "Não perturbar",
  OFFLINE: "Offline",
};

const hashColor = corDoAvatar;

/**
 * Máscara que fura a foto embaixo do selo de status: o quadrado do avatar
 * menos o círculo do selo com o anel (`fill-rule` evenodd), em SVG para o
 * contorno sair antisserrilhado em qualquer densidade de tela. É como o
 * Discord faz (`<mask>` com um círculo preto em 0,84375 × o lado): o anel e os
 * recortes do `IconeDeStatus` mostram **o que está atrás** do avatar, seja a
 * lista em repouso, a linha com hover ou a linha selecionada.
 *
 * Pintar o anel com a cor da superfície, como antes, só acerta superfície
 * opaca. As da linha com hover e selecionada são translúcidas (`#94949c1f`,
 * `#9696a033`): na linha selecionada o anel (fundo + borda do selo, duas
 * camadas a ~20%) deixava a foto aparecer por baixo e saía claro, (138,138,148)
 * contra (78,78,85) da linha no print do app; no hover o anel ficava no
 * `base-lowest` da lista, mais escuro que a linha acesa.
 */
function mascaraDoSelo(lado: number, { centro, raio }: { centro: number; raio: number }) {
  const d = `M0 0H${lado}V${lado}H0Z M${centro + raio} ${centro}A${raio} ${raio} 0 1 0 ${centro - raio} ${centro}A${raio} ${raio} 0 1 0 ${centro + raio} ${centro}Z`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${lado} ${lado}'><path fill-rule='evenodd' d='${d}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  } as const;
}

/**
 * Selo de status por tamanho de avatar. O Discord põe o **centro** do selo em
 * 0,84375 × o lado do avatar e faz o disco crescer mais devagar que a foto —
 * medido no print `2026-09-03 161607`: avatar de 32 com disco de 10 e anel de
 * 3 (centro em 27, isto é, 3px para fora da borda), avatar de 80 com disco de
 * 16 e anel de 6 (centro em 67,5). Os outros tamanhos interpolam essa curva e
 * **não foram medidos**: não há avatar de 16, 24, 40 nem 120 com selo no print.
 *
 * `dot` é a caixa inteira (disco + anel), e o `border-N` come o anel; o
 * deslocamento negativo é o quanto a caixa passa da borda do avatar, arredondado
 * ao pixel (erro máximo de meio pixel contra o centro alvo).
 *
 * `corte` é o furo que essa mesma caixa abre na foto (`mascaraDoSelo`), em px
 * a partir do canto de cima à esquerda: `raio` = metade da caixa, `centro` =
 * `lado` − metade da caixa + deslocamento. Mudou o `dot`, refaça a conta — o
 * Tailwind só enxerga classe literal, então os dois não saem um do outro.
 *
 * `glifo` é o lado do símbolo da marca (`Marca`, ver abaixo) desenhado sobre a
 * cor de hash quando não há foto — 60% do diâmetro do avatar, como o Discord
 * faz com o logo dele sobre a cor do usuário (arredondado ao pixel).
 */
const SIZE = {
  /** 16px: reply preview, listas compactas, participantes de thread. */
  xs: {
    box: "h-4 w-4 text-[8px]",
    dot: "h-2.5 w-2.5 -bottom-[2px] -right-[2px] border-2",
    lado: 16,
    corte: { centro: 13, raio: 5 },
    icone: 6,
    glifo: 10,
  },
  sm: {
    box: "h-6 w-6 text-[10px]",
    dot: "h-3 w-3 -bottom-[2px] -right-[2px] border-2",
    lado: 24,
    corte: { centro: 20, raio: 6 },
    icone: 8,
    glifo: 14,
  },
  /** O medido: furo de raio 8 centrado em (27, 27), o `r=.25` em `.84375` do Discord. */
  md: {
    box: "h-8 w-8 text-xs",
    dot: "h-4 w-4 -bottom-[3px] -right-[3px] border-[3px]",
    lado: 32,
    corte: { centro: 27, raio: 8 },
    icone: 9,
    glifo: 19,
  },
  lg: {
    box: "h-10 w-10 text-sm",
    dot: "h-[18px] w-[18px] -bottom-[3px] -right-[3px] border-[3px]",
    lado: 40,
    corte: { centro: 34, raio: 9 },
    icone: 10,
    glifo: 24,
  },
  /**
   * 48px: degrau que faltava entre `lg` (40) e `xl` (80) — cartão de
   * configurações (`SettingsModal`, outro cartão). **Não medido**: não há
   * avatar de 48 com selo em nenhum print de referência; interpolado pela
   * curva do comentário acima (centro em 0,84375 × 48 = 40,5 — com disco de
   * 20 e anel de 3, o deslocamento que fecha essa conta é 10 − (48 − 40,5) =
   * 2,5, arredondado para 3px).
   */
  lg48: {
    box: "h-12 w-12 text-base",
    dot: "h-[20px] w-[20px] -bottom-[3px] -right-[3px] border-[3px]",
    lado: 48,
    corte: { centro: 41, raio: 10 },
    icone: 11,
    glifo: 29,
  },
  xl: {
    box: "h-20 w-20 text-2xl",
    dot: "h-7 w-7 -bottom-[2px] -right-[2px] border-[6px]",
    lado: 80,
    corte: { centro: 68, raio: 14 },
    icone: 14,
    glifo: 48,
  },
  /** 120px: cartão de perfil completo e tela de chamada. */
  xxl: {
    box: "h-[120px] w-[120px] text-4xl",
    dot: "h-10 w-10 -bottom-px -right-px border-[8px]",
    lado: 120,
    corte: { centro: 101, raio: 20 },
    icone: 20,
    glifo: 72,
  },
} as const;

/** Estado de voz que o avatar mostra no lugar da bolinha de status. */
export type VozNoAvatar = "mudo" | "surdo" | "mudo-servidor" | "surdo-servidor";

/**
 * Ícone, rótulo e cor do selo por estado — `Record` sobre `VozNoAvatar` para o
 * TypeScript acusar se um estado novo ficar sem entrada aqui.
 *
 * O ícone é o mesmo do par (mic/headphone) tanto no silêncio próprio quanto no
 * imposto pelo servidor; a cor do disco é sempre `--status-danger` — o mesmo
 * vermelho que `VoiceChannelMembers.tsx` e `TileDeVoz.tsx` já usam para o
 * glifo de mudo/surdo imposto por um moderador. A diferença entre "eu me
 * mutei" e "o servidor me mutou" está no contexto (o `aria-label` já separa
 * os dois: "Mudo" vs. "Mudo pelo servidor"), não no tom do vermelho — dois
 * vermelhos aqui só fariam a pessoa procurar uma distinção visual que o resto
 * da voz não tem.
 */
const VOZ_NO_AVATAR: Record<VozNoAvatar, { rotulo: string; Icone: typeof MicOff; bg: string }> = {
  mudo: { rotulo: "Mudo", Icone: MicOff, bg: "bg-status-danger" },
  surdo: { rotulo: "Sem áudio", Icone: HeadphoneOff, bg: "bg-status-danger" },
  "mudo-servidor": { rotulo: "Mudo pelo servidor", Icone: MicOff, bg: "bg-status-danger" },
  "surdo-servidor": {
    rotulo: "Sem áudio pelo servidor",
    Icone: HeadphoneOff,
    bg: "bg-status-danger",
  },
};

/**
 * `<img>` que pode ficar parada. Navegador não pausa GIF, então, com
 * `animar=false`, o primeiro quadro é copiado para um canvas e é ele que se vê.
 * Se a imagem não puder ser lida (CORS, formato), cai na `<img>` normal: GIF
 * rodando é melhor que avatar quebrado.
 *
 * Congelar não basta: esconder a `<img>` não pára o GIF, ele segue rodando no
 * timeline e, ao voltar a falar, continuaria de onde estaria (no meio). Por isso,
 * com o canvas pronto, a `<img>` é **desmontada**; e ao voltar a animar ela é
 * remontada com um `blob:` novo da mesma imagem — URL nova = animação nova, que
 * recomeça do quadro 1. Enquanto o blob não chega o canvas continua à vista, para
 * não piscar um quadro do meio da animação.
 *
 * Só reinicia quem já congelou (`congelada`): foto que sempre animou nunca faz
 * fetch extra. O blob só é usado se o tipo for de imagem que pode animar
 * (gif/webp/png); qualquer outra coisa, ou falha de rede/CORS, usa o `src` normal.
 */
function FotoDoAvatar({
  src,
  animar,
  className,
  style,
}: {
  src: string;
  animar: boolean;
  className: string;
  style?: CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [congelada, setCongelada] = useState(false);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [blobFalhou, setBlobFalhou] = useState(false);
  // de qual `src` o canvas guarda o primeiro quadro: ele fica montado (escondido)
  // entre as alternâncias, então não precisa redesenhar a cada vez que congela
  const desenhadoPara = useRef<string | null>(null);

  // foto nova: tudo que era da antiga (quadro, blob) deixa de valer
  useEffect(() => {
    setCongelada(false);
    setBlobSrc(null);
    setBlobFalhou(false);
    desenhadoPara.current = null;
  }, [src]);

  useEffect(() => {
    if (animar) return;
    // parou de falar: o blob da rodada anterior não serve, o próximo começa do zero
    setBlobSrc(null);
    setBlobFalhou(false);
    if (desenhadoPara.current === src) {
      setCongelada(true);
      return;
    }
    let vivo = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvas.current;
      if (!vivo || !c) return;
      try {
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        // canvas "sujo" (sem CORS) lança aqui, não no desenho
        c.getContext("2d")?.getImageData(0, 0, 1, 1);
        desenhadoPara.current = src;
        setCongelada(true);
      } catch {
        /* mantém a <img> */
      }
    };
    img.src = src;
    return () => {
      vivo = false;
    };
  }, [src, animar]);

  // voltou a animar depois de congelar: baixa a imagem e a serve por blob: novo
  useEffect(() => {
    if (!animar || !congelada) return;
    let vivo = true;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch"))))
      .then((blob) => {
        if (!vivo) return;
        if (!/^image\/(gif|webp|png|apng)/.test(blob.type)) {
          setBlobFalhou(true);
          return;
        }
        setBlobSrc(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (vivo) setBlobFalhou(true);
      });
    return () => {
      vivo = false;
    };
  }, [src, animar, congelada]);

  // revoga o blob quando ele é trocado ou o componente sai
  useEffect(() => {
    if (!blobSrc) return;
    return () => URL.revokeObjectURL(blobSrc);
  }, [blobSrc]);

  const esperandoBlob = animar && congelada && !blobSrc && !blobFalhou;
  const canvasVisivel = congelada && (!animar || esperandoBlob);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" style={style} className={canvasVisivel ? className : "hidden"} />
      {/* desmontada (não só escondida) com o canvas à vista: senão o GIF segue rodando por baixo */}
      {!canvasVisivel && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={animar && blobSrc ? blobSrc : "original"} src={animar && blobSrc ? blobSrc : src} alt="" style={style} className={className} />
      )}
    </>
  );
}

/**
 * Avatar circular com a foto do usuário — ou, quando não há foto, o símbolo do
 * Streamz branco sobre a mesma cor de hash que antes ficava atrás das
 * iniciais — e, opcionalmente, a bolinha de status num furo da foto, como no
 * Discord (ver `mascaraDoSelo`).
 *
 * O símbolo (não as iniciais) é o que o Discord faz com o próprio logo sobre a
 * cor do usuário sem foto: aqui é o mesmo `Marca` do rail/home, branco,
 * ocupando ~60% do diâmetro (`SIZE[x].glifo`) — nunca as iniciais, que ficaram
 * só para ícone de SERVIDOR sem imagem (`WelcomeModal`, `InviteEmbed`,
 * mini-avatares de "servidores em comum" etc.), que continua igual ao
 * Discord.
 *
 * **A foto é resolvida aqui pelo overlay ao vivo de `usePresence`**, e não pelo
 * `user` que o chamador passou. Quase todo `user` na tela é um retrato: o autor
 * gravado na mensagem, o membro carregado ao abrir o servidor, o participante
 * capturado quando entrou na chamada. Quem troca a foto emite `user.updated`,
 * mas esses retratos não se reescrevem sozinhos — e sem isto a foto nova só
 * aparecia depois de um F5 (ou de sair da chamada e voltar).
 *
 * Fazer a resolução no componente, e não em cada chamador, é o que garante que
 * nenhuma tela fique de fora: são mais de trinta pontos que desenham avatar.
 */
export default function Avatar({
  user,
  size = "md",
  status,
  voz,
  surface = "border-background-base-lowest",
  animar = true,
  fotoForcada,
  className = "",
}: {
  user: { id: string; username: string; avatarUrl?: string | null };
  size?: keyof typeof SIZE;
  status?: UserStatus;
  /**
   * Microfone ou áudio desligados, desenhados como selo vermelho no mesmo
   * canto da bolinha — e **no lugar dela**, nunca junto. É como o Discord
   * mostra o mudo no palco de chamada, onde não há pílula de nome para
   * hospedar o ícone; nas listas, onde a pílula existe, o ícone continua lá
   * (ver `VoiceChannelMembers`).
   *
   * Duas bolinhas no mesmo canto se sobreporiam, e a pergunta que a pessoa faz
   * olhando uma chamada é "esta pessoa está me ouvindo?", não "ela está
   * online?" — quem está na chamada já está online.
   */
  voz?: VozNoAvatar | null;
  /**
   * Classe de cor da borda do selo de **voz** = cor do fundo onde o avatar
   * está. O selo de status não a usa mais: ele fura a foto, e o anel mostra o
   * fundo real mesmo quando ele é translúcido (hover, linha selecionada).
   */
  surface?: string;
  /**
   * `false` congela foto animada (GIF) no primeiro quadro. O palco de chamada
   * usa isso: como no Discord, o GIF só roda enquanto a pessoa fala.
   */
  animar?: boolean;
  /**
   * Foto a desenhar no lugar da do perfil ao vivo — para a prévia de uma foto
   * ainda não salva. `undefined` = comportamento normal; `string` ou `null`
   * (prévia de "remover foto") vence `usePresence`, que ignoraria a prévia.
   */
  fotoForcada?: string | null;
  className?: string;
}) {
  const s = SIZE[size];
  // só o perfil deste usuário: o seletor devolve a mesma referência enquanto
  // ninguém troca a foto dele, então uma timeline com 100 avatares não
  // re-renderiza porque um estranho mudou a dele
  const vivo = usePresence((estado) => estado.profiles[user.id]);
  // o perfil ao vivo substitui o retrato INTEIRO, não campo a campo: quem
  // removeu a foto tem `avatarUrl: null`, e um `??` aqui leria isso como
  // "não sei" e restauraria a foto que acabou de ser apagada
  const avatarUrl = fotoForcada !== undefined ? fotoForcada : (vivo ?? user).avatarUrl;
  // só o selo de status fura a foto; o de voz continua pintando o anel com a
  // `surface` (ver `voz`), e sem selo nenhum a foto fica inteira
  const furo = status && !voz ? mascaraDoSelo(s.lado, s.corte) : undefined;

  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      {avatarUrl ? (
        <FotoDoAvatar
          src={avatarUrl}
          animar={animar}
          style={furo}
          className={`${s.box} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: hashColor(user.id), ...furo }}
          // fundo é uma cor arbitrária do hash (nunca sabemos se é clara ou
          // escura); o glifo é sempre branco por cima — mesmo caso do texto
          // sobre imagem/vídeo, por isso o token de overlay (branco
          // garantido), não `text-white` cru; ver `CardDeApp.tsx`, que usa o
          // mesmo padrão (lá com as iniciais do app, não deste componente).
          className={`${s.box} grid place-items-center rounded-full text-text-overlay-light`}
        >
          <Marca size={s.glifo} className="shrink-0" />
        </span>
      )}
      {voz ? (
        // surdo implica mudo: um selo só, e o de baixo é o que informa mais.
        // Cor do disco vem de `VOZ_NO_AVATAR`, `status-danger` nos quatro
        // estados; o ícone continua branco por cima — mesmo raciocínio do
        // papel "overlay": é ícone sobre mancha de cor saturada, não texto de
        // botão.
        <span
          role="img"
          aria-label={VOZ_NO_AVATAR[voz].rotulo}
          className={`absolute grid place-items-center rounded-full ${VOZ_NO_AVATAR[voz].bg} text-icon-overlay-light ${surface} ${s.dot}`}
        >
          {(() => {
            const Icone = VOZ_NO_AVATAR[voz].Icone;
            return <Icone size={s.icone} />;
          })()}
        </span>
      ) : (
        status && (
          // a caixa é a mesma de sempre, mas a borda (o anel) é transparente:
          // o recorte já está na foto (`furo`), e o que aparece no anel é o
          // fundo de verdade
          <span
            role="img"
            aria-label={STATUS_LABEL[status]}
            className={`absolute rounded-full border-transparent ${s.dot}`}
          >
            <IconeDeStatus status={status} className="h-full w-full" />
          </span>
        )
      )}
    </span>
  );
}

// ── d-social ──

const GROUP_SIZE = {
  xs: "h-4 w-4",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-20 w-20",
  xxl: "h-[120px] w-[120px]",
} as const;

const GROUP_ICON = { xs: 10, sm: 14, md: 18, lg: 22, xl: 36, xxl: 56 } as const;

/**
 * Lado do símbolo da marca na célula do mosaico, em px: ~60% da célula, que
 * tem ~58% do lado do avatar (ver `CaraDoGrupo` em `GroupAvatar`), ou seja
 * ~35% do lado, arredondado ao pixel. Valores fixos porque `Marca` recebe
 * `size` numérico, não porcentagem.
 */
const GROUP_GLIFO = { xs: 6, sm: 8, md: 11, lg: 14, xl: 28, xxl: 42 } as const;

type MembroDoGrupo = { id: string; username: string; avatarUrl?: string | null };

/** FNV-1a de 32 bits: simples, estável entre execuções e sem dependência. */
function hashFnv(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * As (no máximo) 2 caras do ícone padrão de um grupo. Pseudo-aleatório porém
 * estável: ordena por hash de `${seed}:${id}`, então a escolha não depende da
 * ordem em que os membros chegam e não muda entre renders nem recargas.
 */
export function escolherCarasDoGrupo<T extends { id: string }>(seed: string, members: T[]): T[] {
  return members
    .map((m) => ({ m, h: hashFnv(`${seed}:${m.id}`) }))
    .sort((x, y) => x.h - y.h || (x.m.id < y.m.id ? -1 : x.m.id > y.m.id ? 1 : 0))
    .slice(0, 2)
    .map((x) => x.m);
}

function CaraDoGrupo({
  m,
  className,
  glifo,
}: {
  m: MembroDoGrupo;
  className: string;
  glifo: number;
}) {
  const base = `absolute rounded-full object-cover ring-2 ring-background-surface-high ${className}`;
  return m.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.avatarUrl} alt="" className={base} />
  ) : (
    // Sem foto: mesma receita do `Avatar` normal (cor de hash + `Marca` branca
    // centralizada). Só a cor deixava a célula anônima e sumia o símbolo.
    <span
      style={{ backgroundColor: hashColor(m.id) }}
      className={`${base} grid place-items-center text-text-overlay-light`}
    >
      <Marca size={glifo} className="shrink-0" />
    </span>
  );
}

/**
 * Avatar de um grupo de DM: o ícone enviado, as caras dos participantes ou —
 * sem ninguém — o círculo com as silhuetas. Sem ícone, o Discord mostra no
 * máximo 2 avatares dos OUTROS participantes (o usuário atual nunca aparece;
 * `members` já vem sem ele), sobrepostos na diagonal, e a escolha é estável por
 * conversa (`seed`) para o ícone não "piscar" entre renders.
 */
export function GroupAvatar({
  iconUrl,
  members = [],
  seed = "",
  size = "md",
  className = "",
}: {
  iconUrl: string | null;
  /** outros participantes (sem o usuário atual) para as caras quando não há ícone. */
  members?: MembroDoGrupo[];
  /** id da conversa: fixa quais caras aparecem. */
  seed?: string;
  size?: keyof typeof GROUP_SIZE;
  className?: string;
}) {
  const box = GROUP_SIZE[size];
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className={`${box} shrink-0 rounded-full object-cover ${className}`} />
    );
  }
  if (members.length >= 1) {
    const caras = escolherCarasDoGrupo(seed, members);
    return (
      <span
        aria-hidden="true"
        className={`${box} relative block shrink-0 overflow-hidden rounded-full bg-background-surface-high ${className}`}
      >
        {caras.length === 1 ? (
          <CaraDoGrupo m={caras[0]} className="left-[18%] top-[18%] h-[64%] w-[64%]" glifo={GROUP_GLIFO[size]} />
        ) : (
          <>
            <CaraDoGrupo m={caras[0]} className="left-[4%] top-[4%] h-[58%] w-[58%]" glifo={GROUP_GLIFO[size]} />
            <CaraDoGrupo m={caras[1]} className="bottom-[4%] right-[4%] h-[58%] w-[58%]" glifo={GROUP_GLIFO[size]} />
          </>
        )}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} grid shrink-0 place-items-center rounded-full bg-brand-500 text-control-primary-text-default ${className}`}
    >
      <Users size={GROUP_ICON[size]} />
    </span>
  );
}
