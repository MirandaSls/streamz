"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import Marca from "@/components/ui/Marca";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { GRUPO_NATIVOS, type ComandoListavel, type GrupoDeComandos } from "@/lib/comandos-barra";
import ChipDeOpcao from "./ChipDeOpcao";

/**
 * Seletor de comandos de barra — o que abre ao digitar `/`.
 *
 * Forma (referência: `docs/referencias-discord/desenvolvedores/imagens/comandos/
 * lancador-de-comandos-desktop.png` e `autocomplete-subcomandos-com-parametros.png`,
 * escala desconhecida — só a forma; números do CSS):
 *
 * - caixa `.outerWrapper_d1405b` (`css-bruto/116815.875a0330d71c7d69.css`):
 *   raio 5, `box-shadow: var(--shadow-border), var(--shadow-high)` (= a
 *   `shadow-popout` do app), `bottom: calc(100% + 8px)`,
 *   `inset-inline: 0 var(--space-8)` a partir da caixa do campo;
 * - `.wrapper_d1405b{height:420px}`;
 * - trilho `.wrapper_b1e4f3`: 48 de largura, fundo `--background-base-lowest`,
 *   `padding-bottom:8px`; seção `margin-bottom:8px`; separador dos integrados
 *   `.builtInSeparator_b1e4f3{border-bottom:1px solid var(--border-subtle);margin:8px 0}`;
 *   ícone `.icon_ca5f52` 32×32 em `.wrapper_ca5f52{border-radius:8px}`, hover
 *   `--interactive-background-hover`, selecionado `--background-base-low`;
 * - lista `.autocomplete__13533` fundo `--background-surface-high`; cabeçalho
 *   `.categoryHeader_d1405b{position:sticky;top:0;padding:0 8px}` com
 *   `.contentTitle__13533{color:var(--interactive-text-default);padding:4px 0;
 *   text-transform:uppercase}` — módulo antigo (`116815…css`); o refresh atual
 *   do Discord (`862735.30278509527ce174.css`, mesma classe) já pinta
 *   `font-size:14px;font-weight:var(--font-weight-medium);text-transform:none`,
 *   confirmado no print 1:1 `124022.png` ("Mensagens diretas", caixa normal) —
 *   é essa a versão usada aqui (`text-text-sm font-medium`, sem `uppercase`);
 *   seção `margin-bottom:16px`;
 * - linha `.autocompleteRow__13533{font-size:14px;font-weight:500;line-height:16px;
 *   padding:0 8px}` > `.base__13533{border-radius:3px;padding:8px}`, selecionada
 *   ou em hover `--interactive-background-hover`; ícone `margin-inline-end:8px`;
 *   coluna da direita (nome do app) `margin-inline-start:16px; min-width:10ch;
 *   text-align:end`;
 * - opções `.option__920ab{margin-inline-start:8px}`, bloco das opcionais
 *   `.optionals__920ab{border-inline-start:1px solid var(--border-subtle);
 *   margin-inline-start:8px}` com `.optionalHeader__920ab{color:var(--text-muted);
 *   padding-inline-start:8px;text-transform:uppercase}` — mesmo caso do
 *   cabeçalho de seção: o módulo atual (`862735…css`) já é `text-transform:none`
 *   ("Opcional", caixa normal, sem o `uppercase`); descrição
 *   `.description__920ab{margin-top:4px;white-space:nowrap;text-overflow:ellipsis}`.
 *
 * Não medido: o lado do avatar do app na linha (32 aqui, o do ícone do
 * trilho) e o padding de cima do trilho.
 *
 * Só desenha. As setas, o Enter e o Esc são do composer, que continua dono do
 * foco — o mesmo contrato do `Autocomplete`.
 */
