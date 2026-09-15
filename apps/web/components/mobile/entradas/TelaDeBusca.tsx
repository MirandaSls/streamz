"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Search, SlidersHorizontal, X } from "@/components/ui/icones";
import type { Channel } from "@streamz/shared";
import SearchPanel from "@/components/chat/SearchPanel";
import AbasDoCanal from "@/components/mobile/entradas/AbasDoCanal";
import {
  consultaInicialDaBusca,
  desfechoDaBusca,
  filtrosDaBusca,
  inserirFiltro,
  type AbaDoCanal,
} from "@/components/mobile/entradas/navegacao";
import { BotaoRedondo, CamadaDeEntrada, EstadoErro } from "@/components/mobile/entradas/pecas";
import { BotaoDeToque } from "@/components/mobile/pecas";
import { TextInput } from "@/components/ui/primitivos";
import { useMessages } from "@/stores/messages";
import { ui } from "@/stores/ui";

/**
 * A busca de mensagens do canal no celular — a lupa do cabeçalho da conversa e
 * a dos detalhes do canal.
 *
 * A forma é a de `suporte/.../how-to-use-search-on-discord/03.gif` (quadros 20 e
 * 70) e `07.png`/`08.png`, que dão presença e ordem (sem escala):
 *
 * - **no topo, o campo em pílula** com a lupa dentro, já preenchido com o filtro
 *   do canal (`in: baking-recipes`), e ao lado um botão redondo de **filtros**
 *   que abre "Filter results…" (`08.png`);
 * - **antes de digitar**, embaixo do campo, as mesmas abas dos detalhes do canal
 *   (Membros, Fixadas, Threads…) — por isso o corpo é o `AbasDoCanal`;
 * - **depois de buscar**, os resultados agrupados por canal, que é o
 *   `SearchPanel` do desktop montado aqui como está (ele já tem `celular:w-full`).
 *
 * Uma diferença, de propósito: **a seta de voltar à esquerda do campo**. No GIF
 * do iOS não há saída visível — lá a busca é uma folha, que se fecha arrastando
 * para baixo. Aqui a camada não se arrasta, e o voltar do sistema do Android não
 * existe no iPhone; sem a seta, a única saída no iOS seria nenhuma.
 *
 * Os três estados:
 * - **carregando** e **vazio** são os do `SearchPanel` ("Buscando…" com o
 *   girador, e "Procuramos em todo canto…");
 * - **erro** não existe na store (`runSearch` só desliga o `searching` e mostra
 *   um aviso), então é deduzido comparando antes e depois do pedido
 *   (`desfechoDaBusca`), com "Tentar de novo".
 *
 * Sair da busca **limpa a consulta** (`clearSearch`): no desktop a coluna de
 * resultados fica aberta até o × do campo, e sem isto ela reapareceria sozinha
 * ao girar um tablet para o leiaute de colunas.
 */
export default function TelaDeBusca({
  canal,
  aoVoltar,
  aoSaltar,
}: {
  canal: Channel;
  aoVoltar: () => void;
  aoSaltar: () => void;
}) {
  const ehServidor = canal.guildId !== null;
  const [consulta, setConsulta] = useState(() => consultaInicialDaBusca(canal.name, ehServidor));
  const [aba, setAba] = useState<AbaDoCanal>("membros");
  const [erro, setErro] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);
  const resultados = useMessages((s) => s.searchResults);
  const buscando = useMessages((s) => s.searching);

  // o campo nasce com o cursor **depois** do filtro do canal: é ali que se
  // digita o termo (quadro 20 do GIF, cursor após `in: baking-recipes`)
  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => () => useMessages.getState().clearSearch(), []);

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    const store = useMessages.getState();
    setErro(false);
    if (!consulta.trim()) {
      store.clearSearch();
      return;
    }
    // o teclado desce para os resultados aparecerem inteiros (quadro 70)
    campoRef.current?.blur();
    store.setSearchQuery(consulta);
    const antes = { searching: store.searching, searchResults: store.searchResults };
    await store.runSearch({ channelId: canal.id, guildId: canal.guildId });
    const depois = useMessages.getState();
    if (desfechoDaBusca(antes, { searching: depois.searching, searchResults: depois.searchResults }) === "erro") {
      setErro(true);
    }
  }

  function limpar() {
    setConsulta("");
    setErro(false);
    useMessages.getState().clearSearch();
    campoRef.current?.focus();
  }

  function abrirFiltros() {
    // "Filter results…" (`08.png`). No celular o `ContextMenuHost` sobe como
    // folha e ignora o ponto; o ponto só serve a quem abrir isto num tablet
    ui.openContextMenu(
      window.innerWidth,
      56,
      filtrosDaBusca(ehServidor).map((f) => ({
        label: f.rotulo,
        onSelect: () => {
          const nova = inserirFiltro(consulta, f.prefixo);
          setConsulta(nova);
          requestAnimationFrame(() => {
            const el = campoRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(nova.length, nova.length);
          });
        },
      })),
    );
  }

  const semBusca = resultados === null && !buscando;

  return (
    <CamadaDeEntrada rotulo="Buscar mensagens">
      {/* 56 de altura, a barra de tela; `pr-[10px]` põe o círculo de filtros a
          16 da borda, como a lupa da conversa (ver `BotaoRedondo`) */}
      <form role="search" onSubmit={(e) => void buscar(e)} className="flex h-[56px] shrink-0 items-center gap-1 pl-1 pr-[10px]">
        <BotaoDeToque label="Voltar" onClick={aoVoltar}>
          <ArrowLeft size={24} />
        </BotaoDeToque>
        {/* A pílula tem 44: em proporção o campo do GIF dá ≈37pt (quadro de
            720px para 390pt, ±5%), abaixo do piso de toque — fica o piso, com a
            tensão registrada na entrega. Tokens do campo do Discord
            (`--input-*`); o raio de pílula é a forma do GIF. */}
        <TextInput
          ref={campoRef}
          tamanho={44}
          classeDaCaixa={`min-w-0 flex-1 rounded-full ${consulta ? "pr-0" : ""}`}
          prefixo={<Search size={16} aria-hidden="true" className="shrink-0 text-input-icon-default" />}
          sufixo={
            consulta ? (
              // o "×" do primitivo é um glifo de 16 sem alvo; aqui ele tem 44
              <button
                type="button"
                aria-label="Limpar a busca"
                onClick={limpar}
                className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-input-icon-default"
              >
                <X size={18} aria-hidden="true" className="pointer-events-none" />
              </button>
            ) : null
          }
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={`Buscar mensagens em ${canal.name ?? "esta conversa"}`}
          placeholder="Buscar"
        />
        <BotaoRedondo rotulo="Filtros da busca" onClick={abrirFiltros}>
          <SlidersHorizontal size={18} />
        </BotaoRedondo>
      </form>

      {erro ? (
        <EstadoErro titulo="A busca falhou." aoTentarDeNovo={() => void buscar()} />
      ) : semBusca ? (
        <AbasDoCanal canal={canal} aba={aba} aoMudarAba={setAba} aoSaltar={aoSaltar} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border-subtle [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-l-0">
          <SearchPanel guildId={canal.guildId} />
        </div>
      )}
    </CamadaDeEntrada>
  );
}
