"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/primitivos";

/**
 * A barra flutuante de "alterações não salvas" das configurações.
 *
 * O Discord não tem um botão "Salvar" por bloco: a aba inteira acumula
 * alterações e uma única barra aparece no rodapé com *Redefinir* e *Salvar
 * alterações*. A diferença não é estética — com botão por bloco o usuário
 * precisa descobrir qual deles salva o campo que ele mexeu, e sair da aba
 * perde tudo em silêncio. Aqui a saída é **barrada**: trocar de aba ou fechar
 * com pendência sacode a barra em vez de descartar.
 *
 * A aba só declara `dirty`, `salvar` e `redefinir` — quem desenha e quem
 * intercepta a saída é o shell, que é o único que sabe o que "sair" significa
 * em cada tela.
 */

interface Acoes {
  salvar: () => void | Promise<void>;
  redefinir: () => void;
}

interface ContextoDeAlteracoes {
  registrar: (dirty: boolean, acoes: Acoes | null) => void;
}

const Ctx = createContext<ContextoDeAlteracoes | null>(null);

export interface ControleDeAlteracoes {
  contexto: ContextoDeAlteracoes;
  /** `true` quando pode sair; senão sacode a barra e devolve `false`. */
  pedirParaSair: () => boolean;
  /** limpa a pendência (usado ao trocar de aba depois de salvar). */
  esquecer: () => void;
  dirty: boolean;
  acoes: MutableRefObject<Acoes | null>;
  sacudir: MutableRefObject<(() => void) | null>;
}

/** Criado pelo shell; alimentado pelas abas. */
export function useControleDeAlteracoes(): ControleDeAlteracoes {
  const [dirty, setDirty] = useState(false);
  const acoes = useRef<Acoes | null>(null);
  const sujo = useRef(false);
  const sacudir = useRef<(() => void) | null>(null);

  const contexto = useMemo<ContextoDeAlteracoes>(
    () => ({
      registrar: (d, a) => {
        acoes.current = a;
        sujo.current = d;
        setDirty(d);
      },
    }),
    [],
  );

  const pedirParaSair = useCallback(() => {
    if (!sujo.current) return true;
    sacudir.current?.();
    return false;
  }, []);

  const esquecer = useCallback(() => {
    sujo.current = false;
    acoes.current = null;
    setDirty(false);
  }, []);

  return { contexto, pedirParaSair, esquecer, dirty, acoes, sacudir };
}

export function ProvedorDeAlteracoes({
  controle,
  children,
}: {
  controle: ControleDeAlteracoes;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={controle.contexto}>{children}</Ctx.Provider>;
}

/**
 * A aba declara o que tem pendente. `salvar` e `redefinir` podem mudar a cada
 * render sem custo: só o `dirty` é reavaliado pelo shell.
 */
export function useAlteracoesNaoSalvas({
  dirty,
  salvar,
  redefinir,
}: {
  dirty: boolean;
  salvar: () => void | Promise<void>;
  redefinir: () => void;
}): void {
  const ctx = useContext(Ctx);
  const ultimas = useRef({ salvar, redefinir });
  ultimas.current = { salvar, redefinir };

  useEffect(() => {
    ctx?.registrar(dirty, {
      salvar: () => ultimas.current.salvar(),
      redefinir: () => ultimas.current.redefinir(),
    });
  }, [ctx, dirty]);

  // desmontar a aba (troca de aba, fechar a tela) apaga a pendência dela
  useEffect(() => () => ctx?.registrar(false, null), [ctx]);
}

/**
 * Versão em componente de `useAlteracoesNaoSalvas`, para a tela que cria o
 * provedor e guarda o formulário no **mesmo** componente (as configurações de
 * canal e de grupo): um hook não enxerga o contexto que o próprio componente
 * acabou de montar, então quem registra a pendência precisa ser um filho.
 * Não desenha nada.
 */
export function RegistrarAlteracoes(props: {
  dirty: boolean;
  salvar: () => void | Promise<void>;
  redefinir: () => void;
}): null {
  useAlteracoesNaoSalvas(props);
  return null;
}

export function BarraDeAlteracoes({ controle }: { controle: ControleDeAlteracoes }) {
  const reduzirMovimento = useSettings((s) => s.reduceMotion);
  const barraRef = useRef<HTMLDivElement>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    controle.sacudir.current = () => {
      const el = barraRef.current;
      if (!el || reduzirMovimento) return;
      el.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-8px)" },
          { transform: "translateX(8px)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 320, easing: "ease-in-out" },
      );
    };
    return () => {
      controle.sacudir.current = null;
    };
  }, [controle, reduzirMovimento]);

  if (!controle.dirty) return null;

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      await controle.acoes.current?.salvar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      ref={barraRef}
      role="status"
      // No celular a barra quebra em duas linhas — o aviso em cima, os dois
      // botões embaixo: numa tela de 390 os três lado a lado deixavam ~110px
      // para o texto, que virava cinco linhas. É a barra que salva todas as abas.
      className="sticky bottom-5 z-20 mt-6 flex items-center gap-4 rounded-[8px] border border-border-subtle bg-background-surface-higher px-4 py-2.5 shadow-popout celular:flex-wrap celular:gap-2"
    >
      <p className="min-w-0 flex-1 text-sm text-text-strong celular:basis-full">
        Cuidado — você tem alterações não salvas!
      </p>
      {/* "Redefinir" é neutro (sem cor de marca nem de risco) — bucket
          `secundario` da migração 0.8, mesmo sem a caixa antiga desenhar borda
          visível: é o par de "Salvar alterações", não um link de navegação. */}
      <Button
        variante="secundario"
        tamanho="sm"
        onClick={() => controle.acoes.current?.redefinir()}
        className="shrink-0 celular:h-[44px]"
      >
        Redefinir
      </Button>
      <Button
        variante="primario"
        tamanho="sm"
        carregando={salvando}
        onClick={() => void salvar()}
        className="shrink-0 celular:h-[44px] celular:flex-1"
      >
        Salvar alterações
      </Button>
    </div>
  );
}