export default function SeletorDeComandos({
  grupos,
  selecionado,
  onEscolher,
  onPassarMouse,
}: {
  grupos: GrupoDeComandos[];
  /** índice na lista corrida (todas as seções em sequência). */
  selecionado: number;
  onEscolher: (comando: ComandoListavel) => void;
  onPassarMouse: (indice: number) => void;
}) {
  const listaRef = useRef<HTMLDivElement>(null);
  const secoesRef = useRef(new Map<string, HTMLElement>());

  // índice corrido de cada linha, para casar com o `selecionado` do composer
  let contador = 0;
  const secoes = grupos.map((g) => ({
    grupo: g,
    linhas: g.comandos.map((c) => ({ comando: c, indice: contador++ })),
  }));
  const grupoAtual = secoes.find((s) => s.linhas.some((l) => l.indice === selecionado))?.grupo.id;

  // mantém a linha selecionada visível quando a navegação é por teclado
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${selecionado}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  if (secoes.length === 0) return null;

  return (
    <div className="absolute bottom-[calc(100%+8px)] left-2.5 right-[18px] z-[60] overflow-hidden rounded-[5px] shadow-popout celular:left-3 celular:right-3">
      {/* 420 no desktop. No celular, com o teclado aberto, 420 passaria da
          janela inteira: o teto vira uma fração da tela (não medido). */}
      <div className="flex h-[420px] celular:h-[min(420px,45dvh)]">
        <nav
          aria-label="Aplicativos com comandos"
          className="w-12 shrink-0 overflow-y-auto bg-background-base-lowest pb-2 pt-2 celular:hidden"
        >
          {secoes.map(({ grupo, linhas }, i) => (
            <div key={grupo.id} className="mb-2 flex flex-col items-center last:mb-0">
              <BotaoDeIcone
                rotulo={grupo.nome}
                ladoDaDica="right"
                tamanho="lg"
                fundo="hover"
                ativo={grupoAtual === grupo.id}
                // `selecionado`, não `className`: o `bg-` por `className`
                // perdia para o `hover:bg-` da família na cascata (a classe do
                // primitivo entra depois no template) — ver item 15 do
                // cabeçalho de `BotaoDeIcone.tsx`.
                selecionado={grupoAtual === grupo.id}
                icone={<IconeDoGrupo grupo={grupo} lado={32} />}
                onClick={() => {
                  secoesRef.current.get(grupo.id)?.scrollIntoView({ block: "start" });
                  if (linhas[0]) onPassarMouse(linhas[0].indice);
                }}
              />
              {grupo.id === GRUPO_NATIVOS && i < secoes.length - 1 && (
                <hr className="mx-2 mt-2 w-8 border-0 border-b border-border-subtle" />
              )}
            </div>
          ))}
        </nav>

        <div
          ref={listaRef}
          role="listbox"
          aria-label="Comandos"
          className="min-w-0 flex-1 overflow-y-auto bg-background-surface-high pb-2"
        >
          {secoes.map(({ grupo, linhas }) => (
            <section
              key={grupo.id}
              ref={(el) => {
                if (el) secoesRef.current.set(grupo.id, el);
                else secoesRef.current.delete(grupo.id);
              }}
              aria-label={grupo.nome}
              className="mb-4 last:mb-0"
            >
              <div className="sticky top-0 z-[1] bg-background-surface-high px-2">
                {/* `.contentTitle__13533{font-size:14px;font-weight:var(--font-weight-
                    medium);text-transform:none}` — caixa normal, não caixa-alta
                    (o refresh do Discord atual já não usa caixa-alta aqui; ver
                    a entrega do cartão). */}
                <p className="flex items-center gap-2 px-2 py-1 text-text-sm font-medium text-interactive-text-default">
                  <IconeDoGrupo grupo={grupo} lado={16} />
                  <span className="truncate">{grupo.nome}</span>
                  {/* Seta de recolher: glifo visto no catálogo
                      (`lancador-de-comandos-desktop.png`), tamanho não medido —
                      usa o das categorias da coluna de canais. Não há recolher
                      de verdade ainda: só o desenho. */}
                  <ChevronDown size={16} className="shrink-0" aria-hidden="true" />
                </p>
              </div>
              {linhas.map(({ comando, indice }) => (
                <LinhaDeComando
                  key={comando.chave}
                  comando={comando}
                  indice={indice}
                  selecionada={indice === selecionado}
                  // Toda seção hoje é de um só app (ou os integrados) — nunca
                  // mista (`agruparComandos` em comandos-barra.ts) —, então o
                  // ícone do cabeçalho já basta; repeti-lo em cada linha seria
                  // redundante (ver a entrega do cartão). `mostrarIcone` fica
                  // pronta para o dia em que houver seção mista.
                  mostrarIcone={false}
                  onEscolher={onEscolher}
                  onPassarMouse={onPassarMouse}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function LinhaDeComando({
  comando,
  indice,
  selecionada,
  mostrarIcone,
  onEscolher,
  onPassarMouse,
}: {
  comando: ComandoListavel;
  indice: number;
  selecionada: boolean;
  /** falso numa seção do próprio app ou dos integrados: o cabeçalho já mostra o ícone. */
  mostrarIcone: boolean;
  onEscolher: (comando: ComandoListavel) => void;
  onPassarMouse: (indice: number) => void;
}) {
  const obrigatorias = comando.opcoes.filter((o) => o.required);
  const opcionais = comando.opcoes.filter((o) => !o.required);
  return (
    <div
      role="option"
      aria-selected={selecionada}
      data-indice={indice}
      className="cursor-pointer px-2 text-text-sm font-medium leading-4"
      // passar o mouse já move a seleção: um `hover:` por cima disso acendia
      // duas linhas ao mesmo tempo (a mesma regra do `Autocomplete`)
      onMouseEnter={() => onPassarMouse(indice)}
      // mousedown: o clique tiraria o foco do campo antes da escolha entrar
      onMouseDown={(e) => {
        e.preventDefault();
        onEscolher(comando);
      }}
    >
      <div
        className={`flex items-center rounded-[3px] p-2 ${
          selecionada ? "bg-interactive-background-hover" : ""
        }`}
      >
        {mostrarIcone && (
          <span className="mr-2 shrink-0">
            {comando.app ? (
              <Avatar user={comando.app.botUser} size="md" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-background-base-lowest">
                <Marca size={16} />
              </span>
            )}
          </span>
        )}

        <div className="min-w-[10ch] shrink overflow-hidden">
          <div className="flex min-w-0 items-center">
            <span className="shrink-0 text-text-strong">/{comando.nome}</span>
            {obrigatorias.map((o) => (
              <ChipDeOpcao key={o.name} nome={o.name} className="ml-2" />
            ))}
            {opcionais.length > 0 && (
              <span className="ml-2 flex min-w-0 items-center border-l border-border-subtle">
                <span className="shrink-0 pl-2 text-text-muted">Opcional</span>
                {opcionais.map((o) => (
                  <ChipDeOpcao key={o.name} nome={o.name} className="ml-2" />
                ))}
              </span>
            )}
          </div>
          {comando.descricao && (
            <p className="mt-1 truncate font-normal text-text-muted">{comando.descricao}</p>
          )}
        </div>

        <span className="ml-4 min-w-[10ch] shrink-0 grow basis-[10ch] truncate text-end font-normal text-text-muted">
          {comando.app?.nome ?? "Integrado"}
        </span>
      </div>
    </div>
  );
}

/**
 * Ícone da seção: o avatar do bot, ou o símbolo do Streamz nos integrados — no
 * Discord é o logo dele, e símbolo é marca (ADR-0009 §1).
 */
function IconeDoGrupo({ grupo, lado }: { grupo: GrupoDeComandos; lado: 16 | 32 }) {
  if (grupo.botUser) return <Avatar user={grupo.botUser} size={lado === 32 ? "md" : "xs"} />;
  return (
    <span
      className={`grid place-items-center rounded-full bg-background-base-lowest ${lado === 32 ? "h-8 w-8" : "h-4 w-4"}`}
    >
      <Marca size={lado === 32 ? 16 : 10} />
    </span>
  );
}
