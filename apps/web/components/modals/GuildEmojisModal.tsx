"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2, Upload } from "@/components/ui/icones";
import {
  MAX_CUSTOM_EMOJI_DIMENSION,
  MAX_CUSTOM_EMOJI_SIZE,
  MAX_EMOJIS_PER_GUILD,
  MAX_STICKERS_PER_GUILD,
  MAX_STICKER_DIMENSION,
  MAX_STICKER_SIZE,
  type CustomEmoji,
  type Sticker,
} from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { AJUDA_NOME, sugerirNome } from "@/components/settings/server/emojis-nome";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { ui, useUI } from "@/stores/ui";

type Aba = "emojis" | "figurinhas";

/**
 * Gerência dos emojis e figurinhas de um servidor.
 *
 * Abre pelo próprio seletor (rodapé "Gerenciar emojis do servidor"), que é onde
 * a pessoa está quando percebe que falta um emoji — o caminho do Discord.
 * A lista da tela não é recarregada na mão: cada mutação faz o servidor emitir
 * `emoji.updated`/`sticker.updated`, e a store se atualiza sozinha.
 */
export default function GuildEmojisModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [aba, setAba] = useState<Aba>("emojis");
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId));
  const emojis = useEmojis((s) => s.guilds.find((g) => g.guildId === guildId)?.emojis ?? []);
  const figurinhas = useEmojis(
    (s) => s.stickerGuilds.find((g) => g.guildId === guildId)?.stickers ?? [],
  );

  return (
    <Dialog
      telaCheiaNoCelular
      title={`Emojis de ${guild?.name ?? "servidor"}`}
      description="Emojis aparecem digitando :nome: em qualquer canal. Figurinhas vão sozinhas na mensagem."
      onClose={closeModal}
      className="w-[520px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="mb-3 flex gap-1 border-b border-black/30" role="tablist">
        <AbaBotao ativa={aba === "emojis"} onClick={() => setAba("emojis")}>
          Emojis ({emojis.length}/{MAX_EMOJIS_PER_GUILD})
        </AbaBotao>
        <AbaBotao ativa={aba === "figurinhas"} onClick={() => setAba("figurinhas")}>
          Figurinhas ({figurinhas.length}/{MAX_STICKERS_PER_GUILD})
        </AbaBotao>
      </div>

      {aba === "emojis" ? (
        <ListaEmojis guildId={guildId} emojis={emojis} />
      ) : (
        <ListaFigurinhas guildId={guildId} figurinhas={figurinhas} />
      )}
    </Dialog>
  );
}

