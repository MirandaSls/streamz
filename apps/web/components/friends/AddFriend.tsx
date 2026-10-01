"use client";

import { useState } from "react";
import { MAX_FRIEND_REQUEST_MESSAGE_LENGTH, USERNAME_MIN, normalizarUsername } from "@streamz/shared";
import { Button } from "@/components/ui/primitivos";
import { ChevronRight, Compass } from "@/components/ui/icones";
import { useFriends } from "@/stores/friends";
import { ui } from "@/stores/ui";

/**
 * Aba "Adicionar amigo": o campo de nome de usuário.
 *
 * Só username — nome de exibição não é único, então não serve de endereço. O
 * `@` colado pelo usuário é aceito e removido pela store.
 *
 * A borda do campo é o retorno visual do resultado, em três cores distintas
 * (não duas): recusa do **cliente** (nome curto demais, ainda sem ir ao
 * servidor), recusa do **servidor** (nome não existe, já são amigos, bloqueio
 * — o `send` da store não expõe qual) e sucesso. É a mesma distinção de duas
 * classes do próprio Discord — `.addFriendInputWrapper__72ba7.error__72ba7`
 * (só borda) e `.addFriendInputWrapper__72ba7.errorWithBg__72ba7` (borda **e**
 * fundo, mais forte) — em
 * `docs/referencias-discord/tokens/css-bruto/516201.1df2ad3badeeb4aa.css`:
 * a primeira é o formato mais leve de "ainda não tentou", a segunda é o "o
 * servidor recusou". "Sem permissão" (conta restrita, bloqueio) cai na mesma
 * cor de recusa do servidor — a store não devolve motivo estruturado para
 * abrir um quarto estado; só o texto abaixo do campo muda.
 */
export default function AddFriend() {
  const send = useFriends((s) => s.send);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** distingue as duas bordas de erro do Discord (ver comentário acima) */
  const [erroDoServidor, setErroDoServidor] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const limpo = normalizarUsername(nome);
  const valido = limpo.length >= USERNAME_MIN;

  async function enviar() {
    if (enviando) return;
    setSucesso(null);
    if (!valido) {
      setErro(`O nome de usuário precisa de ao menos ${USERNAME_MIN} caracteres.`);
      setErroDoServidor(false);
      return;
    }
    setErro(null);
    setEnviando(true);
    const texto = mensagem.trim();
    const ok = await send(limpo, texto || undefined);
    setEnviando(false);
    if (ok) {
      setSucesso(`Pronto! O pedido de amizade para @${limpo} saiu.`);
      setNome("");
      setMensagem("");
    } else {
      // a razão exata veio no aviso da store; aqui fica só a instrução do que
      // fazer em seguida — a store não devolve o motivo para diferenciar o texto
      setErro(`Não deu para enviar o pedido para @${limpo}. Confira o nome de usuário.`);
      setErroDoServidor(true);
    }
  }

  // nenhuma é `--input-border-active` (o lime do resto do app): este campo
  // específico foca em azul no Discord real, não em marca.
  const borda = erroDoServidor
    ? "border-input-border-error-default bg-input-background-error-default"
    : erro
      ? "border-border-feedback-critical"
      : sucesso
        ? "border-green-360"
        : "border-input-border-default focus-within:border-text-link";

  return (
    /* sem teto de largura na coluna: ela ocupa o espaço disponível (o painel
       "Ativo agora" é de outro arquivo); só o texto e a caixa têm teto, para
       não esticar em tela larga. 16px de recuo no celular. */
    <div className="px-[30px] pt-5 celular:px-4">
      <h2 className="text-xl font-bold leading-6 text-text-strong">Adicionar amigo</h2>
      <p className="mt-2 max-w-[1100px] text-base leading-5 text-text-default">
        Você pode adicionar amigos com o nome de usuário do Streamz.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        /* caixa única: linha do nome + botão, separador, textarea de mensagem.
           A borda de estado (erro/sucesso/foco) vale para a caixa inteira. */
        className={`mt-4 max-w-[1100px] rounded-2xl border bg-input-background-default transition-colors ${borda}`}
      >
        {/* no celular o campo fica em cima e o botão embaixo, com 44px: lado a
            lado o botão deixava o campo com menos de 100px úteis */}
        <div className="flex items-center gap-2 p-3 celular:flex-col celular:items-stretch">
          <input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value.toLowerCase());
              setErro(null);
              setErroDoServidor(false);
              setSucesso(null);
            }}
            disabled={enviando}
            aria-label="Nome de usuário"
            aria-invalid={erro ? true : undefined}
            placeholder="Insira um nome de usuário"
            maxLength={33}
            className="h-8 min-w-0 flex-1 bg-transparent text-base text-text-default outline-none placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 celular:h-[44px]"
          />
          <Button
            type="submit"
            variante="primario"
            tamanho="sm"
            disabled={!valido || enviando}
            className="shrink-0 celular:h-[44px]"
          >
            {enviando ? "Enviando…" : "Enviar pedido de amizade"}
          </Button>
        </div>
        <div className="mx-3 border-t border-border-subtle" />
        {/* Enter aqui quebra linha de propósito: só o input do nome envia */}
        <div className="relative px-3 pb-2 pt-3">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            disabled={enviando}
            aria-label="Mensagem do pedido de amizade"
            placeholder="Personalize sua solicitação (opcional)"
            maxLength={MAX_FRIEND_REQUEST_MESSAGE_LENGTH}
            rows={3}
            className="block w-full resize-none bg-transparent text-base leading-5 text-text-default outline-none placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div
            aria-live="off"
            className="mt-1 text-right text-xs text-text-muted"
          >
            {MAX_FRIEND_REQUEST_MESSAGE_LENGTH - mensagem.length}
          </div>
        </div>
      </form>

      <p className="mt-2 max-w-[1100px] text-xs leading-4 text-text-muted">
        O que você escrever aqui também aparecerá nas suas mensagens diretas se vocês se tornarem amigos.
      </p>

      {(erro || sucesso) && (
        <p
          role={erro ? "alert" : "status"}
          aria-live="polite"
          className={`mt-2 text-sm ${erro ? "text-status-danger" : "text-status-positive"}`}
        >
          {erro ?? sucesso}
        </p>
      )}

      <div className="mt-6 border-t border-border-subtle" />

      <section className="max-w-[1100px] pb-6 pt-6">
        <h3 className="text-base font-bold leading-5 text-text-strong">Outros lugares para fazer amigos</h3>
        <p className="mt-2 text-sm leading-5 text-text-default">
          Ninguém vem à cabeça? Confira nossa lista de servidores públicos que tem todas as tribos, de jogos à culinária, música, anime e muito mais.
        </p>
        {/* não há tela de descoberta no app (api.discover existe, sem UI): o
            destino mais próximo é o modal "entrar em um servidor" */}
        <button
          type="button"
          onClick={() => ui.openModal({ kind: "criarServidor", tela: "entrar" })}
          className="mt-4 flex w-full items-center gap-4 rounded-lg border border-border-subtle bg-input-background-default p-4 text-left transition-colors hover:bg-interactive-background-hover focus-visible:outline-2 focus-visible:outline-text-link"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-positive text-control-primary-text-default"
          >
            <Compass size={24} />
          </span>
          <span className="min-w-0 flex-1 text-base font-bold text-text-strong">Explorar Servidores Públicos</span>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
        </button>
      </section>
    </div>
  );
}
