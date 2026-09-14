"use client";

import { useRef, type KeyboardEvent } from "react";
import {
  ConfiguracoesRelacionadas,
  Rotulo,
  Section,
  Slider,
  Toggle,
} from "@/components/ui/controls";
import { useIrParaAba } from "@/components/settings/navegacao";
import PreviaDeMensagens from "@/components/settings/PreviaDeMensagens";
import { Accessibility, Check } from "@/components/ui/icones";
import { Button, LinhaDeControle, Switch, Tooltip } from "@/components/ui/primitivos";
import { useT } from "@/lib/i18n";
import { FONT_SCALE, GROUP_SPACING, ZOOM, temaValido, useSettings, type Tema } from "@/stores/settings";

/**
 * Aparência: tema (Dark, Ash, Onyx), escala da fonte, respiro entre grupos,
 * modo compacto e zoom.
 *
 * A prévia vem **antes** dos controles, como no Discord: ela é o alvo do que se
 * está mexendo, e embaixo de tudo obrigava a rolar para ver o efeito do slider
 * que se acabou de arrastar.
 *
 * Nada aqui tem "salvar": toda preferência desta aba vale no instante em que
 * muda (a store escreve direto no `<html>`), então a barra de alterações não
 * salvas não aparece nesta tela.
 */
export default function AparenciaTab() {
  const t = useT();
  const s = useSettings();
  const irParaAba = useIrParaAba();

  return (
    <>
      <Section id="previa" title={t("aparencia.previa")}>
        <PreviaDeMensagens />
      </Section>

      <Section id="tema" title={t("aparencia.tema")}>
        <EscolhaDeTema />
      </Section>

      <Section id="mensagens" title={t("aparencia.mensagens")}>
        <Slider
          label={t("aparencia.escalaFonte")}
          value={s.fontScale}
          min={FONT_SCALE.min}
          max={FONT_SCALE.max}
          step={FONT_SCALE.step}
          // o passo é de meio pixel (o padrão é 15,5): em pt-BR o separador
          // decimal é vírgula, e "15.5px" no rótulo lia como outro número
          format={(v) => `${v.toLocaleString(s.locale)}px`}
          onChange={(fontScale) => s.set({ fontScale })}
        />
        <Slider
          label={t("aparencia.espacoGrupos")}
          value={s.groupSpacing}
          min={GROUP_SPACING.min}
          max={GROUP_SPACING.max}
          step={GROUP_SPACING.step}
          format={(v) => `${v}px`}
          onChange={(groupSpacing) => s.set({ groupSpacing })}
        />
        <Toggle
          label={t("aparencia.modoCompacto")}
          hint={t("aparencia.modoCompactoAjuda")}
          checked={s.compactMode}
          onChange={(compactMode) => s.set({ compactMode })}
        />
        <Slider
          label={t("aparencia.zoom")}
          hint={t("aparencia.zoomAjuda")}
          value={s.zoom}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(zoom) => s.set({ zoom })}
        />
      </Section>

      <Section semDivisoria>
        <Button variante="secundario" tamanho="md" onClick={() => s.reset()} className="celular:h-[44px]">
          {t("config.restaurar")}
        </Button>
      </Section>
    
      <ConfiguracoesRelacionadas
        titulo={t("config.relacionadas")}
        itens={[
          {
            id: "acessibilidade",
            label: t("aba.acessibilidade"),
            hint: t("acess.secLegibilidade"),
            icon: <Accessibility size={18} />,
            onSelect: () => irParaAba("acessibilidade"),
          },
        ]}
      />
    </>
  );
}

/**
 * "Tema": linha "Mesmo tema do dispositivo" + grade "Temas padrão", como no
 * Discord (print `docs/Reference/Captura de tela 2026-09-01 114135.png`,
 * Configurações de usuário > Aparência > Tema — Md, 2026-09-01; régua de pixel
 * na onda 9).
 *
 * A grade do Discord é Claro, Ash, Escuro, Onyx (e um quinto botão, de tema
 * aleatório/sincronizar, que não temos): quadrados de **48×48**, 8px de vão
 * (linha y=270: x 419–466 / 475–522 / 529–580 / 587–634). O CSS é o de
 * `.themeSelection__36dee` e vizinhos:
 * - raio 8 (`border-radius:8px`);
 * - borda de 1px **por dentro**, `box-shadow: inset 0 0 0 1px
 *   var(--interactive-text-default)` (`.defaultThemeSelection`) — no print
 *   `#abacb2`, que é exatamente esse token no Dark;
 * - preenchimento = a **paleta crua**, igual em qualquer tema ativo:
 *   `.lightIcon` `--white`, `.darkIcon` (Ash) `--primary-600` `#323339`,
 *   `.darkerIcon` (Dark) `--plum-20` `#1d1d21`, `.midnightIcon` (Onyx)
 *   `--black` — os quatro conferem no print;
 * - selecionado: `.selectionCircle`, caixa 4px maior (`-2px` em volta), raio 8,
 *   `box-shadow: inset 0 0 0 4px var(--brand-500)` — 52px de x 529 a 580 no
 *   print, com o miolo de 44. No Discord é o blurple; aqui, limão (regra
 *   mecânica do item 3 da ADR-0009);
 * - selo do selecionado: disco de **22px** na cor de marca com o visto dentro,
 *   7px para fora do canto de cima à direita (x 564–585, y 240–261 contra o
 *   quadrado em x 531–578, y 247–294); tinta do visto 12×9 (x 569–580,
 *   y 247–255), que no nosso `Check` (quadro 80, visto de 67×47) é `size` 14.
 *   O visto é escuro sobre o limão, nunca branco.
 *
 * Ash e Onyx aplicam na hora: a store grava e escreve `data-tema` no `<html>`
 * (`stores/settings.ts#aplicarTema`), e os tokens de `app/tokens.css` fazem o
 * resto. O Claro fica **visível e desabilitado** com "(em breve)" (§6.6 do
 * PROCESSO): está fora da ADR-0009 — o limão só vai sobre escuro, e um accent
 * para fundo claro é outra ADR. Pelo mesmo motivo "Mesmo tema do dispositivo"
 * continua desabilitado: sem Claro não há o que sincronizar.
 */
