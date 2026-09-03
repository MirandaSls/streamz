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
import RecortarImagemModal from "@/components/modals/RecortarImagemModal";
import QuickSwitcher from "@/components/ui/QuickSwitcher";
import SettingsModal from "@/components/modals/SettingsModal";
// ── d-social ──
import AddGroupMembersModal from "@/components/modals/AddGroupMembersModal";
import CustomStatusModal from "@/components/modals/CustomStatusModal";
import GroupSettingsModal from "@/components/modals/GroupSettingsModal";
import UserProfileModal from "@/components/modals/UserProfileModal";
// ── h-moderacao ──
import BanModal from "@/components/modals/BanModal";
import CreatePollModal from "@/components/modals/CreatePollModal";
import KickModal from "@/components/modals/KickModal";
import PollVotersModal from "@/components/modals/PollVotersModal";
import ReportModal from "@/components/modals/ReportModal";
import TimeoutModal from "@/components/modals/TimeoutModal";
import WelcomeModal from "@/components/modals/WelcomeModal";
import { useUI, type Modal } from "@/stores/ui";

/**
 * Único ponto de montagem de modal na tela.
 *
 * Renderiza a **pilha**: confirmar algo de dentro das configurações abre a
 * caixa por cima e, ao cancelar, a tela de trás continua onde estava. A ordem
 * do DOM já resolve a sobreposição, e cada `Dialog` prende o próprio foco — o
 * de cima é o último a montar, então fica com ele.
 */
export default function ModalHost() {
  const modals = useUI((s) => s.modals);
  if (modals.length === 0) return null;

  return (
    <>
      {modals.map((modal, i) => (
        <div key={`${modal.kind}-${i}`}>{renderModal(modal)}</div>
      ))}
    </>
  );
}

function renderModal(modal: Modal) {
  switch (modal.kind) {
    case "confirm":
      return <ConfirmDialog modal={modal} />;
    case "prompt":
      return <PromptDialog modal={modal} />;
    case "recortarImagem":
      return <RecortarImagemModal modal={modal} />;
    case "createChannel":
      return <CreateChannelModal categoryId={modal.categoryId ?? null} tipo={modal.tipo} />;
    case "channelAccess":
      return <ChannelAccessModal channelId={modal.channelId} />;
    case "invite":
      return <InviteModal guildId={modal.guildId} code={modal.code} />;
    case "createGroupDM":
      return <CreateGroupDMModal />;
    case "settings":
      return <SettingsModal tab={modal.tab} />;
    case "invites":
      return <InvitesModal guildId={modal.guildId} />;
    case "image":
      return <ImageModal urls={[modal.url]} alts={[modal.alt]} indice={0} />;
    // ── f-voz ──
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
    case "welcome":
      return <WelcomeModal guildId={modal.guildId} />;
  }
}
