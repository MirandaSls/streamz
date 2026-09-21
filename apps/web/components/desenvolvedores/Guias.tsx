"use client";

import { Fragment } from "react";
import { Secao } from "@/components/desenvolvedores/Secao";
import { SecaoDeCodigosDeErro, TabelasDoGuia } from "@/components/desenvolvedores/Tabelas";
import { Linha, Texto } from "@/components/desenvolvedores/Texto";
import type { Indice } from "@/components/desenvolvedores/especificacao";

/**
 * Os textos que não cabem numa rota: autenticação, limites, gateway,
 * interações, permissões, snowflakes, voz e o que não existe aqui.
 *
 * **A especificação manda, e é a única fonte.** O conteúdo sai de `x-guias`, em
 * Markdown, **na ordem em que a extensão os lista** — a sequência é uma escolha
 * de quem escreveu (começa pelo que faz o primeiro bot subir e termina nas
 * divergências), e reordenar aqui seria a página discordando dela.
 *
 * Não há guia embutido nesta página, de propósito. Uma segunda cópia do mesmo
 * assunto envelhece sozinha: o texto do rate limit daqui diria "50 req/s"
 * enquanto a API já teria mudado o teto, e ninguém descobriria — a página não
 * quebra quando mente. O que a especificação não publicar, a página não mostra.
 *
 * Os blocos `x-` estruturados (permissões, intents, opcodes, eventos,
 * fechamentos) entram como **tabela**, no fim do guia a que pertencem; os
 * códigos de erro, que valem para toda rota, ganham seção própria no fim.
 * Ver `Tabelas.tsx`.
 */
export function Guias({ indice }: { indice: Indice | null }) {
  const guias = indice?.guias ?? [];
  if (!indice || (!guias.length && !indice.erros.length)) return null;

  return (
    <Fragment>
      <Secao ancora="guias" titulo="Conceitos" className="pt-10 celular:pt-8">
        <p className="mt-3 max-w-[720px] text-text-md leading-relaxed text-text-subtle">
          O que vale para todas as rotas: como o token viaja, o que acontece ao passar do limite, como os
          eventos chegam e o que cada número significa.
        </p>
      </Secao>

      {guias.map((guia) => (
        <Secao
          key={guia.id}
          ancora={guia.id}
          titulo={guia.titulo}
          nivel={3}
          className="border-t border-border-subtle py-10 celular:py-8"
        >
          <div className="mt-4 max-w-[860px]">
            {guia.resumo ? (
              // o resumo é a linha do índice, e aqui é a abertura do capítulo:
              // vem antes do texto, em tinta de corpo, para quem chegou pela
              // âncora saber num relance se é esta a seção que procurava.
              // `Linha` e não `Texto`: é uma frase só, e o `Texto` devolve um
              // `div` — que não pode morar dentro de um `p`
              <p className="mb-4 text-text-md leading-relaxed text-text-default">
                <Linha texto={guia.resumo} />
              </p>
            ) : null}
            <Texto conteudo={guia.conteudo} nivelBase={4} />
            <TabelasDoGuia guia={guia} indice={indice} />
          </div>
        </Secao>
      ))}

      <SecaoDeCodigosDeErro erros={indice.erros} />
    </Fragment>
  );
}
