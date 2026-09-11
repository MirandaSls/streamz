"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ShieldCheck, ShieldOff } from "@/components/ui/icones";
import type { MfaSetup, MinhaConta } from "@streamz/shared";
import { RadioCards, Section } from "@/components/ui/controls";
import { CampoDeTexto, Erro } from "@/components/settings/campos";
import {
  usePrivacidade,
  type FiltroDeConteudo,
  type QuemPodeChamar,
} from "@/stores/privacidade";
import { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";
import { useConta } from "@/stores/conta";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * "Privacidade e segurança": verificação em duas etapas, filtro de conteúdo,
 * quem pode te chamar e o que fazer com os seus dados.
 *
 * A lista de sessões **não** está aqui: ela é a aba "Dispositivos". Ter as duas
 * mostrando a mesma lista significava duas telas para encerrar a mesma sessão,
 * e nenhuma das duas era a resposta óbvia para "onde eu deslogo o outro
 * computador".
 *
 * A conta é recarregada depois de cada operação de 2FA em vez de ser adivinhada
 * no cliente — quantos códigos de recuperação sobraram é conta do servidor.
 */
export default function SegurancaTab() {
  // a conta vive numa store, e não aqui: `account.updated` chega a todas as
  // conexões da pessoa, e ligar o 2FA num aparelho tem de aparecer no outro
  const conta = useConta((s) => s.conta);
  const carregar = useConta((s) => s.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <BlocoDeMfa conta={conta} recarregar={carregar} />
      <BlocoDeFiltro />
      <BlocoDeMensagens />
      <BlocoDeDados conta={conta} />
    </>
  );
}

// ── privacidade ──────────────────────────────────────────────

function BlocoDeFiltro() {
  const filtro = usePrivacidade((s) => s.filtro);
  const set = usePrivacidade((s) => s.set);

  return (
    <Section title="Filtro de conteúdo explícito">
      <RadioCards<FiltroDeConteudo>
        legend="Filtro de conteúdo explícito"
        legendaOculta
        columns={1}
        value={filtro}
        onChange={(v) => set({ filtro: v })}
        options={[
          {
            value: "todos",
            label: "Filtrar tudo",
            hint: "Toda imagem enviada em conversa direta é analisada.",
          },
          {
            value: "naoAmigos",
            label: "Filtrar de quem não é meu amigo",
            hint: "O padrão: seus amigos passam, o resto é analisado.",
          },
          {
            value: "nenhum",
            label: "Não filtrar",
            hint: "Nada é analisado. Por sua conta e risco.",
          },
        ]}
      />
    </Section>
  );
}

function BlocoDeMensagens() {
  const quem = usePrivacidade((s) => s.quemPodeChamar);
  const set = usePrivacidade((s) => s.set);

  return (
    <Section title="Quem pode te mandar mensagem">
      <RadioCards<QuemPodeChamar>
        legend="Quem pode te mandar mensagem"
        legendaOculta
        columns={1}
        value={quem}
        onChange={(v) => set({ quemPodeChamar: v })}
        options={[
          { value: "todos", label: "Qualquer pessoa" },
          { value: "amigosDeAmigos", label: "Amigos de amigos" },
          { value: "amigos", label: "Apenas meus amigos" },
        ]}
      />
      <p className="pt-3 text-xs text-text-muted">
        Bloquear alguém encerra a conversa dos dois lados, independente desta escolha.
      </p>
    </Section>
  );
}

/**
 * "Dados e privacidade" com a única ação que o app consegue cumprir hoje:
 * baixar o que a própria API já devolve sobre a conta. Um botão de "solicitar
 * meus dados" que abre um chamado inexistente seria pior que não ter botão.
 */
function BlocoDeDados({ conta }: { conta: MinhaConta | null }) {
  const [ocupado, setOcupado] = useState(false);

  async function baixar() {
    setOcupado(true);
    try {
      const [perfil, sessoes] = await Promise.all([api.me(), api.sessions().catch(() => [])]);
      const dados = JSON.stringify({ conta, perfil, sessoes }, null, 2);
      const url = URL.createObjectURL(new Blob([dados], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "streamz-meus-dados.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível montar o arquivo"), "error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Section title="Dados e privacidade" semDivisoria>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-strong">Baixar meus dados</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Um arquivo com a sua conta, o seu perfil e as suas sessões ativas.
          </p>
        </div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void baixar()}
          className="flex h-8 celular:h-[44px] shrink-0 items-center gap-1.5 rounded-[3px] bg-border-normal px-3 text-sm font-medium text-text-default hover:bg-border-strong disabled:opacity-50"
        >
          <Download size={14} aria-hidden="true" />
          {ocupado ? "Montando…" : "Baixar"}
        </button>
      </div>
    </Section>
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
    <Section title="Segurança da conta">
      <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-text-strong">
            {ligado ? (
              <ShieldCheck size={16} className="text-status-positive" aria-hidden="true" />
            ) : (
              <ShieldOff size={16} className="text-text-muted" aria-hidden="true" />
            )}
            {ligado ? "Ativa" : "Desativada"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
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
              className="h-8 celular:h-[44px] rounded-[3px] bg-border-normal px-3 text-sm font-medium text-text-default hover:bg-border-strong"
            >
              {regerando ? "Cancelar" : "Novos códigos"}
            </button>
          )}
          {ligado ? (
            <button
              type="button"
              onClick={() => (desligando ? limpar() : (setRegerando(false), setDesligando(true)))}
              className="h-8 celular:h-[44px] rounded-[3px] border border-status-danger px-3 text-sm font-medium text-status-danger transition hover:bg-status-danger hover:text-white"
            >
              {desligando ? "Cancelar" : "Desativar"}
            </button>
          ) : (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => (setup ? limpar() : void comecar())}
              className="h-8 celular:h-[44px] rounded-[3px] bg-brand-500 px-3 text-sm font-medium text-control-primary-text-default transition hover:bg-control-primary-background-hover disabled:opacity-50"
            >
              {setup ? "Cancelar" : "Ativar"}
            </button>
          )}
        </div>
      </div>

      {setup && (
        <form onSubmit={ativar} noValidate className="pt-3">
          <p className="mb-3 text-sm text-text-default">
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
              <p className="mb-1 text-xs font-bold uppercase text-text-subtle">
                Ou digite o segredo
              </p>
              <code className="block break-all rounded-[3px] bg-input-background-default px-2 py-1 text-sm text-text-default">
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
          <p className="mb-3 text-sm text-text-default">
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
    <div className="mt-4 rounded-[4px] border border-status-warning bg-background-base-lowest p-3">
      <p className="mb-2 text-sm font-medium text-text-strong">
        Guarde estes códigos agora — eles não aparecem de novo.
      </p>
      <ul className="mb-3 grid grid-cols-2 gap-1 font-mono text-sm text-text-default">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <BotaoCopiar texto={texto} rotulo="Copiar todos" />
        <button
          type="button"
          onClick={baixar}
          className="h-8 celular:h-[44px] rounded-[3px] bg-border-normal px-3 text-sm font-medium text-text-default hover:bg-border-strong"
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
      className="mt-2 flex h-8 celular:h-[44px] items-center gap-1.5 rounded-[3px] bg-border-normal px-3 text-sm font-medium text-text-default hover:bg-border-strong"
    >
      <Copy size={14} aria-hidden="true" />
      {copiado ? "Copiado!" : rotulo}
    </button>
  );
}
