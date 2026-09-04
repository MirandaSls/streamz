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
 * `onReagir` só é passado quando a imagem pertence a uma mensagem: reagir é
 * sobre a **mensagem**, não sobre o arquivo, e uma imagem de prévia de link
 * fora de mensagem não tem a que reagir.
 */
export function itensDaImagem({
  url,
  alt,
  onReagir,
}: {
  url: string;
  alt?: string | null;
  onReagir?: () => void;
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
  });
  itens.push({
    label: "Salvar Imagem",
    icon: <Download size={18} />,
    onSelect: () => void salvarImagem(url, alt),
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
