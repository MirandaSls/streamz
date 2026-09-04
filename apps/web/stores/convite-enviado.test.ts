import { beforeEach, describe, expect, it } from "vitest";
import { isUnread, type DMChannelView } from "@streamz/shared";
import { useDMs } from "./dms";
import { useChannels } from "./channels";
import { somarNaoLidas } from "./nao-lidas";

/**
 * "Ao enviar o convite para um usuário, está contando como se o usuário
 * tivesse me mandado mensagem, sendo que quem enviou fui eu."
 *
 * O caminho do defeito: o modal "Convidar amigos" abre a conversa pela API e
 * manda o link por `message.create`. A conversa **não está na tela**, então
 * ninguém chama `markRead` — e o eco `message.new` só empurrava o
 * `lastMessageAt`. Como `isUnread` compara `lastMessageAt` com `lastReadAt` e
 * não olha o autor, a minha própria mensagem deixava a linha em negrito na
 * coluna, com cara de mensagem recebida.
 *
 * A regra que fecha isso, no cliente e no servidor: **quem escreve leu**.
 */

function conversa(id: string, extra: Partial<DMChannelView> = {}): DMChannelView {
  return {
    id,
    guildId: null,
    name: null,
    type: "DM",
    position: 0,
    private: false,
    readOnly: false,
    lastMessageAt: "2026-09-04T10:00:00.000Z",
    lastReadAt: "2026-09-04T10:00:00.000Z",
    mentionCount: 0,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    others: [],
    iconUrl: null,
    ownerId: null,
    unreadCount: 0,
    ...extra,
  } as DMChannelView;
}

beforeEach(() => {
  useDMs.setState({ channels: [conversa("dm1"), conversa("dm2")], activeId: null });
  useChannels.setState({
    guildId: "g1",
    channels: [
      {
        id: "c1",
        guildId: "g1",
        name: "geral",
        type: "TEXT",
        position: 0,
        private: false,
        readOnly: false,
        syncedWithCategory: false,
        lastMessageAt: "2026-09-04T10:00:00.000Z",
        lastReadAt: "2026-09-04T10:00:00.000Z",
        mentionCount: 0,
        categoryId: null,
        topic: null,
        slowmodeSeconds: 0,
        nsfw: false,
      },
    ],
  });
});

describe("o convite que EU mandei", () => {
  const agora = "2026-09-04T10:05:00.000Z";

  it("não deixa a conversa não lida nem acende o badge", () => {
    useDMs.getState().bumpUnread("dm2", agora, false, true);
    const dm = useDMs.getState().channels.find((d) => d.id === "dm2")!;
    expect(isUnread(dm)).toBe(false);
    expect(dm.unreadCount).toBe(0);
    expect(somarNaoLidas(useDMs.getState().channels)).toBe(0);
  });

  it("ainda sobe a conversa para o topo da coluna", () => {
    useDMs.getState().bumpUnread("dm2", agora, false, true);
    expect(useDMs.getState().channels.map((d) => d.id)).toEqual(["dm2", "dm1"]);
  });

  it("apaga o que estava pendurado na conversa (o servidor grava o mesmo)", () => {
    useDMs.setState({ channels: [conversa("dm1", { unreadCount: 3, mentionCount: 1 })] });
    useDMs.getState().bumpUnread("dm1", agora, false, true);
    const dm = useDMs.getState().channels[0];
    expect(dm.unreadCount).toBe(0);
    expect(dm.mentionCount).toBe(0);
  });

  it("no canal de servidor também não deixa negrito nem menção", () => {
    useChannels.getState().bumpUnread("c1", agora, true, true);
    const canal = useChannels.getState().channels[0];
    expect(isUnread(canal)).toBe(false);
    expect(canal.mentionCount).toBe(0);
  });
});

describe("a mensagem do outro continua contando", () => {
  const agora = "2026-09-04T10:05:00.000Z";

  it("conta como não lida na conversa", () => {
    useDMs.getState().bumpUnread("dm2", agora, false, false);
    const dm = useDMs.getState().channels.find((d) => d.id === "dm2")!;
    expect(isUnread(dm)).toBe(true);
    expect(dm.unreadCount).toBe(1);
    expect(somarNaoLidas(useDMs.getState().channels)).toBe(1);
  });

  it("deixa o canal de servidor não lido e conta a menção", () => {
    useChannels.getState().bumpUnread("c1", agora, true, false);
    const canal = useChannels.getState().channels[0];
    expect(isUnread(canal)).toBe(true);
    expect(canal.mentionCount).toBe(1);
  });
});
