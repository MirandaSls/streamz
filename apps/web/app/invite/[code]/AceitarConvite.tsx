"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Hash } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { displayNameOf, type InviteFullPreview } from "@streamz/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";

/** Iniciais do nome, como o rail faz com servidor sem ícone. */
function acronimo(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * Página pública do convite (`/invite/:code`).
 *
 * Abre **sem login**: mostra a prévia do servidor e, se o visitante não estiver
 * autenticado, manda para `/login?next=/invite/:code` — que volta para cá
 * depois de entrar. É o fluxo do Discord, e é o que faz um link de convite
 * colado em qualquer lugar funcionar para quem ainda nem tem conta.
 */
export default function AceitarConvite() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;
  const user = useAuth((s) => s.user);
  const loadFromStorage = useAuth((s) => s.loadFromStorage);

  const [preview, setPreview] = useState<InviteFullPreview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => loadFromStorage(), [loadFromStorage]);

  useEffect(() => {
    if (!code) return;
    let ativo = true;
    void api
      .previewInvite(code)
      .then((p) => ativo && setPreview(p))
      .catch((e) => ativo && setErro(errorMessage(e, "Convite inválido")));
    return () => {
      ativo = false;
    };
    // a prévia muda com a sessão: logado, ela também diz se já sou membro
  }, [code, user?.id]);

  async function aceitar() {
    if (!preview || entrando) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }
    if (preview.member) {
      router.replace("/app");
      return;
    }
    setEntrando(true);
    try {
      await api.redeemInvite(code);
      router.replace("/app");
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível entrar no servidor"));
      setEntrando(false);
    }
  }

  const invalido = erro !== null || (preview !== null && !preview.valid);
  const recado = erro ?? preview?.reason ?? "Este convite não vale mais.";

  return (
    /* `min-h-[100dvh]` e não `min-h-screen`: no celular `100vh` é a janela
       **sem** a barra de endereço, e o cartão nascia empurrado para baixo dela.
       As áreas seguras entram no padding para o cartão não encostar no entalhe
       nem na barra de gestos. */
    <main className="grid min-h-[100dvh] place-items-center bg-background-base-lowest bg-[radial-gradient(ellipse_at_top_left,rgba(155,227,31,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(155,227,31,0.05),transparent_60%)] p-4 celular:px-[max(1rem,env(safe-area-inset-left))] celular:pb-[max(1rem,env(safe-area-inset-bottom))] celular:pt-[max(1rem,env(safe-area-inset-top))]">
      {/*
        Fundo da página: o Discord usa a arte/splash do próprio servidor
        (`background__7778d`, imagem de `cdn.discordapp.com/splashes/…`) — um
        recurso de boost que o `InviteFullPreview` do Streamz não carrega (ver
        "faltando"). Sem essa imagem, `bg-background-base-lowest` (o token do
        canvas do app, não `input-background-default` — que é translúcido e
        pensado para chip de input, não para preencher a página) com o mesmo
        halo de limão que já existia é o mais próximo sem inventar dado.

        `w-full max-w-[480px]`, e não `w-[480px] max-w-full`: com `justify-items:
        center` o item da grade é dimensionado pelo conteúdo, e o `max-width:
        100%` passa a valer sobre a *área* da grade — que a largura fixa
        já havia esticado. Medido em 390×844 (com o antigo max-w-[420px]): a
        página rolava 436px na horizontal e o botão "Entrar para aceitar o
        convite" saía pela direita; o padrão `w-full max-w-[Npx]` vale para
        qualquer N. 480 é a largura do Discord (`.authBox__921c5{width:480px}`,
        `945756.4a213946efe023f3.css`; confere com a medida em px da revisão:
        cartão 1024–1855 CSS/2x → 512–927 CSS, +32 de padding de cada lado =
        480–960). Mesmo cartão do `AuthCard` (login/registro,
        `components/auth/AuthCard.tsx`): mesma largura, raio, fundo e sombra
        (`--legacy-elevation-high`, sem token gerado ainda — ver "faltando"),
        por isso o valor de sombra também entra literal aqui, não
        `shadow-popout` (que é outra combinação, `--shadow-border,
        --shadow-high`, usada nos popouts/menus — não no `authBox`).
      */}
      <div className="w-full max-w-[480px] rounded-lg bg-modal-background p-8 text-center shadow-[0_2px_10px_0_rgba(0,0,0,.2)] celular:p-6">
        {preview === null && !erro && <p className="text-text-default">Carregando convite…</p>}

        {(preview || erro) && (
          <>
            {/*
              64×64 (`.guildIcon_fa285e{height:64px;width:64px}`,
              807432.753fe86557d786fd.css — o Minecraft e o Discord Developers
              medem o mesmo). No Discord o desenho é mascarado por SVG
              (`mask="url(#svg-mask-squircle)"`), sem `border-radius` 1:1; a
              aproximação já usada no rail para o mesmo squircle
              (`GuildRail.tsx`, raio 16/`--radius-lg`/`rounded-2xl`) é o que
              usamos aqui, em vez do `rounded-3xl` (24px) de antes.
            */}
            <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-input-background-default text-lg font-semibold text-text-strong">
              {preview?.guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.guild.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                acronimo(preview?.guild.name ?? "?")
              )}
            </div>

            {/*
              16px, `text-default` (não `text-muted`): `.text-md/normal_cf4812`
              com `style="color:var(--text-default)"` no HTML capturado da
              página real (`publico/desktop/09-convite-minecraft.html`) — a
              revisão mediu 16 no Discord contra 14 no nosso; o HTML capturado
              também corrige a cor, que era `text-muted` aqui.
            */}
            <p className="mt-2 text-text-md text-text-default">
              {preview?.inviter
                ? `${displayNameOf(preview.inviter)} convidou você para`
                : "Você foi convidado para"}
            </p>
            {/*
              `heading-xl/semibold` (24px, peso 600) no HTML capturado
              (`.title_fa285e{font-weight:var(--font-weight-semibold)}`) — era
              `text-2xl font-extrabold` (800, com `font-headline` avulso —
              nenhuma regra do Discord dá família própria a este título, só
              tamanho/peso) aqui; `text-heading-xl` é o nome da mesma medida
              no nosso vocabulário (tailwind.config.ts). Mesma classe do `h1`
              do `AuthCard` (login/registro), o mesmo `.title__921c5`.
            */}
            <h1 className="mt-2 text-heading-xl font-semibold text-text-strong">
              {preview?.guild.name ?? "Servidor"}
            </h1>

            {preview?.description && (
              <p className="mt-2 break-words text-sm text-text-muted">{preview.description}</p>
            )}

            {/*
              `text-sm/normal` (14px — o nosso já batia), cor `text-default`
              (não `text-muted`): mesmo HTML capturado,
              `<span class="text-sm/normal_cf4812" style="color:var(--text-default)">495.824 online</span>`.
              Bolinha 10×10 com 4px de margem (`.pillIcon__921c5{border-radius:
              50%;height:10px;width:10px;margin-inline-end:4px}`, era 8×8 com
              6px de gap) e 16px entre os dois grupos
              (`.pillOnline__921c5{margin-inline-end:16px}`, o `gap-4` já
              batia). Espaço até o título: 8px, não 24 — o HTML capturado
              embrulha esta fileira em dois `stack_dbd263` aninhados
              (`gap:var(--space-24)` e `gap:var(--space-4)`) que só teriam
              efeito com mais de um filho (uma descrição entre título e
              contadores, por exemplo); com um filho só, o gap que sobra é o
              `var(--space-8)` do `stack` de fora, o mesmo da largura
              ícone→subtítulo→título. `mt-2`.
            */}
            {preview && (
              <p className="mt-2 flex items-center justify-center gap-4 text-sm text-text-default">
                <span className="flex items-center gap-1">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-status-positive" />
                  {preview.onlineCount} online
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-channels-default" />
                  {preview.memberCount} membros
                </span>
              </p>
            )}

            {/*
              Canal do convite não existe nas referências do Discord medidas
              (as duas são convite de servidor, não de canal específico) — é
              recurso próprio do Streamz, mantido; só o tamanho do ícone entra
              na régua (16, o menor do acervo — 14 não é tamanho do Discord).
            */}
            {preview?.channelName && (
              <p className="mt-2 flex items-center justify-center gap-1 text-sm text-text-muted">
                <Hash size={16} aria-hidden="true" />
                {preview.channelName}
              </p>
            )}

            {/*
              32px antes do botão em ambos os ramos — `.authBlock_d332d2
              {margin-top:32px}` (945756.4a213946efe023f3.css), o próximo
              bloco depois do resumo do servidor no cartão real. `mt-8`.
            */}
            {invalido ? (
              <>
                <p role="alert" className="mt-5 text-sm text-status-danger">
                  {recado}
                </p>
                <Button
                  type="button"
                  variante="secundario"
                  tamanho="md"
                  larguraTotal
                  onClick={() => router.replace(user ? "/app" : "/login")}
                  className="mt-8 celular:h-[48px]"
                >
                  {user ? "Voltar para o app" : "Ir para o login"}
                </Button>
              </>
            ) : (
              // Sem `autoFocus`: nenhum print do Discord mostra o botão com
              // anel de foco já visível ao carregar a página — a revisão
              // pegou exatamente esse anel azul nascendo aqui (o botão pedia
              // foco no `mount`, e o navegador trata foco por script como
              // veio-do-teclado). O `:focus-visible` global de `globals.css`
              // continua cobrindo o Tab manual, que é a única entrada de
              // teclado que o Discord também marca.
              <Button
                type="button"
                variante="primario"
                tamanho="md"
                larguraTotal
                disabled={entrando}
                onClick={() => void aceitar()}
                className="mt-8 celular:h-[48px]"
              >
                {preview?.member
                  ? "Você já é membro — abrir servidor"
                  : entrando
                    ? "Entrando…"
                    : user
                      ? "Aceitar convite"
                      : "Entrar para aceitar o convite"}
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
