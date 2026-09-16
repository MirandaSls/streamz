import { create } from "zustand";
import {
  PRAZO_DA_RESPOSTA_DO_BOT_MS,
  type AutocompleteDeBotEvent,
  type EscolhaDeAutocomplete,
  type InteracaoCriada,
  type InteracaoConcluidaEvent,
  type InteracaoFalhouEvent,
  type ModalDeBot,
  type ModalDeBotAbertoEvent,
  type MotivoDaFalhaDeInteracao,
  type OpcaoDeInteracao,
  type PedidoDeAutocompleteInput,
  type PublicUser,
  type RespostaDeComponenteDeModal,
} from "@streamz/shared";
import { api } from "@/lib/api";

/**
 * ── onda 3 ── O lado do navegador das interações de componente: botão e select
 * de mensagem de bot, modal aberto pelo bot e sugestões de autocomplete.
 *
 * Escrita pelo cartão 3.0 (contrato); as telas (3b–3g) só **leem** o estado e
 * chamam as ações. O documento é `docs/CONTRATO-ONDA-3.md`.
 *
 * ## Por que o `nonce`, e não o id da interação
 *
 * As rotas devolvem na hora, mas o bot pode responder antes de a resposta HTTP
 * chegar: o `interaction.success` (ou o `interaction.modal`) sairia para uma
 * interação cujo id o navegador ainda não conhece. O `nonce` nasce **aqui**,
 * antes da requisição, vai no corpo e volta em todo evento. É o mesmo truque do
 * `nonce` da mensagem otimista em `stores/messages.ts`.
 *
 * ## Quem decide "Esta interação falhou"
 *
 * O **servidor**, aos `PRAZO_DA_RESPOSTA_DO_BOT_MS` (3 s, o prazo do Discord),
 * com `interaction.failed`. O relógio daqui é só a rede de segurança de quando
 * o socket caiu e o evento nunca vem: ele espera o dobro do prazo, para nunca
 * disputar com o do servidor.
 *
 * ## Várias sessões da mesma conta
 *
 * Os eventos vão para a sala `user:<id>`, ou seja, para o site **e** o desktop
 * abertos ao mesmo tempo. Cada sessão só reage ao `nonce` que ela mesma gerou
 * (`pendentes`); o modal, por exemplo, abre só onde o clique aconteceu.
 */

/**
 * `comando` é o comando de barra (interação tipo 2). A API não emite
 * `interaction.success`/`failed` para ele (`ehInteracaoDeComponente` só aceita
 * 3 e 5): o pendente existe para o `interaction.modal` do callback 9 casar com
 * a sessão que digitou, e sai pelo relógio de segurança quando o bot responde
 * de outro jeito (a mensagem chega pelo `message.new` de sempre).
 */
export type TipoDeInteracaoPendente = "componente" | "modal" | "autocomplete" | "comando";

export interface InteracaoPendente {
  nonce: string;
  tipo: TipoDeInteracaoPendente;
  channelId: string;
  /** mensagem de origem (componente); null em comando, autocomplete e envio de modal. */
  messageId: string | null;
  customId: string | null;
  /** `Date.now()` do disparo. */
  desde: number;
}

export interface FalhaDeInteracao {
  /** `erro` = a própria rota recusou (HTTP 4xx/5xx), antes de o bot saber. */
  motivo: MotivoDaFalhaDeInteracao | "erro";
  /** o componente que falhou (a tela pode destacar só a fileira dele). */
  customId: string | null;
  /** texto da API quando `motivo` é `erro`; null nos outros. */
  mensagem: string | null;
  em: number;
}

export interface ModalAberto {
  /** cuid da interação que recebeu o modal — vai de volta no envio. */
  interactionId: string;
  channelId: string;
  applicationId: string;
  bot: PublicUser;
  modal: ModalDeBot;
  /** entre o clique em "Enviar" e o `interaction.success`/`failed`. */
  enviando: boolean;
  /** "Algo deu errado…" dentro do modal; null sem erro. */
  erro: string | null;
  /** nonce do envio em curso (null antes de enviar). */
  nonceDoEnvio: string | null;
}

export interface AutocompleteEmCurso {
  /** `commandId:nomeDaOpção` — o composer compara para não mostrar sugestão de outra opção. */
  chave: string;
  /** o nonce do **último** pedido; resposta de pedido anterior é descartada. */
  nonce: string;
  carregando: boolean;
  /**
   * O pedido terminou **sem** resposta do bot: a rota recusou, o servidor mandou
   * `interaction.failed`, ou o relógio de segurança venceu. Separa "o bot não
   * achou nada" (`escolhas: []` com `falhou: false`) de "falhou" — antes o
   * composer mantinha um listener paralelo só para saber isso, e a corrida entre
   * o `setState` dele e esta store podia mostrar "falhou" numa resposta vazia.
   * Volta a `false` a cada pedido novo e quando a resposta chega.
   */
  falhou: boolean;
  escolhas: EscolhaDeAutocomplete[];
}

