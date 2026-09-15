"use client";

import type { Botao, Message } from "@streamz/shared";
import { ESTILO_DE_BOTAO, ehSnowflake } from "@streamz/shared";
import { ExternalLink, Gift } from "@/components/ui/icones";
import Emoji from "@/components/ui/Emoji";
import { Button, Tooltip, type VarianteDeBotao } from "@/components/ui/primitivos";
import { API_URL } from "@/lib/config";
import { componenteEstaPendente, useInteracoesDeBot } from "@/stores/interacoes-de-bot";

/**
 * ── onda 3 (cartão 3c) ── Um botão de bot (`type: 2`), nos 6 estilos do
 * Discord. Contrato: `docs/CONTRATO-ONDA-3.md` §1.2 (forma) e §9 (o que este
 * cartão desenha). Estados obrigatórios: repouso, hover, foco, desabilitado,
 * carregando e (via `ActionRow`, que lê `falhas`) "falhou".
 *
 * ## Estilo → variante
 *
 * Confirmado em `desenvolvedores/imagens/componentes/antigo-estilos-de-botao-
 * claro-e-escuro.png` (a doc oficial mostra os 6 lado a lado, claro e escuro)
 * e `action-row-tres-botoes.webp` (Accept azul, Learn More cinza + ícone,
 * Decline vermelho):
 *
 * | Discord | style | Nosso `Button` |
 * |---|---|---|
 * | Primary (CTA), blurple | 1 | `primario` — no Streamz é o limão com texto escuro (ADR-0009), regra já no token |
 * | Secondary, cinza | 2 | `secundario` |
 * | Success, verde | 3 | `positivo` |
 * | Danger, vermelho | 4 | `critico` |
 * | Link, cinza + seta externa, abre URL | 5 | `secundario` + `iconeDireita` `ExternalLink`, via `href` do `Button` |
 * | Premium, blurple + ícone de presente, preço da SKU | 6 | não existe SKU no Streamz: sempre `disabled`, com o mesmo padrão de "(em breve)" que `HeaderIcon`/`SearchPanel` já usam |
 *
 * As cores em si **não são reescolhidas aqui**: `Button` já resolve cada
 * variante para os tokens `--control-*` (limão/cinza/verde/vermelho), então
 * reaproveitar `Button` é reaproveitar a medida do cartão 0.4-botao
 * (`.button_a22cb0`), que é o mesmo módulo de classe que o Discord usa tanto
 * em diálogo quanto em componente de mensagem.
 *
 * **Tamanho: `sm` (32px), não medido no pixel.** Não achei, no CSS bruto
 * capturado nem em nenhum print 1:1 do acervo, o seletor específico do botão
 * *dentro de uma mensagem* (`buttonContainer_*`/`actionRow_*` aparecem, mas só
 * em menu de contexto e popout de reação — nada com o `.button_a22cb0` preso a
 * uma mensagem). `sm` é o degrau mais compacto que o `Button` já tem medido;
 * ver "nao_verificado" no retorno do cartão.
 *
 * ## Emoji
 *
 * `emoji` é o parcial do Discord (`{ id?, name?, animated? }`), não o token
 * interno `<:nome:id>` de `parseCustomEmoji`. `id` já vem trocado para o cuid
 * do `Emoji` do Streamz quando o emoji existe aqui (contrato §1.3); quando o
 * bot mandou um emoji personalizado que o Streamz não tem, o `id` continua
 * sendo o **snowflake** original — `ehSnowflake` (de `@streamz/shared`, usada
 * pelas rotas para decidir snowflake × cuid) separa os dois casos sem precisar
 * de outro campo. Sem imagem para buscar nesse caso, cai para o `name`.
 */

const VARIANTE_POR_ESTILO: Partial<Record<number, VarianteDeBotao>> = {
  [ESTILO_DE_BOTAO.PRIMARY]: "primario",
  [ESTILO_DE_BOTAO.SECONDARY]: "secundario",
  [ESTILO_DE_BOTAO.SUCCESS]: "positivo",
  [ESTILO_DE_BOTAO.DANGER]: "critico",
  [ESTILO_DE_BOTAO.LINK]: "secundario",
};

