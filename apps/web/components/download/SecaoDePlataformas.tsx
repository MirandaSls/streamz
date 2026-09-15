"use client";

import type { ReactNode } from "react";
import { rotuloPlataforma, type DownloadDisponivel, type DownloadPlataforma } from "@streamz/shared";
import { Download } from "@/components/ui/icones";
import { Tooltip } from "@/components/ui/primitivos";
import { formatBytes } from "@/lib/format";
import { BotaoDaPagina } from "./BotaoDaPagina";
import { CelularDoApp, JanelaDoApp } from "./ComposicaoDoApp";
import { dataDoInstalador } from "./plataformas";

/**
 * Uma seção por família de plataforma ("computador", "celular"), no molde das
 * seções "BAIXE PARA COMPUTADOR" e "BAIXE PARA CELULAR" do Discord: cartão com a
 * imagem do app de um lado, título, texto e botões do outro.
 *
 * Medidas (`desktop/15-download-inteira.png`, 1440 @2x, e
 * `web-mobile-ios/15-download-inteira.png`, iPhone 15 Pro @3x):
 * - **Cartão** 444×590 no desktop: linha y=4700 azul em x=272–1093 com o canto
 *   ainda arredondando, borda reta em x=240 a partir de y≈4786; coluna x=700
 *   de y=4646 a 5825. Raio ≈64: na primeira linha (y=4650) a cor começa em
 *   x=347, ~107px @2x para dentro, e só chega à borda ~130px @2x abaixo. No
 *   iPhone o cartão vai de x=24 a 369 (345) e o raio mede ≈50 (a borda chega a
 *   x=72 @3x ~150px @3x abaixo do topo). Altura no iPhone ≈502 (tirada da
 *   captura reduzida a 1/3, ±3).
 * - **Colunas** no desktop: margem de 120 dos dois lados (cartão da seção
 *   "celular" em x=120; texto da "computador" em x=120, cartão dela terminando
 *   em x=1320), texto da "celular" começando em x≈742 → 178 entre cartão e
 *   texto. Aqui `grid-cols-[444px_1fr]` com esse vão, alternando o lado.
 * - **Título**: versal de 33 (coluna x=250: y=3545–3611 @2x) e passo de linha
 *   ≈50 (duas linhas a 25px na imagem reduzida a 1/4) → 46px com a versal de
 *   0,714 da Noto Sans, `leading-[50px]`. iPhone: passo 32 e versal ≈24 → 34px.
 *   Caixa alta, peso 800: a `--font-headline` do Discord é a ABC Ginto Nord,
 *   que no Streamz é Noto Sans 800 (`font-headline font-extrabold`, design.md).
 * - **Texto**: passo 26 no desktop (três linhas a 13px na imagem de 1/4) e 24
 *   no iPhone; o tamanho da letra não foi medido — `text-text-md` (16).
 * - **Ritmo**: título → texto 24, texto → botões ≈40 (32 de margem + a
 *   entrelinha), botões com 16 entre si no desktop (x=506–537 @2x) e 8 no
 *   iPhone (x=184–192). No iPhone o cartão vem em cima, centralizado, e o título
 *   começa ≈48 abaixo dele.
 * - **Cor do cartão**: o Discord pinta cada um de uma cor de marketing (verde,
 *   blurple, rosa). Pela regra da ADR-0009 só o limão é cor de marca aqui:
 *   degradê da escala do limão, com o app escuro por cima — nenhum texto fica
 *   sobre o limão.
 */

export interface PlataformaDaSecao {
  plataforma: DownloadPlataforma;
  /** rótulo do botão; padrão o nome da plataforma */
  rotulo?: string;
  disponivel: DownloadDisponivel | null;
}

