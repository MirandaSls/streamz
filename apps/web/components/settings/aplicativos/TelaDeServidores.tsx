"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppDetalhe, ServidorComOApp } from "@streamz/shared";
import { Server } from "@/components/ui/icones";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { errorMessage } from "@/stores/socket-adapter";
import { ErroComNovaTentativa, MensagemDeAjuda, TituloDaTela, Voltar, dataCurta } from "./pecas";

/**
 * Onde o aplicativo está instalado — o "Server Access" do cartão do Discord
 * ("4 servers use this connection", com chevron para a direita), que abre uma
 * lista. A lista dele não está em nenhuma referência: as linhas repetem a
 * forma do cartão (`--background-mod-subtle`, raio 8, divisória
 * `--border-subtle` entre itens, ícone 40 e duas linhas 16/14) para a tela
 * ler como continuação da anterior — composição, não medida.
 *
 * Estados: **carregando** (três linhas-esqueleto na altura da real);
 * **vazio** (o `.emptyState{min-height:200px}` do mesmo módulo do Discord,
 * centrado); **erro** com "Tentar de novo"; **sem permissão** — 403 é o app
 * que deixou de ser meu entre abrir a lista e abrir esta tela (a API confere o
 * dono), e 404 é o que foi apagado: nos dois não há o que tentar de novo, só
 * voltar.
 */
export function TelaDeServidores({ app, aoVoltar }: { app: AppDetalhe; aoVoltar: () => void }) {
  const [itens, setItens] = useState<ServidorComOApp[] | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; definitivo: boolean } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const tentarDeNovo = useCallback(() => {
    setErro(null);
    setItens(null);
    setTentativa((t) => t + 1);
  }, []);

  useEffect(() => {
    let vivo = true;
    api
      .servidoresDoApp(app.id)
      .then((s) => {
        if (vivo) setItens(s);
      })
      .catch((e) => {
        if (!vivo) return;
        const definitivo = isApiError(e, 403) || isApiError(e, 404);
        setErro({ mensagem: errorMessage(e, "Não foi possível carregar os servidores"), definitivo });
      });
    return () => {
      vivo = false;
    };
  }, [app.id, tentativa]);

  return (
    <div>
      <Voltar onClick={aoVoltar}>{app.name}</Voltar>
      <TituloDaTela>Servidores</TituloDaTela>
      <p className="mt-2 text-text-sm text-text-subtle">
        Onde <strong className="font-semibold text-text-default">{app.name}</strong> está instalado. Quem
        instalou não aparece: é gente de outro servidor, e o portal não é um diretório de pessoas.
      </p>

      <div className="mt-6">
        {erro ? (
          erro.definitivo ? (
            <MensagemDeAjuda tom="erro">{erro.mensagem}</MensagemDeAjuda>
          ) : (
            <ErroComNovaTentativa mensagem={erro.mensagem} tentar={tentarDeNovo} />
          )
        ) : itens === null ? (
          <ul aria-busy="true" aria-label="Carregando servidores" className="overflow-hidden rounded-lg bg-background-mod-subtle">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 border-b border-border-subtle p-4 last:border-b-0">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-background-base-lower" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-3.5 w-36 animate-pulse rounded bg-background-base-lower" />
                  <span className="h-3 w-24 animate-pulse rounded bg-background-base-lower" />
                </span>
              </li>
            ))}
          </ul>
        ) : itens.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg bg-background-mod-subtle p-4 text-center">
            <Server size={40} aria-hidden="true" className="text-icon-muted" />
            <p className="text-text-md font-semibold text-text-strong">Nenhum servidor ainda</p>
            <p className="text-text-sm text-text-subtle">
              Este aplicativo ainda não foi adicionado a nenhum servidor.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg bg-background-mod-subtle">
            {itens.map((s) => (
              <li
                key={s.guildId}
                className="flex items-center gap-3 border-b border-border-subtle p-4 last:border-b-0"
              >
                {s.guildIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.guildIconUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background-base-lower text-text-sm font-semibold text-text-subtle"
                  >
                    {s.guildName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text-md font-semibold text-text-strong">{s.guildName}</span>
                  <span className="mt-1 block text-text-sm text-text-subtle">
                    Instalado em {dataCurta(s.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
