"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Search } from "@/components/ui/icones";
import type { AdminChannelView, AdminChannelsPage, Message } from "@streamz/shared";
import MessagePreview from "@/components/chat/MessagePreview";
import { ESTILO_CAMPO } from "@/components/settings/campos";
import { api } from "@/lib/api";
import { dataCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { Estado, Etiqueta, IconeDeCanal } from "./comuns";

const ESPERA_MS = 300;

type Escopo = "todos" | "servidores" | "conversas";

const ESCOPOS: { id: Escopo; label: string }[] = [
  { id: "todos", label: "Tudo" },
  { id: "servidores", label: "Servidores" },
  { id: "conversas", label: "Privadas e grupos" },
];

/**
 * Ler qualquer canal da instância sem ser membro dele.
 *
 * São duas telas na mesma aba: a lista de canais e, depois de escolher um, o
 * histórico. Não é lista à esquerda e conversa à direita porque a moldura das
 * configurações dá 740px de largura — duas colunas aqui espremeriam as duas.
 *
 * O histórico usa o **mesmo** `MessagePreview` da busca e das fixadas: anexo,
 * prévia de link e markdown saem idênticos ao que o autor vê. Uma segunda
 * versão da mensagem só para o painel envelheceria sozinha.
 *
 * Cada leitura fica no log do servidor (ver `AdminService.messages`).
 */
export default function AdminMensagensTab() {
  const [canal, setCanal] = useState<AdminChannelView | null>(null);
  return canal ? (
    <Historico canal={canal} onVoltar={() => setCanal(null)} />
  ) : (
    <ListaDeCanais onAbrir={setCanal} />
  );
}

// ── lista de canais ──────────────────────────────────────────

function ListaDeCanais({ onAbrir }: { onAbrir: (c: AdminChannelView) => void }) {
  const [busca, setBusca] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("todos");
  const [pagina, setPagina] = useState<AdminChannelsPage | null>(null);
  const [itens, setItens] = useState<AdminChannelView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const timer = setTimeout(async () => {
      try {
        const p = await api.adminChannels(busca.trim() || undefined, escopo);
        if (!vivo) return;
        setPagina(p);
        setItens(p.itens);
        setErro(null);
      } catch (e) {
        if (vivo) setErro(errorMessage(e, "Não foi possível carregar os canais"));
      } finally {
        if (vivo) setCarregando(false);
      }
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [busca, escopo]);

  const carregarMais = useCallback(async () => {
    if (!pagina?.proximoCursor) return;
    setCarregandoMais(true);
    try {
      const p = await api.adminChannels(busca.trim() || undefined, escopo, pagina.proximoCursor);
      setPagina(p);
      setItens((atuais) => [...atuais, ...p.itens]);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar mais canais"), "error");
    } finally {
      setCarregandoMais(false);
    }
  }, [busca, escopo, pagina]);

  return (
    <>
      <p className="mb-3 text-sm text-txt-muted">
        Abra qualquer canal ou conversa desta instância. Cada leitura fica registrada no log do
        servidor.
      </p>

      <div className="relative mb-2">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por canal, servidor ou participante"
          aria-label="Buscar canais"
          className={`${ESTILO_CAMPO} pl-8`}
        />
      </div>

      <div role="group" aria-label="Filtrar por tipo" className="mb-4 flex gap-1">
        {ESCOPOS.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={escopo === e.id}
            onClick={() => setEscopo(e.id)}
            className={`h-7 celular:h-[44px] rounded-[3px] px-2.5 text-sm font-medium transition ${
              escopo === e.id
                ? "bg-sel text-txt-primary"
                : "text-txt-faint hover:bg-hov hover:text-txt-normal"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {pagina && !carregando && (
        <p className="mb-2 text-xs text-txt-muted">
          {itens.length} de {pagina.total.toLocaleString("pt-BR")} canal(is)
        </p>
      )}

      <Estado
        erro={erro}
        carregando={carregando}
        vazio={itens.length === 0 ? "Nenhum canal com esse termo." : undefined}
      >
        <ul>
          {itens.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onAbrir(c)}
                className="flex w-full items-center gap-2 border-b border-border py-2.5 text-left transition last:border-b-0 hover:bg-hov"
              >
                <IconeDeCanal tipo={c.type} privado={c.privado} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-txt-primary">{c.nome}</span>
                    {c.privado && <Etiqueta>privado</Etiqueta>}
                    {!c.guildId && (
                      <Etiqueta tom="alerta">{c.type === "GROUP" ? "grupo" : "privada"}</Etiqueta>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-txt-muted">
                    {c.guildName ?? c.participantes.map((p) => `@${p.username}`).join(", ")}
                    {" · "}
                    {c.mensagens.toLocaleString("pt-BR")} mensagem(ns)
                    {c.ultimaMensagemEm && ` · última em ${dataCompleta(c.ultimaMensagemEm)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {pagina?.proximoCursor && (
          <button
            type="button"
            onClick={() => void carregarMais()}
            disabled={carregandoMais}
            className="mt-3 h-9 celular:h-[44px] w-full rounded-[3px] border border-border-strong text-sm font-medium text-txt-normal transition hover:border-border-strong-hover disabled:opacity-60"
          >
            {carregandoMais ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </Estado>
    </>
  );
}

// ── histórico de um canal ────────────────────────────────────

function Historico({ canal, onVoltar }: { canal: AdminChannelView; onVoltar: () => void }) {
  const [itens, setItens] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p = await api.adminMessages(canal.id);
        if (!vivo) return;
        setItens(p.itens);
        setCursor(p.proximoCursor);
        // página incompleta já é o começo do canal: não há mais o que buscar
        setFim(p.itens.length === 0);
        setErro(null);
      } catch (e) {
        if (vivo) setErro(errorMessage(e, "Não foi possível ler o canal"));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [canal.id]);

  const carregarAntigas = useCallback(async () => {
    if (!cursor) return;
    setCarregando(true);
    try {
      const p = await api.adminMessages(canal.id, cursor);
      if (p.itens.length === 0) {
        setFim(true);
        return;
      }
      // o histórico volta no tempo: a página nova entra **antes** do que já há
      setItens((atuais) => [...p.itens, ...atuais]);
      setCursor(p.proximoCursor);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar mais mensagens"), "error");
    } finally {
      setCarregando(false);
    }
  }, [canal.id, cursor]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onVoltar}
          className="flex h-8 celular:h-[44px] shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Canais
        </button>
        <span className="flex min-w-0 items-center gap-1.5">
          <IconeDeCanal tipo={canal.type} privado={canal.privado} />
          <span className="truncate text-sm font-medium text-txt-primary">{canal.nome}</span>
          <span className="truncate text-xs text-txt-muted">
            {canal.guildName ?? canal.participantes.map((p) => `@${p.username}`).join(", ")}
          </span>
        </span>
      </div>

      <Estado
        erro={erro}
        carregando={carregando && itens.length === 0}
        vazio={!carregando && itens.length === 0 ? "Este canal não tem mensagens." : undefined}
      >
        {!fim && cursor && (
          <button
            type="button"
            onClick={() => void carregarAntigas()}
            disabled={carregando}
            className="mb-2 h-9 celular:h-[44px] w-full rounded-[3px] border border-border-strong text-sm font-medium text-txt-normal transition hover:border-border-strong-hover disabled:opacity-60"
          >
            {carregando ? "Carregando…" : "Mensagens anteriores"}
          </button>
        )}
        {fim && <p className="mb-2 text-center text-xs text-txt-faint">Começo do canal.</p>}

        {/* o `MessagePreview` é um cartão `bg-chat`, e o fundo da tela de
            configurações é `bg-chat` também: sem esta moldura as mensagens
            ficariam sem contorno nenhum, coladas umas nas outras */}
        <div className="flex flex-col gap-0.5 rounded-[6px] border border-border bg-panel p-1.5">
          {itens.map((m) => (
            <MessagePreview key={m.id} message={m} />
          ))}
        </div>
      </Estado>
    </>
  );
}
