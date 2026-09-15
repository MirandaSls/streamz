"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { displayNameOf, parseSearchQuery, type PublicUser } from "@streamz/shared";
import { Button, Campo, Checkbox, Modal, Select, TextInput, type OpcaoDeSelect } from "@/components/ui/primitivos";

/**
 * Modal "Mais filtros" da busca do cabeçalho — a última linha do popout
 * "Filtros", que até aqui ficava desabilitada com "(em breve)".
 *
 * **Não é um modal novo do app**: é local do `HeaderBar` (sem `kind` em
 * `stores/ui.ts`) e só **monta a consulta em texto** com os prefixos que o
 * `parseSearchQuery` (`packages/shared/src/mensagens.ts`) já entende — `de:`,
 * `em:`, `menciona:`, `tem:`, `antes:` e `depois:`. A API já filtra por todos
 * eles; nada muda do lado do servidor. Abrir com uma consulta em vigor preenche
 * os campos a partir dela, e "Buscar" devolve a consulta reescrita.
 *
 * Medidas: **não medido**. Não há print nem CSS de referência do modal de
 * filtros do Discord nesta leva (o `113513` só mostra a linha que o abre, com a
 * dica "datas, tipo de autor e muito mais"). A moldura é a do primitivo `Modal`
 * (480, o tamanho `medio` medido nos prints de modal) e os campos são os
 * primitivos `Campo`/`TextInput`/`Select`/`Checkbox`, sem número próprio.
 *
 * Fora de propósito:
 * - "tipo de autor" (usuário, bot, webhook) e os outros filtros do modal do
 *   Discord que a API não tem — seria funcionalidade nova;
 * - `durante:`, que o parser expande para o par `depois:` + `antes:` — os dois
 *   campos de data já cobrem isso.
 */

/** Valores de `tem:` em pt-BR, na forma que o parser aceita, pelo tipo da API. */
const TEM: { valor: "link" | "imagem" | "arquivo"; tipo: "link" | "image" | "file"; rotulo: string }[] = [
  { valor: "link", tipo: "link", rotulo: "Link" },
  { valor: "imagem", tipo: "image", rotulo: "Imagem" },
  { valor: "arquivo", tipo: "file", rotulo: "Arquivo ou anexo" },
];

/** Opção "nenhum" dos seletores: string vazia, que o `Select` aceita como valor. */
const NENHUM = "";

export interface CanalSugerivel {
  id: string;
  name: string;
}

