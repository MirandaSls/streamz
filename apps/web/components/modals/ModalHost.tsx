"use client";

import dynamic from "next/dynamic";
import QuickSwitcher from "@/components/ui/QuickSwitcher";
import AtalhosDoTeclado from "@/components/chat/AtalhosDoTeclado";
import { useUI, type Modal } from "@/stores/ui";

// Quase nenhum modal abre numa sessão — importar todos estaticamente jogava
// ~35 componentes no chunk inicial de /app. `next/dynamic` com `ssr: false`
// adia cada um para um chunk próprio, buscado só quando o `kind` correspondente
// entra na pilha (ver `renderModal` abaixo). `loading: () => null` evita flash
// de esqueleto: a abertura de modal já é uma ação do usuário, não a carga da tela.
const ChannelAccessModal = dynamic(() => import("@/components/modals/ChannelAccessModal"), {
  ssr: false,
  loading: () => null,
});
const ChannelSettingsModal = dynamic(() => import("@/components/modals/ChannelSettingsModal"), {
  ssr: false,
  loading: () => null,
});
const ChannelTopicModal = dynamic(() => import("@/components/modals/ChannelTopicModal"), {
  ssr: false,
  loading: () => null,
});
const ConfirmDialog = dynamic(() => import("@/components/modals/ConfirmDialog"), {
  ssr: false,
  loading: () => null,
});
const CategorySettingsModal = dynamic(() => import("@/components/modals/CategorySettingsModal"), {
  ssr: false,
  loading: () => null,
});
const CreateChannelModal = dynamic(() => import("@/components/modals/CreateChannelModal"), {
  ssr: false,
  loading: () => null,
});
const CreateGroupDMModal = dynamic(() => import("@/components/modals/CreateGroupDMModal"), {
  ssr: false,
  loading: () => null,
});
const CriarServidorModal = dynamic(() => import("@/components/modals/CriarServidorModal"), {
  ssr: false,
  loading: () => null,
});
const AdicionarSomModal = dynamic(() => import("@/components/modals/AdicionarSomModal"), {
  ssr: false,
  loading: () => null,
});
const GuildEmojisModal = dynamic(() => import("@/components/modals/GuildEmojisModal"), {
  ssr: false,
  loading: () => null,
});
const ImageModal = dynamic(() => import("@/components/modals/ImageModal"), {
  ssr: false,
  loading: () => null,
});
const InviteModal = dynamic(() => import("@/components/modals/InviteModal"), {
  ssr: false,
  loading: () => null,
});
const PromptDialog = dynamic(() => import("@/components/modals/PromptDialog"), {
  ssr: false,
  loading: () => null,
});
const ServerSettingsModal = dynamic(() => import("@/components/modals/ServerSettingsModal"), {
  ssr: false,
  loading: () => null,
});
const RecortarImagemModal = dynamic(() => import("@/components/modals/RecortarImagemModal"), {
  ssr: false,
  loading: () => null,
});
const SettingsModal = dynamic(() => import("@/components/modals/SettingsModal"), {
  ssr: false,
  loading: () => null,
});
// ── d-social ──
const AddGroupMembersModal = dynamic(() => import("@/components/modals/AddGroupMembersModal"), {
  ssr: false,
  loading: () => null,
});
const CustomStatusModal = dynamic(() => import("@/components/modals/CustomStatusModal"), {
  ssr: false,
  loading: () => null,
});
const GroupSettingsModal = dynamic(() => import("@/components/modals/GroupSettingsModal"), {
  ssr: false,
  loading: () => null,
});
const UserProfileModal = dynamic(() => import("@/components/modals/UserProfileModal"), {
  ssr: false,
  loading: () => null,
});
// ── h-moderacao ──
const BanModal = dynamic(() => import("@/components/modals/BanModal"), {
  ssr: false,
  loading: () => null,
});
const CreatePollModal = dynamic(() => import("@/components/modals/CreatePollModal"), {
  ssr: false,
  loading: () => null,
});
const KickModal = dynamic(() => import("@/components/modals/KickModal"), {
  ssr: false,
  loading: () => null,
});
const PollVotersModal = dynamic(() => import("@/components/modals/PollVotersModal"), {
  ssr: false,
  loading: () => null,
});
const ReportModal = dynamic(() => import("@/components/modals/ReportModal"), {
  ssr: false,
  loading: () => null,
});
const TimeoutModal = dynamic(() => import("@/components/modals/TimeoutModal"), {
  ssr: false,
  loading: () => null,
});
const VisaoDeModeradorModal = dynamic(() => import("@/components/modals/VisaoDeModeradorModal"), {
  ssr: false,
  loading: () => null,
});
const WelcomeModal = dynamic(() => import("@/components/modals/WelcomeModal"), {
  ssr: false,
  loading: () => null,
});
// ── multiconta ──
const AdicionarContaModal = dynamic(() => import("@/components/modals/AdicionarContaModal"), {
  ssr: false,
  loading: () => null,
});
const GerenciarContasModal = dynamic(() => import("@/components/modals/GerenciarContasModal"), {
  ssr: false,
  loading: () => null,
});
// ── menus de clique direito (stubs) ──
const EncaminharModal = dynamic(() => import("@/components/modals/EncaminharModal"), {
  ssr: false,
  loading: () => null,
});
const NotaDeUsuarioModal = dynamic(() => import("@/components/modals/NotaDeUsuarioModal"), {
  ssr: false,
  loading: () => null,
});
const ApelidoDeAmigoModal = dynamic(() => import("@/components/modals/ApelidoDeAmigoModal"), {
  ssr: false,
  loading: () => null,
});
const PrivacidadeDoServidorModal = dynamic(
  () => import("@/components/modals/PrivacidadeDoServidorModal"),
  { ssr: false, loading: () => null },
);
const PerfilPorServidorModal = dynamic(() => import("@/components/modals/PerfilPorServidorModal"), {
  ssr: false,
  loading: () => null,
});

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
      return <InviteModal guildId={modal.guildId} code={modal.code} channelId={modal.channelId} />;
    case "createGroupDM":
      return <CreateGroupDMModal />;
    case "criarServidor":
      return <CriarServidorModal tela={modal.tela} />;
    // ── multiconta ──
    case "gerenciarContas":
      return <GerenciarContasModal />;
    case "adicionarConta":
      return <AdicionarContaModal voltar={modal.voltar ?? false} />;
    case "settings":
      return <SettingsModal tab={modal.tab} />;
    case "image":
      return <ImageModal urls={[modal.url]} alts={[modal.alt]} indice={0} />;
    // ── f-voz ──
    // ── b-canais ──
    case "channelSettings":
      return <ChannelSettingsModal channelId={modal.channelId} tab={modal.tab} />;
    case "categorySettings":
      return <CategorySettingsModal categoryId={modal.categoryId} tab={modal.tab} />;
    case "channelTopic":
      return <ChannelTopicModal channelId={modal.channelId} />;
    // ── e-configuracoes ──
    case "quickSwitcher":
      return <QuickSwitcher />;
    case "atalhosDoTeclado":
      return <AtalhosDoTeclado />;
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
      return (
        <ImageModal
          urls={modal.urls}
          alts={modal.alts}
          anexoIds={modal.anexoIds}
          indice={modal.indice}
          messageId={modal.messageId}
        />
      );
    case "guildEmojis":
      return <GuildEmojisModal guildId={modal.guildId} />;
    case "adicionarSom":
      return <AdicionarSomModal guildId={modal.guildId} />;
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
    // ── menus de clique direito (stubs) ──
    case "encaminhar":
      return <EncaminharModal messageId={modal.messageId} channelId={modal.channelId} />;
    case "notaDeUsuario":
      return <NotaDeUsuarioModal userId={modal.userId} />;
    case "apelidoDeAmigo":
      return <ApelidoDeAmigoModal userId={modal.userId} />;
    case "privacidadeDoServidor":
      return <PrivacidadeDoServidorModal guildId={modal.guildId} />;
    case "perfilPorServidor":
      return <PerfilPorServidorModal guildId={modal.guildId} />;
    case "visaoDeModerador":
      return <VisaoDeModeradorModal guildId={modal.guildId} userId={modal.userId} />;
  }
}
