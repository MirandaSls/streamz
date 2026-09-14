"use client";

import { useRef } from "react";
import { AlertTriangle, MessageSquare, Phone, RotateCw, UserPlus } from "@/components/ui/icones";
import { displayNameOf, isGroupChannel } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import IconesDoCanto from "@/components/voice/IconesDoCanto";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceGrid from "@/components/voice/VoiceGrid";
import { AoVivoIndicador } from "@/components/voice/ScreenShareButton";
import { useTelaCheia } from "@/components/voice/fullscreen";
import { ALVO_MINIMO } from "@/components/voice/palco-mobile";
import { useOcultarInativo } from "@/components/voice/useOcultarInativo";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useEhPaisagem } from "@/hooks/useOrientacao";
import { useDMs } from "@/stores/dms";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * A chamada de uma conversa direta ocupando a área principal, como no Discord:
 * o palco de participantes toma o lugar da timeline e a conversa vira uma
 * coluna que se abre e fecha pelo botão de balão.
 *
 * Ela aparece sempre que **alguém** está na chamada daquele canal, não só
 * quando eu estou: é assim que quem chegou depois descobre que a conversa tem
 * uma call rolando e entra sem ninguém precisar ligar de novo.
 *
 * O que o palco **não** mostra é a duração. No Discord o cronômetro não fica na
 * tela: quanto tempo durou é informação de depois, e aparece na mensagem de
 * sistema quando a chamada termina — na tela, ele só faria a conversa parecer
 * cronometrada.
 */
