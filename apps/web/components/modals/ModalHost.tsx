"use client";

import ChannelAccessModal from "@/components/modals/ChannelAccessModal";
import ChannelSettingsModal from "@/components/modals/ChannelSettingsModal";
import ChannelTopicModal from "@/components/modals/ChannelTopicModal";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import CreateChannelModal from "@/components/modals/CreateChannelModal";
import CreateGroupDMModal from "@/components/modals/CreateGroupDMModal";
import GuildEmojisModal from "@/components/modals/GuildEmojisModal";
import ImageModal from "@/components/modals/ImageModal";
import InviteModal from "@/components/modals/InviteModal";
import InvitesModal from "@/components/modals/InvitesModal";
import PromptDialog from "@/components/modals/PromptDialog";
import ServerSettingsModal from "@/components/modals/ServerSettingsModal";
import QuickSwitcher from "@/components/ui/QuickSwitcher";
import SettingsModal from "@/components/modals/SettingsModal";
import IncomingCallModal from "@/components/voice/IncomingCallModal";
// ── d-social ──
import AddGroupMembersModal from "@/components/modals/AddGroupMembersModal";
import CustomStatusModal from "@/components/modals/CustomStatusModal";
import GroupSettingsModal from "@/components/modals/GroupSettingsModal";
import UserProfileModal from "@/components/modals/UserProfileModal";
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
      return <CreateChannelModal categoryId={modal.categoryId ?? null} />;
    case "channelAccess":
      return <ChannelAccessModal channelId={modal.channelId} />;
    case "invite":
      return <InviteModal code={modal.code} />;
    case "createGroupDM":
      return <CreateGroupDMModal />;
    case "settings":
      return <SettingsModal tab={modal.tab} />;
    case "invites":
      return <InvitesModal guildId={modal.guildId} />;
    case "image":
      return <ImageModal urls={[modal.url]} alts={[modal.alt]} indice={0} />;
    // ── f-voz ──
    case "incomingCall":
      return <IncomingCallModal />;
    // ── c-cargos ──
    case "serverSettings":
      return <ServerSettingsModal guildId={modal.guildId} />;
    // ── b-canais ──
    case "channelSettings":
      return <ChannelSettingsModal channelId={modal.channelId} tab={modal.tab} />;
    case "channelTopic":
      return <ChannelTopicModal channelId={modal.channelId} />;
    // ── e-configuracoes ──
    case "quickSwitcher":
      return <QuickSwitcher />;
    // ── d-social ──
    case "customStatus":
      return <CustomStatusModal />;
    case "userProfile":
      return <UserProfileModal userId={modal.userId} guildId={modal.guildId} />;
    case "groupSettings":
      return <GroupSettingsModal channelId={modal.channelId} />;
    case "addGroupMembers":
      return <AddGroupMembersModal channelId={modal.channelId} />;
    // ── g-emojis-midia ──
    case "galeria":
      return <ImageModal urls={modal.urls} alts={modal.alts} indice={modal.indice} />;
    case "guildEmojis":
      return <GuildEmojisModal guildId={modal.guildId} />;
  }
}
