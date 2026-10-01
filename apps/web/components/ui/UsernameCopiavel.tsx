"use client";

import { useEffect, useRef, useState } from "react";
import Tooltip from "@/components/ui/Tooltip";
import { janelaDe } from "@/lib/outra-janela";

/**
 * Username que copia a si mesmo ao clique (paridade com o Discord): sublinha no
 * hover/foco, dica "Clique para copiar…" e depois "Copiado!" por ~1,5 s.
 * Copia só o `username` — o `prefixo` (ex.: "@") é decoração de exibição.
 *
 * O clipboard vem da janela do próprio elemento (`janelaDe`): em janela solta
 * (portal), o `navigator` da janela principal perderia o foco/ativação do
 * documento e recusaria a escrita.
 */
export default function UsernameCopiavel({
  username,
  prefixo = "",
  className = "",
}: {
  username: string;
  prefixo?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function copiar(e: React.MouseEvent<HTMLButtonElement>) {
    // dentro de linhas/cartões clicáveis, o clique não deve abrir o pai
    e.stopPropagation();
    const nav = janelaDe(e.currentTarget).navigator;
    void nav.clipboard?.writeText(username).then(
      () => {
        setCopiado(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopiado(false), 1500);
      },
      () => {},
    );
  }

  return (
    <Tooltip
      label={copiado ? "Copiado!" : "Clique para copiar o nome de usuário"}
      className="min-w-0"
    >
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar nome de usuário @${username}`}
        className={`min-w-0 cursor-pointer truncate bg-transparent p-0 text-left text-inherit outline-none hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${className}`}
      >
        {prefixo}
        {username}
      </button>
    </Tooltip>
  );
}
