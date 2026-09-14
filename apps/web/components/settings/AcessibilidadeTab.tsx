"use client";

import { Paintbrush } from "@/components/ui/icones";
import { useIrParaAba } from "@/components/settings/navegacao";
import PreviaDeMensagens from "@/components/settings/PreviaDeMensagens";
import {
  ConfiguracoesRelacionadas,
  RadioCards,
  Section,
  Slider,
  Toggle,
} from "@/components/ui/controls";
import { useT } from "@/lib/i18n";
import { EMOJI_SIZE, useSettings, type SendMode } from "@/stores/settings";

/**
 * Acessibilidade: legibilidade, cor e contraste, movimento, figurinhas, texto
 * para fala e o que o Enter faz no composer.
 *
 * Os controles moram em **seções nomeadas**, e é isso que dá o menu de segundo
 * nível (ver `settings/tabs.tsx`). Numa página contínua de poucos controles a
 * divisão parece cerimônia; ela existe porque a página cresce, e porque a
 * pessoa que procura "movimento" precisa achar sem ler tudo.
 *
 * A prévia no topo é a mesma da aba de Aparência, de propósito: metade destas
 * preferências (tamanho do emoji, hora sempre visível) só quer dizer alguma
 * coisa vendo.
 *
 * "Reduzir movimento" e a saturação viram classe/variável no `<html>` (ver
 * `stores/settings`), então valem para a interface inteira e não só para as
 * telas que lembrarem de olhar a preferência.
 *
 * A aba de Acessibilidade do Discord (artigo de suporte
 * `discord-basics/1500010454681-accessibility-settings-tab`, ids 01–12 do
 * catálogo) tem, além do que já existia aqui, **Contraste alto** (topo da
 * aba), **animação de figurinha** (sempre / ao interagir / nunca) e
 * **texto para fala** (permitir `/tts`, velocidade, prévia). Nenhum dos três
 * tem estado no produto hoje: `stores/settings.ts` não guarda contraste nem
 * preferência de animação de figurinha, e não há nenhuma implementação de
 * texto para fala (`grep -ri "text-to-speech\|/tts"` no repo não acha nada).
 * Pela §6.6 do PROCESSO, funcionalidade que o Streamz não tem não se inventa:
 * os três aparecem **visíveis e desabilitados**, com a dica "(em breve)" —
 * não somem da aba (o Discord os tem, e a régua é medida na peça, não editada
 * pela ausência de back-end), mas também não fingem funcionar.
 *
 * Os rótulos e dicas de "(em breve)" usam string solta em vez de `t(...)`
 * porque `lib/i18n.ts` está fora da lista de arquivos deste cartão — só o
 * sufixo "(em breve)" vem de `t("aparencia.emBreve")`, chave que já existe
 * nos dois idiomas e ainda não tinha uso. Ver "faltando" no retrato do
 * cartão: as nove chaves novas (`acess.contrasteAlto`, `acess.figurinhas*`,
 * `acess.tts*`) precisam entrar em `lib/i18n.ts` para a aba ficar em inglês
 * também.
 */
export default function AcessibilidadeTab() {
  const t = useT();
  const s = useSettings();
  const irParaAba = useIrParaAba();
  const emBreve = `(${t("aparencia.emBreve")})`;

  return (
    <>
      <Section title={t("aparencia.previa")} semDivisoria>
        <PreviaDeMensagens />
      </Section>

      <Section id="legibilidade" title={t("acess.secLegibilidade")}>
        <Slider
          label={t("acess.tamanhoEmoji")}
          value={s.emojiSize}
          min={EMOJI_SIZE.min}
          max={EMOJI_SIZE.max}
          step={EMOJI_SIZE.step}
          format={(v) => `${v}px`}
          onChange={(emojiSize) => s.set({ emojiSize })}
        />
        <Toggle
          label={t("acess.mostrarHora")}
          checked={s.alwaysShowTime}
          onChange={(alwaysShowTime) => s.set({ alwaysShowTime })}
        />
      </Section>

      <Section id="cor" title={t("acess.secCor")}>
        <Slider
          label={t("acess.saturacao")}
          value={s.saturation}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(saturation) => s.set({ saturation })}
        />
        {/* Discord: "Contraste alto" fica no topo da aba, antes da saturação
            (artigo de suporte, seção "High-Contrast Mode on Desktop"). Aqui
            entra depois porque a saturação já é o controle real desta seção
            — abrir a seção "Cor e contraste" com um controle desabilitado
            venderia a peça errada como a principal. */}
        <Toggle
          label="Contraste alto"
          hint={`Aumenta o contraste dos elementos de interface, em qualquer tema. ${emBreve}`}
          checked={false}
          onChange={() => {}}
          disabled
        />
      </Section>

      <Section id="movimento" title={t("acess.secMovimento")}>
        <Toggle
          label={t("acess.reduzirMovimento")}
          hint={t("acess.reduzirMovimentoAjuda")}
          checked={s.reduceMotion}
          onChange={(reduceMotion) => s.set({ reduceMotion })}
        />
      </Section>

      <Section id="figurinhas" title="Figurinhas">
        <p className="mb-3 text-sm text-text-muted">
          Controla quando as figurinhas animadas tocam a animação. Hoje toda
          figurinha só tem o comportamento nativo da imagem
          (components/media/StickerView.tsx desenha uma imagem simples, sem
          controle próprio), o mais parecido com &quot;sempre animar&quot; das
          três opções do Discord.
        </p>
        <RadioCards<"sempre" | "interacao" | "nunca">
          legend="Animação de figurinha"
          legendaOculta
          value="sempre"
          onChange={() => {}}
          columns={3}
          options={[
            { value: "sempre", label: "Sempre animar", disabled: true },
            { value: "interacao", label: "Ao interagir", disabled: true },
            { value: "nunca", label: "Nunca animar", disabled: true },
          ]}
        />
        <p className="mt-2 text-xs text-text-muted">{emBreve}</p>
      </Section>

      <Section id="texto-para-fala" title="Texto para fala">
        <Toggle
          label="Permitir o uso do comando /tts"
          hint={`Mensagens enviadas com /tts são lidas em voz alta para quem está no canal. ${emBreve}`}
          checked={false}
          onChange={() => {}}
          disabled
        />
      </Section>

      <Section id="chat" title={t("acess.secChat")} semDivisoria>
        <RadioCards<SendMode>
          legend={t("acess.enviarCom")}
          value={s.sendMode}
          onChange={(sendMode) => s.set({ sendMode })}
          options={[
            { value: "enter", label: t("acess.enter") },
            { value: "ctrl-enter", label: t("acess.ctrlEnter") },
          ]}
        />
      </Section>

      <ConfiguracoesRelacionadas
        titulo={t("config.relacionadas")}
        itens={[
          {
            id: "aparencia",
            label: t("aba.aparencia"),
            hint: t("aparencia.mensagens"),
            icon: <Paintbrush size={18} />,
            onSelect: () => irParaAba("aparencia"),
          },
        ]}
      />
    </>
  );
}
