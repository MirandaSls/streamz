"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Browser,
  Laptop,
  LogOut,
  Monitor,
  RefreshCw,
  Smartphone,
  X,
  type Icone,
} from "@/components/ui/icones";
import { classificarDispositivo, type SessaoView, type TipoDeDispositivo } from "@streamz/shared";
import { EmBreve, Section } from "@/components/ui/controls";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { useT } from "@/lib/i18n";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Dispositivos: as sessões (refresh tokens) ativas.
 *
 * "Dispositivo atual" isolado no topo (não se pode encerrar por engano — ele
 * não ganha X) e "Outros dispositivos" com ícone, SO, local e o X, como pede o
 * cartão. Os dois usam a mesma linha (`LinhaDeSessao`); a caixa própria que a
 * versão anterior desenhava em volta do dispositivo atual (`rounded-[6px]
 * border … bg-background-base-lowest`) não tinha origem — nenhum print ou CSS
 * desta leva isola um cartão ali — e caiu: quem distingue as duas seções agora
 * é só o título do `Section`, como em toda outra aba (`SegurancaTab.tsx`).
 *
 * O X por linha é `BotaoDeIcone` `tamanho="sm"` `tom="perigo"`: a caixa 24px e
 * o glifo 20px vêm da família `.hoverBarButton_f84418` já medida no cabeçalho
 * de `primitivos/BotaoDeIcone.tsx` (item 2) — a mesma caixa que
 * `AcaoDoCartao`, em `chat/MessagePreview.tsx`, usa para "desafixar"/"marcar
 * como lida". Substitui o botão "Encerrar" de largura variável da versão
 * anterior, que não tinha par nem no cartão nem em nenhuma referência. No
 * celular, 24px fica abaixo do alvo de toque de 44 — em vez de inventar uma
 * caixa maior sem medida, o alvo cresce por um pseudo-elemento invisível
 * (`celular:before:-inset-[10px]`, 24 + 2×10 = 44), o mesmo truque já usado em
 * `FriendRow.tsx` e `ContaTab.tsx` para não estourar um botão pequeno.
 * "Sair de todos os dispositivos conhecidos" continua um botão de largura
 * inteira: é a ação de "desconfiei de invasão", que se procura sem precisar
 * mirar.
 *
 * Estados (cartão 6j): **carregando** — esqueleto por linha (mesma proporção
 * de `SegurancaTab.tsx`), nas duas seções, para o título não pular quando os
 * dados chegam. **erro** (falha diferente de 404) — antes virava uma mentira
 * silenciosa: `sessoes` ia a `null` e a tela mostrava "nenhuma outra sessão
 * ativa", que é o texto do estado **vazio**, não do erro. Agora um bloco
 * próprio (`BlocoDeErro`, o par ícone+mensagem+"Tentar de novo" que
 * `SegurancaTab.tsx` já usa) substitui as duas seções até a próxima tentativa.
 * 404 continua a aba "não implementada ainda" (`EmBreve`, §6.6 do PROCESSO —
 * a API não expõe a lista, o controle não inventa dado). **Vazio**: "Nenhuma
 * outra sessão ativa" quando `outras` está de fato vazio (não em erro, não
 * carregando). **Sem permissão** não existe aqui: `/me/sessions` só responde
 * pelo dono do token, sem papel nem ownership para negar — a mesma leitura
 * que o cabeçalho de `SegurancaTab.tsx` já registra para `/me/*`.
 * **Hover/foco/desabilitado** vêm de graça de `Button` e `BotaoDeIcone`.
 */
