"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Search, ShieldCheck } from "lucide-react";
import { MAX_MESSAGE_LENGTH, type AdminUserView, type AdminUsersPage } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import { ESTILO_AREA, ESTILO_CAMPO } from "@/components/settings/campos";
import { api } from "@/lib/api";
import { dataCompleta } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { Estado, Etiqueta, LocalDaChamada, NomeDoUsuario } from "./comuns";

/** Quanto esperar antes de buscar enquanto o administrador ainda digita. */
const ESPERA_MS = 300;

/**
 * Todas as contas da instância, com **onde cada uma está falando agora**.
 *
 * A coluna da chamada é o motivo desta aba existir e não ser só uma listagem:
 * ela responde, sem entrar em servidor nenhum, se a pessoa está num canal de
 * voz (e qual) ou numa conversa privada (e com quem).
 *
 * A lista é paginada por cursor e cresce com "Carregar mais" em vez de trocar
 * de página: numa lista que se lê procurando alguém, perder o que já apareceu a
 * cada clique é o pior dos dois mundos.
 *
 * É também a única aba que **escreve**: o botão de mensagem abre um campo ali
 * mesmo e manda uma DM para a conta da linha, sem amizade e sem sair do painel.
 */
export default function AdminUsuariosTab() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState<AdminUsersPage | null>(null);
  const [itens, setItens] = useState<AdminUserView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);

  // a busca só vai à API quando a digitação para: uma requisição por tecla
  // devolveria as respostas fora de ordem numa lista desta largura
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const timer = setTimeout(async () => {
      try {
        const p = await api.adminUsers(busca.trim() || undefined);
        if (!vivo) return;
        setPagina(p);
        setItens(p.itens);
        setErro(null);
      } catch (e) {
        if (vivo) setErro(errorMessage(e, "Não foi possível carregar as contas"));
      } finally {
        if (vivo) setCarregando(false);
      }
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [busca]);

  const carregarMais = useCallback(async () => {
    if (!pagina?.proximoCursor) return;
    setCarregandoMais(true);
    try {
      const p = await api.adminUsers(busca.trim() || undefined, pagina.proximoCursor);
      setPagina(p);
      setItens((atuais) => [...atuais, ...p.itens]);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar mais contas"), "error");
    } finally {
      setCarregandoMais(false);
    }
  }, [busca, pagina]);

  return (
    <>
      <div className="relative mb-4">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, usuário ou e-mail"
          aria-label="Buscar contas"
          className={`${ESTILO_CAMPO} pl-8`}
        />
      </div>

      {pagina && !carregando && (
        <p className="mb-2 text-xs text-txt-muted">
          {itens.length} de {pagina.total.toLocaleString("pt-BR")} conta(s)
        </p>
      )}

      <Estado
        erro={erro}
        carregando={carregando}
        vazio={itens.length === 0 ? "Nenhuma conta com esse termo." : undefined}
      >
        <ul>
          {itens.map((item) => (
            <Linha key={item.user.id} item={item} />
          ))}
        </ul>

        {pagina?.proximoCursor && (
          <button
            type="button"
            onClick={() => void carregarMais()}
            disabled={carregandoMais}
            className="mt-3 h-9 w-full rounded-[3px] border border-border-strong text-sm font-medium text-txt-normal transition hover:border-border-strong-hover disabled:opacity-60"
          >
            {carregandoMais ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </Estado>
    </>
  );
}

function Linha({ item }: { item: AdminUserView }) {
  const { user } = item;
  const meuId = useAuth((s) => s.user?.id);
  const [compondo, setCompondo] = useState(false);
  // conta excluída está anonimizada (a API recusa), e escrever para si mesmo o
  // app já faz melhor em qualquer outro lugar
  const podeEscrever = !item.deletedAt && user.id !== meuId;

  return (
    <li className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <Avatar user={user} size="md" status={user.status} surface="border-chat" />

        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <NomeDoUsuario user={user} />
            {item.admin && (
              <Etiqueta tom="accent">
                <ShieldCheck size={9} aria-hidden="true" className="mr-0.5 inline align-[-1px]" />
                admin
              </Etiqueta>
            )}
            {item.deletedAt && <Etiqueta tom="perigo">excluída</Etiqueta>}
            {!item.deletedAt && item.disabledAt && <Etiqueta tom="alerta">desativada</Etiqueta>}
          </span>

          <p className="mt-0.5 truncate text-xs text-txt-muted">
            {item.email ?? "sem e-mail"}
            {item.email && !item.emailVerified && " (não verificado)"}
            {" · "}
            {STATUS_LABEL[user.status]}
            {" · "}
            {item.servidores} servidor(es) · {item.mensagens.toLocaleString("pt-BR")} mensagem(ns)
          </p>

          {/* a linha que o painel existe para mostrar */}
          {item.chamada ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.02em] text-accent">
                em chamada
              </span>
              <LocalDaChamada local={item.chamada} />
            </span>
          ) : (
            <p className="mt-1 text-xs text-txt-faint">
              {item.lastSeenAt ? `Visto por último em ${dataCompleta(item.lastSeenAt)}` : "Nunca se conectou"}
            </p>
          )}
        </div>

        {podeEscrever && (
          <button
            type="button"
            onClick={() => setCompondo((aberto) => !aberto)}
            aria-expanded={compondo}
            title={`Mandar mensagem para @${user.username}`}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] border border-border-strong px-2.5 text-xs font-medium text-txt-normal transition hover:border-border-strong-hover"
          >
            <MessageSquarePlus size={14} aria-hidden="true" />
            Mensagem
          </button>
        )}
      </div>

      {compondo && <Compositor user={user} onFim={() => setCompondo(false)} />}
    </li>
  );
}

/**
 * O campo de mensagem que nasce embaixo da linha.
 *
 * Enter manda e Shift+Enter quebra a linha, como o compositor do chat — quem
 * está no painel acabou de sair de uma conversa e traz esse dedo consigo. A
 * conversa não é aberta na tela depois de enviar: o painel é lido de cima a
 * baixo, e sair dele no meio da lista custa o lugar onde se estava.
 */
function Compositor({ user, onFim }: { user: AdminUserView["user"]; onFim: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => campo.current?.focus(), []);

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    try {
      await api.adminEnviarMensagem(user.id, conteudo);
      ui.toast(`Mensagem enviada para @${user.username}`);
      setTexto("");
      onFim();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar a mensagem"), "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 pl-[52px]">
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void enviar();
          }
          if (e.key === "Escape") onFim();
        }}
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={enviando}
        placeholder={`Mensagem para @${user.username}`}
        aria-label={`Mensagem para @${user.username}`}
        className={ESTILO_AREA}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || texto.trim().length === 0}
          className="h-8 rounded-[3px] bg-accent px-3 text-xs font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
        <button
          type="button"
          onClick={onFim}
          className="h-8 rounded-[3px] px-2 text-xs text-txt-muted transition hover:text-txt-normal"
        >
          Cancelar
        </button>
        <span className="ml-auto text-[11px] text-txt-faint">
          {texto.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </div>
  );
}
