/**
 * Comparação de versão do app de desktop.
 *
 * Fica num módulo sem Nest porque é a parte que se testa: dizer "há
 * atualização" é uma decisão de uma linha que, errada, ou nunca oferece nada ou
 * oferece para sempre — o segundo caso é pior, porque o usuário instala, reabre
 * e o aviso continua lá.
 *
 * Só o `x.y.z` importa. Sufixo de pré-lançamento (`-beta.1`) é ignorado de
 * propósito: não distribuímos pré-lançamento pelo atualizador, e tratá-lo
 * "quase certo" seria pior que não tratar.
 */
export function partes(versao: string): [number, number, number] {
  const limpa = versao.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  const [x, y, z] = limpa.split(".").map((n) => Number.parseInt(n, 10));
  return [x || 0, y || 0, z || 0];
}

/** `true` quando `candidata` é mais nova que `atual`. */
export function ehMaisNova(candidata: string, atual: string): boolean {
  const a = partes(candidata);
  const b = partes(atual);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