export default function MaisFiltrosDaBusca({
  consulta,
  membros,
  canais,
  semFiltroDeCanal,
  aoFechar,
  aoBuscar,
}: {
  /** a consulta digitada agora — preenche os campos. */
  consulta: string;
  /** quem pode ser `de:`/`menciona:` (membros do servidor ou participantes da conversa). */
  membros: PublicUser[];
  /** canais para `em:` (ignorado com `semFiltroDeCanal`). */
  canais: CanalSugerivel[];
  /** conversa direta: a API ignora `in:`, então o campo "Em" não aparece. */
  semFiltroDeCanal: boolean;
  aoFechar: () => void;
  /** recebe a consulta montada, já em texto. */
  aoBuscar: (consulta: string) => void;
}) {
  const idDoForm = useId();
  const inicial = useMemo(() => parseSearchQuery(consulta), [consulta]);

  const [texto, setTexto] = useState(inicial.text);
  const [de, setDe] = useState(inicial.from ?? NENHUM);
  const [menciona, setMenciona] = useState(inicial.mentions ?? NENHUM);
  const [em, setEm] = useState(inicial.in ?? NENHUM);
  const [tem, setTem] = useState(() => new Set(inicial.has));
  const [antes, setAntes] = useState(inicial.before ?? "");
  const [depois, setDepois] = useState(inicial.after ?? "");

  // O valor que veio digitado (`de:fulano` de quem não está na lista) entra
  // como opção, senão o seletor mostraria "Qualquer pessoa" e o "Buscar"
  // apagaria um filtro que a pessoa escreveu.
  const opcoesDePessoa = (atual: string, rotuloDoNenhum: string): OpcaoDeSelect[] => {
    const lista: OpcaoDeSelect[] = [{ valor: NENHUM, rotulo: rotuloDoNenhum }];
    for (const u of membros) {
      const nome = displayNameOf(u);
      lista.push({ valor: u.username, rotulo: nome, descricao: nome === u.username ? undefined : u.username });
    }
    if (atual && !membros.some((u) => u.username === atual)) lista.push({ valor: atual, rotulo: atual });
    return lista;
  };

  const opcoesDeCanal: OpcaoDeSelect[] = [
    { valor: NENHUM, rotulo: "Qualquer canal" },
    ...canais.map((c) => ({ valor: c.name, rotulo: `#${c.name}` })),
    ...(em && !canais.some((c) => c.name.toLowerCase() === em.toLowerCase()) ? [{ valor: em, rotulo: `#${em}` }] : []),
  ];

  function montar(): string {
    const partes: string[] = [];
    if (texto.trim()) partes.push(texto.trim());
    if (de) partes.push(`de:${de}`);
    if (em && !semFiltroDeCanal) partes.push(`em:${em}`);
    if (menciona) partes.push(`menciona:${menciona}`);
    for (const t of TEM) if (tem.has(t.tipo)) partes.push(`tem:${t.valor}`);
    if (depois) partes.push(`depois:${depois}`);
    if (antes) partes.push(`antes:${antes}`);
    return partes.join(" ");
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // o modal é portal, mas o evento sintético sobe pela árvore do React até o
    // cabeçalho: sem isto um `<form>` acima dele receberia este envio também
    e.stopPropagation();
    aoBuscar(montar());
  }

  const idTexto = `${idDoForm}-texto`;
  const idAntes = `${idDoForm}-antes`;
  const idDepois = `${idDoForm}-depois`;

  return (
    <Modal
      aoFechar={aoFechar}
      titulo="Mais filtros"
      rodape={
        <>
          <Button type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" form={idDoForm}>
            Buscar
          </Button>
        </>
      }
    >
      <form id={idDoForm} onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo="Contém as palavras" htmlFor={idTexto} rotuloDiscreto>
          <TextInput
            id={idTexto}
            data-autofocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Campo>

        <Campo rotulo="De" rotuloDiscreto>
          <Select
            rotulo="De"
            buscavel
            opcoes={opcoesDePessoa(de, "Qualquer pessoa")}
            valor={de}
            aoMudar={setDe}
          />
        </Campo>

        {!semFiltroDeCanal && (
          <Campo rotulo="Em" rotuloDiscreto>
            <Select rotulo="Em" buscavel opcoes={opcoesDeCanal} valor={em} aoMudar={setEm} />
          </Campo>
        )}

        <Campo rotulo="Menciona" rotuloDiscreto>
          <Select
            rotulo="Menciona"
            buscavel
            opcoes={opcoesDePessoa(menciona, "Ninguém em especial")}
            valor={menciona}
            aoMudar={setMenciona}
          />
        </Campo>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-text-sm font-medium text-text-strong">Inclui</legend>
          {TEM.map((t) => (
            <Checkbox
              key={t.tipo}
              rotulo={t.rotulo}
              marcado={tem.has(t.tipo)}
              aoMudar={(marcado) =>
                setTem((s) => {
                  const nova = new Set(s);
                  if (marcado) nova.add(t.tipo);
                  else nova.delete(t.tipo);
                  return nova;
                })
              }
            />
          ))}
        </fieldset>

        {/* os dois limites são exclusivos na API (`antes:` e `depois:`), e é o
            que o rótulo diz */}
        <div className="grid grid-cols-2 gap-4 celular:grid-cols-1">
          <Campo rotulo="Depois de" htmlFor={idDepois} rotuloDiscreto>
            <TextInput id={idDepois} type="date" value={depois} onChange={(e) => setDepois(e.target.value)} />
          </Campo>
          <Campo rotulo="Antes de" htmlFor={idAntes} rotuloDiscreto>
            <TextInput id={idAntes} type="date" value={antes} onChange={(e) => setAntes(e.target.value)} />
          </Campo>
        </div>
      </form>
    </Modal>
  );
}
