"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Mic, RefreshCw } from "@/components/ui/icones";
import { type NotificationLevel } from "@streamz/shared";
import {
  ConfiguracoesRelacionadas,
  RadioCards,
  Row,
  Section,
  Switch,
  Toggle,
} from "@/components/ui/controls";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import { isTauri } from "@/lib/desktop";
import { SONS, useSons, type NomeDeSom } from "@/stores/sons";
import { useT } from "@/lib/i18n";
import { tocarSom } from "@/lib/ringtone";
import { useGlobalSetting, useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";
import { useIrParaAba } from "@/components/settings/navegacao";

/**
 * Notificações: os interruptores locais (desktop, som, contador no ícone,
 * "não perturbe"), a lista de sons por evento e o **padrão** de nível, que é
 * do servidor.
 *
 * A separação é de propósito: se notificar neste dispositivo é preferência
 * daqui; quanto um servidor notifica precisa valer no celular também.
 *
 * Redesenho (cartão 6i-notificacoes) contra o print 1:1 real da aba
 * (`docs/Reference/Captura de tela 2026-09-01 114554.png` e `…114605.png`,
 * cliente pt-BR): os textos de dica de "Ativar notificações na área de
 * trabalho"/"Ativar indicador de mensagens não lidas" e o cartão
 * "Configurações relacionadas → Voz e vídeo" vêm de lá, palavra por palavra.
 *
 * **`components/settings/tabs.tsx` (fora da lista) já fixa as 3 seções desta
 * aba** — `secoes: [{id:"dispositivo"},{id:"padrao"},{id:"sons"}]` — e é
 * dali que sai o menu de segundo nível. Por isso as seções continuam sendo
 * estas três (não as 5 do Discord — Visão geral/Sons/Insígnias/E-mail/
 * Avançado): o print mede o **conteúdo**, os `id` continuam os que já
 * existem. A ordem de renderização abaixo (dispositivo → padrão → sons)
 * passa a bater com a ordem declarada em `tabs.tsx:159-163` — antes o JSX
 * media dispositivo → sons → padrão, descasado do menu (quem clicasse em
 * "Sons" no menu, que vem antes de "Padrão" nessa lista mas depois dele na
 * tela, rolava para um lugar “fora de ordem” da leitura).
 *
 * Bloco "Notifique-me quando…" do Discord (6 alternâncias de atividade +
 * seletor de reação) e as seções "Insígnias"/"E-mail" inteiras: ver
 * "faltando" no retrato do cartão — pedem `id` novo em `tabs.tsx` e chaves
 * novas em `lib/i18n.ts`, os dois fora da lista deste cartão.
 */
export default function NotificacoesTab() {
  const t = useT();
  const s = useSettings();
  const global = useGlobalSetting();
  const loaded = useNotifications((st) => st.loaded);
  const load = useNotifications((st) => st.load);
  const falhouCarregar = useNotifications((st) => st.falhouCarregar);
  const recarregar = useNotifications((st) => st.recarregar);
  const setGlobalLevel = useNotifications((st) => st.setGlobalLevel);
  const permissaoBloqueada = usePermissaoDeNotificacaoBloqueada();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  return (
    <>
      <Section id="dispositivo" title={t("notif.esteDispositivo")}>
        <Toggle
          label={t("notif.desktop")}
          // Medido no print (`…114554.png`, "Ativar notificações na área de
          // trabalho"): a dica aponta para o silêncio por canal/servidor, que
          // aqui é o menu do botão direito no ícone do servidor
          // (`lib/notification-menu.tsx`, submenu rotulado com `aba.notificacoes`
          // — "Notificações" — não "Configurações de notificação" como no
          // Discord, por isso o texto abaixo usa o nosso rótulo real).
          hint={
            <>
              Para configurar por canal ou por servidor, clique com o botão
              direito no ícone do servidor e abra &quot;Notificações&quot;.
              {permissaoBloqueada && (
                <span className="mt-1.5 flex items-start gap-1.5 text-status-warning">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {/* Texto próprio — o Discord não tem este aviso nas referências
                      capturadas ("não medido"); o navegador bloqueou de vez
                      (Notification.permission === "denied") e só o próprio
                      navegador desbloqueia, então não há botão de repetir aqui. */}
                  As notificações estão bloqueadas nas permissões do navegador.
                  Permita-as lá para recebê-las aqui.
                </span>
              )}
            </>
          }
          checked={s.desktopNotifications}
          onChange={(desktopNotifications) => s.set({ desktopNotifications })}
        />
        <Toggle
          label="Ativar alerta na barra de tarefas"
          // Discord tem (print `…114554.png`); `stores/settings.ts` não guarda
          // preferência de piscar a barra de tarefas e o desktop
          // (`lib/desktop.ts`) não tem esse aceno implementado. §6.6 do
          // PROCESSO: fica visível e desabilitado, não some.
          hint={`Pisca o ícone do aplicativo na barra de tarefas ao receber notificações. (${t("aparencia.emBreve")})`}
          checked={false}
          onChange={() => {}}
          disabled
        />
        <Toggle
          label={t("notif.badge")}
          // Medido no print (`…114605.png`, "Ativar indicador de mensagens não
          // lidas", seção "Insígnias" do Discord — mora aqui porque
          // `tabs.tsx` não abre uma seção própria para ela, ver cabeçalho).
          hint="Mostra um indicador vermelho no ícone do aplicativo quando houver mensagens não lidas."
          checked={s.badgeCount}
          onChange={(badgeCount) => s.set({ badgeCount })}
        />
        <Toggle
          label={t("notif.dnd")}
          hint={t("notif.dndAjuda")}
          checked={s.dndSilencesAll}
          onChange={(dndSilencesAll) => s.set({ dndSilencesAll })}
        />
      </Section>

      {/* Sem `semDivisoria`: a reordenação (ver cabeçalho) tirou esta seção
          do fim da página — ela ganhou uma vizinha depois dela ("Sons") e
          agora precisa da mesma divisória que separa "Neste dispositivo" de
          "Padrão", ou as duas leriam como um bloco só. */}
      <Section id="padrao" title={t("notif.padrao")}>
        {falhouCarregar ? (
          // Mesmo bloco ícone+mensagem+"Tentar de novo" de `SegurancaTab.tsx`/
          // `server/EngajamentoTab.tsx` (`BlocoDeErro`) para a mesma falha:
          // sem ele, `global?.level` caindo no padrão "ALL" (ver comentário
          // abaixo) fazia uma preferência real "Nada" parecer "Todas as
          // mensagens" resolvida, quando na verdade a busca falhou.
          <BlocoDeErroDeCarregamento tentar={() => void recarregar()} />
        ) : loaded ? (
          <RadioCards<NotificationLevel>
            legend={t("notif.padrao")}
            legendaOculta
            columns={3}
            value={global?.level ?? "ALL"}
            onChange={(level) => void setGlobalLevel(level)}
            options={[
              { value: "ALL", label: t("notif.tudo") },
              { value: "MENTIONS", label: t("notif.mencoes") },
              { value: "NONE", label: t("notif.nada") },
            ]}
          />
        ) : (
          // Enquanto `loaded` é falso, `global?.level` cai no valor-padrão
          // "ALL" — sem o esqueleto, uma preferência real "Nada" pisca como
          // "Todas as mensagens" por um instante a cada abertura da aba.
          <div role="status" aria-live="polite" className="py-3">
            <span className="sr-only">Carregando preferência padrão…</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[52px] animate-pulse rounded-[6px] bg-background-base-lowest"
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      <BlocoDeSons />
    </>
  );
}

/**
 * Erro persistente de carregamento do padrão global: o par
 * ícone+mensagem+"Tentar de novo" que `SegurancaTab.tsx`/
 * `server/EngajamentoTab.tsx` já usam para a mesma falha (caixa
 * `rounded-[4px] border border-border-subtle bg-background-base-lowest`,
 * `AlertTriangle` em `--status-warning`, botão secundário com `RefreshCw`).
 * Repetido aqui em vez de extraído porque as três fontes vivem em
 * `components/settings/*.tsx`, fora da lista de arquivos deste cartão — mover
 * para um lugar comum é trabalho de outro cartão, não deste.
 */
function BlocoDeErroDeCarregamento({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">
          Não foi possível carregar a preferência padrão.
        </p>
      </div>
      <Button
        variante="secundario"
        tamanho="sm"
        icone={<RefreshCw size={14} aria-hidden="true" />}
        onClick={tentar}
        className="shrink-0 celular:h-[44px]"
      >
        Tentar de novo
      </Button>
    </div>
  );
}

/**
 * `true` quando o navegador **negou de vez** a permissão de notificação
 * (`Notification.permission === "denied"`) — nunca durante o Tauri: lá a
 * permissão é do plugin nativo (`lib/desktop.ts`, `prepararNotificacoes`),
 * negociada no boot, e o `Notification` do DOM não reflete esse estado.
 *
 * Prefere `navigator.permissions.query` (evento `onchange`, sem sondagem) e
 * cai para a leitura única de `Notification.permission` onde a API não
 * existe (Safari) — as duas são best-effort: nenhuma lança.
 */
function usePermissaoDeNotificacaoBloqueada(): boolean {
  const [bloqueada, setBloqueada] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || isTauri()) return;
    setBloqueada(Notification.permission === "denied");

    let status: PermissionStatus | undefined;
    let cancelado = false;
    // `navigator.permissions` some em navegadores mais antigos (Safari <16) —
    // sem o `if`, `?.query(...)` vira `undefined` e o `.then` seguinte
    // lançaria "Cannot read properties of undefined".
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((s) => {
          if (cancelado) return;
          status = s;
          setBloqueada(Notification.permission === "denied");
          status.onchange = () => setBloqueada(Notification.permission === "denied");
        })
        .catch(() => {
          // `permissions.query` sem suporte para "notifications": fica só a
          // leitura de cima, sem atualização ao vivo se a pessoa mudar o
          // navegador com a aba aberta.
        });
    }

    return () => {
      cancelado = true;
      if (status) status.onchange = null;
    };
  }, []);

  return bloqueada;
}

