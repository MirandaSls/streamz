"use client";

import { useEffect, useRef, useState } from "react";
import IconeAnimado from "@/components/ui/IconeAnimado";
import { isTauri } from "@/lib/desktop";
import {
  EVENTO_DE_ERRO_DA_SPLASH,
  JANELA_PRINCIPAL,
  LIMITE_DA_CHECAGEM,
  esperaQueFalta,
  fraseDaSplash,
  modoDaSplash,
  porcentagemDoDownload,
  type EstadoDaSplash,
  type ModoDaSplash,
} from "./janela-splash";

/**
 * A janelinha do desktop: 300×350 escura, sem moldura, no meio da tela, com o
 * símbolo respirando, uma frase e uma barra fina — a do Discord.
 *
 * Ela é uma **janela do Tauri** (`label: "splash"`), não uma tela dentro do
 * app: na abertura a janela principal nasce `visible: false` e quem a mostra é
 * esta janelinha, quando não há atualização (ou quando a que havia terminou).
 * Com o app já aberto, a setinha verde da barra de título esconde a principal e
 * abre esta mesma rota com `?modo=atualizar`. Era isso que faltava na tela
 * cheia que existia antes: atualizar virava uma tela do app, e o app inteiro
 * ficava atrás dela.
 *
 * ## Medidas (Pillow sobre as referências, §6.3 do processo)
 *
 * `docs/Reference/open.jpg` (quadro 1920×1080) — a janela mede **674×789 px**,
 * razão 0,8542; 300×350 dá 0,8571, 0,3% de diferença: é uma janela de
 * **300×350**. A escala fica 2,2467 px de imagem por px CSS. Daí:
 *
 * | item | medido (imagem) | em CSS | adotado |
 * |---|---|---|---|
 * | raio do canto | escuro chega na borda em dy=14 | 5,3–6,2 | **6px** (`rounded-md`) |
 * | símbolo | tinta de 82×82, centro a 155 do topo | idem | `IconeAnimado` de **96**, topo em 101 |
 * | frase | faixa de 35px (subida + descida), centro 528 | 15,6, centro 234 | **16px**, centro 235 |
 * | cor da frase | picos (252,255,255) | branco | `txt-primary` |
 * | fundo | (39,42,47) | — | `bg-chat` (token nosso; §6.6) |
 *
 * O símbolo de 96 é o que faz a **altura da tinta** bater com os 82px do
 * Discord (o `IconeAnimado` deixa margem dentro da caixa: 96 de caixa dão 74×82
 * de desenho). A largura sai 9% menor porque o nosso balão é mais estreito que
 * o círculo deles — é a marca, não a medida.
 *
 * `docs/Reference/discord update.jpg` (janela de 175×198 px na imagem, a mesma
 * proporção) — a barra vai de x=160 a x=266, **60,6% da largura** → 180px, e
 * ocupa 4 linhas de luminância elevada, o que com o borrão do JPEG dá entre 4 e
 * 7px CSS: fica em **4px**, que é o "fina" do pedido. O centro dela está a
 * ~258px do topo, ~23px abaixo da frase, que **não se move** quando a barra
 * aparece — por isso o leiaute é absoluto, e não uma coluna com `gap`.
 *
 * ## Sequência
 *
 * 1. mostra a janelinha no primeiro quadro (ela nasce `visible: false`: o
 *    WebView2 pinta um quadro branco antes do primeiro render, e num cartão de
 *    300×350 isso é um flash branco no meio da tela);
 * 2. `check()` do plugin updater, com teto de {@link LIMITE_DA_CHECAGEM};
 * 3. sem atualização, erro de rede ou checagem estourada → mostra a principal e
 *    fecha. **Nunca prende**: atualização é conveniência;
 * 4. com atualização → `downloadAndInstall`, com a porcentagem vinda dos
 *    eventos de download e "Instalando…" no fim. No Windows o plugin dispara o
 *    NSIS `/S /R` e chama `exit(0)`: o processo morre em "Instalando…" e quem
 *    reabre o app é o instalador. Fora do Windows, `relaunch()`.
 *
 * O erro vira toast na janela principal (evento {@link EVENTO_DE_ERRO_DA_SPLASH}),
 * porque aqui não cabe explicação nenhuma e a janelinha some logo depois.
 */

