// ── onda 3 · cartão 3a ── A parte **pura** das interações de componente, de
// modal e de autocomplete: achar o componente clicado numa mensagem, conferir o
// clique, conferir o envio de um modal contra o modal que o bot abriu e decidir
// qual callback vale para qual tipo de interação.
//
// Mora fora do `InteractionsService` pelo mesmo motivo de `efemeras.ts`: sem
// Prisma, sem Nest, sem socket — as regras cabem num teste unitário. Quem vai ao
// banco (resolver cuid → snowflake, gravar, despachar) é o service.
//
// A forma é a da API do Discord (`@streamz/shared`, `mensagens-de-bot.ts`), e o
// contrato das rotas é `docs/CONTRATO-ONDA-3.md` §4.

import {
  ESTILO_DE_BOTAO,
  TIPO_DE_COMPONENTE,
  type Botao,
  type ComponenteDeMensagem,
  type FilhoDeLabel,
  type ModalDeBot,
  type OpcaoDeComando,
  type RespostaDeCampoDeModal,
  type RespostaDeComponenteDeModal,
  type SelectDeBot,
  type TextInput,
} from "@streamz/shared";
import { TIPO_DE_CALLBACK, TIPO_DE_INTERACAO } from "./tipos";

// ── o clique ─────────────────────────────────────────────────

/** O que se clica numa mensagem: um botão ou um select. */
export type ComponenteInterativo = Botao | SelectDeBot;

/** Uma recusa com o status HTTP que a rota interna devolve (`CONTRATO-ONDA-3.md` §4.1). */
export interface Recusa {
  status: 400 | 404;
  mensagem: string;
}

/**
 * O botão ou select com este `custom_id`, onde quer que ele esteja: numa action
 * row de primeiro nível, no acessório de uma section ou dentro de um container
 * (Components v2). `null` quando a mensagem não o tem.
 *
 * A busca é pela mensagem **como está gravada agora**: um bot que tirou o botão
 * com um `update()` faz o clique antigo cair no 404, que é o que o Discord faz
 * com um componente que não existe mais.
 */
export function acharComponenteInterativo(
  components: readonly ComponenteDeMensagem[],
  customId: string,
): ComponenteInterativo | null {
  for (const c of components) {
    const achado = acharEm(c, customId);
    if (achado) return achado;
  }
  return null;
}

function acharEm(c: ComponenteDeMensagem, customId: string): ComponenteInterativo | null {
  switch (c.type) {
    case TIPO_DE_COMPONENTE.ACTION_ROW:
      for (const filho of c.components) {
        // o text input é de modal: numa mensagem ele não é clicável (e a regra
        // de conjunto já o recusa na gravação)
        if (filho.type === TIPO_DE_COMPONENTE.TEXT_INPUT) continue;
        if (filho.custom_id === customId) return filho;
      }
      return null;
    case TIPO_DE_COMPONENTE.SECTION:
      return c.accessory.type === TIPO_DE_COMPONENTE.BUTTON && c.accessory.custom_id === customId
        ? c.accessory
        : null;
    case TIPO_DE_COMPONENTE.CONTAINER:
      for (const filho of c.components) {
        const achado = acharEm(filho as ComponenteDeMensagem, customId);
        if (achado) return achado;
      }
      return null;
    default:
      return null;
  }
}

/**
 * O clique contra o componente achado. `null` = pode seguir.
 *
 * - não achou → 404 (o `custom_id` não está nesta mensagem);
 * - tipo diferente do que a tela disse → 400;
 * - desabilitado → 400 (a tela não deixa clicar; quem chega aqui forjou o pedido);
 * - botão de link ou premium → 400: eles não geram interação no Discord;
 * - botão com `values` → 400;
 * - select: `values` obrigatório, sem repetição, dentro de `min_values`/
 *   `max_values` (padrão 1 e 1, como no Discord) e, no de texto, só `value`s
 *   que as opções declaram.
 */
