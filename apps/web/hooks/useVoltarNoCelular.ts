"use client";

import { useEffect, useRef } from "react";
import { useMobile } from "@/stores/mobile";

/**
 * O "voltar" do Android para uma camada que vive **por cima** do shell de
 * celular — as configurações em tela cheia, um modal largo, uma folha.
 *
 * A gaveta de canais do shell (a conversa arrastada para a direita) também é
 * registrada aqui, e não na store da pilha: ela não muda o que está empilhado,
 * só onde a tela do topo está.
 *
 * O shell (`components/mobile/ShellMobile.tsx`) já faz isto para as camadas
 * *dele* (tela empilhada, painel de membros, folha): enquanto houver alguma,
 * mantém **uma** entrada sentinela no histórico e o `popstate` a consome. Aqui
 * a conta é a mesma, para as camadas que não passam pela store da pilha:
 *
 * - cada camada registrada empurra uma entrada;
 * - o `popstate` desfaz **a mais alta** e só ela;
 * - fechar pelo botão da tela (X, seta de voltar, Esc, arrasto) desregistra a
 *   camada e deixa a entrada para trás, como **resíduo** — que é **descartado**
 *   logo depois com um `history.go(-n)` nosso.
 *
 * ## Por que o resíduo agora é descartado
 *
 * A versão anterior deixava o resíduo no histórico, contando que "o próximo
 * `popstate` o consome em silêncio". Não consumia: o ouvinte do shell roda
 * primeiro, pergunta `haCamadaNoCelular()`, ouve "não" e desfaz uma tela dele
 * com aquele "voltar" — e a sentinela do shell fica órfã no histórico. Com
 * folhas raras isso custava um "voltar" morto de vez em quando; com a gaveta
 * de canais, que abre e fecha a cada arrasto, cada ciclo "arrastar, soltar,
 * voltar" deixava **mais uma** entrada morta, e sair do app pedia um "voltar"
 * por conversa aberta.
 *
 * O medo antigo era o `popstate` do nosso próprio `history.go` desfazer uma
 * camada do shell por tabela. Por isso ele é marcado (`descartando`) e
 * `haCamadaNoCelular()` responde "sim" enquanto ele não chega: o shell não se
 * mexe, e o nosso ouvinte o engole. O descarte espera um pouco
 * (`ESPERA_DO_DESCARTE`) porque uma camada pode fechar e outra abrir logo em
 * seguida (o menu de contexto que vira modal): aí a entrada não sobra, é
 * **reaproveitada**, e não há o que descartar.
 *
 * ## Por que a pilha do shell é congelada
 *
 * O `popstate` é um evento só, e o shell tem o ouvinte dele registrado do mesmo
 * jeito que nós — a ordem entre os dois não é garantida. Com uma camada modal
 * na tela, o `voltar()` do shell desfaria uma camada *por baixo* da que o
 * usuário está vendo: fecharia o canal atrás das configurações. Enquanto houver
 * camada registrada aqui, a navegação do shell é congelada num instantâneo e
 * reposta no fim da fila de tarefas (depois de todos os ouvintes rodarem, seja
 * qual for a ordem). Sem camada nenhuma, nada é reposto: aí o "voltar" é do
 * shell mesmo, e ele está certo em desfazer.
 *
 * O shell se protege do outro lado também: com `useUI.modals` cheio, o
 * `useVoltarDoAndroid` dele nem chega a chamar `voltar()`. As duas guardas
 * convivem de propósito e **não** são a mesma coisa — a de lá cobre o que passa
 * pelo `ModalHost` (configurações, modais largos, visualizador de imagem); esta
 * cobre também o que não é modal da store: a folha de emoji, o cartão de perfil
 * e o painel de sons, que sobem por portal sem passar por `useUI.modals`.
 *
 * O estado é de módulo, e não de componente, porque quem é dono da conta é o
 * **documento**: dois modais abertos ao mesmo tempo compartilham a mesma pilha
 * de histórico.
 */

interface Camada {
  voltar: () => void;
}

type Congelado = Pick<
  ReturnType<typeof useMobile.getState>,
  "aba" | "pilhas" | "membrosAbertos" | "folha"
>;

/** Camadas na tela agora, da mais baixa para a mais alta. */
let camadas: Camada[] = [];
/** Quantas entradas nossas estão no histórico (inclui resíduo). */
let entradas = 0;
/** A navegação do shell, como estava quando a primeira camada subiu. */
let congelado: Congelado | null = null;
let ouvindo = false;
/** `popstate`s nossos a caminho (do descarte de resíduo), que ninguém deve atender. */
let descartando = 0;
let descarteAgendado = false;

function instantaneo(): Congelado {
  const { aba, pilhas, membrosAbertos, folha } = useMobile.getState();
  return { aba, pilhas, membrosAbertos, folha };
}

