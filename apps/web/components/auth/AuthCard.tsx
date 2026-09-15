"use client";

import type { ReactNode } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import MarcaLockup from "@/components/ui/MarcaLockup";

/**
 * Moldura das telas de conta: a cena da marca cobrindo a viewport, o lockup no
 * canto da **página** e o cartão elevado no centro.
 *
 * O lockup saiu de dentro do cartão de propósito: o cartão é o formulário, e
 * repetir a marca acima do título rouba a primeira linha de leitura do que a
 * pessoa veio fazer. A marca identifica a página, não a caixa.
 *
 * Coluna única de 480px. O Discord põe o bloco de "entrar com QR Code" ao lado
 * do formulário, mas isso pressupõe um app móvel para escanear — fora do escopo
 * aqui, e um QR que não autentica ninguém seria só enfeite.
 */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  /** opcional: telas de resultado ("e-mail confirmado") são só título e texto. */
  children?: ReactNode;
}) {
  return (
    /*
      Celular (`celular:`, a variante que repete a consulta do
      `hooks/useEhMobile` — largura até 767 **ou** telefone deitado):
      - `min-h-[100dvh]` no lugar de `100vh` — `vh` é a janela **sem** a barra
        de endereço do navegador móvel, e com ela na tela sobrava uma faixa
        rolável embaixo do cartão;
      - as áreas seguras entram no padding para a marca e o cartão não caírem
        atrás do entalhe nem da barra de gestos (é o `viewportFit: "cover"` do
        `app/layout.tsx` que faz o `env()` responder alguma coisa).
      No desktop as duas são inertes: `100dvh` = `100vh` numa janela sem barra
      que some, e `env(safe-area-inset-*)` vale zero.
    */
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-input-background-default p-4 celular:px-[max(1rem,env(safe-area-inset-left))] celular:pb-[max(1rem,env(safe-area-inset-bottom))] celular:pt-[max(4.5rem,env(safe-area-inset-top))]">
      <AuthBackground />

      {/* `.logoWithText_eb4069` (`css-bruto/890901.ff4cf3f72bd01165.css`):
          `inset-inline-start: 48px; top: 48px` — o logo da página (fora do
          cartão) fica a 48px dos dois lados no desktop, não 40/32 como
          tínhamos. Tamanho: medido 24×124 no print 1:1 (`01-login-viewport.png`,
          caixa clara x 96-343 y 96-143 em 2x) contra os 23×145 que
          renderizávamos — `size` desce de 26 para 24. A largura continua
          maior que a do Discord porque "STREAMZ" tem mais glifos que
          "Discord" no mesmo peso/tracking: não é uma medida de forma errada,
          é o texto da marca sendo diferente. */}
      <MarcaLockup
        size={24}
        className="absolute left-6 top-6 text-text-strong celular:left-[max(1.5rem,env(safe-area-inset-left))] celular:top-[max(1.5rem,env(safe-area-inset-top))] md:left-12 md:top-12"
      />

      {/*
        `.authBox__921c5` (`css-bruto/858942.086f3345af1722be.css`):
        `background-color: var(--modal-background); border-radius:
        var(--radius-sm); box-shadow: var(--legacy-elevation-high); padding:
        var(--custom-auth-box-auth-box-padding) [32px]; width: 480px`.

        A largura de 480 já era a nossa — bate: é o valor BASE do
        componente, não o `.authBoxExpanded__921c5` de 784px, que só existe
        para acomodar a coluna de "Entrar com código QR"/passkey (exige um
        app móvel companheiro para escanear, que o Streamz não tem — não
        inventado aqui, ver §6.6 do PROCESSO). O que estava errado:
        - fundo `bg-background-base-lower` (#1a1a1e, medido) → agora
          `bg-modal-background` (#242429 — mesmo valor de
          `--card-background-default`, `tokens.css:335`). O campo por cima
          (`bg-input-background-default`, `#0000001f`, no `TextInput`
          primitivo) não precisa mudar de classe: compondo sobre o novo
          fundo ele já cai perto do `#202024` medido no print;
        - raio `rounded-[5px]` → `rounded-lg` (8 = `--radius-sm` na escala do
          Tailwind daqui, tabela de Raios do design.md — bate com o
          `~7-8px` medido no canto do print 1:1);
        - sombra: `--legacy-elevation-high` resolve para
          `0 2px 10px 0 hsl(0 0% 0%/.2)` (`variaveis-resolvidas.json`, tema
          escuro) — sem token gerado pra ela ainda (só este componente a
          usa), então o valor entra literal; falta ao gerador de tokens
          (`scripts/paridade/gerar-tokens.mjs`, fora desta lista)
          `--shadow-legacy-elevation-high` para isto sair de literal solto.

        Título: `.title__921c5` é `heading-xl/semibold` com `color:
        var(--text-strong)` (visto no HTML capturado de `01-login.html`) —
        troca de `text-2xl leading-8` avulso pela classe nomeada
        `text-heading-xl` (24/1.25, `tailwind.config.ts`), peso à parte.

        24px de respiro no celular: com os 32 do desktop sobram 294px de
        conteúdo numa tela de 390.

        **Sem `min-height` de propósito** (cartão textinput-e-telas-de-auth
        pediu `min-h-[540px]` no miolo, fora do celular, e não entrou): a
        regra `.authBox__921c5 .centeringWrapper__921c5{min-height:540px}` do
        mesmo `css-bruto/858942.*.css` mora dentro de `@media
        (max-width:485px)`, junto com o `authBox` de tela cheia com gradiente
        (e repete em `.is-mobile`) — no desktop o miolo só tem
        `text-align:center; width:100%`. Os prints 1:1 confirmam, escala 2:
        o cartão do login mede 864px de dispositivo = 432 CSS
        (`publico/desktop/04-esqueci-senha-erro-SIMULADO-viewport.png`, coluna
        x=700, y 468–1331) e o do reset 698 = 349 CSS
        (`03-esqueci-senha-reset-viewport.png`, coluna x=1000, y 552–1249) —
        os dois abaixo de 540, e diferentes entre si: no Discord a altura
        também muda de uma fase para outra. No celular o nosso é cartão, não
        tela cheia, então 540 ali deixaria faixa vazia visível dentro dele.
      */}
      <div className="relative w-full max-w-[480px] rounded-lg bg-modal-background p-8 shadow-[0_2px_10px_0_rgba(0,0,0,.2)] celular:p-6">
        <h1 className="text-center text-heading-xl font-semibold text-text-strong">
          {title}
        </h1>
        {/* Discord: `.text-md/normal_cf4812` do subtítulo tem `color:
            var(--text-default)` (visto no HTML capturado), não
            `--text-muted` — confirmado por cor dominante: #efeff1
            (= `--text-default`) contra os #96979e que tínhamos. */}
        {subtitle && <p className="mt-2 text-center text-text-default">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

/**
 * Rótulo de campo (cartão c5-rotulos): a refresh 2025 do Discord aboliu a
 * caixa-alta do rótulo de formulário — 16px peso 500 `--text-strong`, sem
 * transformação de caixa (mesma medida que o cabeçalho de
 * `primitivos/TextInput.tsx` documenta para `Campo`, `.legend_b717a1`). O
 * asterisco de obrigatório vem DEPOIS do rótulo em `--text-feedback-critical`,
 * com 4px de recuo (`pl-1`) — não é vermelho de erro do campo (`invalid` só
 * troca a cor do próprio rótulo, que é outra situação).
 */
export function FieldLabel({
  htmlFor,
  children,
  invalid = false,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-2 block text-text-md font-medium ${
        invalid ? "text-status-danger" : "text-text-strong"
      }`}
    >
      {children}
      {hint ? (
        <span className="italic"> - {hint}</span>
      ) : (
        <span className="pl-1 text-text-feedback-critical" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/** Rótulo de campo opcional: sem asterisco, mas com o mesmo desenho. */
export function OptionalFieldLabel({
  htmlFor,
  children,
  invalid = false,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-2 block text-text-md font-medium ${
        invalid ? "text-status-danger" : "text-text-strong"
      }`}
    >
      {children}
      {hint && <span className="italic"> - {hint}</span>}
    </label>
  );
}

// Link estilizado como o botão primário (páginas de resultado — confirmar
// e-mail, redefinir senha — que só têm "Voltar para o app" como `<Link>`,
// sem `<button>` de verdade; por isso não é o primitivo `Button`, que espera
// um clique, não uma navegação). Raio `rounded-lg` (8 = `--radius-sm`,
// `.button_a22cb0` em `css-bruto/362698.047b6f205fd7bdc1.css`), não os 3px de
// antes.
//
// `celular:h-[48px]`, e o **48 é literal**: com a raiz do app em 16px
// (ADR-0009), `h-10` mede 40px e `h-11` mede 44px — abaixo do piso de 44 das
// diretrizes de alvo de toque. 48 dá a folga que falta sem furar o piso. No
// desktop nada muda (`h-11` = 44, o mesmo botão primário do resto do app).
export const submitClass =
  "h-11 w-full rounded-lg bg-brand-500 font-medium text-control-primary-text-default transition hover:bg-control-primary-background-hover disabled:cursor-not-allowed disabled:opacity-60 celular:h-[48px]";

/** Link de apoio dos formulários de conta (voltar, ajuda, alternativas). */
export const linkClass = "font-medium text-text-link hover:underline";