export function conferirClique(
  componente: ComponenteInterativo | null,
  clique: { componentType: number; values?: readonly string[] },
): Recusa | null {
  if (!componente) return { status: 404, mensagem: "Componente não encontrado" };
  if (componente.type !== clique.componentType) {
    return { status: 400, mensagem: "O tipo do componente não confere" };
  }
  if (componente.disabled) return { status: 400, mensagem: "Componente desabilitado" };

  if (componente.type === TIPO_DE_COMPONENTE.BUTTON) {
    if (componente.style === ESTILO_DE_BOTAO.LINK || componente.style === ESTILO_DE_BOTAO.PREMIUM) {
      return { status: 400, mensagem: "Este botão não gera interação" };
    }
    if (clique.values !== undefined) return { status: 400, mensagem: "Botão não tem valores" };
    return null;
  }

  if (clique.values === undefined) return { status: 400, mensagem: "Select sem valores" };
  return conferirValores(componente, clique.values, { obrigatorio: true });
}

/**
 * Os valores de um select (de mensagem ou de modal). `obrigatorio: false` só
 * num modal com `required: false`: aí a lista vazia vale.
 */
function conferirValores(
  select: SelectDeBot,
  values: readonly string[],
  opcoes: { obrigatorio: boolean },
): Recusa | null {
  if (new Set(values).size !== values.length) {
    return { status: 400, mensagem: "Valor repetido" };
  }
  if (values.length === 0 && !opcoes.obrigatorio) return null;
  const min = select.min_values ?? 1;
  const max = select.max_values ?? 1;
  if (values.length < min || values.length > max) {
    return { status: 400, mensagem: `Escolha entre ${min} e ${max} valores` };
  }
  if (select.type === TIPO_DE_COMPONENTE.STRING_SELECT) {
    const validos = new Set(select.options.map((o) => o.value));
    if (values.some((v) => !validos.has(v))) return { status: 400, mensagem: "Valor fora das opções" };
  }
  return null;
}

// ── qual callback vale para qual interação ───────────────────

/**
 * A tabela do Discord (`receiving-and-responding.mdx`, "Interaction Callback
 * Type"), por tipo de interação:
 *
 * | Interação | 4 · 5 | 6 · 7 | 8 | 9 |
 * |---|---|---|---|---|
 * | 2 comando | sim | — | — | sim |
 * | 3 componente | sim | sim | — | sim |
 * | 4 autocomplete | — | — | sim | — |
 * | 5 envio de modal | sim | só se o modal veio de um componente | — | — |
 *
 * 6 e 7 editam a **mensagem de origem**; um modal aberto por um comando de
 * barra não tem mensagem de origem, e o Discord recusa o `update()` ali.
 */
export function callbackPermitido(
  tipoDaInteracao: number,
  tipoDoCallback: number,
  temMensagemDeOrigem: boolean,
): boolean {
  switch (tipoDoCallback) {
    case TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE:
    case TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE:
      return (
        tipoDaInteracao === TIPO_DE_INTERACAO.APPLICATION_COMMAND ||
        tipoDaInteracao === TIPO_DE_INTERACAO.MESSAGE_COMPONENT ||
        tipoDaInteracao === TIPO_DE_INTERACAO.MODAL_SUBMIT
      );
    case TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE:
    case TIPO_DE_CALLBACK.UPDATE_MESSAGE:
      return (
        (tipoDaInteracao === TIPO_DE_INTERACAO.MESSAGE_COMPONENT ||
          tipoDaInteracao === TIPO_DE_INTERACAO.MODAL_SUBMIT) &&
        temMensagemDeOrigem
      );
    case TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT:
      return tipoDaInteracao === TIPO_DE_INTERACAO.APPLICATION_COMMAND_AUTOCOMPLETE;
    case TIPO_DE_CALLBACK.MODAL:
      return (
        tipoDaInteracao === TIPO_DE_INTERACAO.APPLICATION_COMMAND ||
        tipoDaInteracao === TIPO_DE_INTERACAO.MESSAGE_COMPONENT
      );
    default:
      return false;
  }
}

