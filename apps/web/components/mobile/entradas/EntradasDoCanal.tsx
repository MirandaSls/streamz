"use client";

import { useCallback, useEffect, useState } from "react";
import type { Channel } from "@streamz/shared";
import TelaDeBusca from "@/components/mobile/entradas/TelaDeBusca";
import TelaDeDetalhesDoCanal from "@/components/mobile/entradas/TelaDeDetalhesDoCanal";
import TelaDeThread from "@/components/mobile/entradas/TelaDeThread";
import {
  desempilharEntrada,
  empilharEntrada,
  type EntradaDoCanal,
} from "@/components/mobile/entradas/navegacao";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";
import { useMessages } from "@/stores/messages";

export interface EntradasDoCanal {
  pilha: EntradaDoCanal[];
  abrir: (entrada: EntradaDoCanal) => void;
  voltar: () => void;
  fecharTodas: () => void;
}

/**
 * A pilha das entradas de uma conversa (detalhes e busca), com o voltar do
 * sistema desfazendo **uma** camada por vez.
 *
 * ## Um registro de camada por profundidade
 *
 * O `useVoltarNoCelular` conta **uma entrada de histórico por camada
 * registrada**, e registra enquanto `ligado` for verdadeiro. Uma chamada só,
 * ligada com "pilha não vazia", empurraria uma entrada para duas telas
 * (detalhes → busca): o primeiro voltar desempilharia a busca e gastaria a
 * única entrada; o segundo encontraria a camada ainda registrada mas nenhuma
 * entrada nossa, seria engolido pela guarda do `ShellMobile`
 * (`haCamadaNoCelular`) e ainda consumiria a sentinela dele. Por isso são duas
 * chamadas, uma por nível: cada tela é uma camada, e a de cima sai primeiro.
 * Dois basta — `empilharEntrada` nunca deixa a pilha passar de dois (são dois
 * tipos, sem repetição).
 *
 * ## Quando as entradas se fecham sozinhas
 *
 * - **ao trocar de canal** — um resultado de busca de outro canal do servidor
 *   troca o canal ativo, e a conversa nova não herda a busca da velha;
 * - **ao saltar para uma mensagem** (`highlightId`) — o resultado da busca e a
 *   fixada levam à mensagem na conversa que está embaixo, e ela precisa ficar à
 *   vista. O `SearchPanel` salta sozinho (`goToMessage`), sem avisar ninguém; o
 *   realce é o sinal que sobra.
 */
export function useEntradasDoCanal(channelId: string | null): EntradasDoCanal {
  const [pilha, setPilha] = useState<EntradaDoCanal[]>([]);

  const abrir = useCallback((entrada: EntradaDoCanal) => setPilha((p) => empilharEntrada(p, entrada)), []);
  const voltar = useCallback(() => setPilha((p) => desempilharEntrada(p)), []);
  const fecharTodas = useCallback(() => setPilha([]), []);

  useVoltarNoCelular(pilha.length >= 1, voltar);
  useVoltarNoCelular(pilha.length >= 2, voltar);

  useEffect(() => {
    setPilha([]);
  }, [channelId]);

  const realce = useMessages((s) => s.highlightId);
  useEffect(() => {
    if (realce) setPilha([]);
  }, [realce]);

  return { pilha, abrir, voltar, fecharTodas };
}

/**
 * As camadas por cima da conversa de um canal: a pilha de entradas e, acima de
 * tudo, a thread aberta.
 *
 * Todas são montadas **dentro** da tela empilhada (`CamadaDeEntrada`), e não
 * num portal, para o toque longo do shell continuar valendo nelas. A conversa
 * fica montada embaixo — como no Discord, onde voltar dos detalhes devolve a
 * timeline na mesma posição, sem recarregar.
 */
export default function CamadasDoCanal({ canal, entradas }: { canal: Channel; entradas: EntradasDoCanal }) {
  const threadAberta = useMessages((s) => s.threadParentId !== null);

  return (
    <>
      {entradas.pilha.map((entrada) =>
        entrada === "detalhes" ? (
          <TelaDeDetalhesDoCanal
            key="detalhes"
            canal={canal}
            aoVoltar={entradas.voltar}
            aoBuscar={() => entradas.abrir("busca")}
            aoSaltar={entradas.fecharTodas}
          />
        ) : (
          <TelaDeBusca key="busca" canal={canal} aoVoltar={entradas.voltar} aoSaltar={entradas.fecharTodas} />
        ),
      )}
      {threadAberta && <TelaDeThread channelId={canal.id} guildId={canal.guildId} />}
    </>
  );
}
