"use client";

import { useEffect, useState } from "react";
import { formatarDuracao } from "@/components/voice/cronometro-formato";

/**
 * Há quanto tempo a call dura, à direita do nome do canal.
 *
 * Começa em `desde` e não em `Date.now()` para que o HTML do servidor e o da
 * hidratação digam a mesma coisa (`0:00`); o primeiro efeito corrige no
 * cliente, antes de o olho perceber.
 */
export default function Cronometro({
  desde,
  className = "",
}: {
  desde: number;
  className?: string;
}) {
  const [agora, setAgora] = useState(desde);
  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desde]);
  return (
    <span className={`tabular-nums ${className}`} aria-label="Tempo na chamada">
      {formatarDuracao(agora - desde)}
    </span>
  );
}
