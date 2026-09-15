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
import { Button } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useAuth } from "@/stores/auth";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";
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
 * Aba **Início**: a rail à esquerda e, à direita, **ou** a lista de canais do
 * servidor escolhido **ou** a lista de conversas — a rail fica à vista nos dois
 * casos.
 *
 * É a estrutura das capturas `discord-mobile-servidor-2024.png` e
 * `discord-mobile-dms-2024.png`: a mesma tela, a mesma rail, e o que muda é a
 * coluna. Quem troca é a bolha de conversas no topo da rail (que põe o `view`
 * em `"dm"`) e o ícone de um servidor (que o põe em `"guild"`) — os mesmos
 * caminhos do desktop, sem estado novo.
 *
 * Por isso não existe aba "Mensagens": no Discord do celular as conversas não
 * são uma seção do rodapé, são um item da rail.
 */
export function TelaInicio() {
  const view = useUI((s) => s.view);
  return (
    <div className="flex h-full min-h-0">
      <GuildRail compacto />
      <div className={`flex min-w-0 flex-1 flex-col ${COLUNA_INTEIRA}`}>
        {view === "dm" ? <DMList /> : <ChannelSidebar />}
      </div>
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
      className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left transition active:bg-interactive-background-hover ${
        perigo ? "text-status-danger" : "text-text-default"
      }`}
    >
      <span className="shrink-0 text-text-subtle" aria-hidden="true">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rotulo}</span>
        {detalhe && <span className="block truncate text-xs text-text-muted">{detalhe}</span>}
      </span>
      {!perigo && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-channels-default" />}
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background-base-lowest">
      {/* Banner de 106pt com a engrenagem por cima, como na captura. Sem imagem,
          a cor de destaque do perfil; sem ela, a superfície do app. */}
      <div className="relative shrink-0">
        <div
          style={perfil?.bannerColor ? { backgroundColor: perfil.bannerColor } : undefined}
          className="h-[106px] w-full overflow-hidden bg-interactive-background-hover"
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
          // fica sobre o banner/imagem: o par bg/texto de "overlay secundário"
          // (fundo escuro translúcido + ícone claro) é o token pensado para
          // isso — diferente do `BotaoDeIcone`, aqui o fundo é permanente, não
          // só no hover, e o primitivo não cobre esse caso
          className="absolute right-3 top-3 grid h-[44px] w-[44px] place-items-center rounded-full bg-control-overlay-secondary-background-default text-control-overlay-secondary-icon-default"
        >
          <Settings size={22} />
        </button>
        {/* o avatar transborda a borda de baixo do banner, com o anel da
            superfície de trás — é assim na captura.

            Medido em `discord-mobile-voce.png` (375×812, 1px=1pt — escala
            §1 do MEDIDAS.md): o topo do anel (onde o verde do banner é
            interrompido) fica em `y=110` nas colunas `x=60..63`, que é onde
            o círculo é mais largo (centro horizontal ≈61,5, condizente com
            a borda esquerda/direita do avatar em `x=22..101`, 80px = a
            mesma medida do nosso `size="xl"`). O avatar (sem o anel, que é
            `box-shadow` e não desloca a caixa) some do verde em `y=116`
            (110+6 do anel) e volta ao fundo da página em `y=196`
            (116+80) — avatar-caixa 80px alto, e o fundo do banner some em
            `y=149` (medido limpo em `x=10`, longe do avatar).
            `-bottom` é a distância da base da CAIXA do avatar (sem anel) até
            a base do banner: 196 (base da caixa) − 149 (base do banner) =
            **47px**, não os 32 (`-bottom-8`) de antes — o avatar ficava alto
            demais, mordendo o banner em vez de pender sobre o conteúdo.
            `left`: a caixa (sem anel) começa em `x=22`, não em `x=16`
            (`left-4`). */}
        <div className="absolute -bottom-[47px] left-[22px]">
          <span className="block rounded-full ring-[6px] ring-background-base-lowest">
            <Avatar user={vivo} size="xl" status={status} surface="ring-background-base-lowest" />
          </span>
        </div>
      </div>

      {/* Distância medida direto na captura, longe do avatar (`x=150..345`,
          fora da sombra dele): o fundo da página (`#f2f3f5`) some e o
          cartão branco (`#ffffff`) começa em `y=212`, sempre — contra o fim
          do banner em `y=149` (medido limpo em `x=10`). 212−149 = **63px**,
          não os 44 (`mt-11`) de antes, que datavam de quando o avatar
          transbordava menos. */}
      {/* `px-4` (16px), não `px-3` (12px): na captura a margem lateral do
          cartão branco é 16px dos dois lados (`x=16..358` numa tela de
          375, longe do avatar) — e 16 é também a borda de fora do anel do
          avatar (22 do box − 6 do anel), ou seja o cartão se alinha com a
          borda externa do anel, não com a caixa do avatar. */}
      <div className="mt-[63px] px-4 pb-6">
        {/* cartão de identidade */}
        <div className="rounded-2xl bg-background-base-lower p-4">
          <h1 className="truncate text-xl font-bold text-text-strong">
            {displayNameOf(vivo)}
          </h1>
          <p className="truncate text-sm text-text-muted">@{vivo.username}</p>
          {personalizado && (
            <p className="mt-2 break-words text-sm text-text-default">{personalizado}</p>
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
          <Button
            variante={muted ? "critico-secundario" : "secundario"}
            tamanho="md"
            icone={muted ? <MicOff size={20} /> : <Mic size={20} />}
            onClick={toggleMute}
            aria-pressed={muted}
            className="h-[44px] flex-1 rounded-2xl"
          >
            {muted ? "Mudo" : "Microfone"}
          </Button>
          <Button
            variante={deafened ? "critico-secundario" : "secundario"}
            tamanho="md"
            icone={deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
            onClick={toggleDeafen}
            aria-pressed={deafened}
            className="h-[44px] flex-1 rounded-2xl"
          >
            {deafened ? "Sem áudio" : "Áudio"}
          </Button>
        </div>

        <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Status
        </h2>
        <div className="overflow-hidden rounded-2xl bg-background-base-lower">
          {STATUS.map((o) => {
            const escolhido = o.valor === null ? status === "ONLINE" : status === o.valor;
            return (
              <button
                key={o.rotulo}
                type="button"
                onClick={() => void aplicarStatus(o.valor)}
                aria-pressed={escolhido}
                className={`flex min-h-[48px] w-full items-center gap-3 px-4 text-left transition active:bg-interactive-background-hover ${
                  escolhido ? "bg-interactive-background-selected text-text-strong" : "text-text-default"
                }`}
              >
                <span className="block h-2.5 w-2.5 shrink-0">
                  <IconeDeStatus status={o.ponto} className="h-full w-full" />
                </span>
                <span className="flex-1 font-medium">{o.rotulo}</span>
                {escolhido && <Check size={18} className="shrink-0 text-brand-500" />}
              </button>
            );
          })}
        </div>

        {perfil?.aboutMe && (
          <>
            <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Sobre mim
            </h2>
            <p className="whitespace-pre-wrap break-words rounded-2xl bg-background-base-lower p-4 text-sm text-text-default">
              {perfil.aboutMe}
            </p>
          </>
        )}

        <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Conta
        </h2>
        <div className="overflow-hidden rounded-2xl bg-background-base-lower">
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
    <Button
      variante="secundario"
      tamanho="md"
      icone={icone}
      onClick={onClick}
      // 44 literal, não `md` puro (40px): a raiz do app é 16px agora, então
      // `md` já bate com o nominal, mas estes são os dois primeiros botões da
      // aba "Você" e o alvo de toque pedido é 44
      className="h-[44px] min-w-0 flex-1"
    >
      <span className="truncate">{rotulo}</span>
    </Button>
  );
}
