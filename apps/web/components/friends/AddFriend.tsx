"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitivos";
import { useFriends } from "@/stores/friends";

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
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** distingue as duas bordas de erro do Discord (ver comentário acima) */
  const [erroDoServidor, setErroDoServidor] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const limpo = nome.trim().replace(/^@/, "");
  const valido = limpo.length >= 3;

  async function enviar() {
    if (enviando) return;
    setSucesso(null);
    if (!valido) {
      setErro("O nome de usuário precisa de ao menos 3 caracteres.");
      setErroDoServidor(false);
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
      // "já são amigos" de "sem permissão"); aqui fica só a instrução do que
      // fazer em seguida — a store não devolve o motivo para diferenciar o texto
      setErro(`Não deu para enviar o pedido para @${limpo}. Confira o nome de usuário.`);
      setErroDoServidor(true);
    }
  }

  // cores do `--input-border-default`/`--text-link`/`--green-360`/
  // `--border-feedback-critical`/`--input-border-error-default`, medidas no
  // CSS acima — nenhuma é `--input-border-active` (o lime do resto do app):
  // este campo específico foca em azul no Discord real, não em marca.
  const borda = erroDoServidor
    ? "border-input-border-error-default bg-input-background-error-default"
    : erro
      ? "border-border-feedback-critical"
      : sucesso
        ? "border-green-360"
        : "border-input-border-default focus-within:border-text-link";

  return (
    /* título 20px bold, subtítulo 16px/20 — medido antes desta rodada e não
       tocado agora (a revisão não apontou os dois). */
    /* 16px de recuo no celular: com os 30 do desktop o campo e o botão de
       enviar dividiam 330px e o rótulo "Enviar pedido de amizade" espremia o
       campo a menos de 100px */
    /* `max-w-[544px]`: no print (`…124052.png`, janela de 1280) o conteúdo
       desta aba termina numa borda de 1px em x=920, e a coluna de canais
       termina em x=376 — 544px de coluna, com 30px de respiro de cada lado
       (o campo mede 484px de x=405 a x=889 dentro dela). No Discord essa
       borda é o painel "Ativo agora" (fora de escopo, ADR-0009 item 8); aqui
       o efeito é só o teto de largura, sem o painel — sem ele o campo e o
       texto esticavam para os dois lados da tela (medido: 1484px de x=405 a
       1888 numa janela de 1920). */
    <div className="max-w-[544px] px-[30px] pt-5 celular:px-4">
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
        /* raio 16, não 8: a curva do canto no print (`…124052.png`, canto
           superior esquerdo do campo) leva ~16px pra fechar, e bate com
           `.addFriendInputWrapper__72ba7{border-radius:16px}` do CSS acima —
           era `rounded-lg`, que é a metade. Altura (58px, via `p-3` + `h-8`)
           não mudou: a revisão não apontou essa medida como errada, e o CSS
           bruto do trecho (`padding:0 12px`) parece vir de uma variante sem
           o botão desta tela — o print é quem manda quando os dois divergem
           (ADR-0009 §7). */
        className={`mt-4 flex items-center gap-2 rounded-2xl border bg-input-background-default p-3 transition-colors ${borda} celular:flex-col celular:items-stretch`}
      >
        <input
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
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

      {/*
        Sem estado vazio ilustrado aqui: o print do Discord (`…124052.png`)
        não tem nenhuma arte no meio da tela nesta aba — o espaço abaixo do
        campo é ocupado pelo bloco "Outros lugares para fazer amigos" (título
        + "Explorar Servidores Públicos") ou fica vazio. Aquele bloco não
        entrou: aponta para descobrir/entrar em servidor público, que o
        Streamz ainda não tem (a API `api.discover`/`joinDiscoverable` existe
        em `lib/api.ts`, mas nenhuma tela a chama — o modal "entrar em
        servidor" é da onda 7). Sem destino, o botão seria "(em breve)" sem
        navegação nenhuma por trás, e o card pede para só entrar quando existe
        destino. A ilustração de balão gigante que estava aqui usava
        `EstadoVazio`/`arte="amigos"` — a mesma peça de "Você ainda não tem
        amigos" da aba Todos (`FriendsPage.tsx`), que faz sentido lá porque
        aquela aba É uma lista que pode estar vazia. Esta aba não é uma lista;
        é um formulário. Repetir a arte aqui era o "QUEBRADO" da revisão.
      */}
    </div>
  );
}
