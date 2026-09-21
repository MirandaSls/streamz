"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MarcaLockup from "@/components/ui/MarcaLockup";
import { ChevronDown, ExternalLink, X } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { API_URL } from "@/lib/config";
import { Esquemas } from "@/components/desenvolvedores/Esquemas";
import { AvisoDeCarregamento, ErroDaReferencia, EsqueletoDaReferencia, ReferenciaVazia } from "@/components/desenvolvedores/Estados";
import { Guias } from "@/components/desenvolvedores/Guias";
import { Navegacao } from "@/components/desenvolvedores/Navegacao";
import { PrimeirosPassos } from "@/components/desenvolvedores/PrimeirosPassos";
import { GrupoDeRotas } from "@/components/desenvolvedores/Rota";
import { Secao } from "@/components/desenvolvedores/Secao";
import { Topo } from "@/components/desenvolvedores/Topo";
import { indexar, type DocumentoOpenAPI, type Indice } from "@/components/desenvolvedores/especificacao";

/**
 * Documentação da API de bots — a página para onde mandar quem quer escrever um
 * bot para o Streamz.
 *
 * A especificação é **OpenAPI 3.1 servida pela API** (`/api/v10/openapi.json`,
 * pública), e a página é um renderizador nosso: leiaute, tipografia e cor do
 * Streamz, com o painel de exemplo à direita que uma referência de verdade tem.
 * Nenhuma dependência nova entrou para isso — o destaque de sintaxe é o do
 * chat, o Markdown é um subconjunto próprio, e os controles são os primitivos.
 *
 * **O que não depende da rede:** o topo e o passo a passo de "Rode o seu
 * primeiro bot" — as duas coisas que respondem a pergunta que traz alguém aqui
 * ("meu bot do Discord roda nisso?") mesmo com a API fora do ar. Todo o resto
 * (conceitos, tabelas do gateway e de permissões, rotas, esquemas) vem do JSON
 * e **só** do JSON: uma segunda cópia desses textos na página envelheceria em
 * silêncio, porque nada quebra quando a documentação mente.
 *
 * **Client component, sem exceção.** A web é exportada como HTML estático para
 * o app desktop (`output: "export"`), então nada de server action, rota de API
 * do Next ou `next/image` — a especificação é buscada no navegador, depois de
 * montar.
 */

/** Onde a especificação mora. Público, sem token. */
const ENDERECO_DA_ESPECIFICACAO = `${API_URL}/api/v10/openapi.json`;

/** Servidor exibido enquanto (ou caso) a especificação não diga o dela. */
const SERVIDOR_PADRAO = `${API_URL}/api/v10`;

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; doc: DocumentoOpenAPI }
  | { tipo: "erro"; detalhe?: string };

