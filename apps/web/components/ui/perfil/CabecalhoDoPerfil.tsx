"use client";

import type { ReactNode } from "react";
import type { UserStatus } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { corDoAvatar } from "@/components/ui/avatar-cores";
import { MoreVertical, Shield } from "@/components/ui/icones";
import { BalaoDeStatus } from "./BalaoDeStatus";

/**
 * Cabeçalho do cartão de perfil: banner, botão do banner, avatar com anel e
 * selo, e o balão de status.
 *
 * Medidas:
 *
 * - **Banner 105.** `--custom-user-profile-banner-height: 105px` em
 *   `.user-profile-popout` (`css-bruto/253781.d118af6e4f0bc056.css`). Os prints
 *   concordam: coluna x=1636 de `2026-08-31 101804` dá y=131–235 e coluna x=1000
 *   de `2026-09-01 113603` dá y=263–367 (104 cheios + 1 de antisserrilhado). O
 *   "99" da revisão foi lido na coluna x=1620, que atravessa o balão. Com e sem
 *   imagem a altura é a mesma: é variável do cartão, não da imagem.
 * - Traço de 1px `--border-muted` na base do banner (`.banner__68edb:before`,
 *   `css-bruto/831835.9d7a4edb115af918.css`).
 * - **Cabeçalho com no mínimo banner + 35 = 140** (`.header__5be3e`,
 *   `css-bruto/352421.53a7850ecf997a57.css`). Com balão, a reserva dele
 *   (`BalaoDeStatus reserva`) é que manda na altura.
 * - **Avatar de 80 em `left 16`, `top 61`** (`.user-profile-popout
 *   .avatar__75742`, `css-bruto/875762.2426cca165f2c572.css`). No print
 *   `101804` a foto vai de x=1360 a 1439 (linha y=237) e de y=193 a 270 (coluna
 *   x=1408), com o anel de 6px da cor do cartão em y=187–192. O anel é a borda
 *   da caixa, por isso a caixa começa em 16 − 6 = 10 e 61 − 6 = 55.
 * - **Selo de status**: disco de 16 com anel de 6, a caixa de 28 passando 2px
 *   da borda da foto. No print, coluna x=1427: disco verde em y=252–267, quatro
 *   pixels acima da base da foto (271). É a geometria do `Avatar` `xl` — desenhada
 *   pelo próprio componente (`<Avatar status surface="border-background-surface-high">`),
 *   que já sabe o fundo do selo para essa superfície (`FUNDO_DO_SELO`, em
 *   `Avatar.tsx`).
 * - Avatar clicável com véu `--opacity-black-40` no hover, que entra em 150ms
 *   `ease-out` (`.clickable__75742:hover .overlay__75742:after`).
 * - **Botão do banner**: 32 × 32 (`--custom-button-button-sm-height: 32px`,
 *   `css-bruto/419070.51520158c0dc856e.css`), redondo, borda 1px
 *   `--opacity-white-8`, fundo `--control-overlay-secondary-background-default`
 *   que vai para `…-active` no hover e no clique, ícone `--white`
 *   (`.bannerButton_fb7f94`, `css-bruto/865647.edc0e98a1a191647.css`), a
 *   `right 12`, `top 8` (`.user-profile-popout .wrapper_da5890`,
 *   `css-bruto/sob-demanda/459257.a4dd1807d4c97269.css`). O ícone de 16 não
 *   foi medido. Nos três prints do meu próprio cartão (`101804`, `113533`,
 *   `180020`) o banner não tem botão nenhum, e por isso ele só aparece no
 *   cartão dos outros.
 *
 * ## Fileira de botões redondos (s7, s9 — leva 2)
 *
 * No cartão de OUTRA pessoa, o canto do banner ganha até três botões, nesta
 * ordem da esquerda para a direita: **visão de moderador** (escudo, só para
 * quem tem permissão de moderar — `Kick/Ban/Timeout`), **ação rápida de
 * amizade** (ícone pessoa, muda com a relação) e o "…" (kebab, que já
 * existia). Os três dividem o mesmo estilo redondo do kebab; nenhum é
 * obrigatório — o cartão de mim mesmo não passa nenhum dos três `ao*` e a
 * fileira inteira some.
 */

export interface CabecalhoDoPerfilProps {
  user: { id: string; username: string; avatarUrl?: string | null };
  nome: string;
  status: UserStatus;
  bannerUrl: string | null;
  bannerCor: string | null;
  /** Enquanto o perfil rico não chegou, o banner fica neutro — sem piscar de cor. */
  carregando: boolean;
  statusPersonalizado: string | null;
  /** Só no meu cartão: o balão vira botão (e mostra o convite quando está vazio). */
  aoEditarStatus?: () => void;
  aoAbrirPerfil: () => void;
  /** Sem ele, o banner não tem botão (o meu próprio cartão). */
  aoAbrirKebab?: (botao: HTMLElement) => void;
  /** Sem ele, sem botão de moderador (só quem pode moderar este membro). */
  aoAbrirVisaoDeModerador?: () => void;
  /** Sem ele, sem botão de amizade (o meu próprio cartão, ou pessoa bloqueada). */
  aoAbrirAmizade?: (botao: HTMLElement) => void;
  /** Ícone do botão de amizade (muda com a relação: pedir/pendente/já amigos). */
  iconeDeAmizade?: ReactNode;
  /** `aria-label` do botão de amizade, coerente com o ícone de cima. */
  rotuloDeAmizade?: string;
  ehMobile: boolean;
}

