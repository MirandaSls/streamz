"use client";

import type { ActionRow as ActionRowPayload, Message, SelectDeBot as ComponenteDeSelect } from "@streamz/shared";
import { TIPO_DE_COMPONENTE, TIPOS_DE_SELECT } from "@streamz/shared";
import BotaoDeBot from "@/components/chat/bot/BotaoDeBot";
import SelectDeBot from "@/components/chat/bot/SelectDeBot";

/**
 * ── onda 3 (cartão 3c) ── Uma action row (`type: 1`) de mensagem: até 5
 * botões **ou** um select (`conferirActionRow`/`conferirMensagemDeBot`, no
 * shared, já garante essa composição antes de a mensagem existir — aqui só se
 * despacha por tipo).
 *
 * `FilhoDeActionRow` (o tipo do shared) inclui `TextInput` porque o mesmo
 * schema de linha serve ao modal; **num action row de mensagem isso nunca
 * chega** (o próprio `conferirActionRow` recusa com `caminho: "mensagem"`) —
 * o `default: null` abaixo é só essa garantia de tipo sobrando, não um caso
 * real.
 *
 * **Gap de 8px entre os componentes da row: não medido.** Não achei, no CSS
 * bruto nem em nenhum print 1:1, a classe do container de botões *dentro de
 * uma mensagem* (`buttonContainer_*` some em popouts e menus de contexto, não
 * em mensagem — ver o cabeçalho de `BotaoDeBot.tsx`). `gap-2` (`--space-8`) é
 * o espaçamento entre controles mais comum no resto do app medido (ex.: o
 * rodapé do `Modal`, `.actionBarTrailing__8a031{gap:var(--space-8)}`); ver
 * "nao_verificado".
 *
 * `flex-wrap`: o Discord empilha a row em mais de uma linha no celular
 * (`celular:` não muda nada aqui — o `flex-wrap` já resolve as duas larguras
 * sem variante, e nenhum print achado mostra quebra diferente no desktop).
 */
export default function ActionRow({
  componente,
  message,
}: {
  componente: ActionRowPayload;
  // a mensagem inteira, não um recorte: o `SelectDeBot` precisa do `guildId`
  // para montar as opções dos selects de usuário, cargo e canal
  message: Message;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      {componente.components.map((filho, indice) => {
        const chave = filho.id ?? indice;
        if (filho.type === TIPO_DE_COMPONENTE.BUTTON) {
          return <BotaoDeBot key={chave} componente={filho} message={message} />;
        }
        if ((TIPOS_DE_SELECT as readonly number[]).includes(filho.type)) {
          return <SelectDeBot key={chave} componente={filho as ComponenteDeSelect} message={message} />;
        }
        return null;
      })}
    </div>
  );
}
