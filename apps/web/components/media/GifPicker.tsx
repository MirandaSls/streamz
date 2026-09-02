"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Star } from "@/components/ui/icones";
import type { Attachment, GifCategory, GifResult } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { BuscaPicker, CaixaPicker } from "@/components/media/PickerChrome";
import { alternarGifFavorito, usePrefsPicker } from "@/components/media/preferencias-picker";

/** Espera antes de buscar enquanto se digita (o provedor cobra por chamada). */
const DEBOUNCE_MS = 350;

type SubAba = "favoritos" | "tendencias";

/**
 * Seletor de GIF (Giphy), com as sub-abas "Favoritos" e "Tendências".
 *
 * Sem `GIPHY_API_KEY` no servidor a resposta vem com `configured: false` e a
 * caixa mostra um aviso neutro em vez de um erro — o mesmo tratamento que voz
 * dá à falta de LiveKit. O aviso **não** cita variável de ambiente nem arquivo
 * do repositório: quem lê é quem usa o chat, não quem o instala.
 *
 * O GIF escolhido vira anexo por URL: nada é copiado para o nosso storage
 * (ver `POST /uploads/external`), então este caminho funciona mesmo sem R2.
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
  const [subAba, setSubAba] = useState<SubAba>("tendencias");
  const [categoriaAberta, setCategoriaAberta] = useState<GifCategory | null>(null);
  const [resultados, setResultados] = useState<GifResult[]>([]);
  const [categorias, setCategorias] = useState<GifCategory[]>([]);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
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

  useEffect(() => {
    if (subAba === "favoritos" && !termo.trim()) return;
    let vivo = true;
    setCarregando(true);
    const timer = setTimeout(() => {
      void api
        .searchGifs(termo.trim())
        .then((r) => {
          if (!vivo) return;
          setConfigurado(r.configured);
          setResultados(r.results);
        })
        .catch(() => vivo && setResultados([]))
        .finally(() => vivo && setCarregando(false));
    }, DEBOUNCE_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [termo, subAba]);

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
  const mostrandoFavoritos = subAba === "favoritos" && !buscando;
  const grade = mostrandoFavoritos ? favoritos : resultados;

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
        autoFocus
      >
        {(emCategoria || buscando) && (
          <button
            type="button"
            onClick={voltar}
            aria-label="Voltar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-muted transition hover:bg-hov hover:text-txt-normal"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        )}
      </BuscaPicker>

      {!buscando && configurado !== false && (
        <div className="flex gap-1 px-2 pb-2" role="tablist" aria-label="Origem dos GIFs">
          <SubAbaBotao
            ativa={subAba === "favoritos"}
            onClick={() => setSubAba("favoritos")}
            rotulo="Favoritos"
          />
          <SubAbaBotao
            ativa={subAba === "tendencias"}
            onClick={() => setSubAba("tendencias")}
            rotulo="Tendências"
          />
        </div>
      )}

      {configurado === false ? (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <p className="font-medium text-txt-normal">GIFs indisponíveis</p>
            <p className="mt-1 text-sm text-txt-muted">
              A busca de GIFs não está disponível agora. Você ainda pode anexar um GIF do seu
              computador.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!buscando && subAba === "tendencias" && categorias.length > 0 && (
            <section className="mb-2">
              <h3 className="sticky top-0 z-10 bg-panel px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-txt-muted">
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
                    <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-bold text-white">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {mostrandoFavoritos && favoritos.length === 0 ? (
            <p className="py-10 text-center text-sm text-txt-muted">
              Nenhum GIF favoritado ainda. Passe o mouse num GIF e toque na estrela.
            </p>
          ) : carregando && grade.length === 0 && !mostrandoFavoritos ? (
            <p className="py-8 text-center text-sm text-txt-muted">Carregando…</p>
          ) : grade.length === 0 ? (
            <p className="py-8 text-center text-sm text-txt-muted">
              {buscando ? "Nenhum GIF para esse termo." : "Nada por aqui ainda."}
            </p>
          ) : (
            <div className="columns-2 gap-2">
              {grade.map((gif) => (
                <CartaoGif
                  key={gif.id}
                  gif={gif}
                  favorito={favoritos.some((g) => g.id === gif.id)}
                  desabilitado={anexando}
                  onEscolher={() => void escolher(gif)}
                  onFavoritar={() => alternarGifFavorito(gif)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Atribuição exigida pelos termos da API do Giphy — some junto com a
          busca quando não há chave, porque aí nada veio deles. */}
      {configurado !== false && (
        <p className="shrink-0 px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-txt-muted">
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

function SubAbaBotao({
  ativa,
  onClick,
  rotulo,
}: {
  ativa: boolean;
  onClick: () => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-sm font-medium transition ${
        ativa ? "bg-sel text-txt-primary" : "text-txt-muted hover:bg-hov hover:text-txt-normal"
      }`}
    >
      {rotulo}
    </button>
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
        className={`absolute right-1 top-1 grid h-7 w-7 place-items-center rounded bg-black/60 transition focus-visible:opacity-100 group-hover:opacity-100 ${
          favorito ? "text-accent opacity-100" : "text-white opacity-0"
        }`}
      >
        <Star size={15} aria-hidden="true" fill={favorito ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
