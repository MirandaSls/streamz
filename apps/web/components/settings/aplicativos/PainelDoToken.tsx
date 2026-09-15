"use client";

import { useState } from "react";
import type { TokenCriado } from "@streamz/shared";
import { Check, Copy } from "@/components/ui/icones";
import { Button, MensagemDeAjuda, TextInput } from "@/components/ui/primitivos";
import { dataCompleta } from "@/lib/format";

/**
 * O painel que mostra o token em claro — **uma vez**.
 *
 * **É a peça que não pode sair errada.** O valor existe só na resposta de
 * criar ou de regenerar: fica no `useState` da aba, some quando o painel
 * fecha, e não passa por store, `localStorage` nem log.
 *
 * Fica no fluxo da página, e não num modal, de propósito: no celular um modal
 * sobre o modal de configurações daria três camadas de "voltar", e o valor a
 * copiar precisa ficar à vista enquanto a pessoa alterna para o editor onde
 * vai colá-lo.
 *
 * Desenho: o aviso é o `HelpMessage` `warning` do Discord (ver
 * `MensagemDeAjuda`), que é como o cliente dele avisa "isto some" em
 * configuração. O campo com o valor é o `TextInput` `readOnly` (as medidas
 * saem do primitivo, que ainda não pinta `--input-border-readonly`) — e é
 * `<input>` e não `<code>` porque um input dá seleção com um toque no
 * celular, a saída quando `navigator.clipboard` não existe (contexto
 * inseguro, permissão negada). O portal do Discord mostra o token da mesma
 * forma, campo + "Copy" (`portal-bot-token.jpg` em `docs/Reference/apps/`, só
 * proporção). Espaços entre as peças (8): não medidos.
 */
export function PainelDoToken({
  nomeDoApp,
  token,
  aoFechar,
}: {
  nomeDoApp: string;
  token: TokenCriado;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function copiar() {
    try {
      if (!navigator.clipboard) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(token.token);
      setCopiado(true);
      setFalhou(false);
    } catch {
      // sem permissão o valor continua selecionável no campo: o aviso diz isso
      setCopiado(false);
      setFalhou(true);
    }
  }

  return (
    <div role="group" aria-label={`Token de ${nomeDoApp}`} className="flex flex-col gap-2">
      <MensagemDeAjuda tom="aviso">
        <strong className="font-semibold text-text-strong">Copie o token de {nomeDoApp} agora.</strong>{" "}
        Ele aparece uma única vez. Se você fechar este painel sem copiar, o valor se perde — a saída
        passa a ser regenerar, o que derruba o bot.
      </MensagemDeAjuda>

      {/* campo e botão empilhados no celular: 358px de largura útil não
          comportam um valor de 59 caracteres e um botão na mesma linha */}
      <div className="flex items-center gap-2 celular:flex-col celular:items-stretch">
        <TextInput
          value={token.token}
          readOnly
          aria-label="Token do bot"
          tamanhoDoTexto="sm"
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono [font-variant-ligatures:none]"
          classeDaCaixa="min-w-0 flex-1 celular:flex-none"
        />
        <Button
          variante="primario"
          icone={copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          onClick={() => void copiar()}
          className="shrink-0 celular:h-[48px]"
        >
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p aria-live="polite" className={falhou ? "text-text-xs text-text-feedback-critical" : "sr-only"}>
        {copiado
          ? "Token copiado para a área de transferência."
          : falhou
            ? "Não deu para copiar daqui. Toque no campo, selecione o texto e copie à mão."
            : ""}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-text-xs text-text-muted">
          Prefixo <span className="font-mono">{token.prefixo}…</span> · emitido em {dataCompleta(token.criadoEm)}
        </p>
        <Button variante="secundario" tamanho="sm" onClick={aoFechar} className="celular:h-[44px]">
          Já copiei, fechar
        </Button>
      </div>
    </div>
  );
}
