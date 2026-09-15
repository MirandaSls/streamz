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
import Avatar from "@/components/ui/Avatar";
import { Button, Tooltip } from "@/components/ui/primitivos";
import TagDeBot from "@/components/ui/TagDeBot";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * ── j-bots ── Aba "Aplicativos" das configurações do servidor: o que está
 * instalado aqui, com o que cada um pode fazer, e o botão de tirar.
 *
 * É a contrapartida de "Descobrir aplicativos" (lote B): lá se instala, aqui se
 * confere e se remove. Sem esta tela, um app instalado por outro moderador só
 * apareceria como um membro a mais na lista, e a única pista de que ele tem
 * `MANAGE_MESSAGES` seria abrir a aba de cargos e reconhecer o cargo gerenciado
 * pelo nome.
 *
 * `MANAGE_GUILD` esconde a aba inteira (o registro em `ServerSettingsModal` é
 * quem faz isso) **e** a API repete a checagem nas três rotas — a mesma dobra
 * das outras abas: esconder é conforto, a permissão de verdade é a do servidor.
 *
 * **As permissões aqui são leitura, não edição.** Mudar o que o app pode fazer
 * é mexer no cargo gerenciado dele, e isso tem um lugar: a aba "Cargos", que já
 * sabe fazer a trava de escalada de privilégio (`servidor-cargo-do-app.png` do
 * acervo confirma: o Discord edita a permissão do app pelo **cargo** dele em
 * Server Settings → Roles, não por aqui). Duas telas escrevendo no mesmo cargo
 * seriam duas chances de discordarem.
 *
 * ## Redesenho (cartão 6u-aplicativos-servidor)
 *
 * **Referência.** Não há print 1:1 do usuário desta tela (não está em
 * `docs/Reference/*.png` da raiz) e o CSS bruto capturado (303+850 arquivos)
 * também não tem a classe deste componente — busca por
 * `application`/`integration`/`botCard`/`installedApp` em
 * `docs/referencias-discord/tokens/css-bruto/**` não achou nada. A referência
 * que existe é de catálogo (dois lotes iguais, mesma captura de fev/2024):
 * `docs/Reference/apps/servidor-integracoes-bots-e-apps.png` e
 * `.../referencias-discord/suporte/imagens/apps-activities/…/26.png` — Server
 * Settings → Integrations, seção **"Bots and Apps"**, um cartão por app
 * (ícone, nome, "Added on … by …", dois ícones pequenos e **"Manage ›"** à
 * direita, sem "Remove" visível na linha — mora dentro do "Manage"). O
 * `MEDIDAS.md` do próprio acervo (`docs/Reference/apps/MEDIDAS.md` §10) já
 * registra que esse recorte é pequeno demais para ter uma âncora de tamanho
 * confiável: **"servem de referência de layout e texto"**, nunca de px
 * (ADR-0009 §7, autoridade 3). Por isso esta passada usa a imagem só para
 * três decisões de forma — cartão por app com borda (não lista com divisória),
 * ordem ícone→nome→ação, e o rótulo "Gerenciar" — e nenhuma medida em px sai
 * dela.
 *
 * **A caixa do cartão não tinha origem.** Antes era `rounded-lg p-3`
 * (raio 8, chute da migração da onda 0 — não há CSS nem print que sustente
 * 8 em vez de outro raio). Sem medida própria para "cartão de app/bot", a
 * caixa passa a reaproveitar a única medida real que existe em Configurações
 * para "caixa com borda sobre `background-base-lowest`": o par
 * ícone+mensagem+"Tentar de novo" de `SegurancaTab.tsx`/`SessoesTab.tsx`
 * (`rounded-[4px] border border-border-subtle bg-background-base-lowest`),
 * hoje repetido por `EngajamentoTab.tsx`/`AcessoTab.tsx` pelo mesmo motivo —
 * a fonte vive fora da lista de cada cartão. Reaproveitar um raio medido é
 * melhor que inventar um novo; o raio exato do cartão de app do Discord
 * continua **não medido** (ver "nao_verificado").
 *
 * **O botão que faltava.** "Gerenciar" existe no Discord e não no Streamz: lá
 * abre uma página cheia (canais, sincronização, desinstalar); aqui as
 * permissões já são só leitura (ver acima) e ficam na aba "Cargos". Por §6.6
 * do PROCESSO, o controle **fica visível e desabilitado**, com a dica "(em
 * breve)" — mesmo padrão de `CargosTab.tsx` ("Precisando de ajuda com as
 * permissões?"): `Tooltip` (`rotulo`) por fora, `<span className="inline-flex">`
 * por dentro, porque um `<button disabled>` não dispara `pointerenter`/hover
 * e a dica nunca abriria. O "Remover" que já existia (a única ação real desta
 * tela) continua funcionando, à esquerda do "Gerenciar" — a ordem "real,
 * depois futuro" evita que o botão cinza pareça a ação principal.
 *
 * **Estados** (cartão pede vazio/carregando/erro/sem permissão/hover/foco/
 * desabilitado):
 * - **carregando** — "Carregando…" enquanto `apps` é `null`.
 * - **vazio** — "Nenhum aplicativo instalado." quando a lista volta vazia de
 *   verdade (sem rota ausente, sem erro).
 * - **erro** (falha diferente de 404) — antes virava uma mentira silenciosa:
 *   só o toast, e a tela ficava exatamente com o texto do estado **vazio**,
 *   que é outra coisa — o mesmo defeito que `SessoesTab.tsx` fechou para as
 *   sessões e `EngajamentoTab.tsx`/`AcessoTab.tsx` fecharam para as deles.
 *   Agora um `BlocoDeErro` (o mesmo ícone+mensagem+"Tentar de novo" de lá)
 *   substitui a lista até a próxima tentativa; o toast continua, para quem
 *   não está com o olho na aba no instante da falha.
 * - **rota ausente** (404, lote B ainda não existe nesta instância) —
 *   `EmBreve` (`components/ui/controls.tsx`), a mesma caixa "isto ainda não
 *   existe" que `SessoesTab.tsx` usa para `/me/sessions`; troca o parágrafo
 *   próprio de antes, que reconstruía a mesma caixa com raio e padding sem
 *   origem (8/12 em vez do 4/8-12 medido).
 * - **sem permissão** — não existe dentro desta página: `ServerSettingsModal`
 *   só lista "Aplicativos" no menu de quem tem `MANAGE_GUILD` (a API repete a
 *   checagem nas três rotas, acima), então quem abre esta aba sempre pode ver
 *   e remover. É o padrão que `EngajamentoTab.tsx`/`AcessoTab.tsx`/
 *   `SoundboardTab.tsx` citam como "mesmo padrão de `AplicativosTab.tsx`".
 * - **hover/foco** — do `Button`/`Tooltip` dos primitivos; nenhum estilo
 *   próprio nesta peça.
 * - **desabilitado** — o novo "Gerenciar (em breve)": `disabled:opacity-50
 *   disabled:pointer-events-none` já é a base de todo `Button` (cabeçalho do
 *   primitivo), sem classe extra aqui.
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

      {apps === null && !falhouCarregar && (
        <p className="text-sm text-text-muted">Carregando…</p>
      )}

      {apps !== null && !falhouCarregar && apps.length === 0 && !indisponivel && (
        <p className="text-sm text-text-muted">
          Nenhum aplicativo instalado. Encontre um em “Descobrir aplicativos” e adicione-o aqui.
        </p>
      )}

      {apps !== null && !falhouCarregar && apps.length > 0 && (
        <ul className="flex flex-col gap-2">
          {apps.map((item) => (
            <LinhaDeApp key={item.id} item={item} aoRemover={() => void remover(item)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Uma instalação na lista.
 *
 * No celular a linha vira coluna (`celular:` no `flex-col`): em 358px de largura
 * útil, o nome do app, quem instalou e os botões lado a lado deixavam o nome
 * com 90px e truncando no terceiro caractere. Empilhado, cada um tem a linha
 * inteira, e os botões ficam com os 44px de alvo que o dedo precisa.
 */
function LinhaDeApp({ item, aoRemover }: { item: AppInstalacao; aoRemover: () => void }) {
  const concedidas = permissionNames(item.permissions);
  return (
    // Raio e borda: ver "Redesenho" no cabeçalho — reaproveita o
    // `rounded-[4px] border border-border-subtle bg-background-base-lowest`
    // medido para caixa de aviso em Configurações; não há medida própria
    // para cartão de app/bot no acervo.
    <li className="rounded-[4px] border border-border-subtle bg-background-base-lowest p-3">
      <div className="flex items-start gap-3 celular:flex-col">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconeDoApp url={item.app.iconUrl} nome={item.app.name} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-text-strong">{item.app.name}</span>
              <TagDeBot />
            </div>
            {item.app.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{item.app.description}</p>
            )}
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
              <Avatar user={item.instaladoPor} size="xs" surface="border-background-base-lowest" />
              <span className="truncate">
                Instalado por {displayNameOf(item.instaladoPor)} em{" "}
                {horaCompleta(item.createdAt)}
              </span>
            </p>
          </div>
        </div>

        {/* "Remover" (real) antes de "Gerenciar" (em breve): o botão cinza
            desabilitado não deve ler como a ação principal da linha. */}
        <div className="flex shrink-0 items-center gap-2 celular:w-full celular:flex-col">
          <Button
            variante="critico-secundario"
            tamanho="sm"
            onClick={aoRemover}
            aria-label={`Remover ${item.app.name} do servidor`}
            className="celular:h-[44px] celular:w-full"
          >
            Remover
          </Button>

          {/* O Discord tem "Manage ›" aqui (abre canais, sincronização,
              desinstalar — página cheia que o Streamz não tem; permissão já
              é só leitura nesta aba, ver cabeçalho). Fica visível e
              desabilitado com a dica "(em breve)" (§6.6 do PROCESSO), mesmo
              padrão de `CargosTab.tsx`: o `<span>` recebe o ponteiro porque
              um `<button disabled>` não dispara hover. */}
          <Tooltip rotulo={`Gerenciar ${item.app.name} (em breve)`}>
            <span className="inline-flex celular:w-full">
              <Button
                variante="neutro"
                tamanho="sm"
                iconeDireita={<ChevronRight size={16} aria-hidden="true" />}
                disabled
                aria-label={`Gerenciar ${item.app.name} (em breve)`}
                className="celular:h-[44px] celular:w-full"
              >
                Gerenciar
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
          Permissões concedidas
        </p>
        {concedidas.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nenhuma. O bot só faz o que qualquer membro faria.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {concedidas.map((nome) => (
              <li key={nome}>
                <Tooltip rotulo={PERMISSION_INFO[nome].description}>
                  <span className="rounded-[3px] bg-input-background-default px-1.5 py-0.5 text-xs text-text-default">
                    {PERMISSION_INFO[nome].label}
                  </span>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
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
