"use client";

import type { Arquivo } from "@streamz/shared";
import { AlertTriangle, Download, FileText } from "@/components/ui/icones";
import { SpoilerCobertura } from "./spoiler";

/**
 * ── onda 3 (cartão 3e) ── `Arquivo`/File (`type: 13`): o anexo **só**
 * `attachment://`, com nome e tamanho que o servidor preenche
 * (`resolverAnexosDoPayload`, no shared). Mesmo cartão de 432px que
 * `MediaGroup.tsx` (só leitura) já usa para PDF/arquivo genérico do anexo
 * comum — mesma família visual de "cartão de arquivo" do app, então reuso as
 * medidas de lá em vez de tirar um segundo número do zero:
 * `w-[432px] max-w-full`, `rounded-lg` (8), `border-border-subtle`,
 * `bg-background-base-lower`, `p-4` (16), ícone 40px, nome como link, tamanho
 * `text-xs text-text-muted`. **Confirmado também no CSS bruto**
 * (`css-bruto/797845.0ad0d4cff411ba11.css`, `.file__0ccae{border-radius:8px;
 * padding:16px}` e `.fileWrapper__0ccae{width:432px}`) — os dois números
 * (432 e 16) batem exatamente com o que `MediaGroup` já tinha decidido, então
 * não é coincidência de dois cartões chutando o mesmo valor.
 *
 * **Ícone: sem cor por tipo.** `v2-file.webp` mostra `game.zip` e
 * `manual.pdf` com o mesmo glifo de página dobrada, sem tingir por
 * extensão — ao contrário do `Arquivo` de `MediaGroup` (que pinta PDF em
 * `status-danger`), aqui fico só em `text-icon-muted`, porque não há
 * `Attachment.contentType` para decidir isso com a mesma certeza (o `File`
 * de bot só tem `name`); inventar uma lista de extensões seria decisão de
 * tela sem medida.
 *
 * **Arquivo indisponível**: quando `attachment://<nome>` não resolve (a
 * mensagem não tem esse anexo — `resolverAnexosDoPayload` deixa a referência
 * como veio, comentário do próprio shared: "quem desenha mostra o estado de
 * 'arquivo indisponível'"), o cartão fica sem link e sem tamanho, com um
 * aviso — **não há tela do Discord para isso no acervo** (o caso não existe
 * lá: o Discord nunca deixa a mensaga sair com uma referência que não bate),
 * então o desenho é nosso, no mesmo padrão de aviso inline que
 * `ComponentesDaMensagem` usa para "Esta interação falhou"
 * (`text-text-feedback-critical`, `text-text-xs`).
 */
export default function FileDeBot({ componente }: { componente: Arquivo }) {
  const cartao = <CartaoDoArquivo componente={componente} />;
  if (!componente.spoiler) return cartao;

  const rotulo = componente.name ?? nomeDoAnexo(componente.file.url);
  return (
    <SpoilerCobertura blurClassName="blur-md" rotulo={`Spoiler: mostrar ${rotulo}`} className="w-[432px] max-w-full">
      {cartao}
    </SpoilerCobertura>
  );
}

function CartaoDoArquivo({ componente }: { componente: Arquivo }) {
  const disponivel = Boolean(componente.name);
  const nome = componente.name ?? nomeDoAnexo(componente.file.url);

  return (
    <div className="flex w-[432px] max-w-full items-center gap-3 rounded-lg border border-border-subtle bg-background-base-lower p-4">
      <FileText size={40} strokeWidth={1.25} className="shrink-0 text-icon-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {disponivel ? (
          <a
            href={componente.file.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block truncate font-medium text-text-link hover:underline"
          >
            {nome}
          </a>
        ) : (
          <span className="block truncate font-medium text-text-muted">{nome}</span>
        )}
        <span className="flex items-center gap-1 text-xs text-text-muted">
          {disponivel ? (
            formatarTamanho(componente.size)
          ) : (
            <>
              <AlertTriangle size={12} aria-hidden="true" className="shrink-0 text-text-feedback-critical" />
              Arquivo indisponível
            </>
          )}
        </span>
      </span>
      {disponivel && (
        <a
          href={componente.file.url}
          download={nome}
          aria-label={`Baixar ${nome}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-text-subtle hover:bg-interactive-background-hover hover:text-text-strong celular:h-[44px] celular:w-[44px]"
        >
          <Download size={20} />
        </a>
      )}
    </div>
  );
}

/** `attachment://<nome>` sem barra: o nome cru, para mostrar mesmo sem resolver. */
function nomeDoAnexo(url: string): string {
  return url.startsWith("attachment://") ? url.slice("attachment://".length) : url;
}

/** Mesma conta de `MediaGroup.tsx` (não exportada de lá — duplicada aqui de propósito). */
function formatarTamanho(n: number | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