/**
 * "Ativar sons de notificação" e, dentro dele, um interruptor por som.
 *
 * A lista fica recolhida porque são treze linhas para uma preferência que quase
 * ninguém abre — mas quando incomoda, incomoda por *um* som só, e é esse que
 * precisa ser desligável sem calar o resto.
 */
/** Quantos sons ficam à vista antes do "mostrar mais" (o print mostra quatro). */
const SONS_A_VISTA = 4;

/**
 * A lista de sons, um por evento.
 *
 * Cada linha tem o seu interruptor e o seu **"Prévia do som"** — e a prévia é
 * um link sob o rótulo, não um ícone no canto: o que se está decidindo ali é
 * "quero ouvir isto?", e a única forma de responder é ouvindo. Um alto-falante
 * mudo à direita fazia a prévia parecer o próprio controle de volume. (O
 * link "Prévia do som" embaixo do rótulo é exatamente a forma medida no
 * print `…114605.png` — "Nova mensagem" / "Prévia do som" / switch.)
 *
 * Só os primeiros ficam à vista. São treze eventos — a maioria de chamada
 * (entrar, sair, mudo…), que no Discord mede mora em Voz e vídeo, não aqui
 * (`stores/sons.ts`, fora da lista deste cartão) — e a lista inteira aberta
 * empurra o resto da página para fora da tela por uma preferência que quase
 * ninguém mexe; o resto entra num "mostrar mais" que diz o que tem lá dentro.
 */
