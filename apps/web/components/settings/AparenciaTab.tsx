"use client";

import Avatar from "@/components/ui/Avatar";
import { PontoDeRadio, Section, Slider, Toggle } from "@/components/ui/controls";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/stores/auth";
import { FONT_SCALE, GROUP_SPACING, ZOOM, useSettings } from "@/stores/settings";
import { ui } from "@/stores/ui";

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
  const user = useAuth((s) => s.user);
  const s = useSettings();

  return (
    <>
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
                <span className="mr-1 font-medium text-txt-primary">streamz</span>
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
                  <span className="font-medium text-txt-primary">streamz</span>
                  <span className="ml-1.5 text-xs text-txt-muted">Hoje às 14:04</span>
                  <p className="text-txt-normal">E este é o respiro entre grupos.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </Section>

      <Section title={t("aparencia.tema")}>
        <EscolhaDeTema />
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

      <Section semDivisoria>
        <button
          type="button"
          onClick={() => s.reset()}
          className="h-9 rounded-[3px] border border-border-strong px-3 text-sm font-medium text-txt-normal transition hover:bg-hov"
        >
          {t("config.restaurar")}
        </button>
      </Section>
    </>
  );
}

type Tema = "dark" | "light" | "sync";

/**
 * Os três temas do Discord como miniaturas ilustradas com bolinha de rádio.
 *
 * Só o escuro está implementado (a paleta clara não existe em `globals.css`),
 * mas as três opções aparecem: o MVP é escuro por decisão de design, não por
 * incapacidade da tela, e esconder as outras faria a aba parecer quebrada. Quem
 * escolhe uma delas recebe o aviso em vez de uma interface meio pintada.
 */
function EscolhaDeTema() {
  const t = useT();
  const tema = useSettings((s) => s.theme) as Tema;

  const opcoes: { value: Tema; label: string }[] = [
    { value: "dark", label: t("aparencia.escuro") },
    { value: "light", label: t("aparencia.claro") },
    { value: "sync", label: "Sincronizar com o computador" },
  ];

  return (
    <div role="radiogroup" aria-label={t("aparencia.tema")} className="grid grid-cols-3 gap-3 py-3">
      {opcoes.map((o) => {
        const ativo = o.value === tema;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => {
              if (o.value === "dark") return;
              ui.toast("O tema claro ainda está a caminho — por enquanto só o escuro.");
            }}
            className={`overflow-hidden rounded-[6px] border text-left transition ${
              ativo ? "border-accent" : "border-border hover:border-border-strong-hover"
            }`}
          >
            <MiniaturaDeTema variante={o.value} />
            <span className="flex items-center gap-2 px-2.5 py-2">
              <PontoDeRadio ativo={ativo} />
              <span className="min-w-0 truncate text-sm font-medium text-txt-primary">
                {o.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Um app de três colunas em miniatura — o mesmo desenho que o Discord usa. */
function MiniaturaDeTema({ variante }: { variante: Tema }) {
  const claro = variante === "light";
  const fundo = claro ? "#FFFFFF" : "#1A1A20";
  const painel = claro ? "#E8E8EC" : "#141419";
  const rail = claro ? "#D2D2DA" : "#0B0B0F";
  const linha = claro ? "#B8B8C2" : "#35353F";

  return (
    <span
      aria-hidden="true"
      className="relative flex h-[68px] w-full overflow-hidden"
      style={{ backgroundColor: fundo }}
    >
      <span className="h-full w-[14%]" style={{ backgroundColor: rail }} />
      <span className="h-full w-[26%]" style={{ backgroundColor: painel }} />
      <span className="flex flex-1 flex-col justify-center gap-1.5 px-2">
        <span className="block h-1.5 w-full rounded-full" style={{ backgroundColor: linha }} />
        <span className="block h-1.5 w-3/4 rounded-full" style={{ backgroundColor: linha }} />
        <span className="block h-1.5 w-1/2 rounded-full" style={{ backgroundColor: linha }} />
      </span>
      {/* "sincronizar" é a metade clara sobreposta à escura, como o Discord */}
      {variante === "sync" && (
        <span
          className="absolute inset-y-0 right-0 w-1/2"
          style={{
            backgroundColor: "#FFFFFF",
            clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
            opacity: 0.9,
          }}
        />
      )}
    </span>
  );
}
