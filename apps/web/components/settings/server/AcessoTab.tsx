"use client";

import { Browser, Lock } from "@/components/ui/icones";
import { Select, Switch } from "@/components/ui/controls";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import { useOnboarding } from "@/components/settings/server/onboarding-form";
import { useChannels } from "@/stores/channels";
import type { ReactNode } from "react";

/**
 * "Acesso": como se entra no servidor, e as regras que quem entra aceita.
 *
 * Do print `docs/Reference/Captura de tela 2026-09-04 100713.png` (janela
 * 1919×1079, `getpixel`): os cartões moram num painel de 660×151 raio 8 com 8
 * de recuo interno; cada cartão tem 209 de largura e 132 de altura, e o
 * escolhido ganha fundo `#2E2E33` com borda de 1px `#424248`. Abaixo, a linha
 * "Regras do servidor" com o interruptor de 48×24 encostado na borda direita da
 * coluna.
 *
 * São **dois** cartões e não três: "Mediante solicitação" é um conceito que a
 * API não tem (não existe fila de aprovação), e desenhar o cartão morto seria
 * prometer um botão que não faz nada. "Apenas por convite" e "Descobrível" são
 * os dois estados reais de `GuildOnboarding.discoverable`.
 *
 * As regras aqui são um **canal** de regras, não uma lista de frases: é o que o
 * modelo guarda (`rulesChannelId`), e é o que trava quem não aceitou.
 */
export default function AcessoTab({ guildId }: { guildId: string }) {
  const channels = useChannels((s) => s.channels);
  const textos = channels.filter((c) => c.type === "TEXT");
  const { form, patch } = useOnboarding(guildId);

  if (!form) {
    return (
      <>
        <TituloDaPagina titulo="Acesso" />
        <p className="text-sm text-txt-muted">Carregando…</p>
      </>
    );
  }

  return (
    <>
      <TituloDaPagina titulo="Acesso" />

      <h2 className="text-base font-semibold text-txt-primary">
        Como as pessoas podem entrar no seu servidor?
      </h2>
      <p className="mt-1.5 text-sm text-txt-muted">
        Mantenha seu servidor privado, ou abra-o para mais pessoas se juntarem.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-panel p-2">
        <CartaoDeAcesso
          icone={<Lock size={24} />}
          titulo="Apenas por convite"
          descricao="As pessoas entram no seu servidor com um link de convite."
          ativo={!form.discoverable}
          onSelect={() => patch({ discoverable: false })}
        />
        <CartaoDeAcesso
          icone={<Browser size={24} />}
          titulo="Descobrível"
          descricao="Qualquer um pode entrar pela lista de servidores públicos."
          ativo={form.discoverable}
          onSelect={() => patch({ discoverable: true })}
        />
      </div>

      <div aria-hidden="true" className="mt-8 h-px bg-border" />

      <div className="mt-8 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-txt-primary">Regras do servidor</h2>
          <p className="mt-1.5 text-sm text-txt-muted">
            Os membros devem concordar com as regras antes de poderem conversar ou interagir no
            servidor. Quem administra o servidor não fica preso por elas.
          </p>
        </div>
        {/* O interruptor do print encosta na borda direita da coluna, alinhado
            com a primeira linha do título — por isso `Switch` solto, e não o
            `Toggle`, que traz a linha inteira com divisória. */}
        <Switch
          checked={!!form.rulesChannelId}
          onChange={(ligado) => patch({ rulesChannelId: ligado ? (textos[0]?.id ?? null) : null })}
          label="Exigir aceite das regras"
          disabled={textos.length === 0}
        />
      </div>

      {/* O painel cinza do print, com o campo de regra dentro. Aqui o conteúdo
          das regras é um canal — quem escreve as frases é a mensagem fixada
          nele —, então o painel guarda a escolha do canal. */}
      {form.rulesChannelId && (
        <div className="mt-4 rounded-lg bg-panel p-4">
          <Select
            semDivisoria
            label="Canal de regras"
            value={form.rulesChannelId}
            options={textos.map((c) => ({ value: c.id, label: `#${c.name}` }))}
            onChange={(id) => patch({ rulesChannelId: id || null })}
            emptyLabel="Nenhum"
            hint="Quem chega precisa aceitar o que estiver neste canal antes de escrever."
          />
        </div>
      )}
    </>
  );
}

/**
 * Um dos cartões de "como se entra".
 *
 * `role="radio"` e não um `<button>` qualquer: são opções mutuamente
 * exclusivas, e sem o papel certo o leitor de tela anuncia dois botões soltos
 * em vez de "opção 1 de 2, marcada".
 */
function CartaoDeAcesso({
  icone,
  titulo,
  descricao,
  ativo,
  onSelect,
}: {
  icone: ReactNode;
  titulo: string;
  descricao: string;
  ativo: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onSelect}
      className={`flex h-[132px] flex-col items-center justify-center gap-1.5 rounded-lg border px-4 text-center transition ${
        ativo
          ? "border-border-strong bg-sel"
          : "border-transparent text-txt-muted hover:bg-hov"
      }`}
    >
      <span aria-hidden="true" className={ativo ? "text-txt-primary" : "text-txt-secondary"}>
        {icone}
      </span>
      <span className={`text-sm font-semibold ${ativo ? "text-txt-primary" : "text-txt-normal"}`}>
        {titulo}
      </span>
      <span className="text-xs leading-4 text-txt-muted">{descricao}</span>
    </button>
  );
}
