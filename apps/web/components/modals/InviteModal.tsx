"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Hash, Search, Volume2 } from "@/components/ui/icones";
import {
  INVITE_EXPIRY_OPTIONS,
  INVITE_USES_OPTIONS,
  Permission,
  WS_EVENTS,
  displayNameOf,
  type InviteInfo,
  type PublicUser,
} from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Select, ToggleLinha } from "@/components/ui/controls";
import Avatar from "@/components/ui/Avatar";
import { Button, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { urlDeConvite } from "@/lib/links-de-convite";
import { useChannels } from "@/stores/channels";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { usePodeTalvez } from "@/stores/permissions";
import { emit, errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** "7 dias", "3 horas", "12 minutos" — o quanto ainda falta para expirar. */
function faltamAte(iso: string, agora = Date.now()): string {
  const ms = new Date(iso).getTime() - agora;
  if (!Number.isFinite(ms) || ms <= 0) return "menos de um minuto";
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * "Convidar amigos para <servidor>": a lista de **amigos** com um botão cada, o
 * link colável embaixo e as opções atrás de "Editar link de convite".
 *
 * As opções abrem numa segunda caixa por cima desta, e não inline: é o que o
 * Discord faz, e agora que os modais empilham a de baixo continua no lugar.
 *
 * **Medidas** (print do Discord `docs/Reference/Captura de tela 2026-09-04
 * 101009.png`, 1:1 conferido pelo avatar de 32 e pelo campo de 40): caixa de
 * 480×800 com padding de 24 (16 embaixo); subtítulo de 16 em linha de 20 com o
 * `#` do canal; busca de 40 com raio 8, lupa de 16 a 12 da borda e o texto a 12
 * da lupa; lista de 10 linhas e meia rolando com a barra a 4 da borda da
 * caixa; linha de 48 com avatar de 32, 10 até o nome (16/600) e o usuário
 * embaixo (12), botão de 32 com raio 8 e ~78 de largura, alinhado à direita do
 * conteúdo; divisória de 1px **de ponta a ponta**; rótulo de 16/600 a 24 dela;
 * campo do link de 40 com o botão embutido a 4 das bordas (raio 4); rodapé
 * de 12 a 16 do campo. Diferenças anotadas no PR: o botão da linha usa o
 * `Button` `secundario` (cinza translúcido do primitivo, não mais
 * `border-strong` cru), o "Copiar" é o `Button` `primario` no `accent` do
 * Streamz (o do Discord é o blurple da marca dele) e o subtítulo fica em
 * `txt-muted`, como a descrição dos outros modais.
 *
 * As duas divergências que `divergencias.py` reportava (rótulo em caixa alta e
 * botão "Convidar" verde) vieram de imagens de catálogo — item **3** (o mais
 * baixo) da regra de autoridade da ADR-0009 §7, "só para proporção, nunca para
 * px". O print 1:1 (item 1, o mais alto) já citado acima mostra o rótulo em
 * caixa de frase (não alta) e o botão "Convidar" cinza neutro (`#323237`,
 * medido com `medir.py` na linha do botão), contra o nosso `secundario`
 * `#313137` — a mesma cor a menos de 1 unidade por canal. Nenhuma mudança de
 * cor ou de caixa entrou por causa das duas divergências.
 *
 * **Estados** (cartão 7b-convite):
 * - **carregando** a lista de amigos: `useFriends().loading && !loaded` — texto
 *   `text-text-muted`, mesma linha das outras listas do app
 *   (`InvitesPanel`/`ChannelAccessModal`, "Carregando…").
 * - **erro** ao carregar: `!loading && !loaded` (a store zera `loading` e só
 *   avisa por toast, que é passageiro — sem um estado inline a lista ficava
 *   vazia para sempre, indistinguível de "sem amigos"), com "Tentar de novo"
 *   chamando `loadFriends()` de novo.
 * - **vazio**: sem amigos vs. busca sem resultado, como já existia.
 * - **enviando** por linha: `Button carregando` no clique de "Convidar",
 *   contra clique duplo enquanto a mensagem direta ainda está a caminho.
 * - **sem permissão**: `Permission.CREATE_INVITE` é o "Criar convite" do
 *   próprio `permissoes.ts` (concedida ao `@everyone` por padrão, revogável por
 *   cargo ou canal — a mesma conta que decide se o servidor mostra "Convidar
 *   Amigos" no menu). Sem ela, o convite não é criado sozinho ao abrir o modal,
 *   e o rodapé do link vira o aviso — o mesmo padrão de texto do
 *   `ServerSettingsModal` ("Você não tem permissão para..."). Um link que já
 *   existia (`code` veio por prop) continua visível: só a criação/edição fica
 *   fechada, não o que já está pronto.
 * - **hover/foco/desabilitado**: dos primitivos (`Button`, `TextInput`) — nada
 *   redesenhado aqui, é a regra do vocabulário.
 */
export default function InviteModal({
  guildId,
  code: initialCode,
  channelId: initialChannelId,
}: {
  guildId: string;
  code?: string;
  /** canal pré-selecionado (menu de contexto de um canal de texto ou de voz). */
  channelId?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const friends = useFriends((s) => s.friends);
  const friendsLoading = useFriends((s) => s.loading);
  const friendsLoaded = useFriends((s) => s.loaded);
  const loadFriends = useFriends((s) => s.load);
  const channels = useChannels((s) => s.channels);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [copied, setCopied] = useState(false);
  const [editando, setEditando] = useState(false);
  const [convidados, setConvidados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  // opções (o valor 0 é "nunca"/"sem limite", como nas listas do contrato)
  const [expiresInMinutes, setExpiresInMinutes] = useState(INVITE_EXPIRY_OPTIONS[5].minutes);
  const [maxUses, setMaxUses] = useState(0);
  const [temporary, setTemporary] = useState(false);
  const [channelId, setChannelId] = useState(initialChannelId ?? "");

  // canal de destino do convite: texto **e** voz (o link também abre um canal
  // de voz direto, "Convidar para voz" do menu de contexto — item G)
  const destinos = channels.filter((c) => c.type === "TEXT" || c.type === "VOICE");
  const destino = destinos.find((c) => c.id === channelId) ?? destinos[0] ?? null;

  // "Criar convite" (`permissoes.ts`) — concedida ao @everyone por padrão,
  // revogável por cargo ou canal. `guildId` explícito, e não `useCan` (que
  // assume o servidor **ativo**): este modal também abre a partir do painel de
  // voz de um canal, que pode não ser o servidor que a pessoa está olhando.
  // Nesse caso as regras carregadas são de **outro** servidor e o bitfield
  // vinha 0 — o modal dizia "sem permissão" a quem tem. `usePodeTalvez`
  // separa o "não sei" (`null`) do "não pode" (`false`): só o `false`
  // bloqueia; no `null` tentamos criar e quem decide é a API (que responde com
  // o toast de erro se de fato não puder).
  const podeConvidar = usePodeTalvez(Permission.CREATE_INVITE, {
    guildId,
    channelId: destino?.id ?? null,
  });
  const semPermissao = podeConvidar === false;

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  // cria um convite assim que o modal abre (sem código pronto), como o Discord
  useEffect(() => {
    if (initialCode || semPermissao) return;
    let ativo = true;
    void api
      .createInvite(guildId, {
        expiresInMinutes: INVITE_EXPIRY_OPTIONS[5].minutes,
        channelId: initialChannelId,
      })
      .then((i) => {
        if (!ativo) return;
        setInvite(i);
        setCode(i.code);
      })
      .catch((e) => ativo && ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error"));
    return () => {
      ativo = false;
    };
    // depende de `semPermissao`, e não de `podeConvidar`: a passagem de `null`
    // para `true` (as regras terminaram de carregar) não pode criar um segundo
    // convite em cima do que já saiu
  }, [guildId, initialCode, semPermissao]);

  // sempre o endereço público (`WEB_URL`), nunca o `tauri.localhost` do desktop
  const url = useMemo(() => (code ? urlDeConvite(code) : ""), [code]);

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      // sem permissão de área de transferência o link continua selecionável
      setCopied(false);
    }
  }

  async function regerar() {
    try {
      const novo = await api.createInvite(guildId, {
        expiresInMinutes,
        maxUses,
        temporary,
        channelId: channelId || null,
      });
      setInvite(novo);
      setCode(novo.code);
      setCopied(false);
      setEditando(false);
      ui.toast("Novo link de convite gerado.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível gerar o convite"), "error");
    }
  }

  /**
   * Manda o link na conversa direta com o amigo.
   *
   * Abre a conversa pela API em vez de `useDMs.openWith`: aquele muda a coluna
   * para o modo DM, e convidar de dentro do servidor não pode tirar ninguém de
   * onde estava.
   */
  async function convidar(amigo: PublicUser) {
    if (!url || enviando.includes(amigo.id)) return;
    setEnviando((prev) => [...prev, amigo.id]);
    try {
      const dm = await api.openDM(amigo.id);
      emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dm.id, content: url });
      setConvidados((prev) => [...prev, amigo.id]);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar o convite"), "error");
    } finally {
      setEnviando((prev) => prev.filter((id) => id !== amigo.id));
    }
  }

  const termo = busca.trim().toLowerCase();
  const lista = friends.filter(
    (f) =>
      !termo ||
      displayNameOf(f).toLowerCase().includes(termo) ||
      f.username.toLowerCase().includes(termo),
  );

  return (
    <>
      <Dialog
        telaCheiaNoCelular
        title={`Convidar amigos para ${guild?.name ?? "o servidor"}`}
        onClose={closeModal}
        semPadding
        bodyClassName="flex flex-col pt-1"
      >
        {/* o subtítulo do Discord diz para onde a pessoa cai, não só o canal */}
        {destino && (
          <p className="flex items-center gap-1 px-6 text-base leading-5 text-text-muted">
            <span className="shrink-0">Os destinatários chegarão em</span>
            {destino.type === "VOICE" ? (
              <Volume2 size={16} aria-hidden="true" className="shrink-0" />
            ) : (
              <Hash size={16} aria-hidden="true" className="shrink-0" />
            )}
            <span className="truncate">{destino.name}</span>
          </p>
        )}

        <TextInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar amigo"
          placeholder="Buscar amigos"
          prefixo={<Search size={16} aria-hidden="true" className="shrink-0 text-text-muted" />}
          classeDaCaixa="mx-6 mt-6"
        />

        {/* a barra de rolagem fica a 4 da borda da caixa (por isso o `mr-1`) e
            as linhas param 12 antes dela */}
        <div role="list" className="ml-6 mr-1 mt-3 max-h-[31.5rem] overflow-y-auto pr-3">
          {friendsLoading && !friendsLoaded ? (
            <p className="py-3 text-sm text-text-muted">Carregando amigos…</p>
          ) : !friendsLoaded ? (
            <p className="py-3 text-sm text-text-muted">
              Não foi possível carregar seus amigos.{" "}
              <button
                type="button"
                onClick={() => void loadFriends()}
                className="font-medium text-text-link hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center"
              >
                Tentar de novo
              </button>
            </p>
          ) : lista.length === 0 ? (
            <p className="py-3 text-sm text-text-muted">
              {friends.length === 0
                ? "Você ainda não tem amigos aqui. Copie o link abaixo e mande do jeito que preferir."
                : "Nenhum amigo com esse nome."}
            </p>
          ) : (
            lista.map((amigo) => {
              const convidado = convidados.includes(amigo.id);
              const mandando = enviando.includes(amigo.id);
              return (
                <div
                  key={amigo.id}
                  role="listitem"
                  className="flex h-12 items-center gap-2.5 rounded-lg"
                >
                  {/* sem bolinha de status: o Discord não a mostra nesta lista */}
                  <Avatar user={amigo} size="md" surface="border-background-base-lower" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold leading-5 text-text-strong">
                      {displayNameOf(amigo)}
                    </span>
                    <span className="block truncate text-xs leading-4 text-text-muted">
                      {amigo.username}
                    </span>
                  </span>
                  <Button
                    variante="secundario"
                    tamanho="sm"
                    disabled={convidado || !url}
                    carregando={mandando}
                    onClick={() => void convidar(amigo)}
                    icone={convidado ? <Check size={14} aria-hidden="true" /> : undefined}
                    className="shrink-0 celular:h-[44px]"
                  >
                    {convidado ? "Convidado" : "Convidar"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* a divisória do Discord vai de ponta a ponta da caixa: por isso a
            borda mora no bloco de baixo, que não tem o padding lateral */}
        <div className="border-t border-border-subtle px-6 pb-4 pt-6">
          <p className="text-base font-semibold leading-5 text-text-strong">
            Ou, envie um convite do servidor a um amigo
          </p>
          {!url && semPermissao ? (
            // sem `CREATE_INVITE` e sem link pronto (não veio por `code`): nada
            // para copiar nem para editar, só o aviso — como o resto do app
            // resolve "sem permissão" (`ServerSettingsModal`).
            <p className="mt-2 text-sm text-text-muted">
              Você não tem permissão para criar um convite para este servidor.
            </p>
          ) : (
            <>
              {/* input + botão num container só: no Discord os dois são uma
                  peça — o `sufixo` do `TextInput` é a mesma caixa */}
              <TextInput
                value={url || "gerando…"}
                readOnly
                aria-label="Link do convite"
                onFocus={(e) => e.currentTarget.select()}
                classeDaCaixa="mt-2"
                sufixo={
                  <Button
                    variante="primario"
                    tamanho="sm"
                    disabled={!url}
                    onClick={() => void copiar()}
                    icone={copied ? <Check size={16} aria-hidden="true" /> : undefined}
                    className="shrink-0 celular:h-[44px]"
                  >
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                }
              />
              <p aria-live="polite" className="mt-4 text-xs leading-4 text-text-muted">
                {invite?.expiresAt
                  ? `Seu link de convite expira em ${faltamAte(invite.expiresAt)}. `
                  : "Seu link de convite não expira. "}
                {/* editar recria o convite (mesma chamada da criação): sem
                    `CREATE_INVITE` o link que já existe continua visível, só
                    deixa de ser editável */}
                {!semPermissao && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditando(true)}
                      className="font-medium text-text-link hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center"
                    >
                      Editar link de convite
                    </button>
                    .
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </Dialog>

      {editando && (
        <Dialog
          telaCheiaNoCelular
          title="Configurações do link de convite"
          onClose={() => setEditando(false)}
          footer={
            <>
              <PrimaryButton onClick={() => void regerar()}>Gerar novo link</PrimaryButton>
              <SecondaryButton onClick={() => setEditando(false)}>Cancelar</SecondaryButton>
            </>
          }
        >
          <Select
            semDivisoria
            label="Expirar depois de"
            value={String(expiresInMinutes)}
            options={INVITE_EXPIRY_OPTIONS.map((o) => ({
              value: String(o.minutes),
              label: o.label,
            }))}
            onChange={(v) => setExpiresInMinutes(Number(v))}
          />

          <div className="mt-4">
            <Select
              semDivisoria
              label="Número máximo de usos"
              value={String(maxUses)}
              options={INVITE_USES_OPTIONS.map((o) => ({ value: String(o.uses), label: o.label }))}
              onChange={(v) => setMaxUses(Number(v))}
            />
          </div>

          {destinos.length > 0 && (
            <div className="mt-4">
              <Select
                semDivisoria
                label="Canal de destino"
                value={channelId}
                options={destinos.map((c) => ({
                  value: c.id,
                  label: c.type === "VOICE" ? (c.name ?? "") : `#${c.name}`,
                }))}
                onChange={setChannelId}
                emptyLabel="Padrão do servidor"
              />
            </div>
          )}

          <div className="mt-2 border-t border-border-subtle pt-1">
            <ToggleLinha
              checked={temporary}
              onChange={setTemporary}
              titulo="Conceder acesso de membro temporário"
              hint="Quem entrar por este link sai do servidor ao se desconectar, a menos que ganhe um cargo."
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
