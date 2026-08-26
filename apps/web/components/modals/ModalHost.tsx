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
// ── h-moderacao ──
import BanModal from "@/components/modals/BanModal";
import CreatePollModal from "@/components/modals/CreatePollModal";
import DiscoverModal from "@/components/modals/DiscoverModal";
import KickModal from "@/components/modals/KickModal";
import PollVotersModal from "@/components/modals/PollVotersModal";
import ReportModal from "@/components/modals/ReportModal";
import ServerSettingsModal from "@/components/modals/ServerSettingsModal";
import TimeoutModal from "@/components/modals/TimeoutModal";
import WelcomeModal from "@/components/modals/WelcomeModal";
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
      return <InviteModal guildId={modal.guildId} code={modal.code} />;
    case "createGroupDM":
      return <CreateGroupDMModal />;
    case "settings":
      return <SettingsModal />;
    case "invites":
      return <InvitesModal guildId={modal.guildId} />;
    case "image":
      return <ImageModal url={modal.url} alt={modal.alt} />;
    // ── h-moderacao ──
    case "timeout":
      return <TimeoutModal guildId={modal.guildId} user={modal.user} />;
    case "kick":
      return <KickModal guildId={modal.guildId} user={modal.user} />;
    case "ban":
      return <BanModal guildId={modal.guildId} user={modal.user} />;
    case "report":
      return <ReportModal messageId={modal.messageId} preview={modal.preview} />;
    case "createPoll":
      return <CreatePollModal channelId={modal.channelId} />;
    case "pollVoters":
      return <PollVotersModal messageId={modal.messageId} />;
    case "serverSettings":
      return <ServerSettingsModal guildId={modal.guildId} tab={modal.tab} />;
    case "discover":
      return <DiscoverModal />;
    case "welcome":
      return <WelcomeModal guildId={modal.guildId} />;
  }
}
