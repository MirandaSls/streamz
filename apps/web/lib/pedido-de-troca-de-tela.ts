/**
 * "Alterar a Transmissão" do menu da minha própria tela (`abrirMenuDaMinhaTela`
 * em `participant-menu.tsx`) pede ao `ScreenShareButton` que reabra o seletor.
 *
 * Pub/sub e não store porque o seletor é estado local do botão, e o menu não é
 * componente (abre por `onContextMenu`, sem hooks).
 *
 * **Só o assinante mais antigo ainda montado atende.** Podem existir vários
 * `ScreenShareButton` ao mesmo tempo (barra do palco e "Voz conectada" do
 * rodapé); se todos reagissem, abririam um seletor cada, empilhados. O seletor
 * é um modal em portal, então tanto faz qual botão o hospeda — importa só que
 * seja um. Quando o primeiro desmonta, o seguinte assume sozinho.
 */

type Ouvinte = () => void;

const ouvintes: Ouvinte[] = [];

export function pedirTrocaDeTela(): void {
  ouvintes[0]?.();
}

export function aoPedirTrocaDeTela(fn: Ouvinte): () => void {
  ouvintes.push(fn);
  return () => {
    const i = ouvintes.indexOf(fn);
    if (i >= 0) ouvintes.splice(i, 1);
  };
}
