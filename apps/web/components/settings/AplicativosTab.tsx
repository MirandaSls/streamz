"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ACCEPT_IMAGEM_DE_PERFIL,
  MAX_APP_DESCRIPTION,
  MAX_APP_NAME,
  PERMISSION_INFO,
  PERMISSION_ORDER,
  Permission,
  appCriarSchema,
  hasPermission,
  type AppDetalhe,
  type PermissionName,
  type ServidorComOApp,
  type TokenCriado,
} from "@streamz/shared";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "@/components/ui/icones";
import { ESTILO_AREA, ESTILO_CAMPO, ESTILO_ROTULO } from "@/components/settings/campos";
import { Section, ToggleLinha } from "@/components/ui/controls";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { dataCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Portal do desenvolvedor — "Configurações → Aplicativos" (F4, lote A).
 *
 * Cinco telas dentro de uma aba (§11 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`):
 * **lista**, **criar**, **editar**, **token** e **servidores**, mais a seção
 * "Como apontar seu bot" com os trechos do §14 já apontados para *esta*
 * instância.
 *
 * As telas são estado local e não rota: a aba inteira vive dentro do modal de
 * configurações, que no celular já é mestre-detalhe (`JanelaDeConfiguracoes`,
 * o ramo `if (ehMobile)`). Empilhar navegação de verdade aqui dentro daria
 * três camadas de "voltar" para a mesma tela.
 *
 * **O painel do token é a peça que não pode sair errada.** O valor em claro
 * existe uma vez, na resposta de criar ou de regenerar: fica em `useState`
 * deste componente, some quando o painel fecha, e não passa por store, por
 * `localStorage` nem por log. Fora dele a tela mostra só `tokenPrefixo` (8
 * caracteres, que identificam **o bot** e não mudam ao regenerar) e
 * `tokenCriadoEm` — é a data que distingue um token do outro.
 */

/** Qual das cinco telas está à mostra. */
type Tela =
  | { nome: "lista" }
  | { nome: "criar" }
  | { nome: "editar"; id: string }
  | { nome: "servidores"; id: string };

export default function AplicativosTab() {
  const [apps, setApps] = useState<AppDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tela, setTela] = useState<Tela>({ nome: "lista" });

  /**
   * O token em claro, e o nome do aplicativo a que ele pertence.
   *
   * Estado local, deliberadamente: uma store sobreviveria à aba fechada e um
   * `localStorage` sobreviveria ao navegador fechado. Aqui, trocar de tela já
   * o apaga.
   */
  const [token, setToken] = useState<{ nomeDoApp: string; token: TokenCriado } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setApps(await api.meusApps());
      setErro(null);
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível carregar os seus aplicativos"));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const emFoco = tela.nome === "editar" || tela.nome === "servidores"
    ? (apps?.find((a) => a.id === tela.id) ?? null)
    : null;

  function voltarParaALista() {
    setToken(null);
    setTela({ nome: "lista" });
  }

  // ── criar ────────────────────────────────────────────────
  async function criar(nome: string) {
    const criado = await api.criarApp(nome);
    setApps((atuais) => [criado.app, ...(atuais ?? [])]);
    // a tela do token vem por cima da lista: fechar o painel é voltar para ela
    setTela({ nome: "lista" });
    setToken({ nomeDoApp: criado.app.name, token: criado.token });
  }

  // ── regenerar ────────────────────────────────────────────
  /**
   * Confirmação **dupla**, porque o efeito é imediato e não tem desfazer: um
   * `confirm` com o aviso, e depois um `prompt` que exige digitar o nome do
   * aplicativo — é o mesmo par que apagar um servidor usa.
   */
  async function regenerar(app: AppDetalhe) {
    const certeza = await ui.confirm({
      title: `Regenerar o token de ${app.name}?`,
      message:
        "O bot atual vai parar de funcionar na hora: o token que ele usa é revogado " +
        "assim que o novo é emitido. O token novo aparece uma única vez.",
      confirmLabel: "Continuar",
      danger: true,
    });
    if (!certeza) return;

    const digitado = await ui.prompt({
      title: "Confirme o nome do aplicativo",
      message: "Para evitar derrubar o bot errado, digite o nome dele.",
      label: "Nome do aplicativo",
      placeholder: app.name,
      confirmLabel: "Regenerar token",
      danger: true,
    });
    if (digitado?.trim() !== app.name) return;

    try {
      const novo = await api.regenerarTokenDoApp(app.id);
      setToken({ nomeDoApp: app.name, token: novo });
      setTela({ nome: "lista" });
      await carregar();
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível regenerar o token"));
    }
  }

  // ── apagar ───────────────────────────────────────────────
  async function apagar(app: AppDetalhe) {
    const certeza = await ui.confirm({
      title: `Apagar ${app.name}?`,
      message:
        "O aplicativo, o usuário-bot e o token somem para sempre, e o bot sai de " +
        "todos os servidores onde estiver instalado. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!certeza) return;
    try {
      await api.apagarApp(app.id);
      setApps((atuais) => (atuais ?? []).filter((a) => a.id !== app.id));
      voltarParaALista();
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível apagar o aplicativo"));
    }
  }

  /** Troca a linha da lista pelo que a API devolveu, sem recarregar tudo. */
  function trocar(app: AppDetalhe) {
    setApps((atuais) => (atuais ?? []).map((a) => (a.id === app.id ? app : a)));
  }

  if (tela.nome === "criar") {
    return <TelaDeCriar aoVoltar={voltarParaALista} aoCriar={criar} />;
  }
  if (emFoco && tela.nome === "editar") {
    return (
      <TelaDeEditar
        app={emFoco}
        aoVoltar={voltarParaALista}
        aoTrocar={trocar}
        aoApagar={() => void apagar(emFoco)}
        aoRegenerar={() => void regenerar(emFoco)}
        aoVerServidores={() => setTela({ nome: "servidores", id: emFoco.id })}
      />
    );
  }
  if (emFoco && tela.nome === "servidores") {
    return (
      <TelaDeServidores app={emFoco} aoVoltar={() => setTela({ nome: "editar", id: emFoco.id })} />
    );
  }

  return (
    <>
      <Section id="meus" title="Meus aplicativos">
        {token && (
          <PainelDoToken
            nomeDoApp={token.nomeDoApp}
            token={token.token}
            aoFechar={() => setToken(null)}
          />
        )}

        <p className="mb-3 text-sm leading-5 text-txt-secondary">
          Um aplicativo é o registro de um bot nesta instância: ele ganha uma conta própria, um
          token e um lugar em &ldquo;Descobrir aplicativos&rdquo; quando você quiser.
        </p>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {apps === null ? (
          <p className="py-6 text-sm text-txt-muted">Carregando…</p>
        ) : apps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <Bot size={40} aria-hidden="true" className="mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-secondary">Você ainda não criou nenhum aplicativo.</p>
          </div>
        ) : (
          // 244×164 é a medida do card do Discord (docs/Reference/apps/MEDIDAS.md
          // §2, 2,000 px/CSS). Aqui a coluna de conteúdo é mais estreita que a
          // do portal deles, então a grade se acomoda sozinha a partir de 180 —
          // e vira uma coluna só no celular, onde 358px de largura útil não
          // comportam duas.
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 celular:grid-cols-1">
            {apps.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => setTela({ nome: "editar", id: app.id })}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-panel p-3 text-left transition hover:border-border-strong-hover celular:min-h-[60px]"
                >
                  <IconeDoApp app={app} tamanho={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-txt-primary">
                      {app.name}
                    </span>
                    <span className="block text-xs text-txt-muted">
                      {app.publico ? "Publicado" : "Privado"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setTela({ nome: "criar" })}
          className="mt-4 flex h-[44px] items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
        >
          <Plus size={18} aria-hidden="true" />
          Criar aplicativo
        </button>
      </Section>

      <ComoApontarSeuBot />
    </>
  );
}

/* ───────────────────────────── tela 2: criar ───────────────────────────── */

function TelaDeCriar({
  aoVoltar,
  aoCriar,
}: {
  aoVoltar: () => void;
  aoCriar: (nome: string) => Promise<void>;
}) {
  const id = useId();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // o mesmo schema que a API usa: recusa antes do round-trip
  const valido = appCriarSchema.safeParse({ name: nome }).success;

  async function enviar() {
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      await aoCriar(nome.trim());
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível criar o aplicativo"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Section title={undefined} semDivisoria>
      <Voltar onClick={aoVoltar}>Meus aplicativos</Voltar>
      <h2 className="mb-1 text-lg font-semibold text-txt-primary">Criar aplicativo</h2>
      <p className="mb-4 text-sm leading-5 text-txt-secondary">
        Só o nome. Descrição, ícone e visibilidade se editam depois — o token aparece assim que o
        aplicativo existir, uma única vez.
      </p>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <label htmlFor={id} className={ESTILO_ROTULO}>
        Nome
      </label>
      <input
        id={id}
        value={nome}
        maxLength={MAX_APP_NAME}
        autoFocus
        placeholder="Música do Zé"
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void enviar();
        }}
        className={ESTILO_CAMPO}
      />
      <p className="mt-1 text-xs text-txt-muted">
        Vira também o nome do usuário-bot na lista de membros. {nome.trim().length}/{MAX_APP_NAME}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valido || salvando}
          onClick={() => void enviar()}
          className="flex h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
        >
          {salvando ? "Criando…" : "Criar"}
        </button>
        <button
          type="button"
          onClick={aoVoltar}
          className="flex h-[44px] items-center rounded-lg px-4 text-sm font-medium text-txt-secondary transition hover:underline"
        >
          Cancelar
        </button>
      </div>
    </Section>
  );
}

/* ───────────────────────────── tela 3: editar ──────────────────────────── */

function TelaDeEditar({
  app,
  aoVoltar,
  aoTrocar,
  aoApagar,
  aoRegenerar,
  aoVerServidores,
}: {
  app: AppDetalhe;
  aoVoltar: () => void;
  aoTrocar: (app: AppDetalhe) => void;
  aoApagar: () => void;
  aoRegenerar: () => void;
  aoVerServidores: () => void;
}) {
  const idNome = useId();
  const idDescricao = useId();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(app.name);
  const [descricao, setDescricao] = useState(app.description ?? "");
  const [permissoes, setPermissoes] = useState(app.permissoesPadrao);
  const [salvando, setSalvando] = useState(false);
  const [enviandoIcone, setEnviandoIcone] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const sujo =
    nome.trim() !== app.name ||
    descricao.trim() !== (app.description ?? "") ||
    permissoes !== app.permissoesPadrao;

  async function salvar() {
    if (!sujo || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      aoTrocar(
        await api.editarApp(app.id, {
          name: nome.trim(),
          description: descricao.trim() || null,
          permissoesPadrao: permissoes,
        }),
      );
      setSalvo(true);
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível salvar"));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * O interruptor salva sozinho, sem passar pela barra de alterações.
   *
   * "Publicar no diretório" é uma decisão de um clique, e o efeito (o
   * aplicativo aparecer ou sumir de "Descobrir aplicativos") é o que a pessoa
   * quer ver na hora — é o comportamento do `PUBLIC BOT` do Discord.
   */
  async function publicar(valor: boolean) {
    setErro(null);
    try {
      aoTrocar(await api.editarApp(app.id, { publico: valor }));
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível mudar a visibilidade"));
    }
  }

  async function enviarIcone(arquivo: File) {
    setEnviandoIcone(true);
    setErro(null);
    try {
      aoTrocar(await api.atualizarIconeDoApp(app.id, arquivo));
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível enviar o ícone"));
    } finally {
      setEnviandoIcone(false);
    }
  }

  async function removerIcone() {
    setEnviandoIcone(true);
    setErro(null);
    try {
      aoTrocar(await api.removerIconeDoApp(app.id));
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível remover o ícone"));
    } finally {
      setEnviandoIcone(false);
    }
  }

  return (
    <>
      <Section title={undefined}>
        <Voltar onClick={aoVoltar}>Meus aplicativos</Voltar>
        <div className="mb-4 flex items-center gap-3">
          <IconeDoApp app={app} tamanho={48} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-txt-primary">{app.name}</h2>
            <p className="text-xs text-txt-muted">
              @{app.botUser.username} · {app.publico ? "Publicado" : "Privado"}
            </p>
          </div>
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <label htmlFor={idNome} className={ESTILO_ROTULO}>
          Nome
        </label>
        <input
          id={idNome}
          value={nome}
          maxLength={MAX_APP_NAME}
          onChange={(e) => {
            setNome(e.target.value);
            setSalvo(false);
          }}
          className={ESTILO_CAMPO}
        />

        <label htmlFor={idDescricao} className={`${ESTILO_ROTULO} mt-4`}>
          Descrição
        </label>
        <textarea
          id={idDescricao}
          value={descricao}
          rows={3}
          maxLength={MAX_APP_DESCRIPTION}
          placeholder="A linha que aparece no card de “Descobrir aplicativos”."
          onChange={(e) => {
            setDescricao(e.target.value);
            setSalvo(false);
          }}
          className={ESTILO_AREA}
        />
        <p className="mt-1 text-xs text-txt-muted">
          {descricao.trim().length}/{MAX_APP_DESCRIPTION}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!sujo || salvando}
            onClick={() => void salvar()}
            className="flex h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {salvo && !sujo && (
            <span aria-live="polite" className="flex items-center gap-1 text-xs text-green">
              <Check size={14} aria-hidden="true" /> Salvo
            </span>
          )}
        </div>
      </Section>

      <Section title="Ícone">
        <div className="flex flex-wrap items-center gap-3">
          <IconeDoApp app={app} tamanho={80} />
          <input
            ref={arquivoRef}
            type="file"
            accept={ACCEPT_IMAGEM_DE_PERFIL}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarIcone(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={enviandoIcone}
            onClick={() => arquivoRef.current?.click()}
            className="flex h-[44px] items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            <ImageIcon size={16} aria-hidden="true" />
            {enviandoIcone ? "Enviando…" : app.iconUrl ? "Trocar ícone" : "Escolher ícone"}
          </button>
          {app.iconUrl && (
            <button
              type="button"
              disabled={enviandoIcone}
              onClick={() => void removerIcone()}
              aria-label="Remover ícone"
              className="grid h-[44px] w-[44px] place-items-center rounded-lg text-txt-secondary transition hover:bg-hov hover:text-red disabled:opacity-50"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-txt-muted">
          Sem ícone, a lista usa a inicial do nome. PNG, JPEG, GIF ou WebP, até 4 MB.
        </p>
      </Section>

      <Section title="Diretório">
        <ToggleLinha
          checked={app.publico}
          onChange={(v) => void publicar(v)}
          titulo="Publicar no diretório"
          hint="Publicado, qualquer pessoa desta instância encontra o aplicativo em “Descobrir aplicativos” e pode adicioná-lo a um servidor onde tenha permissão. Privado, só você."
        />
      </Section>

      <Section title="Permissões sugeridas">
        <p className="mb-3 text-sm leading-5 text-txt-secondary">
          O que vem <strong>pré-marcado</strong> na tela de instalação. Não concede nada: quem
          instala pode desmarcar, e a API recusa o que a pessoa não tem.
        </p>
        <EditorDePermissoesSugeridas
          valor={permissoes}
          aoMudar={(v) => {
            setPermissoes(v);
            setSalvo(false);
          }}
        />
      </Section>

      <Section title="Token">
        <p className="mb-1 text-sm leading-5 text-txt-secondary">
          Por segurança, o token só é visto <strong>uma vez</strong>, quando é criado. Se você o
          perdeu, regenere — e lembre que isso derruba o bot que estiver usando o antigo.
        </p>
        <dl className="mb-3 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-txt-muted">Prefixo</dt>
          <dd className="font-mono text-txt-primary">
            {app.tokenPrefixo ? `${app.tokenPrefixo}…` : "sem token em vigor"}
          </dd>
          <dt className="text-txt-muted">Emitido em</dt>
          <dd className="text-txt-primary">
            {app.tokenCriadoEm ? dataCompleta(app.tokenCriadoEm) : "—"}
          </dd>
        </dl>
        <p className="mb-3 text-xs leading-4 text-txt-muted">
          O prefixo identifica <strong>o bot</strong>, não o token: ele sai do id do usuário-bot e
          não muda quando você regenera. Quem distingue um token do outro é a data.
        </p>
        <button
          type="button"
          onClick={aoRegenerar}
          className="flex h-[44px] items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Regenerar token
        </button>
      </Section>

      <Section title="Servidores">
        <button
          type="button"
          onClick={aoVerServidores}
          className="flex h-[44px] w-full items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-txt-primary transition hover:border-border-strong-hover"
        >
          <Server size={16} aria-hidden="true" />
          Ver onde este aplicativo está instalado
        </button>
      </Section>

      <Section title="Zona de perigo" semDivisoria>
        <p className="mb-3 text-sm leading-5 text-txt-secondary">
          Apagar remove o aplicativo, o usuário-bot, o token e a presença dele em todos os
          servidores. Não dá para desfazer.
        </p>
        <button
          type="button"
          onClick={aoApagar}
          className="flex h-[44px] items-center gap-2 rounded-lg bg-red px-4 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Trash2 size={16} aria-hidden="true" />
          Apagar aplicativo
        </button>
      </Section>
    </>
  );
}

/* ─────────────────────────── tela 4: o token ───────────────────────────── */

/**
 * O painel que mostra o token em claro — **uma vez**.
 *
 * Fica no fluxo da página, e não num modal, de propósito: no celular um modal
 * sobre o modal de configurações daria três camadas de "voltar", e o valor a
 * copiar é justamente o que precisa ficar à vista enquanto a pessoa alterna
 * para o editor de texto onde vai colá-lo.
 *
 * A caixa do valor é `<input readOnly>` e não `<code>` porque um input dá
 * seleção com um toque no celular — a alternativa quando `navigator.clipboard`
 * não existe (contexto inseguro, permissão negada).
 */
function PainelDoToken({
  nomeDoApp,
  token,
  aoFechar,
}: {
  nomeDoApp: string;
  token: TokenCriado;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard?.writeText(token.token);
      setCopiado(true);
    } catch {
      // sem permissão de área de transferência o valor continua selecionável
      setCopiado(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={`Token de ${nomeDoApp}`}
      className="mb-4 rounded-lg border border-yellow bg-panel p-4"
    >
      <div className="mb-2 flex items-start gap-2">
        <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-yellow" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-txt-primary">
            Copie o token de {nomeDoApp} agora
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-txt-secondary">
            Ele aparece <strong>uma única vez</strong>. Se você fechar este painel sem copiar, o
            valor se perde — a saída passa a ser regenerar, o que derruba o bot.
          </p>
        </div>
      </div>

      {/* o input e o botão em blocos separados no celular: 358px de largura útil
          não comportam um campo de 59 caracteres e um botão na mesma linha */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-void p-1 pl-3 celular:flex-col celular:items-stretch celular:gap-1 celular:p-2">
        <input
          value={token.token}
          readOnly
          aria-label="Token do bot"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-txt-normal outline-none celular:h-[44px]"
        />
        <button
          type="button"
          onClick={() => void copiar()}
          className="flex h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover celular:h-[44px]"
        >
          {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copiado ? "Token copiado para a área de transferência." : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-txt-muted">
          Prefixo <span className="font-mono">{token.prefixo}…</span> · emitido em{" "}
          {dataCompleta(token.criadoEm)}
        </p>
        <button
          type="button"
          onClick={aoFechar}
          className="flex h-[44px] items-center rounded-lg px-3 text-sm font-medium text-txt-secondary transition hover:bg-hov"
        >
          Já copiei, fechar
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────── tela 5: onde está instalado ───────────────────── */

function TelaDeServidores({ app, aoVoltar }: { app: AppDetalhe; aoVoltar: () => void }) {
  const [itens, setItens] = useState<ServidorComOApp[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .servidoresDoApp(app.id)
      .then((s) => vivo && setItens(s))
      .catch((e) => vivo && setErro(errorMessage(e, "Não foi possível carregar os servidores")));
    return () => {
      vivo = false;
    };
  }, [app.id]);

  return (
    <Section title={undefined} semDivisoria>
      <Voltar onClick={aoVoltar}>{app.name}</Voltar>
      <h2 className="mb-1 text-lg font-semibold text-txt-primary">Servidores</h2>
      <p className="mb-4 text-sm leading-5 text-txt-secondary">
        Onde <strong>{app.name}</strong> está instalado. Quem instalou não aparece: é gente de
        outro servidor, e o portal não é um diretório de pessoas.
      </p>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {itens === null ? (
        <p className="py-6 text-sm text-txt-muted">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <Server size={40} aria-hidden="true" className="mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-secondary">
            Este aplicativo ainda não foi adicionado a nenhum servidor.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((s) => (
            <li
              key={s.guildId}
              className="flex items-center gap-3 rounded-lg border border-border p-3 celular:min-h-[60px]"
            >
              {s.guildIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.guildIconUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-void text-sm font-semibold text-txt-secondary">
                  {s.guildName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-txt-primary">
                  {s.guildName}
                </span>
                <span className="block text-xs text-txt-muted">
                  Instalado em {dataCompleta(s.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ────────────────────── permissões sugeridas (editar) ──────────────────── */

const GRUPOS: { id: "geral" | "membros" | "mensagens" | "voz"; label: string }[] = [
  { id: "geral", label: "Permissões gerais do servidor" },
  { id: "membros", label: "Permissões de membro" },
  { id: "mensagens", label: "Permissões de texto" },
  { id: "voz", label: "Permissões de voz" },
];

/**
 * As permissões que a tela de instalação vem com marcadas.
 *
 * Agrupadas pelo campo `group` de `PERMISSION_INFO`, na ordem de
 * `PERMISSION_ORDER` — é o agrupamento do `CargosTab`, e não o
 * `secoesDePermissoes(escopo)`, que é do editor de overrides de canal: um
 * cargo de servidor não tem escopo de canal.
 */
function EditorDePermissoesSugeridas({
  valor,
  aoMudar,
}: {
  valor: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {GRUPOS.map((grupo) => {
        const nomes = PERMISSION_ORDER.filter((n) => PERMISSION_INFO[n].group === grupo.id);
        if (nomes.length === 0) return null;
        return (
          <fieldset key={grupo.id}>
            <legend className={ESTILO_ROTULO}>{grupo.label}</legend>
            <div className="flex flex-col divide-y divide-border">
              {nomes.map((nome: PermissionName) => (
                <ToggleLinha
                  key={nome}
                  checked={hasPermission(valor, Permission[nome])}
                  onChange={(v) =>
                    aoMudar(v ? valor | Permission[nome] : valor & ~Permission[nome])
                  }
                  titulo={PERMISSION_INFO[nome].label}
                  hint={PERMISSION_INFO[nome].description}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/* ────────────────────────── como apontar seu bot ───────────────────────── */

/**
 * Os trechos do §14 do documento, já com **a URL desta instância**.
 *
 * A URL sai de `API_URL` (`lib/config.ts`) e nunca é escrita à mão: quem sobe
 * a própria instância abre esta tela e copia o trecho que já funciona ali.
 *
 * As três armadilhas medidas no §14, que estão nos trechos abaixo:
 *
 * - **discord.js**: `rest.api` vai **sem** `/v10` — a lib acrescenta
 *   (`${api}/v${version}${rota}`). Com o `/v10` escrito, toda rota vira
 *   `/api/v10/v10/...` e responde 404.
 * - **discord.py**: `Route.BASE` vai **com** a versão, ao contrário, **e** a
 *   segunda linha (`DEFAULT_GATEWAY`) não é opcional: sem ela o bot faz o REST
 *   inteiro contra o Streamz e abre o WebSocket no Discord de verdade, que
 *   recusa o token com close 4004 — um erro que parece nosso e não é.
 * - **Lavalink**: nada muda. Ele nem sabe que existe Discord.
 */
function ComoApontarSeuBot() {
  const enderecos = useMemo(() => {
    const base = API_URL.replace(/\/+$/, "");
    // o gateway compatível é `/gateway` no mesmo processo que serve `/api`
    // (`discord-compat/gateway/servidor.ts`), então basta trocar o esquema
    const gateway = `${base.replace(/^http/, "ws")}/gateway`;
    return { rest: `${base}/api`, restComVersao: `${base}/api/v10`, gateway };
  }, []);

  return (
    <Section id="apontar" title="Como apontar seu bot" semDivisoria>
      <p className="mb-4 text-sm leading-5 text-txt-secondary">
        O bot que você já escreveu para o Discord roda aqui sem mudar de biblioteca: o que muda é
        o endereço. Os trechos abaixo já vêm com o endereço <strong>desta</strong> instância.
      </p>

      <Trecho
        titulo="discord.js v14"
        nota="O `rest.api` vai sem o `/v10`: a lib acrescenta a versão sozinha. A URL do gateway não se configura — o `WebSocketManager` a pede pelo mesmo REST, então trocar o `rest.api` já a redireciona."
        linguagem="js"
        codigo={`const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,   // obrigatório para música
  ],
  rest: {
    api: '${enderecos.rest}',   // sem /v10: a lib acrescenta
    version: '10',
    cdn: '${API_URL.replace(/\/+$/, "")}/cdn',   // opcional
  },
});

