"use client";

import { useEffect } from "react";
import AdicionarAoServidor from "@/components/apps/AdicionarAoServidor";
import CardDeApp from "@/components/apps/CardDeApp";
import PaginaDeApp from "@/components/apps/PaginaDeApp";
import { CabecalhoMobile } from "@/components/mobile/pecas";
import { Apps, Search } from "@/components/ui/icones";
import { Button, TextInput } from "@/components/ui/primitivos";
import { useAplicativos } from "@/stores/aplicativos";

/**
 * "Descobrir aplicativos" — a grade, a busca e a página de um app.
 *
 * ── j-bots · F4, lote B ──
 *
 * É **um componente só**, parametrizado por `semCabecalho`, e não uma versão
 * de desktop e outra de celular: é o padrão que o PR #170 fixou
 * (`GuildRail({ compacto })`, `InboxPopover modoTela`). No celular quem desenha
 * a barra de cima é a `TelaDeAplicativos`, com o `CabecalhoMobile` de 56 e a
 * seta de voltar; no desktop o cabeçalho é este daqui.
 *
 * **Vista própria, não uma aba da descoberta de servidores.** O "Descobrir
 * servidores" foi removido de propósito — este é um produto onde se entra por
 * convite (o comentário está no `GuildRail.tsx`) — e continua removido.
 * Aplicativos são outra coisa: um catálogo do que roda **nesta** instância.
 *
 * A grade tem 4 colunas de 244 com 16 de intervalo dentro de 1024 (medido em
 * `docs/Reference/apps/diretorio-grade.png`; ver `CardDeApp`). Aqui ela é
 * `auto-fill` em vez de `repeat(4, …)`: a coluna 3 do Streamz não tem 1024 px
 * fixos — ela é o que sobra depois do rail, da coluna de canais e da lista de
 * membros —, então travar em quatro deixaria um vão à direita em telas largas e
 * cortaria o quarto card em telas estreitas. O passo continua 244+16.
 */
