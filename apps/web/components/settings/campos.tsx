"use client";

/**
 * Campos que as abas de conta e segurança repetem — rótulo em caixa-alta sobre
 * o input, e a linha de erro do formulário.
 *
 * Não entram em `controls.tsx` de propósito: aquele arquivo é o vocabulário das
 * nove abas de configuração (seção, interruptor, deslizador, escolha) e é
 * compartilhado com as outras frentes. Estes dois só servem aos formulários de
 * credencial.
 */

export function CampoDeTexto({
  id,
  rotulo,
  value,
  onChange,
  type = "text",
  autoComplete,
  disabled,
}: {
  id: string;
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase text-txt-secondary">
        {rotulo}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mb-3 h-10 w-full rounded-[3px] bg-rail px-2.5 text-sm text-txt-normal outline-none disabled:opacity-60"
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