/**
 * O ícone do botão: emoji personalizado (imagem do próprio servidor) ou
 * unicode (Twemoji, via `Emoji`). 16px — o mesmo lado que os ícones de
 * `icones.tsx` usam ao lado de texto (`icone={<X size={16}/>}` é o padrão do
 * resto do app).
 */
function IconeDoBotao({ emoji }: { emoji: NonNullable<Botao["emoji"]> }) {
  if (emoji.id && !ehSnowflake(emoji.id)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API_URL}/api/emojis/${emoji.id}/image`}
        alt={emoji.name ? `:${emoji.name}:` : "emoji"}
        loading="lazy"
        className="h-4 w-4 shrink-0 object-contain"
      />
    );
  }
  // sem `id` (unicode) ou `id` ainda em snowflake (emoji personalizado que o
  // Streamz não conhece): `name` de um emoji unicode É o glifo — `Emoji`
  // desenha o Twemoji; de um emoji personalizado desconhecido é só o nome, e
  // `Emoji` (sem candidato de arquivo) cai para o texto puro dele, que é o que
  // sobra sem a imagem original.
  if (emoji.name) return <Emoji emoji={emoji.name} tamanho={16} />;
  return null;
}

export default function BotaoDeBot({
  componente,
  message,
}: {
  componente: Botao;
  message: Pick<Message, "id" | "channelId">;
}) {
  const clicarBotao = useInteracoesDeBot((s) => s.clicarBotao);
  const pendente = useInteracoesDeBot((s) =>
    componenteEstaPendente(s, message.id, componente.custom_id ?? ""),
  );

  const icone = componente.emoji ? <IconeDoBotao emoji={componente.emoji} /> : undefined;
  // pelo menos um dos dois existe (`conferirMensagemDeBot` recusa os dois
  // ausentes fora do premium) — sem `label`, o `Button` vira quadrado ícone.
  const rotuloAcessivel = !componente.label
    ? componente.emoji?.name
      ? `:${componente.emoji.name}:`
      : undefined
    : undefined;

  // 6 — Premium: não existe loja de SKU no Streamz. Sempre inerte, com o
  // mesmo par Tooltip+span-de-ponteiro que `SearchPanel`/`HeaderIcon` usam
  // para "(em breve)" (botão desabilitado não dispara hover, então a dica
  // precisa de um invólucro que recebe o ponteiro no lugar dele).
  if (componente.style === ESTILO_DE_BOTAO.PREMIUM) {
    return (
      <Tooltip rotulo={`${componente.label ?? "Produto"} (em breve)`}>
        <span className="inline-flex">
          <Button variante="primario" tamanho="sm" icone={<Gift size={16} />} disabled>
            {componente.label ?? "Produto"}
          </Button>
        </span>
      </Tooltip>
    );
  }

  // 5 — Link: nunca chama a store (o Discord não avisa o bot de link
  // clicado). `href` do `Button` já desenha `<a>` com o visual do botão e
  // resolve `disabled` para `aria-disabled` sem `href` — o mesmo par que o
  // resto do app usa para link com cara de botão.
  if (componente.style === ESTILO_DE_BOTAO.LINK) {
    return (
      <Button
        variante="secundario"
        tamanho="sm"
        icone={icone}
        iconeDireita={<ExternalLink size={16} aria-hidden="true" />}
        href={componente.url}
        alvo="_blank"
        rel="noreferrer noopener"
        disabled={componente.disabled || !componente.url}
        aria-label={rotuloAcessivel}
      >
        {componente.label}
      </Button>
    );
  }

  // 1–4: primary/secondary/success/danger — chamam a store.
  const variante = VARIANTE_POR_ESTILO[componente.style] ?? "secundario";
  const semAlvo = !componente.custom_id;

  return (
    <Button
      variante={variante}
      tamanho="sm"
      icone={icone}
      carregando={pendente}
      disabled={componente.disabled || semAlvo}
      aria-label={rotuloAcessivel}
      onClick={() => {
        if (semAlvo) return;
        void clicarBotao(message, componente.custom_id as string);
      }}
    >
      {componente.label}
    </Button>
  );
}