/** A interação é das que a web acompanha pelo `nonce` (e leva o `interaction.success`)? */
export function ehInteracaoDeComponente(tipoDaInteracao: number): boolean {
  return (
    tipoDaInteracao === TIPO_DE_INTERACAO.MESSAGE_COMPONENT ||
    tipoDaInteracao === TIPO_DE_INTERACAO.MODAL_SUBMIT
  );
}

// ── o envio do modal ─────────────────────────────────────────

/**
 * Um campo do modal que a pessoa respondeu, já no formato do `MODAL_SUBMIT` do
 * Discord, com os `id` **do modal gravado** (e não os que a web mandou).
 * Para 5–8 e 19 os `values` ainda são cuids: quem os troca é o service.
 */
export type CampoDoEnvio = RespostaDeCampoDeModal;

export type ComponenteDoEnvio =
  | { type: 18; id: number; component: CampoDoEnvio }
  | { type: 1; id: number; components: [{ type: 4; id: number; custom_id: string; value: string }] }
  | { type: 10; id: number };

/**
 * O envio contra o modal que o bot abriu (`Interaction.modal`).
 *
 * A saída é **montada a partir do modal**, na ordem dele: é o que garante que o
 * bot só recebe campos que ele mesmo declarou, com os `id` que ele deu, e que um
 * campo não obrigatório que a pessoa não tocou chega com o valor vazio (o
 * Discord também manda todos). Da web só se aproveitam os valores.
 *
 * Recusa (400) quando: um campo enviado não existe no modal, ou existe com
 * outro tipo; um obrigatório (o padrão do Discord é `required: true`) chega
 * vazio; texto fora de `min_length`/`max_length`; valor fora das opções ou
 * contagem fora de `min_values`/`max_values`.
 */
export function conferirEnvioDoModal(
  modal: ModalDeBot,
  enviados: readonly RespostaDeComponenteDeModal[],
): { ok: true; components: ComponenteDoEnvio[] } | { ok: false; recusa: Recusa } {
  const respostas = new Map<string, RespostaDeCampoDeModal>();
  for (const e of enviados) {
    const campos: RespostaDeCampoDeModal[] =
      e.type === 18 ? [e.component] : e.type === 1 ? e.components : [];
    for (const campo of campos) {
      if (respostas.has(campo.custom_id)) {
        return { ok: false, recusa: { status: 400, mensagem: `Campo repetido: ${campo.custom_id}` } };
      }
      respostas.set(campo.custom_id, campo);
    }
  }

  const declarados = new Set<string>();
  const saida: ComponenteDoEnvio[] = [];
  for (const c of modal.components) {
    if (c.type === 10) {
      saida.push({ type: 10, id: c.id ?? 0 });
      continue;
    }
    if (c.type === 1) {
      // a forma antiga: action row com exatamente um text input (conferido na
      // gravação por `conferirModalDeBot`)
      const input = c.components[0];
      if (!input || input.type !== 4) continue;
      declarados.add(input.custom_id);
      const r = campoDoEnvio(input, respostas.get(input.custom_id));
      if (!r.ok) return r;
      const valor = r.campo as { type: 4; id: number; custom_id: string; value: string };
      saida.push({ type: 1, id: c.id ?? 0, components: [valor] });
      continue;
    }
    declarados.add(c.component.custom_id);
    const r = campoDoEnvio(c.component, respostas.get(c.component.custom_id));
    if (!r.ok) return r;
    saida.push({ type: 18, id: c.id ?? 0, component: r.campo });
  }

  for (const customId of respostas.keys()) {
    if (!declarados.has(customId)) {
      return { ok: false, recusa: { status: 400, mensagem: `Campo inexistente: ${customId}` } };
    }
  }
  return { ok: true, components: saida };
}