const AMOSTRAS: { tema: Tema; fundo: string }[] = [
  { tema: "ash", fundo: "bg-primary-600" },
  { tema: "dark", fundo: "bg-plum-20" },
  { tema: "onyx", fundo: "bg-black" },
];

const PASSO_DA_SETA: Record<string, number | undefined> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Classe comum aos quatro quadrados: 48×48, raio 8, borda de 1px por dentro. */
const QUADRADO =
  "relative h-12 w-12 shrink-0 rounded-lg ring-1 ring-inset ring-interactive-text-default";

function EscolhaDeTema() {
  const t = useT();
  const tema = useSettings((s) => temaValido(s.theme));
  const escolher = useSettings((s) => s.set);
  const botoes = useRef<Partial<Record<Tema, HTMLButtonElement | null>>>({});

  const nomeDoTema = (x: Tema) => (x === "dark" ? t("aparencia.escuro") : x === "ash" ? "Ash" : "Onyx");

  /** Setas andam entre os temas e já aplicam, como todo grupo de rádio. */
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = PASSO_DA_SETA[e.key];
    if (!passo) return;
    e.preventDefault();
    const i = AMOSTRAS.findIndex((a) => a.tema === tema);
    const proximo = AMOSTRAS[(i + passo + AMOSTRAS.length) % AMOSTRAS.length].tema;
    escolher({ theme: proximo });
    botoes.current[proximo]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <LinhaDeControle
        rotulo="Mesmo tema do dispositivo"
        descricao="Iguale ao modo (claro ou escuro) do seu dispositivo."
        semDivisoria
        controle={<InterruptorEmBreve nome="Mesmo tema do dispositivo" />}
      />

      <div>
        <Rotulo>Temas padrão</Rotulo>
        <div role="radiogroup" aria-label="Temas padrão" className="flex gap-2" onKeyDown={aoTeclar}>
          <AmostraDoClaro />
          {AMOSTRAS.map(({ tema: x, fundo }) => {
            const marcado = x === tema;
            return (
              <Tooltip key={x} rotulo={nomeDoTema(x)}>
                <button
                  ref={(el) => {
                    botoes.current[x] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  aria-label={nomeDoTema(x)}
                  tabIndex={marcado ? 0 : -1}
                  onClick={() => escolher({ theme: x })}
                  // sem `overflow-hidden`: o anel e o selo saem da caixa de
                  // propósito, como no print
                  className={`${QUADRADO} ${fundo} ${marcado ? "cursor-default" : "cursor-pointer"}`}
                >
                  {marcado && (
                    <>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-[2px] rounded-lg ring-4 ring-inset ring-brand-500"
                      />
                      <span
                        aria-hidden="true"
                        className="absolute -right-[7px] -top-[7px] grid h-[22px] w-[22px] place-items-center rounded-full bg-brand-500"
                      >
                        {/* escuro sobre o limão (regra do accent): o
                            `control-primary-text-default` é o token de texto e
                            ícone sobre superfície de marca */}
                        <Check size={14} className="text-control-primary-text-default" />
                      </span>
                    </>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * O quadrado do Claro: branco como no Discord, mas desabilitado e com
 * "(em breve)" — um `span` e não um `<button disabled>`, para ele mesmo
 * receber ponteiro e foco e mostrar a dica.
 */
function AmostraDoClaro() {
  const t = useT();
  const dica = `${t("aparencia.claro")} (${t("aparencia.emBreve")})`;
  return (
    <Tooltip rotulo={dica}>
      <span
        role="radio"
        aria-checked={false}
        aria-disabled="true"
        tabIndex={0}
        aria-label={dica}
        className={`${QUADRADO} block cursor-not-allowed bg-white opacity-50`}
      />
    </Tooltip>
  );
}

/**
 * Interruptor "(em breve)" — mesmo padrão de `ContaTab.tsx`
 * (`LinhaDeTelefone`): o `<button disabled>` do `Switch` não recebe ponteiro
 * nem foco, então quem carrega a dica e o `tabIndex` é o `span` por fora.
 */
function InterruptorEmBreve({ nome }: { nome: string }) {
  const t = useT();
  const dica = `${nome} (${t("aparencia.emBreve")})`;
  return (
    <Tooltip rotulo={dica}>
      <span tabIndex={0} aria-label={dica} className="inline-flex rounded-2xl">
        <Switch marcado={false} aoMudar={() => {}} desabilitado className="pointer-events-none" />
      </span>
    </Tooltip>
  );
}
