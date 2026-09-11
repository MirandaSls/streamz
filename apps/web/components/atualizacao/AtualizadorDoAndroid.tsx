"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, X } from "@/components/ui/icones";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import {
  baixarAtualizacaoAndroid,
  ehAndroidNoTauri,
  instalarAtualizacaoAndroid,
  versaoInstalada,
} from "@/lib/desktop";
import {
  checarAtualizacaoDoAndroid,
  decidirAtualizacao,
  INTERVALO_DE_CHECAGEM_MS,
  type NovidadeDeAtualizacao,
} from "@/lib/atualizacao-mobile";

/**
 * O auto-update do app Android.
 *
 * ## O que ele faz, nas palavras do pedido
 *
 * - **Na abertura**, se houver versão nova: baixa em segundo plano, com uma
 *   barrinha discreta, e ao terminar abre o instalador do sistema. É o
 *   "atualiza sozinho" possível.
 * - **Com o app já aberto** (a checagem volta a cada 30 min): mostra o card
 *   "Versão X disponível — Instalar", e o toque faz o download + instalação.
 *   Ninguém interrompe uma conversa ou uma chamada para baixar 40 MB.
 *
 * A regra dos dois momentos é pura e testada: `decidirAtualizacao` em
 * `lib/atualizacao-mobile.ts`. Aqui fica só o que precisa de efeito.
 *
 * ## O limite que a interface precisa dizer em voz alta
 *
 * **O Android sempre mostra a tela de confirmação de instalação.** Fora da
 * Play, nenhum app instala outro sem ela — só a loja, um *device owner* ou um
 * app assinado com a chave da plataforma pulam esse passo, e não somos nenhum
 * dos três. Por isso o texto do card diz "o Android vai pedir sua confirmação"
 * antes de o instalador aparecer: prometer instalação silenciosa e entregar uma
 * tela do sistema seria treinar o usuário a desconfiar do próprio app. Está
 * escrito igual em `docs/APPS-MOBILE.md` §13 e no `AtualizadorPlugin.kt`.
 *
 * ## O que ele não é
 *
 * Não é o atualizador do desktop. Lá a janelinha de abertura baixa o `.exe`,
 * verifica a assinatura minisign e instala em silêncio (§5.2 do processo);
 * aqui a verificação é o **sha256**, feita no Kotlin antes de o instalador ser
 * chamado, e a instalação é uma tela do sistema. Ver `updates.service.ts` para
 * o porquê de a assinatura não valer neste caminho.
 *
 * Só roda dentro do app Android. No site (mesmo aberto num telefone) atualizar
 * é recarregar a página; no app de desktop já existe a setinha verde da barra
 * de título, que faz mais. Nos dois casos este componente não desenha nada — é
 * por isso que ele pode morar no `layout.tsx`, ao lado das peças do PWA, e
 * valer também na tela de login: quem abriu o app e ainda não entrou na conta
 * merece a mesma atualização.
 */

/** As fases visíveis. `oculto` é o estado em que ele não desenha nada. */
type Fase = "oculto" | "aviso" | "baixando" | "instalando" | "permissao" | "falhou";

