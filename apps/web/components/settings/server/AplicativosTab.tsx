"use client";

import { useEffect, useState } from "react";
import {
  displayNameOf,
  permissionNames,
  PERMISSION_INFO,
  type AppInstalacao,
} from "@streamz/shared";
import { AlertTriangle, Bot, ChevronRight, RefreshCw } from "@/components/ui/icones";
import { EmBreve } from "@/components/ui/controls";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { Button } from "@/components/ui/primitivos";
import TagDeBot from "@/components/ui/TagDeBot";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Aba "Aplicativos": o que está instalado no servidor e o botão de tirar.
 * Lá ("Descobrir aplicativos") se instala, aqui se confere e se remove.
 *
 * `MANAGE_GUILD` esconde a aba (o registro em `ServerSettingsModal`) e a API
 * repete a checagem nas rotas: esconder é conforto, a permissão é a do servidor.
 *
 * As permissões do app são só leitura aqui: editar é mexer no cargo gerenciado
 * dele, na aba "Cargos", que já tem a trava de escalada de privilégio. Duas
 * telas escrevendo no mesmo cargo discordariam.
 *
 * Erro de carregamento (não 404) tem bloco próprio: sem ele a tela ficaria igual
 * ao estado vazio, que é outra coisa. 404 = rota do lote B ausente nesta
 * instância (`EmBreve`), também distinto de "nenhum aplicativo".
 * Visual das irmãs (`BanimentosTab`): lista de linhas em moldura única.
 */
