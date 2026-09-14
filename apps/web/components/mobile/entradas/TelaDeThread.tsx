"use client";

import { Link2, MessagesSquare, MoreHorizontal, X } from "@/components/ui/icones";
import { channelNotificationScope, messageLinkPath } from "@streamz/shared";
import ThreadPanel from "@/components/chat/ThreadPanel";
import { CamadaDeEntrada } from "@/components/mobile/entradas/pecas";
import { BotaoDeToque, CabecalhoMobile } from "@/components/mobile/pecas";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";
import { useT } from "@/lib/i18n";
import { urlPublica } from "@/lib/links-do-app";
import { submenuNotificacoes } from "@/lib/notification-menu";
import { useMessages } from "@/stores/messages";
import { useNotifications } from "@/stores/notifications";
import { ui, type MenuItem } from "@/stores/ui";

/**
 * A thread aberta, em tela cheia por cima da conversa.
 *
 * Antes desta tela, "Criar Tópico" no toque longo e o botão de thread da
 * mensagem mudavam o `threadParentId` e **nada aparecia**: o `ThreadPanel` é a
 * coluna 4 do `app/app/page.tsx`, que o shell de celular não monta
 * (`LEIAUTE-MOBILE-COBERTURA.md` §5). Quem decide se ela está aberta continua
 * sendo a store de mensagens — esta camada só existe enquanto houver thread —,
 * então todo caminho que já abria a thread no desktop passa a abri-la aqui
 * também, sem um segundo "abrir thread" para manter.
 *
 * O miolo é o **próprio `ThreadPanel`** (timeline, resposta, composer,
 * permissão de postar). Dele saem só duas coisas, pelo seletor da moldura:
 *
 * - a largura: a coluna tem `style.width` redimensionável; aqui ela é a tela
 *   (`!w-full` vence o `style` inline por ser `!important`);
 * - a alça de redimensionar e a barra de 49px com botões de 32. No lugar dela
 *   entra o `CabecalhoMobile` (56, seta de voltar e alvo de 44), e as ações da
 *   barra — notificações, copiar link, fechar — vão para o "…", que é onde o
 *   Discord as põe (`suporte/.../threads-faq/10.png`: "Notification Settings",
 *   "Close Thread", "Copy Thread ID" no menu das reticências do topo da
 *   thread).
 *
 * Esconder a barra pelo seletor é frágil: depende de ela ser o segundo `<div>`
 * da coluna. O certo é o `ThreadPanel` aceitar `semCabecalho`, como o `DMView`
 * — registrado em "faltando".
 *
 * O voltar do sistema fecha a thread (`useVoltarNoCelular`), e só ela: aberta
 * de dentro dos detalhes do canal, ela registra a camada depois deles e é a
 * primeira a sair.
 */
export default function TelaDeThread({
  channelId,
  guildId,
}: {
  channelId: string;
  /**
   * `null` numa conversa direta. Vem de quem abre, e não do `useChannels`: lá
   * fica o último servidor visitado, e o link de uma thread de DM sairia com o
   * servidor errado no caminho.
   */
  guildId: string | null;
}) {
  const t = useT();
  const parentId = useMessages((s) => s.threadParentId);
  const nome = useMessages((s) => s.threadItems[0]?.thread?.name);
  const closeThread = useMessages((s) => s.closeThread);
  const preferencia = useNotifications((s) => s.porEscopo[channelNotificationScope(channelId)]);

  useVoltarNoCelular(parentId !== null, closeThread);

  if (!parentId) return null;

  function abrirMenu(x: number, y: number) {
    const itens: MenuItem[] = [
      // não há escopo "thread" no contrato: a preferência é a do canal em que o
      // tópico vive — a mesma decisão do sino do `ThreadPanel`
      submenuNotificacoes({ tipo: "canal", channelId }, preferencia, t),
      {
        label: "Copiar link do tópico",
        icon: <Link2 size={18} />,
        onSelect: () => {
          // origem pública, como no "copiar link da mensagem" (ver `urlPublica`)
          const url = urlPublica(messageLinkPath(guildId, channelId, parentId as string));
          void navigator.clipboard?.writeText(url);
          ui.toast("Link do tópico copiado");
        },
      },
      { separator: true },
      { label: "Fechar tópico", icon: <X size={18} />, onSelect: closeThread },
    ];
    ui.openContextMenu(x, y, itens);
  }

  return (
    <CamadaDeEntrada rotulo="Tópico" acima>
      <CabecalhoMobile
        aoVoltar={closeThread}
        icone={<MessagesSquare size={20} />}
        titulo={nome ?? "Tópico"}
        acoes={
          <BotaoDeToque
            label="Mais opções do tópico"
            onClick={() => {
              // no celular o menu sobe como folha; a posição só vale no desktop
              abrirMenu(window.innerWidth, 56);
            }}
          >
            <MoreHorizontal size={22} />
          </BotaoDeToque>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col [&>aside]:!w-full [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-l-0 [&>aside>div:first-child]:hidden [&>aside>div:nth-child(2)]:hidden">
        <ThreadPanel channelId={channelId} />
      </div>
    </CamadaDeEntrada>
  );
}