function BlocoDeSons() {
  const t = useT();
  const s = useSettings();
  const desligados = useSons((st) => st.desligados);
  const alternar = useSons((st) => st.alternar);
  const irParaAba = useIrParaAba();
  const [aberto, setAberto] = useState(false);

  function ouvir(nome: NomeDeSom) {
    // a prévia toca mesmo o som desligado (e mesmo com o interruptor mestre
    // desligado): é justamente o som que a pessoa está avaliando. Vale também
    // para "Movido de canal", que ainda não tem nenhum evento que o dispare.
    //
    // "chamada" sai numa passada só, sem o loop da chamada de verdade — e no
    // mesmo volume dela, porque quem decide é `volumeDoSom` e não este botão.
    tocarSom(nome, { forcar: true });
  }

  const visiveis = aberto ? SONS : SONS.slice(0, SONS_A_VISTA);
  const escondidos = SONS.slice(SONS_A_VISTA);

  return (
    <Section id="sons" title={t("notif.sons")}>
      {/* Discord mostra o interruptor mestre invertido: "Desativar todos os
          sons de notificação" — ligado = silencia. `notificationSound`
          continua gravado do jeito de sempre ("ligado" = toca); só a tela
          inverte o que mostra e o que escreve de volta, com `!` dos dois
          lados (`checked={!s.notificationSound}` e `set({notificationSound:
          !v})`), para não arriscar um valor persistido ao contrário do resto
          do produto (`stores/sons.ts`, `lib/ringtone.ts`, que leem
          `notificationSound` como "ligado = toca"). */}
      <Row
        label={t("notif.desativarSons")}
        hint="Sem isto, notificação nenhuma faz barulho neste aparelho."
        control={
          <Switch
            checked={!s.notificationSound}
            onChange={(v) => s.set({ notificationSound: !v })}
            label={t("notif.desativarSons")}
          />
        }
      />

      <div className={s.notificationSound ? "" : "opacity-50"}>
        {visiveis.map((som) => (
          <Row
            key={som.nome}
            label={som.rotulo}
            hint={
              <Button
                variante="link"
                tamanho="xs"
                onClick={() => ouvir(som.nome)}
                className="celular:inline-flex celular:min-h-[44px] celular:items-center"
              >
                Prévia do som
              </Button>
            }
            control={
              <Switch
                checked={!desligados[som.nome]}
                onChange={(v) => alternar(som.nome, v)}
                label={som.rotulo}
                disabled={!s.notificationSound}
              />
            }
          />
        ))}
      </div>

      {escondidos.length > 0 && (
        <Row
          label={aberto ? "Mostrar menos sons" : `Mostrar ${escondidos.length} mais sons`}
          // dizer quais são: sem isso, "mostrar mais 6" não informa se vale abrir
          hint={escondidos
            .slice(0, 3)
            .map((som) => som.rotulo)
            .join(", ")
            .concat(escondidos.length > 3 ? " e mais" : "")}
          control={
            <BotaoDeIcone
              rotulo={aberto ? "Mostrar menos sons" : "Mostrar mais sons"}
              aria-expanded={aberto}
              onClick={() => setAberto((v) => !v)}
              tamanho="md"
              comFundo
              // a linha já diz "mostrar mais/menos sons" — dica repetiria o óbvio
              semDica
              className="celular:h-[44px] celular:w-[44px]"
              icone={
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className={`transition-transform ${aberto ? "-rotate-90" : "rotate-90"}`}
                />
              }
            />
          }
        />
      )}

      {/* Medido no print (`…114605.png`): depois da lista de sons, um cartão
          "Configurações relacionadas → Voz e vídeo" — o texto é o mesmo do
          Discord ("Habilite/desative sons que tocam quando você está em uma
          chamada, como silenciar, dessilenciar, desativar áudio e mais."),
          porque é literalmente o que fica em `VozTab.tsx` (fora da lista) —
          os sons de chamada de `stores/sons.ts` que a lista acima nem mostra
          por padrão. */}
      <ConfiguracoesRelacionadas
        titulo="Configurações relacionadas"
        itens={[
          {
            id: "voz",
            label: t("aba.voz"),
            hint: "Habilite/desative sons que tocam quando você está em uma chamada, como silenciar, dessilenciar, desativar áudio e mais.",
            icon: <Mic size={18} aria-hidden="true" />,
            onSelect: () => irParaAba("voz"),
          },
        ]}
      />

      {/* Discord tem, além disto, um bloco "Notifique-me quando…" (6
          alternâncias de atividade) e "Alguém reage às minhas mensagens" (um
          `<select>`, não um interruptor) dentro de "Visão geral" — print
          `…114554.png`. Sem seção própria para "Visão geral" em `tabs.tsx`
          (ver cabeçalho do arquivo) não há onde encaixá-los sem fingir que
          moram em "Neste dispositivo" ou em "Sons"; ver "faltando" no
          retrato do cartão. */}
    </Section>
  );
}
