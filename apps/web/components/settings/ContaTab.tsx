"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, TriangleAlert } from "@/components/ui/icones";
import { ACCEPT_IMAGEM_DE_PERFIL, MAX_DISPLAY_NAME, displayNameOf } from "@streamz/shared";
import type { MinhaConta } from "@streamz/shared";
import { Section } from "@/components/ui/controls";
import { CampoDeTexto, ESTILO_CAMPO, Erro } from "@/components/settings/campos";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { PrimaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarSenha } from "@/lib/auth-mensagens";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import { useConta } from "@/stores/conta";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * "Minha conta": o cartão de perfil e, abaixo dele, uma **linha por dado** com
 * o botão "Editar" à direita — nome de exibição, nome de usuário, e-mail.
 *
 * O formulário só existe depois do "Editar" de propósito: com todos os campos
 * abertos ao mesmo tempo, a tela vira um cadastro e não fica claro o que já
 * está salvo e o que ainda não. Fechado, a linha é só a resposta à pergunta
 * "qual é o meu e-mail mesmo?".
 *
 * Quem sai da conta faz isso pelo menu lateral do shell — ter o mesmo "Sair"
 * duas vezes na mesma tela só criava a dúvida de se os dois fazem o mesmo.
 *
 * O banner do cartão é o **mesmo** do perfil (aba "Perfil"), e por isso vem do
 * `GET /users/:id/profile`: ele não cabe no `PublicUser` da sessão. Uma faixa
 * fixa aqui fazia a troca do banner parecer que não tinha pego.
 */
export default function ContaTab() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  // a conta é da pessoa, não da aba: mora numa store para o `account.updated`
  // do outro aparelho chegar aqui (ver `stores/conta`)
  const conta = useConta((s) => s.conta);
  const carregar = useConta((s) => s.carregar);
  const aplicarConta = useConta((s) => s.aplicar);
  const [banner, setBanner] = useState<{ url: string | null; cor: string | null }>({
    url: null,
    cor: null,
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // só a aba visível fica montada, então voltar de "Perfil" já traz o banner
  // recém-trocado; falha aqui não é erro de tela — o cartão cai na cor padrão
  const meuId = user?.id;
  useEffect(() => {
    if (!meuId) return;
    let vivo = true;
    api
      .profile(meuId)
      .then((p) => {
        if (vivo) setBanner({ url: p.bannerUrl, cor: p.bannerColor });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [meuId]);

  // mesmo caminho da aba "Perfil": escolher o arquivo abre o enquadramento, e
  // só o recorte sobe — menos GIF, que sobe inteiro (a animação não sobrevive
  // ao canvas do recorte)
  async function escolherAvatar(file: File) {
    const recortado = await ui.recortarImagem(file, "avatar");
    if (recortado) await uploadAvatar(recortado);
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

  return (
    <>
      <Section id="minha-conta" title={t("conta.secMinhaConta")}>
        {user && (
          <div className="overflow-hidden rounded-lg bg-footer">
            {banner.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.url} alt="" className="h-[60px] w-full object-cover" />
            ) : (
              <div
                className="h-[60px] w-full bg-accent"
                style={banner.cor ? { backgroundColor: banner.cor } : undefined}
              />
            )}
            <div className="px-4 pb-4">
              <div className="-mt-8 flex items-end gap-3">
                <div className="relative rounded-full border-[6px] border-footer">
                  <Avatar user={user} size="xl" surface="border-footer" />
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT_IMAGEM_DE_PERFIL}
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void escolherAvatar(f);
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

        <div className="mt-4 rounded-lg bg-footer px-4 py-1">
          <LinhaDeNomeDeExibicao />
          <Linha
            rotulo="Nome de usuário"
            valor={user ? `@${user.username}` : "—"}
            // sem rota de troca de username na API: mostrar um "Editar" que
            // não leva a lugar nenhum seria pior do que não ter o botão
          />
          <LinhaDeEmail conta={conta} aoMudar={aplicarConta} />
        </div>
      </Section>

      <BlocoDeSenha />
      <BlocoDeEncerramento conta={conta} />
    </>
  );
}

// ── linhas ───────────────────────────────────────────────────

/** Uma linha "rótulo em caixa-alta / valor / ação à direita". */
function Linha({
  rotulo,
  valor,
  acao,
  abaixo,
}: {
  rotulo: string;
  valor: ReactNode;
  acao?: ReactNode;
  /** formulário que aparece quando a linha está em edição. */
  abaixo?: ReactNode;
}) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
            {rotulo}
          </p>
          <div className="mt-0.5 truncate text-sm text-txt-primary">{valor}</div>
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {abaixo}
    </div>
  );
}

function BotaoDeLinha({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal transition hover:bg-border-strong-hover"
    >
      {children}
    </button>
  );
}

function LinhaDeNomeDeExibicao() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(user?.displayName ?? "");

  const original = user?.displayName ?? "";
  const dirty = editando && valor.trim() !== original;

  // a barra de "alterações não salvas" do shell é quem salva esta linha
  useAlteracoesNaoSalvas({
    dirty,
    salvar: async () => {
      try {
        setUser(await api.updateProfile({ displayName: valor.trim() || null }));
        setEditando(false);
        ui.toast("Perfil salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar"), "error");
      }
    },
    redefinir: () => {
      setValor(original);
      setEditando(false);
    },
  });

  return (
    <Linha
      rotulo="Nome de exibição"
      valor={original || `@${user?.username ?? ""}`}
      acao={
        <BotaoDeLinha
          onClick={() => {
            setValor(original);
            setEditando((v) => !v);
          }}
        >
          {editando ? "Cancelar" : "Editar"}
        </BotaoDeLinha>
      }
      abaixo={
        editando && (
          <div className="pt-3">
            <input
              value={valor}
              maxLength={MAX_DISPLAY_NAME}
              autoFocus
              onChange={(e) => setValor(e.target.value)}
              placeholder={user?.username}
              aria-label="Nome de exibição"
              className={ESTILO_CAMPO}
            />
            <p className="mt-1 text-xs text-txt-muted">
              É o nome que aparece nas mensagens. Vazio = usar @{user?.username}.
            </p>
          </div>
        )
      }
    />
  );
}

