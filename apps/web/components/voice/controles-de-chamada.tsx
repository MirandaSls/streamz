"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "@/components/ui/icones";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import Tooltip from "@/components/ui/Tooltip";

/**
 * As peças da barra de controles da chamada.
 *
 * A barra do Discord **não** é uma pílula única com botões redondos soltos: são
 * cápsulas, cada uma agrupando o que pertence junto — o que sai de mim
 * (microfone, câmera), o que eu acrescento à sala (tela, ruído, mais) — e o
 * desligar sozinho, do lado de fora. O agrupamento é o que deixa a fileira
 * legível sem ler ícone por ícone: a distância entre cápsulas diz mais que
 * qualquer rótulo.
 *
 * Dentro da cápsula o botão é **transparente**: o fundo é da cápsula, e a cor
 * do botão fica reservada a estado (ligado, mudo). Era esse o erro do desenho
 * anterior — todo botão tinha fundo próprio, então "tem fundo" não significava
 * nada e o estado precisava ser lido no ícone.
 *
 * Sobre o vermelho: ele tem dois papéis e eles não podem se confundir.
 * `desligar` é o fundo vermelho cheio, e existe **uma vez** na tela; `mudo` é
 * ícone vermelho sobre um véu do mesmo vermelho. Pintar o microfone mudo de
 * `desligar` daria dois botões iguais lado a lado, um deles irreversível.
 */

type Tom = "neutro" | "ativo" | "aoVivo" | "mudo" | "desligar";
/** Onde o botão está dentro de um par: sozinho, ou colado ao vizinho. */
type Borda = "sozinho" | "esquerda" | "direita";

// migração 0.8: as cores cruas (`text-white`, `bg-white`) viraram o par
// `control-overlay-*` — o mesmo contrato que `TelaCheiaDeVideo`/`ImageModal`
// já usam para "controle flutuando sobre vídeo": `secondary` (ícone branco,
// sem fundo próprio aqui — o fundo é da cápsula) para `neutro`,
// `primary` (fundo branco, texto/ícone escuro) para `ativo`. O tingimento de
// hover do `neutro` (`bg-white/10`, translúcido) não tem par no contrato —
// preto/branco cru continuam aí, ver "faltando".
const TOM: Record<Tom, string> = {
  neutro: "text-control-overlay-secondary-icon-default hover:bg-white/10",
  ativo:
    "bg-control-overlay-primary-background-default text-control-overlay-primary-text-default hover:bg-control-overlay-primary-background-hover",
  // transmitir é o único "ligado" que o Discord pinta de verde, e não de
  // branco: é o estado que continua valendo quando você olha para outra aba
  aoVivo: "bg-status-positive text-control-primary-text-default hover:brightness-110",
  mudo: "bg-status-danger/15 text-status-danger hover:bg-status-danger/25",
  desligar: "bg-status-danger text-control-critical-primary-text-default hover:bg-control-critical-primary-background-hover",
};

// o raio grande é sempre a metade da altura do botão (44/2): é o que mantém a
// ponta em pílula depois do aumento. O 4 do lado colado não acompanha — ele é o
// respiro entre botão e vizinho, e a 4,4px não haveria pixel para mostrar.
const BORDA: Record<Borda, string> = {
  sozinho: "rounded-[22px]",
  esquerda: "rounded-l-[22px] rounded-r-[4px]",
  direita: "rounded-r-[22px] rounded-l-[4px]",
};

/** Fundo escuro que agrupa um punhado de controles. */
export function Capsula({ children }: { children: React.ReactNode }) {
  // 52 de altura: 4 de padding + 44 do botão. Foram 48 (4 + 40), que é
  // exatamente a medida do Discord (medido no print 2026-08-31 101857: cápsula
  // de 48, botão de 40, ícone de 18 de tinta). O usuário pediu maior mesmo
  // assim, então a fileira toda subiu ~10% a partir daquela paridade — não é
  // correção de desvio, é escolha, e por isso está escrita aqui.
  //
  // Fundo: medido no mesmo print, `#131416` (linha y=866, trechos 1035–1052 e
  // 1101–1244) — quase idêntico a `--background-base-lowest` (`#121214`), não
  // a `--background-surface-higher` (`#28282d`) que estava aqui antes. A conta
  // fecha: `background-base-lowest` a 90% sobre o vazio do palco (`#17171a`,
  // medido no nosso print) dá ~`#131416`, o valor medido — a divergência era
  // de token, não de opacidade ou blur.
  return (
    <div className="flex items-center gap-1 rounded-full bg-background-base-lowest/90 p-1 shadow-popout backdrop-blur">
      {children}
    </div>
  );
}

