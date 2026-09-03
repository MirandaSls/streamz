"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, UserPlus } from "@/components/ui/icones";
import { displayNameOf, type PublicUser, type UserProfile } from "@streamz/shared";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useFriends, useRelationship } from "@/stores/friends";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { anchorOf, ui, type MenuItem } from "@/stores/ui";

/**
 * Coluna 4 quando a conversa é **1:1**: o perfil do contato.
 *
 * É a regra do Discord — em grupo a coluna mostra quem está na conversa
 * (`DMMemberList`), em conversa direta mostra a pessoa com quem se fala. Uma
 * "lista" de um participante só nunca disse nada que o cabeçalho já não
 * dissesse.
 *
 * O cartão flutua na coluna (raio, borda e recuo dos quatro lados) em vez de
 * ser uma faixa colada na borda da janela, e o fundo dele é mais claro que o do
 * chat: é o que separa o perfil da conversa sem precisar de divisória.
 *
 * **Nada aqui é inventado.** O que o `PublicUser` da store já traz (nome,
 * username, foto, status) aparece na hora; o resto (banner, "membro desde",
 * amigos mútuos) vem do `GET /users/:id/profile`, que é calculado por
 * espectador — e **cada seção some inteira quando o dado não existe**. Não há
 * contagem zero de amigos mútuos, nem data de entrada aproximada: ou é verdade,
 * ou não está na tela.
 */

/** "30 de jan. de 2018" — o formato do "membro desde" no print de referência. */
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

/** Quantas caras cabem na pilha antes do texto "N amigos mútuos". */
const MAX_CARAS = 3;

