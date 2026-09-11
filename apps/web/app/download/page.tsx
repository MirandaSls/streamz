"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DOWNLOAD_PLATAFORMAS,
  rotuloPlataforma,
  type DownloadCatalogo,
  type DownloadPlataforma,
} from "@streamz/shared";
import AuthCard, {
  FieldLabel,
  linkClass,
  submitClass,
} from "@/components/auth/AuthCard";
import { Button, TextInput } from "@/components/ui/primitivos";
import { api, isApiError } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/**
 * Download do app de desktop, protegido por senha única.
 *
 * A senha **não** é conferida aqui: esta tela só a envia. Quem decide é
 * `POST /api/downloads/token`, e o arquivo só sai por uma rota que exige o
 * token que essa checagem emite — abrir o DevTools e chamar a função de
 * sucesso na mão não produz nada, porque o link ainda não existe.
 *
 * O seletor de sistema vem do catálogo (`GET /api/downloads`), que diz para
 * quais plataformas existe instalador. Sem isso a pessoa escolheria "macOS",
 * digitaria a senha certa e receberia um erro — culpa do formulário, não dela.
 */
export default function DownloadPage() {
  const [catalogo, setCatalogo] = useState<DownloadCatalogo | null>(null);
  const [plataforma, setPlataforma] = useState<DownloadPlataforma | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .downloadCatalogo()
      .then((c) => {
        if (!vivo) return;
        setCatalogo(c);
        // pré-seleciona o sistema de quem abriu, mas só se houver build para
        // ele — caso contrário a primeira opção disponível
        const detectada = detectarPlataforma();
        const tem = (p: DownloadPlataforma) =>
          c.disponiveis.some((d) => d.plataforma === p);
        setPlataforma(
          detectada && tem(detectada)
            ? detectada
            : (c.disponiveis[0]?.plataforma ?? detectada),
        );
      })
      .catch(() => {
        if (vivo) setCatalogo({ configurado: true, disponiveis: [] });
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !plataforma) return;
    setErro(null);
    setLoading(true);
    try {
      const autorizado = await api.downloadAutorizar(senha, plataforma);
      // navegação direta: o browser assume a transferência (barra de progresso,
      // pausar, retomar). Um fetch+blob teria de segurar o instalador inteiro
      // na memória da aba antes de salvar.
      window.location.href = autorizado.url;
      setBaixando(autorizado.filename);
      setSenha("");
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setLoading(false);
    }
  }

  if (catalogo?.configurado === false) {
    return (
      <AuthCard
        title="Download indisponível"
        subtitle="Este servidor ainda não publicou o app de desktop. Tente de novo mais tarde."
      >
        <Link href="/" className={`${submitClass} grid place-items-center`}>
          Voltar ao início
        </Link>
      </AuthCard>
    );
  }

  if (baixando) {
    return (
      <AuthCard
        title="O download começou"
        subtitle={`Se nada aconteceu, o navegador pode ter bloqueado — informe a senha de novo para gerar um link novo (${baixando}).`}
      >
        <Button
          type="button"
          variante="primario"
          tamanho="md"
          larguraTotal
          onClick={() => setBaixando(null)}
          className="celular:h-[48px]"
        >
          Baixar de novo
        </Button>
        <p className="mt-4 text-center text-sm">
          <Link href="/" className={linkClass}>
            Voltar ao início
          </Link>
        </p>
      </AuthCard>
    );
  }

  const disponivel = (p: DownloadPlataforma) =>
    catalogo?.disponiveis.some((d) => d.plataforma === p) ?? false;
  const escolhido = catalogo?.disponiveis.find((d) => d.plataforma === plataforma);

  return (
    <AuthCard
      title="Baixar o Streamz"
      subtitle="O app ainda é fechado. Informe a senha de acesso para baixar."
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="plataforma-windows">Sistema</FieldLabel>
        <div
          role="radiogroup"
          aria-label="Sistema operacional"
          // duas colunas desde que o Android entrou: quatro botões numa grade
          // de três deixavam um sozinho na segunda linha, com o dobro da
          // largura dos outros
          className="mb-5 grid grid-cols-2 gap-2"
        >
          {DOWNLOAD_PLATAFORMAS.map((p) => {
            const ativo = p === plataforma;
            const tem = disponivel(p);
            return (
              <button
                key={p}
                id={`plataforma-${p}`}
                type="button"
                role="radio"
                aria-checked={ativo}
                disabled={loading || (!!catalogo && !tem)}
                onClick={() => setPlataforma(p)}
                className={`h-10 rounded-[3px] border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 celular:h-[48px] ${
                  ativo
                    ? "border-brand-500 bg-brand-500 text-control-primary-text-default"
                    : "border-border-normal bg-input-background-default text-text-default hover:border-border-strong"
                }`}
              >
                {rotuloPlataforma(p)}
              </button>
            );
          })}
        </div>

        <FieldLabel htmlFor="senha" invalid={!!erro} hint={erro ?? undefined}>
          Senha de acesso
        </FieldLabel>
        <TextInput
          id="senha"
          name="senha"
          type="password"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          disabled={loading}
          erro={!!erro}
          classeDaCaixa="mb-5"
          autoFocus
        />

        <p role="alert" aria-live="polite" className="sr-only">
          {erro}
        </p>

        <Button
          type="submit"
          variante="primario"
          tamanho="md"
          larguraTotal
          carregando={loading}
          disabled={!senha.trim() || !plataforma}
          className="celular:h-[48px]"
        >
          Baixar
        </Button>

        {escolhido && (
          <p className="mt-3 text-center text-sm text-text-muted">
            {rotuloPlataforma(escolhido.plataforma)} · {formatBytes(escolhido.tamanho)}
          </p>
        )}
      </form>
    </AuthCard>
  );
}

/** Sistema provável de quem abriu a página, só para pré-selecionar o seletor. */
function detectarPlataforma(): DownloadPlataforma | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  // Android **antes** de Linux: o UA de um Android também casa com "Linux", e
  // trocar a ordem daria o instalador errado a todo telefone. O iPhone
  // continua sem opção — não há `.ipa` para instalar à mão.
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
}

function mensagemDeErro(erro: unknown): string {
  if (isApiError(erro, 401)) return "Senha incorreta";
  if (isApiError(erro, 429)) return "Muitas tentativas — espere um minuto";
  if (isApiError(erro, 404) || isApiError(erro, 503)) return (erro as Error).message;
  return "Não foi possível liberar o download. Tente de novo.";
}
