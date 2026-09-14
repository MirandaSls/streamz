"use client";

import { useState } from "react";
import Link from "next/link";
import AuthCard, { linkClass } from "@/components/auth/AuthCard";
import { Button, Campo, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";

/**
 * "Esqueci a senha".
 *
 * A resposta é sempre a mesma, exista ou não a conta — a API não revela quem
 * tem cadastro, e a tela não pode desmentir isso mostrando dois textos
 * diferentes.
 *
 * **Sem tela própria no Discord** (cartão 7m-senha-e-verificacao): lá
 * "Esqueceu sua senha?" valida **na própria tela de login**
 * (`publico/desktop/04-esqueci-senha-erro-SIMULADO.html`: clique com o
 * e-mail vazio devolve "Este campo é obrigatório" ainda em cima do
 * formulário "Boas-vindas de volta!", sem navegar). O Streamz mantém a rota
 * própria (`/forgot-password`, decisão de navegação de onda anterior, fora
 * do escopo deste cartão) — o que muda aqui é a peça por dentro, para a
 * medida do Discord.
 *
 * Redesenho (cartão 7m-senha-e-verificacao):
 * - Rótulo + erro trocam de `FieldLabel` (o erro entrava *dentro* do
 *   rótulo, como " - Este campo é obrigatório", escondendo o asterisco) por
 *   `Campo`, que posiciona o erro **abaixo do controle** com `role="alert"`
 *   embutido — bate com o Discord medido: no HTML acima o erro mora em
 *   `.helperTextContainer__5a838`, irmão de `.control__5a838`, não filho do
 *   `<label>`; o asterisco de obrigatório (`.required__5a838`) continua
 *   visível ao lado do rótulo com o erro embaixo, o que `FieldLabel` não
 *   fazia. Falta ainda o ícone de "!" de 16px que o Discord põe antes do
 *   texto do erro (mesmo HTML, `<svg fill="var(--text-feedback-critical)">`)
 *   e o peso normal (`text-xs/normal`) em vez do itálico peso 500 que
 *   `Campo` usa — é medida de outro módulo do Discord
 *   (`.errorMessage_b717a1`, cabeçalho de `primitivos/TextInput.tsx`); só o
 *   dono de `primitivos` decide qual dos dois generalizar (ver "faltando").
 * - Botão: texto fixo "Enviar link" com `carregando` (os três pontos que
 *   deslizam no lugar do texto, `.spinnerItem_a22cb0`, cabeçalho de
 *   `primitivos/Button.tsx`) no lugar de trocar o texto para "Enviando…" —
 *   é o carregamento medido do botão do Discord, que o primitivo já
 *   implementa; a tela não precisa reimplementar com texto.
 * - Tela de sucesso: `<Link className={submitClass}>` (regra própria, sem
 *   hover/active documentados) trocado por `<Button href>` — o primitivo já
 *   desenha `<a>` com o mesmo visual do `<button>` (rodada c1-button),
 *   então ganha hover/active/foco do Discord de graça.
 * - Link de apoio ("Voltar ao login"): usa `linkClass` de `AuthCard` (o
 *   mesmo par `--text-link`/sublinhado no hover que `app/login/page.tsx` e
 *   `app/register/page.tsx` já usam) em vez de repetir a string de classes.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(mensagemDeAuth(err, "conta"));
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        subtitle="Se houver uma conta com esse e-mail, o link de redefinição acabou de sair. Ele vale por 1 hora."
      >
        <Button href="/login" variante="primario" tamanho="md" larguraTotal className="celular:h-[48px]">
          Voltar ao login
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Redefinir a senha"
      subtitle="Informe o e-mail da conta e mandamos um link para criar uma senha nova."
    >
      <form onSubmit={onSubmit} noValidate>
        {/* mb-5 = 20px, o mesmo `marginBottom20_fd297e` (`--custom-margin-
            margin-medium`, css-bruto/351200.*.css) que separa campo e botão
            no formulário de senha do Discord — confirma a medida que já
            tínhamos, não é valor novo. */}
        <Campo rotulo="E-mail" htmlFor="email" obrigatorio erro={error} className="mb-5">
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            erro={!!error}
            autoFocus
          />
        </Campo>

        <Button
          type="submit"
          variante="primario"
          tamanho="md"
          larguraTotal
          disabled={!email.trim()}
          carregando={loading}
          className="celular:h-[48px]"
        >
          Enviar link
        </Button>

        <p className="mt-2 text-sm">
          <Link href="/login" className={linkClass}>
            Voltar ao login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