function campoDoEnvio(
  definido: FilhoDeLabel | TextInput,
  resposta: RespostaDeCampoDeModal | undefined,
): { ok: true; campo: CampoDoEnvio } | { ok: false; recusa: Recusa } {
  const recusa = (mensagem: string) => ({ ok: false as const, recusa: { status: 400 as const, mensagem } });
  if (resposta && resposta.type !== definido.type) {
    return recusa(`Campo ${definido.custom_id}: tipo não confere`);
  }
  const id = definido.id ?? 0;
  const custom_id = definido.custom_id;
  // "defaults to true" em todos os campos que têm `required` (`components/reference.mdx`).
  // Não é `"required" in definido`: o bot quase nunca manda a chave, e ausente
  // quer dizer obrigatório. O checkbox avulso (23) não tem `required`.
  const obrigatorio =
    definido.type !== 23 && (definido as { required?: boolean }).required !== false;

  switch (definido.type) {
    case 4: {
      const value = resposta && "value" in resposta && typeof resposta.value === "string" ? resposta.value : "";
      if (value.length === 0) {
        if (obrigatorio) return recusa(`Campo ${custom_id}: obrigatório`);
        return { ok: true, campo: { type: 4, id, custom_id, value } };
      }
      const min = definido.min_length ?? 0;
      const max = definido.max_length ?? 4000;
      if (value.length < min || value.length > max) {
        return recusa(`Campo ${custom_id}: entre ${min} e ${max} caracteres`);
      }
      return { ok: true, campo: { type: 4, id, custom_id, value } };
    }
    case 3:
    case 5:
    case 6:
    case 7:
    case 8: {
      const values = resposta && "values" in resposta ? resposta.values : [];
      if (values.length === 0 && obrigatorio) return recusa(`Campo ${custom_id}: obrigatório`);
      const r = conferirValores(definido, values, { obrigatorio });
      if (r) return recusa(`Campo ${custom_id}: ${r.mensagem}`);
      return { ok: true, campo: { type: definido.type, id, custom_id, values: [...values] } };
    }
    case 19: {
      const values = resposta && "values" in resposta ? resposta.values : [];
      if (values.length === 0) {
        if (obrigatorio) return recusa(`Campo ${custom_id}: obrigatório`);
        return { ok: true, campo: { type: 19, id, custom_id, values: [] } };
      }
      if (new Set(values).size !== values.length) return recusa(`Campo ${custom_id}: arquivo repetido`);
      const min = definido.min_values ?? 1;
      const max = definido.max_values ?? 1;
      if (values.length < min || values.length > max) {
        return recusa(`Campo ${custom_id}: envie entre ${min} e ${max} arquivos`);
      }
      return { ok: true, campo: { type: 19, id, custom_id, values: [...values] } };
    }
    case 21: {
      const value = resposta && "value" in resposta && typeof resposta.value === "string" ? resposta.value : null;
      if (value === null) {
        if (obrigatorio) return recusa(`Campo ${custom_id}: obrigatório`);
        return { ok: true, campo: { type: 21, id, custom_id, value: null } };
      }
      if (!definido.options.some((o) => o.value === value)) {
        return recusa(`Campo ${custom_id}: valor fora das opções`);
      }
      return { ok: true, campo: { type: 21, id, custom_id, value } };
    }
    case 22: {
      const values = resposta && "values" in resposta ? resposta.values : [];
      if (new Set(values).size !== values.length) return recusa(`Campo ${custom_id}: valor repetido`);
      const validos = new Set(definido.options.map((o) => o.value));
      if (values.some((v) => !validos.has(v))) return recusa(`Campo ${custom_id}: valor fora das opções`);
      if (values.length === 0 && !obrigatorio) {
        return { ok: true, campo: { type: 22, id, custom_id, values: [] } };
      }
      // "não medido": o padrão de `min_values` do checkbox group não foi
      // conferido na documentação; vale 1 quando obrigatório, como no select
      const min = definido.min_values ?? (obrigatorio ? 1 : 0);
      const max = definido.max_values ?? definido.options.length;
      if (values.length < min || values.length > max) {
        return recusa(`Campo ${custom_id}: marque entre ${min} e ${max}`);
      }
      return { ok: true, campo: { type: 22, id, custom_id, values: [...values] } };
    }
    case 23: {
      const value = resposta && "value" in resposta && typeof resposta.value === "boolean" ? resposta.value : false;
      return { ok: true, campo: { type: 23, id, custom_id, value } };
    }
  }
}

