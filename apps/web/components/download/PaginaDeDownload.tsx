"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { API_URL } from "@/lib/config";
import { formatBytes } from "@/lib/format";

/**
 * Download do app de desktop, protegido por senha única.
 *
 * É a **raiz do site** (`streamz.chat`), montada por `app/page.tsx` — quem
 * chega pelo endereço puro quer o app, e quem quer o chat no navegador tem o
 * atalho "Abrir no navegador" logo abaixo do formulário. `/download` só
 * redireciona para cá, para não quebrar o link gravado em versões antigas.
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
export default function PaginaDeDownload() {
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
        subtitle="Este servidor ainda não publicou o app de desktop. Enquanto isso, dá para usar o Streamz no navegador."
      >
        <Link href="/app" className={`${submitClass} grid place-items-center`}>
          Abrir no navegador
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
          <Link href="/app" className={linkClass}>
            Abrir no navegador
          </Link>
        </p>
      </AuthCard>
    );
  }

  const disponivel = (p: DownloadPlataforma) =>
    catalogo?.disponiveis.some((d) => d.plataforma === p) ?? false;
  const escolhido = catalogo?.disponiveis.find((d) => d.plataforma === plataforma);
  const nota = escolhido && notaDePlataforma(escolhido.plataforma);

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
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border-strong bg-void text-txt-normal hover:border-border-strong-hover"
                }`}
              >
                {rotuloPlataforma(p)}
              </button>
            );
          })}
        </div>

        {escolhido?.plataforma === "macos" && <InstalarPeloTerminal />}

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
        {nota && <p className="mt-2 text-center text-xs text-txt-muted">{nota}</p>}

        {/* A raiz deixou de mandar direto para `/app`: sem este atalho, quem
            só usa o chat no navegador teria de saber o endereço de cor. */}
        <p className="mt-4 text-center text-sm text-txt-muted">
          Prefere não instalar?{" "}
          <Link href="/app" className={linkClass}>
            Abrir no navegador
          </Link>
        </p>
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

/** Base da API de produção — o padrão embutido no `public/instalar-mac.sh`. */
const API_PADRAO_DO_INSTALADOR = "https://api.streamz.chat";

/**
 * Aspeia um valor para entrar num comando de shell com segurança.
 *
 * `origem` e `API_URL` não são digitados por quem vê a tela — vêm de
 * `window.location.origin` e de configuração —, mas iam sem aspas para dentro
 * do `curl`/`STREAMZ_API=…`: um valor com espaço ou `&` quebraria o comando (e,
 * num ambiente que os controlasse, injetaria outro). Aspas simples, com o
 * único caractere que elas não escapam (`'`) fechado e reaberto por fora.
 */
