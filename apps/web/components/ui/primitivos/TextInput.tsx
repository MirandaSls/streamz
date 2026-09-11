"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { X } from "@/components/ui/icones";

/**
 * Campos de formulário do Discord (refresh 2025).
 *
 * Medido (cartão 0.4-campos):
 * - TextInput `md` 40 de altura (`sm` 32 — a busca da lista de membros,
 *   `.searchBar_c322aa`), raio 8 (`--radius-sm`), borda 1px
 *   `--input-border-default` (hover igual — o Discord não muda a borda no
 *   hover), fundo `--input-background-default`, texto 16/20 (`text-text-md`)
 *   `--input-text-default`, placeholder `--input-placeholder-text-default`.
 *   O foco não é responsabilidade daqui: `globals.css` já poe outline de 1px
 *   colado (`--input-border-active`, limão) em todo `input`/`textarea` do
 *   app — este componente não repete a regra.
 *   Padding lateral **sem** sufixo: 10px (`px-2.5`), não 12 — é o mesmo
 *   `padding-inline: 10px …` de `.input_fffc15` (`css-bruto/730931.*.css`) e
 *   `.base_f89b2c` (`sob-demanda/7a89de758a772c46.css`), que só zeram o lado
 *   do botão quando há um; sem botão os dois lados ficam iguais. A caixa
 *   (raio/altura/borda) é `.container_f89b2c` no mesmo arquivo sob-demanda.
 *   Erro: borda `--input-border-error-default`, fundo
 *   `--input-background-error-default`.
 * - Prefixo (ícone à esquerda) e sufixo/limpar (à direita) aqui são irmãos
 *   flexbox com `gap-2` (8, a escala de espaçamento do resto do app — **não**
 *   é medida do Discord). O Discord absolutiza o ícone/botão por cima do
 *   texto com `padding-inline: 48px 36px` (`sob-demanda/99d7da090ff5cf77.css`),
 *   mas esse número é o tamanho exato do botão de emoji + "×" daquele campo
 *   de status específico — não generaliza para um `prefixo`/`sufixo`
 *   arbitrário deste primitivo, então não foi copiado.
 * - TextArea: sem borda própria no `<textarea>` — a borda e o fundo ficam no
 *   invólucro, como no Discord (`.textArea_fcde1f`, `css-bruto/142753.*.css`);
 *   padding 12×10 (vertical×horizontal), `resize: none` por padrão; contador
 *   em 12px `font-code` `--text-muted` no canto inferior direito (12 de
 *   baixo, 14 da direita — `.maxLength_fcde1f`), que vira
 *   `--text-feedback-critical` ao estourar (`.errorOverflow_fcde1f`).
 * - Campo (rótulo + descrição + erro), `.legend_b717a1`
 *   (`sob-demanda/355502.*.css`): rótulo 16px peso 500 `--text-strong`, **sem
 *   caixa-alta** (a refresh aboliu), 8 até o controle; obrigatório = asterisco
 *   DEPOIS do rótulo em `--text-feedback-critical` com 4 de recuo
 *   (`.required_b717a1`); erro abaixo do controle em 12px itálico peso 500
 *   `--text-feedback-critical` (`.errorMessage_b717a1`); descrição (hint)
 *   14px `--text-muted`, 4 de distância até o controle — não achei a classe
 *   da descrição no mesmo arquivo que `legend_b717a1` (só o módulo de
 *   tipografia leva o hash `_b717a1`), mas 14px `--text-muted` é o padrão que
 *   se repete no CSS bruto para texto secundário abaixo de um rótulo
 *   (`.subText_f0c2ea`, `.discriminator__24091`, `.groupLabel_c1e9c4`).
 * - Sem print 1:1 desta tela específica entre as capturas de
 *   `docs/Reference/`: a única com campo de texto medível (Adicionar amigo,
 *   `2026-08-31 124052.png`) é um componente à parte
 *   (`.addFriendInputWrapper__72ba7`, raio **16**, caixa maior), não o
 *   `TextInput` genérico — não serve de referência para as medidas acima.
 * - Celular: `celular:h-[48px]` no `md` (alvo de toque), e 16px de fonte
 *   mínima (evita o zoom do Safari — já é global).
 *
 * Rodada de correção (cartão c4-campos, sem medida nova — só o que a
 * migração pediu):
 * - `Campo.ajuda` é o texto muted DEPOIS do controle que BanModal, KickModal
 *   e `settings/AplicativosTab.tsx` escreviam à mão ao lado do `TextInput`;
 *   `Campo.descricao` continua sendo o que vem ANTES.
 * - O erro de `Campo` ganhou `role="alert"`/`aria-live="polite"` embutidos —
 *   `app/reset-password/page.tsx` duplicava um `<p sr-only>` só para isso.
 * - `Campo.rotuloDiscreto` troca só o tamanho do rótulo (16px → 14px); peso e
 *   caixa (nenhuma) continuam os mesmos dos dois tamanhos.
 * - `semCaixa` (`TextInput`/`TextArea`) tira fundo e borda do invólucro para
 *   a tela desenhar os dela em `classeDaCaixa` sem `!important` — o caso de
 *   `chat/HeaderBar.tsx` e `layout/DMList.tsx`, que hoje usam `!bg-…`/`!border-…`
 *   porque duas classes Tailwind de mesma especificidade (a daqui e a da
 *   tela) empatam por ordem do stylesheet gerado, não pela ordem no
 *   `className` — `classeDaCaixa` já ser o último no template não é garantia.
 * - `tamanho` de `TextInput` aceita número (px) além de `sm`/`md` — a busca
 *   de 36 e a caixa composta de 58 que apareceram na migração não tinham
 *   classe Tailwind pronta; vira `style.height`, não `h-[Npx]` calculado em
 *   runtime (o scanner do Tailwind só gera a utility que aparece literal no
 *   código-fonte, não um valor que só existe depois de renderizado).
 */
