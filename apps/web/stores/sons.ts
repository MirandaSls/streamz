"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NomeDeSom } from "@/lib/ringtone";

/**
 * Quais sons de notificação o app pode tocar.
 *
 * O interruptor mestre (`notificationSound`, em `stores/settings`) continua
 * decidindo se **há** som; esta store diz *quais*. São coisas diferentes: quem
 * só quer silenciar o bipe de "alguém entrou na chamada" não deveria precisar
 * desligar o som de mensagem junto.
 *
 * A chave é o nome do som, e o valor ausente significa **ligado** — assim um
 * som novo no código já nasce audível para quem nunca abriu esta lista.
 */

/**
 * Todo som que o app sabe tocar. A união mora em `lib/ringtone.ts` (é a chave
 * dos mapas de arquivo e de volume); aqui só é reexportada para quem lida com
 * a lista da aba "Notificações".
 */
export type { NomeDeSom };

export const SONS: { nome: NomeDeSom; rotulo: string }[] = [
  { nome: "mensagem", rotulo: "Mensagem" },
  { nome: "chamada", rotulo: "Chamada recebida" },
  { nome: "entrar", rotulo: "Entrar na chamada" },
  { nome: "sair", rotulo: "Sair da chamada" },
  { nome: "alguem-entrou", rotulo: "Alguém entrou na chamada" },
  { nome: "alguem-saiu", rotulo: "Alguém saiu da chamada" },
  { nome: "mudo", rotulo: "Microfone mudo" },
  { nome: "desmudo", rotulo: "Microfone aberto" },
  { nome: "surdo", rotulo: "Áudio desligado" },
  { nome: "nao-surdo", rotulo: "Áudio religado" },
  { nome: "transmissao-iniciada", rotulo: "Transmissão iniciada" },
  { nome: "transmissao-encerrada", rotulo: "Transmissão encerrada" },
  // sem chamador ainda: mover alguém de canal não existe na API. O
  // interruptor e a prévia já ficam de pé para quando existir.
  { nome: "movido", rotulo: "Movido de canal" },
];

interface SonsState {
  /** só o que foi **desligado** é guardado; ausente = toca. */
  desligados: Partial<Record<NomeDeSom, true>>;
  alternar: (nome: NomeDeSom, ligado: boolean) => void;
}

export const useSons = create<SonsState>()(
  persist(
    (set) => ({
      desligados: {},
      alternar: (nome, ligado) =>
        set((s) => {
          if (ligado) {
            const { [nome]: _fora, ...resto } = s.desligados;
            return { desligados: resto };
          }
          return { desligados: { ...s.desligados, [nome]: true as const } };
        }),
    }),
    {
      name: "sons",
      version: 1,
      // só os dados são persistidos; as ações são remontadas a cada carga
      partialize: (s) => ({ desligados: s.desligados }),
    },
  ),
);

/** `true` quando este som pode tocar. */
export function somLigado(nome: NomeDeSom): boolean {
  return !useSons.getState().desligados[nome];
}
