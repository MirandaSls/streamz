"use client";

import { AlertTriangle, Browser, Lock, RefreshCw } from "@/components/ui/icones";
import { Select, Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/primitivos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { useOnboarding } from "@/components/settings/server/onboarding-form";
import { useChannels } from "@/stores/channels";
import type { ReactNode } from "react";

/**
 * "Acesso": como se entra no servidor, e as regras que quem entra aceita.
 *
 * Do print `docs/Reference/Captura de tela 2026-09-04 100713.png` (Discord
 * real, janela 1919×1079, `medir.py`): o painel cinza dos cartões vai de
 * x≈733 a x≈1391 e y≈211 a y≈361 (**658×150**, arredondado para 660×151), com
 * 8px de recuo (topo/base 211→219 e 352→360) até o cartão — o `p-2` do
 * `bg-background-base-lower` bate a régua. Cada cartão fecha em **209×134**
 * (bordas inclusas: x 741→949, y 219→352). O cartão escolhido soma fundo
 * `#2e2e34` (`linha`/`coluna`, run estável de dezenas de pixels — mais
 * próximo de `--background-surface-highest` `#2c2d32`, 1 passo da escala
 * neutra do Discord, que de `--interactive-background-selected`, cuja
 * composição sobre o painel fecha em `#333338`, ~5 de distância) com borda
 * `border-normal` (composição de `--border-normal` sobre o fundo do painel
 * fecha em `#333338`, a 1–2 de `#34343b` medido — dentro do ruído de
 * antialiasing). **Divergência corrigida aqui:** o painel usava
 * `bg-background-base-lowest` (`#121214`, 6 passos mais escuro que o medido
 * `#1a1a1e`), e o cartão ativo usava `bg-interactive-background-selected`
 * (a composição translúcida, mais clara que o sólido medido) — nenhum dos
 * dois é a peça que o Discord desenha aqui. Abaixo, a linha "Regras do
 * servidor" com o interruptor de 48×24 (medida do cabeçalho de
 * `primitivos/Switch.tsx`) encostado na borda direita da coluna.
 *
 * São **dois** cartões e não três: "Mediante solicitação" é um conceito que a
 * API não tem (não existe fila de aprovação), e desenhar o cartão morto seria
 * prometer um botão que não faz nada. "Apenas por convite" e "Descobrível" são
 * os dois estados reais de `GuildOnboarding.discoverable`.
 *
 * As regras aqui são um **canal** de regras, não uma lista de frases: é o que o
 * modelo guarda (`rulesChannelId`), e é o que trava quem não aceitou.
 *
 * Estados (cartão 6t-acesso):
 * - **carregando** — texto simples ("Carregando…"), como o resto da onda 6
 *   (`EngajamentoTab.tsx`, `AcessoTab.tsx` antes deste cartão): a página troca
 *   pouco o suficiente para um esqueleto não valer o peso.
 * - **erro** (a busca inicial falhou) — antes `falhouCarregar`/`recarregar`
 *   do hook não eram usados aqui e a página ficava presa em "Carregando…"
 *   para sempre, o mesmo defeito que `SessoesTab.tsx`/`SegurancaTab.tsx`
 *   fecharam e que `EngajamentoTab.tsx` já replicou para o irmão desta
 *   página. Agora o mesmo bloco ícone+mensagem+"Tentar de novo"
 *   (`BlocoDeErro`, repetido aqui pelo mesmo motivo que lá: as duas fontes
 *   vivem fora da lista deste cartão).
 * - **vazio** (nenhum canal de texto) — o interruptor "Exigir aceite das
 *   regras" fica **desabilitado** e ganha uma dica embaixo explicando por
 *   quê, em vez de deixar quem olha adivinhar; sem canal de texto não há onde
 *   guardar as regras.
 * - **sem permissão** — não existe dentro desta página: `ServerSettingsModal`
 *   só lista "Acesso" no menu para quem tem `MANAGE_GUILD` (mesmo padrão de
 *   `AplicativosTab.tsx`/`EngajamentoTab.tsx`), então quem abre esta aba
 *   sempre pode editá-la.
 * - **hover/foco/desabilitado dos cartões** — próprios (não há primitivo de
 *   "cartão de opção" ainda): hover só no inativo
 *   (`interactive-background-hover`, o ativo já está selecionado), foco pelo
 *   anel global de `globals.css` (`:focus-visible`, nenhuma regra própria
 *   necessária no `<button>`).
 * - **hover/foco/desabilitado do resto** — do `Switch` e do `Select` dos
 *   primitivos; nenhum estilo próprio aqui.
 */
export default function AcessoTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const textos = channels.filter((c) => c.type === "TEXT");
  const { form, patch, carregando, falhouCarregar, recarregar } = useOnboarding(guildId);

  if (falhouCarregar && !form) {
    return (
      <>
        <TituloDaPagina titulo="Acesso" />
        <BlocoDeErro tentar={recarregar} />
      </>
    );
  }

  if (!form) {
    return (
      <>
        <TituloDaPagina titulo="Acesso" />
        {/* `carregando` é sempre `true` aqui — a única outra causa de `form`
            nulo é o bloco de erro acima, que já retornou. */}
        {carregando && <p className="text-sm text-text-muted">Carregando…</p>}
      </>
    );
  }

  const semCanalDeTexto = textos.length === 0;

  return (
    <>
      <TituloDaPagina titulo="Acesso" />

      <h2 className="text-base font-semibold text-text-strong">
        Como as pessoas podem entrar no seu servidor?
      </h2>
      <p className="mt-1.5 text-sm text-text-muted">
        Mantenha seu servidor privado, ou abra-o para mais pessoas se juntarem.
      </p>

      <div
        role="radiogroup"
        aria-label="Como as pessoas podem entrar no seu servidor"
        className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-background-base-lower p-2"
      >
        <CartaoDeAcesso
          icone={<Lock size={24} />}
          titulo="Apenas por convite"
          descricao="As pessoas entram no seu servidor com um link de convite."
          ativo={!form.discoverable}
          onSelect={() => patch({ discoverable: false })}
        />
        <CartaoDeAcesso
          icone={<Browser size={24} />}
          titulo="Descobrível"
          descricao="Qualquer um pode entrar pela lista de servidores públicos."
          ativo={form.discoverable}
          onSelect={() => patch({ discoverable: true })}
        />
      </div>

      <div aria-hidden="true" className="mt-8 h-px bg-border-subtle" />

      <div className="mt-8 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-strong">Regras do servidor</h2>
          <p className="mt-1.5 text-sm text-text-muted">
            Os membros devem concordar com as regras antes de poderem conversar ou interagir no
            servidor. Quem administra o servidor não fica preso por elas.
          </p>
          {/* Estado vazio: sem canal de texto não há onde guardar as regras
              (é o que `rulesChannelId` aponta), então o interruptor desabilita
              e diz por quê — em vez de deixar quem olha adivinhar por que
              não reage ao clique, o mesmo raciocínio do `Select` desabilitado
              de `EngajamentoTab.tsx`. */}
          {semCanalDeTexto && (
            <p className="mt-1.5 text-xs text-text-muted">
              Crie um canal de texto para poder exigir aceite das regras.
            </p>
          )}
        </div>
        {/* O interruptor do print encosta na borda direita da coluna, alinhado
            com a primeira linha do título — por isso `Switch` solto, e não o
            `Toggle`, que traz a linha inteira com divisória. */}
        <Switch
          checked={!!form.rulesChannelId}
          onChange={(ligado) => patch({ rulesChannelId: ligado ? (textos[0]?.id ?? null) : null })}
          label="Exigir aceite das regras"
          disabled={semCanalDeTexto}
        />
      </div>

      {/* O painel cinza do print, com o campo de regra dentro. Aqui o conteúdo
          das regras é um canal — quem escreve as frases é a mensagem fixada
          nele —, então o painel guarda a escolha do canal. */}
      {form.rulesChannelId && (
        <div className="mt-4 rounded-lg bg-background-base-lowest p-4">
          <Select
            semDivisoria
            label="Canal de regras"
            value={form.rulesChannelId}
            options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
            onChange={(id) => patch({ rulesChannelId: id || null })}
            emptyLabel="Nenhum"
            hint="Quem chega precisa aceitar o que estiver neste canal antes de escrever."
          />
        </div>
      )}
    </>
  );
}

