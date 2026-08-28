"use client";

import { useState } from "react";
import EstadoVazio from "@/components/friends/EstadoVazio";
import { useFriends } from "@/stores/friends";

/**
 * Aba "Adicionar amigo": o campo de nome de usuário.
 *
 * Só username — nome de exibição não é único, então não serve de endereço. O
 * `@` colado pelo usuário é aceito e removido pela store.
 *
 * A borda do campo é o retorno visual do resultado (verde = pedido saiu,
 * vermelho = recusado), com a frase logo abaixo. O aviso flutuante da store
 * continua existindo, mas some sozinho: quem errou o nome precisa da mensagem
 * ainda na tela enquanto corrige.
 */
export default function AddFriend() {
  const send = useFriends((s) => s.send);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const limpo = nome.trim().replace(/^@/, "");
  const valido = limpo.length >= 3;

  async function enviar() {
    if (enviando) return;
    setSucesso(null);
    if (!valido) {
      setErro("O nome de usuário precisa de ao menos 3 caracteres.");
      return;
    }
    setErro(null);
    setEnviando(true);
    const ok = await send(nome);
    setEnviando(false);
    if (ok) {
      setSucesso(`Pronto! O pedido de amizade para @${limpo} saiu.`);
      setNome("");
    } else {
      // a razão exata veio no aviso da store (a API distingue "não existe" de
      // "já são amigos"); aqui fica a instrução do que fazer em seguida
      setErro(`Não deu para enviar o pedido para @${limpo}. Confira o nome de usuário.`);
    }
  }

  const borda = erro ? "border-red" : sucesso ? "border-green" : "border-border";

  return (
    <div className="px-[30px] pt-4">
      <h2 className="font-display text-xs font-bold uppercase tracking-[0.02em] text-txt-primary">
        Adicionar amigo
      </h2>
      <p className="mt-2 text-sm text-txt-muted">
        Você pode adicionar amigos com o nome de usuário do Streamz.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className={`mt-4 flex items-center gap-2 rounded-lg border bg-rail p-2 pl-4 ${borda} focus-within:border-accent`}
      >
        <input
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setErro(null);
            setSucesso(null);
          }}
          aria-label="Nome de usuário"
          aria-invalid={erro ? true : undefined}
          placeholder="Digite o nome de usuário"
          maxLength={33}
          className="h-9 min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
        />
        <button
          type="submit"
          disabled={!valido || enviando}
          className="h-9 shrink-0 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar pedido de amizade"}
        </button>
      </form>

      {(erro || sucesso) && (
        <p
          role={erro ? "alert" : "status"}
          aria-live="polite"
          className={`mt-2 text-sm ${erro ? "text-red" : "text-green"}`}
        >
          {erro ?? sucesso}
        </p>
      )}

      <EstadoVazio
        arte="amigos"
        titulo="Não há ninguém por aqui…"
        texto="Quem aceitar o seu pedido aparece na lista de amigos — e a conversa abre na hora."
      />
    </div>
  );
}
