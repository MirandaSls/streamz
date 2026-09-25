"use client";

import { useRef, useState } from "react";
import { ChevronRight, HeadphoneOff, MicOff, UserPlus, Video } from "@/components/ui/icones";
import { displayNameOf } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import TagDeBot from "@/components/ui/TagDeBot";
import { AnelDeFala, ENCOLHE_AO_FALAR } from "@/components/voice/pecas-de-voz";
import { abrirMenuDeParticipante } from "@/components/voice/participant-menu";
import { podePararDeAssistir } from "@/components/voice/parar-de-assistir";
import PreviaDeTela, { type AlvoDaPrevia } from "@/components/voice/PreviaDeTela";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { anchorOf, ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { useNomesOcultos } from "@/stores/nomes-ocultos";
import { usePresence, resolveStatus } from "@/stores/presence";

/**
 * Quem está num canal de voz, listado sob ele na barra lateral.
 *
 * É a leitura do `voice.state` do gateway — o mesmo evento que a barra lateral
 * consome. Fica num componente próprio para que a `CanalDeVoz` precise apenas
 * montá-lo: a regra de quem aparece (e com quais ícones) mora aqui, junto do
 * resto da voz.
 *
 * Três detalhes que parecem cosméticos e não são:
 *
 * - O avatar alinha com o **ícone** do canal, não com o texto. É o que faz a
 *   lista ler como "dentro" do canal, e não como uma segunda lista solta.
 * - Mudo é só o ícone de microfone cortado. Esmaecer o nome de quem está mudo
 *   diria "esta pessoa está ausente", que é outra coisa — o esmaecimento fica
 *   reservado a quem está com o áudio desativado (não escuta ninguém) e a
 *   quem está `IDLE` (ausente de verdade) e não fala: falar prova presença.
 * - Transmissão vira pílula "AO VIVO", que é o convite para assistir; um ícone
 *   verde a mais no meio dos outros passa despercebido.
 *
 * O hover de quem transmite abre a **miniatura ao vivo** (`PreviaDeTela`), com
 * a faixa assinada em baixa qualidade só enquanto o pop-up está na tela: é o
 * que deixa decidir se vale entrar sem entrar. Ele não atrapalha o arrasto: o
 * `pointerenter` só abre o cartão de quem está transmitindo, e arrastar a
 * linha o fecha junto com o `dragstart`.
 *
 * Arrastar um participante daqui para outro canal de voz é de quem tem
 * `MOVE_MEMBERS`; quem guarda o estado do arrasto e desenha o realce no canal
 * alvo é a `CanalDeVoz` (por cima, a coluna que a monta), que já faz isso para
 * canais e categorias. Este componente só marca o `li` como arrastável e avisa
 * quem começou e quando acabou — não decide nada.
 */
export default function VoiceChannelMembers({
  channelId,
  guildId,
  podeMover = false,
  onArrastarMembro,
  onFimDoArrasto,
}: {
  channelId: string;
  /** só para o convite; sem ele a linha "Convidar para voz" não aparece. */
  guildId?: string | null;
  /** `MOVE_MEMBERS`: sem ela o participante não é arrastável. */
  podeMover?: boolean;
  onArrastarMembro?: (userId: string) => void;
  onFimDoArrasto?: () => void;
}) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const falando = useVoice((s) => s.falando);
  const estouAqui = useVoice((s) => s.channelId === channelId);
  const meId = useAuth((s) => s.user?.id);
  const assistir = useVoice((s) => s.assistir);
  const assistindo = useVoice((s) => s.assistindo);
  const pararDeAssistir = useVoice((s) => s.pararDeAssistir);
  const canal = useChannels((s) => s.channels.find((c) => c.id === channelId) ?? null);
  const select = useChannels((s) => s.select);
  const nomesOcultos = useNomesOcultos((s) => s.ocultos(channelId));
  const statuses = usePresence((s) => s.statuses);
  const [previa, setPrevia] = useState<AlvoDaPrevia | null>(null);
  // fechar com um respiro: entre a linha e o cartão há 8px de vão, e sem a
  // carência o pop-up piscaria toda vez que o cursor os atravessa
  const adiado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarFechar = () => {
    if (adiado.current) clearTimeout(adiado.current);
    adiado.current = setTimeout(() => setPrevia(null), 140);
  };
  const cancelarFechar = () => {
    if (adiado.current) clearTimeout(adiado.current);
    adiado.current = null;
  };
  if (estados.length === 0) return null;

  return (
    <>
      {/* Linhas de 32 coladas, sem `space-y`: em 101842.png o centro do avatar
          de "Md" (y 409–430) fica a ~31px do centro do ícone de convite
          (y 445–455); com `space-y-0.5` o passo era 34. O print só tem um
          participante: o passo entre dois participantes não foi medido. */}
      <ul aria-label="Na sala de voz" className="mb-1 ml-3 mr-2 mt-0.5">
        {estados.map((e) => {
          const nome = displayNameOf(e.user);
          const status = resolveStatus(statuses, e.user);
          // quem está mudo nunca "fala": o anel tem de contar a mesma história
          const ativo = !e.muted && falando.has(e.user.id);
          // ausente de verdade (IDLE) e sem falar: falar prova presença, e
          // por isso não esmaece quem está com o anel verde
          const ausente = status === "IDLE" && !ativo;
          return (
            <li
              key={e.user.id}
              data-voice-member={e.user.id}
              draggable={podeMover}
              onDragStart={(ev) => {
                // o cartão da prévia é `fixed` e ficaria pendurado no meio da
                // tela enquanto a linha viaja para outro canal
                setPrevia(null);
                // o Firefox só inicia o arrasto se houver algo no dataTransfer
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setData("text/plain", e.user.id);
                onArrastarMembro?.(e.user.id);
              }}
              onDragEnd={() => onFimDoArrasto?.()}
              onPointerEnter={(ev) => {
                if (!e.screen) return;
                cancelarFechar();
                const r = ev.currentTarget.getBoundingClientRect();
                setPrevia({ user: e.user, rect: { top: r.top, bottom: r.bottom, right: r.right } });
              }}
              onPointerLeave={() => e.screen && agendarFechar()}
              className={podeMover ? "cursor-grab active:cursor-grabbing" : undefined}
            >
              <button
                type="button"
                onClick={(ev) => ui.openProfile(e.user, anchorOf(ev.currentTarget))}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  const sou = e.user.id === meId;
                  const podeParar = podePararDeAssistir({
                    tela: e.screen,
                    assistindo: assistindo.has(e.user.id),
                    sou,
                  });
                  abrirMenuDeParticipante(ev.clientX, ev.clientY, e.user, {
                    sou,
                    channelId,
                    tela: podeParar ? { onPararDeAssistir: () => pararDeAssistir(e.user.id) } : undefined,
                  });
                }}
                /*
                  `pl-[38px]`: no Discord tudo que pende do canal é recuado. O
                  avatar do participante começa 26px depois do ícone do canal, e o
                  nome 30px depois do nome do canal. Sem isso o participante fica
                  **à esquerda** do ícone do próprio canal — colado na borda da
                  coluna, que foi a queixa.
                */
                className={`flex h-8 w-full items-center gap-1.5 rounded-[4px] pl-[38px] pr-1 text-left text-sm transition-opacity hover:bg-interactive-background-hover hover:text-text-default ${
                  ausente ? "text-channels-default opacity-60" : "text-channels-default"
                }`}
              >
                {/* 24px (`sm`), medido no print. O anel de "está falando" é o
                    mesmo do palco — mesma cor, mesma espessura, mesmo desenho por
                    dentro do diâmetro —, e por isso vem de `AnelDeFala`. Ele é um
                    irmão por cima do avatar: como `ring-inset` na caixa do
                    próprio avatar, a foto o cobria e o anel nunca aparecia. */}
                <span className="relative inline-grid shrink-0 rounded-full">
                  {/* Sem bolinha de presença aqui: quem está na sala de voz já
                      está online, a bolinha é ruído (como no Discord) — a
                      ausência (IDLE) continua visível pelo esmaecido. */}
                  <Avatar
                    user={e.user}
                    size="sm"
                    surface="border-background-base-lowest"
                    className={`transition-transform ${ativo ? ENCOLHE_AO_FALAR : ""}`}
                  />
                  {ativo && <AnelDeFala />}
                </span>
                {/* menor que o nome do canal, como no Discord: nosso texto era maior que o
                    do canal acima, o que invertia a hierarquia */}
                <span
                  className="min-w-0 flex-1 truncate text-[14px]"
                  title={nomesOcultos ? nome : undefined}
                  aria-label={nomesOcultos ? nome : undefined}
                >
                  {!nomesOcultos && nome}
                </span>
                {/* ── j-bots ── a **sétima** superfície. O §11 do documento lista
                    seis, e o lote C achou esta ao fotografar o tile de voz: um
                    bot de música na sala aparece aqui, na coluna de canais, e
                    era o único lugar com nome de bot sem a pílula.
                    Sem `caixaEstreita`: a linha é `h-8` (31px medidos), e a
                    pílula de 18 do celular cabe com 13px de sobra — ao
                    contrário do rótulo comprimido do palco, que é `h-[20px]`.
                    Vem depois do nome e **antes** dos selos de estado ("Ao
                    vivo", câmera, mudo), pela mesma regra da lista de membros:
                    a pílula é do nome, o selo é do que a pessoa está fazendo. */}
                {e.user.bot && <TagDeBot />}
                {e.screen ? (
                  <span className="shrink-0 rounded-[3px] bg-status-danger px-1 text-[10px] font-bold uppercase leading-4 tracking-[0.02em] text-control-critical-primary-text-default">
                    Ao vivo
                  </span>
                ) : (
                  e.video && <Video size={14} className="shrink-0 text-text-muted" aria-label="Com câmera" />
                )}
                {/* Cinza é o mudo por conta própria: em 101842.png o microfone
                    cortado de "Md" sai #81828a = `channels-default` (coluna
                    x=348, y 412–425). Vermelho (`status-danger`) é o
                    imposto por um moderador (`serverMute`/`serverDeaf`,
                    `useSilencioDoServidor.ts`) — como no Discord, que só
                    pinta de vermelho o mudo/ensurdecido **pelo servidor**. O
                    servidor manda sobre o próprio: quem está com o áudio
                    cortado por um moderador mostra o fone cortado mesmo que
                    também tenha se silenciado sozinho. */}
                {e.serverDeaf ? (
                  <HeadphoneOff
                    size={14}
                    className="shrink-0 text-status-danger"
                    aria-label="Áudio desativado pelo servidor"
                  />
                ) : e.serverMute ? (
                  <MicOff
                    size={14}
                    className="shrink-0 text-status-danger"
                    aria-label="Silenciado pelo servidor"
                  />
                ) : e.deafened ? (
                  <HeadphoneOff size={14} className="shrink-0 text-channels-default" aria-label="Sem áudio" />
                ) : (
                  e.muted && <MicOff size={14} className="shrink-0 text-channels-default" aria-label="Mudo" />
                )}
              </button>
            </li>
          );
        })}

        {/* Só para quem está dentro: de fora, a linha seria um convite para uma
            sala em que você não está, e o caminho de entrar é clicar no canal.
            O chevron é o do print — ele abre a escolha de quem convidar. */}
        {estouAqui && guildId && (
          <li>
            <button
              type="button"
              onClick={() => ui.openModal({ kind: "invite", guildId })}
              className="flex h-8 w-full items-center gap-1.5 rounded-[4px] pl-[38px] pr-1 text-left text-sm text-channels-default transition hover:bg-interactive-background-hover hover:text-text-default"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center">
                <UserPlus size={14} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate">Convidar para voz</span>
              <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>

      {previa && (
        <PreviaDeTela
          alvo={previa}
          onFechar={agendarFechar}
          onManter={cancelarFechar}
          onAssistir={() => {
            // "assistir" pede o palco, não só a entrada: por isso aqui o
            // `select` vai como `"navegacao"` (abre a tela do canal sem
            // entrar) e quem entra é o `connect` logo depois, com o som de
            // entrada normal. É diferente da linha do canal (ver
            // `voice-entrada.ts`), onde o clique pode querer manter o chat
            // aberto e só o segundo clique abre o palco.
            if (!estouAqui && canal) {
              select(canal, "navegacao");
              void useVoice.getState().connect(canal);
            }
            assistir(previa.user.id);
            setPrevia(null);
          }}
        />
      )}
    </>
  );
}
