"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, BadgeCheck, Camera, KeyRound, LogOut, TriangleAlert } from "lucide-react";
import { MAX_DISPLAY_NAME, displayNameOf } from "@newdisc/shared";
import type { MinhaConta } from "@newdisc/shared";
import { Section } from "@/components/settings/controls";
import { CampoDeTexto, Erro } from "@/components/settings/campos";
import { PrimaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarSenha } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Minha conta": perfil (nome de exibição e avatar), e-mail, senha e fim de
 * vida da conta.
 *
 * Perfil e credenciais moram na mesma aba de propósito — é o que o Discord faz
 * e o que a tela anterior já mostrava. O que muda aqui é que "alterar senha",
 * "e-mail" e "desativar/excluir" deixaram de ser blocos desativados.
 */
export default function ContaTab() {
  const router = useRouter();
  const closeModal = useUI((s) => s.closeModal);
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const [conta, setConta] = useState<MinhaConta | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const dirty = (user?.displayName ?? "") !== displayName.trim();

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      setUser(await api.updateProfile({ displayName: displayName.trim() || null }));
      ui.toast("Perfil salvo.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      setUser(await api.updateAvatar(file));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível trocar o avatar"), "error");
    } finally {
      setUploading(false);
    }
  }

  function sair() {
    closeModal();
    logout();
    router.replace("/login");
  }

  return (
    <>
      <Section title="Minha conta">
        {user && (
          <div className="overflow-hidden rounded-lg bg-footer">
            <div className="h-[60px] bg-accent" />
            <div className="px-4 pb-4">
              <div className="-mt-8 flex items-end gap-3">
                <div className="relative rounded-full border-[6px] border-footer">
                  <Avatar user={user} size="xl" surface="border-footer" />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAvatar(f);
                      e.target.value = "";
                    }}
                  />
                  <Tooltip label="Trocar avatar">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      aria-label="Trocar avatar"
                      className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-panel text-txt-primary shadow-high hover:bg-hov disabled:opacity-50"
                    >
                      <Camera size={16} />
                    </button>
                  </Tooltip>
                </div>
                <div className="min-w-0 pb-2">
                  <div className="truncate text-xl font-bold text-txt-primary">
                    {displayNameOf(user)}
                  </div>
                  <div className="truncate text-sm text-txt-muted">@{user.username}</div>
                </div>
              </div>
              {uploading && <p className="mt-2 text-xs text-txt-muted">Enviando avatar…</p>}
            </div>
          </div>
        )}

        <label
          htmlFor="displayName"
          className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary"
        >
          Nome de exibição
        </label>
        <input
          id="displayName"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          placeholder={user?.username}
          className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        />
        <p className="mt-1 text-xs text-txt-muted">
          É o nome que aparece nas mensagens. Vazio = usar @{user?.username}.
        </p>
        <div className="mt-3">
          <PrimaryButton disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </PrimaryButton>
        </div>
      </Section>

      <BlocoDeEmail conta={conta} aoMudar={setConta} />
      <BlocoDeSenha />
      <BlocoDeEncerramento conta={conta} aoEncerrar={sair} />

      <button
        type="button"
        onClick={sair}
        className="flex h-9 w-full items-center gap-2 rounded-[3px] px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
      >
        <LogOut size={16} aria-hidden="true" />
        Sair
      </button>
    </>
  );
}

// ── e-mail ───────────────────────────────────────────────────

