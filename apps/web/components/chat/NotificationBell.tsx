"use client";

import { Bell, BellOff } from "lucide-react";
import { isMuted } from "@newdisc/shared";
import { HeaderIcon } from "@/components/chat/HeaderBar";
import { useT } from "@/lib/i18n";
import { abrirMenuDeNotificacao } from "@/lib/notification-menu";
import { useChannelSetting } from "@/stores/notifications";

/**
 * O sino do cabeçalho do canal: abre o menu de notificação daquele canal
 * (nível e silenciar por um tempo) e mostra, no próprio ícone, se ele está
 * silenciado — que é a única pista visual de "por que não estou recebendo
 * nada aqui".
 */
export default function NotificationBell({ channelId }: { channelId: string }) {
  const t = useT();
  const setting = useChannelSetting(channelId);
  const silenciado = isMuted(setting);

  return (
    <HeaderIcon
      label={t("aba.notificacoes")}
      active={silenciado}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        abrirMenuDeNotificacao(r.left - 160, r.bottom + 6, { tipo: "canal", channelId }, setting, t);
      }}
    >
      {silenciado ? <BellOff size={24} /> : <Bell size={24} />}
    </HeaderIcon>
  );
}