function aoVoltarDoSistema() {
  if (descartando > 0) {
    descartando -= 1;
    return;
  }
  const topo = camadas[camadas.length - 1];
  if (topo && congelado) {
    const estado = congelado;
    // no fim da fila: só aí todos os ouvintes de `popstate` já rodaram
    setTimeout(() => useMobile.setState(estado), 0);
  }
  if (entradas === 0) return;
  entradas -= 1;
  topo?.voltar();
}

function ouvir() {
  if (ouvindo || typeof window === "undefined") return;
  ouvindo = true;
  window.addEventListener("popstate", aoVoltarDoSistema);
}

/**
 * Espera antes de descartar. Não é medida de nada: é folga para a camada que
 * substitui a que fechou se registrar. O `Modal` só registra depois de um
 * `setMontado` dentro de efeito — um render a mais, fora do commit que fechou o
 * menu — e, se o descarte corresse antes, a entrada sairia e voltaria em
 * seguida, com duas navegações de histórico disputando a mesma fila.
 */
const ESPERA_DO_DESCARTE = 50;

/** Tira do histórico as entradas que sobraram de camadas fechadas pela tela. */
function agendarDescarte() {
  if (descarteAgendado || typeof window === "undefined") return;
  descarteAgendado = true;
  setTimeout(() => {
    descarteAgendado = false;
    const sobra = entradas - camadas.length;
    if (sobra <= 0) return;
    entradas -= sobra;
    descartando += 1; // `go(-n)` dispara um `popstate` só, qualquer que seja o n
    window.history.go(-sobra);
  }, ESPERA_DO_DESCARTE);
}

function sincronizar() {
  if (typeof window === "undefined") return;
  ouvir();
  while (entradas < camadas.length) {
    entradas += 1;
    window.history.pushState({ streamzCamada: true }, "");
  }
}

/**
 * Há alguma camada de celular na tela agora?
 *
 * O `ShellMobile` pergunta isto antes de desfazer a navegação dele no
 * `popstate`. A guarda que ele já tinha — `useUI.modals.length > 0` — só cobre
 * o que passa pelo `ModalHost`, e as folhas que sobem por portal (emoji, cartão
 * de perfil, menu de contexto, popover ancorado) não entram lá.
 *
 * **Por que a reposição do instantâneo não bastava.** A ideia era deixar o
 * shell desfazer e repor a navegação no fim da fila. Ela funciona para uma
 * camada montada *no shell* (o menu de contexto), e falha para uma montada
 * *dentro da tela que o shell acabou de desfazer*: o ouvinte do shell é o
 * primeiro (ele registra o dele ao montar, muito antes de existir camada), o
 * React descarrega a tela ainda dentro do despacho do `popstate`, e a folha de
 * emoji — que mora no `Composer`, dentro da tela de canal — some junto. Quando
 * o nosso ouvinte roda, `camadas` já está vazio, `congelado` já é `null`, e não
 * há o que repor. Medido em 390x844: um "voltar" com a folha de emoji aberta
 * fechava a folha **e** saía do canal.
 *
 * Perguntar antes é mais barato e mais direto que consertar depois: com camada
 * na tela o "voltar" é dela, e o shell não se mexe. A reposição continua onde
 * está, para as ordens de ouvinte que esta guarda não cobre.
 */
export function haCamadaNoCelular(): boolean {
  // o descarte de resíduo também conta: aquele `popstate` é nosso
  return camadas.length > 0 || descartando > 0;
}

/**
 * Quantas camadas estão registradas agora.
 *
 * O arrasto do shell precisa da conta, e não só do "há alguma?": a gaveta de
 * canais aberta **é** uma camada (o "voltar" a fecha), e com ela na tela o dedo
 * ainda pode arrastá-la de volta — mas não se houver outra camada por cima
 * dela, como a folha do toque longo.
 */
export function camadasNoCelular(): number {
  return camadas.length;
}

/**
 * Registra uma camada enquanto `ligado` for verdadeiro.
 *
 * `voltar` é lido no momento do evento (fica numa `ref`), então pode fechar
 * sobre estado novo sem re-registrar a camada a cada render.
 */
export function useVoltarNoCelular(ligado: boolean, voltar: () => void) {
  const acao = useRef(voltar);
  acao.current = voltar;

  useEffect(() => {
    if (!ligado) return;
    const camada: Camada = { voltar: () => acao.current() };
    camadas = [...camadas, camada];
    if (camadas.length === 1) congelado = instantaneo();
    sincronizar();
    return () => {
      camadas = camadas.filter((c) => c !== camada);
      if (camadas.length === 0) congelado = null;
      // fechada pelo "voltar", a entrada já saiu (`aoVoltarDoSistema`) e não há
      // sobra; fechada pela tela, sobra uma, e ela sai no fim da fila
      if (entradas > camadas.length) agendarDescarte();
    };
  }, [ligado]);
}
