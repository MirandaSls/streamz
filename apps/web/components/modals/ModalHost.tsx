"use client";

import ChannelAccessModal from "@/components/modals/ChannelAccessModal";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import CreateChannelModal from "@/components/modals/CreateChannelModal";
import CreateGroupDMModal from "@/components/modals/CreateGroupDMModal";
import ImageModal from "@/components/modals/ImageModal";
import InviteModal from "@/components/modals/InviteModal";
import InvitesModal from "@/components/modals/InvitesModal";
import PromptDialog from "@/components/modals/PromptDialog";
import SettingsModal from "@/components/modals/SettingsModal";
import { useUI } from "@/stores/ui";

/**
 * Único ponto de montagem de modal na tela.
 *
 * Com um modal por vez não há empilhamento acidental nem duas caixas
 * disputando o foco — e abrir um modal vira `ui.openModal(...)` de qualquer
 * lugar, sem prop drilling.
 */
export default function ModalHost() {
  const modal = useUI((s) => s.modal);
  if (!modal) return null;

  switch (modal.kind) {
    case "confirm":
      return <ConfirmDialog modal={modal} />;
    case "prompt":
      return <PromptDialog modal={modal} />;
    case "createChannel":
      return <CreateChannelModal />;
    case "channelAccess":
      return <ChannelAccessModal channelId={modal.channelId} />;
    case "invite":
      return <InviteModal code={modal.code} />;
    case "createGroupDM":
      return <CreateGroupDMModal />;
    case "settings":
      return <SettingsModal />;
    case "invites":
      return <InvitesModal guildId={modal.guildId} />;
    case "image":
      return <ImageModal url={modal.url} alt={modal.alt} />;
  }
}
