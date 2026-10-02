"use client";

import type { ReactNode } from "react";
import {
  AFK_TIMEOUTS_SECONDS,
  isAfkTimeoutSeconds,
  MAX_WELCOME_CHANNELS,
  MAX_WELCOME_DESCRIPTION,
  type GuildDefaultNotifications,
} from "@streamz/shared";
import { AlertTriangle, Hash, RefreshCw } from "@/components/ui/icones";
import { Switch } from "@/components/ui/controls";
import { Button, Campo, Checkbox, RadioGroup, Select, TextArea, TextInput } from "@/components/ui/primitivos";
import { ESTILO_ROTULO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { useOnboarding } from "@/components/settings/server/onboarding-form";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { API_URL } from "@/lib/config";
import { ui } from "@/stores/ui";

/**
 * "Engajamento": o que o servidor faz sozinho — mensagens do sistema, feed,
 * notificação padrão, canal de ausentes, widget — e a tela de boas-vindas, que
 * fica no fim para não perder o recurso. Mesma ordem e textos da página do
 * Discord; medidas de seção iguais às de `AcessoTab.tsx`.
 *
 * Estados: carregando (texto simples), erro de busca (`BlocoDeErro` com
 * "Tentar de novo") e sem canal de texto (seletor desabilitado com dica). Sem
 * permissão não existe aqui: o menu já esconde a aba de quem não tem
 * `MANAGE_GUILD`. Hover/foco/desabilitado vêm dos primitivos.
 *
 * A URL do widget (`GET /guilds/:id/widget.json`, pública) aparece num campo
 * somente leitura com "Copiar" quando o widget está ligado; a base é `API_URL`.
 */

const ROTULO_DO_LIMITE: Record<(typeof AFK_TIMEOUTS_SECONDS)[number], string> = {
  60: "1 minuto",
  300: "5 minutos",
  900: "15 minutos",
  1800: "30 minutos",
  3600: "1 hora",
};

const MENSAGENS_DO_SISTEMA = [
  ["systemWelcomeMessage", "Enviar uma mensagem aleatória de boas-vindas quando alguém entrar nesse servidor."],
  ["systemWelcomeSticker", "Incentive membros a responderem mensagens de boas-vindas com uma figurinha."],
  ["systemBoostMessage", "Enviar uma mensagem quando alguém impulsionar esse servidor."],
  ["systemTips", "Enviar dicas úteis para configuração do servidor."],
] as const;

export default function EngajamentoTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const categorias = useCategories((s) => s.categories);
  const textos = channels.filter((c) => c.type === "TEXT");
  const vozes = channels.filter((c) => c.type === "VOICE");
  const { form, patch, carregando, falhouCarregar, recarregar } = useOnboarding(guildId);

  if (falhouCarregar && !form) {
    return (
      <>
        <TituloDaPagina titulo="Engajamento" />
        <BlocoDeErro tentar={recarregar} />
      </>
    );
  }

  if (!form) {
    return (
      <>
        <TituloDaPagina titulo="Engajamento" />
        {/* `carregando` é sempre `true` aqui: a outra causa de `form` nulo é o
            bloco de erro acima, que já retornou. */}
        {carregando && <p className="text-sm text-text-muted">Carregando…</p>}
      </>
    );
  }

  function alternarDestaque(channelId: string) {
    if (!form) return;
    const atuais = form.welcomeChannelIds;
    if (atuais.includes(channelId)) {
      patch({ welcomeChannelIds: atuais.filter((id) => id !== channelId) });
      return;
    }
    if (atuais.length >= MAX_WELCOME_CHANNELS) {
      ui.toast(`No máximo ${MAX_WELCOME_CHANNELS} canais em destaque.`, "error");
      return;
    }
    patch({ welcomeChannelIds: [...atuais, channelId] });
  }

  function opcaoDeCanal(c: (typeof channels)[number], padrao: string) {
    const categoria = categorias.find((k) => k.id === c.categoryId)?.name ?? padrao;
    return {
      valor: c.id,
      rotulo: c.name ?? "canal",
      prefixo: <Hash size={16} aria-hidden="true" className="text-text-subtle" />,
      sufixo: <span className="text-xs font-semibold uppercase text-text-muted">{categoria}</span>,
    };
  }

  const destacadosNoLimite = form.welcomeChannelIds.length >= MAX_WELCOME_CHANNELS;
  const semCanalDeTexto = textos.length === 0;

  return (
    <>
      <TituloDaPagina
        titulo="Engajamento"
        subtitulo="Gerencie configurações que ajudam a manter seu servidor ativo."
      />

      <Secao
        titulo="Mensagens do Sistema"
        descricao="Configurar Mensagens de Evento do sistema Enviadas para o seu servidor."
        primeira
      >
        <div className="flex flex-col gap-4">
          {MENSAGENS_DO_SISTEMA.map(([chave, rotulo]) => (
            <LinhaDeInterruptor
              key={chave}
              rotulo={rotulo}
              marcado={form[chave]}
              aoMudar={(v) => patch({ [chave]: v })}
            />
          ))}
        </div>
        <div className="mt-6 flex items-start justify-between gap-6 celular:flex-col">
          <div className="min-w-0">
            <p className="text-text-md font-medium text-text-strong">Canal de mensagens do sistema</p>
            <p className="mt-1 text-sm text-text-muted">
              {semCanalDeTexto
                ? "Crie um canal de texto para poder escolher um."
                : "Este é o canal para o qual enviamos mensagens de evento do sistema."}
            </p>
          </div>
          <Select
            id="canal-do-sistema"
            rotulo="Canal de mensagens do sistema"
            className="w-[320px] max-w-full shrink-0"
            valor={form.systemChannelId ?? ""}
            aoMudar={(id) => patch({ systemChannelId: id || null })}
            desabilitado={semCanalDeTexto}
            opcoes={[
              { valor: "", rotulo: "Nenhum" },
              ...textos.map((c) => opcaoDeCanal(c, "Canais de texto")),
            ]}
          />
        </div>
      </Secao>

      <Secao
        titulo="Configurações do feed de atividades"
        descricao="Exibe um feed de atividade de jogos e aplicativos conectados neste servidor."
      >
        <LinhaDeInterruptor
          rotulo="Exibir feed de atividade neste servidor"
          marcado={form.activityFeed}
          aoMudar={(v) => patch({ activityFeed: v })}
        />
      </Secao>

      <Secao
        titulo="Configurações de notificação padrão"
        descricao="Isso determinará se membros que não definiram suas configurações de notificação receberão ou não uma notificação por cada mensagem enviada neste servidor."
      >
        <RadioGroup<GuildDefaultNotifications>
          nome="notificacao-padrao"
          legenda="Configurações de notificação padrão"
          legendaOculta
          className="!pt-0"
          valor={form.defaultNotifications}
          aoMudar={(v) => patch({ defaultNotifications: v })}
          opcoes={[
            { valor: "ALL", rotulo: "Todas as mensagens" },
            { valor: "MENTIONS", rotulo: "Apenas @menções" },
          ]}
        />
        <p className="mt-3 text-sm text-text-muted">
          Se seu servidor for da comunidade, recomendamos fortemente definir isso para apenas @menções.
        </p>
      </Secao>

      <Secao>
        <div className="grid grid-cols-2 gap-6 celular:grid-cols-1">
          <div>
            <label htmlFor="canal-afk" className={ESTILO_ROTULO}>
              Canal de ausentes
            </label>
            <Select
              id="canal-afk"
              valor={form.afkChannelId ?? ""}
              aoMudar={(id) => patch({ afkChannelId: id || null })}
              opcoes={[
                { valor: "", rotulo: "Sem canal de ausentes" },
                ...vozes.map((c) => opcaoDeCanal(c, "Canais de voz")),
              ]}
            />
          </div>
          <div>
            <label htmlFor="limite-afk" className={ESTILO_ROTULO}>
              Limite de ausência
            </label>
            <Select
              id="limite-afk"
              valor={String(form.afkTimeoutSeconds)}
              aoMudar={(v) => {
                const n = Number(v);
                if (isAfkTimeoutSeconds(n)) patch({ afkTimeoutSeconds: n });
              }}
              opcoes={AFK_TIMEOUTS_SECONDS.map((n) => ({ valor: String(n), rotulo: ROTULO_DO_LIMITE[n] }))}
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          Move membros automaticamente a este canal se eles ficarem inativos por mais tempo que o limite de
          ausência. Isso não afeta navegadores.
        </p>
      </Secao>

      <Secao
        titulo="Widget do servidor"
        descricao="Incorpore um widget de HTML no seu site para exibir seus membros online, canais de voz e link de convite."
      >
        <LinhaDeInterruptor
          rotulo="Ativar o widget do servidor"
          marcado={form.widgetEnabled}
          aoMudar={(v) => patch({ widgetEnabled: v })}
        />
        <p className="mt-3 text-sm text-text-muted">
          Ao ativar o widget, o seu perfil de servidor ficará visível para outros fora dos membros do servidor.
          Você pode controlar a privacidade do perfil em Configurações do servidor &gt; Perfil.
        </p>
        {form.widgetEnabled && (
          <div className="mt-3 flex items-center gap-2 celular:flex-col celular:items-stretch">
            <TextInput
              value={`${API_URL}/api/guilds/${guildId}/widget.json`}
              readOnly
              aria-label="URL do widget"
              tamanhoDoTexto="sm"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono [font-variant-ligatures:none]"
              classeDaCaixa="min-w-0 flex-1 celular:flex-none"
            />
            <Button
              variante="secundario"
              onClick={() => {
                const url = `${API_URL}/api/guilds/${guildId}/widget.json`;
                const escrita = navigator.clipboard?.writeText(url);
                if (!escrita) return ui.toast("Não foi possível copiar", "error");
                escrita.then(
                  () => ui.toast("Copiado"),
                  () => ui.toast("Não foi possível copiar", "error"),
                );
              }}
              className="shrink-0 celular:h-[48px]"
            >
              Copiar
            </Button>
          </div>
        )}
      </Secao>

      <Secao titulo="Tela de boas-vindas">
        <Campo
          rotulo="Mensagem de abertura"
          htmlFor="welcome-description"
          ajuda={`${(form.welcomeDescription ?? "").length}/${MAX_WELCOME_DESCRIPTION} caracteres.`}
        >
          <TextArea
            id="welcome-description"
            rows={3}
            value={form.welcomeDescription ?? ""}
            maxLength={MAX_WELCOME_DESCRIPTION}
            onChange={(e) => patch({ welcomeDescription: e.target.value })}
            placeholder="Conte em uma frase do que é este servidor."
          />
        </Campo>

        <p className={`${ESTILO_ROTULO} mt-6`}>Canais em destaque (até {MAX_WELCOME_CHANNELS})</p>
        <div className="flex flex-col gap-1">
          {semCanalDeTexto && <p className="text-sm text-text-muted">Nenhum canal de texto ainda.</p>}
          {textos.map((c) => {
            const marcado = form.welcomeChannelIds.includes(c.id);
            return (
              <Checkbox
                key={c.id}
                marcado={marcado}
                aoMudar={() => alternarDestaque(c.id)}
                rotulo={`#${c.name}`}
                // No limite, o que já está marcado segue clicável (para
                // desmarcar); o resto desabilita em vez de cair no toast.
                desabilitado={destacadosNoLimite && !marcado}
                className="rounded-lg px-2 py-1.5 hover:bg-interactive-background-hover"
              />
            );
          })}
        </div>
      </Secao>
    </>
  );
}

