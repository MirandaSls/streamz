"use client";

import type { ReactNode } from "react";
import { Link2 } from "@/components/ui/icones";
import { hrefDaAncora, idDoElemento } from "@/components/desenvolvedores/especificacao";

/**
 * Uma seção com âncora: `#/mensagens/criar-mensagem` leva direto a ela, e o
 * realce da navegação a encontra pela rolagem.
 *
 * O `data-ancora` é o que o observador de rolagem lê (`useAncoraAtiva`); o
 * `id` é o que o **navegador** casa com o `#`. São dois porque a âncora tem
 * barra (`mensagens/criar`) e o `id` precisa começar com uma para casar — mas
 * `id` com barra não passa em `querySelector`, e o observador precisa achar
 * todas as seções de uma vez.
 *
 * `scroll-mt-*` não é detalhe: sem ele o cabeçalho fixo cobre o título da
 * seção que o link acabou de alcançar, e o leitor cai na seção anterior sem
 * entender por quê.
 */
export interface SecaoProps {
  ancora: string;
  titulo: string;
  /** rótulo pequeno acima do título (a tag, o método). */
  sobretitulo?: ReactNode;
  /** `h2` (padrão) para seção de primeiro nível, `h3` para item dentro dela. */
  nivel?: 2 | 3;
  children?: ReactNode;
  className?: string;
}

export function Secao({ ancora, titulo, sobretitulo, nivel = 2, children, className = "" }: SecaoProps) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section
      id={idDoElemento(ancora)}
      data-ancora={ancora}
      aria-labelledby={`titulo:${ancora}`}
      className={`scroll-mt-20 ${className}`}
    >
      {sobretitulo ? (
        <div className="mb-1.5 text-text-xs font-semibold uppercase tracking-wide text-text-muted">{sobretitulo}</div>
      ) : null}
      <div className="group/titulo flex items-center gap-2">
        <Titulo
          id={`titulo:${ancora}`}
          className={`min-w-0 font-semibold text-text-strong ${nivel === 2 ? "text-heading-xl" : "text-heading-lg"}`}
        >
          {titulo}
        </Titulo>
        <a
          href={hrefDaAncora(ancora)}
          aria-label={`Link direto para ${titulo}`}
          // some no repouso e volta no hover ou no foco de teclado: o link
          // precisa existir para quem navega por Tab, não só para quem passa o
          // mouse
          className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:text-text-default focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus group-hover/titulo:opacity-100 celular:opacity-100"
        >
          <Link2 size={16} aria-hidden="true" />
        </a>
      </div>
      {children}
    </section>
  );
}
