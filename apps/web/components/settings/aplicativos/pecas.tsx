"use client";

import type { ReactNode } from "react";
import type { AppDetalhe } from "@streamz/shared";
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from "@/components/ui/icones";
import { Button, MensagemDeAjuda } from "@/components/ui/primitivos";

/**
 * Peças comuns às telas de "Configurações → Aplicativos" (cartão
 * 6l-aplicativos-usuario, onda 6).
 *
 * A régua é a aba **Authorized Apps** do Discord (Configurações de usuário),
 * que é a contrapartida dela no cliente: o módulo `_92059` de
 * `tokens/css-bruto/sob-demanda/216947.c1fba293adbe783f.css` e a imagem de
 * catálogo `suporte/imagens/announcements/40758571676951-…/11.png`
 * (2880×2048). A imagem é de escala desconhecida pela regra da ADR-0009 §7,
 * mas ela carrega dois números do próprio CSS: o `margin-bottom:16px` de
 * `.authedAppV2` mede 32px entre os dois cartões (y 1308–1339) e o `padding:16px`
 * de `.headerV2` mede 32px até o botão "…" (x 2458–2489). Escala 2,0 — e é por
 * ela que os números marcados "catálogo ÷2" abaixo viram px. Onde nem o CSS
 * nem essa conta dão o número, está escrito "não medido".
 */

/**
 * "25/04/2026" — a data numérica do "Authorized on 4/25/26" do cartão do
 * Discord. `dataCompleta` (`lib/format.ts`) traz dia da semana e hora, e não
 * cabe numa linha de cabeçalho que trunca.
 */
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : DATA_CURTA.format(data);
}

/* ─────────────────────────── ícone do aplicativo ─────────────────────────── */

/**
 * O ícone do aplicativo, ou a inicial do nome quando não há ícone.
 *
 * `.appAvatarV2__92059{border-radius:var(--radius-sm);height:40px;width:40px;
 * border:1px solid var(--border-subtle);box-sizing:border-box}` — quadrado de
 * raio 8 com borda sutil **por dentro** dos 40 (não é o círculo do avatar de
 * pessoa: o V1 `.appAvatar` era `border-radius:50%`, a refresh trocou). O
 * `tamanho` maior (80, na tela de editar) repete a forma; esse tamanho não
 * existe na aba do Discord — não medido.
 *
 * A inicial: o Discord mostra o avatar padrão do bot, que o Streamz não tem
 * para aplicativo; a letra em `text-text-subtle` sobre `background-base-lower`
 * é nossa (não medido).
 */