function LinhaDeEmail({
  conta,
  aoMudar,
}: {
  conta: MinhaConta | null;
  aoMudar: (conta: MinhaConta) => void;
}) {
  const [editando, setEditando] = useState(false);
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
      setEditando(false);
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
    <Linha
      rotulo="E-mail"
      valor={
        <span className="flex items-center gap-2">
          <span className="truncate">{conta?.email ?? "Nenhum e-mail cadastrado"}</span>
          {conta &&
            (conta.emailVerified ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-green">
                <BadgeCheck size={14} aria-hidden="true" /> Confirmado
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 text-xs text-yellow">
                <TriangleAlert size={14} aria-hidden="true" /> Não confirmado
              </span>
            ))}
        </span>
      }
      acao={
        <div className="flex gap-2">
          {conta && !conta.emailVerified && conta.email && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void reenviar()}
              className="h-8 rounded-[3px] bg-border-strong px-3 text-sm font-medium text-txt-normal hover:bg-border-strong-hover disabled:opacity-50"
            >
              Reenviar
            </button>
          )}
          <BotaoDeLinha onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar" : "Editar"}
          </BotaoDeLinha>
        </div>
      }
      abaixo={
        editando && (
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
        )
      }
    />
  );
}

// ── senha ────────────────────────────────────────────────────

function BlocoDeSenha() {
  const t = useT();
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
    <Section id="senha" title={t("conta.secSenha")}>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-txt-primary">Senha da conta</p>
          <p className="mt-0.5 text-xs text-txt-muted">
            Trocar a senha encerra as sessões dos outros aparelhos.
          </p>
        </div>
        <BotaoDeLinha onClick={() => setAbrindo((v) => !v)}>
          {abrindo ? "Cancelar" : "Alterar senha"}
        </BotaoDeLinha>
      </div>

      {abrindo && (
        <form onSubmit={trocar} noValidate className="pt-1">
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

/**
 * O fim de vida da conta fica numa seção própria no fim da aba, sem divisória
 * embaixo: é o último bloco, e uma linha depois dele sugeriria que ainda vem
 * mais coisa.
 */
function BlocoDeEncerramento({ conta }: { conta: MinhaConta | null }) {
  const t = useT();
  const router = useRouter();
  const logout = useAuth((s) => s.logout);
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
      ui.closeAllModals();
      logout();
      router.replace("/login");
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
      setOcupado(false);
    }
  }

  return (
    <Section id="encerrar" title={t("conta.secEncerrar")} semDivisoria>
      <p className="text-sm text-txt-muted">
        Desativar é reversível: a conta volta quando você entra de novo. Excluir anonimiza o
        usuário para sempre.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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

      {acao && (
        <form onSubmit={confirmar} noValidate className="pt-4">
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
