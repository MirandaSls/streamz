"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { ehDispositivoMovel, resumoDoDispositivo } from "@streamz/shared";
import type { MfaSetup, MinhaConta, SessaoView } from "@streamz/shared";
import { Section } from "@/components/settings/controls";
import { CampoDeTexto, Erro } from "@/components/settings/campos";
import { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * "Privacidade e segurança": verificação em duas etapas, códigos de recuperação
 * e a lista de sessões ativas.
 *
 * As duas metades compartilham um dado — ligar/desligar o 2FA derruba nada, mas
 * encerrar sessões pode derrubar esta aba —, então a conta é recarregada depois
 * de cada operação em vez de ser adivinhada no cliente.
 */
export default function SegurancaTab() {
  const [conta, setConta] = useState<MinhaConta | null>(null);

  const carregar = useCallback(async () => {
    try {
      setConta(await api.account());
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar sua conta"), "error");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <BlocoDeMfa conta={conta} recarregar={carregar} />
      <BlocoDeSessoes />
    </>
  );
}

// ── 2FA ──────────────────────────────────────────────────────

function BlocoDeMfa({
  conta,
  recarregar,
}: {
  conta: MinhaConta | null;
  recarregar: () => Promise<void>;
}) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [desligando, setDesligando] = useState(false);
  const [regerando, setRegerando] = useState(false);
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function limpar() {
    setSetup(null);
    setDesligando(false);
    setRegerando(false);
    setCodigo("");
    setSenha("");
    setErro(null);
  }

  async function comecar() {
    setErro(null);
    setOcupado(true);
    try {
      setSetup(await api.mfaSetup());
    } catch (e) {
      setErro(mensagemDeAuth(e, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  async function ativar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const { recoveryCodes } = await api.mfaEnable(codigo.trim());
      limpar();
      setCodigosNovos(recoveryCodes);
      await recarregar();
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  async function desativar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.mfaDisable(senha, codigo.trim());
      limpar();
      setCodigosNovos(null);
      await recarregar();
      ui.toast("Verificação em duas etapas desligada.");
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  // a senha é pedida num campo `type="password"` aqui, e não no `ui.prompt`:
  // aquele diálogo é de texto simples e mostraria a senha na tela
  async function regerar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const { recoveryCodes } = await api.mfaRecoveryCodes(senha);
      limpar();
      setCodigosNovos(recoveryCodes);
      await recarregar();
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  const ligado = !!conta?.mfaEnabled;

  return (
    <Section title="Verificação em duas etapas">
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-txt-primary">
            {ligado ? (
              <ShieldCheck size={16} className="text-green" aria-hidden="true" />
            ) : (
              <ShieldOff size={16} className="text-txt-muted" aria-hidden="true" />
            )}
            {ligado ? "Ativa" : "Desativada"}
          </p>
          <p className="mt-0.5 text-xs text-txt-muted">
            {ligado
              ? `${conta?.recoveryCodesLeft ?? 0} código(s) de recuperação restante(s).`
              : "Um código de 6 dígitos do seu app autenticador, além da senha."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {ligado && (
            <button
              type="button"
              onClick={() => (regerando ? limpar() : (setDesligando(false), setRegerando(true)))}
              className="h-8 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover"
            >
              {regerando ? "Cancelar" : "Novos códigos"}
            </button>
          )}
          {ligado ? (
            <button
              type="button"
              onClick={() => (desligando ? limpar() : (setRegerando(false), setDesligando(true)))}
              className="h-8 rounded-[3px] border border-red px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
            >
              {desligando ? "Cancelar" : "Desativar"}
            </button>
          ) : (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => (setup ? limpar() : void comecar())}
              className="h-8 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
            >
              {setup ? "Cancelar" : "Ativar"}
            </button>
          )}
        </div>
      </div>

      {setup && (
        <form onSubmit={ativar} noValidate className="pt-3">
          <p className="mb-3 text-sm text-txt-normal">
            Leia o QR no seu app autenticador (Google Authenticator, Authy, 1Password…) e digite o
            código que ele mostrar.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrDataUrl}
              alt="QR code da verificação em duas etapas"
              width={160}
              height={160}
              className="rounded-[4px] bg-white p-2"
            />
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold uppercase text-txt-secondary">
                Ou digite o segredo
              </p>
              <code className="block break-all rounded-[3px] bg-rail px-2 py-1 text-sm text-txt-normal">
                {setup.secret}
              </code>
              <BotaoCopiar texto={setup.secret} rotulo="Copiar segredo" />
            </div>
          </div>
          <CampoDeTexto
            id="mfa-codigo"
            rotulo="Código do app"
            autoComplete="one-time-code"
            value={codigo}
            onChange={setCodigo}
            disabled={ocupado}
          />
          <Erro texto={erro} />
          <PrimaryButton type="submit" disabled={ocupado || !codigo.trim()}>
            {ocupado ? "Confirmando…" : "Ativar"}
          </PrimaryButton>
        </form>
      )}

      {regerando && (
        <form onSubmit={regerar} noValidate className="pt-3">
          <p className="mb-3 text-sm text-txt-normal">
            Os códigos atuais deixam de valer assim que os novos forem gerados.
          </p>
          <CampoDeTexto
            id="mfa-senha-regerar"
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={setSenha}
            disabled={ocupado}
          />
          <Erro texto={erro} />
          <PrimaryButton type="submit" disabled={ocupado || !senha}>
            {ocupado ? "Gerando…" : "Gerar novos códigos"}
          </PrimaryButton>
        </form>
      )}

      {desligando && (
        <form onSubmit={desativar} noValidate className="pt-3">
          <CampoDeTexto
            id="mfa-senha"
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={setSenha}
            disabled={ocupado}
          />
          <CampoDeTexto
            id="mfa-codigo-off"
            rotulo="Código do app ou de recuperação"
            autoComplete="one-time-code"
            value={codigo}
            onChange={setCodigo}
            disabled={ocupado}
          />
          <Erro texto={erro} />
          <PrimaryButton type="submit" danger disabled={ocupado || !senha || !codigo.trim()}>
            {ocupado ? "Aguarde…" : "Desativar verificação em duas etapas"}
          </PrimaryButton>
        </form>
      )}

      {codigosNovos && <CodigosDeRecuperacao codigos={codigosNovos} aoFechar={() => setCodigosNovos(null)} />}
    </Section>
  );
}

/**
 * Os códigos aparecem **uma única vez**: o servidor só guarda o hash. Por isso a
 * tela insiste em copiar/baixar antes de fechar.
 */
function CodigosDeRecuperacao({
  codigos,
  aoFechar,
}: {
  codigos: string[];
  aoFechar: () => void;
}) {
  const texto = codigos.join("\n");

  function baixar() {
    const blob = new Blob([`Códigos de recuperação do Streamz\n\n${texto}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streamz-codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 rounded-[4px] border border-yellow bg-panel p-3">
      <p className="mb-2 text-sm font-medium text-txt-primary">
        Guarde estes códigos agora — eles não aparecem de novo.
      </p>
      <ul className="mb-3 grid grid-cols-2 gap-1 font-mono text-sm text-txt-normal">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <BotaoCopiar texto={texto} rotulo="Copiar todos" />
        <button
          type="button"
          onClick={baixar}
          className="h-8 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover"
        >
          Baixar .txt
        </button>
        <SecondaryButton onClick={aoFechar}>Já guardei</SecondaryButton>
      </div>
    </div>
  );
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          })
          .catch(() => ui.toast("Não foi possível copiar", "error"));
      }}
      className="mt-2 flex h-8 items-center gap-1.5 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover"
    >
      <Copy size={14} aria-hidden="true" />
      {copiado ? "Copiado!" : rotulo}
    </button>
  );
}

// ── sessões ──────────────────────────────────────────────────

function BlocoDeSessoes() {
  const [sessoes, setSessoes] = useState<SessaoView[] | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setSessoes(await api.sessions());
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar suas sessões"), "error");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function encerrar(id: string) {
    try {
      await api.revokeSession(id);
      setSessoes((atuais) => atuais?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar a sessão"), "error");
    }
  }

  async function encerrarOutras() {
    const ok = await ui.confirm({
      title: "Encerrar as outras sessões?",
      message: "Todos os outros aparelhos vão precisar entrar de novo.",
      confirmLabel: "Encerrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.revokeOtherSessions();
      setSessoes((atuais) => atuais?.filter((s) => s.current) ?? null);
      ui.toast("Outras sessões encerradas.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível encerrar as sessões"), "error");
    }
  }

  const outras = (sessoes ?? []).filter((s) => !s.current);

  return (
    <Section title="Sessões ativas">
      <p className="mb-1 text-sm text-txt-muted">
        Cada aparelho conectado à sua conta. Encerrar uma sessão desconecta aquele aparelho.
      </p>

      {carregando && <p className="py-3 text-sm text-txt-muted">Carregando…</p>}

      {!carregando &&
        (sessoes ?? []).map((sessao) => (
          <div
            key={sessao.id}
            className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
          >
            {ehDispositivoMovel(sessao.userAgent) ? (
              <Smartphone size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
            ) : (
              <Laptop size={20} className="shrink-0 text-txt-muted" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-txt-primary">
                {resumoDoDispositivo(sessao.userAgent)}
                {sessao.current && (
                  <span className="ml-2 rounded-[3px] bg-green px-1.5 py-0.5 text-[11px] font-bold text-accent-ink">
                    Este aparelho
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-txt-muted">
                {sessao.ip ? `${sessao.ip} · ` : ""}
                desde {dataCurta(sessao.createdAt)}
                {sessao.lastUsedAt ? ` · usada em ${dataCurta(sessao.lastUsedAt)}` : ""}
              </p>
            </div>
            {!sessao.current && (
              <button
                type="button"
                onClick={() => void encerrar(sessao.id)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-red transition hover:bg-red hover:text-white"
              >
                <LogOut size={16} aria-hidden="true" />
                Encerrar
              </button>
            )}
          </div>
        ))}

      {!carregando && outras.length === 0 && (
        <p className="py-3 text-sm text-txt-muted">Nenhum outro aparelho conectado.</p>
      )}

      {outras.length > 0 && (
        <button
          type="button"
          onClick={() => void encerrarOutras()}
          className="mt-4 h-9 rounded-[3px] bg-red px-3 text-sm font-medium text-white hover:bg-red-hover"
        >
          Encerrar todas as outras
        </button>
      )}
    </Section>
  );
}

function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString();
}
