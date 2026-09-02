"use client";

import { create } from "zustand";
import {
  VAZIO,
  atual,
  avancar as avancarNaPilha,
  mesmoLugar,
  podeAvancar,
  podeVoltar,
  registrar,
  voltar as voltarNaPilha,
  type Historico,
  type Lugar,
} from "@/stores/historico-core";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { goToChannel } from "@/stores/messages-navigate";
import { ui, useUI } from "@/stores/ui";

/**
 * Histórico de navegação do app — as setas ← → da barra de título do desktop.
 *
 * O app é uma página só: "onde estou" não mora na URL, mora em quatro stores
 * (modo, servidor, canal, conversa). Este módulo **observa** essas stores e
 * anota cada lugar novo numa pilha (`historico-core`); voltar e avançar
 * reabrem o lugar pelos mesmos caminhos que o clique usaria — `goToChannel`
 * para canais e conversas, a página Amigos como a home do modo DM.
 *
 * Nada aqui roda sozinho: `observar()` é chamado por quem tem as setas (a
 * barra de título), então no navegador o custo é zero.
 */

interface HistoricoState extends Historico {
  podeVoltar: boolean;
  podeAvancar: boolean;
  voltar: () => Promise<void>;
  avancar: () => Promise<void>;
}

/** Enquanto uma navegação nossa está em curso, o que as stores emitem é eco. */
let navegando = false;

/** O lugar em que o app está agora, lido das stores; `null` entre telas. */
export function lugarAtual(): Lugar | null {
  const { view } = useUI.getState();
  if (view === "dm") {
    if (useFriends.getState().open) return { tipo: "amigos" };
    const dm = useDMs.getState().activeId;
    return dm ? { tipo: "conversa", channelId: dm } : { tipo: "amigos" };
  }
  const guildId = useGuilds.getState().activeGuildId;
  if (!guildId) return null;
  const canais = useChannels.getState();
  // o canal só conta quando é deste servidor: durante a troca a store ainda
  // guarda o canal do anterior
  const channelId = canais.guildId === guildId ? canais.activeChannelId : null;
  return { tipo: "servidor", guildId, channelId };
}

/** Reabre um lugar pelos caminhos normais do app. */
async function irPara(lugar: Lugar): Promise<void> {
  if (lugar.tipo === "amigos") {
    ui.setView("dm");
    useChannels.getState().leaveVoice();
    useFriends.getState().setOpen(true);
    return;
  }
  if (lugar.tipo === "conversa") {
    await goToChannel({ guildId: null, channelId: lugar.channelId });
    return;
  }
  if (lugar.channelId) {
    await goToChannel({ guildId: lugar.guildId, channelId: lugar.channelId });
    return;
  }
  const guilds = useGuilds.getState();
  const guild = guilds.guilds.find((g) => g.id === lugar.guildId);
  if (guild) guilds.select(guild);
}

function aplicar(h: Historico) {
  useHistorico.setState({ ...h, podeVoltar: podeVoltar(h), podeAvancar: podeAvancar(h) });
}

async function navegar(passo: (h: Historico) => Historico): Promise<void> {
  const antes = useHistorico.getState();
  const depois = passo(antes);
  if (depois === antes) return;
  const destino = atual(depois);
  if (!destino) return;
  navegando = true;
  try {
    aplicar(depois);
    await irPara(destino);
  } finally {
    navegando = false;
  }
  // se o lugar não existe mais (canal apagado, conversa fechada), o app ficou
  // em outro; anotá-lo mantém a pilha honesta
  const real = lugarAtual();
  if (real && !mesmoLugar(real, destino)) aplicar(registrar(useHistorico.getState(), real));
}

export const useHistorico = create<HistoricoState>(() => ({
  ...VAZIO,
  podeVoltar: false,
  podeAvancar: false,
  voltar: () => navegar(voltarNaPilha),
  avancar: () => navegar(avancarNaPilha),
}));

/**
 * Passa a anotar os lugares visitados. Devolve a função que para de observar.
 * Idempotente: a segunda chamada enquanto a primeira vale é um no-op.
 */
let observadores = 0;
export function observar(): () => void {
  observadores++;
  if (observadores > 1) return () => void observadores--;

  const anotar = () => {
    if (navegando) return;
    const lugar = lugarAtual();
    if (!lugar) return;
    const h = useHistorico.getState();
    const proximo = registrar(h, lugar);
    if (proximo !== h) aplicar(proximo);
  };
  anotar();
  const cancelar = [useUI, useDMs, useFriends, useGuilds, useChannels].map((store) =>
    store.subscribe(anotar),
  );
  return () => {
    observadores--;
    if (observadores === 0) for (const c of cancelar) c();
  };
}