export default function JanelaSplash() {
  const [estado, setEstado] = useState<EstadoDaSplash>("verificando");
  const [porcentagem, setPorcentagem] = useState<number | null>(null);
  // o efeito abaixo baixa e instala; o StrictMode do `next dev` roda efeito
  // duas vezes e dois downloads do mesmo instalador seriam um estrago real
  const jaComecou = useRef(false);

  useEffect(() => {
    if (jaComecou.current) return;
    jaComecou.current = true;

    const abertura = Date.now();
    const modo = modoDaSplash(window.location.search);
    void percorrer(modo, abertura, setEstado, setPorcentagem);
  }, []);

  const mostrarBarra = estado === "baixando" || estado === "instalando";

  return (
    <div
      // sem moldura nativa, a janelinha só se move por aqui — e o Discord também
      // deixa arrastar a dele
      data-tauri-drag-region
      className="fixed inset-0 select-none overflow-hidden rounded-md bg-chat"
    >
      {/*
        A janela é `transparent: true` para o canto arredondado deixar ver o que
        está atrás; o cartão acima é quem pinta. O `background` do `body` vem do
        globals.css e cobriria os cantos com um quadrado — daí a regra aqui, que
        vale desde o primeiro quadro (nada de esperar o JS). Se o WebView2 do
        usuário não fizer janela transparente, o resultado é o mesmo cartão com
        canto reto: nada quebra.
      */}
      <style>{"html,body{background:transparent}"}</style>

      <div className="absolute left-1/2 top-[101px] -translate-x-1/2">
        <IconeAnimado size={96} />
      </div>

      <p
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 top-[224px] px-4 text-center text-base leading-[22px] text-txt-primary"
      >
        {fraseDaSplash(estado, porcentagem)}
      </p>

      {/* a barra ocupa o lugar dela sempre (só some a tinta): o texto não pode
          pular quando o download começa */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentagem ?? 0}
        aria-label="Progresso da atualização"
        aria-hidden={!mostrarBarra}
        className={`absolute left-1/2 top-[256px] h-1 w-[180px] -translate-x-1/2 overflow-hidden rounded-full bg-input transition-opacity ${
          mostrarBarra ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150 ease-linear"
          style={{ width: `${estado === "instalando" ? 100 : (porcentagem ?? 0)}%` }}
        />
      </div>
    </div>
  );
}

// ── Tauri ──────────────────────────────────────────────────────────────────

/**
 * O caminho inteiro, do primeiro quadro até o app na frente (ou até o
 * instalador matar o processo). Fora do Tauri para no primeiro passo: a rota
 * `/splash` aberta num navegador é só o cartão parado.
 */
async function percorrer(
  modo: ModoDaSplash,
  abertura: number,
  setEstado: (e: EstadoDaSplash) => void,
  setPorcentagem: (p: number | null) => void,
): Promise<void> {
  await mostrarEstaJanela();
  if (!isTauri()) return;

  let pacote: PacoteDeAtualizacao | null = null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pacote = (await check({ timeout: LIMITE_DA_CHECAGEM })) as PacoteDeAtualizacao | null;
  } catch {
    // servidor fora, sem rede, endpoint mudo: quem abriu o app quer o app. Só
    // avisa quem pediu a atualização de propósito
    if (modo === "atualizar") await avisarAPrincipal("Não foi possível verificar se há atualização.");
    await entregarOApp(abertura);
    return;
  }

  if (!pacote) {
    await entregarOApp(abertura);
    return;
  }

  try {
    let total = 0;
    let baixado = 0;
    setPorcentagem(null);
    setEstado("baixando");
    await pacote.downloadAndInstall((evento) => {
      if (evento.event === "Started") total = evento.data?.contentLength ?? 0;
      else if (evento.event === "Progress") {
        baixado += evento.data?.chunkLength ?? 0;
        setPorcentagem(porcentagemDoDownload(baixado, total));
      } else if (evento.event === "Finished") {
        setPorcentagem(100);
        setEstado("instalando");
      }
    });
    // no Windows o plugin já chamou `exit(0)` e nada abaixo daqui executa; nas
    // outras plataformas é o `relaunch` que troca o processo pela versão nova
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // rede caída no meio, assinatura recusada, UAC negado (o `ShellExecute`
    // volta com acesso negado): o app volta, com o aviso na janela principal
    await avisarAPrincipal("Não foi possível atualizar. Tente de novo mais tarde.");
    await entregarOApp(abertura);
  }
}

/**
 * Mostra a janelinha no primeiro quadro. Ela nasce escondida de propósito (item
 * 4 do pedido): o WebView2 pinta a janela antes de o React desenhar, e o que
 * apareceria por um instante é um retângulo branco de 300×350 no meio da tela.
 */
async function mostrarEstaJanela(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const janela = getCurrentWindow();
    await janela.show();
    await janela.setFocus();
  } catch {
    // fora do Tauri (ou sem a permissão) não há janela para mostrar
  }
}

/**
 * Devolve o app: espera o mínimo de exibição, mostra e foca a janela principal
 * e fecha esta. A ordem importa — fechar antes de mostrar deixaria a tela sem
 * nada por um quadro, e no `atualizar` a principal está escondida.
 */
async function entregarOApp(abertura: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, esperaQueFalta(abertura, Date.now())));
  try {
    const { getCurrentWindow, Window } = await import("@tauri-apps/api/window");
    const principal = await Window.getByLabel(JANELA_PRINCIPAL);
    if (principal) {
      await principal.show();
      await principal.unminimize();
      await principal.setFocus();
    }
    await getCurrentWindow().close();
  } catch {
    // sem permissão não dá para entregar o app daqui; a bandeja ("Abrir
    // Streamz") continua sendo a saída, como no resto do desktop
  }
}

/** Manda o erro para a janela principal, que o transforma em toast. */
async function avisarAPrincipal(mensagem: string): Promise<void> {
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo(JANELA_PRINCIPAL, EVENTO_DE_ERRO_DA_SPLASH, mensagem);
  } catch {
    // o aviso é o acessório; entregar o app é o essencial
  }
}

/** O que usamos do pacote devolvido pelo `check()` do plugin. */
interface PacoteDeAtualizacao {
  version: string;
  downloadAndInstall: (
    aoProgredir?: (evento: {
      event: string;
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
}
