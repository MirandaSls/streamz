import { MAX_MESSAGE_LENGTH } from "@streamz/shared";

/**
 * ── F5 membros ── `embeds` do Discord → texto.
 *
 * **Por que achatar em vez de guardar o embed.** No Discord uma mensagem com
 * `embeds` e sem `content` é válida — é como quase todo bot responde. A F1
 * recusava esse corpo com `50035 content[BASE_TYPE_REQUIRED]`, o que na prática
 * quebrava os bots que só mandam embed. Aceitar o corpo é metade do conserto; a
 * outra metade é a mensagem **não** chegar vazia ao navegador, porque o Streamz
 * não tem embed rico (`Message` é texto + anexos) e uma mensagem de conteúdo
 * vazio aparece como uma linha em branco para o humano do outro lado.
 *
 * Então o embed vira texto, na mesma ordem em que o Discord o desenha: título,
 * descrição, campos (`nome: valor`), rodapé. É a mesma decisão que o §5 já
 * tomou para as mensagens de sistema ("com o texto já achatado"), e é
 * reversível: no dia em que houver embed de verdade, o achatamento sai e o
 * objeto é guardado.
 *
 * Puro, sem dependência de Nest ou Prisma — testável como as outras traduções.
 */

/** Os campos que valem alguma coisa para quem lê. Ver o teste da tabela. */
export function achatarEmbeds(embeds: readonly unknown[]): string {
  const partes: string[] = [];
  for (const cru of embeds) {
    const embed = objeto(cru);
    if (!embed) continue;

    const titulo = texto(embed.title);
    const url = texto(embed.url);
    // título com link vira o markdown que o composer do Streamz já entende
    if (titulo) partes.push(url ? `[${titulo}](${url})` : `**${titulo}**`);
    else if (url) partes.push(url);

    const descricao = texto(embed.description);
    if (descricao) partes.push(descricao);

    for (const campoCru of Array.isArray(embed.fields) ? embed.fields : []) {
      const campo = objeto(campoCru);
      const nome = campo && texto(campo.name);
      const valor = campo && texto(campo.value);
      if (nome && valor) partes.push(`**${nome}**: ${valor}`);
      else if (valor) partes.push(valor);
    }

    const rodape = objeto(embed.footer);
    const textoDoRodape = rodape && texto(rodape.text);
    if (textoDoRodape) partes.push(textoDoRodape);

    // a imagem do embed é uma URL: mandá-la como texto faz o preview de link do
    // Streamz (`modules/embeds`) mostrá-la, que é o mais perto do original
    const imagem = objeto(embed.image);
    const urlDaImagem = imagem && texto(imagem.url);
    if (urlDaImagem) partes.push(urlDaImagem);
  }

  const inteiro = partes.join("\n");
  // o teto é do banco e do contrato; um embed comprido cortado ainda diz mais
  // que uma mensagem recusada
  return inteiro.length > MAX_MESSAGE_LENGTH ? inteiro.slice(0, MAX_MESSAGE_LENGTH) : inteiro;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}
