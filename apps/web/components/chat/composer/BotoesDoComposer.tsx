"use client";

import type { MouseEvent, ReactNode } from "react";
import { Plus, SendHorizonal } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";

/**
 * Área de toque de 44px **sem mexer no desenho** (celular).
 *
 * Os botões do composer do celular medem 40 × 40 porque é o que o Discord
 * desenha (`MEDIDAS.md` §7: `y 732..771`, 40 pt). 40 é menos que os 44 que a
 * diretriz de toque pede, e a saída não é engordar o botão (o que empurraria a
 * cápsula) e sim **estender o alvo**: o pseudo-elemento acrescenta 2px acima e
 * 2px abaixo, invisível, dentro do `pb-1` que o form já reserva.
 */
export const ALVO_44 =
  "relative after:absolute after:inset-x-0 after:top-[-2px] after:bottom-[-2px] after:content-['']";

/**
 * Botão de ícone à direita do campo (presente, GIF, figurinha, emoji, apps).
 *
 * Desktop, medido:
 * - caixa 32×32 — `.button__74017{min-height:var(--space-32);min-width:var(--space-32)}`
 *   (`css-bruto/962953.69892aacbc3b8e17.css`);
 * - raio 8 e hover pintado — `.emojiButton__74017{border-radius:8px}` /
 *   `:hover{background-color:var(--interactive-background-selected)}`;
 * - tinta `--interactive-text-default` (`#abacb2`) — print 1:1
 *   `Captura de tela 2026-09-02 180835.png`, linha y=992: o presente amostra
 *   `#abacb2` em x 1444–1459. O nosso amostrava `#96979e` (`icon-muted`, a
 *   família "sem fundo" do primitivo), um degrau abaixo;
 * - passo de 40 entre centros (32 + `gap:var(--space-8)`) — no print, centros em
 *   1451,5 / 1491,5 / 1531,5 / 1571,5 / 1612,5.
 *
 * `emBreve`: presente e apps existem na fileira do Discord e **não fazem nada
 * aqui** (não há Nitro para presentear nem lançador de apps). Pela §6.6 do
 * PROCESSO ficam visíveis e desabilitados, com a dica "(em breve)" — um botão
 * calado que parece funcionar era pior.
 */
export function BotaoLateral({
  rotulo,
  icone,
  onClick,
  onMouseEnter,
  baixo = false,
  emBreve = false,
  desabilitado = false,
  aberto = false,
}: {
  rotulo: string;
  icone: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  /** celular: 40×40, a cápsula do composer do telefone. */
  baixo?: boolean;
  emBreve?: boolean;
  desabilitado?: boolean;
  /** o painel que o botão abre está aberto. */
  aberto?: boolean;
}) {
  return (
    <BotaoDeIcone
      rotulo={rotulo}
      icone={icone}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      tamanho={baixo ? "lg" : "md"}
      fundo={baixo ? "nenhum" : "hover"}
      ativo={aberto}
      desabilitado={emBreve || desabilitado}
      motivoDesabilitado={emBreve ? `${rotulo} (em breve)` : undefined}
      className={baixo ? ALVO_44 : ""}
    />
  );
}

/**
 * O "+" das opções de envio.
 *
 * Desktop: caixa 32, raio 8, hover pintado — `.attachButton__36c1b{border-radius:8px;
 * padding:6px}` (6 + ícone 20 + 6) e `:hover{background-color:
 * var(--interactive-background-selected);color:var(--interactive-text-active)}`.
 * Posição pelo print 1:1 `180835.png`: glifo centrado em x=414,5 com a caixa
 * interna começando em x=386 (28,5 → caixa de 32 a 13px da borda interna) e o
 * texto em x=455 (69px da borda interna → 24 entre a caixa e o texto). Na
 * vertical a caixa fica no meio dos 56px da linha (12 em cima).
 *
 * Celular: disco de 40 fora da cápsula, à esquerda (leiaute de
 * `docs/Reference/mobile/discord-mobile-chat-canal-2024.png`).
 */
export function BotaoMais({
  ehMobile,
  onClick,
  desabilitado = false,
}: {
  ehMobile: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  desabilitado?: boolean;
}) {
  return (
    <BotaoDeIcone
      rotulo="Mais opções de envio"
      // `+` liso: a tinta do ativo ocupa ~58% do quadro, e 30 dá os 16px sólidos
      // (+1 de antisserrilhado de cada lado) que o print mostra em x 407–422
      icone={<Plus size={30} />}
      onClick={onClick}
      desabilitado={desabilitado}
      tamanho={ehMobile ? "lg" : "md"}
      forma={ehMobile ? "disco" : "quadrado"}
      fundo={ehMobile ? "nenhum" : "hover"}
      className={
        ehMobile ? `bg-interactive-background-hover ${ALVO_44}` : "sticky top-0 ml-[13px] mr-6 mt-3"
      }
    />
  );
}

/**
 * Enviar: só no celular, e só quando há o que enviar. No telefone o Enter
 * quebra linha, então alguém tem de enviar. Fundo limão com o glifo escuro
 * (ADR-0009, texto sobre a marca é `accent-ink`); o glifo vai num `span` com a
 * cor própria para não disputar a classe de tinta do primitivo.
 */
export function BotaoEnviar({ ocupado }: { ocupado: boolean }) {
  return (
    <BotaoDeIcone
      rotulo="Enviar mensagem"
      icone={
        <span className="grid place-items-center text-control-primary-text-default">
          <SendHorizonal size={20} />
        </span>
      }
      type="submit"
      disabled={ocupado}
      tamanho="lg"
      forma="disco"
      className={`my-[9px] mr-[9px] self-end bg-brand-500 ${ALVO_44}`}
    />
  );
}
