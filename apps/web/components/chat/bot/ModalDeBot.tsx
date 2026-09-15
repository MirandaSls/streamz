"use client";

import {
  useMemo,
  useRef,
  useState,
  type DragEvent as DragEventDoReact,
  type KeyboardEvent as KeyboardEventDoReact,
} from "react";
import {
  MAX_ATTACHMENT_SIZE,
  type Category,
  type Channel,
  type ComponenteDeModal,
  type EmojiParcial,
  type FileUpload as CampoDeUploadDoBot,
  type FilhoDeLabel,
  type Label as LabelDeModal,
  type RespostaDeCampoDeModal,
  type RespostaDeComponenteDeModal,
  type Role,
  type TextInput as CampoDeTextoDoBot,
} from "@streamz/shared";
import {
  BotaoDeIcone,
  Button,
  Campo,
  Checkbox,
  MensagemDeAjuda,
  Modal,
  MultiSelect,
  RadioGroup,
  Select,
  TextArea,
  TextInput,
  type OpcaoDeSelect,
} from "@/components/ui/primitivos";
import { FileText, Upload, X } from "@/components/ui/icones";
import { Markdown } from "@/lib/markdown";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import Emoji from "@/components/ui/Emoji";
import { useGuilds } from "@/stores/guilds";
import { useChannels } from "@/stores/channels";
import { useCategories } from "@/stores/categories";
import { usePermissions } from "@/stores/permissions";
import { useEmojis, todosOsEmojis } from "@/stores/emojis";
import { useEhMobile } from "@/hooks/useEhMobile";
import { canaisFiltrados } from "./select-canais";
import {
  dentroDoLimite,
  limitesDoComponente,
  multiploDoComponente,
  opcaoDeItemDeCanal,
  opcaoDeUsuario,
  opcoesDeCargo,
  placeholderPadrao,
  resolverEmojiDeOpcao,
  valoresIniciais,
} from "./select-opcoes";
import { type ModalAberto, useInteracoesDeBot } from "@/stores/interacoes-de-bot";