export default function SessoesTab() {
  const t = useT();
  const [sessoes, setSessoes] = useState<SessaoView[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [falhouCarregar, setFalhouCarregar] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setFalhouCarregar(false);
    try {
      setSessoes(await api.sessions());
      setIndisponivel(false);
    } catch (e) {
      if (isApiError(e, 404)) {
        setIndisponivel(true);
      } else {
        setFalhouCarregar(true);
        ui.toast(errorMessage(e, "Não foi possível carregar suas sessões"), "error");
      }
      setSessoes(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function encerrar(id: string) {
    try {
      await api.revokeSession(id);
      setSessoes((atuais) => atuais?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar a sessão"), "error");
    }
  }

  async function encerrarTodas() {
    const ok = await ui.confirm({
      title: t("sessoes.encerrarTudo"),
      message: "Todos os outros aparelhos vão precisar entrar de novo.",
      confirmLabel: t("sessoes.encerrar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.revokeOtherSessions();
      setSessoes((atuais) => atuais?.filter((s) => s.current) ?? null);
      ui.toast("Outras sessões encerradas.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar as sessões"), "error");
    }
  }

  if (indisponivel) {
    return <EmBreve>{t("sessoes.indisponivel")}</EmBreve>;
  }

  if (carregando) {
    return (
      <>
        <p className="mb-4 text-sm text-text-muted">{t("sessoes.intro")}</p>
        <Section title={t("sessoes.atual")}>
          <LinhaDeEsqueleto />
        </Section>
        <Section title="Outros dispositivos" semDivisoria>
          <LinhaDeEsqueleto comBorda />
          <LinhaDeEsqueleto />
        </Section>
      </>
    );
  }

  if (falhouCarregar) {
    return (
      <>
        <p className="mb-4 text-sm text-text-muted">{t("sessoes.intro")}</p>
        <BlocoDeErro tentar={() => void carregar()} />
      </>
    );
  }

  const atual = (sessoes ?? []).find((s) => s.current) ?? null;
  const outras = (sessoes ?? []).filter((s) => !s.current);

  return (
    <>
      <p className="mb-4 text-sm text-text-muted">{t("sessoes.intro")}</p>

      {atual && (
        <Section title={t("sessoes.atual")}>
          <LinhaDeSessao sessao={atual} />
        </Section>
      )}

      <Section title="Outros dispositivos" semDivisoria>
        {outras.length === 0 ? (
          <p className="py-1 text-sm text-text-muted">{t("sessoes.vazio")}</p>
        ) : (
          <>
            {outras.map((sessao) => (
              <LinhaDeSessao
                key={sessao.id}
                sessao={sessao}
                comBorda
                acao={(rotuloDispositivo) => (
                  <BotaoDeIcone
                    rotulo={`${t("sessoes.encerrar")} — ${rotuloDispositivo}`}
                    icone={<X size={20} aria-hidden="true" />}
                    tamanho="sm"
                    tom="perigo"
                    fundo="hover"
                    onClick={() => void encerrar(sessao.id)}
                    className="relative shrink-0 celular:before:absolute celular:before:-inset-[10px] celular:before:content-['']"
                  />
                )}
              />
            ))}

            <Button
              variante="critico"
              tamanho="md"
              larguraTotal
              icone={<LogOut size={16} aria-hidden="true" />}
              onClick={() => void encerrarTodas()}
              className="mt-5 celular:h-[44px]"
            >
              {t("sessoes.encerrarTudo")}
            </Button>
          </>
        )}
      </Section>
    </>
  );
}

/**
 * Um ícone por tipo de dispositivo — o rótulo diz qual é, e o ícone tem que
 * concordar com ele de longe.
 *
 * Os três foram escolhidos **renderizados**, e não pelo nome: `AppWindow`, o
 * palpite óbvio para "navegador", é uma grade 2×2 de aplicativos; e o `Laptop`
 * do acervo é um monitor levemente mais largo que o `Monitor` — lado a lado,
 * as duas linhas ficavam iguais. Sobrou o `Browser` do Phosphor, que é uma
 * janela com barra de endereço e se distingue do monitor a 20px.
 */
const ICONE: Record<TipoDeDispositivo, Icone> = {
  desktop: Monitor,
  navegador: Browser,
  celular: Smartphone,
  desconhecido: Laptop,
};

/**
 * Ícone + aparelho + quando começou, mais uma `acao` opcional à direita (o X
 * de "Outros dispositivos"). Compartilhada pelas duas seções — o dispositivo
 * atual e cada linha de `outras` só diferem por `comBorda`/`acao`, nunca por
 * caixa ou tipografia.
 */
function LinhaDeSessao({
  sessao,
  comBorda = false,
  acao,
}: {
  sessao: SessaoView;
  /** divisória entre linhas, como as demais listas de configurações (`last:` tira a de baixo). */
  comBorda?: boolean;
  /** recebe o rótulo já resolvido do dispositivo, para nomear o X sem recalcular `classificarDispositivo`. */
  acao?: (rotuloDispositivo: string) => ReactNode;
}) {
  const t = useT();
  const dispositivo = classificarDispositivo({
    userAgent: sessao.userAgent,
    tipoSalvo: sessao.dispositivo,
  });
  const Icone = ICONE[dispositivo.tipo];
  return (
    <div
      className={`flex items-center gap-3 py-3 ${
        comBorda ? "border-b border-border-subtle last:border-b-0" : ""
      }`}
    >
      <Icone size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-strong">{dispositivo.rotulo}</p>
        <p className="truncate text-xs text-text-muted">
          {sessao.ip ? `${sessao.ip} · ` : ""}
          {t("sessoes.desde")} {dataCurta(sessao.createdAt)} · {t("sessoes.expira")}{" "}
          {dataCurta(sessao.expiresAt)}
        </p>
      </div>
      {acao?.(dispositivo.rotulo)}
    </div>
  );
}

/**
 * Esqueleto de uma linha enquanto a lista ainda não chegou. Mesma proporção
 * de barras (`h-3.5`/`h-3` sobre `bg-background-base-lowest`) da
 * `LinhaDeEsqueleto` de `SegurancaTab.tsx`; um círculo de 20px a mais porque
 * aqui toda linha carrega o ícone do tipo de dispositivo.
 */
function LinhaDeEsqueleto({ comBorda = false }: { comBorda?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-3 py-3 ${comBorda ? "border-b border-border-subtle" : ""}`}
    >
      <span className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-background-base-lowest" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3.5 w-32 animate-pulse rounded bg-background-base-lowest" />
        <span className="h-3 w-48 animate-pulse rounded bg-background-base-lowest" />
      </div>
    </div>
  );
}

/**
 * Erro persistente de carregamento (não 404): substitui as duas seções por
 * um bloco só, na mesma caixa de `EmBreve` (`rounded-[4px] border
 * border-border-subtle bg-background-base-lowest`), com o par
 * ícone+mensagem+"Tentar de novo" que `SegurancaTab.tsx` já usa para o mesmo
 * tipo de falha. Sem isto a tela caía num `sessoes: null` que se parecia com
 * "nenhuma outra sessão ativa" — o defeito que este cartão veio fechar.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar seus dispositivos.</p>
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

function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString();
}
