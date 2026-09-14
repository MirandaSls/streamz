"use client";

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
import { FONT_SCALE, GROUP_SPACING, ZOOM, useSettings } from "@/stores/settings";

/**
 * Aparência: tema, escala da fonte, respiro entre grupos, modo compacto e zoom.
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
 * Configurações de usuário > Aparência > Tema — Md, 2026-09-01). Cartão
 * c6f-aparencia: redesenho, não só troca de vocabulário — a peça antiga (3
 * cartões 224×105 com miniatura de app, rádio e rótulo) não existe no Discord;
 * o dele são quadrados **48×48 sem rótulo**, com o selecionado marcado por um
 * selo de check no canto (medido na régua de pixel: linha y=270, quadrados em
 * x 420–465/476–521/533–576/588–633/644–689, cada um com ~46px de tinta e 1px
 * de borda `#abacb2` — sólida, não bate exatamente com nenhum token
 * `--border-*` alfa que temos; fica `border-border-subtle`, o mesmo resto
 * usado nas outras grades de cartão do arquivo (`controls.tsx#RadioCards`),
 * já que aqui não há hover para subir a `-strong` —, vão de 8px entre eles; o
 * selecionado troca a borda por um anel de 4px na cor de marca, aqui limão
 * pela regra mecânica do item 3 da ADR — no Discord o anel é blurple
 * `#5865f2`, a cor exata do `--brand-500` dele).
 *
 * `stores/settings.ts` define `theme: "dark"` como **literal único** — não
 * existe valor "light" nem "sync" para gravar, então:
 * - "Mesmo tema do dispositivo" (rótulo e descrição do print) fica desabilitado.
 *   Não é "ainda não fizemos": o tema Claro está **fora da ADR-0009** (precisa
 *   de um accent alternativo para fundo claro — "limão só sobre escuro" não
 *   tem para onde ir —, isso pede outra ADR, ver "Fora desta decisão" da
 *   0009). Sincronizar com o dispositivo não tem o que sincronizar até lá.
 * - Em "Temas padrão" só o cartão Escuro funciona (é o único tema que existe).
 *   Ash e Onyx (onda 9, das mesmas variáveis do Discord) aparecem visíveis e
 *   desabilitados com a dica "(em breve)" — §6.6 do PROCESSO: o controle não
 *   some, mas também não inventa a cor real do tema (não existe em
 *   `variaveis-resolvidas.json` ainda), por isso o preenchimento é neutro.
 * - Sem o tema Claro, a grade de 3 colunas que cortava "Sincronizar com o
 *   comp…" (achado da revisão) não existe mais — o rótulo do Discord nem
 *   aparece nos cartões (ele é só a dica de acessibilidade).
 */
function EscolhaDeTema() {
  const t = useT();

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
        <div role="radiogroup" aria-label="Temas padrão" className="flex gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={true}
            // único tema real (o `theme` da store trava em "dark") — clicar
            // não muda nada, mas continua radio de verdade para o leitor de
            // tela, igual ao Discord com um só tema selecionável
            onClick={() => {}}
            // sem `overflow-hidden`: o selo de check do canto pisa a borda de
            // propósito (como no print), e um preenchimento sólido não tem
            // nada para vazar por cima
            className="relative h-12 w-12 shrink-0 rounded-[6px] border-4 border-brand-500 bg-background-base-lower transition"
          >
            <span className="sr-only">{t("aparencia.escuro")}</span>
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-brand-500"
            >
              {/* ícone escuro sobre o selo limão — regra do accent (nunca
                  branco); `control-primary-text-default` é o token que
                  `Button`/`Badge` já usam para texto/ícone sobre superfície
                  de marca (não existe um `accent-ink` genérico nos tokens
                  gerados, só tokens por componente) */}
              <Check size={10} className="text-control-primary-text-default" />
            </span>
          </button>
          <CartaoDeTemaFuturo nome="Ash" />
          <CartaoDeTemaFuturo nome="Onyx" />
        </div>
      </div>
    </div>
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

/**
 * Cartão de tema que ainda não existe (Ash/Onyx, onda 9): visível e
 * desabilitado, sem chutar a cor real do tema — só um `span`, não um botão
 * desabilitado, então ele mesmo já recebe ponteiro/foco para a dica.
 */
function CartaoDeTemaFuturo({ nome }: { nome: string }) {
  const t = useT();
  const dica = `${nome} (${t("aparencia.emBreve")})`;
  return (
    <Tooltip rotulo={dica}>
      <span
        role="radio"
        aria-checked={false}
        aria-disabled="true"
        tabIndex={0}
        aria-label={dica}
        className="h-12 w-12 shrink-0 cursor-not-allowed rounded-[6px] border border-border-subtle bg-background-base-lowest opacity-50"
      />
    </Tooltip>
  );
}