export function IconeDoApp({ app, tamanho = 40 }: { app: AppDetalhe; tamanho?: number }) {
  const lado = { width: tamanho, height: tamanho };
  const classe = "box-border shrink-0 rounded-lg border border-border-subtle";
  if (app.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.iconUrl}
        alt=""
        style={lado}
        draggable={false}
        className={`${classe} bg-background-base-lower object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...lado, fontSize: Math.round(tamanho * 0.4) }}
      className={`${classe} grid place-items-center bg-background-base-lower font-semibold text-text-subtle`}
    >
      {app.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ─────────────────────────── caixa de apresentação ─────────────────────────── */

/**
 * A caixa "Applications" do topo da aba do Discord (título + um parágrafo).
 *
 * Medido no catálogo ÷2 (coluna x=2200): borda 1px (y 208–209 = 2px) na cor
 * de `--border-subtle` sobre `--background-surface-high` (`#323237` sobre
 * `#242429`, exatamente o que a mistura do token dá); altura total 96 (y
 * 208–399 = 192px), que fecha em 16 + 20 (título 16/20) + 8 + 36 (duas linhas
 * de 14/18) + 16 — daí o `p-4` e o `mt-2`. Tamanho do texto pela altura de
 * maiúscula: "B"/"A" do título 22px → 11 → 16px; "H" do corpo 19px → ~10 →
 * 14px. Tinta do corpo `#fbfbfb` = `--text-strong`. Raio: não medido (arco
 * perdido no antisserrilhado) — `rounded-lg` (`--radius-sm`), o do cartão.
 *
 * `acao` é nossa: no Discord a aba não cria nada, então a posição do botão
 * "Criar aplicativo" à direita não tem medida.
 */
export function CaixaDeApresentacao({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border-subtle bg-background-surface-high p-4 celular:flex-col celular:items-stretch">
      <div className="min-w-0 flex-1">
        <h2 className="text-text-md font-semibold text-text-strong">{titulo}</h2>
        <div className="mt-2 text-text-sm text-text-strong">{children}</div>
      </div>
      {acao ? <div className="shrink-0">{acao}</div> : null}
    </div>
  );
}

/* ─────────────────────────── seção do cartão ─────────────────────────── */

/**
 * Uma seção do corpo do cartão ("About and Policies", "Permissions", "Server
 * Access" no Discord).
 *
 * CSS (`216947…css`): `.appDetailsContainer .appDetailsSection{border-bottom:
 * 1px solid var(--border-subtle);padding:16px 0}`,
 * `.appDetailsSectionHeader{align-items:center;cursor:pointer;display:flex;
 * justify-content:space-between}`, `.appDetailsContent{padding-top:4px}`;
 * `:active{background-color:inherit}` — a linha não muda de fundo no hover
 * nem no clique, só o cursor.
 *
 * Catálogo ÷2: título "Permissions" com maiúscula de 19–21px → 14px, tinta
 * `#fbfbfb` (`--text-strong`); o resumo "6 Permissions enabled" 19px → 14px em
 * `#aaaab1` (`--text-subtle`, `#abacb2`). Uma seção recolhida sem resumo mede
 * 111px com os 4 do topo do contêiner (y 1488–1598) → 16 + 20 + 16: a linha
 * do título tem 20, por isso `leading-5` sobre o `text-text-sm` (que traria
 * 18). O chevron fica centrado no bloco título+resumo (y 1164 entre 1146 e
 * 1182 na tela), então o resumo mora **dentro** do cabeçalho clicável.
 *
 * Chevron: `.disclosureIcon{height:18px;width:18px;color:var(--text-muted)}`
 * — para baixo aberta, para a direita fechada (os dois estados aparecem lado
 * a lado no catálogo). Com `navegar`, a seção não abre: ela leva a outra tela,
 * e o chevron fica sempre para a direita ("Server Access" no Discord).
 *
 * Peso do título: não medido (semibold pela mancha).
 */
export function SecaoDoCartao({
  titulo,
  resumo,
  aberta = false,
  aoAlternar,
  navegar,
  children,
}: {
  titulo: string;
  /** a segunda linha: some quando a seção está aberta e o conteúdo a substitui. */
  resumo?: ReactNode;
  aberta?: boolean;
  aoAlternar?: () => void;
  /** a seção é um atalho para outra tela, não um acordeão. */
  navegar?: () => void;
  children?: ReactNode;
}) {
  const expandida = !navegar && aberta;
  return (
    <div className="border-b border-border-subtle py-4">
      <button
        type="button"
        onClick={navegar ?? aoAlternar}
        aria-expanded={navegar ? undefined : expandida}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded text-left"
      >
        <span className="min-w-0">
          <span className="block text-text-sm font-semibold leading-5 text-text-strong">{titulo}</span>
          {resumo && !expandida ? (
            <span className="mt-1 block text-text-sm text-text-subtle">{resumo}</span>
          ) : null}
        </span>
        {expandida ? (
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
        )}
      </button>
      {expandida && children ? <div className="pt-1">{children}</div> : null}
    </div>
  );
}

/* ─────────────────────────── mensagem de ajuda ─────────────────────────── */

/** Falha de carregamento com "Tentar de novo" — erro que a pessoa pode desfazer. */
export function ErroComNovaTentativa({ mensagem, tentar }: { mensagem: string; tentar: () => void }) {
  return (
    <MensagemDeAjuda
      tom="erro"
      acao={
        <Button
          variante="secundario"
          tamanho="sm"
          icone={<RefreshCw size={16} aria-hidden="true" />}
          onClick={tentar}
          className="celular:h-[44px]"
        >
          Tentar de novo
        </Button>
      }
    >
      {mensagem}
    </MensagemDeAjuda>
  );
}

/* ─────────────────────────── voltar ─────────────────────────── */

/**
 * A linha de "voltar" no topo de uma tela interna da aba.
 *
 * Não existe no Discord (a aba dele não tem subtelas): é o `neutro` do
 * `Button` — o par muted→strong do ghost de texto — em `sm`, com a seta de 16.
 * No celular o alvo cresce para 44 (regra de toque da onda 8).
 */
export function Voltar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variante="neutro"
      tamanho="sm"
      icone={<ArrowLeft size={16} aria-hidden="true" />}
      onClick={onClick}
      className="mb-4 celular:h-[44px]"
    >
      {children}
    </Button>
  );
}

/** Título de uma tela interna (criar, editar, servidores). 20px: não medido. */
export function TituloDaTela({ children }: { children: ReactNode }) {
  return <h2 className="truncate text-text-lg font-semibold text-text-strong">{children}</h2>;
}

/* ─────────────────────────── esqueleto ─────────────────────────── */

/**
 * Cartão em carregamento, com a altura do cabeçalho real (74 = catálogo ÷2,
 * y 600–747 → 148px: 16 + 42 + 16) para a lista não pular quando os dados
 * chegam. As barras são nossas (o Discord não mostra esqueleto nesta aba —
 * `.loadingWrapper__5a143` do mesmo arquivo é um spinner de 16px).
 */
export function CartaoEsqueleto() {
  return (
    <div aria-hidden="true" className="mb-4 overflow-hidden rounded-lg bg-background-mod-subtle">
      <div className="flex h-[74px] items-center gap-3 bg-background-mod-subtle p-4">
        <span className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-background-base-lower" />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="h-3.5 w-40 animate-pulse rounded bg-background-base-lower" />
          <span className="h-3 w-28 animate-pulse rounded bg-background-base-lower" />
        </span>
      </div>
      <div className="h-[52px]" />
    </div>
  );
}
