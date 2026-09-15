"use client";

import { MAX_WELCOME_CHANNELS, MAX_WELCOME_DESCRIPTION } from "@streamz/shared";
import { AlertTriangle, RefreshCw } from "@/components/ui/icones";
import { Select } from "@/components/ui/controls";
import { Button, Campo, Checkbox, TextArea } from "@/components/ui/primitivos";
import { ESTILO_ROTULO } from "@/components/settings/campos";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { useOnboarding } from "@/components/settings/server/onboarding-form";
import { useChannels } from "@/stores/channels";
import { ui } from "@/stores/ui";

/**
 * "Engajamento": o que o servidor faz por conta própria quando alguém chega —
 * a mensagem do sistema e a tela de boas-vindas.
 *
 * É a página `Engajamento` dos prints `docs/Reference/Captura de tela
 * 2026-09-04 100608/100615.png` reduzida ao que existe aqui. O print tem, e nós
 * **não** criamos: os interruptores de mensagem do sistema por tipo (impulso,
 * dica de resposta), o feed do servidor, a notificação padrão do servidor (a
 * nossa preferência de notificação é por usuário, em `NotificationSetting`), o
 * canal de ausentes com limite e o widget. Nenhum tem contrato na API, e um
 * controle que não grava nada é pior que a ausência dele.
 *
 * O canal de mensagens do sistema vinha da antiga "Visão geral" e a tela de
 * boas-vindas da antiga "Entrada e regras": são o mesmo recurso
 * (`GET/PATCH /guilds/:id/onboarding`) e agora a mesma página, que é onde o
 * Discord os põe.
 *
 * A hierarquia de seção (`<h2>` 16px semibold + `<p>` 14px `text-text-muted`
 * 6px abaixo + conteúdo a 16px do parágrafo, divisória de 1px 40px abaixo do
 * bloco anterior) é a mesma dos vizinhos já redesenhados desta onda
 * (`AcessoTab.tsx`, `PerfilDoServidorTab.tsx`) — nenhuma medida nova aqui,
 * só a régua que eles já fixaram.
 *
 * Estados (cartão 6n-engajamento):
 * - **carregando** — texto simples ("Carregando…"), como `AcessoTab.tsx`: a
 *   página é só dois campos, um esqueleto por linha pesaria mais do que ajuda.
 * - **erro** (a busca inicial falhou) — antes o formulário ficava em `null`
 *   para sempre e a página travava em "Carregando…" sem saída (o mesmo defeito
 *   que `SessoesTab.tsx` documenta e fecha para as sessões); agora
 *   `onboarding-form.ts` expõe `falhouCarregar` e `recarregar`, e aqui vira o
 *   bloco ícone+mensagem+"Tentar de novo" que `SegurancaTab.tsx`/
 *   `SessoesTab.tsx` já usam para o mesmo tipo de falha (`BlocoDeErro`).
 * - **vazio** — "Nenhum canal de texto ainda." na lista de destaque quando o
 *   servidor não tem canal de texto; o seletor do canal do sistema cobre o
 *   mesmo caso ficando **desabilitado** com a dica trocada, porque um `<select>`
 *   sem opção nenhuma para escolher não é diferente de um campo que não serve
 *   agora.
 * - **sem permissão** — não existe dentro desta página: o registro em
 *   `ServerSettingsModal.tsx` já esconde o item "Engajamento" do menu de quem
 *   não tem `MANAGE_GUILD` (o mesmo padrão documentado em
 *   `AplicativosTab.tsx`), então quem abre esta aba sempre pode editá-la.
 * - **hover/foco/desabilitado** — do `Select`, do `Checkbox` e do `Button` dos
 *   primitivos: nenhum estilo próprio aqui.
 */
export default function EngajamentoTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const textos = channels.filter((c) => c.type === "TEXT");
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
        {/* `carregando` é sempre `true` aqui — a única outra causa de `form`
            nulo é o bloco de erro acima, que já retornou. O texto fica preso
            à variável (e não a um "Carregando…" incondicional) para o leitor
            de código não achar que os dois branches colidem. */}
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

  const destacadosNoLimite = form.welcomeChannelIds.length >= MAX_WELCOME_CHANNELS;
  const semCanalDeTexto = textos.length === 0;

  return (
    <>
      <TituloDaPagina
        titulo="Engajamento"
        subtitulo="O que o servidor mostra e diz sozinho para quem acabou de chegar."
      />

      <h2 className="text-base font-semibold text-text-strong">Mensagens do sistema</h2>
      {/* Texto do print `100608`, sem os quatro interruptores por tipo que
          ficam abaixo dele lá (não existem aqui): "Configurar Mensagens de
          Evento do sistema Enviadas para o seu servidor." — normalizado para
          a nossa caixa de frase (o Discord usa Title Case irregular ali). */}
      <p className="mt-1.5 text-sm text-text-muted">
        Configure as mensagens de evento do sistema enviadas para o servidor.
      </p>
      <div className="mt-4">
        <Select
          semDivisoria
          label="Canal de mensagens do sistema"
          value={form.systemChannelId ?? ""}
          options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
          onChange={(id) => patch({ systemChannelId: id || null })}
          emptyLabel="Nenhum"
          disabled={semCanalDeTexto}
          hint={
            semCanalDeTexto
              ? "Crie um canal de texto para poder escolher um."
              : "É onde entra o “fulano entrou no servidor” a cada pessoa nova."
          }
        />
      </div>

      <div aria-hidden="true" className="mt-10 h-px bg-border-subtle" />

      <h2 className="mt-10 text-base font-semibold text-text-strong">Tela de boas-vindas</h2>
      <Campo
        rotulo="Mensagem de abertura"
        htmlFor="welcome-description"
        className="mt-4"
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
              // No limite, o que já está marcado continua clicável (para
              // desmarcar); o resto vira desabilitado em vez de deixar o
              // clique cair só no toast de erro — é o mesmo "por que não dá
              // para marcar mais" que um `disabled` explica sem precisar de
              // um aviso a cada tentativa.
              desabilitado={destacadosNoLimite && !marcado}
              className="rounded-lg px-2 py-1.5 hover:bg-interactive-background-hover"
            />
          );
        })}
      </div>
    </>
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
