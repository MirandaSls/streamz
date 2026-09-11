"use client";

import { HeadphoneOff, MicOff, Users } from "@/components/ui/icones";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import type { UserStatus } from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";
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
 * Fundo do selo, na cor da superfície onde o avatar está. É o par do `surface`
 * (que é a **borda** do selo): sem ele, os recortes vazados do `IconeDeStatus`
 * — o traço do "não perturbe", o furo do anel, a barriga da lua — deixariam
 * aparecer a foto do avatar por dentro. No Discord aparece a superfície: o
 * avatar tem um furo, e o selo mora dentro dele.
 *
 * Medido no print `2026-09-03 161607`: entre a foto e o disco há 3px da cor da
 * lista (`(26,26,30)`), e o traço do selo vermelho do "Peixoto" é exatamente
 * essa mesma cor — não é branco nem uma versão escura do vermelho.
 */
const FUNDO_DO_SELO: Record<string, string> = {
  "border-background-base-lowest": "bg-background-base-lowest",
  "border-background-base-lower": "bg-background-base-lower",
  "border-background-base-low": "bg-background-base-low",
  "border-background-surface-higher": "bg-background-surface-higher",
  "border-input-background-default": "bg-input-background-default",
  "border-chat-background-default": "bg-chat-background-default",
  "border-interactive-background-selected": "bg-interactive-background-selected",
  "border-interactive-background-hover": "bg-interactive-background-hover",
  "border-message-background-hover": "bg-message-background-hover",
};

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
 */
const SIZE = {
  /** 16px: reply preview, listas compactas, participantes de thread. */
  xs: { box: "h-4 w-4 text-[8px]", dot: "h-2.5 w-2.5 -bottom-[2px] -right-[2px] border-2", icone: 6 },
  sm: { box: "h-6 w-6 text-[10px]", dot: "h-3 w-3 -bottom-[2px] -right-[2px] border-2", icone: 8 },
  md: { box: "h-8 w-8 text-xs", dot: "h-4 w-4 -bottom-[3px] -right-[3px] border-[3px]", icone: 9 },
  lg: { box: "h-10 w-10 text-sm", dot: "h-[18px] w-[18px] -bottom-[3px] -right-[3px] border-[3px]", icone: 10 },
  xl: { box: "h-20 w-20 text-2xl", dot: "h-7 w-7 -bottom-[2px] -right-[2px] border-[6px]", icone: 14 },
  /** 120px: cartão de perfil completo e tela de chamada. */
  xxl: { box: "h-[120px] w-[120px] text-4xl", dot: "h-10 w-10 -bottom-px -right-px border-[8px]", icone: 20 },
} as const;

/** Estado de voz que o avatar mostra no lugar da bolinha de status. */
export type VozNoAvatar = "mudo" | "surdo";

/**
 * Avatar circular com a foto do usuário — ou as iniciais sobre uma cor, quando
 * não há foto — e, opcionalmente, a bolinha de status com a borda na cor da
 * superfície de fundo: é a borda que faz a bolinha parecer "recortada" do
 * avatar, como no Discord.
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
 * O `username` acompanha pelo mesmo motivo — são as iniciais do fallback.
 */
export default function Avatar({
  user,
  size = "md",
  status,
  voz,
  surface = "border-background-base-lowest",
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
  /** classe de cor da borda da bolinha = cor do fundo onde o avatar está. */
  surface?: string;
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
  const { avatarUrl, username } = vivo ?? user;

  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className={`${s.box} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: hashColor(user.id) }}
          // fundo é uma cor arbitrária do hash (nunca sabemos se é clara ou
          // escura) — mesmo caso do texto sobre imagem/vídeo, por isso o token
          // de overlay (branco garantido), não `text-white` cru; ver
          // `CardDeApp.tsx`, que já usa o mesmo padrão para as iniciais de app.
          className={`${s.box} grid place-items-center rounded-full font-semibold text-text-overlay-light`}
        >
          {username.slice(0, 2).toUpperCase()}
        </span>
      )}
      {voz ? (
        // surdo implica mudo: um selo só, e o de baixo é o que informa mais
        <span
          role="img"
          aria-label={voz === "surdo" ? "Sem áudio" : "Mudo"}
          // ícone branco sobre o disco de perigo — mesmo raciocínio do papel
          // "overlay": é ícone sobre mancha de cor saturada, não texto de botão
          className={`absolute grid place-items-center rounded-full bg-status-danger text-icon-overlay-light ${surface} ${s.dot}`}
        >
          {voz === "surdo" ? <HeadphoneOff size={s.icone} /> : <MicOff size={s.icone} />}
        </span>
      ) : (
        status && (
          // a borda é da cor da superfície: é ela que "recorta" a bolinha do avatar
          <span
            role="img"
            aria-label={STATUS_LABEL[status]}
            className={`absolute rounded-full ${surface} ${FUNDO_DO_SELO[surface] ?? ""} ${s.dot}`}
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
 * Avatar de um grupo de DM: o ícone enviado, o mosaico dos participantes ou —
 * sem nenhum dos dois — o círculo com as silhuetas. O mosaico existe porque é
 * assim que o Discord identifica um grupo sem ícone: pelas caras de quem está
 * nele, não por um símbolo genérico.
 */
export function GroupAvatar({
  iconUrl,
  members = [],
  size = "md",
  className = "",
}: {
  iconUrl: string | null;
  /** participantes para o mosaico quando não há ícone. */
  members?: { id: string; username: string; avatarUrl?: string | null }[];
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
  // até 4 caras num quadrante cada; com menos, elas dividem o círculo
  const mosaico = members.slice(0, 4);
  if (mosaico.length >= 2) {
    return (
      <span
        aria-hidden="true"
        className={`${box} grid shrink-0 grid-cols-2 overflow-hidden rounded-full ${
          mosaico.length === 2 ? "grid-rows-1" : "grid-rows-2"
        } ${className}`}
      >
        {mosaico.map((m) =>
          m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              key={m.id}
              style={{ backgroundColor: hashColor(m.id) }}
              className="h-full w-full"
            />
          ),
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
