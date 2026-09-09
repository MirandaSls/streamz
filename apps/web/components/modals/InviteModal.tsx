"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Hash, Search } from "@/components/ui/icones";
import {
  INVITE_EXPIRY_OPTIONS,
  INVITE_USES_OPTIONS,
  WS_EVENTS,
  displayNameOf,
  type InviteInfo,
  type PublicUser,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import { Select, ToggleLinha } from "@/components/ui/controls";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { urlDeConvite } from "@/lib/links-de-convite";
import { useChannels } from "@/stores/channels";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
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
 * de 12 a 16 do campo. Diferenças anotadas no PR: o botão da linha usa o cinza
 * do `SecondaryButton` da casa (`border-strong`), o "Copiar" segue no `accent`
 * do Streamz (o do Discord é o blurple da marca dele) e o subtítulo fica em
 * `txt-muted`, como a descrição dos outros modais.
 */
export default function InviteModal({
  guildId,
  code: initialCode,
}: {
  guildId: string;
  code?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const friends = useFriends((s) => s.friends);
  const loadFriends = useFriends((s) => s.load);
  const channels = useChannels((s) => s.channels);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [copied, setCopied] = useState(false);
  const [editando, setEditando] = useState(false);
  const [convidados, setConvidados] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  // opções (o valor 0 é "nunca"/"sem limite", como nas listas do contrato)
  const [expiresInMinutes, setExpiresInMinutes] = useState(INVITE_EXPIRY_OPTIONS[5].minutes);
  const [maxUses, setMaxUses] = useState(0);
  const [temporary, setTemporary] = useState(false);
  const [channelId, setChannelId] = useState("");

  const textos = channels.filter((c) => c.type === "TEXT");
  const destino = textos.find((c) => c.id === channelId) ?? textos[0] ?? null;

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  // cria um convite assim que o modal abre (sem código pronto), como o Discord
  useEffect(() => {
    if (initialCode) return;
    let ativo = true;
    void api
      .createInvite(guildId, { expiresInMinutes: INVITE_EXPIRY_OPTIONS[5].minutes })
      .then((i) => {
        if (!ativo) return;
        setInvite(i);
        setCode(i.code);
      })
      .catch((e) => ativo && ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error"));
    return () => {
      ativo = false;
    };
  }, [guildId, initialCode]);

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
    if (!url) return;
    try {
      const dm = await api.openDM(amigo.id);
      emit(WS_EVENTS.MESSAGE_CREATE, { channelId: dm.id, content: url });
      setConvidados((prev) => [...prev, amigo.id]);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar o convite"), "error");
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
          <p className="flex items-center gap-1 px-6 text-base leading-5 text-txt-muted">
            <span className="shrink-0">Os destinatários chegarão em</span>
            <Hash size={16} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{destino.name}</span>
          </p>
        )}

        <div className="mx-6 mt-6 flex h-10 items-center gap-3 rounded-lg bg-void px-3 celular:h-[48px]">
          <Search size={16} aria-hidden="true" className="shrink-0 text-txt-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar amigo"
            placeholder="Buscar amigos"
            className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
          />
        </div>

        {/* a barra de rolagem fica a 4 da borda da caixa (por isso o `mr-1`) e
            as linhas param 12 antes dela */}
        <div role="list" className="ml-6 mr-1 mt-3 max-h-[31.5rem] overflow-y-auto pr-3">
          {lista.length === 0 ? (
            <p className="py-3 text-sm text-txt-muted">
              {friends.length === 0
                ? "Você ainda não tem amigos aqui. Copie o link abaixo e mande do jeito que preferir."
                : "Nenhum amigo com esse nome."}
            </p>
          ) : (
            lista.map((amigo) => {
              const convidado = convidados.includes(amigo.id);
              return (
                <div
                  key={amigo.id}
                  role="listitem"
                  className="flex h-12 items-center gap-2.5 rounded-lg"
                >
                  {/* sem bolinha de status: o Discord não a mostra nesta lista */}
                  <Avatar user={amigo} size="md" surface="border-chat" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold leading-5 text-txt-primary">
                      {displayNameOf(amigo)}
                    </span>
                    <span className="block truncate text-xs leading-4 text-txt-muted">
                      {amigo.username}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={convidado || !url}
                    onClick={() => void convidar(amigo)}
                    className={`flex h-8 celular:h-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium transition ${
                      convidado
                        ? "cursor-default border border-border-strong text-txt-muted"
                        : "bg-border-strong text-txt-normal hover:bg-border-strong-hover disabled:opacity-50"
                    }`}
                  >
                    {convidado && <Check size={14} aria-hidden="true" />}
                    {convidado ? "Convidado" : "Convidar"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* a divisória do Discord vai de ponta a ponta da caixa: por isso a
            borda mora no bloco de baixo, que não tem o padding lateral */}
        <div className="border-t border-border px-6 pb-4 pt-6">
          <p className="text-base font-semibold leading-5 text-txt-primary">
            Ou, envie um convite do servidor a um amigo
          </p>
          {/* input + botão num container só: no Discord os dois são uma peça */}
          {/* 52 no celular: a cápsula tem `overflow-hidden` e o "Copiar" sobe
              para os 44 do alvo de toque — em 40 ele saía cortado */}
          <div className="mt-2 flex h-10 items-center overflow-hidden rounded-lg bg-void pl-3 pr-1 celular:h-[52px]">
            <input
              value={url || "gerando…"}
              readOnly
              aria-label="Link do convite"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none"
            />
            <button
              type="button"
              disabled={!url}
              onClick={() => void copiar()}
              className="flex h-8 celular:h-[44px] shrink-0 items-center gap-1.5 rounded bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
            >
              {copied && <Check size={16} aria-hidden="true" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p aria-live="polite" className="mt-4 text-xs leading-4 text-txt-muted">
            {invite?.expiresAt
              ? `Seu link de convite expira em ${faltamAte(invite.expiresAt)}. `
              : "Seu link de convite não expira. "}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="font-medium text-txt-link hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center"
            >
              Editar link de convite
            </button>
            .
          </p>
        </div>
      </Dialog>

      {editando && (
        <Dialog
          telaCheiaNoCelular
          title="Configurações do link de convite"
          onClose={() => setEditando(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => void regerar()}
                className="h-[38px] min-w-24 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
              >
                Gerar novo link
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="h-[38px] min-w-24 rounded-[3px] px-4 text-sm font-medium text-txt-normal transition hover:underline"
              >
                Cancelar
              </button>
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

          {textos.length > 0 && (
            <div className="mt-4">
              <Select
                semDivisoria
                label="Canal de destino"
                value={channelId}
                options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                onChange={setChannelId}
                emptyLabel="Padrão do servidor"
              />
            </div>
          )}

          <div className="mt-2 border-t border-border pt-1">
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
