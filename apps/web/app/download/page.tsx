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
  inputClass,
  linkClass,
  submitClass,
} from "@/components/auth/AuthCard";
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
        <button
          type="button"
          onClick={() => setBaixando(null)}
          className={submitClass}
        >
          Baixar de novo
        </button>
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
      subtitle="O app de desktop ainda é fechado. Informe a senha de acesso para baixar."
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="plataforma-windows">Sistema operacional</FieldLabel>
        <div
          role="radiogroup"
          aria-label="Sistema operacional"
          className="mb-5 grid grid-cols-3 gap-2"
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
                className={`h-10 rounded-[3px] border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 max-md:h-12 ${
                  ativo
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border-strong bg-void text-txt-normal hover:border-border-strong-hover"
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
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          disabled={loading}
          aria-invalid={erro ? true : undefined}
          className={inputClass}
          autoFocus
        />

        <p role="alert" aria-live="polite" className="sr-only">
          {erro}
        </p>

        <button
          type="submit"
          disabled={loading || !senha.trim() || !plataforma}
          className={submitClass}
        >
          {loading ? "Verificando…" : "Baixar"}
        </button>

        {escolhido && (
          <p className="mt-3 text-center text-sm text-txt-muted">
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
  // Android também casa com "Linux" no UA; não há build para ele, e chutar
  // Linux num celular seria pior do que não pré-selecionar nada
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
}

function mensagemDeErro(erro: unknown): string {
  if (isApiError(erro, 401)) return "Senha incorreta";
  if (isApiError(erro, 429)) return "Muitas tentativas — espere um minuto";
  if (isApiError(erro, 404) || isApiError(erro, 503)) return (erro as Error).message;
  return "Não foi possível liberar o download. Tente de novo.";
}
