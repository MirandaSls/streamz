"use client";

import { create } from "zustand";
import {
  Permission,
  hasPermission,
  type AppDoDiretorio,
  type AppInstalacao,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * "Descobrir aplicativos" — o diretório, a página de um app e a instalação.
 *
 * ── j-bots · F4, lote B ──
 *
 * `aberto` mora aqui, e não em `stores/ui.ts`, **pelo mesmo motivo do `open` de
 * `stores/friends.ts`**: `UIState.view` é `"guild" | "dm"` e diz de que modo é
 * a coluna 1 e a coluna 2; o diretório não é um terceiro modo — ele abre *por
 * cima* da coluna 3, com o rail e a coluna do lado intactos, exatamente como o
 * Discord faz. Um terceiro valor em `view` obrigaria toda tela que hoje
 * pergunta `view === "dm" ? … : …` a ganhar um ramo que não tem o que desenhar.
 *
 * O §11 do documento fala em `vista: "apps"` na store de UI; a divergência está
 * registrada no §8 do `CONTRATO-F4.md` — o campo se chama `view`, e o padrão
 * que a frase quis dizer é o do Amigos, que é um booleano na store da tela.
 */

/** Um servidor em que **eu** posso instalar, com o que eu posso conceder nele. */
export interface ServidorParaInstalar {
  id: string;
  name: string;
  iconUrl: string | null;
  /**
   * Meu bitfield efetivo naquele servidor.
   *
   * É o que desabilita (não esconde) as permissões que eu não tenho na tela
   * "Adicionar ao servidor" — e é a mesma conta que a API refaz, porque uma
   * checagem só na tela não é checagem (§4 do contrato).
   */
  minhas: number;
}

interface EstadoDeAplicativos {
  /** o diretório está na tela (a coluna 3 do desktop, a tela cheia do celular). */
  aberto: boolean;

  itens: AppDoDiretorio[];
  busca: string;
  carregando: boolean;
  carregado: boolean;
  proximoCursor: string | null;

  /** o app cuja página está aberta; `null` = a grade. */
  selecionado: AppDoDiretorio | null;
  /** o app cuja tela "Adicionar ao servidor" está aberta. */
  instalando: AppDoDiretorio | null;

  /** os servidores em que eu tenho `MANAGE_GUILD`. Carregados ao abrir a tela. */
  servidores: ServidorParaInstalar[];
  carregandoServidores: boolean;
  /** um `POST` de instalação em voo (o botão "Autorizar" fica ocupado). */
  autorizando: boolean;

  abrir: () => void;
  fechar: () => void;
  carregar: (force?: boolean) => Promise<void>;
  definirBusca: (q: string) => void;
  carregarMais: () => Promise<void>;

  abrirApp: (app: AppDoDiretorio) => void;
  voltarParaGrade: () => void;

  abrirInstalacao: (app: AppDoDiretorio) => void;
  fecharInstalacao: () => void;
  instalar: (guildId: string, permissions: number) => Promise<AppInstalacao | null>;

  clear: () => void;
}

const VAZIO = {
  itens: [] as AppDoDiretorio[],
  busca: "",
  carregando: false,
  carregado: false,
  proximoCursor: null as string | null,
  selecionado: null as AppDoDiretorio | null,
  instalando: null as AppDoDiretorio | null,
  servidores: [] as ServidorParaInstalar[],
  carregandoServidores: false,
  autorizando: false,
};

/** Guarda de corrida da carga: a última busca digitada é a que vale. */
let seq = 0;
/** Espera antes de ir ao servidor a cada tecla (a busca é por servidor). */
let temporizador: ReturnType<typeof setTimeout> | null = null;
const ESPERA_DA_BUSCA_MS = 250;

export const useAplicativos = create<EstadoDeAplicativos>((set, get) => {
  async function buscarPagina(q: string, cursor: string | null) {
    const meu = ++seq;
    set({ carregando: true });
    try {
      const pagina = await api.diretorioDeApps(q || undefined, cursor ?? undefined);
      if (meu !== seq) return; // digitaram de novo no meio do fetch
      set((s) => ({
        // `cursor` é o sinal de "mais uma página": sem ele a lista é trocada,
        // com ele é concatenada. Duas funções seriam a mesma coisa duas vezes.
        itens: cursor ? [...s.itens, ...pagina.itens] : pagina.itens,
        proximoCursor: pagina.proximoCursor,
        carregando: false,
        carregado: true,
      }));
    } catch (e) {
      if (meu !== seq) return;
      set({ carregando: false });
      ui.toast(errorMessage(e, "Não foi possível carregar os aplicativos"), "error");
    }
  }

  /**
   * Onde eu posso instalar — e o que posso conceder em cada lugar.
   *
   * Uma chamada por servidor, e é de propósito: `stores/permissions.ts` só
   * carrega os cargos do servidor **ativo** (`load(guildId)` troca o conteúdo
   * inteiro), então `useMyPermissions` responde 0 para todo servidor que não
   * seja aquele — a menos que eu seja o dono. Usar só ele esconderia justamente
   * os servidores em que sou administrador sem ser dono, que é o caso comum.
   *
   * `GET /guilds/:id/members/:userId/permissions` já existe e já está em
   * `lib/api.ts`; a conta é a mesma do servidor, feita no servidor. As chamadas
   * são paralelas e só acontecem quando a tela de instalar abre.
   */
  async function carregarServidores() {
    const meuId = useAuth.getState().user?.id;
    const guilds = useGuilds.getState().guilds;
    if (!meuId || guilds.length === 0) {
      set({ servidores: [], carregandoServidores: false });
      return;
    }
    set({ carregandoServidores: true });
    const respostas = await Promise.all(
      guilds.map(async (g) => {
        try {
          const p = await api.memberPermissions(g.id, meuId);
          return { id: g.id, name: g.name, iconUrl: g.iconUrl, minhas: p.permissions };
        } catch {
          // um servidor que não respondeu não vira "posso instalar": some da
          // lista, e a API recusaria de novo se alguém forçasse
          return null;
        }
      }),
    );
    set({
      servidores: respostas
        .filter((r): r is ServidorParaInstalar => r !== null)
        .filter((r) => hasPermission(r.minhas, Permission.MANAGE_GUILD)),
      carregandoServidores: false,
    });
  }

  return {
    aberto: false,
    ...VAZIO,

    abrir: () => {
      // volta sempre para a grade: reabrir o diretório na página de um app que
      // se visitou meia hora atrás não é o que ninguém espera
      set({ aberto: true, selecionado: null, instalando: null });
      // o catálogo envelhece (alguém publicou um app); abrir é o momento
      // natural de revalidar, como o `setOpen` do Amigos faz com as listas
      void buscarPagina(get().busca, null);
    },
    fechar: () => set({ aberto: false, selecionado: null, instalando: null }),

    carregar: async (force = false) => {
      if (get().carregado && !force) return;
      await buscarPagina(get().busca, null);
    },

    definirBusca: (q) => {
      set({ busca: q });
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => void buscarPagina(q, null), ESPERA_DA_BUSCA_MS);
    },

    carregarMais: async () => {
      const { proximoCursor, carregando, busca } = get();
      if (!proximoCursor || carregando) return;
      await buscarPagina(busca, proximoCursor);
    },

    abrirApp: (app) => set({ selecionado: app }),
    voltarParaGrade: () => set({ selecionado: null }),

    abrirInstalacao: (app) => {
      set({ instalando: app });
      void carregarServidores();
    },
    fecharInstalacao: () => set({ instalando: null }),

    instalar: async (guildId, permissions) => {
      const app = get().instalando;
      if (!app || get().autorizando) return null;
      set({ autorizando: true });
      try {
        const instalacao = await api.instalarApp(guildId, app.id, permissions);
        set({ autorizando: false, instalando: null });
        const servidor = get().servidores.find((s) => s.id === guildId);
        ui.toast(`${app.name} foi adicionado a ${servidor?.name ?? "o servidor"}.`);
        // a contagem do card ("em N servidores") acabou de mudar. Um `+1`
        // otimista bastaria para o servidor onde instalei agora, mas
        // reautorizar um app já instalado **não** muda a contagem — e a tela
        // não tem como saber qual dos dois foi. A resposta traz a contagem
        // certa; é ela que manda.
        const contagem = instalacao.app.servidores;
        set((s) => ({
          itens: s.itens.map((a) => (a.id === app.id ? { ...a, servidores: contagem } : a)),
          selecionado:
            s.selecionado?.id === app.id ? { ...s.selecionado, servidores: contagem } : s.selecionado,
        }));
        return instalacao;
      } catch (e) {
        set({ autorizando: false });
        // o 403 da escalada de privilégio chega aqui com a frase do servidor
        // ("Você não pode conceder uma permissão que não tem"), que é
        // exatamente o que a pessoa precisa ler
        ui.toast(errorMessage(e, "Não foi possível adicionar o aplicativo"), "error");
        return null;
      }
    },

    clear: () => {
      ++seq;
      if (temporizador) clearTimeout(temporizador);
      set({ aberto: false, ...VAZIO });
    },
  };
});

/** Atalho fora do React, no estilo do `ui` de `stores/ui.ts`. */
export const aplicativos = {
  abrir: () => useAplicativos.getState().abrir(),
  fechar: () => useAplicativos.getState().fechar(),
};
