"use client";

import { Trash2 } from "@/components/ui/icones";
import {
  MAX_SOUNDBOARD_DURACAO_MS,
  MAX_SOUNDBOARD_POR_GUILD,
  MAX_SOUNDBOARD_SIZE,
  displayNameOf,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import {
  BOTAO_ACENTO,
  TABELA_CABECALHO,
  TituloDaPagina,
} from "@/components/settings/server/pagina";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { useSoundboard } from "@/stores/soundboard";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const SEGUNDOS = (MAX_SOUNDBOARD_DURACAO_MS / 1000).toFixed(1).replace(".", ",");
const KILOBYTES = Math.round(MAX_SOUNDBOARD_SIZE / 1024);

/**
 * Aba "Painel de efeitos sonoros": a tabela dos sons do servidor, com o mesmo
 * desenho da aba Emoji (Som / Nome / Enviado por / ações).
 *
 * Não é o único lugar de gestão, e não deveria ser: quem percebe que falta um
 * som está **na chamada**, com o painel aberto, e ali o "+ Adicionar som" e o
 * menu de contexto do card resolvem sem sair da call. Esta aba é a entrada
 * pelas configurações — as duas mandam nas mesmas rotas, e a lista se atualiza
 * pelos eventos `soundboard.updated`, então não há duas cópias do estado.
 *
 * Ouvir o som antes de apagar importa (o nome nem sempre diz qual é): o `<audio
 * controls>` da primeira coluna toca o arquivo direto da URL pública, sem
 * passar pela chamada e sem incomodar ninguém.
 */
export default function SoundboardTab({ guildId }: { guildId: string }) {
  const sons = useSoundboard((s) => s.guilds.find((g) => g.guildId === guildId)?.sounds ?? []);
  const members = useGuilds((s) => s.members);

  return (
    <>
      <TituloDaPagina
        titulo="Painel de efeitos sonoros"
        subtitulo={`Sons que qualquer um da chamada toca para todo mundo ouvir. Até ${MAX_SOUNDBOARD_POR_GUILD} por servidor; MP3, OGG ou WAV de até ${KILOBYTES} KB e ${SEGUNDOS} segundos.`}
        acao={
          <button
            type="button"
            disabled={sons.length >= MAX_SOUNDBOARD_POR_GUILD}
            onClick={() => ui.openModal({ kind: "adicionarSom", guildId })}
            className={`h-10 celular:h-[44px] ${BOTAO_ACENTO}`}
          >
            Adicionar som
          </button>
        }
      />

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        Sons — {sons.length}/{MAX_SOUNDBOARD_POR_GUILD}
      </p>

      {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
          largura espremeria quatro colunas em 358px e nenhuma ficaria legível.
          Em 660 (a coluna do desktop) o piso não tem efeito. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed">
          <colgroup>
            <col className="w-[220px]" />
            <col />
            <col className="w-[32%]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr className={`h-10 ${TABELA_CABECALHO}`}>
              <th scope="col" className="font-bold">
                Som
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
            {sons.length === 0 && (
              <tr className="h-[55px]">
                <td colSpan={4} className="text-sm text-text-muted">
                  Nenhum som ainda.
                </td>
              </tr>
            )}
            {sons.map((som) => {
              const autor = members.find((m) => m.user.id === som.createdById)?.user ?? null;
              return (
                <tr key={som.id} className="group h-[55px] border-b border-border-subtle align-middle">
                  <td className="pr-2">
                    {/* sem legenda de propósito: é um efeito sonoro de meio
                        segundo, não fala — o nome ao lado é a descrição dele */}
                    <audio src={som.url} controls preload="none" className="h-8 w-[200px]" />
                  </td>
                  <td className="pr-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="shrink-0 text-base leading-none">
                        {som.emoji || "🔊"}
                      </span>
                      <span className="truncate text-sm text-text-strong">{som.name}</span>
                    </span>
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
                      <Tooltip label="Remover">
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={async () => {
                            const ok = await ui.confirm({
                              title: `Remover "${som.name}"?`,
                              message: "O som sai do painel de todo mundo do servidor.",
                              confirmLabel: "Remover",
                              danger: true,
                            });
                            if (!ok) return;
                            try {
                              await api.deleteSound(guildId, som.id);
                            } catch (e) {
                              ui.toast(errorMessage(e, "Não foi possível remover"), "error");
                            }
                          }}
                          className="grid h-8 celular:h-[44px] w-8 celular:w-[44px] place-items-center rounded-lg text-text-muted transition hover:bg-border-normal hover:text-status-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </Tooltip>
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
