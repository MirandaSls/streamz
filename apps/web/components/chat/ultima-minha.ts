/**
 * A última mensagem confirmada de um autor na timeline — é ela que o `↑` no
 * campo vazio abre para editar, tanto no canal quanto na conversa direta.
 *
 * Fica fora dos dois componentes porque a regra é a mesma nos dois e, quando
 * vivia só no `ChatView`, a conversa direta simplesmente não tinha o atalho.
 */
export function ultimaMinhaMensagem(
  items: { id: string; content: string; author: { id: string }; pending?: boolean }[],
  userId: string,
): { id: string; content: string } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const m = items[i];
    if (m.author.id === userId && !m.pending) return { id: m.id, content: m.content };
  }
  return null;
}