export default function AtualizadorDoAndroid() {
  const [fase, setFase] = useState<Fase>("oculto");
  const [novidade, setNovidade] = useState<NovidadeDeAtualizacao | null>(null);
  const [porcentagem, setPorcentagem] = useState<number | null>(null);

  /**
   * O estado que a decisão pura consulta, fora do React.
   *
   * É `ref` e não `state` de propósito: o laço de checagem vive num
   * `setInterval` criado uma vez, e ler `state` de dentro dele daria sempre o
   * valor do primeiro render. Reconstruir o intervalo a cada mudança seria
   * pior — reiniciaria a contagem dos 30 minutos a cada toque na interface.
   */
  const primeira = useRef(true);
  const ocupado = useRef(false);
  const dispensada = useRef<string | null>(null);

  /**
   * Onde o `.apk` já conferido ficou no disco, quando já baixamos um.
   *
   * Existe para que o segundo toque **não baixe de novo**. Os dois caminhos em
   * que ele importa são justamente os mais prováveis: o usuário volta dos
   * Ajustes depois de liberar "instalar apps desconhecidos", ou ele fecha a
   * tela de instalação sem querer. Nos dois casos o pacote certo já está aqui,
   * e repetir 40 MB seria castigar quem seguiu a instrução.
   *
   * Guarda a **versão** junto com o caminho, e não só o caminho: um app aberto
   * o dia inteiro pode ver duas publicações, e reaproveitar o pacote da 1.2.0
   * para instalar a 1.2.1 seria instalar a versão errada em silêncio — que é
   * pior do que baixar de novo.
   */
  const baixado = useRef<{ versao: string; caminho: string } | null>(null);

  /**
   * Abre o instalador para um pacote já no disco. **Nunca lança.**
   */
  const instalar = useCallback(async (caminho: string) => {
    ocupado.current = true;
    setFase("instalando");
    try {
      const faltaPermissao = await instalarAtualizacaoAndroid(caminho);
      // Quando falta a permissão, o lado nativo já abriu a tela de Ajustes e o
      // instalador não; o card fica de pé explicando o que fazer.
      setFase(faltaPermissao ? "permissao" : "instalando");
    } catch {
      // o arquivo pode ter sumido (o sistema limpa o cache quando o disco
      // aperta): aí o "Tentar de novo" baixa outra vez, que é o certo
      baixado.current = null;
      setFase("falhou");
    } finally {
      ocupado.current = false;
    }
  }, []);

  /**
   * Baixa e instala. **Nunca lança**: qualquer falha vira a fase `falhou`, que
   * é um card com "Tentar de novo". Uma exceção solta aqui subiria para o
   * `layout.tsx` e derrubaria o app inteiro por causa de uma atualização.
   */
  const atualizar = useCallback(
    async (alvo: NovidadeDeAtualizacao) => {
      // Já baixamos **este** pacote nesta sessão: pula direto para o instalador.
      if (baixado.current?.versao === alvo.versao) return instalar(baixado.current.caminho);

      ocupado.current = true;
      setNovidade(alvo);
      setPorcentagem(null);
      setFase("baixando");
      try {
        const caminho = await baixarAtualizacaoAndroid(
          alvo.url,
          alvo.sha256,
          ({ baixados, total }) => {
            // `total` vem -1 quando o servidor não declara `Content-Length`: aí
            // a barra fica indeterminada em vez de fingir uma porcentagem
            setPorcentagem(total > 0 ? Math.min(100, Math.round((baixados / total) * 100)) : null);
          },
        );
        baixado.current = { versao: alvo.versao, caminho };
        ocupado.current = false;
        await instalar(caminho);
      } catch {
        // digest que não bateu, rede que caiu, ponte que falhou: o usuário vê o
        // motivo genérico e o botão de tentar de novo. O detalhe não ajudaria
        // ninguém na tela, e o pacote ruim já foi apagado do disco.
        baixado.current = null;
        setFase("falhou");
        ocupado.current = false;
      }
    },
    [instalar],
  );

  useEffect(() => {
    if (!ehAndroidNoTauri()) return;
    let vivo = true;

    const checar = async () => {
      if (!vivo) return;
      const versao = await versaoInstalada();
      if (!vivo || !versao) return;
      const encontrada = await checarAtualizacaoDoAndroid(versao);
      if (!vivo) return;

      const abertura = primeira.current;
      primeira.current = false;

      switch (
        decidirAtualizacao(encontrada, {
          abertura,
          dispensada: dispensada.current,
          ocupado: ocupado.current,
        })
      ) {
        case "baixar":
          if (encontrada) void atualizar(encontrada);
          break;
        case "avisar":
          setNovidade(encontrada);
          setFase("aviso");
          break;
        case "nada":
          break;
      }
    };

    void checar();
    const relogio = setInterval(() => void checar(), INTERVALO_DE_CHECAGEM_MS);
    return () => {
      vivo = false;
      clearInterval(relogio);
    };
  }, [atualizar]);

  if (fase === "oculto" || !novidade) return null;

  const dispensar = () => {
    dispensada.current = novidade.versao;
    setFase("oculto");
  };

  return (
    <div
      role="status"
      aria-live="polite"
      // Acima da barra de abas do `ShellMobile` quando ela existe, e a mesma
      // distância do rodapé na tela de login, que não tem barra —
      // `env(safe-area-inset-bottom)` não entra aqui porque quem reserva o
      // recorte inferior é a barra de abas; sem ela os 68px já sobram.
      className="fixed inset-x-2 bottom-[68px] z-40 flex items-center gap-3 rounded-[8px] border border-border-subtle bg-background-base-lower px-3 py-3 shadow-lg"
    >
      {fase === "falhou" ? (
        <AlertTriangle size={20} className="shrink-0 text-status-danger" />
      ) : (
        <Download size={20} className="shrink-0 text-brand-500" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-strong">
          {fase === "falhou" ? "Não deu para atualizar" : `Versão ${novidade.versao} disponível`}
        </p>
        <p className="truncate text-xs text-text-muted">{legenda(fase, porcentagem, novidade)}</p>

        {fase === "baixando" && (
          // A barrinha discreta: mesma altura e mesmas cores da janelinha de
          // atualização do desktop (`JanelaSplash`), para os dois apps não
          // parecerem produtos diferentes na mesma hora.
          <div
            role="progressbar"
            aria-label="Progresso do download da atualização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentagem ?? undefined}
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-chat-background-default"
          >
            <div
              className={`h-full rounded-full bg-brand-500 ${
                porcentagem === null
                  ? // sem `Content-Length` não há porcentagem honesta a mostrar:
                    // a barra fica cheia e pulsando em vez de mentir um número
                    "w-full animate-pulse"
                  : "transition-[width] duration-150 ease-linear"
              }`}
              style={porcentagem === null ? undefined : { width: `${porcentagem}%` }}
            />
          </div>
        )}
      </div>

      {/* Tudo menos "baixando" tem botão. O caso que obriga a incluir
          "instalando": o usuário fecha a tela de instalação do Android sem
          querer (ou de propósito, para terminar uma frase antes). Sem o botão o
          card ficaria de pé dizendo "toque em Atualizar" numa tela que não
          existe mais, e a única saída seria fechar o app. Com ele, o toque
          reabre o instalador — sem baixar de novo, porque o pacote está no
          disco. */}
      {fase !== "baixando" && (
        <Button variante="primario" tamanho="sm" onClick={() => void atualizar(novidade)} className="shrink-0">
          {fase === "falhou" ? "Tentar de novo" : "Instalar"}
        </Button>
      )}

      {/* "Baixando" não tem "x": o download já começou, some sozinho, e sumir
          com a barra deixaria o usuário sem saber por que a rede está ocupada. */}
      {fase !== "baixando" && (
        <BotaoDeIcone
          rotulo="Dispensar aviso de atualização"
          icone={<X size={16} />}
          tamanho="sm"
          className="shrink-0"
          onClick={dispensar}
        />
      )}
    </div>
  );
}

/**
 * A segunda linha do card. É aqui que mora a frase que impede a promessa falsa:
 * **o Android pede confirmação**, e o usuário fica sabendo disso antes de a
 * tela do sistema aparecer, não depois.
 */
function legenda(
  fase: Fase,
  porcentagem: number | null,
  novidade: NovidadeDeAtualizacao,
): string {
  switch (fase) {
    case "baixando":
      return porcentagem === null ? "Baixando…" : `Baixando… ${porcentagem}%`;
    case "instalando":
      return "Toque em Atualizar na tela do Android";
    case "permissao":
      return "Permita a instalação nos Ajustes e toque de novo";
    case "falhou":
      return "Verifique a conexão e tente de novo";
    default:
      return novidade.notas ?? "O Android vai pedir sua confirmação";
  }
}