function BlocoDeEmail({
  conta,
  aoMudar,
}: {
  conta: MinhaConta | null;
  aoMudar: (conta: MinhaConta) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function reenviar() {
    setOcupado(true);
    try {
      await api.resendMyVerification();
      ui.toast("Link de confirmação enviado.");
    } catch (e) {
      ui.toast(mensagemDeAuth(e, "conta"), "error");
    } finally {
      setOcupado(false);
    }
  }

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      aoMudar(await api.changeEmail(email.trim(), senha));
      setAbrindo(false);
      setEmail("");
      setSenha("");
      ui.toast("E-mail alterado. Confirme pelo link que acabamos de enviar.");
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Section title="E-mail">
      <div className="flex items-center justify-between gap-4 border-b border-[#3f4147] py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-txt-primary">
            <AtSign size={16} aria-hidden="true" />
            {conta?.email ?? "Nenhum e-mail cadastrado"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs">
            {conta?.emailVerified ? (
              <span className="flex items-center gap-1 text-green">
                <BadgeCheck size={14} aria-hidden="true" /> Confirmado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow">
                <TriangleAlert size={14} aria-hidden="true" /> Não confirmado
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {conta && !conta.emailVerified && conta.email && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void reenviar()}
              className="h-8 rounded-[3px] bg-[#4e5058] px-3 text-sm font-medium text-txt-normal hover:bg-[#6d6f78] disabled:opacity-50"
            >
              Reenviar
            </button>
          )}
          <button
            type="button"
            onClick={() => setAbrindo((v) => !v)}
            className="h-8 rounded-[3px] bg-[#4e5058] px-3 text-sm font-medium text-txt-normal hover:bg-[#6d6f78]"
          >
            {abrindo ? "Cancelar" : "Alterar"}
          </button>
        </div>
      </div>

      {abrindo && (
        <form onSubmit={trocar} noValidate className="pt-3">
          <CampoDeTexto
            id="novo-email"
            rotulo="Novo e-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            disabled={ocupado}
          />
          <CampoDeTexto
            id="senha-email"
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={setSenha}
            disabled={ocupado}
          />
          <Erro texto={erro} />
          <PrimaryButton type="submit" disabled={ocupado || !email.trim() || !senha}>
            {ocupado ? "Salvando…" : "Alterar e-mail"}
          </PrimaryButton>
        </form>
      )}
    </Section>
  );
}

// ── senha ────────────────────────────────────────────────────

function BlocoDeSenha() {
  const [abrindo, setAbrindo] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    const invalida = validarSenha(nova);
    if (invalida) {
      setErro(invalida);
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      await api.changePassword(atual, nova);
      setAbrindo(false);
      setAtual("");
      setNova("");
      ui.toast("Senha alterada. As outras sessões foram encerradas.");
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Section title="Senha">
      <div className="flex items-center justify-between gap-4 border-b border-[#3f4147] py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-txt-primary">
            <KeyRound size={16} aria-hidden="true" /> Senha da conta
          </p>
          <p className="mt-0.5 text-xs text-txt-muted">
            Trocar a senha encerra as sessões dos outros aparelhos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbrindo((v) => !v)}
          className="h-8 shrink-0 rounded-[3px] bg-[#4e5058] px-3 text-sm font-medium text-txt-normal hover:bg-[#6d6f78]"
        >
          {abrindo ? "Cancelar" : "Alterar"}
        </button>
      </div>

      {abrindo && (
        <form onSubmit={trocar} noValidate className="pt-3">
          <CampoDeTexto
            id="senha-atual"
            rotulo="Senha atual"
            type="password"
            autoComplete="current-password"
            value={atual}
            onChange={setAtual}
            disabled={ocupado}
          />
          <CampoDeTexto
            id="senha-nova"
            rotulo="Nova senha"
            type="password"
            autoComplete="new-password"
            value={nova}
            onChange={setNova}
            disabled={ocupado}
          />
          <Erro texto={erro} />
          <PrimaryButton type="submit" disabled={ocupado || !atual || !nova}>
            {ocupado ? "Salvando…" : "Alterar senha"}
          </PrimaryButton>
        </form>
      )}
    </Section>
  );
}

// ── desativar / excluir ──────────────────────────────────────

function BlocoDeEncerramento({
  conta,
  aoEncerrar,
}: {
  conta: MinhaConta | null;
  aoEncerrar: () => void;
}) {
  const [acao, setAcao] = useState<"disable" | "delete" | null>(null);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const excluindo = acao === "delete";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado || !acao) return;
    const ok = await ui.confirm({
      title: excluindo ? "Excluir a conta?" : "Desativar a conta?",
      message: excluindo
        ? "A conta é anonimizada e não volta. Suas mensagens permanecem nas conversas, sem o seu nome."
        : "Você sai de todos os aparelhos. Entrar de novo reativa a conta.",
      confirmLabel: excluindo ? "Excluir" : "Desativar",
      danger: true,
    });
    if (!ok) return;

    setErro(null);
    setOcupado(true);
    try {
      if (excluindo) await api.deleteAccount(senha, codigo.trim() || undefined);
      else await api.disableAccount(senha);
      aoEncerrar();
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
      setOcupado(false);
    }
  }

  return (
    <Section title="Encerrar a conta">
      <div className="flex flex-wrap gap-2 border-b border-[#3f4147] pb-3">
        <button
          type="button"
          onClick={() => setAcao(acao === "disable" ? null : "disable")}
          className="h-8 rounded-[3px] border border-red px-3 text-sm font-medium text-red transition hover:bg-red hover:text-white"
        >
          Desativar conta
        </button>
        <button
          type="button"
          onClick={() => setAcao(acao === "delete" ? null : "delete")}
          className="h-8 rounded-[3px] bg-red px-3 text-sm font-medium text-white transition hover:bg-red-hover"
        >
          Excluir conta
        </button>
      </div>
      <p className="pt-2 text-xs text-txt-muted">
        Desativar é reversível: a conta volta quando você entra de novo. Excluir anonimiza o
        usuário para sempre.
      </p>

      {acao && (
        <form onSubmit={confirmar} noValidate className="pt-3">
          <CampoDeTexto
            id="senha-encerrar"
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={setSenha}
            disabled={ocupado}
          />
          {excluindo && conta?.mfaEnabled && (
            <CampoDeTexto
              id="codigo-encerrar"
              rotulo="Código da verificação em duas etapas"
              autoComplete="one-time-code"
              value={codigo}
              onChange={setCodigo}
              disabled={ocupado}
            />
          )}
          <Erro texto={erro} />
          <PrimaryButton type="submit" danger disabled={ocupado || !senha}>
            {ocupado ? "Aguarde…" : excluindo ? "Excluir minha conta" : "Desativar minha conta"}
          </PrimaryButton>
        </form>
      )}
    </Section>
  );
}
