"use client";

import type { CSSProperties } from "react";
import Marca from "@/components/ui/Marca";
import { Hash, Plus, Volume2 } from "@/components/ui/icones";

/**
 * A "imagem do app" da página de download, desenhada em HTML com os tokens.
 *
 * O Discord usa uma captura real (janela de desktop + telefone com uma chamada,
 * cheia de personagens dele). Aqui não há binário a versionar nem conteúdo de
 * terceiros: é o shell do Streamz reduzido a blocos — rail, coluna de canais,
 * chat e composer — com o símbolo no lugar do servidor ativo. As linhas de
 * mensagem são barras, não texto inventado.
 *
 * **Tudo em `em`.** Quem usa define o `font-size` do contêiner (em `cqw`, em
 * cima de um `container-type: inline-size`), e o desenho inteiro escala junto,
 * sem JS medindo a largura. A grade de desenho é a da captura: 1em = 16px
 * quando a composição mede 944px de largura (a do Discord no desktop).
 *
 * `aria-hidden`: é ilustração. Quem lê a página por leitor de tela não perde
 * nada que o texto ao lado não diga.
 */

/** Uma mensagem de mentira: avatar + nome + uma ou duas linhas de barra. */
function Mensagem({
  corDoAvatar,
  nome,
  linhas,
}: {
  corDoAvatar: string;
  nome: string;
  linhas: string[];
}) {
  return (
    <div className="flex gap-[0.75em] px-[1em] py-[0.5em]">
      <span className={`h-[2.5em] w-[2.5em] shrink-0 rounded-full ${corDoAvatar}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-[0.4em] pt-[0.15em]">
        <span className={`h-[0.7em] rounded-full bg-text-strong/80 ${nome}`} />
        {linhas.map((largura, i) => (
          <span key={i} className={`h-[0.6em] rounded-full bg-background-mod-strong ${largura}`} />
        ))}
      </div>
    </div>
  );
}

/** A janela do app de desktop: 780×578 na grade de desenho. */
export function JanelaDoApp({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`flex flex-col overflow-hidden rounded-[0.75em] border border-border-subtle bg-background-base-lowest shadow-shadow-high ${className}`}
    >
      {/* barra de título */}
      <div className="flex h-[1.75em] shrink-0 items-center justify-center gap-[0.4em] text-text-muted">
        <Marca size={11} className="h-[0.7em] w-auto text-brand-500" />
        <span className="h-[0.45em] w-[4em] rounded-full bg-background-mod-strong" />
      </div>
      <div className="flex min-h-0 flex-1">
        {/* rail */}
        <div className="flex w-[4.5em] shrink-0 flex-col items-center gap-[0.5em] pt-[0.25em]">
          <span className="grid h-[3em] w-[3em] place-items-center rounded-[1em] bg-brand-500 text-control-primary-text-default">
            <Marca size={20} className="h-[1.4em] w-auto" />
          </span>
          <span className="h-[0.125em] w-[2em] rounded-full bg-border-subtle" />
          {["bg-background-surface-higher", "bg-background-surface-highest", "bg-background-surface-higher"].map(
            (cor, i) => (
              <span key={i} className={`h-[3em] w-[3em] rounded-full ${cor}`} />
            ),
          )}
          <span className="grid h-[3em] w-[3em] place-items-center rounded-full bg-background-surface-higher text-text-feedback-positive">
            <Plus size="1.25em" />
          </span>
        </div>
        {/* coluna de canais */}
        <div className="flex w-[15em] shrink-0 flex-col rounded-tl-[0.5em] border-l border-t border-border-subtle bg-background-base-lower">
          <div className="flex h-[3em] shrink-0 items-center border-b border-border-subtle px-[1em]">
            <span className="h-[0.75em] w-[7em] rounded-full bg-text-strong/80" />
          </div>
          <div className="flex flex-col gap-[0.15em] px-[0.5em] pt-[1em]">
            <span className="mb-[0.4em] ml-[0.5em] h-[0.5em] w-[5em] rounded-full bg-background-mod-strong" />
            {[
              { ativo: true, largura: "w-[3em]" },
              { ativo: false, largura: "w-[5em]" },
              { ativo: false, largura: "w-[4em]" },
            ].map((canal, i) => (
              <div
                key={i}
                className={`flex h-[2em] items-center gap-[0.4em] rounded-[0.4em] px-[0.5em] ${
                  canal.ativo ? "bg-interactive-background-selected text-text-strong" : "text-channel-icon"
                }`}
              >
                <Hash size="1.1em" />
                <span
                  className={`h-[0.55em] rounded-full ${canal.largura} ${
                    canal.ativo ? "bg-text-strong/80" : "bg-background-mod-strong"
                  }`}
                />
              </div>
            ))}
            <span className="mb-[0.4em] ml-[0.5em] mt-[1em] h-[0.5em] w-[5em] rounded-full bg-background-mod-strong" />
            <div className="flex h-[2em] items-center gap-[0.4em] px-[0.5em] text-channel-icon">
              <Volume2 size="1.1em" />
              <span className="h-[0.55em] w-[4.5em] rounded-full bg-background-mod-strong" />
            </div>
            {["bg-brand-500", "bg-background-surface-highest"].map((cor, i) => (
              <div key={i} className="flex h-[1.75em] items-center gap-[0.5em] pl-[2em]">
                <span className={`h-[1.25em] w-[1.25em] rounded-full ${cor}`} />
                <span className="h-[0.5em] w-[3.5em] rounded-full bg-background-mod-strong" />
              </div>
            ))}
          </div>
          {/* painel do usuário */}
          <div className="mt-auto flex h-[3.5em] items-center gap-[0.5em] border-t border-border-subtle px-[0.75em]">
            <span className="h-[2em] w-[2em] rounded-full bg-background-surface-highest" />
            <span className="h-[0.6em] w-[5em] rounded-full bg-background-mod-strong" />
          </div>
        </div>
        {/* chat */}
        <div className="flex min-w-0 flex-1 flex-col border-t border-border-subtle bg-background-base-lower">
          <div className="flex h-[3em] shrink-0 items-center gap-[0.4em] border-b border-border-subtle px-[1em] text-channel-icon">
            <Hash size="1.25em" />
            <span className="h-[0.7em] w-[3.5em] rounded-full bg-text-strong/80" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden pb-[0.5em]">
            <Mensagem corDoAvatar="bg-brand-500" nome="w-[5em]" linhas={["w-[70%]"]} />
            <Mensagem corDoAvatar="bg-background-surface-highest" nome="w-[4em]" linhas={["w-[55%]", "w-[35%]"]} />
            <Mensagem corDoAvatar="bg-text-feedback-info" nome="w-[6em]" linhas={["w-[80%]"]} />
            <Mensagem corDoAvatar="bg-brand-500" nome="w-[5em]" linhas={["w-[45%]"]} />
          </div>
          <div className="mx-[1em] mb-[1em] flex h-[2.75em] shrink-0 items-center gap-[0.6em] rounded-[0.5em] bg-background-base-low px-[0.75em] text-text-muted">
            <Plus size="1.25em" />
            <span className="h-[0.55em] w-[8em] rounded-full bg-background-mod-strong" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** O telefone: 240×500 na grade de desenho. */
export function CelularDoApp({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`flex flex-col overflow-hidden rounded-[2em] border-[0.375em] border-background-surface-highest bg-background-base-lower shadow-shadow-high ${className}`}
    >
      <div className="flex h-[3.25em] shrink-0 items-center gap-[0.4em] border-b border-border-subtle bg-background-base-lowest px-[0.9em] text-channel-icon">
        <Hash size="1.2em" />
        <span className="h-[0.65em] w-[3.5em] rounded-full bg-text-strong/80" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <Mensagem corDoAvatar="bg-background-surface-highest" nome="w-[4em]" linhas={["w-[85%]"]} />
        <Mensagem corDoAvatar="bg-brand-500" nome="w-[3.5em]" linhas={["w-[70%]", "w-[40%]"]} />
        <Mensagem corDoAvatar="bg-text-feedback-info" nome="w-[4.5em]" linhas={["w-[60%]"]} />
      </div>
      <div className="flex shrink-0 items-center gap-[0.5em] px-[0.75em] pb-[1.25em] pt-[0.5em] text-text-muted">
        <span className="grid h-[2.25em] w-[2.25em] shrink-0 place-items-center rounded-full bg-background-base-low">
          <Plus size="1.1em" />
        </span>
        <span className="h-[2.25em] flex-1 rounded-full bg-background-base-low" />
      </div>
    </div>
  );
}

/**
 * Janela + telefone, na posição da captura do Discord
 * (`desktop/15-download-inteira.png`, reduzida a 1/4): a janela ocupa x=240–1020
 * e y=722–1300 (CSS), o telefone x=944–1184 e y=880–1380. A caixa das duas vai
 * de x=240 a 1184 (944) e de y=722 a 1380 (658). As porcentagens abaixo são
 * essas coordenadas dentro da caixa. Medido na imagem reduzida: ±2px.
 */
export function ComposicaoDoApp({ className = "" }: { className?: string }) {
  return (
    <div className={`relative aspect-[944/658] w-full [container-type:inline-size] ${className}`}>
      {/* 16/944 = 1,695cqw: 1em = 16px quando a caixa mede 944 */}
      <div className="absolute inset-0 text-[1.695cqw]">
        <JanelaDoApp className="absolute left-0 top-0 h-[87.8%] w-[82.6%]" />
        <CelularDoApp className="absolute left-[74.6%] top-[24%] h-[76%] w-[25.4%]" />
      </div>
    </div>
  );
}