/**
 * ── onda 3 (cartão 3f) ── O modal que um bot abre pelo callback 9 (`MODAL`),
 * montado por `HostDeModalDeBot`. Contrato: `docs/CONTRATO-ONDA-3.md` §1.2
 * (forma do `ModalDeBot`/`ComponenteDeModal`/`RespostaDeComponenteDeModal`),
 * §4.2 (a rota `enviarModalDeBot`) e §6 (a store `interacoes-de-bot.ts`, que já
 * existe e não é tocada aqui — só lida e chamada).
 *
 * ## Que modal é este (regra de autoridade do plano: print > CSS > catálogo)
 *
 * Não há print 1:1 de um modal de bot no acervo (é UI que só um bot de
 * terceiro aciona; nenhum print de `docs/Reference/` mostra um). O que existe
 * é a doc oficial do Discord com capturas reais do cliente dele — mais forte
 * que o `manifesto.json`/catálogo genérico, mas ainda abaixo de print 1:1 e
 * CSS medido; os números abaixo que vieram só dali estão marcados "não
 * medido" no retorno do cartão, não chutados.
 *
 * Imagens usadas (`desenvolvedores/imagens/modais/`):
 * `modal-simples-desktop.webp` e `modal-label-e-text-input.webp` (cabeçalho
 * com avatar do bot + título, aviso, `Label` com texto curto/parágrafo e
 * contador), `modal-bug-report.webp` (dois campos: select + text area, ritmo
 * entre eles), `modal-checkbox.webp` (checkbox único: o texto do `Label` é o
 * PRÓPRIO rótulo do checkbox, sem cabeçalho separado — diferente dos outros
 * tipos), `modal-checkbox-group.webp` e `modal-radio-group.webp` (cabeçalho +
 * descrição, depois a lista, cada opção com rótulo e descrição secundária),
 * `modal-string-select.webp` e `modal-text-display.webp` (o `Jail` mostra um
 * select de canal aberto: mesma caixa "Make a selection" + chevron que o
 * `select` de mensagem, então o corpo reaproveita o primitivo `Select`, não o
 * `Popout` cru do `SelectDeBot`), `modal-file-upload.webp` (a área de soltar
 * arquivo — ver "Upload de arquivo" abaixo), `modal-na-visao-geral.png` (a
 * forma ANTIGA, sem `Label`: rótulo em
 * caixa-alta 12px, sem descrição — não replicada; o app já abandonou
 * caixa-alta em outros lugares da ADR-0009, e é a evidência mais fraca das
 * três).
 *
 * ## Por que não reaproveito `SelectDeBot` (cartão 3d) para os campos de select
 *
 * `SelectDeBot` manda a interação **assim que a lista fecha** (é o
 * comportamento certo para um select de MENSAGEM, que é a própria resposta).
 * Um select dentro de um modal não é a resposta — é só um campo do
 * formulário, que só vira `Interaction` quando "Enviar" é clicado, junto com
 * os outros campos. `SelectDeBot` também exige `message: Message`, que não
 * existe aqui (o modal pode ter vindo de um comando, sem mensagem de
 * origem). Por isso os campos de select do modal compõem os primitivos
 * `Select`/`MultiSelect` direto (que já têm o "buscável" e o "múltiplo" que
 * `SelectDeBot` precisou contornar com `Popout` cru — aqui servem sem
 * ajuste), com as MESMAS fontes de dados vivas que `SelectDeBot` usa
 * (`stores/guilds`, `permissions`, `channels`) e os MESMOS helpers puros
 * (`select-opcoes.ts`, `select-canais.ts`). Desde a rodada de correção a
 * montagem de cada linha (avatar com presença e pílula de bot, escudo do
 * cargo, ícone do canal, categoria) também mora em `select-opcoes.ts` — antes
 * este arquivo tinha a sua cópia, que já tinha divergido da do `SelectDeBot`.
 *
 * ## Guilda do select ao vivo (usuário/cargo/canal/mencionável)
 *
 * Sem `message.guildId` para conferir (não há mensagem), assume-se que a
 * guilda **ativa** (`useGuilds().activeGuildId`) é a do canal onde a
 * interação começou — só é possível abrir um modal a partir do canal que já
 * está na tela. Em DM (sem guilda) esses quatro tipos ficam sem opção
 * nenhuma: ver "faltando".
 *
 * ## Upload de arquivo (tipo 19)
 *
 * A área de soltar sobe cada arquivo na hora por `POST /uploads`
 * (`api.uploadFileComProgresso`, o mesmo endpoint dos anexos do composer) e
 * guarda em `valores` só os cuids dos que terminaram — é o que a API espera
 * em `values` (`resolverAnexosDoUpload` em `interactions.service.ts`: anexo de
 * quem envia, ainda sem mensagem). Antes de subir, valida localmente o que a
 * API recusaria de qualquer jeito: o máximo (`max_values`, padrão 1 como os
 * selects), os `file_types` (a mesma regra do `arquivoAceito` da API:
 * `image`/`video`/`audio` casam o prefixo do MIME, `.ext` casa o fim do nome)
 * e o teto de tamanho do upload (`MAX_ATTACHMENT_SIZE`). O mínimo é conferido
 * no "Enviar", e um envio ainda subindo segura o formulário.
 *
 * Desenho: `modal-file-upload.webp` — caixa de borda contínua (não
 * tracejada), ícone de arquivo com seta, "Drop files here or **browse**" com
 * o link na cor de link e a linha pequena de limite embaixo. Imagem de
 * catálogo sem escala conhecida: paddings, raio e tamanhos **não medidos**. O
 * limite escrito é o nosso (25 MB), não os 500 MB do Discord.
 *
 * ## Estados obrigatórios
 *
 * Repouso/hover/foco/desabilitado vêm de graça dos primitivos. Carregando:
 * `aberto.enviando` desabilita todo campo e troca "Enviar" pelos três pontos
 * do `Button` (`carregando`). Falhou: `aberto.erro` (o "Algo deu errado" da
 * store) aparece como aviso dentro do modal — o Discord não tem toast para
 * isto, é inline, como o comentário de `ModalAberto.erro` já registra.
 */

/** Valor local de um campo, na forma nativa mais simples (não a forma de envio do Discord). */
type ValorDoCampo = string | string[] | boolean | null;

// ── estado inicial: o que a mensagem/bot já preencheu (`value`/`default`) ──

function valorInicialDoCampo(campo: FilhoDeLabel): ValorDoCampo {
  switch (campo.type) {
    case 4:
      return campo.value ?? "";
    case 3:
    case 5:
    case 6:
    case 7:
    case 8:
      return valoresIniciais(campo);
    case 19:
      return [];
    case 21:
      return campo.options.find((o) => o.default)?.value ?? null;
    case 22:
      return campo.options.filter((o) => o.default).map((o) => o.value);
    case 23:
      return campo.default ?? false;
  }
}

/**
 * O text input de uma action row de modal (a forma antiga, antes do `Label`).
 *
 * O schema do shared reusa a action row genérica, cujos filhos também podem ser
 * botão e select; quem garante que a row de um modal só traz um text input é o
 * `validarModalDeBot` da API, antes de o modal chegar aqui. O cast só registra
 * essa garantia para o TypeScript.
 */
function textInputDaLinha(linha: { components: readonly unknown[] }): CampoDeTextoDoBot {
  return linha.components[0] as CampoDeTextoDoBot;
}

function estadoInicial(componentes: readonly ComponenteDeModal[]): Record<string, ValorDoCampo> {
  const estado: Record<string, ValorDoCampo> = {};
  for (const c of componentes) {
    if (c.type === 18) {
      estado[c.component.custom_id] = valorInicialDoCampo(c.component);
    } else if (c.type === 1) {
      const ti = textInputDaLinha(c);
      estado[ti.custom_id] = ti.value ?? "";
    }
    // type === 10 (text display): sem valor, nada a inicializar
  }
  return estado;
}

