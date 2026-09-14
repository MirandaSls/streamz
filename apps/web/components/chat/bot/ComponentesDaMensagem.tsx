"use client";

import type { Message } from "@streamz/shared";
import { FLAGS_DE_MENSAGEM, TIPO_DE_COMPONENTE, temFlag } from "@streamz/shared";
import { AlertTriangle } from "@/components/ui/icones";
import { useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import ActionRow from "@/components/chat/bot/ActionRow";
import { ComponenteV2 } from "@/components/chat/bot/v2";

/**
 * ── onda 3 (cartão 3c) ── O ponto de entrada do desenho de `message.components`
 * — o que a mensagem de bot referida em `docs/CONTRATO-ONDA-3.md` §1.3 chama de
 * "desenha". Quem monta a linha da mensagem (fora da minha lista: 3b cuida do
 * embed, e quem chama este componente dentro de `MessageItem`/`ChatMessage` é
 * o coordenador na integração final) só precisa montar
 * `<ComponentesDaMensagem message={message} />` depois do embed.
 *
 * ## Despacho v1 × v2
 *
 * Sem `IS_COMPONENTS_V2`, o primeiro nível só tem action rows (`type: 1`) —
 * qualquer outra coisa ali seria payload inválido, então o `else null` é só
 * defesa, não um caso que `validarPayloadDeBot` deixa passar. Com a flag, todo
 * `ComponenteDeMensagem` de primeiro nível (container, section, text display,
 * media gallery, file, separator e **também** action row — o seed `bot-v2`
 * tem uma) vai para `ComponenteV2` (cartão 3e), que devolve o próprio
 * `<ActionRow>` quando o filho é `type: 1`.
 *
 * ## "Esta interação falhou"
 *
 * O contrato (§9) associa este aviso a "action row e botões" — os três
 * arquivos deste cartão. Fica **uma vez por mensagem**, abaixo de todas as
 * rows/componentes (não uma vez por row): `falhas` é indexado por
 * `messageId`, não por `customId` — se a mensagem tiver duas rows, o Discord
 * não duplica o aviso, e replicá-lo em cada `<ActionRow>` só porque cada uma
 * tem o dado à mão seria pior. Cor e ícone: **não medidos** (nenhum print do
 * acervo mostra uma interação falhando); usei o par que o resto do app já usa
 * para erro em linha (`text-text-feedback-critical`, o mesmo do botão
 * `critico-link`) com `text-text-xs`, como o "(editado)" de `MessageItem.tsx`
 * usa `text-text-muted` no mesmo tamanho para o par neutro.
 */
export default function ComponentesDaMensagem({ message }: { message: Message }) {
  const componentes = message.components;
  const falha = useInteracoesDeBot((s) => s.falhas[message.id]);

  if (!componentes || componentes.length === 0) return null;

  const v2 = temFlag(message.flags, FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2);

  return (
    <div className="flex flex-col gap-2">
      {componentes.map((componente, indice) => {
        const chave = componente.id ?? indice;
        if (v2) {
          return <ComponenteV2 key={chave} componente={componente} message={message} />;
        }
        if (componente.type === TIPO_DE_COMPONENTE.ACTION_ROW) {
          return <ActionRow key={chave} componente={componente} message={message} />;
        }
        return null;
      })}
      {falha && (
        <div className="flex items-center gap-1 text-text-xs text-text-feedback-critical">
          <AlertTriangle size={12} aria-hidden="true" />
          <span>Esta interação falhou</span>
        </div>
      )}
    </div>
  );
}
