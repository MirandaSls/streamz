"use client";

import { useRef, useState } from "react";
import { AudioLines, PhoneOff, RotateCw, Signal, SignalZero, Video, VideoOff } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import PopoverDeRuido from "@/components/voice/PopoverDeRuido";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { rotuloDoPing, useVoicePing, type QualidadeDeVoz } from "@/stores/voice-ping";

/**
 * Barra "Voz conectada" — mora acima do painel do usuário, no rodapé da coluna
 * 2, como no Discord.
 *
 * Ela existe para o caso em que a call **não está na tela**: o usuário entrou
 * num canal de voz e foi ler outro canal de texto. Sem essa barra não haveria
 * como voltar para a call, nem lembrar que ela existe.
 *
 * São duas linhas, e a divisão é deliberada: a de cima responde "onde eu estou
 * e como saio"; a de baixo é a fileira de ações largas, que precisam de alvo
 * grande porque são usadas no meio de uma conversa, sem olhar.
 *
 * A **supressão de ruído** mora na linha de cima, colada no desligar, e não na
 * barra do palco: é a posição do Discord, e a razão é a mesma que justifica
 * este painel existir — quem entrou num canal de voz e foi ler outro canal não
 * tem o palco na tela, e é justamente aí que se percebe que o microfone está
 * captando o ventilador. O ícone **abre uma caixa** (ver `PopoverDeRuido`), não
 * alterna direto: quem clica ali está em dúvida, e a dúvida se responde falando
 * e vendo a barra mexer.
 *
 * A fileira de baixo é só ícone, sem rótulo. Dois botões com texto ("Vídeo",
 * "Tela") pareciam mais claros e são menos: o rótulo empurra o alvo clicável
 * para menos da metade da largura e obriga a abreviar quando a coluna encolhe.
 *
 * O ícone de sinal responde ao **ping** (`useVoicePing`, medido a cada 2 s):
 * tooltip "Ping: N ms" no hover e a cor pela qualidade, como no Discord —
 * verde (o da barra), amarelo e vermelho são os tokens que já existem.
 */