/** `required` padrão `true` no Discord quando o bot omite o campo — exceto no `Checkbox` único, que não tem essa propriedade. */
function ehObrigatorio(campo: FilhoDeLabel | CampoDeTextoDoBot): boolean {
  if (campo.type === 23) return false;
  return campo.required !== false;
}

/** `min`/`max` de um select do modal: como `limitesDoComponente` (padrão 1/1), exceto quando `required: false` e o bot não mandou `min_values` — aí o mínimo cai para 0 (Discord permite não escolher nada). */
function limitesDoSelectNoModal(campo: { min_values?: number; max_values?: number; required?: boolean }): {
  min: number;
  max: number;
} {
  const base = limitesDoComponente(campo);
  if (campo.required === false && campo.min_values === undefined) return { min: 0, max: base.max };
  return base;
}

// ── validação local, antes de gastar a interação ───────────────────────────

function validarCampo(campo: FilhoDeLabel, valor: ValorDoCampo): string | null {
  switch (campo.type) {
    case 4: {
      const texto = typeof valor === "string" ? valor : "";
      if (ehObrigatorio(campo) && texto.trim() === "") return "Obrigatório.";
      if (campo.min_length && texto.length < campo.min_length) return `Mínimo de ${campo.min_length} caracteres.`;
      return null;
    }
    case 3:
    case 5:
    case 6:
    case 7:
    case 8: {
      const lista = Array.isArray(valor) ? valor : [];
      const { min, max } = limitesDoSelectNoModal(campo);
      if (dentroDoLimite(lista.length, min, max)) return null;
      return min === max ? `Selecione ${min}.` : `Selecione de ${min} a ${max}.`;
    }
    case 19: {
      const lista = Array.isArray(valor) ? valor : [];
      const { min, max } = limitesDoSelectNoModal(campo);
      if (dentroDoLimite(lista.length, min, max)) return null;
      if (lista.length > max) return max === 1 ? "Envie só 1 arquivo." : `Envie no máximo ${max} arquivos.`;
      return min === 1 ? "Envie 1 arquivo." : `Envie pelo menos ${min} arquivos.`;
    }
    case 21:
      return ehObrigatorio(campo) && valor == null ? "Selecione uma opção." : null;
    case 22: {
      const lista = Array.isArray(valor) ? valor : [];
      const min = campo.min_values ?? (ehObrigatorio(campo) ? 1 : 0);
      const max = campo.max_values ?? campo.options.length;
      if (dentroDoLimite(lista.length, min, max)) return null;
      return min === max ? `Selecione ${min}.` : `Selecione de ${min} a ${max}.`;
    }
    case 23:
      return null; // caixa única: qualquer marcado/desmarcado vale
  }
}

function validarTudo(
  componentes: readonly ComponenteDeModal[],
  valores: Record<string, ValorDoCampo>,
): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const c of componentes) {
    if (c.type === 18) {
      const erro = validarCampo(c.component, valores[c.component.custom_id] ?? null);
      if (erro) erros[c.component.custom_id] = erro;
    } else if (c.type === 1) {
      const ti = textInputDaLinha(c);
      const texto = typeof valores[ti.custom_id] === "string" ? (valores[ti.custom_id] as string) : "";
      if (ehObrigatorio(ti) && texto.trim() === "") erros[ti.custom_id] = "Obrigatório.";
      else if (ti.min_length && texto.length < ti.min_length) erros[ti.custom_id] = `Mínimo de ${ti.min_length} caracteres.`;
    }
  }
  return erros;
}

// ── monta o corpo do POST a partir do estado local ──────────────────────────

function respostaDoCampo(campo: FilhoDeLabel, valor: ValorDoCampo): RespostaDeCampoDeModal {
  const id = campo.id ?? 0;
  switch (campo.type) {
    case 4:
      return { type: 4, id, custom_id: campo.custom_id, value: typeof valor === "string" ? valor : "" };
    case 3:
    case 5:
    case 6:
    case 7:
    case 8:
      return { type: campo.type, id, custom_id: campo.custom_id, values: Array.isArray(valor) ? valor : [] };
    case 19:
      return { type: 19, id, custom_id: campo.custom_id, values: Array.isArray(valor) ? valor : [] };
    case 21:
      return { type: 21, id, custom_id: campo.custom_id, value: typeof valor === "string" ? valor : null };
    case 22:
      return { type: 22, id, custom_id: campo.custom_id, values: Array.isArray(valor) ? valor : [] };
    case 23:
      return { type: 23, id, custom_id: campo.custom_id, value: valor === true };
  }
}

