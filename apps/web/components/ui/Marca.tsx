import { useId } from "react";

/**
 * Símbolo da marca Streamz: o balão de fala com o "Z" recortado. Mesmo desenho
 * de `docs/branding/marca/logo-simbolo-limao.svg` — se o traço mudar, mude lá
 * primeiro, que é a fonte da verdade do pacote.
 *
 * O recorte sai por máscara, e não por `fill-rule="evenodd"`, porque as três
 * formas do "Z" se sobrepõem: com evenodd a sobreposição voltaria a preencher e
 * apareceria uma cunha dentro da barra. A máscara também é o que deixa o buraco
 * de fato transparente, para o símbolo herdar a cor do contexto por
 * `currentColor` em vez de carregar um fundo próprio.
 */
export default function Marca({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // vários símbolos podem coexistir na tela; o id da máscara precisa ser único
  const mascara = useId();
  return (
    <svg
      width={size}
      height={(size * 256) / 240}
      viewBox="0 0 240 256"
      aria-hidden="true"
      className={className}
    >
      <mask id={mascara}>
        <rect width="240" height="256" fill="#000" />
        <path
          fill="#fff"
          d="M40 24 H200 A16 16 0 0 1 216 40 V176 A16 16 0 0 1 200 192 H128 L84 232 V192 H40 A16 16 0 0 1 24 176 V40 A16 16 0 0 1 40 24 Z"
        />
        <rect x="72" y="66" width="96" height="24" fill="#000" />
        <polygon points="140,66 168,66 100,150 72,150" fill="#000" />
        <rect x="72" y="126" width="96" height="24" fill="#000" />
      </mask>
      <rect width="240" height="256" fill="currentColor" mask={`url(#${mascara})`} />
    </svg>
  );
}
