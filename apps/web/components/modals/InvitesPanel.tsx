"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, RefreshCw, Trash2 } from "@/components/ui/icones";
import { displayNameOf, type InviteDetail } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button, Tooltip } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Convites do servidor: tabela (criado por, código, usos, expira em), cópia e
 * revogação — redesenho contra o print 1:1
 * `docs/Reference/Captura de tela 2026-09-04 100706.png` (janela 1919×1079,
 * coluna de conteúdo 660, x 732→1391) e o módulo `.inviteSettingsInviteRow__1de14`
 * de `docs/referencias-discord/tokens/css-bruto/sob-demanda/78524c21403a8993.css`
 * — o único CSS bruto encontrado para esta tela; regra §7 da ADR-0009, o print
 * decide onde ele e o CSS discordam.
 *
 * Vive separado do modal porque é a mesma tela em dois lugares — o modal
 * `InvitesModal` (atalho do menu do servidor) e a aba "Convites" das
 * configurações. Duplicar seria manter duas listas que envelhecem diferente.
 *
 * Estados cobertos:
 * - **carregando** — "Carregando…" na primeira linha da tabela.
 * - **vazio** — "Nenhum convite ativo." — distinto de **erro**: um `catch` que
 *   caísse em `setInvites([])` mostraria "vazio" para quem só ficou sem
 *   internet, que é a mentira que este redesenho tira (era assim antes).
 * - **erro** — `erroAoCarregar` troca todo o corpo (botões + tabela) pelo
 *   `BlocoDeErro` com "Tentar de novo", no mesmo desenho que
 *   `EngajamentoTab.tsx`/`AcessoTab.tsx`/`SessoesTab.tsx` já usam para a
 *   mesma falha (ícone `AlertTriangle` em `--status-warning`, botão
 *   secundário com `RefreshCw`). Repetido aqui em vez de extraído porque as
 *   três fontes vivem fora da lista deste cartão.
 * - **sem permissão** — não existe dentro desta página: `ServerSettingsModal.tsx`
 *   só lista a aba "Convites" para quem tem `MANAGE_GUILD` (mesmo padrão de
 *   `AplicativosTab.tsx`/`EngajamentoTab.tsx`), então quem abre este painel
 *   sempre pode criar, pausar (quando existir) e revogar.
 * - **hover/foco** — copiar e revogar só aparecem no hover da linha ou com o
 *   teclado (`focus-within`); sempre visíveis no celular, que não tem hover.
 * - **desabilitado** — "Criar link de convite" enquanto cria; "Pausar
 *   convites" sempre, com a dica "(em breve)" (§6.6 do PROCESSO: a API não
 *   sabe suspender convite, então o controle fica visível e inerte em vez de
 *   sumir ou fingir que funciona).
 */