export default function PaginaDeDesenvolvedores() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: "carregando" });
    fetch(ENDERECO_DA_ESPECIFICACAO, { headers: { Accept: "application/json" } })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(`a API respondeu ${resposta.status}`);
        return (await resposta.json()) as DocumentoOpenAPI;
      })
      .then((doc) => {
        if (vivo) setEstado({ tipo: "pronto", doc });
      })
      .catch((erro: unknown) => {
        if (vivo) setEstado({ tipo: "erro", detalhe: erro instanceof Error ? erro.message : undefined });
      });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const doc = estado.tipo === "pronto" ? estado.doc : null;
  const indice: Indice | null = useMemo(
    () => (doc ? indexar(doc, SERVIDOR_PADRAO) : null),
    [doc],
  );
  const servidor = indice?.servidor ?? SERVIDOR_PADRAO;

  const ancoraAtiva = useAncoraAtiva(indice);
  useAncoraDaUrl(indice);

  const fecharGaveta = useCallback(() => setGavetaAberta(false), []);

  // Esc fecha a gaveta — é o que todo painel sobreposto do app faz, e quem
  // abriu sem querer não deve precisar achar o "×" com o polegar.
  useEffect(() => {
    if (!gavetaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGavetaAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gavetaAberta]);

  return (
    <div className="min-h-[100dvh] bg-background-base-lowest text-text-default">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background-surface-high focus:px-4 focus:py-2 focus:text-text-strong focus:outline focus:outline-2 focus:outline-border-focus"
      >
        Pular para o conteúdo
      </a>

      <div className="sticky top-0 z-30 border-b border-border-subtle bg-background-base-lowest/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-6 celular:px-4">
          <Link
            href="/"
            aria-label="Streamz, início"
            className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <MarcaLockup size={20} className="text-text-strong" />
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-subtle" />
          <Link
            href="/desenvolvedores"
            className="shrink-0 text-text-sm font-semibold text-text-default hover:text-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            Desenvolvedores
          </Link>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setGavetaAberta((aberta) => !aberta)}
            aria-expanded={gavetaAberta}
            aria-controls="gaveta-de-navegacao"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-text-sm font-medium text-text-subtle hover:bg-interactive-background-hover hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus lg:hidden"
          >
            {gavetaAberta ? <X size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            Navegar
          </button>

          <Button href="/app?settings=aplicativos" variante="primario" tamanho="sm" className="shrink-0 celular:h-[44px]">
            Criar aplicativo
          </Button>
        </div>

        {/* Gaveta: no celular e no tablet a navegação vira um painel abaixo do
            cabeçalho. Não é um `Popout` porque não ancora em nada — ocupa a
            largura toda e rola por dentro. */}
        {gavetaAberta ? (
          <>
            <div
              aria-hidden="true"
              onClick={fecharGaveta}
              className="fixed bottom-0 left-0 right-0 top-16 z-10 bg-background-scrim lg:hidden"
            />
            <div
              id="gaveta-de-navegacao"
              className="relative z-20 max-h-[70dvh] overflow-hidden border-t border-border-subtle bg-background-base-lowest px-4 py-3 lg:hidden"
            >
              {/* altura explícita, não `max-h`: a navegação tem um cabeçalho
                  fixo (a busca) e uma lista que rola, e uma lista `flex-1`
                  dentro de um pai de altura automática não tem contra o que
                  calcular — a lista cresceria e o `overflow-hidden` do painel
                  cortaria o fim dela sem barra de rolagem nenhuma. */}
              <div className="flex h-[calc(70dvh-1.5rem)] flex-col">
                <Navegacao
                  indice={indice}
                  ancoraAtiva={ancoraAtiva}
                  aoNavegar={fecharGaveta}
                  instancia="gaveta"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <Topo servidor={servidor} versao={indice?.versao} />

      <div className="mx-auto flex max-w-[1600px] items-start gap-10 px-6 celular:px-4">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[280px] shrink-0 self-start py-6 lg:block">
          <Navegacao indice={indice} ancoraAtiva={ancoraAtiva} instancia="coluna" />
        </aside>

        <main id="conteudo" className="min-w-0 flex-1 pb-24 pt-10 celular:pt-8">
          <PrimeirosPassos servidor={servidor} />

          <Guias indice={indice} />

          <Secao ancora="referencia" titulo="Referência da API" className="pt-14 celular:pt-10">
            <p className="mt-3 max-w-[720px] text-text-md leading-relaxed text-text-subtle">
              Todas as rotas, com os parâmetros, o corpo e a resposta de cada uma. A base é{" "}
              <code className="break-all rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-sm text-text-code">
                {servidor}
              </code>
              , e toda chamada vai com{" "}
              <code className="rounded border border-border-normal bg-background-code px-1.5 py-0.5 font-mono text-text-sm text-text-code">
                Authorization: Bot &lt;token&gt;
              </code>{" "}
              — com a exceção das rotas de interação, que trazem a etiqueta{" "}
              <strong className="font-semibold text-text-default">sem Authorization</strong> e usam o token do
              próprio caminho.
            </p>
            {indice && indice.servidores.length > 1 ? (
              <ul className="mt-4 flex flex-col gap-1 text-text-sm text-text-muted">
                {indice.servidores.map((s) => (
                  <li key={s.url}>
                    <code className="font-mono text-text-code">{s.url}</code>
                    {s.description ? ` — ${s.description}` : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Secao>

          {estado.tipo === "carregando" ? (
            <div className="pt-10">
              <AvisoDeCarregamento />
              <EsqueletoDaReferencia />
            </div>
          ) : null}

          {estado.tipo === "erro" ? (
            <div className="pt-10">
              <ErroDaReferencia
                endereco={ENDERECO_DA_ESPECIFICACAO}
                detalhe={estado.detalhe}
                aoTentarDeNovo={() => setTentativa((n) => n + 1)}
              />
            </div>
          ) : null}

          {doc && indice ? (
            indice.totalDeRotas === 0 ? (
              <div className="pt-10">
                <ReferenciaVazia />
              </div>
            ) : (
              <>
                {indice.grupos.map((grupo) => (
                  <GrupoDeRotas key={grupo.id} doc={doc} servidor={servidor} grupo={grupo} />
                ))}
                <Esquemas doc={doc} esquemas={indice.esquemas} />
              </>
            )
          ) : null}
        </main>
      </div>

      <Rodape />
    </div>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-border-subtle px-6 py-10 celular:px-4">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 text-text-sm text-text-muted">
        <MarcaLockup size={16} className="text-text-subtle" />
        <Link href="/" className="hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
          Baixar o app
        </Link>
        <Link href="/app" className="hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
          Abrir no navegador
        </Link>
        <a
          href={ENDERECO_DA_ESPECIFICACAO}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          openapi.json
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Âncoras
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qual seção está sendo lida, para a navegação realçá-la.
 *
 * `IntersectionObserver`, e não um ouvinte de rolagem: com uma referência de
 * dezenas de rotas, medir todas as seções a cada quadro é trabalho por quadro
 * que o navegador já sabe fazer por nós, uma vez, fora da linha principal.
 *
 * A margem `-72px 0px -60%` recorta uma **faixa** logo abaixo do cabeçalho
 * fixo: vale a seção que está no topo da área de leitura, não a que ocupa mais
 * pixels (por essa conta um esquema de duas linhas nunca seria a ativa). Entre
 * as que cruzam a faixa, ganha a primeira na ordem do documento.
 */
function useAncoraAtiva(dependencia: unknown): string {
  const [ativa, setAtiva] = useState("");
  const visiveis = useRef<Set<string>>(new Set());

  useEffect(() => {
    const secoes = Array.from(document.querySelectorAll<HTMLElement>("[data-ancora]"));
    if (!secoes.length) return;
    visiveis.current = new Set();

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const ancora = (entrada.target as HTMLElement).dataset.ancora;
          if (!ancora) continue;
          if (entrada.isIntersecting) visiveis.current.add(ancora);
          else visiveis.current.delete(ancora);
        }
        const emOrdem = secoes
          .map((no) => no.dataset.ancora)
          .filter((ancora): ancora is string => !!ancora && visiveis.current.has(ancora));
        // nenhuma na faixa (rolagem rápida, fim da página): mantém a última —
        // apagar o realce pisca a navegação inteira sem ganho nenhum
        if (emOrdem.length) setAtiva(emOrdem[0]);
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );

    for (const secao of secoes) observador.observe(secao);
    return () => observador.disconnect();
  }, [dependencia]);

  return ativa;
}

/**
 * Leva à seção do `#` da URL assim que ela existe.
 *
 * O navegador já faz isso sozinho — mas só com o elemento presente quando a
 * página carrega, e aqui a referência inteira chega depois, por rede. Sem este
 * efeito, um link `#/mensagens/criar-mensagem` colado no chat abriria a página
 * no topo, e o leitor concluiria que a âncora não funciona.
 *
 * Roda uma vez por documento carregado (`dependencia`), e só se a URL trouxer
 * âncora: rolar sozinho quem não pediu seria pior que não rolar.
 */
function useAncoraDaUrl(dependencia: unknown) {
  useEffect(() => {
    if (!dependencia) return;
    const ancora = window.location.hash.replace(/^#/, "");
    if (!ancora) return;
    // um quadro depois: o React acabou de montar as seções, mas o navegador
    // ainda não as posicionou, e `scrollIntoView` mediria a página errada
    const id = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(ancora))?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [dependencia]);
}
