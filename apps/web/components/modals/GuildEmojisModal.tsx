"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Pencil, RefreshCw, Trash2, Upload } from "@/components/ui/icones";
import {
  MAX_CUSTOM_EMOJI_DIMENSION,
  MAX_CUSTOM_EMOJI_SIZE,
  MAX_EMOJIS_PER_GUILD,
  MAX_STICKERS_PER_GUILD,
  MAX_STICKER_DIMENSION,
  MAX_STICKER_SIZE,
  Permission,
  type CustomEmoji,
  type Sticker,
} from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { AJUDA_NOME, sugerirNome } from "@/components/settings/server/emojis-nome";
import { BotaoDeIcone, Button, Tooltip } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useCan } from "@/stores/permissions";
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
 *
 * Sem print 1:1 para este modal (a régua §7 da ADR-0009 só tem
 * `docs/Reference/Captura de tela 2026-09-04 100623.png` para a **aba**
 * "Emoji" das configurações — ver `EmojiTab.tsx`): a estrutura de item/lista
 * já existente segue como está — mudar largura, altura de linha ou espaçamento
 * aqui sem uma medida seria chute (§6.3 do PROCESSO). O que mudou é a
 * cobertura de estado: "carregando" (reaproveita `carregado` da store, o mesmo
 * sinal de `EmojiTab.tsx`), "erro" (`falhouCarregar` da mesma store — troca as
 * duas abas por um `BlocoDeErro` só, porque emoji e figurinha carregam juntos
 * e falham juntos) e "sem permissão" (`Permission.MANAGE_EMOJIS` esconde os
 * dois botões "Enviar" e as ações por item — mesmo padrão de
 * `MembrosTab.tsx`/`CargosTab.tsx`, sem aviso extra na tela).
 */
