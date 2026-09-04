import { create } from "zustand";
import type { Category } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Categorias do servidor ativo — o agrupamento da barra lateral.
 *
 * Separada de `channels` porque o ciclo de vida é outro: uma categoria não tem
 * mensagem, não tem não-lido e não some quando o canal some. O estado de
 * colapso é por usuário e por servidor, então vive no `localStorage` e não na
 * API: é preferência de tela, não dado do servidor.
 */

const CHAVE_COLAPSO = "streamz:categorias-colapsadas";

function lerColapso(guildId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(`${CHAVE_COLAPSO}:${guildId}`);
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return []; // storage indisponível ou lixo salvo: começa tudo expandido
  }
}

function gravarColapso(guildId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CHAVE_COLAPSO}:${guildId}`, JSON.stringify(ids));
  } catch {
    // modo privado / cota cheia: o colapso simplesmente não sobrevive ao reload
  }
}

interface CategoriesState {
  guildId: string | null;
  categories: Category[];
  loading: boolean;
  /** ids das categorias fechadas no servidor ativo. */
  collapsed: string[];

  loadForGuild: (guildId: string) => Promise<void>;
  clear: () => void;

  create: (guildId: string, name: string) => Promise<Category | null>;
  rename: (guildId: string, category: Category) => Promise<void>;
  remove: (guildId: string, category: Category) => Promise<void>;

  toggleCollapsed: (categoryId: string) => void;
  /** abre a categoria (idempotente) — ver o porquê na implementação. */
  expandir: (categoryId: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;

  handleCreated: (category: Category) => void;
  handleUpdated: (category: Category) => void;
  handleDeleted: (categoryId: string) => void;
}

/** Guarda de corrida: só a última carga escreve no estado. */
let loadSeq = 0;

export const useCategories = create<CategoriesState>((set, get) => ({
  guildId: null,
  categories: [],
  loading: false,
  collapsed: [],

  loadForGuild: async (guildId) => {
    const seq = ++loadSeq;
    set({ guildId, categories: [], loading: true, collapsed: lerColapso(guildId) });
    try {
      const categories = await api.listCategories(guildId);
      if (seq !== loadSeq) return; // trocaram de servidor no meio do fetch
      set({ categories, loading: false });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar as categorias"), "error");
    }
  },

  clear: () => {
    ++loadSeq;
    set({ guildId: null, categories: [], loading: false, collapsed: [] });
  },

  create: async (guildId, name) => {
    const nome = name.trim();
    if (!nome) return null;
    try {
      const category = await api.createCategory(guildId, nome);
      get().handleCreated(category);
      return category;
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível criar a categoria"), "error");
      return null;
    }
  },

  rename: async (guildId, category) => {
    const nome = await ui.prompt({
      title: "Renomear categoria",
      message: "Novo nome da categoria.",
      initial: category.name,
      confirmLabel: "Salvar",
    });
    if (!nome?.trim() || nome.trim() === category.name) return;
    try {
      get().handleUpdated(await api.renameCategory(guildId, category.id, nome.trim()));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível renomear a categoria"), "error");
    }
  },

  remove: async (guildId, category) => {
    const ok = await ui.confirm({
      title: `Apagar ${category.name}`,
      message: "Os canais desta categoria continuam existindo — só ficam sem categoria.",
      confirmLabel: "Apagar categoria",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCategory(guildId, category.id);
      get().handleDeleted(category.id);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível apagar a categoria"), "error");
    }
  },

  toggleCollapsed: (categoryId) => {
    const { guildId, collapsed } = get();
    const proximo = collapsed.includes(categoryId)
      ? collapsed.filter((id) => id !== categoryId)
      : [...collapsed, categoryId];
    set({ collapsed: proximo });
    if (guildId) gravarColapso(guildId, proximo);
  },

  /*
    Abrir sem alternar. Quem cria um canal precisa **garantir** que a categoria
    dele está aberta: com `toggleCollapsed` uma categoria já aberta se fecharia,
    e o canal novo sumiria — que é o inverso do que se quer. Não escreve nada
    quando já está aberta, para não redesenhar a coluna nem gravar de novo.
  */
  expandir: (categoryId) => {
    const { guildId, collapsed } = get();
    if (!collapsed.includes(categoryId)) return;
    const proximo = collapsed.filter((id) => id !== categoryId);
    set({ collapsed: proximo });
    if (guildId) gravarColapso(guildId, proximo);
  },

  setAllCollapsed: (collapsed) => {
    const { guildId, categories } = get();
    const proximo = collapsed ? categories.map((c) => c.id) : [];
    set({ collapsed: proximo });
    if (guildId) gravarColapso(guildId, proximo);
  },

  handleCreated: (category) => {
    if (category.guildId !== get().guildId) return;
    // eco repetido do socket não é criação: sai antes de mexer no colapso, ou
    // reabriria uma categoria que a pessoa fechou depois de recebê-la
    if (get().categories.some((c) => c.id === category.id)) return;
    set((s) => ({
      categories: [...s.categories, category].sort((a, b) => a.position - b.position),
    }));
    /*
      Categoria nova nasce aberta. Colapso é opt-in, então o id novo não
      deveria estar em `collapsed` — mas o colapso vive no `localStorage` do
      navegador, e uma entrada velha de um id reciclado (ou de uma categoria
      apagada e recriada com o mesmo id) faria a categoria nascer fechada e
      parecer que a criação não funcionou. `expandir` é idempotente: no caso
      normal não faz nada.
    */
    get().expandir(category.id);
  },

  handleUpdated: (category) => {
    if (category.guildId !== get().guildId) return;
    set((s) => ({
      categories: s.categories
        .map((c) => (c.id === category.id ? category : c))
        .sort((a, b) => a.position - b.position),
    }));
  },

  handleDeleted: (categoryId) =>
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== categoryId),
      collapsed: s.collapsed.filter((id) => id !== categoryId),
    })),
}));