function construirResposta(
  componentes: readonly ComponenteDeModal[],
  valores: Record<string, ValorDoCampo>,
): RespostaDeComponenteDeModal[] {
  return componentes.map((c): RespostaDeComponenteDeModal => {
    if (c.type === 18) {
      return { type: 18, id: c.id ?? 0, component: respostaDoCampo(c.component, valores[c.component.custom_id] ?? null) };
    }
    if (c.type === 1) {
      const ti = textInputDaLinha(c);
      const valor = valores[ti.custom_id];
      return {
        type: 1,
        id: c.id ?? 0,
        components: [{ type: 4, id: ti.id ?? 0, custom_id: ti.custom_id, value: typeof valor === "string" ? valor : "" }],
      };
    }
    return { type: 10, id: c.id ?? 0 };
  });
}

// ── select de campo (mesma fonte de dados que `SelectDeBot`, ver cabeçalho) ─
// usuário, cargo e canal: `opcaoDeUsuario`/`opcoesDeCargo`/`opcaoDeItemDeCanal`
// de `select-opcoes.ts`, os mesmos do `SelectDeBot`

// referências estáveis para "outra guilda": o seletor não devolve um `[]`
// novo a cada leitura da store (o que re-renderizaria em laço)
const SEM_CARGOS: Role[] = [];
const SEM_CANAIS: Channel[] = [];
const SEM_CATEGORIAS: Category[] = [];

/** Emoji de uma opção do select de texto (mesma resolução que `SelectDeBot.PrefixoDeEmoji`). */
function useEmojiDeOpcao(emoji: EmojiParcial | undefined) {
  const guilds = useEmojis((s) => s.guilds);
  const emojis = useMemo(() => todosOsEmojis(guilds), [guilds]);
  return resolverEmojiDeOpcao(emoji, emojis);
}

function PrefixoDeEmoji({ emoji }: { emoji: EmojiParcial | undefined }) {
  const resolvido = useEmojiDeOpcao(emoji);
  if (!resolvido) return null;
  if (resolvido.tipo === "personalizado") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolvido.url} alt={resolvido.alt} className="h-4 w-4 shrink-0 object-contain" />;
  }
  if (resolvido.tipo === "unicode") return <Emoji emoji={resolvido.caractere} tamanho={16} />;
  return <span className="text-text-sm text-text-muted">:{resolvido.texto}:</span>;
}

/** Um dos cinco tipos de select (3/5/6/7/8) dentro de um `Label` de modal. */
function CampoDeSelect({
  campo,
  valor,
  aoMudar,
  desabilitado,
}: {
  campo: Extract<FilhoDeLabel, { type: 3 | 5 | 6 | 7 | 8 }>;
  valor: string[];
  aoMudar: (v: string[]) => void;
  desabilitado: boolean;
}) {
  // `guilds.members` já é escopado à guilda ativa pela própria store (ver
  // `select()` nela); `permissions`/`channels` guardam o `guildId` que
  // carregaram por último, que pode ficar um instante atrás da guilda ativa
  // numa troca de servidor — por isso só esses dois conferem contra ela.
  const guildId = useGuilds((s) => s.activeGuildId);
  const membros = useGuilds((s) => s.members);
  const roles = usePermissions((s) => (s.guildId === guildId ? s.roles : SEM_CARGOS));
  const canais = useChannels((s) => (s.guildId === guildId ? s.channels : SEM_CANAIS));
  // categoria entra como "canal 4" só quando o bot pede — ver `select-canais.ts`
  const categorias = useCategories((s) => (s.guildId === guildId ? s.categories : SEM_CATEGORIAS));

  const opcoes = useMemo<OpcaoDeSelect<string>[]>(() => {
    if (campo.type === 3) {
      return campo.options.map((o) => ({
        valor: o.value,
        rotulo: o.label,
        descricao: o.description,
        prefixo: o.emoji ? <PrefixoDeEmoji emoji={o.emoji} /> : undefined,
      }));
    }
    if (campo.type === 5) return membros.map((m) => opcaoDeUsuario(m.user));
    if (campo.type === 6) return opcoesDeCargo(roles);
    if (campo.type === 8) {
      return canaisFiltrados(canais, campo.channel_types, "", categorias).map(opcaoDeItemDeCanal);
    }
    // 7 · mencionável: usuários e depois cargos (mesma ordem de `SelectDeBot`)
    return [...membros.map((m) => opcaoDeUsuario(m.user)), ...opcoesDeCargo(roles)];
  }, [campo, membros, roles, canais, categorias]);

  const placeholder = campo.placeholder || placeholderPadrao(campo.type);
  const buscavel = campo.type !== 3;
  const multiplo = multiploDoComponente(campo);
  const { max } = limitesDoSelectNoModal(campo);

  if (multiplo) {
    return (
      <MultiSelect
        opcoes={opcoes}
        valor={valor}
        aoMudar={aoMudar}
        placeholder={placeholder}
        desabilitado={desabilitado}
        buscavel={buscavel}
        maximo={max}
        rotulo={placeholder}
      />
    );
  }
  return (
    <Select
      opcoes={opcoes}
      valor={valor[0] ?? null}
      aoMudar={(v) => aoMudar([v])}
      placeholder={placeholder}
      desabilitado={desabilitado}
      buscavel={buscavel}
      rotulo={placeholder}
    />
  );
}