export default function GuildEmojisModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const [aba, setAba] = useState<Aba>("emojis");
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId));
  const carregado = useEmojis((s) => s.carregado);
  const falhouCarregar = useEmojis((s) => s.falhouCarregar);
  const recarregar = useEmojis((s) => s.recarregar);
  const emojis = useEmojis((s) => s.guilds.find((g) => g.guildId === guildId)?.emojis ?? []);
  const figurinhas = useEmojis(
    (s) => s.stickerGuilds.find((g) => g.guildId === guildId)?.stickers ?? [],
  );
  // MANAGE_EMOJIS é o guarda-chuva único de emoji e figurinha
  // (`packages/shared/src/permissoes-discord.ts`, comentário da linha 121):
  // não existe um "gerenciar figurinhas" separado para checar à parte.
  const podeGerenciar = useCan(Permission.MANAGE_EMOJIS);

  return (
    <Dialog
      telaCheiaNoCelular
      title={`Emojis de ${guild?.name ?? "servidor"}`}
      description="Emojis aparecem digitando :nome: em qualquer canal. Figurinhas vão sozinhas na mensagem."
      onClose={closeModal}
      className="w-[520px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="mb-3 flex gap-1 border-b border-border-subtle" role="tablist">
        <AbaBotao ativa={aba === "emojis"} onClick={() => setAba("emojis")}>
          Emojis ({emojis.length}/{MAX_EMOJIS_PER_GUILD})
        </AbaBotao>
        <AbaBotao ativa={aba === "figurinhas"} onClick={() => setAba("figurinhas")}>
          Figurinhas ({figurinhas.length}/{MAX_STICKERS_PER_GUILD})
        </AbaBotao>
      </div>

      {!carregado ? (
        <p className="py-6 text-center text-sm text-text-muted">Carregando…</p>
      ) : falhouCarregar ? (
        <BlocoDeErro tentar={() => void recarregar()} />
      ) : aba === "emojis" ? (
        <ListaEmojis guildId={guildId} emojis={emojis} podeGerenciar={podeGerenciar} />
      ) : (
        <ListaFigurinhas guildId={guildId} figurinhas={figurinhas} podeGerenciar={podeGerenciar} />
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
          ? "border-brand-500 text-text-strong"
          : "border-transparent text-text-muted hover:text-text-default"
      }`}
    >
      {children}
    </button>
  );
}

function ListaEmojis({
  guildId,
  emojis,
  podeGerenciar,
}: {
  guildId: string;
  emojis: CustomEmoji[];
  podeGerenciar: boolean;
}) {
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

  const cheio = emojis.length >= MAX_EMOJIS_PER_GUILD;

  return (
    <div>
      {podeGerenciar && (
        <>
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
            disabled={enviando || cheio}
            cheio={cheio}
            onClick={() => inputRef.current?.click()}
            dica={`PNG, GIF ou WebP até ${Math.round(MAX_CUSTOM_EMOJI_SIZE / 1024)} KB e ${MAX_CUSTOM_EMOJI_DIMENSION}×${MAX_CUSTOM_EMOJI_DIMENSION}px`}
          />
        </>
      )}

      {emojis.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Nenhum emoji ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {emojis.map((emoji) => (
            <li
              key={emoji.id}
              className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-interactive-background-hover"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emoji.url} alt={`:${emoji.name}:`} className="h-8 w-8 object-contain" />
              <span className="min-w-0 flex-1 truncate text-sm text-text-default">
                :{emoji.name}:
              </span>
              {emoji.animated && <span className="text-[10px] text-channels-default">animado</span>}
              {podeGerenciar && (
                <>
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
                </>
              )}
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
  podeGerenciar,
}: {
  guildId: string;
  figurinhas: Sticker[];
  podeGerenciar: boolean;
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

  const cheio = figurinhas.length >= MAX_STICKERS_PER_GUILD;

  return (
    <div>
      {podeGerenciar && (
        <>
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
            disabled={enviando || cheio}
            cheio={cheio}
            onClick={() => inputRef.current?.click()}
            dica={`PNG, APNG ou WebP até ${Math.round(MAX_STICKER_SIZE / 1024)} KB e ${MAX_STICKER_DIMENSION}×${MAX_STICKER_DIMENSION}px`}
          />
        </>
      )}

      {figurinhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Nenhuma figurinha ainda.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {figurinhas.map((s) => (
            <li key={s.id} className="rounded bg-background-base-lowest p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={s.name} className="mx-auto h-20 w-20 object-contain" />
              <span className="mt-1 block truncate text-xs text-text-default">{s.name}</span>
              {podeGerenciar && (
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
                  className="mt-1 text-xs text-status-danger hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center celular:justify-center celular:px-3"
                >
                  Apagar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BotaoEnviar({
  disabled,
  cheio,
  onClick,
  dica,
}: {
  disabled: boolean;
  /** desabilitado por ter chegado no limite, não por já estar enviando — só
   *  esse caso ganha a dica explicando o motivo. */
  cheio: boolean;
  onClick: () => void;
  dica: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Tooltip rotulo="O servidor já está com todos os espaços ocupados" desabilitado={!cheio}>
        <span className="inline-block">
          <Button
            variante="primario"
            tamanho="sm"
            disabled={disabled}
            onClick={onClick}
            icone={<Upload size={16} aria-hidden="true" />}
            className="celular:h-[44px]"
          >
            Enviar
          </Button>
        </span>
      </Tooltip>
      <span className="text-xs text-text-muted">{dica}</span>
    </div>
  );
}

/**
 * Erro persistente de carregamento: o mesmo par ícone+mensagem+"Tentar de
 * novo" que `EngajamentoTab.tsx`/`EmojiTab.tsx`/`SegurancaTab.tsx`/
 * `SessoesTab.tsx` já usam para a mesma falha (caixa `rounded-[4px] border
 * border-border-subtle bg-background-base-lowest`, `AlertTriangle` em
 * `--status-warning`, botão secundário com `RefreshCw`). Repetido aqui em vez
 * de extraído porque as outras fontes vivem em `components/settings/*.tsx`,
 * fora da lista de arquivos deste cartão — mover para um lugar comum é
 * trabalho de outro cartão, não deste.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">
          Não foi possível carregar os emojis e figurinhas.
        </p>
      </div>
      <Button
        variante="secundario"
        tamanho="sm"
        icone={<RefreshCw size={14} aria-hidden="true" />}
        onClick={tentar}
        className="shrink-0 celular:h-[44px]"
      >
        Tentar de novo
      </Button>
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
    <BotaoDeIcone
      rotulo={label}
      icone={children}
      tamanho="sm"
      perigo={danger}
      comFundo
      onClick={onClick}
      className="celular:h-[44px] celular:w-[44px]"
    />
  );
}

