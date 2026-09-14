"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, TriangleAlert } from "@/components/ui/icones";
import { ACCEPT_IMAGEM_DE_PERFIL, MAX_DISPLAY_NAME, displayNameOf } from "@streamz/shared";
import type { MinhaConta } from "@streamz/shared";
import { Section } from "@/components/ui/controls";
import { Button, Tabs, TextInput, type AbaDeTabs } from "@/components/ui/primitivos";
import { CampoDeTexto, Erro } from "@/components/settings/campos";
import { useIrParaAba } from "@/components/settings/navegacao";
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
 * "Minha conta" — redesenho de paridade (cartão 6c-minha-conta) sobre a
 * divergência medida por `divergencias.py` (5 itens) e o print 1:1 do blog
 * `2025-11-a-cornucopia-of-updates-make-discord-on-desktop/04-…redesenhadas.png`
 * (escala deduzida ~1,18 — serve para proporção e estrutura, nunca para px
 * exato: ADR-0009 §7 diz "nunca para px" de imagem de catálogo).
 *
 * O que mudou em relação à versão anterior:
 *
 * 1. **Sem legenda repetida.** O Discord não escreve "My Account" de novo
 *    dentro do conteúdo — o título já é o cabeçalho da `JanelaDeConfiguracoes`
 *    (fora deste arquivo). A legenda `MINHA CONTA` em caixa-alta 12px que
 *    existia aqui (`--text-subtle`, cap-height 9px medido) não tem par no
 *    Discord (lá, no mesmo lugar, ficam as abas "Security"/"Standing" — ver
 *    item 3). `Section` continua com `id="minha-conta"` (a busca das
 *    configurações rola até aqui por esse id), só que sem `title`.
 * 2. **Um cartão só, com um cartão aninhado dentro**, como no print (a faixa e
 *    a identidade continuam até o fim do cartão externo; os campos moram num
 *    cartão interno, começando poucos px depois da borda) — não mais dois
 *    cartões irmãos com vão entre eles.
 * 3. **Abas "Segurança"/"Padrão".** O Discord mostra duas no alto do conteúdo
 *    (print, y≈227 em escala ~1,18). "Padrão" ("Standing" — histórico de
 *    moderação da conta) é funcionalidade que o Streamz não tem: pelo §6.6 do
 *    PROCESSO ela fica **visível e desabilitada**, sem inventar conteúdo atrás
 *    dela. O conteúdo de hoje (identidade, senha, encerramento) mora todo em
 *    "Segurança", a única aba viva.
 * 4. **Botão "Editar perfil de usuário"** ao lado do nome, dentro do cartão
 *    (print, botão primário em x≈1396–1540 na imagem de escala ~1,18). Ele não
 *    abre um formulário novo — vai para a aba "Perfil" das mesmas
 *    configurações (`useIrParaAba`, o mesmo mecanismo de "Configurações
 *    relacionadas"), que é onde o Streamz já edita avatar de exibição, banner
 *    e pronomes. Um botão que levasse a lugar nenhum seria pior que não ter o
 *    botão.
 * 5. **Faixa mais alta.** 100px (banner do print: ~118px numa imagem em
 *    escala deduzida 1,18 ⇒ ~100 reais, com folga de alguns px — número mais
 *    preciso não existe: não há print 1:1 desta tela específica). Era 60px.
 * 6. **Rótulo do campo sem caixa-alta.** `campos.tsx` já registra que "a
 *    refresh do Discord aboliu a caixa-alta" no rótulo de formulário
 *    (`ESTILO_ROTULO`); o print confirma o mesmo para a linha só-leitura
 *    ("Display Name", não "DISPLAY NAME"). O rótulo de `Linha` deixa de ser
 *    `text-xs uppercase text-text-subtle` e passa a `text-sm text-text-muted`
 *    (tamanho não medido com confiança — a única fonte é a imagem de escala
 *    deduzida — mantido um degrau abaixo do valor, como o rótulo de campo já
 *    faz em `ESTILO_ROTULO`).
 * 7. **Título de seção sem caixa-alta.** Pela mesma razão do item 6,
 *    "Senha e autenticação" e "Encerrar a conta" trocam a legenda pequena de
 *    `Section` (que eu não posso mudar — vive em `ui/controls.tsx`, fora da
 *    lista deste cartão) por um `<h2>` local, `text-heading-lg` (20px, a
 *    escala de `tailwind.config.ts`) `font-semibold`, igual ao "Password and
 *    Authentication" do print.
 * 8. **Linha de telefone**, como no Discord ("Phone Number"/"Add"). O Streamz
 *    não tem telefone de conta: o botão fica visível e desabilitado com a
 *    dica "(em breve)" (padrão de `voice/TileDeVoz.tsx` — `span` focável por
 *    fora do botão `disabled`, porque um botão nativo desabilitado não recebe
 *    ponteiro nem foco e a dica nunca abriria nele).
 * 9. **Carregando/erro.** `stores/conta.ts` não expõe status (é `stores/*`,
 *    fora da lista deste cartão) e engole erro num toast. Este arquivo cobre
 *    os dois localmente: enquanto a primeira busca não termina, a caixa de
 *    campos mostra um esqueleto pulsante em vez de "Nenhum e-mail cadastrado"
 *    (que seria uma mentira); se termina e a conta continua `null`, vira um
 *    aviso com "Tentar de novo".
 * 10. **Sem permissão.** Esta tela é sempre a conta da própria pessoa — não
 *    existe um "ver a conta de outro sem poder editar". A única negação
 *    possível é a API recusar uma ação (ex.: apagar a conta quando é a única
 *    admin da instância) — isso já é um 403, e `mensagemDeAuth` já devolve o
 *    texto da API direto no `Erro` de cada formulário (troca de e-mail, de
 *    senha, encerramento). Não há um estado de tela novo para desenhar aqui.
 *
 * O banner do cartão é o **mesmo** do perfil (aba "Perfil"), e por isso vem do
 * `GET /users/:id/profile`: ele não cabe no `PublicUser` da sessão. Uma faixa
 * fixa aqui fazia a troca do banner parecer que não tinha pego.
 *
 * Quem sai da conta faz isso pelo menu lateral do shell — ter o mesmo "Sair"
 * duas vezes na mesma tela só criava a dúvida de se os dois fazem o mesmo.
 */
type AbaDeMinhaConta = "seguranca" | "padrao";

// "Padrão" = "Standing" do Discord (histórico de moderação da conta). O
// Streamz não tem essa função — item 3 do cabeçalho: fica visível e
// desabilitada, sem inventar o conteúdo atrás dela.
const ABAS_DE_MINHA_CONTA: AbaDeTabs<AbaDeMinhaConta>[] = [
  { valor: "seguranca", rotulo: "Segurança" },
  { valor: "padrao", rotulo: "Padrão (em breve)", desabilitada: true },
];

export default function ContaTab() {
  const t = useT();
  const irParaAba = useIrParaAba();
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
  // "padrao" é desabilitada (ver `ABAS_DE_MINHA_CONTA`): este estado nunca
  // sai de "seguranca" na prática, mas o primitivo `Tabs` é controlado e
  // exige os dois valores.
  const [aba, setAba] = useState<AbaDeMinhaConta>("seguranca");
  // carregando = a primeira busca da conta ainda não terminou (item 9). Começa
  // falso quando a store já tinha a conta em cache de uma visita anterior à
  // aba nesta sessão — assim não pisca esqueleto por cima de um dado que já
  // existe.
  const [carregandoConta, setCarregandoConta] = useState(() => conta === null);
  const erroConta = !carregandoConta && !conta;

  function buscarConta() {
    setCarregandoConta(true);
    void carregar().finally(() => setCarregandoConta(false));
  }

  useEffect(() => {
    let vivo = true;
    carregar().finally(() => {
      if (vivo) setCarregandoConta(false);
    });
    return () => {
      vivo = false;
    };
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
      <Section id="minha-conta">
        <Tabs
          rotulo={t("conta.secMinhaConta")}
          valor={aba}
          aoMudar={setAba}
          abas={ABAS_DE_MINHA_CONTA}
          className="mb-4"
        />

        {user && (
          // cartão único (item 2 do cabeçalho): faixa + identidade + cartão
          // aninhado dos campos, tudo dentro do mesmo `bg-background-base-low`
          <div className="overflow-hidden rounded-lg bg-background-base-low">
            {banner.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.url} alt="" className="h-[100px] w-full object-cover" />
            ) : (
              <div
                className="h-[100px] w-full bg-brand-500"
                style={banner.cor ? { backgroundColor: banner.cor } : undefined}
              />
            )}
            <div className="px-4 pb-4">
              <div className="-mt-8 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-end gap-3">
                  <div className="relative rounded-full border-[6px] border-background-base-low">
                    <Avatar user={user} size="xl" surface="border-background-base-low" />
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
                        // a pastilha continua com 32px sobre o avatar (44 cobriria
                        // metade dele); quem cresce no celular é só o alvo, por
                        // um pseudo-elemento invisível de 44
                        className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-background-base-lowest text-text-strong shadow-popout hover:bg-interactive-background-hover disabled:opacity-50 celular:before:absolute celular:before:-inset-[6px] celular:before:content-['']"
                      >
                        <Camera size={16} />
                      </button>
                    </Tooltip>
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="truncate text-xl font-bold text-text-strong">
                      {displayNameOf(user)}
                    </div>
                    <div className="truncate text-sm text-text-muted">@{user.username}</div>
                  </div>
                </div>
                {/* "Edit User Profile" do print — não abre nada novo aqui
                    dentro: vai para a aba "Perfil" das mesmas configurações
                    (item 4 do cabeçalho). */}
                <Button
                  variante="primario"
                  tamanho="sm"
                  onClick={() => irParaAba("perfil")}
                  className="mb-2 celular:h-[44px] celular:w-full"
                >
                  Editar perfil de usuário
                </Button>
              </div>
              {uploading && <p className="mt-2 text-xs text-text-muted">Enviando avatar…</p>}
            </div>

            {/* cartão aninhado dos campos — mesmo fundo escurecido um passo
                (`background-base-lower`) do cartão externo (`background-base-low`),
                como no print (o interno lê mais escuro que a faixa/identidade) */}
            <div className="mx-4 mb-4 overflow-hidden rounded-lg bg-background-base-lower px-4 py-1">
              {/* Nome de exibição e nome de usuário vêm do `user` da sessão
                  (já carregado para a tela abrir); só e-mail e telefone
                  dependem de `GET /me/account`, então só eles entram no
                  estado de erro — trocar tudo pela mensagem de erro esconderia
                  campos que continuam funcionando. */}
              <LinhaDeNomeDeExibicao />
              <Linha
                rotulo="Nome de usuário"
                valor={user ? `@${user.username}` : "—"}
                // sem rota de troca de username na API: mostrar um "Editar" que
                // não leva a lugar nenhum seria pior do que não ter o botão
              />
              {erroConta ? (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="text-sm text-text-muted">Não foi possível carregar e-mail e telefone.</p>
                  <Button variante="secundario" tamanho="sm" onClick={buscarConta}>
                    Tentar de novo
                  </Button>
                </div>
              ) : (
                <>
                  <LinhaDeEmail conta={conta} carregando={carregandoConta} aoMudar={aplicarConta} />
                  <LinhaDeTelefone />
                </>
              )}
            </div>
          </div>
        )}
      </Section>

      <BlocoDeSenha carregando={carregandoConta} />
      <BlocoDeEncerramento conta={conta} carregando={carregandoConta} />
    </>
  );
}