export function CabecalhoDoPerfil({
  user,
  nome,
  status,
  bannerUrl,
  bannerCor,
  carregando,
  statusPersonalizado,
  aoEditarStatus,
  aoAbrirPerfil,
  aoAbrirKebab,
  aoAbrirVisaoDeModerador,
  aoAbrirAmizade,
  iconeDeAmizade,
  rotuloDeAmizade,
  ehMobile,
}: CabecalhoDoPerfilProps) {
  const temBalao = Boolean(statusPersonalizado) || Boolean(aoEditarStatus);

  return (
    <div className="relative min-h-[140px] shrink-0">
      <div
        /*
          Sem imagem e sem cor escolhida, o Discord pinta o banner com a cor
          dominante do avatar. A nossa foto não tem essa cor calculada; a cor do
          avatar sem foto (`corDoAvatar`) é a mesma que o usuário já vê nas
          iniciais, e é a aproximação honesta. Não é o limão: o banner não é
          marca.
        */
        style={!bannerUrl && !carregando ? { backgroundColor: bannerCor ?? corDoAvatar(user.id) } : undefined}
        className={`relative h-[105px] overflow-hidden ${carregando && !bannerUrl ? "bg-background-surface-highest" : ""}`}
      >
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 border-b border-border-muted" />
      </div>

      {temBalao && (
        <>
          <BalaoDeStatus texto={statusPersonalizado} chave={user.id} aoClicar={aoEditarStatus} />
          <BalaoDeStatus texto={statusPersonalizado} chave={user.id} aoClicar={aoEditarStatus} reserva />
        </>
      )}

      <button
        type="button"
        onClick={aoAbrirPerfil}
        aria-label={`Ver o perfil completo de ${nome}`}
        className="group absolute left-[10px] top-[55px] z-[1] flex rounded-full border-[6px] border-background-surface-high bg-background-surface-high"
      >
        {/* selo pelo próprio `Avatar` (não mais desenhado à mão aqui): mesma
            geometria de antes — `xl` já é disco de 28, anel de 6, deslocado
            2px — e a mesma superfície `--background-surface-high`, conferida
            contra o print `2026-08-31 101804` (coluna x=1427: verde em
            y=252–267, 14px cheios entre os 6px de anel de cada lado). */}
        <Avatar user={user} status={status} surface="border-background-surface-high" size="xl" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-opacity-black-40 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
        />
      </button>

      {(aoAbrirKebab || aoAbrirVisaoDeModerador || aoAbrirAmizade) && (
        <div className="absolute right-3 top-2 z-[3] flex items-center gap-2">
          {aoAbrirVisaoDeModerador && (
            <BotaoRedondoDoBanner
              rotulo="Abrir na visualização de moderador"
              ehMobile={ehMobile}
              onClick={() => aoAbrirVisaoDeModerador()}
            >
              <Shield size={16} aria-hidden="true" />
            </BotaoRedondoDoBanner>
          )}
          {aoAbrirAmizade && (
            <BotaoRedondoDoBanner
              rotulo={rotuloDeAmizade ?? "Amizade"}
              ehMobile={ehMobile}
              haspopup
              onClick={aoAbrirAmizade}
            >
              {iconeDeAmizade}
            </BotaoRedondoDoBanner>
          )}
          {aoAbrirKebab && (
            <BotaoRedondoDoBanner rotulo="Mais opções" ehMobile={ehMobile} haspopup onClick={aoAbrirKebab}>
              <MoreVertical size={16} aria-hidden="true" />
            </BotaoRedondoDoBanner>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Um dos botões redondos do canto do banner (moderador/amizade/kebab) — mesmo
 * desenho de sempre (`--control-overlay-secondary-background-default`, anel
 * `--opacity-white-8`), agora reaproveitado três vezes em vez de desenhado só
 * para o kebab.
 */
function BotaoRedondoDoBanner({
  rotulo,
  ehMobile,
  haspopup,
  onClick,
  children,
}: {
  rotulo: string;
  ehMobile: boolean;
  haspopup?: boolean;
  onClick: (botao: HTMLButtonElement) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      aria-label={rotulo}
      aria-haspopup={haspopup ? "menu" : undefined}
      className={`grid place-items-center rounded-full border border-opacity-white-8 bg-control-overlay-secondary-background-default text-icon-overlay-light transition-colors duration-[50ms] ease-in hover:bg-control-overlay-secondary-background-active hover:duration-150 hover:ease-out active:bg-control-overlay-secondary-background-active ${
        ehMobile ? "h-[44px] w-[44px]" : "h-8 w-8"
      }`}
    >
      {children}
    </button>
  );
}