export default function DMProfilePanel({ user: raw }: { user: PublicUser }) {
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const send = useFriends((s) => s.send);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);

  // o perfil rico não cabe no PublicUser que a store da DM guarda
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  useEffect(() => {
    setPerfil(null);
    let vivo = true;
    void api
      .profile(raw.id)
      .then((p) => vivo && setPerfil(p))
      // sem perfil o painel continua de pé com o que a store já tem —
      // ele só perde as seções que dependiam da resposta
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [raw.id]);

  // a relação vem das listas em memória, não da resposta: assim o botão de
  // adicionar some no mesmo instante em que o pedido é enviado
  const relacao = useRelationship(raw.id, me?.id);
  const user = resolveUser(profiles, raw);
  const status = resolveStatus(statuses, user);
  const nome = displayNameOf(user);
  const mutuos = perfil?.mutualFriends ?? [];

  function abrirMenu(alvo: HTMLElement) {
    const itens: MenuItem[] = [];
    if (relacao === "friend") {
      itens.push({ label: "Remover amigo", danger: true, onSelect: () => void remove(user) });
    }
    itens.push(
      relacao === "blocked"
        ? { label: "Desbloquear", onSelect: () => void unblock(user.id) }
        : { label: "Bloquear", danger: true, onSelect: () => void block(user) },
    );
    const r = anchorOf(alvo);
    ui.openContextMenu(r.x, r.y + r.height + 4, itens);
  }

  return (
    <aside
      aria-label={`Perfil de ${nome}`}
      // o vão é do fundo do chat, não do painel: o cartão é que flutua.
      // 8px até o composer à esquerda, 7px nos outros três lados.
      className="flex w-[317px] shrink-0 flex-col bg-chat pb-[7px] pl-2 pr-[7px] pt-[7px]"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-input">
        <div className="relative shrink-0">
          {perfil?.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.bannerUrl} alt="" className="h-[105px] w-full object-cover" />
          ) : (
            <div
              // a cor é do usuário quando ele tem uma; sem ela o banner é uma
              // superfície neutra do tema — pôr a cor da marca aqui faria o
              // painel afirmar algo sobre a pessoa que ninguém disse
              style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
              className={`h-[105px] w-full ${perfil?.bannerColor ? "" : "bg-panel"}`}
            />
          )}

          {/* ações sobre a faixa, como no Discord — 32px, 8px de vão e de borda */}
          <div className="absolute right-2 top-2 flex items-center gap-2">
            {relacao === "none" && (
              <Tooltip label="Adicionar amigo">
                <button
                  type="button"
                  onClick={() => void send(user.username)}
                  aria-label={`Adicionar ${nome} como amigo`}
                  className="grid h-8 w-8 place-items-center rounded-full bg-black/[0.52] text-white transition hover:bg-black/70"
                >
                  <UserPlus size={18} />
                </button>
              </Tooltip>
            )}
            <Tooltip label="Mais opções">
              <button
                type="button"
                onClick={(e) => abrirMenu(e.currentTarget)}
                aria-label={`Mais opções para ${nome}`}
                aria-haspopup="menu"
                className="grid h-8 w-8 place-items-center rounded-full bg-black/[0.52] text-white transition hover:bg-black/70"
              >
                <MoreHorizontal size={18} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {/*
            O avatar sobe por cima da faixa: 31px dele ficam abaixo dela, e o
            "anel" de 6px é a própria cor do cartão — recorte, não borda
            desenhada. O `-55px` é `31 - 80 - 6`: o anel sobe 6px a mais que o
            avatar, e o `10px` da esquerda deixa o **avatar** nos 16px de recuo
            em que os textos também começam.
          */}
          <div className="relative -mt-[55px] ml-[10px] w-fit rounded-full border-[6px] border-input">
            <Avatar user={user} size="xl" />
            {/*
              O selo do `Avatar` fica no canto da caixa; aqui ele precisa pousar
              no ponto de 45° da circunferência. Mesma geometria medida no print
              `2026-09-03 161607` para o avatar de 80: disco de 16 dentro de um
              anel de 6 (caixa de 28), com o centro em 0,84375 × 80 = 67,5 —
              `-right-px` sobre a caixa de recheio (o avatar) põe o centro em 67.
              O fundo `bg-input` é o que aparece pelos recortes vazados.
            */}
            <span
              role="img"
              aria-label={STATUS_LABEL[status]}
              className="absolute -bottom-px -right-px h-7 w-7 rounded-full border-[6px] border-input bg-input"
            >
              <IconeDeStatus status={status} className="h-full w-full" />
            </span>
          </div>

          {/* tudo alinhado nos mesmos 16px do avatar; sem divisória entre seções */}
          <div className="px-4">
            {/* 21px do avatar até o nome — 6px deles já são o anel */}
            <h2 className="mt-[15px] truncate text-[20px] font-bold leading-[21px] text-txt-primary">
              {nome}
            </h2>
            {/* o username é branco, não apagado; os 21px de topo a topo saem da
                entrelinha do nome, não de uma margem */}
            <p className="truncate text-sm leading-[21px] text-txt-primary">{user.username}</p>

            {/* some inteira quando não há amigos em comum: zero não é um fato a
                mostrar, e sem a resposta do servidor não há contagem nenhuma */}
            {mutuos.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <span className="flex shrink-0">
                  {mutuos.slice(0, MAX_CARAS).map((amigo) => (
                    <Avatar
                      key={amigo.id}
                      user={amigo}
                      size="xs"
                      // 3px de sobreposição; o `ring` é box-shadow e não entra
                      // no leiaute, então ele recorta sem empurrar a pilha
                      className="-ml-[3px] rounded-full ring-2 ring-input first:ml-0"
                    />
                  ))}
                </span>
                <span className="truncate text-sm text-txt-secondary">
                  {mutuos.length === 1 ? "1 amigo mútuo" : `${mutuos.length} amigos mútuos`}
                </span>
              </div>
            )}

            {perfil?.createdAt && (
              <>
                <h3 className="mt-[25px] text-xs font-bold leading-4 text-txt-primary">
                  Membro desde
                </h3>
                {/* 26px de topo a topo com a linha de 16px acima */}
                <p className="mt-[10px] text-sm leading-[18px] text-txt-normal">
                  {DATA.format(new Date(perfil.createdAt))}
                </p>
              </>
            )}
          </div>
        </div>

        {/* o perfil completo já existe em modal; o rodapé só o abre */}
        <button
          type="button"
          onClick={() => ui.openModal({ kind: "userProfile", userId: user.id })}
          className="mx-4 mb-4 h-10 shrink-0 rounded-lg bg-border-strong text-base font-medium text-txt-primary transition hover:bg-border-strong-hover"
        >
          Ver Perfil Completo
        </button>
      </div>
    </aside>
  );
}
