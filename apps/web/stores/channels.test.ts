import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "@streamz/shared";

/**
 * `loadForGuild` em dois papéis: **carga nova** (trocar de servidor) abre o
 * primeiro canal de texto, como sempre; **recarga** do servidor já aberto (o
 * `useRealtime` refazendo a lista depois de `member.updated` ou de um override)
 * não pode mexer no que está na tela. Era a recarga que derrubava o palco de
 * quem estava na call: zerava o `voiceChannelId` e trocava a coluna 3 pelo
 * chat de texto.
 */

const api = vi.hoisted(() => ({
  getGuild: vi.fn(async (_guildId: string): Promise<{ channels: Channel[] }> => ({ channels: [] })),
}));
vi.mock("@/lib/api", () => ({ api }));

const mensagens = vi.hoisted(() => ({ open: vi.fn(async () => {}), closeChannel: vi.fn() }));
vi.mock("@/stores/messages", () => ({ useMessages: { getState: () => mensagens } }));

vi.mock("@/stores/categories", () => ({
  useCategories: { getState: () => ({ loadForGuild: vi.fn(async () => {}), clear: vi.fn() }) },
}));

// a store de voz só é lida para decidir se o `select` entra na call; o
// `channelId` é mutável entre os testes de `select` que simulam já estar
// conectado num canal (os de `loadForGuild` não mexem nele — ninguém conecta)
const conectar = vi.hoisted(() => vi.fn(async () => {}));
const vozState = vi.hoisted(() => ({ channelId: null as string | null, connect: conectar }));
vi.mock("@/stores/voice", () => ({
  useVoice: { getState: () => vozState },
}));

vi.mock("@/stores/socket-adapter", () => ({
  leaveChannel: vi.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock("@/stores/ui", () => ({ ui: { toast: vi.fn(), esquecerChatDaCall: vi.fn() } }));

// leiaute: os testes de `select` cobrem o desktop por padrão (mock `false`);
// o caso mobile troca isto para `true` e restaura no fim do próprio `it`.
const ehMobile = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/hooks/useEhMobile", () => ({ ehMobileAgora: ehMobile }));

import { useChannels } from "./channels";

function canal(id: string, type: Channel["type"] = "TEXT"): Channel {
  return {
    id,
    guildId: "g1",
    name: id,
    type,
    position: 0,
    private: false,
    readOnly: false,
    syncedWithCategory: false,
    lastMessageAt: null,
    lastReadAt: null,
    mentionCount: 0,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
  } as Channel;
}

const geral = canal("geral");
const avisos = canal("avisos");
const sala = canal("sala", "VOICE");
const outraSala = canal("outraSala", "VOICE");

beforeEach(() => {
  vi.clearAllMocks();
  vozState.channelId = null;
  // `clearAllMocks` não desfaz a implementação de `mockReturnValue`: sem isto,
  // um teste que ligasse o mobile vazaria `true` para os testes seguintes.
  ehMobile.mockReturnValue(false);
  useChannels.setState({
    guildId: null,
    channels: [],
    activeChannelId: null,
    voiceChannelId: null,
    loading: false,
  });
});

describe("loadForGuild", () => {
  it("carga de outro servidor abre o primeiro canal de texto e solta o canal de voz", async () => {
    // estava no canal de voz de g0; trocar de servidor é navegação
    useChannels.setState({
      guildId: "g0",
      channels: [canal("velho", "VOICE")],
      activeChannelId: "velho",
      voiceChannelId: "velho",
    });
    api.getGuild.mockResolvedValueOnce({ channels: [sala, geral, avisos] });

    await useChannels.getState().loadForGuild("g1");

    const s = useChannels.getState();
    expect(s.guildId).toBe("g1");
    expect(s.activeChannelId).toBe("geral");
    expect(s.voiceChannelId).toBeNull();
    expect(mensagens.open).toHaveBeenCalledWith("geral");
  });

  it("recarga do mesmo servidor mantém o canal de voz aberto: o palco não cai", async () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "sala",
      voiceChannelId: "sala",
    });
    // o cargo novo trouxe um canal a mais; a sala continua lá
    api.getGuild.mockResolvedValueOnce({ channels: [geral, avisos, sala] });

    const carga = useChannels.getState().loadForGuild("g1");
    // durante o fetch a lista antiga continua na tela: esvaziá-la desmontaria
    // o `VoicePanel` (o `useVoiceChannel` viraria null)
    expect(useChannels.getState().channels).toHaveLength(2);
    expect(useChannels.getState().voiceChannelId).toBe("sala");
    await carga;

    const s = useChannels.getState();
    expect(s.channels).toHaveLength(3);
    expect(s.activeChannelId).toBe("sala");
    expect(s.voiceChannelId).toBe("sala");
    // nada de `select`: a conversa aberta não é reaberta, e ninguém entra na call
    expect(mensagens.open).not.toHaveBeenCalled();
    expect(conectar).not.toHaveBeenCalled();
  });

  it("recarga que tirou o acesso ao canal aberto cai no primeiro canal de texto", async () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "sala",
      voiceChannelId: "sala",
    });
    // perdi VIEW_CHANNEL na sala
    api.getGuild.mockResolvedValueOnce({ channels: [geral, avisos] });

    await useChannels.getState().loadForGuild("g1");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBe("geral");
    expect(s.voiceChannelId).toBeNull();
    expect(mensagens.open).toHaveBeenCalledWith("geral");
  });

  it("recarga sem canal de texto sobrando e sem o canal aberto esvazia a coluna", async () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "geral",
      voiceChannelId: null,
    });
    api.getGuild.mockResolvedValueOnce({ channels: [sala] });

    await useChannels.getState().loadForGuild("g1");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBeNull();
    expect(s.voiceChannelId).toBeNull();
    expect(mensagens.closeChannel).toHaveBeenCalled();
  });

  it("recarga mantém o canal de texto aberto quando ele continua na lista", async () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, avisos],
      activeChannelId: "avisos",
      voiceChannelId: null,
    });
    api.getGuild.mockResolvedValueOnce({ channels: [geral, avisos, sala] });

    await useChannels.getState().loadForGuild("g1");

    // antes voltava sempre para o primeiro de texto (`geral`)
    expect(useChannels.getState().activeChannelId).toBe("avisos");
    expect(mensagens.open).not.toHaveBeenCalled();
  });
});