/** Botão de 44px da barra. Largura maior quando está sozinho na cápsula. */
export function BotaoDeChamada({
  label,
  onClick,
  tom = "neutro",
  borda = "sozinho",
  pressionado,
  expandido,
  atalho,
  children,
}: {
  label: string;
  onClick: () => void;
  tom?: Tom;
  borda?: Borda;
  pressionado?: boolean;
  expandido?: boolean;
  atalho?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} shortcut={atalho}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressionado}
        aria-expanded={expandido}
        className={`grid h-11 w-[52px] place-items-center transition ${TOM[tom]} ${BORDA[borda]}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * O vermelho cheio de encerrar — fora de qualquer cápsula, e único na tela.
 *
 * Mais alto e mais largo que os outros de propósito: é o único botão
 * irreversível da fileira, e o tamanho faz parte de não errar o clique.
 *
 * 66×50 e `#d22d39`, medidos no print 2026-08-31 101857 (linha y=866
 * x=1258–1323; coluna x=1290 y=841–890) — eram 70×56 com `bg-status-danger`
 * (`#da3e44`, o vermelho de *badge* e de notificação). `#d22d39` é
 * `--control-critical-primary-background-default` (`tokens.css`), o mesmo tom
 * do nosso botão "Apagar" (`modal-confirmacao.png` coluna x=1820 y=618–655) —
 * é o vermelho de botão de perigo, não o de notificação.
 */
export function BotaoDeDesligar({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="grid h-[50px] w-[66px] place-items-center rounded-full bg-control-critical-primary-background-default text-control-critical-primary-text-default shadow-popout transition hover:bg-control-critical-primary-background-hover"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Botão com uma seta colada ao lado, que abre a lista de dispositivos.
 *
 * O `menu` é uma função e não um nó pronto porque listar microfones **pede
 * permissão de mídia**: montar a lista junto da barra faria o navegador
 * perguntar sozinho, no meio da chamada, sem ninguém ter pedido nada. Só quando
 * a seta é clicada é que o componente da lista entra na árvore.
 */
export function SplitDeDispositivo({
  label,
  labelDaSeta,
  tom,
  pressionado,
  onClick,
  atalho,
  menu,
  children: icone,
}: {
  label: string;
  labelDaSeta: string;
  tom?: Tom;
  pressionado?: boolean;
  onClick: () => void;
  atalho?: string;
  menu: () => React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const seta = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center gap-px">
      <BotaoDeChamada label={label} onClick={onClick} tom={tom} borda="esquerda" pressionado={pressionado} atalho={atalho}>
        {icone}
      </BotaoDeChamada>
      <Tooltip label={labelDaSeta}>
        <button
          ref={seta}
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={labelDaSeta}
          aria-expanded={aberto}
          // mesmos dois tons do `TOM` acima — referenciar em vez de duplicar o
          // literal, senão um ajuste de cor (como o da migração 0.8) precisa
          // lembrar de mexer aqui também
          className={`grid h-11 w-[26px] place-items-center rounded-l-[4px] rounded-r-[22px] transition ${
            tom === "mudo" ? TOM.mudo : TOM.neutro
          }`}
        >
          <ChevronDown size={18} />
        </button>
      </Tooltip>

      <PopoverFlutuante
        ancora={seta}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        rotulo={labelDaSeta}
        largura={288}
        denso
      >
        {/* ver `UserFooter`: o menu navega e tem deslizador; fechar a cada
            clique impediria os dois */}
        <div role="menu" aria-label={labelDaSeta}>
          {menu()}
        </div>
      </PopoverFlutuante>
    </div>
  );
}