client.on('messageCreate', (m) => { if (m.content === '!ping') m.reply('pong'); });
client.login(process.env.STREAMZ_BOT_TOKEN);`}
      />

      <Trecho
        titulo="discord.py"
        nota="São DUAS linhas, não uma. O `Route.BASE` vai COM a versão (ao contrário do discord.js), e sem a segunda linha o bot faz o REST inteiro contra o Streamz e abre o WebSocket no Discord de verdade, que recusa o token com close 4004."
        linguagem="python"
        codigo={`import os, discord, yarl
from discord.ext import commands
from discord.gateway import DiscordWebSocket

# São DUAS linhas, não uma.
discord.http.Route.BASE = '${enderecos.restComVersao}'          # com a versão
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL('${enderecos.gateway}')

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

@bot.command()
async def ping(ctx): await ctx.send('pong')

bot.run(os.environ['STREAMZ_BOT_TOKEN'])`}
      />

      <Trecho
        titulo="Lavalink"
        nota="Nada muda no Lavalink. Ele nem sabe que existe Discord: recebe `endpoint`, `token` e `sessionId` do bot e conecta. O `application.yml` continua igual — quem foi apontado para cá é o bot, pelos passos acima."
        linguagem="http"
        codigo={`PATCH http://lavalink:2333/v4/sessions/{sessionId}/players/{guildId}
{ "voice": { "token": "…", "endpoint": "…", "sessionId": "…" } }`}
      />

      <p className="mt-4 text-xs leading-4 text-txt-muted">
        O token vai no cabeçalho como <code className="font-mono">Authorization: Bot &lt;token&gt;</code>
        , exatamente como no Discord — as bibliotecas põem o prefixo sozinhas.
      </p>
    </Section>
  );
}

/** Um bloco de código com botão de copiar e retorno visível. */
function Trecho({
  titulo,
  nota,
  linguagem,
  codigo,
}: {
  titulo: string;
  nota: string;
  linguagem: string;
  codigo: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard?.writeText(codigo);
      setCopiado(true);
      // o retorno some sozinho: sem isso, dois trechos copiados seguidos
      // deixam dois "Copiado" na tela e nenhum diz qual foi o último
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-txt-primary">{titulo}</h4>
        <button
          type="button"
          onClick={() => void copiar()}
          aria-label={`Copiar o trecho de ${titulo}`}
          className="flex h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
        >
          {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mb-2 text-xs leading-4 text-txt-muted">{nota}</p>
      {/* o bloco rola dentro de si: a página nunca rola na horizontal */}
      <pre className="overflow-x-auto rounded-lg bg-void p-3 text-xs leading-5 text-txt-normal">
        <code data-linguagem={linguagem}>{codigo}</code>
      </pre>
    </div>
  );
}

/* ──────────────────────────────── peças ───────────────────────────────── */

/** O ícone do aplicativo, ou a inicial do nome quando não há ícone. */
function IconeDoApp({ app, tamanho }: { app: AppDetalhe; tamanho: number }) {
  const lado = { width: tamanho, height: tamanho };
  if (app.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.iconUrl}
        alt=""
        style={lado}
        className="shrink-0 rounded-lg bg-void object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={lado}
      className="grid shrink-0 place-items-center rounded-lg bg-void font-semibold text-txt-secondary"
    >
      {app.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A linha de "voltar" no topo de uma tela interna da aba. */
function Voltar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 mb-2 flex h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

function Aviso({ tom, children }: { tom: "erro"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`mb-3 rounded-lg px-3 py-2 text-sm ${
        tom === "erro" ? "bg-red/10 text-red" : "bg-hov text-txt-secondary"
      }`}
    >
      {children}
    </p>
  );
}
