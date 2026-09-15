"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Pencil, RefreshCw, Trash2 } from "@/components/ui/icones";
import {
  MAX_CUSTOM_EMOJI_DIMENSION,
  MAX_CUSTOM_EMOJI_SIZE,
  MAX_EMOJIS_PER_GUILD,
  Permission,
  displayNameOf,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button, Tooltip } from "@/components/ui/primitivos";
import {
  TABELA_CABECALHO,
  TituloDaPagina,
} from "@/components/settings/server/pagina";
import { AJUDA_NOME, sugerirNome } from "@/components/settings/server/emojis-nome";
import { api } from "@/lib/api";
import { useCan } from "@/stores/permissions";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Aba "Emoji": o print `docs/Reference/Captura de tela 2026-09-04 100623.png`
 * (1919×1079, régua §7 da ADR-0009 — prints 1:1 acima do CSS) mostra dois
 * blocos separados por uma linha:
 *
 * 1. Título "Emoji" (o `<h1>` de `TituloDaPagina`) + descrição + **botão
 *    "Enviar emoji" numa linha própria abaixo da descrição**, não ao lado do
 *    título — por isso o botão saiu do slot `acao` de `TituloDaPagina` (que
 *    o coloca ao lado do `<h1>`) para virar um segundo bloco. Gap medido
 *    descrição→botão: 26px (glifo da 2ª linha termina em y154, botão começa
 *    em y180).
 * 2. Um segundo cabeçalho "Emoji" (mesmo tamanho do título, y349–362, 20px
 *    semibold) + "N espaços disponíveis" (y376+, 14px) acima da tabela.
 *    Separados do bloco 1 por um fio 1px em y300 (`--border-muted`, o mais
 *    fraco dos quatro tons de borda — `--border-subtle` mede o traço entre
 *    linhas da tabela, `--border-normal` o traço sob o cabeçalho da tabela).
 *    Gap fio→cabeçalho 2: 49px; cabeçalho 2→subtítulo: 14px.
 *
 * O print tem uma 3ª frase entre o botão e o fio ("Se você quiser enviar
 * vários emojis ou pular o editor, arraste e solte..."): descreve upload em
 * lote por arraste e um editor de recorte que o Streamz não tem (§6.6 do
 * PROCESSO — funcionalidade que não existe não se inventa; o `<input>` deste
 * arquivo aceita um arquivo por vez, sem `multiple`, e não há editor). Por
 * isso ela não foi portada, e o gap botão→fio usa a margem já padrão do
 * design system (24px, `mt-6`) em vez do valor do print (81px, que só cabia
 * porque preenchia essa frase).
 *
 * O print também cita "Emojis de GIFs animados podem ser usados por membros
 * com o Discord Nitro" — Nitro está fora de escopo (ADR-0009 §8), então aqui
 * todo mundo pode usar emoji animado; a frase não entra.
 */
export default function EmojiTab({ guildId }: { guildId: string }) {
  const carregado = useEmojis((s) => s.carregado);
  const falhouCarregar = useEmojis((s) => s.falhouCarregar);
  const recarregar = useEmojis((s) => s.recarregar);
  const emojis = useEmojis((s) => s.guilds.find((g) => g.guildId === guildId)?.emojis ?? []);
  const members = useGuilds((s) => s.members);
  const podeGerenciar = useCan(Permission.MANAGE_EMOJIS);
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
  const espacos = MAX_EMOJIS_PER_GUILD - emojis.length;

  return (
    <>
      <TituloDaPagina
        titulo="Emoji"
        subtitulo={`Emojis aparecem digitando :nome: em qualquer canal. Até ${MAX_EMOJIS_PER_GUILD} por servidor; PNG, GIF ou WebP de até ${Math.round(MAX_CUSTOM_EMOJI_SIZE / 1024)} KB e ${MAX_CUSTOM_EMOJI_DIMENSION}×${MAX_CUSTOM_EMOJI_DIMENSION}px.`}
      />

      {/* Botão numa linha própria, 26px abaixo da descrição (medido) — não é
          o slot `acao` de `TituloDaPagina`, que o poria ao lado do `<h1>`.
          Some inteiro sem `MANAGE_EMOJIS` (estado "sem permissão"): a lista
          continua visível, só as ações de escrever somem — o mesmo padrão de
          `MembrosTab.tsx`/`CargosTab.tsx` (`podeCargos && (...)`), sem aviso
          extra na tela. */}
      {podeGerenciar && (
        <Tooltip
          rotulo="O servidor já está com todos os espaços de emoji ocupados"
          desabilitado={!cheio}
        >
          <span className="mt-[26px] inline-block">
            <Button
              variante="primario"
              tamanho="md"
              carregando={enviando}
              disabled={cheio}
              onClick={() => inputRef.current?.click()}
              className="celular:h-[44px]"
            >
              Enviar emoji
            </Button>
          </span>
        </Tooltip>
      )}

      {podeGerenciar && (
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
      )}

      {/* Fio 1px em `--border-muted` (mais fraco que `--border-subtle`, que
          é o traço entre linhas da tabela abaixo) — o único separador do
          print entre os dois blocos. */}
      <div className="mt-6 border-t border-border-muted" />

      {/* Segundo cabeçalho "Emoji": mesmo tamanho do `<h1>` de cima
          (text-heading-lg/semibold/text-strong, y349–362 no print), não a
          legenda pequena em caixa alta que existia antes — o print não tem
          caixa alta aqui, é um título de seção do mesmo peso visual do
          título da página. Contagem em "N espaços disponíveis" (texto do
          print), não "N/50": no MAX exibe "0 espaços disponíveis", nunca um
          plural errado para 1. */}
      <h2 className="mt-[49px] text-heading-lg font-semibold text-text-strong">Emoji</h2>
      <p className="mt-[14px] text-text-sm text-text-default">
        {espacos === 1 ? "1 espaço disponível" : `${espacos} espaços disponíveis`}
      </p>

      {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
          largura espremeria quatro colunas em 358px e nenhuma ficaria legível.
          Em 660 (a coluna do desktop) o piso não tem efeito. */}
      <div className="mt-4 overflow-x-auto">
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
            {/* Carregando: a lista de emojis carrega uma vez no login
                (`stores/emojis.ts`), então este estado só aparece na
                primeira renderização do app — cobre o caso sem inventar
                esqueleto que nunca é visto de verdade. */}
            {!carregado && (
              <tr className="h-[64px]">
                <td colSpan={4} className="text-sm text-text-muted">
                  Carregando…
                </td>
              </tr>
            )}
            {/* Erro: `carregado` já é true (a chamada terminou), mas
                `falhouCarregar` diz que foi com `.catch` — sem isto "zero
                emojis" e "a rede caiu" ficavam idênticos (`stores/emojis.ts`).
                Checa antes do vazio: quando falha, `emojis` também está
                vazio, e o aviso de erro é o que importa mostrar. */}
            {carregado && falhouCarregar && (
              <tr>
                <td colSpan={4} className="py-2">
                  <BlocoDeErro tentar={() => void recarregar()} />
                </td>
              </tr>
            )}
            {carregado && !falhouCarregar && emojis.length === 0 && (
              <tr className="h-[64px]">
                <td colSpan={4} className="text-sm text-text-muted">
                  Nenhum emoji ainda.
                </td>
              </tr>
            )}
            {carregado &&
              !falhouCarregar &&
              emojis.map((emoji) => {
                const autor = members.find((m) => m.user.id === emoji.createdById)?.user ?? null;
                return (
                  <tr key={emoji.id} className="group h-[64px] border-b border-border-subtle align-middle">
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
                      {podeGerenciar && (
                        <span className="flex items-center justify-end gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 celular:opacity-100">
                          <BotaoDeIcone
                            rotulo="Renomear"
                            icone={<Pencil size={16} />}
                            tamanho="md"
                            comFundo
                            className="celular:h-[44px] celular:w-[44px]"
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
                          />
                          <BotaoDeIcone
                            rotulo="Apagar"
                            icone={<Trash2 size={16} />}
                            tamanho="md"
                            comFundo
                            perigo
                            className="celular:h-[44px] celular:w-[44px]"
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
                          />
                        </span>
                      )}
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

/**
 * Erro persistente de carregamento: o mesmo par ícone+mensagem+"Tentar de
 * novo" que `EngajamentoTab.tsx`/`SegurancaTab.tsx`/`SessoesTab.tsx` já usam
 * para a mesma falha (caixa `rounded-[4px] border border-border-subtle
 * bg-background-base-lowest`, `AlertTriangle` em `--status-warning`, botão
 * secundário com `RefreshCw`). Repetido aqui em vez de extraído porque as
 * outras fontes vivem em `components/settings/*.tsx` — fora da lista deste
 * cartão as duas, mas pertencendo à mesma família — e mover para um lugar
 * comum é trabalho de outro cartão, não deste.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar os emojis.</p>
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
