"use client";

import { useState } from "react";
import { useFriends } from "@/stores/friends";

/**
 * Aba "Adicionar amigo": o campo de nome de usuário do Discord.
 *
 * Só username — nome de exibição não é único, então não serve de endereço. O
 * `@` colado pelo usuário é aceito e removido pela store.
 */
export default function AddFriend() {
  const send = useFriends((s) => s.send);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  const valido = nome.trim().replace(/^@/, "").length >= 3;

  async function enviar() {
    if (!valido || enviando) return;
    setEnviando(true);
    const ok = await send(nome);
    setEnviando(false);
    if (ok) setNome("");
  }

  return (
    <div className="px-[30px] pt-4">
      <h2 className="text-base font-bold uppercase tracking-[0.02em] text-txt-primary">
        Adicionar amigo
      </h2>
      <p className="mt-2 text-sm text-txt-muted">
        Você pode adicionar amigos pelo nome de usuário. Ele diferencia maiúsculas de minúsculas.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="mt-4 flex items-center gap-2 rounded-lg bg-rail p-2 pl-4 focus-within:ring-1 focus-within:ring-accent"
      >
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome de usuário"
          placeholder="Digite o nome de usuário"
          maxLength={33}
          className="h-9 min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
        />
        <button
          type="submit"
          disabled={!valido || enviando}
          className="h-9 shrink-0 rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar pedido de amizade"}
        </button>
      </form>
    </div>
  );
}