export default function DiretorioDeApps({ semCabecalho = false }: { semCabecalho?: boolean }) {
  const itens = useAplicativos((s) => s.itens);
  const busca = useAplicativos((s) => s.busca);
  const carregando = useAplicativos((s) => s.carregando);
  const carregado = useAplicativos((s) => s.carregado);
  const proximoCursor = useAplicativos((s) => s.proximoCursor);
  const selecionado = useAplicativos((s) => s.selecionado);
  const instalando = useAplicativos((s) => s.instalando);
  const definirBusca = useAplicativos((s) => s.definirBusca);
  const carregar = useAplicativos((s) => s.carregar);
  const carregarMais = useAplicativos((s) => s.carregarMais);
  const abrirApp = useAplicativos((s) => s.abrirApp);
  const abrirInstalacao = useAplicativos((s) => s.abrirInstalacao);

  // a carga também acontece no `abrir()` da store; esta é a rede de segurança
  // de quem monta a tela por outro caminho (o celular, a volta de uma página)
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background-base-lower">
      {selecionado ? (
        <PaginaDeApp app={selecionado} />
      ) : (
        <>
          {!semCabecalho && (
            <header className="flex h-[49px] shrink-0 items-center gap-2 border-b border-border-subtle px-4 shadow-elevation-low">
              <Apps size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
              <h1 className="text-base font-semibold text-text-strong">
                Descobrir aplicativos
              </h1>
            </header>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1024px] px-6 py-6 celular:px-4">
              <CampoDeBusca valor={busca} aoMudar={definirBusca} />

              {itens.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  {carregando || !carregado
                    ? "Carregando aplicativos…"
                    : busca.trim()
                      ? `Nenhum aplicativo para "${busca.trim()}".`
                      : "Ainda não há nenhum aplicativo publicado nesta instância."}
                </p>
              ) : (
                <div
                  /* 244 de card e 16 de intervalo, medidos. `auto-fill` em vez
                     de quatro colunas fixas — ver o cabeçalho do arquivo. No
                     celular o card ocupa a largura toda: 244 numa tela de 390
                     deixaria 100px de vão e uma coluna só de qualquer jeito. */
                  className="grid grid-cols-[repeat(auto-fill,minmax(244px,1fr))] gap-[16px] celular:grid-cols-1"
                >
                  {itens.map((app) => (
                    <CardDeApp
                      key={app.id}
                      app={app}
                      aoAbrir={() => abrirApp(app)}
                      aoAdicionar={() => abrirInstalacao(app)}
                    />
                  ))}
                </div>
              )}

              {proximoCursor && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variante="secundario"
                    tamanho="md"
                    onClick={() => void carregarMais()}
                    disabled={carregando}
                  >
                    {carregando ? "Carregando…" : "Ver mais"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/*
        O modal fica aqui dentro, e não em `ModalHost`: a pilha de `useUI` é do
        lote de ninguém nesta fase (`stores/ui.ts` e `ModalHost.tsx` não estão
        na lista do lote B), e "Adicionar ao servidor" não precisa dela — ele é
        sempre aberto de dentro desta tela e morre com ela. O `Dialog` já se
        põe num portal para o `body`, então o empilhamento e o `position: fixed`
        são os mesmos de qualquer outro modal do app.
      */}
      {instalando && <AdicionarAoServidor />}
    </main>
  );
}

/**
 * "Descobrir aplicativos" em tela cheia, no celular.
 *
 * O molde é a `TelaDeAmigos` (`components/mobile/telas-de-conversa.tsx`): a
 * tela devolve `CabecalhoMobile` + **o componente do desktop**, e não desenha a
 * moldura — quem a põe é a `TelaEmpilhada`, no `ShellMobile`. É o padrão do PR
 * #170: um componente só, parametrizado de fora; nada de uma "versão celular"
 * do diretório.
 *
 * Mora aqui, e não em `telas-de-conversa.tsx`, porque aquele arquivo não está
 * na lista do lote B — e porque o diretório não é uma conversa.
 *
 * A seta do cabeçalho tem **duas** funções, na ordem em que a pessoa as espera:
 * com a página de um app aberta, ela volta para a grade; na grade, ela sai da
 * tela. É a mesma camada que o "voltar" do Android desfaz — o `voltar()` da
 * store de pilha só é chamado quando já não há para onde voltar aqui dentro.
 */
export function TelaDeAplicativos({ aoSair }: { aoSair: () => void }) {
  const selecionado = useAplicativos((s) => s.selecionado);
  const voltarParaGrade = useAplicativos((s) => s.voltarParaGrade);
  const fechar = useAplicativos((s) => s.fechar);

  return (
    <>
      <CabecalhoMobile
        aoVoltar={() => {
          if (selecionado) {
            voltarParaGrade();
            return;
          }
          fechar();
          aoSair();
        }}
        icone={<Apps size={20} />}
        titulo={selecionado ? selecionado.name : "Descobrir aplicativos"}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {/* `semCabecalho`: quem desenha a barra de cima aqui é o
            `CabecalhoMobile` de 56 acima, e não o cabeçalho de 49 do desktop —
            dois cabeçalhos empilhados comeriam 105px de uma tela de 844 */}
        <DiretorioDeApps semCabecalho />
      </div>
    </>
  );
}

/**
 * A busca do topo.
 *
 * `652×51` medidos em `diretorio-busca.png`; aqui a largura é fluida (a coluna
 * não tem 1024 fixos) e a altura fica em 40, que é a do resto dos campos do
 * app — 51 é a medida de uma página web do Discord, não a do cliente, e um
 * campo de 51 no meio de campos de 40 chama atenção pelo motivo errado.
 * Registrado no PR.
 */
function CampoDeBusca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <TextInput
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      type="search"
      placeholder="Buscar aplicativos"
      aria-label="Buscar aplicativos"
      prefixo={<Search size={18} aria-hidden="true" className="shrink-0 text-text-muted" />}
      classeDaCaixa="mb-5"
    />
  );
}