function AbaBotao({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
        ativa
          ? "border-accent text-txt-primary"
          : "border-transparent text-txt-muted hover:text-txt-normal"
      }`}
    >
      {children}
    </button>
  );
}

function ListaEmojis({ guildId, emojis }: { guildId: string; emojis: CustomEmoji[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File) {
    const nome = await ui.prompt({
      title: "Nome do emoji",
      message: AJUDA_NOME,
      placeholder: "festa",
      initial: sugerirNome(file.name),
      confirmLabel: "Enviar",
    });
    if (!nome) return;
    setEnviando(true);
    try {
      await api.createEmoji(guildId, nome, file);
      ui.toast(`Emoji :${nome}: criado.`);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o emoji"), "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void enviar(file);
        }}
      />
      <BotaoEnviar
        disabled={enviando || emojis.length >= MAX_EMOJIS_PER_GUILD}
        onClick={() => inputRef.current?.click()}
        dica={`PNG, GIF ou WebP até ${Math.round(MAX_CUSTOM_EMOJI_SIZE / 1024)} KB e ${MAX_CUSTOM_EMOJI_DIMENSION}×${MAX_CUSTOM_EMOJI_DIMENSION}px`}
      />

      {emojis.length === 0 ? (
        <p className="py-6 text-center text-sm text-txt-muted">Nenhum emoji ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {emojis.map((emoji) => (
            <li
              key={emoji.id}
              className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-hov"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emoji.url} alt={`:${emoji.name}:`} className="h-8 w-8 object-contain" />
              <span className="min-w-0 flex-1 truncate text-sm text-txt-normal">
                :{emoji.name}:
              </span>
              {emoji.animated && <span className="text-[10px] text-txt-faint">animado</span>}
              <IconeAcao
                label="Renomear"
                onClick={async () => {
                  const nome = await ui.prompt({
                    title: "Novo nome",
                    message: AJUDA_NOME,
                    initial: emoji.name,
                    confirmLabel: "Renomear",
                  });
                  if (!nome || nome === emoji.name) return;
                  try {
                    await api.renameEmoji(guildId, emoji.id, nome);
                  } catch (e) {
                    ui.toast(errorMessage(e, "Não foi possível renomear"), "error");
                  }
                }}
              >
                <Pencil size={16} />
              </IconeAcao>
              <IconeAcao
                label="Apagar"
                danger
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: `Apagar :${emoji.name}:?`,
                    message: "As mensagens que já o usaram passam a mostrar o nome em texto.",
                    confirmLabel: "Apagar",
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await api.deleteEmoji(guildId, emoji.id);
                  } catch (e) {
                    ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
                  }
                }}
              >
                <Trash2 size={16} />
              </IconeAcao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListaFigurinhas({
  guildId,
  figurinhas,
}: {
  guildId: string;
  figurinhas: Sticker[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File) {
    const nome = await ui.prompt({
      title: "Nome da figurinha",
      message: AJUDA_NOME,
      initial: sugerirNome(file.name),
      confirmLabel: "Continuar",
    });
    if (!nome) return;
    const tags = await ui.prompt({
      title: "Palavras-chave",
      message: "Separadas por espaço — é o que a busca do seletor consulta. Pode deixar vazio.",
      initial: "",
      confirmLabel: "Enviar",
    });
    setEnviando(true);
    try {
      await api.createSticker(guildId, nome, tags ?? "", file);
      ui.toast(`Figurinha "${nome}" criada.`);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar a figurinha"), "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void enviar(file);
        }}
      />
      <BotaoEnviar
        disabled={enviando || figurinhas.length >= MAX_STICKERS_PER_GUILD}
        onClick={() => inputRef.current?.click()}
        dica={`PNG, APNG ou WebP até ${Math.round(MAX_STICKER_SIZE / 1024)} KB e ${MAX_STICKER_DIMENSION}×${MAX_STICKER_DIMENSION}px`}
      />

      {figurinhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-txt-muted">Nenhuma figurinha ainda.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {figurinhas.map((s) => (
            <li key={s.id} className="rounded bg-panel p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={s.name} className="mx-auto h-20 w-20 object-contain" />
              <span className="mt-1 block truncate text-xs text-txt-normal">{s.name}</span>
              <button
                type="button"
                onClick={async () => {
                  const ok = await ui.confirm({
                    title: `Apagar "${s.name}"?`,
                    message: "As mensagens que já a usaram ficam sem a figurinha.",
                    confirmLabel: "Apagar",
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await api.deleteSticker(guildId, s.id);
                  } catch (e) {
                    ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
                  }
                }}
                className="mt-1 text-xs text-red hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center celular:justify-center celular:px-3"
              >
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BotaoEnviar({
  disabled,
  onClick,
  dica,
}: {
  disabled: boolean;
  onClick: () => void;
  dica: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex h-9 celular:h-[44px] items-center gap-2 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload size={16} aria-hidden="true" />
        Enviar
      </button>
      <span className="text-xs text-txt-muted">{dica}</span>
    </div>
  );
}

function IconeAcao({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`grid h-7 celular:h-[44px] w-7 celular:w-[44px] place-items-center rounded text-txt-secondary transition hover:bg-sel ${
          danger ? "hover:text-red" : "hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

