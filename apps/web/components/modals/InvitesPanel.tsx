"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "@/components/ui/icones";
import { displayNameOf, type InviteDetail } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button, Tooltip } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Convites do servidor: tabela (criado por, código, usos, expira em), cópia e
 * revogação.
 *
 * Vive separado do modal porque é a mesma tela em dois lugares — o modal
 * `InvitesModal` (atalho do menu do servidor) e a aba "Convites" das
 * configurações. Duplicar seria manter duas listas que envelhecem diferente.
 */
export default function InvitesPanel({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<InviteDetail[] | null>(null);
  const [busy, setBusy] = useState(false);
  // o relógio da coluna "Expira em"; um tique por segundo só enquanto houver
  // convite com prazo, senão o estado nem existe
  const [agora, setAgora] = useState(() => Date.now());
  const temPrazo = invites?.some((i) => i.expiresAt) ?? false;

  useEffect(() => {
    if (!temPrazo) return;
    setAgora(Date.now());
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [temPrazo]);

  useEffect(() => {
    let vivo = true;
    api
      .listInvites(guildId)
      .then((list) => vivo && setInvites(list))
      .catch((e) => {
        if (!vivo) return;
        ui.toast(errorMessage(e, "Não foi possível listar os convites"), "error");
        setInvites([]);
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  async function create() {
    setBusy(true);
    try {
      await api.createInvite(guildId);
      setInvites(await api.listInvites(guildId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: string) {
    try {
      await api.revokeInvite(guildId, code);
      setInvites((list) => list?.filter((i) => i.code !== code) ?? null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível revogar"), "error");
    }
  }

  return (
    <div>
      {/* Rótulo e botão na mesma linha, como no print `2026-09-04 100706`: o
          botão mede 169×40 (raio 8), o rótulo é caixa-alta de 12. "Pausar
          convites", que no print fica à esquerda dele, não existe aqui — a API
          não sabe suspender convite. */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
          Links de convite ativos
        </h3>
        <Button
          variante="primario"
          tamanho="md"
          disabled={busy}
          onClick={() => void create()}
          className="celular:h-[44px]"
        >
          {busy ? "Criando…" : "Criar link de convite"}
        </Button>
      </div>

      {/*
        A tabela do Discord, medida no print (660 de largura): colunas em
        0 / 203 / 366 / 437 / 558 — aqui como proporção, para caber também no
        diálogo de 480. Cabeçalho de 32 sem linha; linhas de 61 mais 1 de
        divisória. Sem a coluna "Cargos": convite não carrega cargo aqui. As
        ações (copiar, revogar) ocupam a última coluna e aparecem no hover.
      */}
      {/* como as outras tabelas do servidor (Membros, Emoji, Banimentos, Sons):
          cinco colunas não cabem nos 358px do celular, então a tabela rola
          **por dentro** em vez de espremer. No desktop os 660 da coluna passam
          do piso e nada muda. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[31%]" />
            <col className="w-[25%]" />
            <col className="w-[11%]" />
            <col className="w-[18%]" />
            <col />
          </colgroup>
          <thead>
            <tr className="h-8 text-left text-base font-semibold text-text-strong">
              <th scope="col" className="pr-2 font-semibold">
                Criado por
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Código do convite
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Usos
              </th>
              <th scope="col" className="pr-2 font-semibold">
                Expira em
              </th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invites === null ? (
              <tr className="h-[62px] border-b border-border-subtle">
                <td colSpan={5} className="text-text-muted">
                  Carregando…
                </td>
              </tr>
            ) : invites.length === 0 ? (
              <tr className="h-[62px] border-b border-border-subtle">
                <td colSpan={5} className="text-text-muted">
                  Nenhum convite ativo.
                </td>
              </tr>
            ) : (
              invites.map((i) => (
                <tr key={i.code} className="group h-[62px] border-b border-border-subtle transition hover:bg-interactive-background-hover">
                  <td className="pr-2">
                    <span className="flex items-center gap-3">
                      {i.creator ? (
                        <Avatar user={i.creator} size="sm" surface="border-background-base-lower" />
                      ) : (
                        <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full bg-background-base-lowest" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-base text-text-strong">
                          {i.creator ? displayNameOf(i.creator) : "Conta apagada"}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {i.channelName ? `#${i.channelName}` : "—"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="pr-2">
                    <code className="font-mono text-text-strong">{i.code}</code>
                  </td>
                  <td className="pr-2 text-text-strong">
                    {i.uses}
                    {i.maxUses ? `/${i.maxUses}` : ""}
                  </td>
                  <td className="pr-2 text-text-strong">
                    {i.expiresAt ? (
                      <Contagem ate={i.expiresAt} agora={agora} />
                    ) : (
                      <span aria-label="Nunca expira">∞</span>
                    )}
                  </td>
                  <td>
                    {/* No celular não existe hover: sem `celular:opacity-100` o "copiar" e o
                        "revogar" ficavam invisíveis, e a lista de convites não tinha
                        nenhuma ação alcançável pelo dedo. */}
                    <span className="flex items-center justify-end gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 celular:opacity-100">
                      <BotaoDeIcone
                        rotulo={`Copiar ${i.code}`}
                        icone={<Copy size={16} />}
                        comFundo
                        onClick={() => void navigator.clipboard?.writeText(i.code)}
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                      <BotaoDeIcone
                        rotulo={`Revogar ${i.code}`}
                        icone={<Trash2 size={16} />}
                        comFundo
                        perigo
                        onClick={() => void revoke(i.code)}
                        className="celular:h-[44px] celular:w-[44px]"
                      />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Dois dígitos, como o relógio do Discord. */
function dd(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "03:10:45:02" — dias:horas:minutos:segundos até expirar, como na coluna
 * "Expira em" do Discord. Um convite vencido mostra zeros até a lista
 * recarregar; a API não o devolve na próxima leitura.
 */
function Contagem({ ate, agora }: { ate: string; agora: number }) {
  const restante = Math.max(0, Math.floor((new Date(ate).getTime() - agora) / 1000));
  const dias = Math.floor(restante / 86_400);
  const horas = Math.floor((restante % 86_400) / 3600);
  const minutos = Math.floor((restante % 3600) / 60);
  const segundos = restante % 60;
  return (
    <Tooltip rotulo={horaCompleta(ate)}>
      <time dateTime={ate} className="font-mono tabular-nums">
        {dd(dias)}:{dd(horas)}:{dd(minutos)}:{dd(segundos)}
      </time>
    </Tooltip>
  );
}
