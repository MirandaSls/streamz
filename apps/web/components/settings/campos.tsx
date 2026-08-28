"use client";

/**
 * Campos que as abas de conta e segurança repetem — rótulo em caixa-alta sobre
 * o input, e a linha de erro do formulário.
 *
 * Não entram em `ui/controls.tsx` de propósito: aquele arquivo é o vocabulário
 * de formulário do app inteiro (seção, interruptor, deslizador, escolha). Estes
 * dois só servem aos formulários de credencial.
 */

/**
 * Aparência de todo campo de texto das configurações.
 *
 * Mora aqui como constante, e não como classe repetida em cada aba, porque o
 * estado de foco é a única pista de "onde estou digitando" numa tela sem
 * contorno: um `bg-rail` sem borda deixa o campo indistinguível do fundo e o
 * foco invisível. Quem precisa de `<textarea>` usa `ESTILO_AREA`.
 */
export const ESTILO_CAMPO =
  "h-10 w-full rounded-[3px] border border-border bg-input px-2.5 text-sm text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";

export const ESTILO_AREA =
  "w-full resize-none rounded-[3px] border border-border bg-input p-2.5 text-sm text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";

/** Rótulo em caixa-alta acima de um campo. */
export const ESTILO_ROTULO =
  "mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary";

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
  return (
    <p role="alert" aria-live="polite" className="mb-3 text-sm text-red">
      {texto}
    </p>
  );
}