/** Um arquivo da área de soltar: subindo (`id` e `erro` nulos), pronto (`id`) ou recusado pela API (`erro`). */
interface ArquivoDoCampo {
  chave: number;
  nome: string;
  tamanho: number;
  progresso: number;
  id: string | null;
  erro: string | null;
}

/**
 * `file_types` do bot → atributo `accept` do `<input type="file">`: os três
 * nomes curtos viram curinga de MIME, o resto (`.pdf`, `application/pdf`)
 * passa como está. Só filtra o seletor do sistema; quem manda é
 * `arquivoCabeNoCampo`, porque arrastar ignora o `accept`.
 */
function acceptDoCampo(tipos: readonly string[] | undefined): string | undefined {
  if (!tipos || tipos.length === 0) return undefined;
  return tipos
    .map((t) => (t === "image" || t === "video" || t === "audio" ? `${t}/*` : t))
    .join(",");
}

/** A mesma regra do `arquivoAceito` da API (`interactions/componentes.ts`), aplicada ao `File` antes de subir. */
function arquivoCabeNoCampo(tipos: readonly string[] | undefined, arquivo: File): boolean {
  if (!tipos || tipos.length === 0) return true;
  const nome = arquivo.name.toLowerCase();
  const mime = arquivo.type.toLowerCase();
  return tipos.some((t) => {
    const x = t.toLowerCase();
    if (x.startsWith(".")) return nome.endsWith(x);
    return mime === x || mime.startsWith(`${x}/`);
  });
}

