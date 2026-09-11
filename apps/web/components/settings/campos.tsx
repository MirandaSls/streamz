"use client";

/**
 * Campos que as abas de conta e segurança repetem — rótulo sobre o input (a
 * refresh do Discord não usa mais caixa-alta aqui), e a linha de erro do
 * formulário.
 *
 * Não entram em `ui/controls.tsx` de propósito: aquele arquivo é o vocabulário
 * de formulário do app inteiro (seção, interruptor, deslizador, escolha). Estes
 * dois só servem aos formulários de credencial.
 */

/**
 * Aparência de todo campo de texto das configurações — as mesmas medidas e
 * tokens do primitivo `TextInput`/`TextArea` (`ui/primitivos/TextInput.tsx`,
 * cartão 0.4-campos), como classe solta porque `CampoDeTexto` é um `<input>`
 * plano (sem prefixo/sufixo) e não precisa do wrapper flexbox do primitivo: o
 * próprio elemento leva borda, fundo e padding, o que também deixa o outline
 * de foco de `globals.css` (`--input-border-active`, colado) encostar direto
 * na borda visível, sem o vão de um invólucro por cima.
 *
 * 40 de altura, raio 8 (`--radius-sm`), borda 1px `--input-border-default`,
 * fundo `--input-background-default`, texto 16px (`text-text-md` — a refresh
 * não usa mais 14 no campo). Sem `focus:border-*` aqui: o foco é
 * `globals.css`, que já se aplica a qualquer `input`/`textarea` do app; uma
 * borda de foco própria duplicaria a regra. Quem precisa de `<textarea>` usa
 * `ESTILO_AREA`.
 */
export const ESTILO_CAMPO =
  "h-10 w-full rounded-lg border border-input-border-default bg-input-background-default px-2.5 text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default disabled:cursor-not-allowed disabled:opacity-60 celular:h-[48px] celular:text-[max(16px,1em)]";

export const ESTILO_AREA =
  "w-full resize-none rounded-lg border border-input-border-default bg-input-background-default p-2.5 text-text-md text-input-text-default outline-none placeholder:text-input-placeholder-text-default disabled:cursor-not-allowed disabled:opacity-60 celular:text-[max(16px,1em)]";

/**
 * Rótulo acima de um campo — a mesma medida do `<label>` do primitivo
 * `Campo`: 16px peso 500 `--text-strong`, 8 até o controle. A refresh do
 * Discord aboliu a caixa-alta que este rótulo tinha (era `text-xs uppercase
 * text-text-subtle`, do sistema antigo); o nome `ESTILO_ROTULO` ficou por
 * compatibilidade com os 11 consumidores, mas caixa-alta não é mais o que faz.
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
  placeholder,
  maxLength,
}: {
  id: string;
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <>
      <label htmlFor={id} className={ESTILO_ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`mb-3 ${ESTILO_CAMPO}`}
      />
    </>
  );
}

export function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  // `--text-feedback-critical`, não `--status-danger`: aquele é o vermelho de
  // botão/estado destrutivo; este é o vermelho de texto de erro sobre fundo
  // escuro (é o mesmo token do erro do primitivo `Campo` e do asterisco de
  // obrigatório — ver `ui/primitivos/TextInput.tsx`).
  return (
    <p role="alert" aria-live="polite" className="mb-3 text-text-sm text-text-feedback-critical">
      {texto}
    </p>
  );
}
