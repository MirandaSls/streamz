"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Star } from "@/components/ui/icones";
import type { Attachment, GifCategory, GifResult } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { BuscaPicker, CaixaPicker } from "@/components/media/PickerChrome";
import { alternarGifFavorito, usePrefsPicker } from "@/components/media/preferencias-picker";

/** Espera antes de buscar enquanto se digita (o provedor cobra por chamada). */
const DEBOUNCE_MS = 350;

/**
 * Seletor de GIF (Giphy): uma grade só, rolável, em alvenaria — como o
 * `EmojiPicker` e o `StickerPicker`, e não mais um alternador de sub-abas
 * "Favoritos"/"Tendências" que escondia uma lista atrás da outra. Sem busca,
 * a ordem das seções é **Favoritos** (se houver algum), **Categorias** (as
 * capas por tema, para navegar sem saber o termo) e **Em alta** (o resultado
 * de uma busca vazia, que o provedor já devolve como tendências). Com busca,
 * as seções somem e sobra só **Resultados**.
 *
 * Sem `GIPHY_API_KEY` no servidor a resposta vem com `configured: false` e a
 * caixa mostra um aviso neutro em vez de um erro — o mesmo tratamento que voz
 * dá à falta de LiveKit. O aviso **não** cita variável de ambiente nem arquivo
 * do repositório: quem lê é quem usa o chat, não quem o instala.
 *
 * O GIF escolhido vira anexo por URL: nada é copiado para o nosso storage
 * (ver `POST /uploads/external`), então este caminho funciona mesmo sem R2.
 *
 * ## Estados (cartão 2j-seletor-gif-figurinha)
 *
 * Vazio ("Nada por aqui ainda"/"Nenhum GIF para esse termo"/favoritos vazio),
 * carregando ("Carregando…", só enquanto a seção que depende da resposta
 * ainda não tem nada — as outras seções continuam na tela), erro (falha de
 * rede na busca: mensagem própria, distinta de "nenhum resultado", que antes
 * não existia — um `catch` silencioso virava lista vazia sem avisar que foi
 * falha), sem chave (`configurado === false`, sem barra de rolagem desenhada
 * sobre o aviso — o `div` daquele ramo não tem `overflow-y-auto`), hover (a
 * prévia anima e a estrela aparece), foco (o anel azul global de
 * `globals.css` alcança os cartões e botões daqui sem nada extra neste
 * arquivo) e desabilitado (os cartões da grade ficam `disabled:opacity-50`
 * enquanto o GIF escolhido está sendo anexado, para não deixar escolher dois
 * ao mesmo tempo). "Sem permissão" não se aplica: qualquer membro que pode
 * escrever no canal pode anexar um GIF, não há papel que restrinja só isso.
 */
