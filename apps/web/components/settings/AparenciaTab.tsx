"use client";

import Avatar from "@/components/ui/Avatar";
import { RadioCards, Section, Slider, Toggle } from "@/components/settings/controls";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import { FONT_SCALE, GROUP_SPACING, ZOOM, useSettings } from "@/stores/settings";

/**
 * Aparência: tema, escala da fonte, respiro entre grupos, modo compacto e zoom.
 *
 * A prévia embaixo é o mesmo par de mensagens que o Discord mostra — sem ela o
 * usuário só descobre o efeito de "modo compacto" depois de fechar a tela.
 */
export default function AparenciaTab() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const s = useSettings();

  return (
    <>
      <Section title={t("aparencia.tema")}>
        <RadioCards
          legend={t("aparencia.tema")}
          legendaOculta
          value={s.theme}
          onChange={() => undefined}
          options={[
            { value: "dark", label: t("aparencia.escuro") },
            // o MVP é escuro por decisão de design (design.md); o cartão fica
            // visível a 50% para o leiaute não mudar quando o claro chegar
            { value: "light", label: `${t("aparencia.claro")} — ${t("aparencia.emBreve")}`, disabled: true },
          ]}
        />
      </Section>

      <Section title={t("aparencia.mensagens")}>
        <Slider
          label={t("aparencia.escalaFonte")}
          value={s.fontScale}
          min={FONT_SCALE.min}
          max={FONT_SCALE.max}
          step={FONT_SCALE.step}
          format={(v) => `${v}px`}
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

      <Section title={t("aparencia.previa")}>
        <div className="rounded-lg bg-chat p-3">
          {s.compactMode ? (
            <>
              <p className="text-txt-normal">
                <span className="mr-2 text-[11px] text-txt-muted">14:03</span>
                <span className="mr-1 font-medium text-txt-primary">
                  {user?.displayName || user?.username || "você"}
                </span>
                Assim ficam as mensagens no modo compacto.
              </p>
              <p className="text-txt-normal" style={{ marginTop: `${s.groupSpacing}px` }}>
                <span className="mr-2 text-[11px] text-txt-muted">14:04</span>
                <span className="mr-1 font-medium text-txt-primary">newdisc</span>
                E este é o respiro entre grupos.
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-3">
                {user && <Avatar user={user} size="lg" surface="border-chat" />}
                <div>
                  <span className="font-medium text-txt-primary">
                    {user?.displayName || user?.username || "você"}
                  </span>
                  <span className="ml-1.5 text-xs text-txt-muted">Hoje às 14:03</span>
                  <p className="text-txt-normal">Assim ficam as mensagens no modo padrão.</p>
                </div>
              </div>
              <div className="flex gap-3" style={{ marginTop: `${s.groupSpacing}px` }}>
                <div className="h-10 w-10 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <div>
                  <span className="font-medium text-txt-primary">newdisc</span>
                  <span className="ml-1.5 text-xs text-txt-muted">Hoje às 14:04</span>
                  <p className="text-txt-normal">E este é o respiro entre grupos.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </Section>
    </>
  );
}
