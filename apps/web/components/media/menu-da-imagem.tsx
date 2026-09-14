"use client";

import { Copy, Download, ExternalLink, Link2, SmilePlus } from "@/components/ui/icones";
import {
  abrirImagemNoNavegador,
  copiarImagem,
  copiarLinkDaImagem,
  salvarImagem,
} from "@/lib/imagem-arquivo";
import type { MenuItem } from "@/stores/ui";

/**
 * O menu de botão direito de uma imagem — o mesmo na mensagem e dentro do
 * visualizador, porque é a mesma imagem e seria estranho ter dois.
 *
 * No app de desktop o menu **nativo** do WebView2 está bloqueado (#138,
 * `bloquearMenuNativo` em `lib/desktop.ts`), então sem isto o botão direito
 * sobre uma imagem não fazia nada lá. Quem monta os itens chama
 * `ui.openContextMenu` com o resultado.
 *
 * `onReagir` só é passado quando a imagem pertence a uma mensagem **e** quem
 * clicou tem `ADD_REACTIONS` no canal — é o estado "sem permissão" do
 * visualizador (`ImageModal.tsx`): o item some, não aparece cinza, porque é a
 * mesma convenção que `MessageItem.tsx` já usa para o "+" de reação.
 * Sem mensagem (galeria do canal, prévia de link solta) também não há a que
 * reagir.
 */
export function itensDaImagem({
  url,
  alt,
  onReagir,
  indisponivel,
}: {
  url: string;
  alt?: string | null;
  onReagir?: () => void;
  /**
   * Estado "erro" do visualizador: a imagem não carregou, então não há bytes
   * para copiar ou salvar — os dois itens ficam **desabilitados** (cinza,
   * clique inerte), sem sumir do menu. "Copiar Link" e "Abrir no Navegador"
   * continuam ativos: não dependem do `<img>` ter decodificado nada.
   */
  indisponivel?: boolean;
}): MenuItem[] {
  const itens: MenuItem[] = [];

  if (onReagir) {
    itens.push({ label: "Adicionar Reação", icon: <SmilePlus size={18} />, onSelect: onReagir });
    itens.push({ separator: true });
  }

  itens.push({
    label: "Copiar Imagem",
    icon: <Copy size={18} />,
    onSelect: () => void copiarImagem(url),
    disabled: indisponivel,
  });
  itens.push({
    label: "Salvar Imagem",
    icon: <Download size={18} />,
    onSelect: () => void salvarImagem(url, alt),
    disabled: indisponivel,
  });
  itens.push({ separator: true });
  itens.push({
    label: "Copiar Link da Imagem",
    icon: <Link2 size={18} />,
    onSelect: () => copiarLinkDaImagem(url),
  });
  itens.push({
    label: "Abrir no Navegador",
    icon: <ExternalLink size={18} />,
    onSelect: () => void abrirImagemNoNavegador(url),
  });

  return itens;
}