export default function AplicativosTab({ guildId }: { guildId: string }) {
  /** `null` = ainda carregando; `[]` = carregou e não há nada (ou 404/erro). */
  const [apps, setApps] = useState<AppInstalacao[] | null>(null);
  /**
   * A rota `GET /guilds/:id/aplicativos` é do lote B da F4 e pode não existir
   * na API contra a qual esta tela está rodando. Quando ela responde 404, a
   * tela diz isso em vez de fingir que o servidor não tem aplicativo nenhum —
   * "vazio" e "a rota não existe" são coisas diferentes, e a segunda é um
   * defeito que ninguém veria se as duas desenhassem a mesma frase.
   */
  const [indisponivel, setIndisponivel] = useState(false);
  /** Falha diferente de 404 — estado próprio, para não ler como "vazio". */
  const [falhouCarregar, setFalhouCarregar] = useState(false);
  /** Só existe para o "Tentar de novo" poder refazer o efeito abaixo. */
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setFalhouCarregar(false);
    api
      .appsDoServidor(guildId)
      .then((lista) => {
        if (!vivo) return;
        setApps(lista);
        setIndisponivel(false);
      })
      .catch((e) => {
        if (!vivo) return;
        if (isApiError(e, 404)) {
          setIndisponivel(true);
          setApps([]);
        } else {
          setFalhouCarregar(true);
          ui.toast(errorMessage(e, "Não foi possível listar os aplicativos"), "error");
        }
      });
    return () => {
      vivo = false;
    };
  }, [guildId, tentativa]);

  async function remover(item: AppInstalacao) {
    const ok = await ui.confirm({
      title: `Remover ${item.app.name}`,
      message:
        "O aplicativo sai do servidor: o bot deixa a lista de membros, o cargo dele é apagado e " +
        "ele para de receber os eventos daqui. Para trazer de volta é preciso instalar de novo, " +
        "escolhendo as permissões outra vez.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removerApp(guildId, item.applicationId);
      setApps((lista) => lista?.filter((x) => x.id !== item.id) ?? null);
      ui.toast(`${item.app.name} foi removido do servidor`);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o aplicativo"), "error");
    }
  }

  return (
    <div>
      <TituloDaPagina
        titulo="Aplicativos"
        subtitulo="Os bots instalados neste servidor, o que cada um pode fazer e quem os trouxe."
      />

      {indisponivel && (
        <div className="mb-4">
          <EmBreve>A instalação de aplicativos ainda não está disponível nesta instância.</EmBreve>
        </div>
      )}

      {falhouCarregar && <BlocoDeErro tentar={() => setTentativa((t) => t + 1)} />}

      {!indisponivel && !falhouCarregar && (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
            Aplicativos — {apps?.length ?? 0}
          </p>
          <div className="flex min-h-0 flex-col rounded-xl border border-border-subtle bg-card-background-default p-2">
            {apps === null && <p className="p-2 text-sm text-text-muted">Carregando…</p>}
            {apps !== null && apps.length === 0 && (
              <p className="p-2 text-sm text-text-muted">
                Nenhum aplicativo instalado. Encontre um em “Descobrir aplicativos”.
              </p>
            )}
            {apps?.map((item) => (
              <LinhaDeApp key={item.id} item={item} aoRemover={() => void remover(item)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Uma instalação. No celular a ação desce para a largura toda (alvo de 44px).
 * As permissões ficam recolhidas atrás de uma contagem para não poluir a linha.
 */
function LinhaDeApp({ item, aoRemover }: { item: AppInstalacao; aoRemover: () => void }) {
  const concedidas = permissionNames(item.permissions);
  const [aberto, setAberto] = useState(false);
  const idLista = `permissoes-${item.id}`;
  return (
    <div className="mb-1 min-w-0 rounded-lg bg-background-mod-subtle p-2 last:mb-0">
      <div className="flex items-center gap-3 celular:flex-col celular:items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconeDoApp url={item.app.iconUrl} nome={item.app.name} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-text-strong">{item.app.name}</span>
              <TagDeBot />
            </div>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              Instalado por {displayNameOf(item.instaladoPor)} em {horaCompleta(item.createdAt)}
            </p>
          </div>
        </div>
        <Button
          variante="critico-secundario"
          tamanho="sm"
          onClick={aoRemover}
          aria-label={`Remover ${item.app.name} do servidor`}
          className="shrink-0 celular:h-[44px] celular:w-full"
        >
          Remover
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idLista}
        className="mt-1 flex items-center gap-1 rounded-md px-1 text-xs text-text-muted outline-none hover:text-text-default focus-visible:text-text-default celular:h-[44px]"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`transition-transform ${aberto ? "rotate-90" : ""}`}
        />
        {concedidas.length === 0
          ? "Sem permissões extras"
          : `${concedidas.length} ${concedidas.length === 1 ? "permissão concedida" : "permissões concedidas"}`}
      </button>
      {aberto && (
        <p id={idLista} className="px-1 pb-1 text-xs text-text-muted">
          {concedidas.length === 0
            ? "O bot só faz o que qualquer membro faria."
            : concedidas.map((nome) => PERMISSION_INFO[nome].label).join(", ")}
        </p>
      )}
    </div>
  );
}

/**
 * O ícone do aplicativo, 40px. Sem ícone entra a carinha de robô do acervo —
 * e não a inicial do nome, que é o que fazemos com servidor e pessoa: um app
 * sem ícone é a maioria dos apps, e uma coluna de letras soltas não diria que
 * aquilo ali é um bot. (40px em si não tem medida própria — ver
 * "nao_verificado".)
 */
function IconeDoApp({ url, nome }: { url: string | null; nome: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-input-background-default text-text-muted">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Bot size={22} role="img" aria-label={`${nome} não tem ícone`} />
      )}
    </span>
  );
}

/**
 * Erro persistente de carregamento (diferente de 404): o mesmo bloco
 * ícone+mensagem+"Tentar de novo" que `SegurancaTab.tsx`/`SessoesTab.tsx`
 * usam para a mesma falha (`rounded-[4px] border border-border-subtle
 * bg-background-base-lowest`, `AlertTriangle` em `--status-warning`, botão
 * secundário com `RefreshCw`). Repetido aqui, e não extraído, pelo mesmo
 * motivo que as outras cópias já registram: as fontes vivem em
 * `components/settings/*.tsx`, fora da lista de arquivos deste cartão.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar os aplicativos.</p>
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
