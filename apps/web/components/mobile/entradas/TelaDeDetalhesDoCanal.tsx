"use client";

import { useState } from "react";
import { ArrowLeft, Bell, BellOff, Hash, Lock, Megaphone, Search, Settings, Volume2 } from "@/components/ui/icones";
import { channelNotificationScope, isMuted, type Channel } from "@streamz/shared";
import AbasDoCanal from "@/components/mobile/entradas/AbasDoCanal";
import { rotuloDoTipoDeCanal, type AbaDoCanal } from "@/components/mobile/entradas/navegacao";
import { BotaoRedondo, CamadaDeEntrada } from "@/components/mobile/entradas/pecas";
import { BotaoDeToque } from "@/components/mobile/pecas";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { useNotifications } from "@/stores/notifications";
import { useCanManageActiveChannel } from "@/stores/permissions";
import { ui } from "@/stores/ui";

/**
 * Os detalhes do canal: o que o toque em `# nome ›` abre no Discord do celular.
 *
 * A tela inteira está no quadro 40 de `suporte/.../pin-messages-faq/14.gif`
 * ("Pins option in channel details (Mobile)"), que é a referência de
 * **presença e ordem** — GIF sem escala conhecida, então nenhum número daqui
 * sai dele (ver `pecas.tsx` e o cabeçalho de `AbasDoCanal.tsx`):
 *
 * 1. cabeçalho com a seta de voltar à esquerda e, à direita, três botões
 *    redondos — **busca, sino e engrenagem**;
 * 2. o cartão do canal: o ícone numa caixa, o nome em destaque e, embaixo,
 *    o tipo ("Text Channel");
 * 3. as abas (Membros · Fixadas · Threads — Mídia, Links e Arquivos ficam de
 *    fora, ver `navegacao.ts`) e o corpo da aba.
 *
 * Antes desta tela o mesmo toque abria só a lista de membros, num painel
 * deslizante — e fixadas e threads não tinham entrada nenhuma no celular
 * (`docs/LEIAUTE-MOBILE-COBERTURA.md` §5 e §6.2). A lista de membros agora é a
 * primeira aba, como no Discord.
 *
 * Os três botões do topo fazem o que os ícones do cabeçalho do desktop fazem
 * (`ChatView`): a lupa empilha a busca **por cima** destes detalhes (e o voltar
 * devolve a eles); o sino abre os mesmos dois submenus de notificação; a
 * engrenagem, as configurações do canal — e só aparece para quem pode editá-lo
 * (`MANAGE_CHANNELS`), a mesma regra da engrenagem da lista de canais.
 */
export default function TelaDeDetalhesDoCanal({
  canal,
  aoVoltar,
  aoBuscar,
  aoSaltar,
}: {
  canal: Channel;
  aoVoltar: () => void;
  aoBuscar: () => void;
  aoSaltar: () => void;
}) {
  const t = useT();
  const [aba, setAba] = useState<AbaDoCanal>("membros");
  const setting = useNotifications((s) => s.porEscopo[channelNotificationScope(canal.id)]);
  const podeEditar = useCanManageActiveChannel();
  const silenciado = isMuted(setting);

  const Icone =
    canal.type === "VOICE"
      ? Volume2
      : canal.type === "ANNOUNCEMENT" || canal.readOnly
        ? Megaphone
        : canal.private
          ? Lock
          : Hash;

  function abrirNotificacoes() {
    const escopo = { tipo: "canal" as const, channelId: canal.id };
    // no celular o `ContextMenuHost` desenha folha inferior e ignora o ponto
    ui.openContextMenu(window.innerWidth, 56, [
      submenuSilenciar("Silenciar canal", escopo, setting, t),
      submenuNotificacoes(escopo, setting, t),
    ]);
  }

  return (
    <CamadaDeEntrada rotulo={`Detalhes de ${canal.name ?? "canal"}`}>
      {/* 56 de altura, a barra de tela do celular (`MEDIDAS.md` §6). À direita,
          `pr-[10px]`: com o círculo de 32 centrado no alvo de 44 (6 de folga),
          a borda do último círculo fica a 16 da tela, a margem medida da lupa
          da conversa (`x 359..374` em `discord-mobile-chat-canal-2024.png`). */}
      <header className="flex h-[56px] shrink-0 items-center pl-1 pr-[10px]">
        <BotaoDeToque label="Voltar" onClick={aoVoltar}>
          <ArrowLeft size={24} />
        </BotaoDeToque>
        <div className="ml-auto flex items-center">
          <BotaoRedondo rotulo="Buscar neste canal" onClick={aoBuscar}>
            <Search size={18} />
          </BotaoRedondo>
          <BotaoRedondo
            rotulo={silenciado ? "Notificações do canal (silenciado)" : "Notificações do canal"}
            onClick={abrirNotificacoes}
          >
            {silenciado ? <BellOff size={18} /> : <Bell size={18} />}
          </BotaoRedondo>
          {podeEditar && (
            <BotaoRedondo
              rotulo="Configurações do canal"
              onClick={() => ui.openModal({ kind: "channelSettings", channelId: canal.id })}
            >
              <Settings size={18} />
            </BotaoRedondo>
          )}
        </div>
      </header>

      {/* O cartão do canal. Caixa do ícone de 40 com raio 8, nome em 20
          semibold e o tipo em 14: presença e hierarquia do GIF, tamanhos **não
          medidos** — 40 é o avatar da mensagem do celular (`MEDIDAS.md` §8), a
          única caixa quadrada ao lado de um nome que o acervo mede. */}
      <div className="flex shrink-0 items-center gap-3 px-4 pb-4 pt-2">
        <span
          aria-hidden="true"
          className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-lg bg-background-mod-subtle text-interactive-icon-default"
        >
          <Icone size={24} />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-text-lg font-semibold leading-tight text-text-strong">
            {canal.name ?? "canal"}
          </h2>
          <span className="truncate text-text-sm text-text-muted">{rotuloDoTipoDeCanal(canal)}</span>
        </div>
      </div>

      <AbasDoCanal canal={canal} aba={aba} aoMudarAba={setAba} aoSaltar={aoSaltar} />
    </CamadaDeEntrada>
  );
}
