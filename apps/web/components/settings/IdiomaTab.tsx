"use client";

import { RadioGroup, type OpcaoDeRadio } from "@/components/ui/primitivos";
import { LOCALES, NOMES_DE_IDIOMA, useT } from "@/lib/i18n";
import { useSettings, type Locale } from "@/stores/settings";

/**
 * Idioma do app. O dicionário cobre as telas de configuração (ver `lib/i18n`);
 * o resto do app segue em pt-BR até alguém acrescentar as chaves.
 *
 * Cada linha traz o nome **no próprio idioma** à esquerda e, à direita, o
 * nome em inglês seguido da bandeira — quem abre a tela sem entender a
 * língua atual encontra a sua pelo endônimo ou pela bandeira, que é
 * justamente o caso de uso desta aba.
 *
 * Redesenho (cartão 6k-teclado-idioma): a tela de "Idioma" do Discord é uma
 * **lista de uma coluna** — rádio e nome à esquerda, exônimo e bandeira à
 * direita na mesma linha —, não a grade de 2 colunas que esta aba tinha
 * antes. Referência: `docs/referencias-discord/suporte/imagens/
 * discord-basics/216406447-how-can-i-change-discord-s-language/02.jpg`
 * (captura de suporte de um cliente antigo — a régua de autoridade do
 * ADR-0009 rebaixa isso a "proporção e ordem, nunca px", então a estrutura
 * (coluna única, nome↔exônimo+bandeira, cabeçalho maiúsculo) vem dali, mas
 * nenhuma medida em pixel desta captura foi usada).
 *
 * O rádio em si troca o `PontoDeRadio` (`components/ui/controls.tsx`, fora
 * do vocabulário de primitivos) pelo `RadioGroup` de
 * `components/ui/primitivos` — o círculo de 20px com ponto interno de 8px e
 * a animação de entrada/saída medidos no cartão 0.4-controles, em vez de
 * redesenhar um rádio próprio aqui (regra do cabeçalho deste tipo de
 * cartão). O cabeçalho "IDIOMA DO APP" reaproveita a chave `idioma.escolha`
 * que já existia (só como `aria-label`) em vez de criar uma chave nova: os
 * dois arquivos editáveis por este cartão não incluem `lib/i18n.ts` — ver
 * "faltando".
 *
 * A bandeira do Discord é um ícone PNG **16×12** (`.flagIcon__45b6e{height:
 * 12px;width:16px}`, `css-bruto/sob-demanda/926787.3ad3e66d17a49d3a.css`);
 * sem esse acervo de bandeiras no app (não é ícone do Phosphor/lucide nem do
 * acervo de `icones.tsx`, e adquirir um é fora do escopo deste cartão), o
 * emoji continua — só menor (`text-base`, não `text-2xl` como antes) para
 * pesar mais perto do tamanho medido. Ver "faltando".
 */

/** Bandeira e endônimo/exônimo de cada idioma que o app oferece. */
const IDIOMAS: Record<Locale, { bandeira: string; nativo: string; ingles: string }> = {
  "pt-BR": { bandeira: "🇧🇷", nativo: "Português do Brasil", ingles: "Brazilian Portuguese" },
  "en-US": { bandeira: "🇺🇸", nativo: "English, US", ingles: "English, US" },
};

export default function IdiomaTab() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const set = useSettings((s) => s.set);

  // `LOCALES` é uma constante estática com 2 entradas — não existe "vazio"
  // real para esta lista (ver o mesmo raciocínio em `TecladoTab`).
  const opcoes: OpcaoDeRadio<Locale>[] = LOCALES.map((l) => {
    const info = IDIOMAS[l];
    return {
      valor: l,
      rotulo: (
        <span className="flex w-full items-center justify-between gap-3">
          <span className="min-w-0 truncate">{info?.nativo ?? NOMES_DE_IDIOMA[l]}</span>
          <span className="flex shrink-0 items-center gap-2">
            {info && info.ingles !== info.nativo && (
              <span className="truncate text-text-sm text-text-muted">{info.ingles}</span>
            )}
            <span aria-hidden="true" className="text-base leading-none">
              {info?.bandeira ?? "🏳️"}
            </span>
          </span>
        </span>
      ),
    };
  });

  return (
    <>
      {/* Cabeçalho da lista — o mesmo padrão maiúsculo/sutil das outras abas
          de Configurações (`VozTab`, `PerfilTab`, `SegurancaTab`): `text-xs
          font-bold uppercase tracking-[0.02em] text-text-subtle`. */}
      <h2 className="mb-2 text-text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
        {t("idioma.escolha")}
      </h2>

      <RadioGroup
        valor={locale}
        aoMudar={(l) => set({ locale: l })}
        opcoes={opcoes}
        nome="idioma"
        legenda={t("idioma.escolha")}
        legendaOculta
      />

      <p className="pt-1 text-text-xs text-text-muted">{t("idioma.ajuda")}</p>
    </>
  );
}