type OpcaoDoAutocomplete = PedidoDeAutocompleteInput["options"][number];

export interface InteracoesDeBotState {
  /** interações esperando resposta, por `nonce`. */
  pendentes: Record<string, InteracaoPendente>;
  /** a última falha de cada mensagem, por `messageId`. */
  falhas: Record<string, FalhaDeInteracao>;
  /** o modal aberto nesta sessão (há no máximo um, como no Discord). */
  modal: ModalAberto | null;
  autocomplete: AutocompleteEmCurso | null;

  // ── ações das telas ──
  /** Botão com `custom_id` (estilos 1–4). Link e premium **não** chamam isto. */
  clicarBotao: (mensagem: { id: string; channelId: string }, customId: string) => Promise<void>;
  /** Select de mensagem: 3 manda os `value`; 5/6/7/8 mandam **cuids**. */
  escolherNoSelect: (
    mensagem: { id: string; channelId: string },
    customId: string,
    componentType: 3 | 5 | 6 | 7 | 8,
    values: string[],
  ) => Promise<void>;
  /** Envia o modal aberto com as respostas no formato do MODAL_SUBMIT do Discord. */
  enviarModal: (components: RespostaDeComponenteDeModal[]) => Promise<void>;
  /** Cancelar/Esc/clique fora. Não avisa o bot — o Discord também não avisa. */
  fecharModal: () => void;
  /**
   * Pede sugestões para a opção em foco (exatamente uma com `focused: true`).
   * O composer faz o *debounce*; aqui só se garante que resposta velha não
   * sobrescreve a nova.
   */
  pedirAutocomplete: (channelId: string, commandId: string, options: OpcaoDoAutocomplete[]) => Promise<void>;
  limparAutocomplete: () => void;
  /**
   * Comando de barra de bot (`POST /channels/:id/interactions`). O `nonce` nasce
   * aqui e vai no corpo, como no clique em componente: é com ele que o
   * `interaction.modal` de um comando que responde com modal (callback 9) casa
   * com esta sessão. Ao contrário das outras ações, **rejeita** quando a rota
   * recusa — quem digitou o comando precisa do toast, e não há mensagem onde
   * pendurar um "Esta interação falhou".
   */
  usarComando: (channelId: string, commandId: string, options: OpcaoDeInteracao[]) => Promise<InteracaoCriada>;
  /**
   * Comando de contexto (tipo 2 "usuário" ou 3 "mensagem"), disparado pelo
   * submenu "Apps >" do menu de clique direito (`docs/CONTRATO-MENUS.md` §7).
   * Mesmo fluxo pendente do comando de barra acima — reaproveitado porque o
   * "<bot> está pensando…" e o relógio de segurança já existiam e são
   * exatamente o que aqui também precisa: `targetId` é o único que muda no
   * corpo (a mensagem ou o usuário alvo, em vez de `options`).
   */
  usarComandoDeContexto: (channelId: string, commandId: string, targetId: string) => Promise<InteracaoCriada>;
  /** Tira o "Esta interação falhou" de uma mensagem. */
  dispensarFalha: (messageId: string) => void;

  // ── eventos do socket (ligados em `hooks/useRealtime.ts`) ──
  aoConcluir: (evento: InteracaoConcluidaEvent) => void;
  aoFalhar: (evento: InteracaoFalhouEvent) => void;
  aoAbrirModal: (evento: ModalDeBotAbertoEvent) => void;
  aoReceberAutocomplete: (evento: AutocompleteDeBotEvent) => void;
  /** Troca de conta / sair. */
  limparTudo: () => void;
}

/** `true` enquanto aquele componente daquela mensagem espera o bot (o "carregando" do botão). */
export function componenteEstaPendente(
  estado: Pick<InteracoesDeBotState, "pendentes">,
  messageId: string,
  customId: string,
): boolean {
  return Object.values(estado.pendentes).some(
    (p) => p.tipo === "componente" && p.messageId === messageId && p.customId === customId,
  );
}

