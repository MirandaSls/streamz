"use client";

import type { CSSProperties } from "react";
import Marca from "./Marca";

/**
 * A marca do Streamz respirando — o que o Discord mostra enquanto o app abre e
 * enquanto ele se atualiza.
 *
 * **Não é um spinner.** Um spinner diz "espere"; isto diz "está vivo". O
 * símbolo sobe e desce devagar, com uma escala mínima, e a sombra embaixo
 * encolhe e clareia quando ele sobe — é o que dá a impressão de peso em vez de
 * um logo piscando. Nada gira.
 *
 * O desenho não é recriado aqui: é o mesmo `Marca` (que já traz o balão com o
 * "Z" recortado por máscara, herdando a cor por `currentColor`). Duplicar a
 * geometria significaria duas fontes da verdade para o mesmo traço, e o
 * `logo-simbolo-limao.svg` do pacote de marca já é a de cima.
 *
 * A animação mora em `globals.css` (`marca-respira`), por dois motivos: o
 * `prefers-reduced-motion` do sistema a desliga lá, junto do `reduzir-movimento`
 * das configurações, e o desfoque da sombra precisa acompanhar o tamanho —
 * daí a variável `--icone-tam`.
 */
export default function IconeAnimado({
  size = 72,
  className,
}: {
  /** Largura do símbolo em px (a altura sai da proporção 240×256). */
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex flex-col items-center text-brand-500 ${className ?? ""}`}
      style={{ width: size, "--icone-tam": `${size}px` } as CSSProperties}
    >
      <Marca size={size} className="icone-animado-marca" />
      {/* a sombra é `currentColor` a baixa opacidade: nenhuma cor nova entra no
          sistema, e ela acompanha quem definir o `text-…` do contêiner */}
      <span
        className="icone-animado-sombra"
        style={{ width: size * 0.72, height: Math.max(3, size * 0.06), marginTop: size * 0.11 }}
      />
    </div>
  );
}