export default function InvitesPanel({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<InviteDetail[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  // o relógio da coluna "Expira em"; um tique por segundo só enquanto houver
  // convite com prazo, senão o estado nem existe
  const [agora, setAgora] = useState(() => Date.now());
  const temPrazo = invites?.some((i) => i.expiresAt) ?? false;

  useEffect(() => {
    if (!temPrazo) return;
    setAgora(Date.now());
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [temPrazo]);

  function carregar() {
    let vivo = true;
    setErroAoCarregar(false);
    api
      .listInvites(guildId)
      .then((list) => {
        if (!vivo) return;
        setInvites(list);
        setErroAoCarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        ui.toast(errorMessage(e, "Não foi possível listar os convites"), "error");
        setErroAoCarregar(true);
      });
    return () => {
      vivo = false;
    };
  }

  useEffect(() => carregar(), [guildId]);

  async function create() {
    setBusy(true);
    try {
      await api.createInvite(guildId);
      setInvites(await api.listInvites(guildId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: string) {
    try {
      await api.revokeInvite(guildId, code);
      setInvites((list) => list?.filter((i) => i.code !== code) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível revogar"), "error");
    }
  }

  // erro na primeira carga (sem nada pra mostrar): troca o corpo inteiro,
  // como `EngajamentoTab`/`AcessoTab`/`SessoesTab` fazem para a mesma falha —
  // ver o bloco de estados no cabeçalho deste arquivo.
  if (erroAoCarregar && invites === null) {
    return <BlocoDeErro tentar={carregar} />;
  }

  return (
    <div>
      {/*
        Rótulo + botões na mesma linha (print `100706`, y172–195): a
        `TituloDaPagina` já dá 24px entre o `<h1>` "Convites" e este bloco
        (`mb-6`, sem subtítulo aqui); o `mt-4` completa os 40 do
        `.header__1de14{padding-bottom:40px}` do CSS bruto — os dois números
        medidos não coincidem sozinhos porque um é do `<h1>` genérico das
        páginas de configuração e o outro é desta tela específica.

        "Pausar convites" (141×40, texto `--control-critical-secondary-text`
        `#f87e7a` sobre fundo `--control-critical-secondary-background`,
        `variante="critico-secundario"` do `Button`) mede certo no print, mas
        a API não sabe suspender convite — fica visível e desabilitado com
        "(em breve)" (§6.6 do PROCESSO), em vez de desaparecer ou fingir.
        "Criar link de convite" (169×40, `variante="primario"`) é o limão no
        lugar do `#5865f2` do print, pela regra mecânica da ADR-0009. Gap de
        8 entre os dois (x 1214→1223 no print).
      */}
      <div className="mb-4 mt-4 flex items-center justify-between gap-4">
        <h3 className="text-text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
          Links de convite ativos
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip rotulo="Pausar convites (em breve)">
            <span className="inline-flex">
              <Button variante="critico-secundario" tamanho="md" disabled>
                Pausar convites
              </Button>
            </span>
          </Tooltip>
          <Button
            variante="primario"
            tamanho="md"
            disabled={busy}
            onClick={() => void create()}
            className="celular:h-[44px]"
          >
            {busy ? "Criando…" : "Criar link de convite"}
          </Button>
        </div>
      </div>

      {/*
        A tabela do Discord, medida no print `100706` (660 de largura):
        colunas em 0 / 203 / 366 / 437 / 558 — aqui como proporção, para caber
        também no diálogo de 480. Sem a coluna "Cargos": convite não carrega
        cargo aqui. As ações (copiar, revogar) ocupam a última coluna e
        aparecem no hover — o Discord real pendura só a revogação **fora** da
        tabela (`.revokeInvite__1de14{inset-inline-end:-31px;position:absolute}`),
        o que só cabe porque a página dele tem margem livre à direita; aqui,
        reaproveitado dentro do modal de 480, isso vazaria ou cortaria, então
        a ação continua numa coluna própria — desvio deliberado, não "faltando".

        Cor: `.inviteSettingsInviteRow__1de14{color:var(--text-default)}` é a
        base de toda a linha — só `.user__1de14{color:var(--text-strong)}`
        destaca o nome de quem criou. Código, usos e "expira em" ficam em
        `text-text-default` (era `text-text-strong`, mais forte do que o
        Discord desenha); o nome do canal ficava em `text-text-muted` e o CSS
        mede `.discriminator__1de14{color:var(--text-default)}` — um degrau
        mais claro. Tamanho: `font-size:16px;line-height:20px` da linha é
        `text-text-md`, não o `text-base`/`text-sm` do Tailwind (que não é do
        vocabulário e tem entrelinha diferente). "Usos" ganha `font-mono`
        (`.uses__1de14{font-family:var(--font-code)}`), que já existia em
        código e no "expira em".
      */}
      {/* como as outras tabelas do servidor (Membros, Emoji, Banimentos, Sons):
          cinco colunas não cabem nos 358px do celular, então a tabela rola
          **por dentro** em vez de espremer. No desktop os 660 da coluna passam
          do piso e nada muda. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-text-md text-text-default">
          <colgroup>
            <col className="w-[31%]" />
            <col className="w-[25%]" />
            <col className="w-[11%]" />
            <col className="w-[18%]" />
            <col />
          </colgroup>
          <thead>
            <tr className="h-8 text-left font-semibold">
              <th scope="col" className="pr-2 font-semibold">
                Criado por
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Código do convite
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Usos
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Expira em
              </th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invites === null ? (
              <tr className="h-[62px] border-b border-border-subtle">
                <td colSpan={5} className="text-text-muted">
                  Carregando…
                </td>
              </tr>
            ) : invites.length === 0 ? (
              <tr className="h-[62px] border-b border-border-subtle">
                <td colSpan={5} className="text-text-muted">
                  Nenhum convite ativo.
                </td>
              </tr>
            ) : (
              invites.map((i) => (
                <tr key={i.code} className="group h-[62px] border-b border-border-subtle transition hover:bg-interactive-background-hover">
                  <td className="pr-2">
                    <span className="flex items-center gap-3">
                      {i.creator ? (
                        <Avatar user={i.creator} size="sm" surface="border-background-base-lower" />
                      ) : (
                        <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full bg-background-base-lowest" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-text-strong">
                          {i.creator ? displayNameOf(i.creator) : "Conta apagada"}
                        </span>
                        <span className="block truncate text-text-xs text-text-default">
                          {i.channelName ? `#${i.channelName}` : "—"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="pr-2">
                    <code className="select-text font-mono">{i.code}</code>
                  </td>
                  <td className="pr-2 font-mono">
                    {i.uses}
                    {i.maxUses ? `/${i.maxUses}` : ""}
                  </td>
                  <td className="pr-2">
                    {i.expiresAt ? (
                      <Contagem ate={i.expiresAt} agora={agora} />
                    ) : (
                      <span aria-label="Nunca expira" className="font-mono">
                        ∞
                      </span>
                    )}
                  </td>
                  <td>
                    {/* No celular não existe hover: sem `celular:opacity-100` o "copiar" e o
                        "revogar" ficavam invisíveis, e a lista de convites não tinha
                        nenhuma ação alcançável pelo dedo. */}
                    <span className="flex items-center justify-end gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 celular:opacity-100">
                      <BotaoDeIcone
                        rotulo={`Copiar ${i.code}`}
                        icone={<Copy size={16} />}
                        comFundo
                        onClick={() => void navigator.clipboard?.writeText(i.code)}
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                      <BotaoDeIcone
                        rotulo={`Revogar ${i.code}`}
                        icone={<Trash2 size={16} />}
                        comFundo
                        perigo
                        onClick={() => void revoke(i.code)}
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Erro na primeira carga: mesmo desenho de `EngajamentoTab.tsx`/`AcessoTab.tsx`/
 * `SessoesTab.tsx` (caixa `rounded-[4px] border border-border-subtle
 * bg-background-base-lowest`, `AlertTriangle` em `--status-warning`, botão
 * secundário com `RefreshCw`). Repetido aqui em vez de extraído porque as
 * três fontes vivem fora da lista deste cartão — mover para um lugar comum é
 * trabalho de outro cartão, não deste.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-text-sm text-text-muted">Não foi possível carregar os convites.</p>
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

/** Dois dígitos, como o relógio do Discord. */
function dd(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "12:15:59" ou "11:05:54:29" — o Discord esconde as unidades mais
 * significativas quando são zero: no print `100706` a mesma tabela mostra a
 * coluna "Expira em" com 3 segmentos numa linha ("12:15:59", sem dias) e 4
 * noutra ("11:05:54:29", com dias). "09:14:24" confirma que minutos:segundos
 * são o mínimo — nunca vira só ":24". Antes este componente sempre mostrava
 * os 4 segmentos (`00:10:45:02`), o que o print não tem.
 */
function Contagem({ ate, agora }: { ate: string; agora: number }) {
  const restante = Math.max(0, Math.floor((new Date(ate).getTime() - agora) / 1000));
  const dias = Math.floor(restante / 86_400);
  const horas = Math.floor((restante % 86_400) / 3600);
  const minutos = Math.floor((restante % 3600) / 60);
  const segundos = restante % 60;
  const unidades = [dias, horas, minutos, segundos];
  while (unidades.length > 2 && unidades[0] === 0) unidades.shift();
  return (
    <Tooltip rotulo={horaCompleta(ate)}>
      <time dateTime={ate} className="font-mono tabular-nums">
        {unidades.map(dd).join(":")}
      </time>
    </Tooltip>
  );
}
