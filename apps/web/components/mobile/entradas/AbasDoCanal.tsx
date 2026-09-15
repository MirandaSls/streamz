"use client";

import { ChevronRight, UserPlus } from "@/components/ui/icones";
import type { Channel } from "@streamz/shared";
import MemberList from "@/components/MemberList";
import ListaDeFixadas from "@/components/mobile/entradas/ListaDeFixadas";
import ListaDeThreads from "@/components/mobile/entradas/ListaDeThreads";
import { ABAS_DO_CANAL, type AbaDoCanal } from "@/components/mobile/entradas/navegacao";
import { Tabs } from "@/components/ui/primitivos";
import { useGuilds } from "@/stores/guilds";
import { useCanModerateActiveChannel } from "@/stores/permissions";

/**
 * As abas de um canal — Membros, Fixadas e Threads — e o corpo de cada uma.
 *
 * É a mesma peça nos dois lugares em que o Discord do celular a mostra: embaixo
 * do cartão do canal, nos detalhes (`suporte/.../pin-messages-faq/14.gif`,
 * quadro 40), e embaixo do campo, na busca **antes de digitar**
 * (`how-to-use-search-on-discord/03.gif`, quadro 20). Por isso ela é um
 * componente só e recebe a aba de fora: cada tela guarda a sua.
 *
 * As abas usam o primitivo `Tabs` (`sublinhado`, a barra do Discord: indicador
 * de 2px na cor de marca, rótulo de 14). O rótulo com padding de 16 embaixo
 * mede ~36 de altura, abaixo do piso de 44; o alvo vai a 44 pelo seletor da
 * moldura, sem mexer no primitivo — a caixa visual do sublinhado continua a do
 * CSS do Discord.
 */
export default function AbasDoCanal({
  canal,
  aba,
  aoMudarAba,
  aoSaltar,
}: {
  canal: Channel;
  aba: AbaDoCanal;
  aoMudarAba: (aba: AbaDoCanal) => void;
  /** fecha as entradas quando uma fixada leva de volta à conversa. */
  aoSaltar: () => void;
}) {
  // fixar e gerenciar threads pedem a mesma permissão no desktop (`ChatView`
  // passa `canModerate` aos dois popovers): `MANAGE_MESSAGES` no canal aberto
  const podeModerar = useCanModerateActiveChannel();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        rotulo="Seções do canal"
        valor={aba}
        aoMudar={aoMudarAba}
        abas={ABAS_DO_CANAL.map((a) => ({ valor: a.valor, rotulo: a.rotulo }))}
        className="shrink-0 px-4 [&>[role=tab]]:min-h-[44px]"
      />

      {aba === "membros" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {canal.guildId && <ConvidarMembros />}
          {/* a coluna 4 do desktop tem 264 fixos; aqui ela é a largura toda,
              como no painel deslizante que a mostrava antes */}
          <div className="flex min-h-0 flex-1 flex-col [&>aside]:!w-full [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:bg-transparent">
            <MemberList />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {aba === "fixadas" ? (
            <ListaDeFixadas
              channelId={canal.id}
              guildId={canal.guildId}
              nomeDoCanal={canal.name}
              podeFixar={podeModerar}
              aoSaltar={aoSaltar}
            />
          ) : (
            <ListaDeThreads channelId={canal.id} podeGerenciar={podeModerar} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Convidar membros", o cartão do topo da aba Membros
 * (`pin-messages-faq/14.gif`, quadro 40, e `how-to-use-search-on-discord/03.gif`,
 * quadro 20: círculo na cor de marca com o ícone de adicionar pessoa, o rótulo e
 * um `›` na ponta).
 *
 * Abre o mesmo modal de convite do menu do servidor (`useGuilds.createInvite`).
 * Na cor de marca o ícone é **escuro** (`--control-primary-text-default`, a
 * regra do limão da ADR-0009), e não o branco sobre o blurple do GIF.
 *
 * Medidas: o GIF não tem escala conhecida (quadro de 720px de largura,
 * assumido 390pt como no `MEDIDAS.md` §1, ±5%). Em proporção o cartão dá ≈55pt
 * de altura, a 15 das bordas, e o círculo ≈29 — números de proporção, não de
 * régua. Aqui: 56 de altura = o círculo de 32 do avatar da lista de membros
 * (`MEDIDAS.md` §10, 33,5pt) + 12 em cima e embaixo; margens laterais de 16.
 * Raio e cor do cartão: **não medidos** (GIF com paleta de 256 cores, §14);
 * `--background-mod-subtle` sobre a página e raio 8 (`--radius-sm`).
 */
function ConvidarMembros() {
  return (
    <button
      type="button"
      onClick={() => void useGuilds.getState().createInvite()}
      className="mx-4 mt-4 flex h-[56px] shrink-0 items-center gap-3 self-stretch rounded-lg bg-background-mod-subtle px-3 text-left active:bg-background-mod-normal"
    >
      <span
        aria-hidden="true"
        className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-control-primary-background-default text-control-primary-text-default"
      >
        <UserPlus size={18} />
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-text-strong">Convidar membros</span>
      <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-interactive-icon-default" />
    </button>
  );
}
