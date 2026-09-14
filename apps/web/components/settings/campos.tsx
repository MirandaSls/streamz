"use client";

/**
 * Campos que as abas de conta e segurança repetem — rótulo sobre o input (a
 * refresh do Discord não usa mais caixa-alta aqui), o próprio campo de texto
 * e a linha de erro do formulário.
 *
 * Não entram em `ui/controls.tsx` de propósito: aquele arquivo é o vocabulário
 * de formulário do app inteiro (seção, interruptor, deslizador, escolha) — o
 * componente genérico de campo do Discord (`container__5a838`, com rótulo,
 * descrição, controle horizontal para interruptor e divisor entre seções)
 * mora lá, não aqui. Estes dois só servem aos formulários de credencial (nome
 * de exibição, e-mail, senha…), como `<input>` puro.
 *
 * Medidas do campo de texto em si (`wrapper__72c38`, `css-bruto/
 * 584159.8b55c6d9ab0a575c.css`, a implementação do `TextInput` do Discord):
 *
 *   estado          | borda                         | fundo                             | texto
 *   ----------------|-------------------------------|------------------------------------|----------------------------
 *   padrão          | --input-border-default        | --input-background-default        | --input-text-default
 *   hover           | --input-border-hover           | (igual)                            | (igual)
 *   foco            | --input-border-active          | (igual)                            | (igual)
 *   erro            | --input-border-error-default   | --input-background-error-default  | --input-text-error-default
 *   somente leitura | --input-border-readonly        | (igual ao padrão)                  | (igual ao padrão)
 *   desabilitado    | opacity:.5, cursor:not-allowed — por cima de qualquer um dos de cima
 *
 * `--input-border-hover` tem o mesmo valor de `--input-border-default` nos 4
 * temas medidos (`VARIAVEIS.md` linhas 85-86: `#9696a033 | #9696a066 |
 * #9696a033 | #96969f3d` nas duas linhas) — no Discord o hover de um campo de
 * texto não muda de cor. Por isso não existe aqui uma classe `hover:` que não
 * faria nada; documentado para quem portar Ash/Onyx (onda 9) não achar que
 * foi esquecido.
 *
 * O foco (borda para `--input-border-active`, que é marca e por isso vira
 * limão) é a regra global de `app/globals.css` (`input:focus-visible`), que já
 * se aplica a qualquer `<input>`/`<textarea>` do app — uma borda de foco
 * própria aqui duplicaria a regra.
 */

/**
 * As três combinações de borda/fundo/texto do campo, por estado — cada uma
 * completa, e nunca duas juntas na mesma className: misturar
 * `border-input-border-default` e `border-input-border-error-default` numa só
 * string não garante qual das duas vence (o Tailwind ordena pelo CSS gerado,
 * não pela ordem da string), então cada estado usa só uma.
 */
const CAMPO_CORES_PADRAO =
  "border-input-border-default bg-input-background-default text-input-text-default";
const CAMPO_CORES_ERRO =
  "border-input-border-error-default bg-input-background-error-default text-input-text-error-default";
const CAMPO_CORES_SOMENTE_LEITURA =
  "border-input-border-readonly bg-input-background-default text-input-text-default";

/**
 * O resto da forma do campo — altura, raio, tipografia — comum aos três
 * estados de cor. `disabled:opacity-50` é medido (`wrapper__72c38[data-
 * disabled=true]{cursor:not-allowed;opacity:.5}`, mesmo arquivo); antes deste
 * cartão era `opacity-60`, sem origem.
 */
const CAMPO_BASE =
  "h-10 w-full rounded-lg border px-2.5 text-text-md outline-none transition-colors duration-100 placeholder:text-input-placeholder-text-default disabled:cursor-not-allowed disabled:opacity-50 celular:h-[48px] celular:text-[max(16px,1em)]";

/**
 * Aparência de todo campo de texto das configurações no estado padrão — as
 * mesmas medidas e tokens do primitivo `TextInput`/`TextArea`
 * (`ui/primitivos/TextInput.tsx`, cartão 0.4-campos), como classe solta
 * porque `CampoDeTexto` é um `<input>` plano (sem prefixo/sufixo) e não
 * precisa do wrapper flexbox do primitivo: o próprio elemento leva borda,
 * fundo e padding. Exportada por compatibilidade — `CampoDeTexto` monta a
 * classe estado a estado (ver `CAMPO_CORES_*` acima) para poder trocar só a
 * borda/fundo/texto em erro ou somente leitura sem duplicar o resto da forma.
 *
 * 40 de altura, raio 8 (`--radius-sm`, medido em `wrapper__72c38`), borda 1px
 * `--input-border-default`, fundo `--input-background-default`, texto 16px
 * (`text-text-md` — a refresh não usa mais 14 no campo).
 */
