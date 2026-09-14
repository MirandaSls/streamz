"use client";

import { useEffect, useState } from "react";
import { displayNameOf, type InviteFullPreview } from "@streamz/shared";
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

/** Iniciais do nome, como o rail faz com servidor sem ícone. */
function acronimo(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

const LARGURA = 432;

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
      <div
        className="mt-1 rounded-xl bg-background-surface-high p-4 text-sm text-text-muted"
        style={{ maxWidth: LARGURA }}
      >
        Convite inválido ou expirado
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
    <div className="mt-1 rounded-xl bg-background-surface-high p-4" style={{ maxWidth: LARGURA }}>
      <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
        {previa.inviter
          ? `${displayNameOf(previa.inviter)} te convidou para entrar em um servidor`
          : "Você foi convidado para entrar em um servidor"}
      </p>
      {/* No celular a linha não cabe em uma só: com 314px de coluna sobravam
          146 para o meio, e o nome do servidor saía truncado ("Time de
          Produ…") com "1 online"/"2 membros" quebrando em duas linhas. Com
          `flex-wrap` o botão desce inteiro para baixo (é o padrão do cartão de
          convite no telefone) e o nome recupera a largura do cartão. */}
      <div className="mt-3 flex items-center gap-3 celular:flex-wrap">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-input-background-default text-sm font-semibold text-text-strong">
          {previa.guild.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa.guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            acronimo(previa.guild.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-text-strong">{previa.guild.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-status-positive" />
              {previa.onlineCount} online
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-channels-default" />
              {previa.memberCount} membros
            </span>
          </div>
        </div>
        <Button
          disabled={entrando}
          onClick={() => void acao()}
          // quem já é membro não precisa de chamada para ação: o botão vira
          // um atalho neutro para o servidor, como o "Entrou" do Discord
          variante={jaSouMembro ? "secundario" : "primario"}
          tamanho="sm"
          /* 32px de altura no desktop (tamanho `sm`, raiz de 16px): 44
             literais no celular, único botão do cartão. */
          className="shrink-0 celular:h-[44px] celular:w-full celular:px-5"
        >
          {jaSouMembro ? "Entrou" : entrando ? "Entrando…" : "Entrar"}
        </Button>
      </div>
    </div>
  );
}
