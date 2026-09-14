"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard, { linkClass } from "@/components/auth/AuthCard";
import { Button, Campo, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarSenha } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

/**
 * Cria a senha nova a partir do link do e-mail.
 *
 * Redefinir **derruba todas as sessões** na API — inclusive esta aba, se havia
 * uma. Por isso a tela limpa a sessão local antes de mandar para o login: sem
 * isso o app abriria com tokens que já não valem e cairia em 401 na primeira
 * requisição.
 *
 * Esta é a mesma URL que o Discord usa (`/reset?token=…`, print 1:1
 * `publico/desktop/03-esqueci-senha-reset-viewport.png` e o HTML capturado
 * `03-esqueci-senha-reset.html`), então dá pra copiar 1:1 (cartão
 * 7m-senha-e-verificacao):
 * - Título medido: **"Alterar sua senha"** (`<h1 class="title__921c5">`),
 *   não "Criar uma senha nova" — sem subtítulo (o Discord não tem um aqui;
 *   `AuthCard` já não recebe `subtitle` para este caso).
 * - Campo único "Nova senha" (rótulo idêntico ao que já tínhamos), obrigatório
 *   — mesmo HTML: `<label>Nova senha<div class="required__5a838"
 *   style="color: var(--text-feedback-critical)">*</div></label>`.
 * - Botão texto medido: **"Mudar senha"** (`<span
 *   class="lineClamp1__4bd52">Mudar senha</span>`), não "Salvar senha";
 *   `md`/`primario`/`larguraTotal`, que já bate
 *   (`button_a22cb0 md_a22cb0 primary_a22cb0 hasText_a22cb0
 *   fullWidth_a22cb0`).
 * - `<p role="alert" aria-live="polite" className="sr-only">` duplicado
 *   removido: o cabeçalho de `Campo`
 *   (`primitivos/TextInput.tsx`) já registra que o `role="alert"` embutido
 *   no primitivo tornou esta linha morta, e ela não tinha saído daqui ainda.
 * - **Falta** (não reproduzido): acima do título, o Discord tem uma
 *   ilustração própria (`<img class="marginBottom20_fd297e"
 *   src="/assets/e61405de377a632d.svg">`, 20px de respiro até o `<h1>`) — um
 *   baú com uma senha sendo digitada. É arte da Discord Inc., não um ícone
 *   de interface (`icones.tsx` não serve, e este cartão não pode criar
 *   componente novo fora de `app/reset-password/page.tsx`/`forgot-password`/
 *   `verify-email`). Registrado em "faltando": o padrão certo para repor
 *   isso é uma ilustração **nossa**, como `Ilustracao` de
 *   `components/friends/EstadoVazio.tsx` (traço + limão, derivado da marca,
 *   não copiado do Discord) — decisão de outro cartão, porque esse arquivo
 *   não está nesta lista.
 * - Link "Voltar ao login" abaixo do botão: **divergência consciente**, o
 *   Discord não tem nada aqui (o `</form>` fecha direto depois do botão no
 *   HTML capturado). Mantido porque, sem ele, quem cai num link de
 *   redefinição vencido (`token` presente mas a API recusa no `onSubmit`)
 *   ficava sem saída visível além do logotipo — troquei só a classe para a
 *   constante `linkClass` de `AuthCard`, que `login`/`register` já usam.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const logout = useAuth((s) => s.logout);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !token) return;
    const invalido = validarSenha(password);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      logout();
      setPronto(true);
    } catch (err) {
      setError(mensagemDeAuth(err, "conta"));
      setLoading(false);
    }
  }

  if (pronto) {
    return (
      <AuthCard
        title="Senha alterada"
        subtitle="Todas as sessões foram encerradas. Entre de novo com a senha nova."
      >
        <Button
          type="button"
          onClick={() => router.replace("/login")}
          variante="primario"
          tamanho="md"
          larguraTotal
          className="celular:h-[48px]"
          autoFocus
        >
          Ir para o login
        </Button>
      </AuthCard>
    );
  }

  if (token === null) {
    return (
      <AuthCard
        title="Link inválido"
        subtitle="Este endereço não traz um token de redefinição. Peça um link novo."
      >
        <Button href="/forgot-password" variante="primario" tamanho="md" larguraTotal className="celular:h-[48px]">
          Pedir um link novo
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Alterar sua senha">
      <form onSubmit={onSubmit} noValidate>
        <Campo rotulo="Nova senha" htmlFor="password" obrigatorio erro={error} className="mb-2">
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            erro={!!error}
            autoFocus
          />
        </Campo>

        <Button
          type="submit"
          disabled={!password}
          carregando={loading}
          variante="primario"
          tamanho="md"
          larguraTotal
          className="celular:h-[48px]"
        >
          Mudar senha
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
