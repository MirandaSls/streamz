"use client";

import { useEffect, useState } from "react";
import { guildBannerBackground, type InviteFullPreview } from "@streamz/shared";
import { desdeDoServidor, iniciaisDoServidor, rotuloDeMembros } from "@/lib/convite-cartao";
import { Button } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";

/**
 * Cartão de convite de servidor, no lugar da prévia genérica de link.
 *
 * O que acontecia antes: `https://streamz.chat/invite/jsc2zafi` era só mais uma
 * URL, e a mensagem mostrava o Open Graph do site ("Streamz — Chat de
 * comunidade — voz, vídeo e tela"). Quem reconhece o convite é
 * `lib/links-de-convite.ts`, pelo caminho `/invite/<código>` no host público
 * **ou** no host do próprio app — no desktop os dois são diferentes
 * (`tauri.localhost`), e era daí que vinha o defeito.
 *
 * Leiaute: chamada em maiúsculas, ícone à esquerda, nome e contagem no meio,
 * botão de ação à direita. **Não há print 1:1 do embed de convite do
 * Discord** em `docs/Reference/`, mas o CSS bruto tem a peça real
 * (`.inviteEmbed_ae2544`/`.inviteEmbedHeaderLine_ae2544`/
 * `.inviteMemberRow_ae2544` de
 * `docs/referencias-discord/tokens/css-bruto/sob-demanda/978898.b916bc6837ac7657.css`):
 * raio `var(--radius-md)` = **12px** (não 8 — o cartão de convite usa uma
 * escala de raio diferente da do `LinkEmbedCard`), `gap:12px` na linha
 * ícone/nome/botão e `gap:8px` entre "online" e "membros". Fundo:
 * **`background-surface-high`**, como os demais embeds (ver `LinkEmbedCard`)
 * — não medido para esta peça especificamente, mas é o token que o resto da
 * família de embeds usa. Ícone de 48px, largura de 432 (a mesma escala do
 * `LinkEmbedCard`): não medidos, sem print nem classe correspondente no CSS.
 */

/** Cache por código, compartilhado entre mensagens (mesmo padrão do embed). */
const cache = new Map<string, Promise<InviteFullPreview | null>>();

function usePreviaDeConvite(code: string): InviteFullPreview | null | undefined {
  const [previa, setPrevia] = useState<InviteFullPreview | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    let p = cache.get(code);
    if (!p) {
      p = api.previewInvite(code).catch(() => null);
      cache.set(code, p);
    }
    void p.then((v) => vivo && setPrevia(v));
    return () => {
      vivo = false;
    };
  }, [code]);
  return previa;
}

const LARGURA = 432;

const CARTAO = "mt-1 w-full overflow-hidden rounded-xl border border-border-normal bg-background-surface-high";

export default function InviteEmbed({ code }: { code: string }) {
  const previa = usePreviaDeConvite(code);
  const guilds = useGuilds((s) => s.guilds);
  const entrarPorConvite = useGuilds((s) => s.entrarPorConvite);
  const selecionar = useGuilds((s) => s.select);
  const [entrando, setEntrando] = useState(false);

  // enquanto a prévia não volta, nada é desenhado: um esqueleto piscando por
  // meio segundo em cada mensagem antiga incomodaria mais do que ajuda
  if (previa === undefined) return null;

  if (previa === null || !previa.valid) {
    return (
      <div className={`${CARTAO} p-4`} style={{ maxWidth: LARGURA }}>
        <p className="text-base font-bold text-text-strong">Convite inválido</p>
        <p className="mt-1 text-sm text-text-muted">
          Este convite expirou ou o link está errado. Peça um novo a quem te convidou.
        </p>
      </div>
    );
  }

  // "já sou membro" sai da lista de servidores, que é viva: entrar por este
  // cartão (ou por outro aparelho, via `guild.joined`) troca o botão na hora,
  // sem depender da prévia em cache
  const jaSouMembro = previa.member || guilds.some((g) => g.id === previa.guild.id);

  async function acao() {
    if (!previa || entrando) return;
    if (jaSouMembro) {
      selecionar({ id: previa.guild.id, name: previa.guild.name });
      return;
    }
    setEntrando(true);
    try {
      await entrarPorConvite(code);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className={CARTAO} style={{ maxWidth: LARGURA }}>
      {/* faixa: o servidor só tem cor (`bannerColor`), sem imagem; sem cor, o
          fundo neutro escuro do campo, como o Discord faz sem banner */}
      <div
        aria-hidden="true"
        className="h-[100px] w-full bg-input-background-default"
        style={{ background: guildBannerBackground(previa.bannerColor) }}
      />
      <div className="px-4 pb-4">
        {/* anel na cor do corpo do cartão, para o ícone "recortar" a faixa */}
        <div className="-mt-8 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-input-background-default text-xl font-semibold text-text-strong ring-4 ring-background-surface-high">
          {previa.guild.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa.guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            iniciaisDoServidor(previa.guild.name)
          )}
        </div>
        <p className="mt-3 truncate text-base font-bold text-text-strong">{previa.guild.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-text-muted">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-status-positive" />
            {previa.onlineCount} online
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-channels-default" />
            {rotuloDeMembros(previa.memberCount)}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-text-muted">{desdeDoServidor(previa.guildCreatedAt)}</p>
        <Button
          disabled={entrando}
          onClick={() => void acao()}
          variante="positivo"
          /* no celular 44px literais, alvo de toque */
          className="mt-4 w-full celular:h-[44px]"
        >
          {jaSouMembro ? "Ir para o Servidor" : entrando ? "Entrando…" : "Entrar"}
        </Button>
      </div>
    </div>
  );
}
