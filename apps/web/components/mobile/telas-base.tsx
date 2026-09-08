"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Headphones,
  HeadphoneOff,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Pencil,
  Settings,
  User,
  Users,
} from "@/components/ui/icones";
import {
  customStatusOf,
  displayNameOf,
  type UserProfile,
  type UserStatus,
} from "@streamz/shared";
import InboxPopover from "@/components/chat/InboxPopover";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import DMList from "@/components/layout/DMList";
import GuildRail from "@/components/layout/GuildRail";
import Avatar from "@/components/ui/Avatar";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useAuth } from "@/stores/auth";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { ui } from "@/stores/ui";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * As quatro telas que ficam na **base** de cada aba do celular.
 *
 * Todas são embrulhos: o conteúdo é o mesmo componente do desktop, e o que
 * muda é a caixa em volta. As colunas do desktop têm largura fixa (294 na de
 * canais e conversas, 267 na de membros) porque lá elas convivem com outras
 * três; aqui cada uma ocupa a tela inteira, e a largura é anulada com um
 * `!w-full` no pai — anular de fora é o que mantém o arquivo do desktop
 * intocado.
 */

/**
 * Anula as larguras fixas das colunas do desktop dentro deste bloco e as faz
 * ocupar a altura toda: no desktop a coluna é filha de uma linha (a altura vem
 * de graça); aqui ela é filha de uma coluna, e sem `flex-1` a lista termina na
 * altura do último canal, deixando o resto da tela com o fundo do chat.
 */
const COLUNA_INTEIRA = "[&>aside]:!w-full [&>aside]:min-h-0 [&>aside]:flex-1";

/**
 * Aba **Servidores**: a rail à esquerda e a lista de canais do servidor
 * escolhido preenchendo o resto — lado a lado, como no app do Discord. É a
 * única aba com duas colunas, e é assim no original: a rail é a navegação
 * entre servidores e precisa estar sempre à vista.
 *
 * O cabeçalho com o nome do servidor e o menu já é o da `ChannelSidebar`; não
 * há um segundo por cima dele.
 */
export function TelaServidores() {
  return (
    <div className="flex h-full min-h-0">
      <GuildRail compacto />
      <div className={`flex min-w-0 flex-1 flex-col ${COLUNA_INTEIRA}`}>
        <ChannelSidebar />
      </div>
    </div>
  );
}

/** Aba **Mensagens**: a lista de conversas em tela cheia. */
export function TelaMensagens() {
  return (
    <div className={`flex h-full min-h-0 flex-col ${COLUNA_INTEIRA}`}>
      <DMList />
    </div>
  );
}

/**
 * Aba **Notificações**: a caixa de entrada do desktop, sem o popover em volta.
 *
 * O `modoTela` do `HeaderPopover` é justamente isto — o painel sem botão,
 * sempre aberto, preenchendo o pai. Sem ele a caixa de entrada só existiria
 * pendurada num ícone de cabeçalho que o celular não tem.
 */
export function TelaNotificacoes() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <InboxPopover modoTela />
    </div>
  );
}

