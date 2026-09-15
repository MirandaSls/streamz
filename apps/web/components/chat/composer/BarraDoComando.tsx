"use client";

import type { ReactNode } from "react";
import type { OpcaoDeComando } from "@streamz/shared";
import type { EstadoDoComando } from "@/lib/comandos-barra";
import ChipDeOpcao, { type EstadoDoChip } from "./ChipDeOpcao";

/**
 * A barra acima do campo enquanto um comando está sendo preenchido.
 *
 * Referência de forma: `docs/referencias-discord/desenvolvedores/imagens/comandos/
 * composer-com-opcao-preenchida.png` (escala desconhecida) — em cima, o nome da
 * opção em negrito seguido da descrição dela e o nome do app à direita; no
 * campo, `/poll`, os chips e o "+3 more" das opcionais que faltam.
 *
 * **Divergência que o campo impõe:** no Discord os chips moram *dentro* do
 * campo, porque o editor dele é Slate (`.slateTextArea_ec4baf`). O nosso é um
 * `<textarea>`, que não desenha elemento nenhum no meio do texto — então os
 * chips vêm para uma segunda linha desta barra, com os mesmos estados do
 * `.option_a19535`. O texto do campo continua sendo `nome:valor`, que é o que
 * `interpretarComando` lê.
 *
 * Não medido: altura, padding e fundo desta barra (o módulo do Discord não
 * estava no CSS capturado). Usa a superfície e a sombra do seletor, que é a
 * peça vizinha, e o raio de cima dele (5).
 *
 * `children` é a lista de valores da opção ativa (escolhas, usuário, canal,
 * cargo): ela se empilha **acima** desta barra, que é o que a ancora.
 */
export default function BarraDoComando({
  estado,
  opcaoComErro,
  onAcrescentarOpcao,
  children,
}: {
  estado: EstadoDoComando;
  /** a obrigatória que ficou em branco no último Enter. */
  opcaoComErro: string | null;
  onAcrescentarOpcao: (opcao: OpcaoDeComando) => void;
  children?: ReactNode;
}) {
  const { comando, ativa } = estado;
  const chave = (o: OpcaoDeComando) => o.name.toLowerCase();

  function estadoDe(o: OpcaoDeComando): EstadoDoChip {
    if (opcaoComErro && chave(o) === opcaoComErro.toLowerCase()) return "erro";
    if (ativa && chave(o) === chave(ativa)) return "ativo";
    if (estado.preenchidas.has(chave(o))) return "preenchido";
    return "vazio";
  }

  // Nativo: o argumento é o resto da linha, não existe `nome:` para acrescentar.
  const acrescentavel = (o: OpcaoDeComando) => !comando.nativo && !estado.marcadas.has(chave(o));
  const obrigatorias = comando.opcoes.filter((o) => o.required);
  const opcionaisVisiveis = comando.opcoes.filter(
    (o) => !o.required && (comando.nativo || estado.marcadas.has(chave(o))),
  );
  const opcionaisQueFaltam = comando.opcoes.filter((o) => !o.required && acrescentavel(o));

  return (
    <div className="absolute bottom-full left-2.5 right-2.5 z-[55] celular:left-3 celular:right-3">
      {children}
      <div className="overflow-hidden rounded-t-[5px] bg-background-surface-high text-text-sm shadow-popout">
        <div aria-live="polite" className="flex items-center gap-2 px-4 py-2">
          <p className="min-w-0 truncate text-text-default">
            <strong className="font-semibold text-text-strong">{ativa ? ativa.name : `/${comando.nome}`}</strong>{" "}
            <span className="text-text-muted">{ativa?.description || comando.descricao}</span>
          </p>
          <span className="ml-auto shrink-0 text-text-muted">{comando.app?.nome ?? "Integrado"}</span>
        </div>

        {comando.opcoes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle px-4 py-2">
            <span className="font-medium text-text-strong">/{comando.nome}</span>
            {obrigatorias.map((o) => (
              <ChipDeOpcao
                key={o.name}
                nome={o.name}
                estado={estadoDe(o)}
                onClick={acrescentavel(o) ? () => onAcrescentarOpcao(o) : undefined}
              />
            ))}
            {opcionaisVisiveis.map((o) => (
              <ChipDeOpcao key={o.name} nome={o.name} estado={estadoDe(o)} />
            ))}
            {opcionaisQueFaltam.length > 0 && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAcrescentarOpcao(opcionaisQueFaltam[0]);
                }}
                aria-label={`Acrescentar opção opcional: ${opcionaisQueFaltam.map((o) => o.name).join(", ")}`}
                className="text-text-muted hover:text-text-default"
              >
                +{opcionaisQueFaltam.length} {opcionaisQueFaltam.length === 1 ? "opcional" : "opcionais"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
