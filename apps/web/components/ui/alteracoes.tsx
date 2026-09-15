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

/**
 * A barra em si. Medidas do único registro que existe dela, a imagem de
 * catálogo `suporte/imagens/server-settings/30715364399511-server-profile/04.png`
 * (1400×106, escala desconhecida — **só proporção**):
 *
 * - o botão ocupa 64 dos 104px de altura útil da barra; com o botão `sm` (32)
 *   do primitivo, a barra fecha em 52: 10 em cima e embaixo;
 * - o texto começa a 30/1400 da borda esquerda (≈ 16 na mesma escala) e o
 *   botão termina a 24/1400 da direita (≈ 10 + a borda);
 * - "Reset" é texto sem caixa, mais apagado que o aviso (`#9a9b9d` contra
 *   `#b3b3b3`), a ≈ 23 do botão — o par `neutro` do primitivo;
 * - "Save Changes" é **verde** com texto branco: é o `positivo` do primitivo
 *   (`--control-connected-*`), não a cor de marca. O limão só entra onde o
 *   Discord pinta blurple (ADR-0009).
 *
 * Fundo, borda, raio e sombra não saem da imagem (recortada e com o destaque
 * vermelho do artigo por cima): continuam `--background-surface-higher`, que
 * o VARIAVEIS.md descreve como "barra flutuante", borda sutil e `shadow-popout`
 * — "não medido".
 *
 * A **posição** é do `.noticeRegion__23e6b` (`css-bruto/sob-demanda/
 * 98259d2dbb54535f.css`): presa a 20px da borda de baixo do conteúdo. Na
 * `tela-cheia` ela é 20px mais larga que a coluna de cada lado, e quem sabe
 * disso é a moldura — por isso o `className`.
 */
export function BarraDeAlteracoes({
  controle,
  className = "",
}: {
  controle: ControleDeAlteracoes;
  className?: string;
}) {
  const reduzirMovimento = useSettings((s) => s.reduceMotion);
  const barraRef = useRef<HTMLDivElement>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    controle.sacudir.current = () => {
      const el = barraRef.current;
      if (!el || reduzirMovimento) return;
      // A sacudida não tem medida (é movimento; nenhum print a pega): ida e
      // volta de 8px que amortece em 320ms. O Discord também a pula com
      // movimento reduzido.
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
      // quem tentou sair com a barra fora da vista (página rolada) precisa
      // enxergar por que não saiu
      el.scrollIntoView?.({ block: "nearest" });
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
      className={`sticky bottom-5 z-20 mt-6 flex items-center gap-[10px] rounded-lg border border-border-subtle bg-background-surface-higher py-2.5 pl-4 pr-2.5 shadow-popout celular:flex-wrap celular:gap-2 celular:pr-4 ${className}`}
    >
      <p className="min-w-0 flex-1 text-text-md text-text-default celular:basis-full">
        Cuidado — você tem alterações que não foram salvas!
      </p>
      {/* Texto sem caixa, com os 12 de respiro de cada lado que separam a
          palavra do botão verde na imagem (≈23 até ele, somando o `gap`). */}
      <Button
        variante="neutro"
        tamanho="sm"
        disabled={salvando}
        onClick={() => controle.acoes.current?.redefinir()}
        className="shrink-0 px-3 celular:h-[44px]"
      >
        Redefinir
      </Button>
      <Button
        variante="positivo"
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