/** A área de soltar arquivo do `modal-file-upload.webp` — ver "Upload de arquivo" no cabeçalho. */
function CampoDeArquivo({
  campo,
  id,
  desabilitado,
  temErro,
  aoMudar,
  aoMudarEnvio,
}: {
  campo: CampoDeUploadDoBot;
  id: string;
  desabilitado: boolean;
  temErro: boolean;
  /** cuids dos arquivos que já subiram, na ordem em que foram soltos. */
  aoMudar: (ids: string[]) => void;
  /** `true` enquanto algum arquivo ainda está subindo (o "Enviar" espera). */
  aoMudarEnvio: (enviando: boolean) => void;
}) {
  const ehMobile = useEhMobile();
  const { max } = limitesDoSelectNoModal(campo);
  const [itens, setItens] = useState<ArquivoDoCampo[]>([]);
  // espelho síncrono de `itens`: as respostas do upload chegam depois, e
  // precisam da lista de agora, não da que existia quando o envio começou
  const itensRef = useRef<ArquivoDoCampo[]>([]);
  const proximaChave = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  /** Troca a lista e avisa o formulário (ids prontos + se ainda sobe algo). */
  function publicar(proximos: ArquivoDoCampo[]) {
    itensRef.current = proximos;
    setItens(proximos);
    aoMudar(proximos.flatMap((i) => (i.id ? [i.id] : [])));
    aoMudarEnvio(proximos.some((i) => i.id === null && i.erro === null));
  }

  function atualizar(chave: number, parcial: Partial<ArquivoDoCampo>) {
    publicar(itensRef.current.map((i) => (i.chave === chave ? { ...i, ...parcial } : i)));
  }

  /** Só a barra de progresso: não muda ids nem o "subindo", então não acorda o formulário a cada pacote. */
  function marcarProgresso(chave: number, progresso: number) {
    itensRef.current = itensRef.current.map((i) => (i.chave === chave ? { ...i, progresso } : i));
    setItens(itensRef.current);
  }

  function adicionar(arquivos: readonly File[]) {
    if (desabilitado || arquivos.length === 0) return;
    const ocupados = itensRef.current.filter((i) => i.erro === null).length;
    const aceitos: File[] = [];
    let motivo: string | null = null;
    for (const arquivo of arquivos) {
      if (ocupados + aceitos.length >= max) {
        motivo = max === 1 ? "Só dá para enviar 1 arquivo aqui." : `Só dá para enviar ${max} arquivos aqui.`;
        break;
      }
      if (!arquivoCabeNoCampo(campo.file_types, arquivo)) {
        motivo = `Tipo de arquivo não aceito: ${arquivo.name}`;
        continue;
      }
      if (arquivo.size > MAX_ATTACHMENT_SIZE) {
        motivo = `${arquivo.name} passa de ${formatBytes(MAX_ATTACHMENT_SIZE)}.`;
        continue;
      }
      aceitos.push(arquivo);
    }
    setRecusa(motivo);
    if (aceitos.length === 0) return;

    const novos = aceitos.map(
      (arquivo): ArquivoDoCampo => ({
        chave: proximaChave.current++,
        nome: arquivo.name,
        tamanho: arquivo.size,
        progresso: 0,
        id: null,
        erro: null,
      }),
    );
    publicar([...itensRef.current, ...novos]);
    novos.forEach((item, i) => {
      api
        .uploadFileComProgresso(aceitos[i], (p) => marcarProgresso(item.chave, p))
        .then((anexo) => atualizar(item.chave, { id: anexo.id, progresso: 100 }))
        .catch((e: unknown) =>
          atualizar(item.chave, { erro: e instanceof Error && e.message ? e.message : "Falha ao enviar o arquivo" }),
        );
    });
  }

  function remover(chave: number) {
    publicar(itensRef.current.filter((i) => i.chave !== chave));
    setRecusa(null);
  }

  function aoSoltar(e: DragEventDoReact<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    adicionar(Array.from(e.dataTransfer.files));
  }

  const ocupados = itens.filter((i) => i.erro === null).length;
  const cheio = ocupados >= max;

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          // `preventDefault` sempre, mesmo travado: sem ele o navegador trata o
          // soltar como "abrir o arquivo" e sai do app; quem recusa é `adicionar`
          e.preventDefault();
          if (!desabilitado && !cheio) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-8 text-center transition-colors ${
          arrastando
            ? "border-input-border-active bg-background-mod-subtle"
            : temErro
              ? "border-input-border-error-default bg-background-base-lower"
              : "border-border-subtle bg-background-base-lower"
        } ${desabilitado ? "opacity-60" : ""}`}
      >
        <Upload size={20} aria-hidden="true" className="text-icon-muted" />
        <p className="text-text-md text-text-muted">
          {cheio ? (
            "Limite de arquivos atingido"
          ) : (
            <>
              Solte arquivos aqui ou{" "}
              <button
                type="button"
                disabled={desabilitado}
                onClick={() => inputRef.current?.click()}
                className="text-text-link hover:underline disabled:cursor-not-allowed disabled:no-underline"
              >
                procure
              </button>
            </>
          )}
        </p>
        <p className="text-text-xs text-text-muted">
          {max === 1 ? "Envie 1 arquivo" : `Envie até ${max} arquivos`} de até {formatBytes(MAX_ATTACHMENT_SIZE)}.
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="hidden"
          multiple={max > 1}
          accept={acceptDoCampo(campo.file_types)}
          disabled={desabilitado}
          onChange={(e) => {
            adicionar(Array.from(e.target.files ?? []));
            // limpa para o mesmo arquivo poder ser escolhido de novo depois de removido
            e.target.value = "";
          }}
        />
      </div>
      {recusa ? <p className="text-text-xs text-text-feedback-critical">{recusa}</p> : null}
      {itens.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {itens.map((item) => (
            <li
              key={item.chave}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-background-base-lower py-2 pl-3 pr-1"
            >
              <FileText size={20} aria-hidden="true" className="shrink-0 text-icon-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-text-sm font-medium text-text-default">{item.nome}</p>
                {item.erro ? (
                  <p className="truncate text-text-xs text-text-feedback-critical">{item.erro}</p>
                ) : item.id ? (
                  <p className="text-text-xs text-text-muted">{formatBytes(item.tamanho)}</p>
                ) : (
                  // barra do upload: trilho `--background-mod-strong`, preenchimento na marca
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progresso}
                    aria-label={`Enviando ${item.nome}`}
                    className="mt-1 h-1 overflow-hidden rounded-full bg-background-mod-strong"
                  >
                    <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${item.progresso}%` }} />
                  </div>
                )}
              </div>
              <BotaoDeIcone
                rotulo={`Remover ${item.nome}`}
                icone={<X size={16} aria-hidden="true" />}
                // piso de toque de 44 no celular; o lado vai em `style` dentro
                // do primitivo, então é número pelo `tamanho`, não classe
                tamanho={ehMobile ? 44 : "sm"}
                desabilitado={desabilitado}
                onClick={() => remover(item.chave)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** O controle "nu" de um campo (sem o cabeçalho de `Campo` — quem chama decide se envolve). */
function ControleDoCampo({
  campo,
  valor,
  aoMudar,
  desabilitado,
  id,
  legenda,
  temErro,
  aoPressionarEnter,
  aoMudarEnvio,
}: {
  campo: FilhoDeLabel;
  valor: ValorDoCampo;
  aoMudar: (v: ValorDoCampo) => void;
  desabilitado: boolean;
  id: string;
  /** texto do `Label` pai — vira o `<legend>` (oculto) do `RadioGroup`, mais útil ao leitor de tela que o `custom_id` cru. */
  legenda: string;
  /** a borda vermelha do próprio controle — a mensagem em si já vai por `Campo.erro`, ver `CreateChannelModal` para o mesmo par. */
  temErro: boolean;
  aoPressionarEnter: () => void;
  /** só o upload (19): avisa se ainda há arquivo subindo. */
  aoMudarEnvio: (enviando: boolean) => void;
}) {
  switch (campo.type) {
    case 4: {
      const texto = typeof valor === "string" ? valor : "";
      if (campo.style === 2) {
        return (
          <TextArea
            id={id}
            value={texto}
            onChange={(e) => aoMudar(e.target.value)}
            placeholder={campo.placeholder}
            maxLength={campo.max_length ?? 4000}
            disabled={desabilitado}
            erro={temErro}
            rows={4}
            contador
          />
        );
      }
      return (
        <TextInput
          id={id}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={campo.placeholder}
          maxLength={campo.max_length}
          disabled={desabilitado}
          erro={temErro}
          onKeyDown={(e: KeyboardEventDoReact<HTMLInputElement>) => {
            if (e.key === "Enter") aoPressionarEnter();
          }}
        />
      );
    }
    case 3:
    case 5:
    case 6:
    case 7:
    case 8:
      return (
        <CampoDeSelect
          campo={campo}
          valor={Array.isArray(valor) ? valor : []}
          aoMudar={(v) => aoMudar(v)}
          desabilitado={desabilitado}
        />
      );
    case 19:
      return (
        <CampoDeArquivo
          campo={campo}
          id={id}
          desabilitado={desabilitado}
          temErro={temErro}
          aoMudar={(ids) => aoMudar(ids)}
          aoMudarEnvio={aoMudarEnvio}
        />
      );
    case 21:
      return (
        <RadioGroup
          nome={id}
          legenda={legenda}
          legendaOculta
          valor={typeof valor === "string" ? valor : ""}
          aoMudar={(v) => aoMudar(v)}
          opcoes={campo.options.map((o) => ({ valor: o.value, rotulo: o.label, descricao: o.description }))}
        />
      );
    case 22: {
      const lista = Array.isArray(valor) ? valor : [];
      const max = campo.max_values ?? campo.options.length;
      return (
        <div className="flex flex-col gap-3">
          {campo.options.map((o) => {
            const marcado = lista.includes(o.value);
            return (
              <Checkbox
                key={o.value}
                marcado={marcado}
                desabilitado={desabilitado || (!marcado && lista.length >= max)}
                rotulo={o.label}
                descricao={o.description}
                aoMudar={(m) => aoMudar(m ? [...lista, o.value] : lista.filter((v) => v !== o.value))}
              />
            );
          })}
        </div>
      );
    }
    case 23:
      // caixa única: sem cabeçalho de `Campo` por cima — quem chama (`CampoDeLabel`) já
      // usa o rótulo do `Label` como o próprio texto do checkbox.
      return <Checkbox marcado={valor === true} desabilitado={desabilitado} aoMudar={(m) => aoMudar(m)} rotuloAcessivel={id} />;
  }
}

/** Um `Label` (tipo 18): cabeçalho + controle, exceto o `Checkbox` único, cujo texto do `Label` é o próprio rótulo dele — ver `modal-checkbox.webp` no cabeçalho do arquivo. */
function CampoDeLabel({
  label,
  valor,
  aoMudar,
  erro,
  desabilitado,
  aoPressionarEnter,
  aoMudarEnvio,
}: {
  label: LabelDeModal;
  valor: ValorDoCampo;
  aoMudar: (v: ValorDoCampo) => void;
  erro?: string;
  desabilitado: boolean;
  aoPressionarEnter: () => void;
  aoMudarEnvio: (enviando: boolean) => void;
}) {
  const id = `modal-de-bot-${encodeURIComponent(label.component.custom_id)}`;

  if (label.component.type === 23) {
    return (
      <div>
        <Checkbox
          marcado={valor === true}
          desabilitado={desabilitado}
          aoMudar={(m) => aoMudar(m)}
          rotulo={label.label}
          descricao={label.description}
        />
        {erro ? <p className="mt-1 text-text-xs font-medium italic text-text-feedback-critical">{erro}</p> : null}
      </div>
    );
  }

  return (
    <Campo rotulo={label.label} descricao={label.description} obrigatorio={ehObrigatorio(label.component)} erro={erro}>
      <ControleDoCampo
        campo={label.component}
        valor={valor}
        aoMudar={aoMudar}
        desabilitado={desabilitado}
        id={id}
        legenda={label.label}
        temErro={!!erro}
        aoPressionarEnter={aoPressionarEnter}
        aoMudarEnvio={aoMudarEnvio}
      />
    </Campo>
  );
}

/** A forma antiga (sem `Label`): action row com um único text input — `modal-na-visao-geral.png`. Aqui desenhada com o mesmo `Campo` da forma nova (ver "medidas" do cartão). */
function CampoDeTextInputAntigo({
  ti,
  valor,
  aoMudar,
  erro,
  desabilitado,
  aoPressionarEnter,
}: {
  ti: CampoDeTextoDoBot;
  valor: ValorDoCampo;
  aoMudar: (v: ValorDoCampo) => void;
  erro?: string;
  desabilitado: boolean;
  aoPressionarEnter: () => void;
}) {
  const id = `modal-de-bot-${encodeURIComponent(ti.custom_id)}`;
  const texto = typeof valor === "string" ? valor : "";
  return (
    <Campo rotulo={ti.label ?? ""} obrigatorio={ehObrigatorio(ti)} erro={erro}>
      {ti.style === 2 ? (
        <TextArea
          id={id}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={ti.placeholder}
          maxLength={ti.max_length ?? 4000}
          disabled={desabilitado}
          erro={!!erro}
          rows={4}
          contador
        />
      ) : (
        <TextInput
          id={id}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={ti.placeholder}
          maxLength={ti.max_length}
          disabled={desabilitado}
          erro={!!erro}
          onKeyDown={(e: KeyboardEventDoReact<HTMLInputElement>) => {
            if (e.key === "Enter") aoPressionarEnter();
          }}
        />
      )}
    </Campo>
  );
}

export default function ModalDeBot({ aberto }: { aberto: ModalAberto }) {
  const fecharModal = useInteracoesDeBot((s) => s.fecharModal);
  const enviarModal = useInteracoesDeBot((s) => s.enviarModal);

  const [valores, setValores] = useState<Record<string, ValorDoCampo>>(() => estadoInicial(aberto.modal.components));
  const [erros, setErros] = useState<Record<string, string>>({});
  // campos de upload (19) com arquivo ainda subindo: o "Enviar" espera por eles
  const [subindo, setSubindo] = useState<Record<string, boolean>>({});

  const desabilitado = aberto.enviando;

  function mudar(customId: string, v: ValorDoCampo) {
    setValores((s) => ({ ...s, [customId]: v }));
    // corrige o próprio erro ao editar — não espera outro "Enviar" para sumir
    setErros((s) => {
      if (!s[customId]) return s;
      const { [customId]: _removido, ...resto } = s;
      return resto;
    });
  }

  function aoEnviar() {
    if (desabilitado) return;
    const encontrados = validarTudo(aberto.modal.components, valores);
    for (const [customId, enviando] of Object.entries(subindo)) {
      if (enviando) encontrados[customId] = "Aguarde o envio dos arquivos terminar.";
    }
    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados);
      return;
    }
    void enviarModal(construirResposta(aberto.modal.components, valores));
  }

  return (
    <Modal
      aoFechar={fecharModal}
      titulo={
        <span className="flex items-center gap-3">
          <Avatar user={{ id: aberto.bot.id, username: aberto.bot.username, avatarUrl: aberto.bot.avatarUrl }} size="sm" />
          <span className="min-w-0 truncate">{aberto.modal.title}</span>
        </span>
      }
      rodape={
        <>
          <Button variante="primario" onClick={aoEnviar} carregando={aberto.enviando}>
            Enviar
          </Button>
          <Button variante="secundario" onClick={fecharModal} disabled={aberto.enviando}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* "This form will be submitted to <bot>. Do not share..." — `modal-simples-desktop.webp`
            e os outros da pasta `modais/`. Mesmo aviso do `MensagemDeAjuda` (`tom="aviso"`) que
            `settings/aplicativos/pecas.tsx` já desenha para o mesmo par ícone+caixa+borda de
            aviso do Discord (`.warning_aea291`), então não é uma caixa nova. */}
        <MensagemDeAjuda tom="aviso">
          Este formulário será enviado para <strong>{aberto.bot.displayName ?? aberto.bot.username}</strong>. Não
          compartilhe senhas nem outras informações sensíveis.
        </MensagemDeAjuda>
        {aberto.erro ? <MensagemDeAjuda tom="erro">{aberto.erro}</MensagemDeAjuda> : null}
        {aberto.modal.components.map((c, i) => {
          if (c.type === 18) {
            return (
              <CampoDeLabel
                key={c.component.custom_id}
                label={c}
                valor={valores[c.component.custom_id] ?? null}
                aoMudar={(v) => mudar(c.component.custom_id, v)}
                erro={erros[c.component.custom_id]}
                desabilitado={desabilitado}
                aoPressionarEnter={aoEnviar}
                aoMudarEnvio={(enviando) =>
                  setSubindo((s) =>
                    s[c.component.custom_id] === enviando ? s : { ...s, [c.component.custom_id]: enviando },
                  )
                }
              />
            );
          }
          if (c.type === 1) {
            const ti = textInputDaLinha(c);
            return (
              <CampoDeTextInputAntigo
                key={ti.custom_id}
                ti={ti}
                valor={valores[ti.custom_id] ?? null}
                aoMudar={(v) => mudar(ti.custom_id, v)}
                erro={erros[ti.custom_id]}
                desabilitado={desabilitado}
                aoPressionarEnter={aoEnviar}
              />
            );
          }
          // type === 10: text display — só texto, markdown como o `content` de mensagem
          return (
            <div key={`text-display-${i}`} className="text-text-md text-text-default">
              <Markdown text={c.content} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