export default function CallStage({
  channelId,
  titulo,
  chatAberto,
  onToggleChat,
  faixa = false,
}: {
  channelId: string;
  titulo: string;
  chatAberto: boolean;
  onToggleChat: () => void;
  /**
   * O palco está na **faixa** de 199px sobre a conversa (ver `CallSplit`).
   * Aí o título sai: ele fica a 199px do cabeçalho da conversa, que já diz o
   * mesmo nome, e — medido — o rótulo cai em cima do rosto de quem está na
   * chamada. Na print `2026-08-31 103419` a faixa do Discord não tem título
   * nenhum. Com a conversa fechada o palco é a coluna toda e o título volta.
   */
  faixa?: boolean;
}) {
  const estados = useVoice((s) => s.statesOf(channelId));
  const conectadoAqui = useVoice((s) => s.channelId === channelId);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const call = useVoice((s) => s.call);
  const startCall = useVoice((s) => s.startCall);
  const endCall = useVoice((s) => s.endCall);
  const reconnect = useVoice((s) => s.reconnect);
  const conversa = useDMs((s) => s.channels.find((d) => d.id === channelId) ?? null);

  const palco = useRef<HTMLDivElement>(null);
  const { telaCheia, alternar } = useTelaCheia(palco);
  const { visivel, doPalco, daMoldura } = useOcultarInativo();
  const ehMobile = useEhMobile();
  const paisagem = useEhPaisagem();

  /**
   * **No celular o dedo não paira, e o ponteiro não fica "se movendo".**
   *
   * `useOcultarInativo` conta três segundos de mouse parado e apaga a moldura.
   * Num telefone esses três segundos começam a correr assim que a chamada abre:
   * a faixa de cima — que é o único caminho para a conversa da DM e para
   * "adicionar pessoas" num grupo — sumia sozinha, e o toque que a traria de
   * volta **atravessa** para o tile debaixo dela (troca o foco, ou abre a tela
   * cheia). Era um botão que só voltava depois de fazer outra coisa.
   *
   * A regra passa a ser a mesma da cápsula de controles (ver `ControlesMobile`):
   * em pé a moldura fica **sempre**, porque é a única superfície de controle da
   * tela; deitado ela some junto com os controles, que ali a tela é a
   * transmissão e um toque traz tudo de volta.
   */
  const molduraVisivel = ehMobile ? !paisagem || visivel : visivel;

  const chamando = call.phase === "outgoing" && call.channelId === channelId;
  const grupo = conversa ? isGroupChannel(conversa) : false;
  const destinatario = conversa && !grupo ? conversa.others[0] : null;

  if (estados.length === 0 && !chamando) return null;

  const subtitulo = chamando
    ? "Chamando…"
    : estados.length === 1
      ? "1 pessoa na chamada"
      : `${estados.length} pessoas na chamada`;

  return (
    <section
      ref={palco}
      {...doPalco}
      data-call-stage={channelId}
      aria-label={`Chamada em ${titulo}`}
      // a tela cheia é a do navegador (ver `fullscreen.ts`): o elemento é promovido
      // pelo compositor, então não há classe de posicionamento a aplicar aqui.
      // Fundo preto puro, que é o token `--black` do Discord (não o preto do
      // Tailwind): prints 1:1 `2026-08-31 160106` (pixels 600,250 e 1200,150) e
      // `101857` (1000,100 e todo o vão entre tiles) dão `#000000`.
      className="relative flex min-w-0 flex-1 flex-col bg-black"
    >
      {erro && conectadoAqui && status === "error" && (
        <div
          role="alert"
          className="z-20 flex shrink-0 items-center gap-2 bg-status-danger px-4 py-2 text-sm font-medium text-control-critical-primary-text-default"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{erro}</span>
          <Button
            variante="secundario"
            tamanho="xs"
            icone={<RotateCw size={12} aria-hidden="true" />}
            onClick={() => void reconnect()}
            className="shrink-0"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <div
        {...daMoldura}
        className={`absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-4 py-3 transition-opacity duration-200 ${
          molduraVisivel ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Slots laterais iguais (`flex-1 basis-0`) em vez de 96px fixos: é o
            que mantém o título de fato centralizado — os dois lados dividem a
            sobra — sem espremer o selo "ao vivo", que precisa de ~230px e não
            cabia nos 96. */}
        <span className="flex min-w-0 flex-1 basis-0 items-start">
          <AoVivoIndicador />
        </span>

        {/* título centralizado: o palco é simétrico, e o nome no canto puxaria a
            atenção para fora das pessoas. Na faixa ele não existe — ver `faixa`. */}
        {!faixa && (
          <span className="flex min-w-0 flex-col items-center text-center">
            <span className="max-w-full truncate text-sm font-semibold text-text-strong">
              {titulo}
            </span>
            <span className="text-xs text-text-muted">{subtitulo}</span>
          </span>
        )}

        <span className="flex min-w-0 flex-1 basis-0 justify-end gap-1">
          {grupo && (
            <BotaoDeIcone
              rotulo="Adicionar pessoas"
              icone={<UserPlus size={20} />}
              onClick={() => ui.openModal({ kind: "addGroupMembers", channelId })}
              tamanho="md"
              // 44 no celular (piso de toque do HIG/Material, `ALVO_MINIMO`), 32
              // (o tamanho `md` do primitivo) no desktop — só o `style` muda o
              // alvo sem tocar o raio/cor que o primitivo já resolve
              style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
            />
          )}
          <BotaoDeIcone
            rotulo={chatAberto ? "Ocultar conversa" : "Mostrar conversa"}
            ativo={chatAberto}
            icone={<MessageSquare size={20} />}
            onClick={onToggleChat}
            tamanho="md"
            style={ehMobile ? { height: ALVO_MINIMO, width: ALVO_MINIMO } : undefined}
          />
        </span>
      </div>

      {/* Sem `pt-14`: o cabeçalho é flutuante (`absolute`) e se esconde sozinho
          quando o mouse para — reservar altura para ele custava 56px da
          transmissão para proteger uma faixa que nem sempre está na tela. O
          `pb-24` fica: os controles também flutuam, mas embaixo mora a tira de
          miniaturas, que precisa continuar clicável. */}
      <div
        className={
          // ver o mesmo trecho em `VoicePanel`: no celular as folgas são do
          // `PalcoMobile`, porque a de baixo depende da orientação
          ehMobile
            ? "min-h-0 flex-1"
            : // `px-2` = `FOLGA_DO_PALCO` (8px, print 101857 x=1911–1918)
              "min-h-0 flex-1 px-2 pb-24"
        }
      >
        {chamando ? (
          <Chamando nome={destinatario ? displayNameOf(destinatario) : titulo} usuario={destinatario} />
        ) : conectadoAqui ? (
          /* Sem tela de espera: a grade é desenhada a partir do estado de voz
             do servidor, que já está aqui, e o `connecting` só quer dizer que a
             mídia ainda está subindo. Trocá-la por um spinner escondia a
             chamada pelo tempo do `getUserMedia` + `publishTrack` — p90 de 3,5s
             medido em produção. Quem conta que a mídia ainda vem é a barra
             "Conectando…" do rodapé. */
          <VoiceGrid
            channelId={channelId}
            nomeDoCanal={titulo}
            // só grupo aceita mais gente: numa conversa de duas pessoas o "+"
            // teria de criar um grupo novo, que é outra decisão e outra tela
            onAdicionar={
              grupo ? () => ui.openModal({ kind: "addGroupMembers", channelId }) : undefined
            }
          />
        ) : (
          <ConviteParaEntrar estados={estados} onEntrar={() => void startCall(channelId, false)} />
        )}
      </div>

      {(conectadoAqui || chamando) && (
        <>
          <VoiceControls
            oculto={!visivel}
            moldura={daMoldura}
            leaveLabel={chamando ? "Cancelar chamada" : "Desligar"}
            onLeave={() => void endCall()}
          />
          {/* fora do celular: a tela cheia do palco inteiro não é o gesto do
              telefone — lá se toca no tile (ver `PalcoMobile`) */}
          {!ehMobile && (
            <IconesDoCanto
              telaCheia={telaCheia}
              onTelaCheia={alternar}
              visivel={visivel}
              moldura={daMoldura}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * Chamada saindo: quem está sendo chamado, grande, com o anel pulsando.
 *
 * O anel é o que dá tempo ao tempo — sem ele "Chamando…" em texto parece uma
 * tela travada, e o impulso é clicar de novo.
 */
function Chamando({
  nome,
  usuario,
}: {
  nome: string;
  usuario: { id: string; username: string; avatarUrl?: string | null } | null;
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <span className="relative grid place-items-center">
          <span
            aria-hidden="true"
            className="absolute h-[132px] w-[132px] animate-ping rounded-full bg-status-positive/20"
          />
          {usuario ? (
            // `border-background-base-lowest` (#121214) é a superfície mais
            // escura que o `Avatar` sabe recortar; o palco é `--black` — ver "faltando"
            <Avatar user={usuario} size="xxl" surface="border-background-base-lowest" />
          ) : (
            <span className="grid h-[120px] w-[120px] place-items-center rounded-full bg-background-base-lowest">
              <Phone size={44} className="text-text-muted" aria-hidden="true" />
            </span>
          )}
        </span>
        <p className="text-xl font-bold text-text-strong">{nome}</p>
        <p className="text-sm text-text-muted">Chamando…</p>
      </div>
    </div>
  );
}

/**
 * Estado "a chamada existe e eu não estou nela".
 *
 * É cartão central, e não pílula no rodapé: entrar numa conversa que já começou
 * é a ação principal da tela, e o rodapé é onde moram as ações de quem já está
 * dentro.
 */
function ConviteParaEntrar({
  estados,
  onEntrar,
}: {
  estados: { user: { id: string; username: string; avatarUrl?: string | null } }[];
  onEntrar: () => void;
}) {
  const nomes = estados.map((e) => e.user.username);
  const texto =
    nomes.length === 1
      ? `${nomes[0]} está na chamada`
      : nomes.length === 2
        ? `${nomes[0]} e ${nomes[1]} estão na chamada`
        : `${nomes[0]} e mais ${nomes.length - 1} estão na chamada`;

  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex items-center justify-center -space-x-4">
          {estados.slice(0, 3).map((e) => (
            // o anel é a cor do palco (`--black`), que é o que "recorta" um avatar do outro
            <Avatar key={e.user.id} user={e.user} size="xl" surface="border-background-base-lowest" className="rounded-full ring-4 ring-black" />
          ))}
        </div>
        <p className="text-lg font-bold text-text-strong">{texto}</p>
        <Button
          variante="positivo"
          tamanho="md"
          icone={<Phone size={18} aria-hidden="true" />}
          onClick={onEntrar}
        >
          Entrar na chamada
        </Button>
      </div>
    </div>
  );
}
