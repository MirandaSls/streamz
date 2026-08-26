/**
 * Marca do Concord: o perfil do corvo. Mesmo desenho de `apps/desktop/logo.svg`
 * (fonte dos ícones do app) e de `app/icon.svg` (favicon) — se mudar o traço,
 * mude nos três. Aqui sem fundo, para herdar a cor do contexto via `currentColor`.
 */
export default function Corvo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10 96C14 80 22 70 22 54 22 36 32 20 48 18c8-1 16 2 22 8l29 21c1 .8 1 2 0 2.6L72 46c-1 4-5 9-10 12l5 6-6 3 5 7c-2 8 4 16 12 22ZM54 33.5a3.5 3.5 0 1 0 0-7.0 3.5 3.5 0 0 0 0 7.0Z"
      />
    </svg>
  );
}
