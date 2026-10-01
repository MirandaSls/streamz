"use client";

import { useId, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import type { Guild, GuildFolder } from "@streamz/shared";
import { Folder } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/primitivos";

/*
 * Pasta de servidores do rail — réplica da `folderGroup` do Discord.
 *
 * As medidas vêm de duas fontes, e cada uma diz uma coisa:
 *
 * - CSS bruto do Discord (`docs/referencias-discord/tokens/css-bruto`,
 *   classes `folder*__48112`): pasta de 48 (`--guildbar-folder-size`) contra
 *   avatar de 40, prévia com respiro de 4 e vão de 2 entre as miniaturas,
 *   cantos 13/4 de cada miniatura, fundo da pasta aberta a 15% da cor e o da
 *   prévia a 40%, realce de soltar em `--opacity-green-28` + `--status-positive`,
 *   animação de 150ms `ease-out`.
 * - Prints de `docs/Reference/pastas-de-servidores` (01, 04, 07): o fundo da
 *   pasta aberta tem 48 de largura com borda de 1px, o cabeçalho ocupa 48 de
 *   altura, o primeiro servidor começa 6px abaixo dele, os servidores ficam a
 *   10px um do outro e o último a 4px da borda de baixo (contando a borda). A
 *   pasta fechada tem raio 16 — não os 12 do `--radius-md` que o CSS bruto
 *   põe no recorte do botão: medido na primeira linha de pixels do tile, que
 *   só fecha com raio 16. Onde CSS e print discordam, vale o print.
 *
 * Este componente só desenha. Quem resolve layout, estado de aberta/fechada,
 * arrastar e o menu é o `GuildRail`, que passa tudo pronto por props.
 */

/** Lado da pasta (`--guildbar-folder-size`), em qualquer tamanho de avatar. */
const LADO_DA_PASTA = 48;

/** Lado de cada miniatura da prévia: (48 − 4·2 − 2) / 2. */
export const LADO_DA_MINIATURA = (LADO_DA_PASTA - 4 * 2 - 2) / 2;

/**
 * Cantos de cada miniatura, na ordem em que o `flex-wrap` as põe (superior
 * esquerda, superior direita, inferior esquerda, inferior direita): o canto
 * que encosta no canto da pasta arredonda 13, os outros 4 — é o que faz as
 * quatro lerem como **um** quadrado recortado em quatro.
 */
const CANTOS_DAS_MINIATURAS = [
  "13px 4px 4px 4px",
  "4px 13px 4px 4px",
  "4px 4px 4px 13px",
  "4px 4px 13px 4px",
] as const;

/**
 * Iniciais de cada palavra, como o Discord faz com servidores sem ícone.
 *
 * É a mesma regra do `acronym` de `GuildRail.tsx`, que é local àquele arquivo
 * — repetida aqui só porque este cartão não podia mexer nele. As duas devem
 * virar uma quando alguém puder tocar nos dois.
 */
export function siglaDoServidor(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra) => palavra[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export interface Miniatura {
  id: string;
  /** URL do ícone; `null` = desenha a sigla. */
  imagem: string | null;
  sigla: string;
  /** `border-radius` desta posição (ver `CANTOS_DAS_MINIATURAS`). */
  cantos: string;
}

/**
 * As até quatro miniaturas da pasta fechada, na ordem da pasta. Com menos de
 * quatro servidores as posições que faltam ficam vazias, como no Discord
 * (print 07: pasta de dois servidores só preenche a linha de cima).
 */
export function miniaturasDaPasta(servidores: readonly Pick<Guild, "id" | "name" | "iconUrl">[]): Miniatura[] {
  return servidores.slice(0, CANTOS_DAS_MINIATURAS.length).map((servidor, i) => ({
    id: servidor.id,
    imagem: servidor.iconUrl || null,
    sigla: siglaDoServidor(servidor.name),
    cantos: CANTOS_DAS_MINIATURAS[i],
  }));
}

/** `#RRGGBB` → `rgba(...)` com o alfa pedido; `null` se o hex não for válido. */
function comAlfa(hex: string, alfa: number): string | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((par) => parseInt(par, 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

export interface CoresDaPasta {
  /** Fundo da pasta aberta; `undefined` = `bg-background-mod-subtle`. */
  fundoAberta?: string;
  /** Fundo da prévia da pasta fechada; `undefined` = `bg-background-mod-subtle`. */
  fundoPrevia?: string;
  /** Cor do ícone de pasta; `undefined` = `text-background-brand` (o limão). */
  icone?: string;
}

/**
 * As três cores que a cor da pasta tinge.
 *
 * O Discord escreve `color-mix(in srgb, cor, transparent 85%)` (e `60%` na
 * prévia); isso é a mesma cor com alfa 0,15 (e 0,4), que é o que sai daqui —
 * conferido no print 04: `#e91e63` a 15% sobre o rail dá `#321320`, o pixel
 * que está lá.
 *
 * `color: null` é a cor padrão da UI e **não** vira hex aqui: cada caso cai no
 * token correspondente (fundo neutro e ícone no `--background-brand`, o limão
 * do Streamz), para seguir o tema em vez de congelar um valor. Hex inválido é
 * tratado como `null` — o contrato já recusa, mas um layout antigo não pode
 * pintar a pasta de preto.
 */
export function coresDaPasta(cor: string | null): CoresDaPasta {
  if (!cor) return {};
  const fundoAberta = comAlfa(cor, 0.15);
  const fundoPrevia = comAlfa(cor, 0.4);
  if (!fundoAberta || !fundoPrevia) return {};
  return { fundoAberta, fundoPrevia, icone: cor };
}

/**
 * Altura da pílula branca da pasta **fechada** — a mesma régua do `RailItem`:
 * alta (o lado do avatar) com um servidor dela ativo, ponto com não lido,
 * curta no hover. Aberta, a pasta não tem pílula: cada servidor mostra a sua.
 */
export function classeDaPilula({
  aberta,
  ativa,
  naoLido,
  lado,
}: {
  aberta: boolean;
  ativa: boolean;
  naoLido: boolean;
  lado: 40 | 48;
}): string {
  if (aberta) return "h-0";
  if (ativa) return lado === 48 ? "h-[48px]" : "h-10";
  return naoLido ? "h-2 group-hover/pasta:h-5" : "h-0 group-hover/pasta:h-5";
}

/** Nome acessível do botão da pasta. */
export function rotuloDaPasta({
  nome,
  aberta,
  ativa,
  naoLido,
}: {
  nome: string;
  aberta: boolean;
  ativa: boolean;
  naoLido: boolean;
}): string {
  // aberta, o não lido é anunciado por cada servidor da lista
  const sufixo = !aberta && naoLido && !ativa ? " (não lido)" : "";
  return `Pasta ${nome}${sufixo}`;
}

export default function PastaDoRail({
  folder,
  nome,
  servidores,
  aberta,
  ativa,
  naoLido,
  mencoes,
  onToggle,
  onContextMenu,
  dropAlvo = false,
  lado = 40,
  dragProps,
  children,
}: {
  folder: GuildFolder;
  /** Nome já derivado (`guildFolderDisplayName`): é o que vai no tooltip. */
  nome: string;
  /** Os servidores da pasta, na ordem dela — a prévia usa os quatro primeiros. */
  servidores: Guild[];
  aberta: boolean;
  /** O servidor ativo está nesta pasta. */
  ativa: boolean;
  /** Algum servidor da pasta tem não lido. */
  naoLido: boolean;
  /** Soma das menções dos servidores da pasta. */
  mencoes: number;
  onToggle: () => void;
  /** Menu da pasta — só no cabeçalho, não nos servidores de dentro. */
  onContextMenu: (e: MouseEvent) => void;
  /** Um servidor está sendo arrastado sobre esta pasta. */
  dropAlvo?: boolean;
  /** Lado do avatar: 40 no desktop, 48 no celular (como o `RailItem`). */
  lado?: 40 | 48;
  /**
   * Atributos de arrastar (`draggable`, `onDragStart`, `onDragOver`,
   * `onDrop`, `data-*`...). Vão no **cabeçalho**, não na pasta inteira: a
   * lista aberta é feita de `RailItem`s que arrastam por conta própria, e um
   * `onDrop` no contêiner pegaria os deles também. `className` é somado ao
   * do cabeçalho; `onContextMenu` daqui é ignorado (vale a prop).
   */
  dragProps?: HTMLAttributes<HTMLDivElement>;
  /** Os `RailItem`s dos servidores, já montados — aparecem com a pasta aberta. */
  children: ReactNode;
}) {
  const idDaLista = useId();
  const cores = coresDaPasta(folder.color);
  const miniaturas = miniaturasDaPasta(servidores);
  // folga entre o ícone e a borda da pasta: (48 − avatar) / 2, a
  // `--custom-folder-padding` do Discord. Com avatar de 48 ela some.
  const caixaDoIcone = lado === 48 ? "h-12 w-12" : "h-10 w-10";

  // cor inline só quando há cor própria e nada a sobrepor: estilo inline
  // ganharia do realce verde de soltar.
  const estiloDoFundo: CSSProperties | undefined =
    cores.fundoAberta && !dropAlvo ? { backgroundColor: cores.fundoAberta } : undefined;

  return (
    <div className="relative flex w-full flex-col" data-pasta-id={folder.id}>
      {/* O fundo da pasta aberta. Existe sempre e só aparece por opacidade —
          é como o Discord faz a cor entrar junto com a abertura. Fica atrás
          do cabeçalho e da lista, com 48 de largura centrado no rail, e
          ocupa a altura inteira da pasta. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-12 -translate-x-1/2 rounded-2xl border transition-[opacity,background-color,border-color] duration-[var(--mov-hover)] ease-out motion-reduce:transition-none ${
          aberta ? "opacity-100" : "opacity-0"
        } ${
          dropAlvo
            ? "border-status-positive bg-opacity-green-28"
            : `border-border-muted ${cores.fundoAberta ? "" : "bg-background-mod-subtle"}`
        }`}
        style={estiloDoFundo}
      />

      <div
        {...dragProps}
        className={`group/pasta relative flex w-full justify-center ${dragProps?.className ?? ""}`}
        onContextMenu={onContextMenu}
        data-drop-alvo={dropAlvo ? "true" : undefined}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-interactive-text-active transition-all duration-200 ${classeDaPilula(
            { aberta, ativa, naoLido, lado },
          )}`}
        />
        {/* A caixa de 48 que não corta: ancora o badge e leva o realce de
            soltar da pasta fechada (raio 12 + contorno, do CSS do Discord). */}
        <div
          className={`relative h-12 w-12 shrink-0 ${
            dropAlvo && !aberta
              ? "rounded-xl bg-opacity-green-28 outline outline-1 outline-status-positive"
              : ""
          }`}
        >
          <Tooltip label={nome} side="right" rail>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={aberta}
              aria-controls={idDaLista}
              aria-label={rotuloDaPasta({ nome, aberta, ativa, naoLido })}
              className="group/botao relative block h-12 w-12 overflow-hidden rounded-2xl"
            >
              {/* Ícone e prévia empilhados numa coluna de 96 que desliza
                  48px: fechada mostra a prévia (de baixo), aberta o ícone (de
                  cima). É a `folderButtonContent` do Discord — a troca é um
                  deslize vertical, não um esmaecer. */}
              <span
                className={`flex flex-col transition-transform duration-[var(--mov-hover)] ease-out motion-reduce:transition-none ${
                  aberta ? "translate-y-0" : "-translate-y-12"
                }`}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center">
                  <span
                    className={`grid place-items-center rounded-xl transition-colors duration-[var(--mov-hover)] ease-out hover:bg-background-mod-subtle group-focus-visible/botao:bg-background-mod-subtle ${caixaDoIcone} ${
                      cores.icone ? "" : "text-background-brand"
                    }`}
                    style={cores.icone ? { color: cores.icone } : undefined}
                  >
                    <Folder size={lado === 48 ? 24 : 20} aria-hidden="true" />
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={`block h-12 w-12 shrink-0 rounded-2xl p-1 ${
                    cores.fundoPrevia ? "" : "bg-background-mod-subtle"
                  }`}
                  style={cores.fundoPrevia ? { backgroundColor: cores.fundoPrevia } : undefined}
                >
                  <span className="flex h-10 w-10 flex-wrap content-start gap-0.5">
                    {miniaturas.map((mini) => (
                      <span
                        key={mini.id}
                        className="block shrink-0 overflow-hidden"
                        style={{
                          width: LADO_DA_MINIATURA,
                          height: LADO_DA_MINIATURA,
                          borderRadius: mini.cantos,
                        }}
                      >
                        {mini.imagem ? (
                          // mesmo proxy público da API que o ícone do rail usa
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={mini.imagem} alt="" className="h-full w-full object-cover" />
                        ) : (
                          // `.noIcon` do Discord: fundo `--background-base-lower`,
                          // texto `--text-default`. O corpo de 8px não foi
                          // medido (nenhum print mostra sigla em miniatura).
                          <span className="block h-full w-full overflow-hidden whitespace-nowrap bg-background-base-lower text-center text-[8px] font-semibold leading-[19px] text-text-default">
                            {mini.sigla}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                </span>
              </span>
            </button>
          </Tooltip>
          {/* Badge só fechada: aberta, cada servidor mostra o seu. Fora do
              botão (que corta) e sem eventos, como no `RailItem`. */}
          {!aberta && mencoes > 0 && (
            <span
              aria-label={`${mencoes} ${mencoes === 1 ? "menção" : "menções"}`}
              className="pointer-events-none absolute bottom-0 right-0"
            >
              <Badge tipo="numero" valor={mencoes} recorte className="ring-2" />
            </span>
          )}
        </div>
      </div>

      {/* A lista abre por altura (`grid-template-rows` 0fr → 1fr, que anima
          sem medir em JS) e some por `visibility` ao fim da transição:
          fechada, fica fora do Tab e da árvore de acessibilidade, e os
          servidores não continuam clicáveis por baixo de nada. */}
      <div
        id={idDaLista}
        className={`grid transition-[grid-template-rows,visibility] duration-[var(--mov-hover)] ease-out motion-reduce:transition-none ${
          aberta ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* 6px do cabeçalho ao primeiro servidor, 10 entre eles e 4 até a
              borda de baixo — medidos no print 01. */}
          <div role="group" aria-label={nome} className="flex flex-col gap-2.5 pb-1 pt-1.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
