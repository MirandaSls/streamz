"use client";

import { useCallback } from "react";
import { Mic, MicOff, Monitor, RefreshCw, Video, VideoOff, VolumeX, Wifi } from "lucide-react";
import type { AdminCallParticipant } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { Estado, LocalDaChamada, NomeDoUsuario, duracao, usePainel } from "./comuns";

/** Chamada é o dado mais volátil do painel: 5 s é o que faz a lista parecer viva. */
const INTERVALO_MS = 5_000;

/**
 * Todas as chamadas abertas da instância — de canal de voz e de conversa
 * privada na mesma lista, que é como a pergunta é feita ("quem está falando
 * com quem, e onde").
 *
 * O estado de voz não vem do banco: mora na memória da API (ou no Redis, com
 * mais de uma instância) e some quando o socket cai. Por isso esta aba
 * recarrega sozinha em vez de escutar o WebSocket — ver `usePainel`.
 */
export default function AdminChamadasTab() {
  const carregar = useCallback(() => api.adminCalls(), []);
  const { dados, erro, carregando, recarregar } = usePainel(carregar, INTERVALO_MS);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-txt-muted">
          Atualiza sozinho a cada 5 segundos. Sai da lista quem desliga.
        </p>
        <button
          type="button"
          onClick={recarregar}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] px-2 text-sm font-medium text-txt-secondary transition hover:bg-hov hover:text-txt-primary"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <Estado
        erro={erro}
        carregando={carregando && !dados}
        vazio={dados && dados.length === 0 ? "Ninguém está em chamada agora." : undefined}
      >
        <div className="flex flex-col gap-3">
          {dados?.map((chamada) => (
            <section
              key={chamada.local.channelId}
              className="rounded-[6px] border border-border bg-panel"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                <LocalDaChamada local={chamada.local} comAvatares />
                <span className="shrink-0 text-xs text-txt-muted">
                  {chamada.participantes.length} na chamada · {duracao(chamada.desde)}
                </span>
              </header>

              <ul className="px-3 py-1.5">
                {chamada.participantes.map((p) => (
                  <li key={p.user.id} className="flex items-center gap-2.5 py-1.5">
                    <Avatar user={p.user} size="sm" status={p.user.status} surface="border-panel" />
                    <NomeDoUsuario user={p.user} />
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <Sinais p={p} />
                      <span className="w-[92px] text-right text-xs tabular-nums text-txt-muted">
                        {duracao(p.entrouEm)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* participantes da conversa que **não** estão na chamada: é o que
                  diferencia "os dois estão falando" de "um ligou e o outro não
                  atendeu" — e um canal de servidor não tem essa lista */}
              {chamada.local.tipo !== "guild" &&
                chamada.local.participantes.length > chamada.participantes.length && (
                  <p className="border-t border-border px-3 py-2 text-xs text-txt-muted">
                    Fora da chamada:{" "}
                    {chamada.local.participantes
                      .filter((p) => !chamada.participantes.some((q) => q.user.id === p.id))
                      .map((p) => `@${p.username}`)
                      .join(", ")}
                  </p>
                )}
            </section>
          ))}
        </div>
      </Estado>
    </>
  );
}

/** Microfone, fone, câmera e tela — o estado de cada um, com rótulo acessível. */
function Sinais({ p }: { p: AdminCallParticipant }) {
  return (
    <>
      {p.reconnecting && (
        <Sinal icone={<Wifi size={14} />} rotulo="Reconectando" tom="text-yellow" />
      )}
      <Sinal
        icone={p.muted ? <MicOff size={14} /> : <Mic size={14} />}
        rotulo={p.muted ? "Microfone mudo" : "Microfone aberto"}
        tom={p.muted ? "text-red" : "text-txt-faint"}
      />
      {p.deafened && <Sinal icone={<VolumeX size={14} />} rotulo="Surdo" tom="text-red" />}
      <Sinal
        icone={p.video ? <Video size={14} /> : <VideoOff size={14} />}
        rotulo={p.video ? "Câmera ligada" : "Câmera desligada"}
        tom={p.video ? "text-accent" : "text-txt-faint"}
      />
      {p.screen && <Sinal icone={<Monitor size={14} />} rotulo="Compartilhando a tela" tom="text-accent" />}
    </>
  );
}

function Sinal({ icone, rotulo, tom }: { icone: React.ReactNode; rotulo: string; tom: string }) {
  return (
    <span className={tom} title={rotulo}>
      <span className="sr-only">{rotulo}</span>
      <span aria-hidden="true">{icone}</span>
    </span>
  );
}