export default function GifPicker({
  onEscolher,
  onClose,
  termoInicial = "",
  className = "",
  embutido = false,
}: {
  onEscolher: (attachment: Attachment) => void;
  onClose: () => void;
  /** termo já digitado (veio de `/giphy termo`). */
  termoInicial?: string;
  className?: string;
  /** dentro do `PickerPanel` a caixa e o fechar são do painel, não daqui. */
  embutido?: boolean;
}) {
  const prefs = usePrefsPicker();
  const [termo, setTermo] = useState(termoInicial);
  const [categoriaAberta, setCategoriaAberta] = useState<GifCategory | null>(null);
  const [resultados, setResultados] = useState<GifResult[]>([]);
  const [categorias, setCategorias] = useState<GifCategory[]>([]);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [anexando, setAnexando] = useState(false);

  // categorias abrem a caixa; a busca substitui a grade quando há termo
  useEffect(() => {
    let vivo = true;
    void api
      .gifCategories()
      .then((r) => {
        if (!vivo) return;
        setConfigurado(r.configured);
        setCategorias(r.categories);
      })
      .catch(() => vivo && setConfigurado(false));
    return () => {
      vivo = false;
    };
  }, []);

  // termo vazio busca as "tendências": é o que preenche a seção "Em alta"
  // assim que o painel abre, sem precisar de uma chamada separada para isso.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(false);
    const timer = setTimeout(() => {
      void api
        .searchGifs(termo.trim())
        .then((r) => {
          if (!vivo) return;
          setConfigurado(r.configured);
          setResultados(r.results);
        })
        .catch(() => {
          if (!vivo) return;
          setResultados([]);
          setErro(true);
        })
        .finally(() => vivo && setCarregando(false));
    }, DEBOUNCE_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [termo]);

  async function escolher(gif: GifResult) {
    setAnexando(true);
    try {
      const attachment = await api.createExternalAttachment({
        url: gif.url,
        filename: `${(gif.description || "gif").slice(0, 40).replace(/[^\w-]+/g, "_")}.gif`,
        width: gif.width || undefined,
        height: gif.height || undefined,
      });
      onEscolher(attachment);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível anexar o GIF"), "error");
    } finally {
      setAnexando(false);
    }
  }

  function voltar() {
    setCategoriaAberta(null);
    setTermo("");
  }

  const emCategoria = categoriaAberta !== null;
  const buscando = termo.trim().length > 0;
  const favoritos = prefs.gifsFavoritos;
  /**
   * **O foco automático na busca é do computador.** No celular o campo puxava
   * o teclado no mesmo instante em que a folha subia: a folha é `60dvh` e
   * `dvh` já contava a janela encolhida, então ela nascia com ~276px — três
   * fileiras e o resto atrás do teclado. Quem quiser buscar toca no campo.
   *
   * `ehMobileAgora()` num inicializador de `useState`, e **não** o
   * `useEhMobile()`: o hook começa em `false` por definição (ver o comentário
   * dele sobre hidratação) e só vira `true` num `useLayoutEffect` — que roda
   * *depois* do commit, ou seja, depois de o React já ter aplicado o
   * `autoFocus` do primeiro render. Medido: com o hook, a busca do GIF
   * continuava com o foco no telefone. Aqui a resposta é lida na hora do
   * primeiro render, no cliente, que é quando o `autoFocus` importa — e ele
   * vale uma vez, na montagem, então não precisa acompanhar rotação.
   */
  const [autoFocarBusca] = useState(() => !ehMobileAgora());

  const mensagemVazio = erro
    ? "Não foi possível carregar os GIFs agora."
    : buscando
      ? "Nenhum GIF para esse termo."
      : "Nada por aqui ainda.";

  const corpo = (
    <div className="flex h-full min-h-0 flex-col">
      <BuscaPicker
        valor={termo}
        onChange={(v) => {
          setCategoriaAberta(null);
          setTermo(v);
        }}
        placeholder={emCategoria ? categoriaAberta.name : "Buscar GIF"}
        rotulo="Buscar GIF"
        autoFocus={autoFocarBusca}
      >
        {(emCategoria || buscando) && (
          <BotaoDeIcone
            rotulo="Voltar"
            icone={<ChevronLeft size={18} aria-hidden="true" />}
            onClick={voltar}
            tamanho="md"
            comFundo
            semDica
          />
        )}
      </BuscaPicker>

      {configurado === false ? (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <p className="font-medium text-text-default">GIFs indisponíveis</p>
            <p className="mt-1 text-sm text-text-muted">
              A busca de GIFs não está disponível agora. Você ainda pode anexar um GIF do seu
              computador.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {buscando ? (
            erro ? (
              <p className="py-8 text-center text-sm text-text-muted">{mensagemVazio}</p>
            ) : carregando && resultados.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">Carregando…</p>
            ) : resultados.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">{mensagemVazio}</p>
            ) : (
              <SecaoGifs
                titulo="Resultados"
                itens={resultados}
                favoritos={favoritos}
                desabilitado={anexando}
                onEscolher={(gif) => void escolher(gif)}
                onFavoritar={alternarGifFavorito}
              />
            )
          ) : (
            <>
              {favoritos.length > 0 && (
                <SecaoGifs
                  titulo="Favoritos"
                  itens={favoritos}
                  favoritos={favoritos}
                  desabilitado={anexando}
                  onEscolher={(gif) => void escolher(gif)}
                  onFavoritar={alternarGifFavorito}
                />
              )}

              {categorias.length > 0 && (
                <section className="mb-2">
                  <h3 className="sticky top-0 z-10 bg-background-surface-high px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Categorias
                  </h3>
                  {/* a lista inteira, rolável: cortar em oito escondia justamente as
                      categorias que ninguém alcança pela busca por não saber o nome */}
                  <div className="grid grid-cols-2 gap-2">
                    {categorias.map((c) => (
                      <button
                        key={c.searchTerm}
                        type="button"
                        onClick={() => {
                          setCategoriaAberta(c);
                          setTermo(c.searchTerm);
                        }}
                        className="relative h-20 overflow-hidden rounded"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.previewUrl} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-background-scrim text-sm font-bold text-text-overlay-light">
                          {c.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {erro ? (
                <p className="py-8 text-center text-sm text-text-muted">{mensagemVazio}</p>
              ) : carregando && resultados.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">Carregando…</p>
              ) : resultados.length > 0 ? (
                <SecaoGifs
                  titulo="Em alta"
                  itens={resultados}
                  favoritos={favoritos}
                  desabilitado={anexando}
                  onEscolher={(gif) => void escolher(gif)}
                  onFavoritar={alternarGifFavorito}
                />
              ) : favoritos.length === 0 && categorias.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">{mensagemVazio}</p>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Atribuição exigida pelos termos da API do Giphy — some junto com a
          busca quando não há chave, porque aí nada veio deles. */}
      {configurado !== false && (
        <p className="shrink-0 px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Powered by GIPHY
        </p>
      )}
    </div>
  );

  if (embutido) return corpo;
  return (
    <CaixaPicker rotulo="Escolher GIF" onClose={onClose} className={className}>
      {corpo}
    </CaixaPicker>
  );
}

/**
 * Uma seção rotulada da grade: cabeçalho grudado (mesma superfície da caixa,
 * `--background-surface-high` — ver o comentário em `PickerPanel.tsx`) e a
 * alvenaria de dois em dois (`columns-2`) embaixo.
 */
function SecaoGifs({
  titulo,
  itens,
  favoritos,
  desabilitado,
  onEscolher,
  onFavoritar,
}: {
  titulo: string;
  itens: GifResult[];
  favoritos: GifResult[];
  desabilitado: boolean;
  onEscolher: (gif: GifResult) => void;
  onFavoritar: (gif: GifResult) => void;
}) {
  return (
    <section className="mb-2">
      <h3 className="sticky top-0 z-10 bg-background-surface-high px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {titulo}
      </h3>
      <div className="columns-2 gap-2">
        {itens.map((gif) => (
          <CartaoGif
            key={`${titulo}-${gif.id}`}
            gif={gif}
            favorito={favoritos.some((g) => g.id === gif.id)}
            desabilitado={desabilitado}
            onEscolher={() => onEscolher(gif)}
            onFavoritar={() => onFavoritar(gif)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Um GIF da grade. Em repouso mostra a miniatura estática e só **anima ao passar
 * o mouse**: a grade tem dezenas de cartões, e deixar todos rodando ao mesmo
 * tempo é o que trava a rolagem em máquina modesta.
 *
 * A estrela é irmã do botão do GIF, não filha: botão dentro de botão é HTML
 * inválido e o clique na estrela viraria escolha do GIF.
 */
function CartaoGif({
  gif,
  favorito,
  desabilitado,
  onEscolher,
  onFavoritar,
}: {
  gif: GifResult;
  favorito: boolean;
  desabilitado: boolean;
  onEscolher: () => void;
  onFavoritar: () => void;
}) {
  const [animando, setAnimando] = useState(false);
  return (
    <div
      className="group relative mb-2 break-inside-avoid"
      onPointerEnter={() => setAnimando(true)}
      onPointerLeave={() => setAnimando(false)}
    >
      <button
        type="button"
        disabled={desabilitado}
        onClick={onEscolher}
        onFocus={() => setAnimando(true)}
        onBlur={() => setAnimando(false)}
        aria-label={gif.description}
        className="block w-full overflow-hidden rounded disabled:opacity-50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={animando ? gif.url : gif.previewUrl}
          alt={gif.description}
          loading="lazy"
          className="w-full object-cover"
        />
      </button>
      <button
        type="button"
        onClick={onFavoritar}
        aria-label={favorito ? "Remover dos favoritos" : "Favoritar GIF"}
        aria-pressed={favorito}
        className={`absolute right-1 top-1 grid h-7 w-7 place-items-center rounded bg-background-scrim transition focus-visible:opacity-100 group-hover:opacity-100 ${
          favorito ? "text-brand-500 opacity-100" : "text-text-overlay-light opacity-0"
        }`}
      >
        <Star size={15} aria-hidden="true" fill={favorito ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