export type TamanhoDeCampo = "sm" | "md";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  /**
   * `md` 40 (padrão), `sm` 32, ou um número em px.
   *
   * O número é para medida que não é `sm`/`md` e não tem classe Tailwind
   * pronta no projeto — a busca de 36 e a caixa composta de 58 que apareceram
   * na migração (cartão c4-campos). Vira `style.height` no invólucro, não
   * classe: uma altura calculada em runtime (`h-[${tamanho}px]`) não é
   * reconhecida pelo scanner do Tailwind, que só gera a utility que aparece
   * literalmente no código-fonte.
   */
  tamanho?: TamanhoDeCampo | number;
  erro?: boolean;
  /** Ícone ou elemento à esquerda, dentro da caixa. */
  prefixo?: ReactNode;
  /** Ícone ou botão à direita, dentro da caixa. */
  sufixo?: ReactNode;
  /** Com valor não vazio, mostra o "×" à direita e chama isto ao clicar. */
  aoLimpar?: () => void;
  /** Classe da caixa externa (a do `<input>` é `className`); já vai por
   *  último na `className` do invólucro, então uma classe daqui vence uma
   *  classe interna de mesma especificidade sem precisar de `!important`. */
  classeDaCaixa?: string;
  /**
   * Não desenha fundo nem borda própria — para a tela compor os dela
   * (ex.: busca que precisa herdar um fundo diferente de `--input-*`) sem
   * depender de `!important` em `classeDaCaixa` quando a ordem de classes
   * não basta (mesma especificidade, ordem definida pelo Tailwind no
   * stylesheet gerado, não pela ordem no atributo `className`).
   */
  semCaixa?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { tamanho = "md", erro = false, prefixo, sufixo, aoLimpar, classeDaCaixa = "", semCaixa = false, className = "", ...resto },
  ref,
) {
  return (
    <div
      style={typeof tamanho === "number" ? { height: tamanho } : undefined}
      /* o foco é a borda DA CAIXA mudando de cor (o `<input>` é só o miolo, e o
         anel nele aparecia flutuando por dentro — ver `data-sem-anel` no
         globals.css) */
      className={`flex items-center gap-2 rounded-lg px-2.5 has-[:focus-visible]:border-input-border-active has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
        semCaixa ? "" : "border"
      } ${
        typeof tamanho === "number" ? "" : tamanho === "sm" ? "h-[32px]" : "h-[40px] celular:h-[48px]"
      } ${
        semCaixa
          ? ""
          : erro
            ? "border-input-border-error-default bg-input-background-error-default"
            : "border-input-border-default bg-input-background-default"
      } ${classeDaCaixa}`}
    >
      {prefixo}
      <input
        ref={ref}
        data-sem-anel
        aria-invalid={erro || undefined}
        className={`min-w-0 flex-1 bg-transparent text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default ${className}`}
        {...resto}
      />
      {aoLimpar && resto.value ? (
        <button
          type="button"
          onClick={aoLimpar}
          aria-label="Limpar"
          className="shrink-0 text-interactive-text-default transition-colors hover:text-interactive-text-hover"
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
      {sufixo}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  erro?: boolean;
  /** Mostra "n / máx" no canto (exige `maxLength`). */
  contador?: boolean;
  redimensionavel?: boolean;
  /** Classe da caixa externa; já vai por último — ver `TextInputProps.classeDaCaixa`. */
  classeDaCaixa?: string;
  /** Não desenha fundo nem borda própria — ver `TextInputProps.semCaixa`. */
  semCaixa?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { erro = false, contador = false, redimensionavel = false, classeDaCaixa = "", semCaixa = false, className = "", ...resto },
  ref,
) {
  const n = typeof resto.value === "string" ? resto.value.length : 0;
  const restante = typeof resto.maxLength === "number" ? resto.maxLength - n : null;
  return (
    <div
      className={`relative rounded-lg has-[:focus-visible]:border-input-border-active has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
        semCaixa ? "" : "border"
      } ${
        semCaixa
          ? ""
          : erro
            ? "border-input-border-error-default bg-input-background-error-default"
            : "border-input-border-default bg-input-background-default"
      } ${classeDaCaixa}`}
    >
      <textarea
        ref={ref}
        data-sem-anel
        aria-invalid={erro || undefined}
        className={`block w-full bg-transparent px-2.5 py-3 text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default ${
          redimensionavel ? "resize-y" : "resize-none"
        } ${className}`}
        {...resto}
      />
      {contador && resto.maxLength ? (
        <span
          className={`pointer-events-none absolute bottom-3 right-3.5 font-mono text-text-xs ${
            restante !== null && restante < 0 ? "text-text-feedback-critical" : "text-text-muted"
          }`}
        >
          {restante}
        </span>
      ) : null}
    </div>
  );
});

export interface CampoProps {
  rotulo: ReactNode;
  /** `id` do controle, para o `<label htmlFor>`. */
  htmlFor?: string;
  /** Descrição ACIMA do controle (o hint do Discord, 14px). */
  descricao?: ReactNode;
  /**
   * Ajuda DEPOIS do controle — o texto muted que BanModal, KickModal e
   * AplicativosTab escreviam à mão como `<p className="mt-1 text-xs
   * text-text-muted">` ao lado do `TextInput`/`TextArea`; migrar para cá
   * evita reimplementar o espaçamento em cada tela.
   */
  ajuda?: ReactNode;
  /** Mensagem de erro abaixo do controle; `null`/vazio esconde. */
  erro?: string | null;
  /**
   * Rótulo pequeno (14px, `text-text-sm`) em vez do padrão do Discord (16px,
   * `text-text-md`) — o peso (500) e a ausência de caixa-alta são os mesmos
   * nos dois tamanhos; a refresh do Discord aboliu a caixa-alta.
   */
  rotuloDiscreto?: boolean;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
}

export function Campo({
  rotulo,
  htmlFor,
  descricao,
  ajuda,
  erro,
  rotuloDiscreto = false,
  obrigatorio,
  children,
  className = "",
}: CampoProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={`mb-2 block font-medium text-text-strong ${rotuloDiscreto ? "text-text-sm" : "text-text-md"}`}
      >
        {rotulo}
        {obrigatorio ? <span className="pl-1 text-text-feedback-critical">*</span> : null}
      </label>
      {/* 4 até o controle (não os 8 do rótulo) — ver cabeçalho do arquivo */}
      {descricao ? <p className="mb-1 text-text-sm text-text-muted">{descricao}</p> : null}
      {children}
      {ajuda ? <p className="mt-1 text-text-xs text-text-muted">{ajuda}</p> : null}
      {erro ? (
        // `role="alert"` + `aria-live="polite"` embutidos: antes cada tela
        // duplicava um `<p sr-only>` ao lado para o leitor de tela anunciar
        // o erro (ver `app/reset-password/page.tsx`) — agora é uma vez só,
        // aqui, e essa duplicata pode sair de lá.
        <p
          role="alert"
          aria-live="polite"
          className="mt-1 text-text-xs font-medium italic text-text-feedback-critical"
        >
          {erro}
        </p>
      ) : null}
    </div>
  );
}
