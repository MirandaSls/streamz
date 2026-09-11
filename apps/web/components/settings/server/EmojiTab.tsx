"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2 } from "@/components/ui/icones";
import {
  MAX_CUSTOM_EMOJI_DIMENSION,
  MAX_CUSTOM_EMOJI_SIZE,
  MAX_EMOJIS_PER_GUILD,
  displayNameOf,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import {
  BOTAO_ACENTO,
  TABELA_CABECALHO,
  TituloDaPagina,
} from "@/components/settings/server/pagina";
import { AJUDA_NOME, sugerirNome } from "@/components/settings/server/emojis-nome";
import { api } from "@/lib/api";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Aba "Emoji": o botão "Enviar emoji" e a tabela Imagem / Nome / Enviado por,
 * do print `docs/Reference/Captura de tela 2026-09-04 100623.png`.
 *
 * O `GuildEmojisModal` continua existindo e não é o mesmo lugar: ele abre pelo
 * rodapé do seletor de emoji ("Gerenciar emojis do servidor"), que é onde a
 * pessoa está quando percebe que falta um, e cobre também as figurinhas. Esta
 * aba é a entrada pelas configurações, com o desenho de tabela do print. As
 * duas mandam nas mesmas rotas e a lista se atualiza sozinha pelos eventos
 * `emoji.updated` — não há duas cópias do estado.
 *
 * Figurinhas não ganham aba: o print tem "Figurinhas" e "Painel de efeitos
 * sonoros" no mesmo grupo, mas criar uma página nova para o que já se gerencia
 * no modal seria inventar tela. As figurinhas seguem no `GuildEmojisModal`.
 */
export default function EmojiTab({ guildId }: { guildId: string }) {
  const emojis = useEmojis((s) => s.guilds.find((g) => g.guildId === guildId)?.emojis ?? []);
  const members = useGuilds((s) => s.members);
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
    <>
      <TituloDaPagina
        titulo="Emoji"
        subtitulo={`Emojis aparecem digitando :nome: em qualquer canal. Até ${MAX_EMOJIS_PER_GUILD} por servidor; PNG, GIF ou WebP de até ${Math.round(MAX_CUSTOM_EMOJI_SIZE / 1024)} KB e ${MAX_CUSTOM_EMOJI_DIMENSION}×${MAX_CUSTOM_EMOJI_DIMENSION}px.`}
        acao={
          <button
            type="button"
            disabled={enviando || emojis.length >= MAX_EMOJIS_PER_GUILD}
            onClick={() => inputRef.current?.click()}
            className={`h-10 celular:h-[44px] ${BOTAO_ACENTO}`}
          >
            {enviando ? "Enviando…" : "Enviar emoji"}
          </button>
        }
      />

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

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        Emoji — {emojis.length}/{MAX_EMOJIS_PER_GUILD}
      </p>

      {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
          largura espremeria quatro colunas em 358px e nenhuma ficaria legível.
          Em 660 (a coluna do desktop) o piso não tem efeito. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed">
          <colgroup>
            <col className="w-[72px]" />
            <col />
            <col className="w-[40%]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr className={`h-10 ${TABELA_CABECALHO}`}>
              <th scope="col" className="font-bold">
                Imagem
              </th>
              <th scope="col" className="font-bold">
                Nome
              </th>
              <th scope="col" className="font-bold">
                Enviado por
              </th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {emojis.length === 0 && (
              <tr className="h-[55px]">
                <td colSpan={4} className="text-sm text-text-muted">
                  Nenhum emoji ainda.
                </td>
              </tr>
            )}
            {emojis.map((emoji) => {
              const autor = members.find((m) => m.user.id === emoji.createdById)?.user ?? null;
              return (
                <tr key={emoji.id} className="group h-[55px] border-b border-border-subtle align-middle">
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={emoji.url}
                      alt={`:${emoji.name}:`}
                      className="h-8 w-8 object-contain"
                    />
                  </td>
                  <td className="pr-2">
                    <span className="truncate text-sm text-text-strong">:{emoji.name}:</span>
                    {emoji.animated && (
                      <span className="ml-2 text-[10px] uppercase text-channels-default">animado</span>
                    )}
                  </td>
                  <td className="pr-2">
                    {autor ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar user={autor} size="sm" surface="border-background-base-lower" />
                        <span className="truncate text-sm text-text-default">
                          {displayNameOf(autor)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center justify-end gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 celular:opacity-100">
                      <AcaoDaLinha
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
                      </AcaoDaLinha>
                      <AcaoDaLinha
                        label="Apagar"
                        danger
                        onClick={async () => {
                          const ok = await ui.confirm({
                            title: `Apagar :${emoji.name}:?`,
                            message:
                              "As mensagens que já o usaram passam a mostrar o nome em texto.",
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
                      </AcaoDaLinha>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AcaoDaLinha({
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
        className={`grid h-8 celular:h-[44px] w-8 celular:w-[44px] place-items-center rounded-lg text-text-muted transition hover:bg-border-normal ${
          danger ? "hover:text-status-danger" : "hover:text-text-strong"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