export const ESTILO_CAMPO = `${CAMPO_BASE} ${CAMPO_CORES_PADRAO}`;

export const ESTILO_AREA =
  "w-full resize-none rounded-lg border border-input-border-default bg-input-background-default p-2.5 text-text-md text-input-text-default outline-none transition-colors duration-100 placeholder:text-input-placeholder-text-default disabled:cursor-not-allowed disabled:opacity-50 celular:text-[max(16px,1em)]";

/**
 * Rótulo acima de um campo — a mesma medida do `<label>` do primitivo
 * `Campo`: 16px peso 500 `--text-strong`, 8 até o controle (medido em
 * `container__5a838[data-layout=vertical] .labelContainer__5a838{margin-
 * bottom:var(--space-8)}`, mesma família de classes do campo — 8px). A
 * refresh do Discord aboliu a caixa-alta que este rótulo tinha (era
 * `text-xs uppercase text-text-subtle`, do sistema antigo); o nome
 * `ESTILO_ROTULO` ficou por compatibilidade com os 11 consumidores, mas
 * caixa-alta não é mais o que faz.
 */
export const ESTILO_ROTULO = "mb-2 block text-text-md font-medium text-text-strong";

export function CampoDeTexto({
  id,
  rotulo,
  value,
  onChange,
  type = "text",
  autoComplete,
  disabled,
  somenteLeitura,
  invalido,
  placeholder,
  maxLength,
}: {
  id: string;
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  /**
   * Também cobre "carregando": os consumidores (`ContaTab`, `SegurancaTab`)
   * já passam `disabled={ocupado}` enquanto o formulário salva — não existe
   * token de spinner no `TextInput` do Discord, então "campo ocupado" e
   * "campo desabilitado" são o mesmo estado visual lá também.
   */
  disabled?: boolean;
  /**
   * Campo visível mas não editável porque quem olha não tem permissão de
   * alterar — o `[data-read-only=true]` do `TextInput` do Discord: só a
   * borda muda (`--input-border-readonly`, um branco/preto a 8%/4%), sem
   * esmaecer texto nem trocar o cursor. Ao contrário de `disabled`
   * (opacidade .5 inteira), o valor continua lido com conforto — é a
   * diferença entre "você não pode mexer nisto agora" e "isto não é seu".
   */
  somenteLeitura?: boolean;
  /**
   * Realça o campo quando o valor não passou na validação — a mesma borda,
   * fundo e cor de texto do `[data-error=true]` do Discord. A mensagem em
   * si continua um `<Erro>` à parte, logo abaixo: este prop só cuida do
   * contorno do campo, para quando o erro é claramente de UM campo (e não
   * de um par, como a troca de e-mail, que valida e-mail + senha juntos e
   * hoje mostra um `<Erro>` só depois dos dois).
   */
  invalido?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const cores = invalido
    ? CAMPO_CORES_ERRO
    : somenteLeitura
      ? CAMPO_CORES_SOMENTE_LEITURA
      : CAMPO_CORES_PADRAO;
  return (
    <>
      {/* O rótulo some junto com o campo quando a linha inteira está
          desabilitada (medido: `container__5a838[data-disabled=true]
          .label__5a838{opacity:.5}`) — não quando é só somente-leitura, que
          no Discord não esmaece nada fora da borda. */}
      <label htmlFor={id} className={`${ESTILO_ROTULO} ${disabled ? "opacity-50" : ""}`}>
        {rotulo}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        readOnly={somenteLeitura}
        aria-invalid={invalido ? "true" : undefined}
        aria-readonly={somenteLeitura ? "true" : undefined}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`mb-3 ${CAMPO_BASE} ${cores}`}
      />
    </>
  );
}

export function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  // `--text-feedback-critical`, não `--status-danger`: aquele é o vermelho de
  // botão/estado destrutivo; este é o vermelho de texto de erro sobre fundo
  // escuro (é o mesmo token do erro do primitivo `Campo` e do asterisco de
  // obrigatório — ver `ui/primitivos/TextInput.tsx`). 12px (`text-text-xs`),
  // não 14: é o tamanho do texto de ajuda/erro sob um campo no Discord
  // (medido em `.linkFormHelp_edf95e{font-size:12px}` e `.errorText_edf95e`,
  // mesmo bloco de classes, `css-bruto/308378.8331594428965221.css`) — antes
  // deste cartão era `text-text-sm` (14px), sem origem.
  return (
    <p role="alert" aria-live="polite" className="mb-3 text-text-xs text-text-feedback-critical">
      {texto}
    </p>
  );
}