/** Um nonce novo. `crypto.randomUUID` existe em todo navegador que o app suporta; o resto é para o teste em Node antigo. */
export function novoNonce(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** O relógio de segurança (ver o cabeçalho): o dobro do prazo do servidor. */
const REDE_DE_SEGURANCA_MS = PRAZO_DA_RESPOSTA_DO_BOT_MS * 2;

const relogios = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * O HTTP do pedido de autocomplete em voo (há no máximo um: a store só guarda o
 * último). Trocar de `nonce` aborta o anterior — com uma palavra digitada letra
 * a letra, cada `fetch` velho ainda em curso é banda e uma interação a menos no
 * servidor, se ainda não tiver chegado lá.
 */
let autocompleteEmVoo: { nonce: string; controlador: AbortController } | null = null;

function abortarAutocompleteEmVoo(): void {
  autocompleteEmVoo?.controlador.abort();
  autocompleteEmVoo = null;
}

/** `fetch` abortado rejeita com `DOMException` de nome `AbortError`. */
function ehAborto(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

function pararRelogio(nonce: string): void {
  const r = relogios.get(nonce);
  if (r !== undefined) clearTimeout(r);
  relogios.delete(nonce);
}

function textoDoErro(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Algo deu errado";
}

export const useInteracoesDeBot = create<InteracoesDeBotState>((set, get) => {
  /** Tira do pendente e devolve o que estava lá (ou undefined). */
  function resolver(nonce: string): InteracaoPendente | undefined {
    pararRelogio(nonce);
    const p = get().pendentes[nonce];
    if (!p) return undefined;
    set((s) => {
      const pendentes = { ...s.pendentes };
      delete pendentes[nonce];
      return { pendentes };
    });
    return p;
  }

  function registrarFalha(p: InteracaoPendente, motivo: FalhaDeInteracao["motivo"], mensagem: string | null) {
    if (p.tipo === "componente" && p.messageId) {
      const messageId = p.messageId;
      set((s) => ({
        falhas: { ...s.falhas, [messageId]: { motivo, customId: p.customId, mensagem, em: Date.now() } },
      }));
    }
    if (p.tipo === "modal") {
      set((s) =>
        s.modal && s.modal.nonceDoEnvio === p.nonce
          ? { modal: { ...s.modal, enviando: false, nonceDoEnvio: null, erro: mensagem ?? "Esta interação falhou" } }
          : s,
      );
    }
    if (p.tipo === "autocomplete") {
      set((s) =>
        s.autocomplete && s.autocomplete.nonce === p.nonce
          ? { autocomplete: { ...s.autocomplete, carregando: false, falhou: true, escolhas: [] } }
          : s,
      );
    }
  }

  function comecar(p: InteracaoPendente): void {
    set((s) => {
      const falhas = { ...s.falhas };
      // clicar de novo numa mensagem que falhou apaga o aviso antigo
      if (p.messageId) delete falhas[p.messageId];
      return { pendentes: { ...s.pendentes, [p.nonce]: p }, falhas };
    });
    relogios.set(
      p.nonce,
      setTimeout(() => {
        const pendente = resolver(p.nonce);
        if (pendente) registrarFalha(pendente, "sem_resposta", null);
      }, REDE_DE_SEGURANCA_MS),
    );
  }

  async function disparar(p: InteracaoPendente, chamada: () => Promise<unknown>): Promise<void> {
    comecar(p);
    try {
      await chamada();
    } catch (e) {
      const pendente = resolver(p.nonce);
      // pedido abortado foi trocado por um mais novo (ou a store foi limpa):
      // não é falha, e marcar "falhou" apagaria a lista do pedido que vale
      if (ehAborto(e)) return;
      if (pendente) registrarFalha(pendente, "erro", textoDoErro(e));
    }
  }

  return {
    pendentes: {},
    falhas: {},
    modal: null,
    autocomplete: null,

    clicarBotao: (mensagem, customId) => {
      const nonce = novoNonce();
      return disparar(
        { nonce, tipo: "componente", channelId: mensagem.channelId, messageId: mensagem.id, customId, desde: Date.now() },
        () =>
          api.clicarComponente(mensagem.channelId, {
            messageId: mensagem.id,
            customId,
            componentType: 2,
            nonce,
          }),
      );
    },

    escolherNoSelect: (mensagem, customId, componentType, values) => {
      const nonce = novoNonce();
      return disparar(
        { nonce, tipo: "componente", channelId: mensagem.channelId, messageId: mensagem.id, customId, desde: Date.now() },
        () =>
          api.clicarComponente(mensagem.channelId, {
            messageId: mensagem.id,
            customId,
            componentType,
            values,
            nonce,
          }),
      );
    },

    enviarModal: (components) => {
      const aberto = get().modal;
      if (!aberto || aberto.enviando) return Promise.resolve();
      const nonce = novoNonce();
      set({ modal: { ...aberto, enviando: true, erro: null, nonceDoEnvio: nonce } });
      return disparar(
        {
          nonce,
          tipo: "modal",
          channelId: aberto.channelId,
          messageId: null,
          customId: aberto.modal.custom_id,
          desde: Date.now(),
        },
        () =>
          api.enviarModalDeBot(aberto.channelId, {
            interactionId: aberto.interactionId,
            customId: aberto.modal.custom_id,
            components,
            nonce,
          }),
      );
    },

    fecharModal: () => {
      const aberto = get().modal;
      if (aberto?.nonceDoEnvio) resolver(aberto.nonceDoEnvio);
      set({ modal: null });
    },

    pedirAutocomplete: (channelId, commandId, options) => {
      const emFoco = options.find((o) => o.focused);
      const nonce = novoNonce();
      const chave = `${commandId}:${emFoco?.name ?? ""}`;
      const anterior = get().autocomplete;
      // o pedido anterior deixa de importar: a resposta dele é descartada, e o
      // HTTP dele (se ainda estiver em voo) é abortado
      if (anterior) resolver(anterior.nonce);
      abortarAutocompleteEmVoo();
      const controlador = typeof AbortController === "undefined" ? null : new AbortController();
      if (controlador) autocompleteEmVoo = { nonce, controlador };
      set({
        autocomplete: {
          chave,
          nonce,
          carregando: true,
          falhou: false,
          // enquanto chega a resposta nova, a lista da mesma opção continua na tela
          escolhas: anterior && anterior.chave === chave ? anterior.escolhas : [],
        },
      });
      return disparar(
        { nonce, tipo: "autocomplete", channelId, messageId: null, customId: null, desde: Date.now() },
        async () => {
          try {
            await api.pedirAutocompleteDeComando(channelId, { commandId, options, nonce }, controlador?.signal);
          } finally {
            // a rota já respondeu: daqui em diante abortar não desfaz nada
            if (autocompleteEmVoo?.nonce === nonce) autocompleteEmVoo = null;
          }
        },
      );
    },

    limparAutocomplete: () => {
      const atual = get().autocomplete;
      if (atual) resolver(atual.nonce);
      abortarAutocompleteEmVoo();
      set({ autocomplete: null });
    },

    usarComando: async (channelId, commandId, options) => {
      const nonce = novoNonce();
      comecar({ nonce, tipo: "comando", channelId, messageId: null, customId: null, desde: Date.now() });
      try {
        return await api.criarInteracao(channelId, { commandId, options, nonce });
      } catch (e) {
        resolver(nonce);
        throw e;
      }
    },

    usarComandoDeContexto: async (channelId, commandId, targetId) => {
      const nonce = novoNonce();
      comecar({ nonce, tipo: "comando", channelId, messageId: null, customId: null, desde: Date.now() });
      try {
        return await api.usarComandoDeContexto(channelId, { commandId, targetId, nonce });
      } catch (e) {
        resolver(nonce);
        throw e;
      }
    },

    dispensarFalha: (messageId) =>
      set((s) => {
        if (!s.falhas[messageId]) return s;
        const falhas = { ...s.falhas };
        delete falhas[messageId];
        return { falhas };
      }),

    aoConcluir: (evento) => {
      const p = resolver(evento.nonce);
      if (!p) return; // outra sessão da mesma conta
      // envio de modal aceito pelo bot: o modal fecha, como no Discord
      if (p.tipo === "modal") {
        set((s) => (s.modal && s.modal.nonceDoEnvio === p.nonce ? { modal: null } : s));
      }
    },

    aoFalhar: (evento) => {
      const p = resolver(evento.nonce);
      if (!p) return;
      registrarFalha(p, evento.motivo, null);
    },

    aoAbrirModal: (evento) => {
      // só a sessão que clicou abre o modal; as outras não têm o nonce
      const p = resolver(evento.nonce);
      if (!p) return;
      set({
        modal: {
          interactionId: evento.interactionId,
          channelId: evento.channelId,
          applicationId: evento.applicationId,
          bot: evento.bot,
          modal: evento.modal,
          enviando: false,
          erro: null,
          nonceDoEnvio: null,
        },
      });
    },

    aoReceberAutocomplete: (evento) => {
      const atual = get().autocomplete;
      resolver(evento.nonce);
      if (!atual || atual.nonce !== evento.nonce) return; // resposta de um pedido velho
      set({ autocomplete: { ...atual, carregando: false, falhou: false, escolhas: evento.choices } });
    },

    limparTudo: () => {
      for (const nonce of [...relogios.keys()]) pararRelogio(nonce);
      abortarAutocompleteEmVoo();
      set({ pendentes: {}, falhas: {}, modal: null, autocomplete: null });
    },
  };
});