/**
 * Um dos cartões de "como se entra".
 *
 * `role="radio"` e não um `<button>` qualquer: são opções mutuamente
 * exclusivas, e sem o papel certo o leitor de tela anuncia dois botões soltos
 * em vez de "opção 1 de 2, marcada".
 */
function CartaoDeAcesso({
  icone,
  titulo,
  descricao,
  ativo,
  onSelect,
}: {
  icone: ReactNode;
  titulo: string;
  descricao: string;
  ativo: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onSelect}
      className={`flex h-[134px] flex-col items-center justify-center gap-1.5 rounded-lg border px-4 text-center transition ${
        ativo
          ? "border-border-normal bg-background-surface-highest"
          : "border-transparent text-text-muted hover:bg-interactive-background-hover"
      }`}
    >
      <span aria-hidden="true" className={ativo ? "text-text-strong" : "text-text-subtle"}>
        {icone}
      </span>
      <span className={`text-sm font-semibold ${ativo ? "text-text-strong" : "text-text-default"}`}>
        {titulo}
      </span>
      <span className="text-xs leading-4 text-text-muted">{descricao}</span>
    </button>
  );
}

/**
 * Erro persistente de carregamento: o par ícone+mensagem+"Tentar de novo" que
 * `SegurancaTab.tsx`/`SessoesTab.tsx` já usam para a mesma falha (caixa
 * `rounded-[4px] border border-border-subtle bg-background-base-lowest`,
 * `AlertTriangle` em `--status-warning`, botão secundário com `RefreshCw`) e
 * que `EngajamentoTab.tsx` replicou para a página irmã desta. Repetido aqui
 * em vez de extraído porque as duas fontes vivem em `components/settings/*.tsx`,
 * fora da lista de arquivos deste cartão.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar o acesso.</p>
      </div>
      <Button
        variante="secundario"
        tamanho="sm"
        icone={<RefreshCw size={14} aria-hidden="true" />}
        onClick={tentar}
        className="shrink-0 celular:h-[44px]"
      >
        Tentar de novo
      </Button>
    </div>
  );
}