export function SecaoDePlataformas({
  id,
  titulo,
  texto,
  plataformas,
  imagem,
  imagemAntes = false,
  carregando,
  aoEscolher,
  nota,
  extra,
  className = "",
}: {
  id: string;
  titulo: string;
  texto: string;
  plataformas: PlataformaDaSecao[];
  imagem: "computador" | "celular";
  /** cartão à esquerda do texto no desktop (a seção "celular" do Discord) */
  imagemAntes?: boolean;
  carregando: boolean;
  aoEscolher: (disponivel: DownloadDisponivel) => void;
  nota?: ReactNode;
  /**
   * Bloco livre abaixo da nota (o Terminal do Mac, as instruções por sistema).
   * Separado de `nota` porque ela é um `<p>`, e um bloco com título e botão
   * dentro de parágrafo é HTML inválido.
   */
  extra?: ReactNode;
  className?: string;
}) {
  const idDoTitulo = `${id}-titulo`;
  const disponiveis = plataformas
    .map((p) => p.disponivel)
    .filter((d): d is DownloadDisponivel => d !== null);
  return (
    <section
      id={id}
      aria-labelledby={idDoTitulo}
      className={`mx-auto grid w-full max-w-[1200px] items-center gap-12 lg:gap-[80px] xl:gap-[178px] ${
        imagemAntes ? "lg:grid-cols-[444px_1fr]" : "lg:grid-cols-[1fr_444px]"
      } ${className}`}
    >
      <CartaoDaImagem
        imagem={imagem}
        className={`justify-self-center ${imagemAntes ? "" : "lg:order-last"}`}
      />

      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <h2
          id={idDoTitulo}
          className="max-w-[560px] font-headline text-[46px] font-extrabold uppercase leading-[50px] text-text-strong celular:text-[34px] celular:leading-[32px]"
        >
          {titulo}
        </h2>
        <p className="mt-6 max-w-[560px] text-text-md leading-[26px] text-text-default celular:mt-4 celular:leading-[24px]">
          {texto}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start celular:gap-2">
          {plataformas.map((p) => (
            <BotaoDePlataforma key={p.plataforma} item={p} carregando={carregando} aoEscolher={aoEscolher} />
          ))}
        </div>

        {/* versão do instalador: o catálogo diz tamanho e data do arquivo, não o
            número — o nome com a versão só sai junto do token, para quem acertou a
            senha (`DownloadDisponivel`, packages/shared) */}
        {disponiveis.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1 text-text-sm text-text-muted">
            {disponiveis.map((disponivel) => {
              const data = dataDoInstalador(disponivel.atualizadoEm);
              return (
                <li key={disponivel.plataforma}>
                  {rotuloPlataforma(disponivel.plataforma)} · {formatBytes(disponivel.tamanho)}
                  {data ? ` · atualizado em ${data}` : ""}
                </li>
              );
            })}
          </ul>
        ) : null}

        {nota ? <p className="mt-4 max-w-[560px] text-text-sm text-text-muted">{nota}</p> : null}

        {extra}
      </div>
    </section>
  );
}

/**
 * Botão de uma plataforma. Com instalador: abre a etapa da senha. Sem: fica
 * visível a 50% com "em breve" (design.md, "Estados": botão sem função não some
 * do leiaute). O rótulo "em breve" está escrito, e não só na dica, porque no
 * celular não há hover para a dica aparecer.
 */
function BotaoDePlataforma({
  item,
  carregando,
  aoEscolher,
}: {
  item: PlataformaDaSecao;
  carregando: boolean;
  aoEscolher: (disponivel: DownloadDisponivel) => void;
}) {
  const rotulo = item.rotulo ?? rotuloPlataforma(item.plataforma);
  if (carregando) {
    return (
      <BotaoDaPagina tom="claro" disabled aria-busy>
        {rotulo}
      </BotaoDaPagina>
    );
  }
  const { disponivel } = item;
  if (!disponivel) {
    return (
      <Tooltip rotulo={`${rotulo} (em breve)`}>
        {/* o span é o alvo do teclado: botão desligado não recebe foco */}
        <span tabIndex={0} className="inline-flex rounded-xl">
          <BotaoDaPagina tom="claro" disabled aria-label={`${rotulo}, em breve`}>
            {rotulo} · em breve
          </BotaoDaPagina>
        </span>
      </Tooltip>
    );
  }
  return (
    <BotaoDaPagina tom="claro" icone={<Download size={20} />} onClick={() => aoEscolher(disponivel)}>
      {rotulo}
    </BotaoDaPagina>
  );
}

/** O cartão colorido com o app escuro saindo pela borda. */
function CartaoDaImagem({ imagem, className = "" }: { imagem: "computador" | "celular"; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[444/590] w-full max-w-[444px] overflow-hidden rounded-[64px] [container-type:inline-size] celular:aspect-[345/502] celular:max-w-[345px] celular:rounded-[50px] ${className}`}
      style={{
        background:
          imagem === "computador"
            ? "linear-gradient(180deg, rgb(var(--brand-500-rgb)) 0%, rgb(var(--brand-300-rgb)) 100%)"
            : "linear-gradient(180deg, rgb(var(--brand-600-rgb)) 0%, rgb(var(--brand-200-rgb)) 100%)",
      }}
    >
      {imagem === "computador" ? (
        /* Discord: a captura começa a ~18% da esquerda e ~7% do topo e sai pela
           direita e por baixo. 2,4cqw: a janela (48,75em) fica com ~1,17× a
           largura do cartão, cortada pela borda. */
        <div className="absolute left-[18%] top-[7%] text-[2.4cqw]">
          <JanelaDoApp className="h-[36.125em] w-[48.75em]" />
        </div>
      ) : (
        /* Discord: o telefone ocupa de 18% a 82% da largura, a 13,5% do topo, e é
           cortado embaixo. 4,26cqw: o telefone (15em) fica com 64% do cartão. */
        <div className="absolute left-[18%] top-[13.5%] text-[4.26cqw]">
          <CelularDoApp className="h-[31.25em] w-[15em]" />
        </div>
      )}
    </div>
  );
}
