"use client";

import { useEffect } from "react";
import AdicionarAoServidor from "@/components/apps/AdicionarAoServidor";
import CardDeApp, { CardDeAppEsqueleto } from "@/components/apps/CardDeApp";
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
 * ## A página, medida
 *
 * A coluna de conteúdo tem **1024** de teto — é o
 * `--custom-application-directory-content-max-width:1024px` do CSS do cliente
 * (`css-bruto/419070.51520158c0dc856e.css`), o mesmo número que a captura
 * `docs/Reference/apps/diretorio-grade.png` mostra (4 cards de 244 + 3 vãos de
 * 16 = 2048 px @2x).
 *
 * A ordem dos blocos é a de `diretorio-home-topo.png`: **título grande →
 * busca de largura cheia → conteúdo**. Antes a busca vinha sozinha no topo e a
 * página começava sem dizer o que era; o cabeçalho de 49 diz o nome da tela
 * (chrome da coluna 3), e a manchete diz para que ela serve — é a mesma
 * divisão do Discord, que tem "App Directory" na barra e "CUSTOMIZE YOUR
 * SERVER WITH APPS" na página. Manchete em `font-headline font-extrabold`
 * (o ABC Ginto Nord de lá, ver `design.md`), caixa-alta como na captura.
 *
 * A grade tem 4 colunas de 244 com 16 de intervalo dentro de 1024 (medido em
 * `docs/Reference/apps/diretorio-grade.png`; ver `CardDeApp`). Aqui ela é
 * `auto-fill` em vez de `repeat(4, …)`: a coluna 3 do Streamz não tem 1024 px
 * fixos — ela é o que sobra depois do rail, da coluna de canais e da lista de
 * membros —, então travar em quatro deixaria um vão à direita em telas largas e
 * cortaria o quarto card em telas estreitas. O passo continua 244+16, e agora o
 * card **preenche** a trilha (ver §3 do cabeçalho de `CardDeApp`): com largura
 * fixa dentro de uma trilha `1fr`, sobrava um vão irregular dentro de cada
 * célula. O cliente atual faz a mesma conta com outro mínimo
 * (`repeat(auto-fit,minmax(230px,1fr))`, `.contentContainer__5a4b6` em
 * `sob-demanda/0e2df4ee2650d74f.css`); ficamos com os 244 da captura, que é a
 * medida que o resto do card já seguia.
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

  // a primeira leva ainda não chegou — a mesma condição de antes, que agora
  // escolhe entre o esqueleto e o estado vazio em vez de escrever um texto
  const primeiraCarga = carregando || !carregado;

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
            <div className="mx-auto w-full max-w-[1024px] px-6 pb-10 pt-6 celular:px-4">
              <Manchete semCabecalho={semCabecalho} />
              <CampoDeBusca valor={busca} aoMudar={definirBusca} />

              {itens.length === 0 ? (
                primeiraCarga ? (
                  <GradeDeEsqueletos />
                ) : (
                  <EstadoVazio busca={busca.trim()} />
                )
              ) : (
                <div className={GRADE}>
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
 * A grade, numa constante só porque o esqueleto precisa **da mesma**: uma
 * grade de carregamento com outro passo faz os cards pularem de lugar quando
 * os dados chegam.
 *
 * 244 de card e 16 de intervalo, medidos. `auto-fill` em vez de quatro colunas
 * fixas — ver o cabeçalho do arquivo. No celular o card ocupa a largura toda:
 * 244 numa tela de 390 deixaria 100px de vão e uma coluna só de qualquer jeito.
 */
const GRADE =
  "grid grid-cols-[repeat(auto-fill,minmax(244px,1fr))] gap-[16px] celular:grid-cols-1";

/**
 * A manchete da página, com o subtítulo que diz o que é este catálogo.
 *
 * O nível do título depende de quem desenhou a barra de cima: no desktop o
 * `<h1>` é o do cabeçalho de 49 e este vira `<h2>`; no celular o
 * `CabecalhoMobile` escreve o título em `<span>` (é chrome, não conteúdo), e
 * então o `<h1>` da tela é este. Sem isso a tela do celular ficaria sem `h1`
 * nenhum, e a do desktop teria dois.
 */
function Manchete({ semCabecalho }: { semCabecalho: boolean }) {
  // `<h1>`/`<h2>` escritos por extenso, e não uma tag em variável: a união de
  // dois nomes de elemento em JSX passa a depender de como o TS resolve as
  // props de cada um, e este arquivo não vale esse risco por duas linhas.
  const classe =
    "font-headline text-heading-xl font-extrabold uppercase text-text-strong celular:text-heading-lg";
  const texto = "Personalize seu servidor com aplicativos";
  return (
    <div className="mb-6 celular:mb-5">
      {semCabecalho ? (
        <h1 className={classe}>{texto}</h1>
      ) : (
        <h2 className={classe}>{texto}</h2>
      )}
      <p className="mt-2 max-w-[600px] text-text-md text-text-subtle celular:text-text-sm">
        Os aplicativos publicados nesta instância. Abra um para ver o que ele faz
        antes de adicioná-lo a um servidor seu.
      </p>
    </div>
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
 *
 * Fica **depois** da manchete, como na captura da home do diretório. O ícone é
 * o de 20 do `.searchBar` do cliente (era 18, que num campo de 40 lia como
 * miniatura).
 */
function CampoDeBusca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <TextInput
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      type="search"
      placeholder="Buscar aplicativos"
      aria-label="Buscar aplicativos"
      prefixo={<Search size={20} aria-hidden="true" className="shrink-0 text-text-muted" />}
      classeDaCaixa="mb-6"
    />
  );
}

/**
 * O que ocupa a grade enquanto a primeira página não chegou.
 *
 * Seis cartões, que é o que cabe numa coluna 3 de tamanho comum sem inventar
 * uma segunda tela de rolagem. Eram as duas palavras "Carregando aplicativos…"
 * centralizadas num vão vazio; o esqueleto mostra onde o conteúdo vai cair, e
 * é o mesmo recurso que o resto do app já usa (`FriendRow`, `DMProfilePanel`).
 *
 * O texto não sumiu: virou o `role="status"` invisível, que é o que o leitor
 * de tela anuncia. Cartão falso não é conteúdo, e por isso é `aria-hidden`
 * lá dentro.
 */
function GradeDeEsqueletos() {
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        Carregando aplicativos…
      </p>
      <div className={GRADE}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <CardDeAppEsqueleto key={i} />
        ))}
      </div>
    </>
  );
}

