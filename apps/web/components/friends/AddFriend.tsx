"use client";

import { useState } from "react";
import EstadoVazio from "@/components/friends/EstadoVazio";
import { Button } from "@/components/ui/primitivos";
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

  const borda = erro ? "border-status-danger" : sucesso ? "border-status-positive" : "border-border-subtle";

  return (
    /* medido no print do Discord: título 20px bold em caixa mista com a caixa
       alta a 25px da borda do cabeçalho; subtítulo 16px/20; o campo 58px de
       altura (12px de respiro em volta do botão de 32) com raio 8 */
    /* 16px de recuo no celular: com os 30 do desktop o campo e o botão de
       enviar dividiam 330px e o rótulo "Enviar pedido de amizade" espremia o
       campo a menos de 100px */
    <div className="px-[30px] pt-5 celular:px-4">
      <h2 className="text-xl font-bold leading-6 text-text-strong">Adicionar amigo</h2>
      <p className="mt-2 text-base leading-5 text-text-default">
        Você pode adicionar amigos com o nome de usuário do Streamz.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        /* No celular a caixa vira duas linhas: o campo em cima e o botão
           embaixo, os dois com 44px. Lado a lado numa tela de 390 o botão
           ("Enviar pedido de amizade", 190px) deixava o campo com menos de
           100px de largura útil, e os dois ficavam com 31px de altura. */
        className={`mt-4 flex items-center gap-2 rounded-lg border bg-input-background-default p-3 ${borda} focus-within:border-brand-500 celular:flex-col celular:items-stretch`}
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
          placeholder="Insira um nome de usuário"
          maxLength={33}
          className="h-8 min-w-0 flex-1 bg-transparent text-base text-text-default outline-none placeholder:text-text-muted celular:h-[44px]"
        />
        {/* o botão mora DENTRO do campo, à direita: 32px de altura, raio 8, na
            cor accent. Era raio 3 com 36 de altura. */}
        <Button
          type="submit"
          variante="primario"
          tamanho="sm"
          disabled={!valido || enviando}
          className="shrink-0 celular:h-[44px]"
        >
          {enviando ? "Enviando…" : "Enviar pedido de amizade"}
        </Button>
      </form>

      {(erro || sucesso) && (
        <p
          role={erro ? "alert" : "status"}
          aria-live="polite"
          className={`mt-2 text-sm ${erro ? "text-status-danger" : "text-status-positive"}`}
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
