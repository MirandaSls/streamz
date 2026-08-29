"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { dataCompleta } from "@/lib/format";
import { Estado, usePainel } from "./comuns";

/**
 * Todos os servidores da instância, com dono e tamanho.
 *
 * Sem recarga automática: a lista de servidores não muda de segundo em segundo,
 * ao contrário das chamadas. E sem botão de entrar — o painel é só leitura, e o
 * conteúdo dos canais se lê pela aba "Mensagens", que é o que torna entrar no
 * servidor desnecessário.
 */
export default function AdminServidoresTab() {
  const carregar = useCallback(() => api.adminGuilds(), []);
  const { dados, erro, carregando } = usePainel(carregar);

  return (
    <>
      <p className="mb-4 text-sm text-txt-muted">
        Todo servidor criado nesta instância, inclusive os privados.
      </p>

      <Estado
        erro={erro}
        carregando={carregando}
        vazio={dados && dados.length === 0 ? "Nenhum servidor ainda." : undefined}
      >
        <ul>
          {dados?.map((g) => (
            <li key={g.id} className="border-b border-border py-2.5 last:border-b-0">
              <p className="truncate text-sm font-medium text-txt-primary">{g.name}</p>
              <p className="mt-0.5 truncate text-xs text-txt-muted">
                Dono: {g.owner ? `@${g.owner.username}` : "conta excluída"}
                {" · "}
                {g.membros} membro(s) · {g.canais} canal(is) ·{" "}
                {g.mensagens.toLocaleString("pt-BR")} mensagem(ns)
              </p>
              <p className="mt-0.5 text-xs text-txt-faint">Criado em {dataCompleta(g.createdAt)}</p>
            </li>
          ))}
        </ul>
      </Estado>
    </>
  );
}
