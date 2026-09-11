"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Settings2, Star } from "@/components/ui/icones";
import type { Sticker } from "@streamz/shared";
import { useAuth } from "@/stores/auth";
import { useEmojis } from "@/stores/emojis";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import {
  BotaoLateral,
  BuscaPicker,
  CaixaPicker,
  ColunaLateral,
  DivisoriaLateral,
  IconeServidor,
  RodapePicker,
} from "@/components/media/PickerChrome";
import {
  figurinhasFrequentes,
  registrarUsoFigurinha,
  usePrefsPicker,
} from "@/components/media/preferencias-picker";

/** 4 por linha no painel de 424px, com a coluna de packs à esquerda. */
const COLUNAS = 4;
const CELULA = 88;

interface SecaoFigurinha {
  id: string;
  titulo: string;
  icone:
    | { tipo: "recentes" }
    | { tipo: "frequentes" }
    | { tipo: "servidor"; nome: string; url: string | null };
  itens: { sticker: Sticker; pack: string }[];
}

/**
 * Seletor de figurinha: coluna de packs à esquerda, grade rolável no meio e o
 * nome da figurinha em foco no rodapé — o mesmo desenho do seletor de emoji,
 * porque no Discord os dois são o mesmo painel com abas.
 *
 * A busca olha nome **e** palavras-chave — é para isso que a figurinha guarda
 * `tags`; procurar só pelo nome obrigaria a lembrar como quem subiu a batizou.
 */
export default function StickerPicker({
  onEscolher,
  onClose,
  className = "",
  embutido = false,
  guildId,
}: {
  onEscolher: (sticker: Sticker) => void;
  onClose: () => void;
  className?: string;
  /** dentro do `PickerPanel` a caixa e o fechar são do painel, não daqui. */
  embutido?: boolean;
  /** servidor a priorizar; sem isso vale o servidor aberto. */
  guildId?: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<{ sticker: Sticker; pack: string } | null>(null);
  const [ativa, setAtiva] = useState("");
  const guildIdAtivoStore = useGuilds((s) => s.activeGuildId);
  const guildIdAtivo = guildId !== undefined ? guildId : guildIdAtivoStore;
  const packs = useEmojis((s) => s.stickerGuilds);
  const me = useAuth((s) => s.user);
  const podeGerenciar = useCanModerate(me?.id);
  const prefs = usePrefsPicker();

  const rolagem = useRef<HTMLDivElement>(null);
  const alvos = useRef(new Map<string, HTMLElement>());

  const buscando = busca.trim().length > 0;

  /** ordem dos packs: o servidor aberto primeiro, como no rail. */
  const ordenados = useMemo(() => {
    if (!guildIdAtivo) return packs;
    return [
      ...packs.filter((p) => p.guildId === guildIdAtivo),
      ...packs.filter((p) => p.guildId !== guildIdAtivo),
    ];
  }, [packs, guildIdAtivo]);

  const porId = useMemo(() => {
    const mapa = new Map<string, { sticker: Sticker; pack: string }>();
    for (const p of packs) {
      for (const s of p.stickers) mapa.set(s.id, { sticker: s, pack: p.guildName });
    }
    return mapa;
  }, [packs]);

  const secoes = useMemo<SecaoFigurinha[]>(() => {
    if (buscando) {
      const q = busca.trim().toLowerCase();
      const itens = [...porId.values()].filter(
        ({ sticker }) =>
          sticker.name.toLowerCase().includes(q) || sticker.tags.toLowerCase().includes(q),
      );
      return [{ id: "busca", titulo: "Resultados", icone: { tipo: "recentes" }, itens }];
    }

    const lista: SecaoFigurinha[] = [];

    const recentes = prefs.figurinhasRecentes
      .map((id) => porId.get(id))
      .filter((x): x is { sticker: Sticker; pack: string } => x !== undefined);
    if (recentes.length > 0) {
      lista.push({
        id: "recentes",
        titulo: "Recentes",
        icone: { tipo: "recentes" },
        itens: recentes,
      });
    }

    const frequentes = figurinhasFrequentes(prefs)
      .map((id) => porId.get(id))
      .filter((x): x is { sticker: Sticker; pack: string } => x !== undefined);
    if (frequentes.length > 0) {
      lista.push({
        id: "frequentes",
        titulo: "Frequentes",
        icone: { tipo: "frequentes" },
        itens: frequentes,
      });
    }

    for (const pack of ordenados) {
      if (pack.stickers.length === 0) continue;
      lista.push({
        id: `guild:${pack.guildId}`,
        titulo: pack.guildName,
        icone: { tipo: "servidor", nome: pack.guildName, url: pack.guildIconUrl },
        itens: pack.stickers.map((sticker) => ({ sticker, pack: pack.guildName })),
      });
    }

    return lista;
  }, [buscando, busca, porId, prefs, ordenados]);

  const registrarSecao = useCallback((id: string, el: HTMLElement | null) => {
    if (el) alvos.current.set(id, el);
    else alvos.current.delete(id);
  }, []);

  const aoRolar = useCallback(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    let atual = "";
    for (const [id, el] of alvos.current) {
      if (el.offsetTop - caixa.scrollTop <= 8) atual = id;
    }
    setAtiva(atual);
  }, []);

  useEffect(() => {
    rolagem.current?.scrollTo({ top: 0 });
    setAtiva("");
  }, [buscando]);

  function irPara(id: string) {
    const el = alvos.current.get(id);
    const caixa = rolagem.current;
    if (!el || !caixa) return;
    caixa.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    setAtiva(id);
  }

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

  const vazio = secoes.every((s) => s.itens.length === 0);

  const corpo = (
    <div className="flex h-full min-h-0 flex-col">
      <BuscaPicker
        valor={busca}
        onChange={setBusca}
        placeholder="Buscar figurinha"
        rotulo="Buscar figurinha"
        autoFocus={autoFocarBusca}
      />

      <div className="flex min-h-0 flex-1">
        <ColunaLateral rotulo="Pacotes de figurinha">
          {secoes.map((secao, i) => (
            <div key={secao.id} className="contents">
              {i > 0 &&
                secao.id.startsWith("guild:") &&
                !secoes[i - 1].id.startsWith("guild:") && <DivisoriaLateral />}
              <BotaoLateral
                rotulo={secao.titulo}
                ativo={(ativa || secoes[0]?.id) === secao.id}
                onClick={() => irPara(secao.id)}
              >
                {secao.icone.tipo === "servidor" ? (
                  <IconeServidor nome={secao.icone.nome} iconUrl={secao.icone.url} />
                ) : secao.icone.tipo === "frequentes" ? (
                  <Star size={18} />
                ) : (
                  <Clock size={18} />
                )}
              </BotaoLateral>
            </div>
          ))}
        </ColunaLateral>

        <div
          ref={rolagem}
          onScroll={aoRolar}
          // `relative` ancora o `offsetTop` das seções aqui: é o que o atalho
          // da coluna lateral usa para rolar até o pack certo
          className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          {vazio ? (
            <p className="px-2 py-10 text-center text-sm text-text-muted">
              {buscando
                ? "Nenhuma figurinha com esse nome."
                : "Seus servidores ainda não têm figurinhas."}
            </p>
          ) : (
            secoes.map((secao) => (
              <SecaoGrade
                key={secao.id}
                secao={secao}
                onRegistrar={registrarSecao}
                onFocar={setFoco}
                onEscolher={(sticker) => {
                  registrarUsoFigurinha(sticker.id);
                  onEscolher(sticker);
                }}
              />
            ))
          )}
        </div>
      </div>

      <RodapePicker>
        {foco ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text-strong">
              {foco.sticker.name}
            </span>
            <span className="block truncate text-[11px] text-text-muted">{foco.pack}</span>
          </span>
        ) : (
          <span className="flex-1 text-sm text-text-muted">Escolha uma figurinha</span>
        )}
        {podeGerenciar && guildIdAtivo && (
          <BotaoDeIcone
            rotulo="Gerenciar figurinhas do servidor"
            icone={<Settings2 size={16} aria-hidden="true" />}
            tamanho="sm"
            comFundo
            onClick={() => {
              onClose();
              ui.openModal({ kind: "guildEmojis", guildId: guildIdAtivo });
            }}
          />
        )}
      </RodapePicker>
    </div>
  );

  if (embutido) return corpo;
  return (
    <CaixaPicker rotulo="Escolher figurinha" onClose={onClose} className={className}>
      {corpo}
    </CaixaPicker>
  );
}

