"use client";

import { useCallback } from "react";
import { RefreshCw } from "@/components/ui/icones";
import { Section } from "@/components/ui/controls";
import { api } from "@/lib/api";
import { Estado, LocalDaChamada, Numero, duracao, usePainel } from "./comuns";

/** Enquanto a aba está aberta, os números se atualizam a cada 10 s. */
const INTERVALO_MS = 10_000;

/**
 * Visão geral da instância: os números que respondem "como está o Streamz
 * agora" e a lista curta das chamadas em curso.
 *
 * As chamadas aparecem aqui **e** na aba própria de propósito: quem abre o
 * painel quer ver o que está acontecendo sem precisar escolher uma aba, e a aba
 * de chamadas é onde se olha cada uma de perto.
 */
export default function AdminVisaoGeralTab() {
  const carregar = useCallback(
    async () => ({ visao: await api.adminOverview(), chamadas: await api.adminCalls() }),
    [],
  );
  const { dados, erro, carregando, recarregar } = usePainel(carregar, INTERVALO_MS);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-text-muted">
          Tudo o que acontece nesta instância, sem entrar em servidor nenhum. O painel é só
          leitura.
        </p>
        <button
          type="button"
          onClick={recarregar}
          className="flex h-8 celular:h-[44px] shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-text-subtle transition hover:bg-interactive-background-hover hover:text-text-strong"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <Estado erro={erro} carregando={carregando && !dados}>
        {dados && (
          <>
            <Section title="Agora">
              <div className="grid grid-cols-3 gap-2">
                <Numero
                  rotulo="Em chamada"
                  valor={dados.visao.pessoasEmChamada}
                  detalhe={`${dados.visao.chamadasAtivas} chamada(s) aberta(s)`}
                />
                <Numero
                  rotulo="Conectados"
                  valor={dados.visao.usuarios.online}
                  detalhe="com o app aberto"
                />
                <Numero rotulo="Contas" valor={dados.visao.usuarios.total} />
              </div>
            </Section>

            <Section title="Chamadas em curso">
              {dados.chamadas.length === 0 ? (
                <p className="py-1 text-sm text-text-muted">Ninguém está em chamada agora.</p>
              ) : (
                dados.chamadas.map((c) => (
                  <div
                    key={c.local.channelId}
                    className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
                  >
                    <LocalDaChamada local={c.local} comAvatares />
                    <span className="shrink-0 text-xs text-text-muted">
                      {c.participantes.length} · {duracao(c.desde)}
                    </span>
                  </div>
                ))
              )}
            </Section>

            <Section title="Acervo">
              <div className="grid grid-cols-3 gap-2">
                <Numero rotulo="Servidores" valor={dados.visao.servidores} />
                <Numero
                  rotulo="Canais"
                  valor={dados.visao.canais.texto + dados.visao.canais.voz}
                  detalhe={`${dados.visao.canais.texto} de texto · ${dados.visao.canais.voz} de voz`}
                />
                <Numero rotulo="Conversas" valor={dados.visao.canais.conversas} detalhe="privadas e grupos" />
                <Numero rotulo="Mensagens" valor={dados.visao.mensagens} />
                <Numero rotulo="Desativadas" valor={dados.visao.usuarios.desativados} detalhe="pelo dono" />
                <Numero rotulo="Excluídas" valor={dados.visao.usuarios.excluidos} detalhe="anonimizadas" />
              </div>
            </Section>
          </>
        )}
      </Estado>
    </>
  );
}