// ── linhas ───────────────────────────────────────────────────

/** Uma linha "rótulo / valor / ação à direita". */
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
    <div className="border-b border-border-subtle py-3 last:border-b-0">
      {/* No celular a ação **desce**: o e-mail com "Reenviar" e "Editar" ao
          lado sobrava 120px para o endereço, que virava "anaxi…". Empilhado,
          o valor tem a linha inteira e os botões a de baixo. */}
      <div className="flex items-center justify-between gap-4 celular:flex-col celular:items-stretch celular:gap-2">
        <div className="min-w-0">
          {/* sem caixa-alta: a refresh do Discord aboliu isso mesmo em rótulo
              de linha só-leitura, não só em campo de formulário (item 6) */}
          <p className="text-sm text-text-muted">{rotulo}</p>
          <div className="mt-0.5 truncate text-text-md text-text-strong">{valor}</div>
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
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variante="secundario"
      tamanho="sm"
      onClick={onClick}
      disabled={disabled}
      className="celular:h-[44px]"
    >
      {children}
    </Button>
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
            <TextInput
              value={valor}
              maxLength={MAX_DISPLAY_NAME}
              autoFocus
              onChange={(e) => setValor(e.target.value)}
              placeholder={user?.username}
              aria-label="Nome de exibição"
            />
            <p className="mt-1 text-xs text-text-muted">
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
  carregando,
  aoMudar,
}: {
  conta: MinhaConta | null;
  /** primeira busca da conta ainda não terminou — item 9 do cabeçalho. */
  carregando: boolean;
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
        carregando ? (
          // esqueleto — "Nenhum e-mail cadastrado" enquanto carrega seria
          // mostrar um vazio que pode não ser real (item 9 do cabeçalho)
          <span className="inline-block h-4 w-40 animate-pulse rounded bg-background-surface-high" />
        ) : (
          <span className="flex items-center gap-2">
            <span className="truncate">{conta?.email ?? "Nenhum e-mail cadastrado"}</span>
            {conta &&
              (conta.emailVerified ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-status-positive">
                  <BadgeCheck size={14} aria-hidden="true" /> Confirmado
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs text-status-warning">
                  <TriangleAlert size={14} aria-hidden="true" /> Não confirmado
                </span>
              ))}
          </span>
        )
      }
      acao={
        <div className="flex gap-2">
          {conta && !conta.emailVerified && conta.email && (
            <Button
              variante="secundario"
              tamanho="sm"
              disabled={ocupado}
              onClick={() => void reenviar()}
              className="celular:h-[44px]"
            >
              Reenviar
            </Button>
          )}
          <BotaoDeLinha disabled={carregando} onClick={() => setEditando((v) => !v)}>
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

/**
 * "Phone Number"/"Add" do print. O Streamz não tem telefone de conta —
 * §6.6 do PROCESSO: o controle fica visível e desabilitado, com a dica
 * "(em breve)" (item 8 do cabeçalho). O `span` focável por fora do `Button`
 * carrega a dica porque um botão `disabled` nativo não recebe ponteiro nem
 * foco (mesmo padrão de `components/voice/TileDeVoz.tsx`).
 */
function LinhaDeTelefone() {
  return (
    <Linha
      rotulo="Telefone"
      valor="Nenhum telefone cadastrado"
      acao={
        <Tooltip label="Adicionar telefone (em breve)">
          <span tabIndex={0} aria-label="Adicionar telefone (em breve)" className="inline-flex rounded-lg">
            <Button
              variante="secundario"
              tamanho="sm"
              disabled
              tabIndex={-1}
              className="pointer-events-none celular:h-[44px]"
            >
              Adicionar
            </Button>
          </span>
        </Tooltip>
      }
    />
  );
}

// ── senha ────────────────────────────────────────────────────

function BlocoDeSenha({ carregando }: { carregando: boolean }) {
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
    <Section id="senha">
      {/* legenda própria em vez do `title` de `Section` (caixa-alta 12px, sem
          par no print — item 7 do cabeçalho): `text-heading-lg` 20px, igual ao
          "Password and Authentication" do Discord */}
      <h2 className="mb-3 text-heading-lg font-semibold text-text-strong">{t("conta.secSenha")}</h2>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-strong">Senha da conta</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Trocar a senha encerra as sessões dos outros aparelhos.
          </p>
        </div>
        <BotaoDeLinha disabled={carregando} onClick={() => setAbrindo((v) => !v)}>
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
function BlocoDeEncerramento({
  conta,
  carregando,
}: {
  conta: MinhaConta | null;
  carregando: boolean;
}) {
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
      // inclui o 403 da API (ex.: única conta admin da instância) — item 10
      // do cabeçalho: "sem permissão" desta tela é este texto, não uma tela à parte
      setErro(mensagemDeAuth(err, "conta"));
      setOcupado(false);
    }
  }

  return (
    <Section id="encerrar" semDivisoria>
      <h2 className="mb-3 text-heading-lg font-semibold text-text-strong">{t("conta.secEncerrar")}</h2>
      <p className="text-sm text-text-muted">
        Desativar é reversível: a conta volta quando você entra de novo. Excluir anonimiza o
        usuário para sempre.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variante="critico-secundario"
          tamanho="sm"
          disabled={carregando}
          onClick={() => setAcao(acao === "disable" ? null : "disable")}
          className="celular:h-[44px]"
        >
          Desativar conta
        </Button>
        <Button
          variante="critico"
          tamanho="sm"
          disabled={carregando}
          onClick={() => setAcao(acao === "delete" ? null : "delete")}
          className="celular:h-[44px]"
        >
          Excluir conta
        </Button>
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