/** Uma linha de menu da aba "Você": ícone, rótulo e a seta. */
function Linha({
  icone,
  rotulo,
  detalhe,
  perigo = false,
  onClick,
}: {
  icone: ReactNode;
  rotulo: string;
  detalhe?: string;
  perigo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left transition active:bg-hov ${
        perigo ? "text-red" : "text-txt-normal"
      }`}
    >
      <span className="shrink-0 text-txt-secondary" aria-hidden="true">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rotulo}</span>
        {detalhe && <span className="block truncate text-xs text-txt-muted">{detalhe}</span>}
      </span>
      {!perigo && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-txt-faint" />}
    </button>
  );
}

/** As quatro opções de status, na ordem e com os rótulos do `ProfilePopover`. */
const STATUS: { valor: UserStatus | null; ponto: UserStatus; rotulo: string }[] = [
  { valor: null, ponto: "ONLINE", rotulo: "Disponível" },
  { valor: "IDLE", ponto: "IDLE", rotulo: "Ausente" },
  { valor: "DND", ponto: "DND", rotulo: "Não perturbar" },
  { valor: "OFFLINE", ponto: "OFFLINE", rotulo: "Invisível" },
];

/**
 * Aba **Você**: o cartão de perfil, o status, o microfone e a porta das
 * configurações.
 *
 * A forma vem da captura oficial `docs/Reference/mobile/discord-mobile-voce.png`
 * (1px=1pt): **banner** no topo com a engrenagem por cima no canto direito,
 * avatar transbordando a borda do banner à esquerda, e o conteúdo em **cartões
 * arredondados** — nome e @username, status personalizado, os botões de editar,
 * e "Sobre mim" quando existe.
 *
 * É a única tela nova deste leiaute. No desktop o mesmo conteúdo mora em duas
 * superfícies que dependem de hover e de espaço lateral: o card flutuante do
 * rodapé (`UserFooter`) e o cartão de perfil (`ProfilePopover`). As ações, no
 * entanto, são as mesmas de lá — nada aqui é função nova do produto.
 *
 * O status é escolhido **na própria tela**, e não num submenu: no celular um
 * menu que abre outro menu são dois toques e uma caixa cobrindo o que se estava
 * lendo, para uma escolha entre quatro itens que cabem na tela.
 *
 * O banner e o "sobre mim" vêm de `GET /users/:id/profile` — não estão no
 * `PublicUser` da sessão. Enquanto a resposta não chega (ou se falhar), o topo
 * é a faixa de cor do tema: nunca um buraco.
 */
export function TelaVoce() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const profiles = usePresence((s) => s.profiles);
  const statuses = usePresence((s) => s.statuses);
  const muted = useVoicePrefs((s) => s.muted);
  const deafened = useVoicePrefs((s) => s.deafened);
  const toggleMute = useVoicePrefs((s) => s.toggleMute);
  const toggleDeafen = useVoicePrefs((s) => s.toggleDeafen);
  const [perfil, setPerfil] = useState<UserProfile | null>(null);

  const meuId = user?.id;
  useEffect(() => {
    if (!meuId) return;
    let vivo = true;
    void api
      .profile(meuId)
      .then((p) => vivo && setPerfil(p))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [meuId]);

  if (!user) return null;
  const vivo = resolveUser(profiles, user);
  const status = resolveStatus(statuses, vivo);
  const personalizado = customStatusOf(vivo);

  async function aplicarStatus(valor: UserStatus | null) {
    try {
      useAuth.getState().setUser(await api.updateStatus(valor));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível mudar o status"), "error");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-panel">
      {/* Banner de 106pt com a engrenagem por cima, como na captura. Sem imagem,
          a cor de destaque do perfil; sem ela, a superfície do app. */}
      <div className="relative shrink-0">
        <div
          style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
          className="h-[106px] w-full overflow-hidden bg-hov"
        >
          {perfil?.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={() => ui.openModal({ kind: "settings" })}
          aria-label="Configurações do usuário"
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white"
        >
          <Settings size={22} />
        </button>
        {/* o avatar transborda a borda de baixo do banner, com o anel da
            superfície de trás — é assim na captura */}
        <div className="absolute -bottom-8 left-4">
          <span className="block rounded-full ring-[6px] ring-panel">
            <Avatar user={vivo} size="xl" status={status} surface="ring-panel" />
          </span>
        </div>
      </div>

      <div className="mt-11 px-3 pb-6">
        {/* cartão de identidade */}
        <div className="rounded-2xl bg-chat p-4">
          <h1 className="truncate font-display text-xl font-bold tracking-title text-txt-primary">
            {displayNameOf(vivo)}
          </h1>
          <p className="truncate text-sm text-txt-muted">@{vivo.username}</p>
          {personalizado && (
            <p className="mt-2 break-words text-sm text-txt-normal">{personalizado}</p>
          )}
          <div className="mt-3 flex gap-2">
            <BotaoDeCartao
              icone={<MessageSquare size={18} />}
              rotulo="Editar status"
              onClick={() => ui.openModal({ kind: "customStatus" })}
            />
            <BotaoDeCartao
              icone={<Pencil size={18} />}
              rotulo="Editar perfil"
              onClick={() => ui.openModal({ kind: "settings", tab: "perfil" })}
            />
          </div>
        </div>

        {/* microfone e áudio: os mesmos interruptores do card do desktop, aqui
            em botões largos porque não há hover que explique um ícone de 32px */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium transition ${
              muted ? "bg-red/15 text-red" : "bg-chat text-txt-normal"
            }`}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
            {muted ? "Mudo" : "Microfone"}
          </button>
          <button
            type="button"
            onClick={toggleDeafen}
            aria-pressed={deafened}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium transition ${
              deafened ? "bg-red/15 text-red" : "bg-chat text-txt-normal"
            }`}
          >
            {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
            {deafened ? "Sem áudio" : "Áudio"}
          </button>
        </div>

        <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-txt-muted">
          Status
        </h2>
        <div className="overflow-hidden rounded-2xl bg-chat">
          {STATUS.map((o) => {
            const escolhido = o.valor === null ? status === "ONLINE" : status === o.valor;
            return (
              <button
                key={o.rotulo}
                type="button"
                onClick={() => void aplicarStatus(o.valor)}
                aria-pressed={escolhido}
                className={`flex min-h-[48px] w-full items-center gap-3 px-4 text-left transition active:bg-hov ${
                  escolhido ? "bg-sel text-txt-primary" : "text-txt-normal"
                }`}
              >
                <span className="block h-2.5 w-2.5 shrink-0">
                  <IconeDeStatus status={o.ponto} className="h-full w-full" />
                </span>
                <span className="flex-1 font-medium">{o.rotulo}</span>
                {escolhido && <Check size={18} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>

        {perfil?.aboutMe && (
          <>
            <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-txt-muted">
              Sobre mim
            </h2>
            <p className="whitespace-pre-wrap break-words rounded-2xl bg-chat p-4 text-sm text-txt-normal">
              {perfil.aboutMe}
            </p>
          </>
        )}

        <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-txt-muted">
          Conta
        </h2>
        <div className="overflow-hidden rounded-2xl bg-chat">
          <Linha
            icone={<User size={20} />}
            rotulo="Meu perfil"
            onClick={() => ui.openModal({ kind: "userProfile", userId: user.id })}
          />
          <Linha
            icone={<Users size={20} />}
            rotulo="Trocar de conta"
            onClick={() => ui.openModal({ kind: "gerenciarContas" })}
          />
          <Linha
            icone={<Settings size={20} />}
            rotulo="Configurações"
            detalhe="Perfil, notificações, voz, aparência"
            onClick={() => ui.openModal({ kind: "settings" })}
          />
          <Linha
            icone={<LogOut size={20} />}
            rotulo="Sair"
            perigo
            onClick={async () => {
              const ok = await ui.confirm({
                title: "Sair do Streamz?",
                message: "Você vai precisar entrar de novo neste aparelho.",
                confirmLabel: "Sair",
                danger: true,
              });
              if (ok) logout();
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Botão do cartão de identidade ("Editar status", "Editar perfil"). */
function BotaoDeCartao({
  icone,
  rotulo,
  onClick,
}: {
  icone: ReactNode;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-border-strong/60 px-3 text-sm font-medium text-txt-normal transition active:bg-border-strong"
    >
      <span className="shrink-0 text-txt-secondary" aria-hidden="true">
        {icone}
      </span>
      <span className="truncate">{rotulo}</span>
    </button>
  );
}