/**
 * Nenhum aplicativo: ou a busca não achou, ou a instância ainda não publicou
 * nada. São dois becos diferentes e o texto de saída de cada um é outro — a
 * regra de "Estados a nunca esquecer" do `design.md` é que o vazio explique o
 * **próximo passo**.
 *
 * A moldura tracejada é a do espaço vazio do próprio Discord
 * (`.widgetContainer__0ea1a.subtle__0ea1a{background:var(--background-mod-muted);
 * border:1px dashed var(--border-subtle)}`, `sob-demanda/867336.*.css`), e não
 * um desenho novo. A ilustração do gato-robô que o Discord põe aqui
 * (`diretorio-busca.png`) não está no acervo; no lugar dela, o glifo `Apps`
 * num disco — o mesmo ícone da barra de cima, que é o que amarra a tela.
 */
function EstadoVazio({ busca }: { busca: string }) {
  const procurando = busca.length > 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-[8px] border border-dashed border-border-subtle bg-background-mod-muted px-6 py-12 text-center">
      <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-background-surface-high text-text-muted">
        <Apps size={28} aria-hidden="true" />
      </span>
      <p className="text-text-md font-semibold text-text-strong">
        {procurando
          ? `Nenhum aplicativo para “${busca}”`
          : "Nenhum aplicativo publicado ainda"}
      </p>
      <p className="max-w-[420px] text-text-sm text-text-subtle">
        {procurando
          ? "Confira a escrita ou procure por outra palavra."
          : "Quando alguém publicar um aplicativo nesta instância, ele aparece nesta grade."}
      </p>
    </div>
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
