"use client";

import { ArrowRight, ImagePlus, LogOut, Pencil, UserMinus, UserPlus } from "lucide-react";
import { displayNameOf, systemMessageText, type Message, type MessageType } from "@newdisc/shared";
import { horaCompleta } from "@/lib/format";
import { useLiveUser } from "@/stores/presence";

const ICONE: Record<MessageType, React.ReactNode> = {
  DEFAULT: <ArrowRight size={16} />,
  SYSTEM_MEMBER_ADDED: <UserPlus size={16} className="text-green" />,
  SYSTEM_MEMBER_REMOVED: <UserMinus size={16} className="text-red" />,
  SYSTEM_MEMBER_LEFT: <LogOut size={16} className="text-red" />,
  SYSTEM_GROUP_RENAMED: <Pencil size={16} className="text-txt-muted" />,
  SYSTEM_GROUP_ICON: <ImagePlus size={16} className="text-txt-muted" />,
};

/**
 * Evento do grupo na timeline ("X adicionou Y"): uma linha discreta com ícone,
 * sem avatar, hover nem ações — não é a fala de ninguém, é o que aconteceu.
 * O texto vem do contrato (`systemMessageText`) para a API e a UI não
 * divergirem no dia em que houver notificação de sistema.
 */
export default function SystemMessageItem({ message }: { message: Message }) {
  const autor = useLiveUser(message.author);
  return (
    <div className="flex items-center gap-2 py-0.5 pl-[72px] pr-12 text-sm text-txt-muted hover:bg-msghov">
      <span aria-hidden="true" className="-ml-9 shrink-0">
        {ICONE[message.type]}
      </span>
      <span className="min-w-0 break-words">
        {systemMessageText(message, displayNameOf(autor))}
      </span>
      <span className="shrink-0 text-xs text-txt-faint">{horaCompleta(message.createdAt)}</span>
    </div>
  );
}
