/**
 * **Na coluna da direita do canal de voz só cabe um painel.**
 *
 * O canal de voz tem dois painéis candidatos à mesma coluna: a conversa da call
 * (`PainelDeChatDaCall`, aberta pelo balão) e a lista de membros do servidor
 * (`MemberList`, aberta pelo ícone de pessoas — o mesmo do canal de texto).
 * Os dois encostam na borda direita da janela, então mostrar os dois juntos
 * empilharia duas colunas onde o Discord tem uma.
 *
 * **Medido nas prints** (`docs/Reference/Captura de tela 2026-09-04 102422.png`
 * e `102429.png`, 1919×1079, tiradas com 7 segundos de diferença na mesma
 * sessão):
 *
 * | print | tela | coluna da direita |
 * |---|---|---|
 * | `102422` | canal de texto `#warframe` | lista de membros: filete em x=1651, painel de x=1652 a 1919 → **267 de largura** |
 * | `102429` | canal de voz `Geral`, conversa aberta | painel da conversa a partir de x=1432 → **487**; **a lista de membros sumiu** |
 *
 * Na segunda print a lista não sumiu porque o usuário a desligou: ela estava
 * na tela sete segundos antes, no canal de texto do mesmo servidor, e voltou a
 * aparecer nas idas e vindas seguintes. Quem a tirou foi a conversa da call.
 *
 * Daí a regra: **a conversa da call ganha da lista de membros**, e o clique em
 * um fecha o outro — sem apagar a preferência do outro, que é lembrada onde
 * sempre foi (`chatDaCallPorCanal`, canal a canal, e `membersOpen`, do app
 * inteiro). Assim voltar ao canal de texto reencontra a lista aberta, e voltar
 * ao canal de voz reencontra a conversa: cada painel continua onde foi deixado,
 * e a exclusividade é só de quem está **na tela agora**.
 *
 * Módulo à parte, sem React, pelo mesmo motivo do `call-split-layout.ts`: é uma
 * decisão de duas linhas que precisa estar escrita num lugar e testada.
 */

/** O painel que a coluna da direita está mostrando — ou nenhum. */
export type PainelDaCall = "chat" | "membros" | null;

/**
 * Qual dos dois está na tela.
 *
 * Vale também para o canal de texto: lá não existe conversa de call
 * (`chatAberto` é sempre `false`) e a função devolve exatamente `membersOpen`.
 */
export function painelDaCall(chatAberto: boolean, membrosLigados: boolean): PainelDaCall {
  if (chatAberto) return "chat";
  return membrosLigados ? "membros" : null;
}

/** A lista de membros está visível de fato (e não só ligada). */
export function membrosVisiveis(chatAberto: boolean, membrosLigados: boolean): boolean {
  return painelDaCall(chatAberto, membrosLigados) === "membros";
}

/** O que gravar quando alguém clica no ícone de pessoas do cabeçalho. */
export interface CliqueNosMembros {
  /** novo valor de `membersOpen`. */
  membros: boolean;
  /** a conversa da call precisa fechar para a lista aparecer. */
  fecharChat: boolean;
}

/**
 * O clique no ícone de membros.
 *
 * O botão alterna o que se **vê**, não o que está guardado: com a conversa
 * aberta a lista está ligada mas invisível, e ali o clique tem de mostrá-la —
 * fechando a conversa —, não desligar uma lista que ninguém está vendo.
 */
export function cliqueNosMembros(chatAberto: boolean, membrosLigados: boolean): CliqueNosMembros {
  if (membrosVisiveis(chatAberto, membrosLigados)) return { membros: false, fecharChat: false };
  return { membros: true, fecharChat: chatAberto };
}