/** Seção da página: divisória de 1px 40px acima (menos a primeira), título 16px, texto 14px. */
function Secao({
  titulo,
  descricao,
  primeira = false,
  children,
}: {
  titulo?: string;
  descricao?: string;
  primeira?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      {!primeira && <div aria-hidden="true" className="my-10 h-px bg-border-subtle" />}
      {titulo && <h2 className="text-base font-semibold text-text-strong">{titulo}</h2>}
      {descricao && <p className="mt-1.5 text-sm text-text-muted">{descricao}</p>}
      <div className={titulo || descricao ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

/** Texto à esquerda, interruptor encostado na borda direita. */
function LinhaDeInterruptor({
  rotulo,
  marcado,
  aoMudar,
}: {
  rotulo: string;
  marcado: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <span className="min-w-0 text-text-md text-text-strong">{rotulo}</span>
      <Switch checked={marcado} onChange={aoMudar} label={rotulo} />
    </div>
  );
}

/**
 * Erro persistente de carregamento: o par ícone+mensagem+"Tentar de novo" que
 * `SegurancaTab.tsx`/`SessoesTab.tsx` já usam para a mesma falha (caixa
 * `rounded-[4px] border border-border-subtle bg-background-base-lowest`,
 * `AlertTriangle` em `--status-warning`, botão secundário com `RefreshCw`).
 * Repetido aqui em vez de extraído porque as duas fontes vivem em
 * `components/settings/*.tsx`, fora da lista de arquivos deste cartão — mover
 * para um lugar comum é trabalho de outro cartão, não deste.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar o engajamento.</p>
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