function SecaoGrade({
  secao,
  onRegistrar,
  onEscolher,
  onFocar,
}: {
  secao: SecaoFigurinha;
  onRegistrar: (id: string, el: HTMLElement | null) => void;
  onEscolher: (sticker: Sticker) => void;
  onFocar: (item: { sticker: Sticker; pack: string } | null) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    onRegistrar(secao.id, ref.current);
    return () => onRegistrar(secao.id, null);
  }, [onRegistrar, secao.id]);

  return (
    <section ref={ref} className="mb-1">
      <h3 className="sticky top-0 z-10 flex items-center gap-1.5 bg-background-base-lowest px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {secao.icone.tipo === "servidor" && (
          <IconeServidor nome={secao.icone.nome} iconUrl={secao.icone.url} />
        )}
        <span className="truncate">{secao.titulo}</span>
      </h3>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${COLUNAS}, minmax(0, 1fr))` }}
      >
        {secao.itens.map(({ sticker, pack }) => (
          <button
            key={`${secao.id}-${sticker.id}`}
            type="button"
            aria-label={sticker.name}
            onClick={() => onEscolher(sticker)}
            onPointerEnter={() => onFocar({ sticker, pack })}
            onFocus={() => onFocar({ sticker, pack })}
            style={{ height: CELULA }}
            className="grid place-items-center rounded transition hover:bg-interactive-background-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sticker.url}
              alt={sticker.name}
              loading="lazy"
              className="h-[76px] w-[76px] object-contain"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