/** Cor do selo do sinal pela qualidade; sem medida, o verde de "conectado". */
const COR_DO_SINAL: Record<QualidadeDeVoz, string> = {
  excelente: "bg-green/15 text-green",
  boa: "bg-yellow/15 text-yellow",
  ruim: "bg-red/15 text-red",
};
export default function VoiceConnectedBar() {
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const camOn = useVoice((s) => s.camOn);
  const ruidoAvancado = useVoice((s) => s.audio.processamento.ruido === "avancada");
  const toggleCam = useVoice((s) => s.toggleCam);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const conversas = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  // store própria: a medição de 2 em 2 s não passa pelo `tick` da grade
  const pingMs = useVoicePing((s) => s.pingMs);
  const qualidade = useVoicePing((s) => s.qualidade);

  const [ruidoAberto, setRuidoAberto] = useState(false);
  // o botão, não a caixa: quem posiciona e fecha é o `PopoverFlutuante`
  const botaoDoRuido = useRef<HTMLButtonElement>(null);

  if (!channelId) return null;

  const conversa = conversas.find((d) => d.id === channelId);
  const titulo = guildId ? nomeDoCanal || "voz" : conversa ? dmTitle(conversa) : "Chamada";
  const servidor = guildId ? guilds.find((g) => g.id === guildId)?.name ?? null : null;
  const falhou = status === "error";

  /** Volta para o canal da call — o caminho de "onde isso está acontecendo?". */
  function irParaCall() {
    if (guildId) {
      const guild = guilds.find((g) => g.id === guildId);
      const canal = useChannels.getState().channels.find((c) => c.id === channelId);
      ui.setView("guild");
      if (guild) useGuilds.getState().select(guild);
      if (canal) useChannels.getState().select(canal);
      return;
    }
    ui.setView("dm");
    if (conversa) useDMs.getState().select(conversa);
  }

  return (
    <div className="pointer-events-auto flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-footer px-3.5 pb-3 pt-3" data-voice-bar>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span
            className={`flex items-center gap-1 text-sm font-semibold ${
              falhou ? "text-red" : status === "connecting" ? "text-txt-muted" : "text-green"
            }`}
          >
            {/* selo de 32px em volta do sinal, como no Discord: sem ele o
                estado "conectado" é só um texto verde, e o bloco perde a âncora
                visual que diz onde a call mora */}
            <Tooltip label={falhou ? "Sem conexão" : rotuloDoPing(pingMs)}>
              <span
                aria-label={falhou ? "Sem conexão" : rotuloDoPing(pingMs)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  falhou
                    ? "bg-red/15"
                    : status === "connecting"
                      ? "bg-hov"
                      : COR_DO_SINAL[qualidade ?? "excelente"]
                }`}
              >
                {falhou ? (
                  <SignalZero size={18} aria-hidden="true" />
                ) : (
                  <Signal size={18} aria-hidden="true" />
                )}
              </span>
            </Tooltip>
            {/* o texto precisa do próprio span: `truncate` num container flex
                corta sem reticências */}
            <span className="truncate">
              {falhou ? "Erro de voz" : status === "connecting" ? "Conectando…" : "Voz conectada"}
            </span>
          </span>
          <button
            type="button"
            onClick={irParaCall}
            className="block max-w-full truncate text-left text-xs text-txt-muted hover:underline"
          >
            {titulo}
            {servidor && <span className="text-txt-faint"> / {servidor}</span>}
          </button>
        </span>

        <Tooltip label="Supressão de ruído">
          <button
            ref={botaoDoRuido}
            type="button"
            onClick={() => setRuidoAberto((v) => !v)}
            aria-expanded={ruidoAberto}
            aria-label="Supressão de ruído"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-[4px] transition hover:bg-hov ${
              ruidoAvancado ? "text-accent" : "text-txt-secondary hover:text-txt-primary"
            }`}
          >
            <AudioLines size={20} />
          </button>
        </Tooltip>

        <PopoverFlutuante
          ancora={botaoDoRuido}
          aberto={ruidoAberto}
          onFechar={() => setRuidoAberto(false)}
          rotulo="Supressão de ruído"
        >
          <PopoverDeRuido />
        </PopoverFlutuante>

        {/* sem botão de chat aqui: o nome do canal logo acima já leva à call, e
            o chat do canal de voz tem o próprio alternador no cabeçalho dele */}
        <Tooltip label="Desconectar">
          <button
            type="button"
            onClick={() => void disconnect()}
            aria-label="Desconectar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] text-txt-secondary transition hover:bg-hov hover:text-red"
          >
            <PhoneOff size={20} />
          </button>
        </Tooltip>
      </div>

      {falhou && (
        // erro real (a queda da mídia), não "não configurado": só aqui faz
        // sentido gastar vermelho e oferecer a repetição
        <div className="flex items-center gap-2 rounded-[4px] bg-red/15 px-2 py-1.5 text-xs text-red">
          <span className="min-w-0 flex-1 truncate">{erro}</span>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="flex shrink-0 items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw size={12} aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      )}

      {/* vão de 10px entre os botões, como no Discord — tínhamos 4, e com o raio
          de 8 eles quase se encostavam */}
      <div className="flex items-stretch gap-2.5">
        <Tooltip label={camOn ? "Desligar câmera" : "Ligar câmera"} className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void toggleCam()}
            aria-pressed={camOn}
            aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
            className={`grid h-8 w-full place-items-center rounded-lg transition ${
              camOn
                ? "bg-border-strong-hover text-txt-primary"
                : "bg-border-strong/60 text-txt-secondary hover:bg-border-strong hover:text-txt-primary"
            }`}
          >
            {camOn ? <Video size={20} /> : <VideoOff size={18} />}
          </button>
        </Tooltip>
        <ScreenShareButton variante="largo" />
      </div>
    </div>
  );
}
