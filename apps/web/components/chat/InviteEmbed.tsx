"use client";

import { useEffect, useState } from "react";
import { displayNameOf, type InviteFullPreview } from "@streamz/shared";
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
 * Leiaute: o do Discord de memória — chamada em maiúsculas, ícone de 48 à
 * esquerda, nome e contagem no meio, botão de ação à direita. **Não foi medido
 * em print**: não há captura do embed de convite do Discord em
 * `docs/Reference/`. As medidas usam a escala já estabelecida no app (largura
 * de 432 do `LinkEmbedCard`, raio 8, ícone 48).
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
        className="mt-1 rounded-lg bg-panel p-4 text-sm text-txt-muted"
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
    <div className="mt-1 rounded-lg bg-panel p-4" style={{ maxWidth: LARGURA }}>
      <p className="text-xs font-bold uppercase tracking-wide text-txt-muted">
        {previa.inviter
          ? `${displayNameOf(previa.inviter)} te convidou para entrar em um servidor`
          : "Você foi convidado para entrar em um servidor"}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-void text-sm font-semibold text-txt-primary">
          {previa.guild.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa.guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            acronimo(previa.guild.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-txt-primary">{previa.guild.name}</div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-txt-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green" />
              {previa.onlineCount} online
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-txt-faint" />
              {previa.memberCount} membros
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={entrando}
          onClick={() => void acao()}
          className={
            "h-8 shrink-0 rounded-[3px] px-4 text-sm font-medium transition disabled:opacity-60 " +
            // quem já é membro não precisa de chamada para ação: o botão vira
            // um atalho neutro para o servidor, como o "Entrou" do Discord
            (jaSouMembro
              ? "bg-border-strong text-white hover:bg-border-strong-hover"
              : "bg-accent text-accent-ink hover:bg-accent-hover")
          }
        >
          {jaSouMembro ? "Entrou" : entrando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
