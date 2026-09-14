"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_DISPLAY_NAME } from "@streamz/shared";
import AuthCard, { linkClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarRegistro } from "@/lib/auth-mensagens";
import { Button, Campo, Checkbox, TextInput } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";
import { ui } from "@/stores/ui";

export default function RegisterPage() {
  // `useSearchParams` exige Suspense no App Router (a página é pré-renderizada)
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

// Nome trocado de `Campo` para `NomeDoCampo`: o primitivo `Campo` (import
// acima, `@/components/ui/primitivos`) já ocupa esse nome nesta tela.
type NomeDoCampo = "email" | "username" | "password";

/**
 * De qual campo a mensagem de recusa fala.
 *
 * As frases vêm dos schemas de `@streamz/shared` e da API, sempre em pt-BR e
 * sempre nomeando o campo ("O usuário aceita apenas…", "A senha precisa…") — é
 * mais barato ler a frase do que fazer o contrato devolver o campo. Sem
 * palavra-chave, o erro fica no primeiro campo, que é onde o olho já está.
 */
function campoDoErro(mensagem: string): NomeDoCampo {
  const texto = mensagem.toLowerCase();
  if (texto.includes("senha")) return "password";
  if (texto.includes("usuário") || texto.includes("usuario")) return "username";
  return "email";
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // h-moderacao: quem chegou por um link de convite volta para ele depois de
  // criar a conta. Só caminho interno — `next` não redireciona para fora.
  const proximo = searchParams.get("next");
  const destino = proximo?.startsWith("/") && !proximo.startsWith("//") ? proximo : "/app";
  const setSession = useAuth((s) => s.setSession);
  const setUser = useAuth((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const campo = error ? campoDoErro(error) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const dados = {
      email: email.trim(),
      username: username.trim(),
      password,
    };
    const invalido = validarRegistro(dados);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await api.register(dados);
      setSession(user, tokens);
      const apelido = displayName.trim();
      if (apelido) {
        // o registro não recebe nome de exibição (`contaRegistroSchema` só tem
        // e-mail, usuário e senha): aplicamos logo depois, já com sessão em pé
        try {
          setUser(await api.updateProfile({ displayName: apelido }));
        } catch {
          ui.toast(
            "Conta criada, mas o nome de exibição não foi salvo. Ajuste em Configurações.",
            "error",
          );
        }
      }
      // sem etapa de confirmação: o registro não envia e-mail
      router.replace(destino);
    } catch (err) {
      setError(mensagemDeAuth(err, "registro"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Criar uma conta">
      {/*
        Redesenho medido no print 1:1 `publico/desktop/05-registro-viewport.png`
        (2880×1800 = 2×; a captura já é pt-BR) — autoridade mais alta que o
        catálogo/CSS avulso (ADR-0009 item 7). Cinco divergências da revisão
        de 2026-09-11 fecham aqui:

        1. Ordem e rótulo batem com o print, de cima a baixo: "E-mail"*,
           "Nome exibido" (sem "de" — o print mostra as duas palavras, não
           "Nome de exibição" que tínhamos), "Nome de usuário"*, "Senha"*,
           checkbox de e-mail, texto legal, botão
           "Criar conta", link "Já tem uma conta? Entre aqui" — nessa ordem,
           não com o link antes do botão como estava.
        2. Sem texto de ajuda sob os campos: o print não tem nenhum (só
           rótulo + caixa); por isso as três dicas fixas ("É como as
           pessoas...", "3 a 32 caracteres...", "Ao menos 6 caracteres.")
           saíram. A regra de senha/usuário continua valendo — só não tem
           mais uma frase permanente embaixo do campo, igual ao Discord.
        3. `Campo` (não o `FieldLabel` velho da `AuthCard`) porque o erro dele
           sai ABAIXO do controle, itálico, 12px, que é a
           `.errorMessage_b717a1` medida no cabeçalho de
           `primitivos/TextInput.tsx` — o `FieldLabel` põe o erro do lado do
           rótulo, que é outro componente do Discord, não este.
        4. "Data de nascimento" do print **não** entra: saiu de propósito em
           2026-08-26 (commit `561458a0`, migration
           `20260826120000_remover_data_de_nascimento`), decisão de produto
           anterior à ADR-0009. Não é "ainda não fizemos" — um "(em breve)"
           aqui prometeria a volta de algo que foi descartado.
        5. Checkbox de e-mail: o Discord vem marcado por padrão porque tem
           campo de consentimento de marketing no banco dele. O Streamz não
           tem nenhuma coluna equivalente (mesma busca que não achou
           `birthDate`) — então, pela mesma regra do item 4, o controle
           aparece **desmarcado e desabilitado**, com "(em breve)" no rótulo:
           marcá-lo sem um lugar para guardar a escolha seria fingir que a
           conta "concordou" com algo que a API nunca recebe.

        O texto legal deste `<p>` já dizia "do Streamz" antes da ADR-0009 —
        mantido, só a frase ficou mais perto do "Ao clicar em 'Criar conta'…"
        do print (Termos de Serviço/Política de Privacidade continuam sem
        link: não há rota `/terms` nem `/privacy` no app, e inventar uma fica
        fora deste cartão — ver "faltando").
      */}
      <form onSubmit={onSubmit} noValidate>
        <Campo
          rotulo="E-mail"
          htmlFor="email"
          obrigatorio
          erro={campo === "email" ? error : undefined}
          className="mb-5"
        >
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            erro={campo === "email"}
            autoFocus
          />
        </Campo>

        <Campo rotulo="Nome exibido" htmlFor="displayName" className="mb-5">
          <TextInput
            id="displayName"
            name="displayName"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loading}
            maxLength={MAX_DISPLAY_NAME}
          />
        </Campo>

        <Campo
          rotulo="Nome de usuário"
          htmlFor="username"
          obrigatorio
          erro={campo === "username" ? error : undefined}
          className="mb-5"
        >
          <TextInput
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            erro={campo === "username"}
          />
        </Campo>

        <Campo
          rotulo="Senha"
          htmlFor="password"
          obrigatorio
          erro={campo === "password" ? error : undefined}
          className="mb-5"
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            erro={campo === "password"}
          />
        </Campo>

        {/* Checkbox de e-mail: visível, desmarcado e desabilitado, "(em
            breve)" — item 5 da nota acima. Nunca entra em `dados`. */}
        <Checkbox
          id="registro-emails-opcionais"
          marcado={false}
          aoMudar={() => {}}
          desabilitado
          className="mb-5"
          rotulo="(Opcional) Tudo bem me mandar e-mails do Streamz com novidades, dicas e ofertas especiais (em breve). Você poderá mudar isso quando quiser."
        />

        <p className="mb-4 text-xs leading-4 text-text-muted">
          Ao clicar em <span className="font-medium text-text-default">“Criar conta”</span>, você
          concorda com os <span className="font-medium text-text-default">Termos de Serviço</span> e
          confirma que leu a{" "}
          <span className="font-medium text-text-default">Política de Privacidade</span> do Streamz.
        </p>

        <Button
          type="submit"
          variante="primario"
          tamanho="md"
          larguraTotal
          carregando={loading}
          className="mb-5 celular:h-[48px]"
        >
          Criar conta
        </Button>

        {/* Link único, do jeito que o print mostra a frase inteira como uma
            só cor de link — não "Já tem uma conta?" simples seguido de
            "Entre aqui" com outra tinta. Alinhado à esquerda: o print mostra
            o link rente à mesma margem dos rótulos, não centralizado (o botão
            é que ocupa a largura toda). */}
        <p className="text-sm">
          <Link
            href={destino === "/app" ? "/login" : `/login?next=${encodeURIComponent(destino)}`}
            className={linkClass}
          >
            Já tem uma conta? Entre aqui
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
