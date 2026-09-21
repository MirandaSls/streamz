"use client";

import { Fragment } from "react";
import { TabelaDeCampos, TipoDoCampo, linhasDeEsquema } from "@/components/desenvolvedores/Campos";
import { Cercado } from "@/components/desenvolvedores/Codigo";
import { Secao } from "@/components/desenvolvedores/Secao";
import { Texto } from "@/components/desenvolvedores/Texto";
import {
  camposDoEsquema,
  exemploDoEsquema,
  formatarJson,
  type DocumentoOpenAPI,
  type EsquemaIndexado,
} from "@/components/desenvolvedores/especificacao";

/**
 * Os objetos de `components.schemas`, cada um com âncora própria — é o destino
 * de todo `$ref` que vira link nas tabelas da referência.
 *
 * Um esquema sem `properties` (união, enum solto, alias de tipo) não ganha
 * tabela vazia: mostra o tipo e o exemplo, que é tudo o que ele tem a dizer.
 */
export function Esquemas({
  doc,
  esquemas,
}: {
  doc: DocumentoOpenAPI;
  esquemas: EsquemaIndexado[];
}) {
  if (!esquemas.length) return null;
  return (
    <Fragment>
      <Secao ancora="esquemas" titulo="Esquemas" className="pt-10 celular:pt-8">
        <p className="mt-3 max-w-[720px] text-text-md leading-relaxed text-text-subtle">
          Os objetos que as rotas recebem e devolvem. Todo tipo citado nas tabelas acima aponta para cá.
        </p>
      </Secao>
      {esquemas.map((item) => (
        <UmEsquema key={item.id} doc={doc} item={item} />
      ))}
    </Fragment>
  );
}

function UmEsquema({ doc, item }: { doc: DocumentoOpenAPI; item: EsquemaIndexado }) {
  const campos = linhasDeEsquema(camposDoEsquema(doc, item.esquema));
  const exemplo = formatarJson(exemploDoEsquema(doc, item.esquema));

  return (
    <Secao
      ancora={item.id}
      titulo={item.nome}
      nivel={3}
      sobretitulo="Esquema"
      className="border-t border-border-subtle py-10 celular:py-8"
    >
      {item.esquema.description ? <Texto conteudo={item.esquema.description} nivelBase={4} className="mt-3" /> : null}

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:items-start">
        <div className="min-w-0">
          {campos.length ? (
            <TabelaDeCampos titulo={`Campos de ${item.nome}`} campos={campos} />
          ) : (
            <p className="text-text-sm text-text-subtle">
              Tipo:{" "}
              <TipoDoCampo esquema={item.esquema} />
            </p>
          )}
        </div>
        <div className="min-w-0 xl:sticky xl:top-20">
          <Cercado rotulo={item.nome} linguagem="json" codigo={exemplo} alturaMaxima="max-h-[420px]" />
        </div>
      </div>
    </Secao>
  );
}
