"use client";

import { useState } from "react";
import Link from "next/link";
import { exigeMfa, type AuthSession } from "@streamz/shared";
import { FieldLabel, inputClass, linkClass } from "@/components/auth/AuthCard";
import Dialog, { PrimaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarLogin } from "@/lib/auth-mensagens";
import { cabeMaisUma, lerCofreDoDisco, LIMITE_DE_CONTAS } from "@/lib/contas";
import { assumirSessao } from "@/lib/troca-de-contas";
import { useUI } from "@/stores/ui";

/**
 * "Adicionar conta": entrar com outra conta **sem** derrubar a que está aberta.
 *
 * Medido no print `2026-09-03 202822`, na mesma escala 1,25 do irmão
 * `202931` (ver `GerenciarContasModal`): título de 20/700, subtítulo de 16,
 * campos de ~41 e botão de 40 no rodapé, com "Voltar" solto na ponta esquerda.
 *
 * O que **não** foi copiado, e por quê:
 *
 * - **A metade direita** (QR code e "Ou entre com uma passkey") ficou de fora
 *   por decisão do usuário. Isso muda a caixa: sem a segunda coluna some também
 *   o vão vertical de ~110px que só existia para o formulário acompanhar a
 *   altura do QR. A caixa vira a `Dialog` de 480 do app, de uma coluna.
 * - **"E-mail ou número de telefone"** virou "E-mail ou usuário": o
 *   `/auth/login` daqui aceita e-mail ou username e não conhece telefone.
 *   Pedir um telefone que a API recusaria é pior do que divergir do print.
 * - **Os rótulos** usam o `FieldLabel` do app (caixa-alta, 12/700), que é como
 *   toda tela de conta nossa desenha rótulo. O print traz a variante recente do
 *   Discord, em caixa normal; trocar só aqui deixaria este modal falando uma
 *   língua diferente do `/login` que ele imita.
 *
 * Entrar aqui **não** mexe na sessão em uso até dar certo: `api.login` não toca
 * nos tokens, e é `assumirSessao` — a última linha do caminho feliz — que grava
 * o par novo, registra no cofre e recarrega o app já como a outra conta. Se a
 * senha estiver errada, a conta de antes segue aberta atrás do modal.
 */
export default function AdicionarContaModal({ voltar }: { voltar: boolean }) {
  const closeModal = useUI((s) => s.closeModal);
  const openModal = useUI((s) => s.openModal);

  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  // segundo fator: o ticket é curto e só liga os dois passos — não vai ao disco
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function fechar() {
    closeModal();
    if (voltar) openModal({ kind: "gerenciarContas" });
  }

  async function entrar(e?: React.FormEvent) {
    e?.preventDefault();
    if (enviando) return;
    const invalido = validarLogin(identificador.trim(), password);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.login(identificador.trim(), password);
      if (exigeMfa(r)) {
        setTicket(r.ticket);
        setPassword("");
        setEnviando(false);
        return;
      }
      concluir(r);
    } catch (err) {
      setErro(mensagemDeAuth(err, "login"));
      setEnviando(false);
    }
  }

  async function enviarCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    if (enviando || !ticket) return;
    setErro(null);
    setEnviando(true);
    try {
      concluir(await api.loginMfa(ticket, code.trim()));
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
      setEnviando(false);
    }
  }

  /**
   * O limite só é conferido **depois** do login bem-sucedido, e de propósito.
   *
   * Antes, o botão desabilitado de "Gerenciar contas" já avisa. Aqui a conta
   * pode ser uma que já está no cofre (reentrar numa sessão expirada não ocupa
   * vaga nenhuma), e isso só dá para saber com o `id` na mão.
   */
  function concluir(sessao: AuthSession) {
    if (!cabeMaisUma(lerCofreDoDisco(), sessao.user.id)) {
      setErro(
        `Você já tem ${LIMITE_DE_CONTAS} contas neste dispositivo. Remova uma antes de adicionar outra.`,
      );
      setEnviando(false);
      return;
    }
    // termina em `location.replace`: não há estado para limpar depois
    assumirSessao(sessao.user, sessao.tokens);
  }

  if (ticket) {
    return (
      <Dialog
        telaCheiaNoCelular
        title="Verificação em duas etapas"
        description="Esta conta pede um código do app autenticador."
        onClose={fechar}
        footer={
          <>
            <PrimaryButton
              disabled={enviando || !code.trim()}
              onClick={() => void enviarCodigo()}
            >
              {enviando ? "Verificando…" : "Continuar"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setTicket(null)}
              className="mr-auto text-base text-txt-normal transition hover:underline"
            >
              Voltar
            </button>
          </>
        }
      >
        <form onSubmit={enviarCodigo} noValidate>
          <FieldLabel htmlFor="conta-code" invalid={!!erro} hint={erro ?? undefined}>
            Código de autenticação
          </FieldLabel>
          <input
            id="conta-code"
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={enviando}
            aria-invalid={erro ? true : undefined}
            className={`${inputClass} tracking-[0.3em]`}
            autoFocus
          />
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog
      telaCheiaNoCelular
      title="Adicionar conta"
      description="Entrar com outra conta tornará mais fácil alternar entre contas neste dispositivo."
      onClose={fechar}
      footer={
        <>
          <PrimaryButton disabled={enviando} onClick={() => void entrar()}>
            {enviando ? "Entrando…" : "Continuar"}
          </PrimaryButton>
          {/*
            "Voltar" na ponta esquerda: o rodapé da Dialog é `row-reverse`, então
            quem empurra para longe do primário é `mr-auto`, não `ml-auto`.
          */}
          <button
            type="button"
            onClick={fechar}
            className="mr-auto text-base text-txt-normal transition hover:underline"
          >
            Voltar
          </button>
        </>
      }
    >
      {/*
        O `<form>` fica só pelo Enter: quem dispara é o "Continuar" do rodapé,
        que a `Dialog` renderiza fora daqui.
      */}
      <form onSubmit={entrar} noValidate>
        <FieldLabel htmlFor="conta-identificador" invalid={!!erro} hint={erro ?? undefined}>
          E-mail ou usuário
        </FieldLabel>
        <input
          id="conta-identificador"
          name="identificador"
          autoComplete="username"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          disabled={enviando}
          aria-invalid={erro ? true : undefined}
          className={inputClass}
          autoFocus
        />

        <FieldLabel htmlFor="conta-password" invalid={!!erro}>
          Senha
        </FieldLabel>
        <input
          id="conta-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={enviando}
          aria-invalid={erro ? true : undefined}
          className={`${inputClass} mb-2`}
        />
        <p className="text-sm">
          <Link href="/forgot-password" className={linkClass}>
            Esqueceu sua senha?
          </Link>
        </p>

        <p role="alert" aria-live="polite" className="sr-only">
          {erro}
        </p>
      </form>
    </Dialog>
  );
}