function aspas(valor: string): string {
  return `'${valor.replaceAll("'", `'\\''`)}'`;
}

/**
 * Instalação do macOS pelo Terminal — a opção principal nessa plataforma.
 *
 * O app não é notarizado (não há conta Apple Developer). O `.dmg` baixado pelo
 * navegador ganha `com.apple.quarantine` e o Gatekeeper barra a primeira
 * abertura; o `curl` não põe quarentena, então pelo Terminal o app abre direto.
 * Não é um atalho que pula verificação: o `instalar-mac.sh` confere o selo da
 * assinatura e o identificador antes de copiar (e o certificado, com o pin).
 *
 * O endereço do script sai de `window.location.origin` para que homologação e
 * dev copiem o comando do próprio ambiente — o arquivo mora em `public/`, então
 * toda origem que serve esta página serve o script. A API só entra no comando
 * quando não é a de produção, e entra do lado do `bash`: um
 * `STREAMZ_API=… curl … | bash` definiria a variável para o `curl`, não para
 * quem a lê.
 */
function InstalarPeloTerminal() {
  const [origem, setOrigem] = useState("https://streamz.chat");
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  const codigoRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // no efeito, não no render: a página é pré-renderizada sem `window`, e ler
    // a origem durante o render desencontraria a hidratação. Fora de http(s)
    // (o `tauri://` do app de desktop) não há script servido — fica o padrão.
    const { protocol, origin } = window.location;
    if (protocol === "https:" || protocol === "http:") setOrigem(origin);
  }, []);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(null), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  const variavelDaApi =
    API_URL === API_PADRAO_DO_INSTALADOR ? "" : `STREAMZ_API=${aspas(API_URL)} `;
  const comando = `curl -fsSL ${aspas(origem)}/instalar-mac.sh | ${variavelDaApi}bash`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comando);
      setCopiado("sim");
    } catch {
      // `navigator.clipboard` só existe em contexto seguro (https/localhost) e
      // pode ser negado; sem ele, deixa o texto selecionado para o Cmd+C
      const el = codigoRef.current;
      const selecao = window.getSelection();
      if (el && selecao) {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        selecao.removeAllRanges();
        selecao.addRange(faixa);
      }
      setCopiado("falhou");
    }
  }

  return (
    <div className="mb-5" role="group" aria-labelledby="terminal-mac-titulo">
      <p
        id="terminal-mac-titulo"
        className="mb-2 font-display text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
      >
        Instalar pelo Terminal (recomendado)
      </p>
      <div className="flex gap-2">
        <code
          ref={codigoRef}
          className="flex h-10 min-w-0 flex-1 select-all items-center overflow-x-auto whitespace-nowrap rounded-[3px] border border-black/30 bg-void px-2.5 font-mono text-xs text-txt-normal celular:h-[48px]"
        >
          {comando}
        </code>
        <button
          type="button"
          onClick={copiar}
          className="h-10 shrink-0 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover celular:h-[48px]"
        >
          {copiado === "sim" ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-txt-muted">
        {copiado === "falhou"
          ? "Não deu para copiar sozinho — o comando ficou selecionado, use Cmd+C."
          : "Pelo Terminal o app abre direto, sem o aviso do macOS. Ele pede a mesma senha."}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {copiado === "sim" ? "Comando copiado" : ""}
      </p>
      <p className="mt-4 text-center text-xs uppercase tracking-[0.02em] text-txt-muted">
        ou baixe o .dmg
      </p>
    </div>
  );
}

/**
 * Instrução curta de pós-download, só para as plataformas onde o sistema
 * atravessa no caminho — Windows e Android abrem o instalador de um duplo
 * clique/toque normal e não precisam de nada aqui.
 *
 * O `.dmg` do macOS é **universal** (Intel e Apple Silicon/M1–M4): o
 * `User-Agent` não diz o chip, então não haveria como escolher build por ele
 * mesmo se quiséssemos — `detectarPlataforma` não muda por causa disso.
 *
 * O desvio do Gatekeeper mudou no macOS 15 (Sequoia): o "botão direito →
 * Abrir" deixou de liberar app não notarizado, e o caminho passou a ser Ajustes
 * do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim", que só aparece
 * depois de uma tentativa de abrir (e vale por cerca de uma hora). Fontes:
 * - https://developer.apple.com/news/?id=saqachfa ("Updates to runtime
 *   protection in macOS Sequoia": "users will no longer be able to
 *   Control-click to override Gatekeeper")
 * - https://support.apple.com/guide/mac-help/mh40616/15.0/mac/15.0 (15: só
 *   Privacidade e Segurança → Abrir Mesmo Assim)
 * - https://support.apple.com/guide/mac-help/mh40616/14.0/mac/14.0 (14 e
 *   anteriores: Control-clique no app → Abrir)
 */
function notaDePlataforma(p: DownloadPlataforma): ReactNode | null {
  if (p === "macos") {
    return (
      <>
        Arraste para Aplicativos. Na primeira abertura o macOS bloqueia (o app
        não é notarizado pela Apple): no macOS 15 ou mais novo, tente abrir e
        vá em Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim;
        no 12 ao 14, clique com o botão direito no app → Abrir.
      </>
    );
  }
  if (p === "linux") {
    return (
      <>
        É um AppImage (x86_64): dê permissão de execução com{" "}
        <code className="font-mono">chmod +x Streamz_*.AppImage</code> e abra.
      </>
    );
  }
  return null;
}

function mensagemDeErro(erro: unknown): string {
  if (isApiError(erro, 401)) return "Senha incorreta";
  if (isApiError(erro, 429)) return "Muitas tentativas — espere um minuto";
  if (isApiError(erro, 404) || isApiError(erro, 503)) return (erro as Error).message;
  return "Não foi possível liberar o download. Tente de novo.";
}
