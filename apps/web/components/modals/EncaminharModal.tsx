"use client";

import { useMemo, useState } from "react";
import { isGroupChannel } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { Hash } from "@/components/ui/icones";
import { Checkbox, TextArea, TextInput } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { ui, useUI } from "@/stores/ui";

/** Um destino selecionável: conversa direta/grupo ou canal de texto de servidor. */
interface Destino {
  channelId: string;
  guildId: string | null;
  /** título já pronto para a linha (sem o `#` do canal, que a linha desenha). */
  nome: string;
  subtitulo: string;
}

/**
 * "Encaminhar para" (ESPEC p1/p3, item Encaminhar): título, subtítulo, busca,
 * lista de destinos com checkbox (seleção múltipla), prévia da mensagem,
 * "Adicionar uma mensagem opcional…" e "Enviar" — como o Discord.
 *
 * Substitui o stub da leva anterior. A lista de destinos e o disparo do envio
 * eram antes `destinosParaEncaminhar`/`encaminhar`, dentro de `MessageItem`;
 * moveram para cá porque agora há seleção múltipla e prévia, e o menu de
 * contexto só abre este modal (sem submenu).
 *
 * **Limite herdado:** só os canais de texto do servidor **aberto agora**
 * entram na lista — `useChannels` só carrega o servidor ativo (não existe
 * "canais de todo servidor que participo" no cliente sem buscar servidor por
 * servidor), a mesma limitação que `destinosParaEncaminhar` já tinha.
 */
export default function EncaminharModal({
  messageId,
  channelId,
}: {
  messageId: string;
  channelId: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const eu = useAuth((s) => s.user);
  const send = useMessages((s) => s.send);
  // a mensagem já está carregada — é a que está na tela quando o menu abre —
  // mas o modal só recebe o id, então a prévia lê o mesmo lugar que a lista
  const mensagem = useMessages(
    (s) =>
      s.byChannel[channelId]?.items.find((m) => m.id === messageId) ??
      s.threadItems.find((m) => m.id === messageId) ??
      null,
  );
  const conversas = useDMs((s) => s.channels);
  const canaisDoServidor = useChannels((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);

  const [query, setQuery] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const destinos = useMemo<Destino[]>(() => {
    const dms = conversas.map<Destino>((d) => ({
      channelId: d.id,
      guildId: null,
      nome: dmTitle(d),
      subtitulo: isGroupChannel(d) ? "Grupo" : "Mensagem direta",
    }));
    const canais = canaisDoServidor
      .filter((c) => c.type === "TEXT" && c.id !== channelId)
      .map<Destino>((c) => ({
        channelId: c.id,
        guildId: c.guildId,
        nome: c.name ?? "canal",
        subtitulo: guilds.find((g) => g.id === c.guildId)?.name ?? "Servidor",
      }));
    return [...dms, ...canais];
  }, [conversas, canaisDoServidor, guilds, channelId]);

  const q = query.trim().toLowerCase();
  const filtrados = q ? destinos.filter((d) => d.nome.toLowerCase().includes(q)) : destinos;

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function enviar() {
    if (!eu || !mensagem || selecionados.size === 0) return;
    setEnviando(true);
    // O app não tem um "objeto de encaminhamento" (a mensagem original não
    // ganha referência): reenvia o texto citado, como o Discord mostraria numa
    // prévia — os anexos ficam presos à mensagem original.
    const citado = mensagem.content
      .split("\n")
      .map((linha) => `> ${linha}`)
      .join("\n");
    const texto = comentario.trim() ? `${citado}\n${comentario.trim()}` : citado;
    const alvos = destinos.filter((d) => selecionados.has(d.channelId));
    for (const alvo of alvos) {
      send({ channelId: alvo.channelId, guildId: alvo.guildId, author: eu, content: texto });
    }
    setEnviando(false);
    closeModal();
    ui.toast(
      alvos.length === 1
        ? `Mensagem encaminhada para ${alvos[0].nome}`
        : `Mensagem encaminhada para ${alvos.length} conversas`,
    );
  }

  return (
    <Dialog
      telaCheiaNoCelular
      title="Encaminhar para"
      description="Selecione onde você deseja compartilhar esta mensagem."
      onClose={closeModal}
      footer={
        <>
          {/* principal primeiro: o rodapé do `Dialog` o desenha à direita */}
          <PrimaryButton
            disabled={selecionados.size === 0 || !mensagem}
            carregando={enviando}
            onClick={() => void enviar()}
          >
            Enviar
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        placeholder="Para onde você quer enviar isso?"
        aria-label="Buscar conversa ou canal"
        classeDaCaixa="mb-2"
      />

      <div className="max-h-56 overflow-y-auto rounded bg-input-background-default/50">
        {filtrados.length === 0 ? (
          <p className="px-3 py-3 text-sm text-text-muted">Nada encontrado.</p>
        ) : (
          filtrados.map((d) => {
            const dm = d.guildId === null ? conversas.find((c) => c.id === d.channelId) : undefined;
            const marcado = selecionados.has(d.channelId);
            return (
              <div
                key={d.channelId}
                role="button"
                tabIndex={0}
                onClick={() => alternar(d.channelId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    alternar(d.channelId);
                  }
                }}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text-default ${
                  marcado ? "bg-interactive-background-selected" : "hover:bg-interactive-background-hover"
                }`}
              >
                {dm ? (
                  isGroupChannel(dm) ? (
                    <GroupAvatar iconUrl={dm.iconUrl} size="sm" />
                  ) : (
                    <Avatar user={dm.others[0]} size="sm" />
                  )
                ) : (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background-base-lower text-text-muted">
                    <Hash size={14} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{dm ? d.nome : `#${d.nome}`}</span>
                  <span className="block truncate text-xs text-text-muted">{d.subtitulo}</span>
                </span>
                {/* `stopPropagation`: sem ela, o clique no quadrado também dispara o
                    onClick da linha, e as duas marcações se cancelam. */}
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    marcado={marcado}
                    aoMudar={() => alternar(d.channelId)}
                    rotuloAcessivel={`Encaminhar para ${d.nome}`}
                  />
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 rounded border border-border-subtle bg-background-base-lower p-2">
        <span className="mb-1 block text-xs font-semibold text-text-muted">Mensagem</span>
        {mensagem ? (
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-text-default">
            {mensagem.content || "(sem texto)"}
          </p>
        ) : (
          <p className="text-sm text-text-muted">Esta mensagem não está mais disponível.</p>
        )}
      </div>

      <TextArea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Adicionar uma mensagem opcional..."
        rows={2}
        classeDaCaixa="mt-2"
        aria-label="Mensagem opcional"
      />
    </Dialog>
  );
}