/**
 * Regra nova: clicar num canal de voz entra na chamada, mas se a coluna 3
 * estiver mostrando um chat de texto, a tela não troca — a pessoa entra na
 * call e continua lendo. O palco só assume a tela no segundo clique (já
 * conectada ali). A tabela completa é `deveTrocarATela` (`voice-entrada.ts`);
 * aqui só se confere que `select` lê e obedece.
 */
describe("select", () => {
  it("clique no canal de voz com chat de texto na tela entra na chamada mas não troca a tela", () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "geral",
      voiceChannelId: null,
    });

    useChannels.getState().select(sala, "clique");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBe("geral");
    expect(s.voiceChannelId).toBeNull();
    expect(mensagens.open).not.toHaveBeenCalled();
    expect(conectar).toHaveBeenCalledWith(sala, undefined);
  });

  it("segundo clique no canal já conectado abre o palco sem reconectar", () => {
    vozState.channelId = "sala";
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "geral",
      voiceChannelId: null,
    });

    useChannels.getState().select(sala, "clique");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBe("sala");
    expect(s.voiceChannelId).toBe("sala");
    expect(conectar).not.toHaveBeenCalled();
  });

  it("sem chat de texto na tela (voz em outro canal) troca a tela e conecta", () => {
    useChannels.setState({
      guildId: "g1",
      channels: [outraSala, sala],
      activeChannelId: "outraSala",
      voiceChannelId: "outraSala",
    });

    useChannels.getState().select(sala, "clique");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBe("sala");
    expect(s.voiceChannelId).toBe("sala");
    expect(conectar).toHaveBeenCalledWith(sala, undefined);
  });

  it("opcoes.som=false repassa { som: false } ao connect", () => {
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "geral",
      voiceChannelId: null,
    });

    useChannels.getState().select(sala, "clique", { som: false });

    expect(conectar).toHaveBeenCalledWith(sala, { som: false });
  });

  it("no celular, tocar num canal de voz abre o palco mesmo com um canal de texto ativo", () => {
    // no `ShellMobile` o toque sempre vem da lista (nunca há chat na tela ao
    // lado); `activeChannelId` aponta pro 1º canal de texto desde o
    // `loadForGuild`, mas isso não pode impedir o palco de assumir a tela
    ehMobile.mockReturnValue(true);
    useChannels.setState({
      guildId: "g1",
      channels: [geral, sala],
      activeChannelId: "geral",
      voiceChannelId: null,
    });

    useChannels.getState().select(sala, "clique");

    const s = useChannels.getState();
    expect(s.activeChannelId).toBe("sala");
    expect(s.voiceChannelId).toBe("sala");
    expect(conectar).toHaveBeenCalledWith(sala, undefined);
  });
});