/**
 * O arquivo enviado combina com `file_types` do upload? `image`/`video`/`audio`
 * casam pelo começo do `content-type`; `.pdf` casa pela extensão do nome. Sem
 * `file_types`, tudo vale.
 */
export function arquivoAceito(
  tipos: readonly string[] | undefined,
  anexo: { filename: string; contentType: string },
): boolean {
  if (!tipos || tipos.length === 0) return true;
  const nome = anexo.filename.toLowerCase();
  const tipo = anexo.contentType.toLowerCase();
  return tipos.some((t) => {
    const x = t.toLowerCase();
    if (x.startsWith(".")) return nome.endsWith(x);
    return tipo === x || tipo.startsWith(`${x}/`);
  });
}

// ── o autocomplete ───────────────────────────────────────────

/** Os tipos de opção que aceitam `autocomplete: true` no Discord: string, integer e number. */
const TIPOS_COM_AUTOCOMPLETE = new Set<number>([3, 4, 10]);

export interface OpcaoDoPedido {
  name: string;
  type: number;
  value: string | number | boolean;
  focused?: boolean;
}

/**
 * O pedido de autocomplete contra as opções declaradas. Ao contrário do
 * `conferirOpcoes` do comando, aqui **não** se exige opção obrigatória nem valor
 * do tipo certo: a pessoa está no meio da digitação, e o Discord manda o que
 * houver. O que se exige: toda opção enviada existe com o tipo declarado, uma só
 * está em foco, e a em foco declara `autocomplete: true`.
 *
 * Devolve as opções na ordem do comando, com o `value` da em foco **em texto**
 * (é como o Discord a manda — `getFocused()` do discord.js devolve string).
 */
export function conferirPedidoDeAutocomplete(
  declaradas: readonly OpcaoDeComando[],
  enviadas: readonly OpcaoDoPedido[],
): { ok: true; opcoes: OpcaoDoPedido[]; emFoco: string } | { ok: false; recusa: Recusa } {
  const recusa = (mensagem: string) => ({ ok: false as const, recusa: { status: 400 as const, mensagem } });
  const vistas = new Set<string>();
  for (const o of enviadas) {
    if (vistas.has(o.name)) return recusa(`Opção repetida: ${o.name}`);
    vistas.add(o.name);
    const d = declaradas.find((x) => x.name === o.name);
    if (!d) return recusa(`Opção desconhecida: ${o.name}`);
    if (d.type !== o.type) return recusa(`Opção ${o.name}: tipo errado`);
  }
  const focadas = enviadas.filter((o) => o.focused);
  if (focadas.length !== 1) return recusa("Exatamente uma opção precisa estar em foco");
  const foco = focadas[0]!;
  const declarada = declaradas.find((x) => x.name === foco.name)!;
  if (!declarada.autocomplete || !TIPOS_COM_AUTOCOMPLETE.has(declarada.type)) {
    return recusa(`Opção ${foco.name}: não tem autocomplete`);
  }

  const opcoes = declaradas
    .map((d) => enviadas.find((e) => e.name === d.name))
    .filter((e): e is OpcaoDoPedido => e !== undefined)
    .map((e) => (e.focused ? { name: e.name, type: e.type, value: String(e.value), focused: true } : { name: e.name, type: e.type, value: e.value }));
  return { ok: true, opcoes, emFoco: foco.name };
}
