"use client";

import { useEffect, useRef } from "react";
import { useMobile } from "@/stores/mobile";

/**
 * O "voltar" do Android para uma camada que vive **por cima** do shell de
 * celular — as configurações em tela cheia, um modal largo, uma folha.
 *
 * O shell (`components/mobile/ShellMobile.tsx`) já faz isto para as camadas
 * *dele* (tela empilhada, painel de membros, folha): enquanto houver alguma,
 * mantém **uma** entrada sentinela no histórico e o `popstate` a consome. Aqui
 * a conta é a mesma, para as camadas que não passam pela store da pilha:
 *
 * - cada camada registrada empurra uma entrada;
 * - o `popstate` desfaz **a mais alta** e só ela;
 * - fechar pelo botão da tela (X, seta de voltar, Esc) desregistra a camada e
 *   deixa a entrada para trás — ela vira **resíduo** e o próximo `popstate` a
 *   consome em silêncio. Removê-la na hora exigiria um `history.back()` nosso,
 *   que dispararia o `popstate` que o shell também escuta, e aí ele desfaria
 *   uma camada dele por tabela. Resíduo é o preço mais barato: no máximo um
 *   "voltar" é engolido, e a conta se acerta sozinha.
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

function instantaneo(): Congelado {
  const { aba, pilhas, membrosAbertos, folha } = useMobile.getState();
  return { aba, pilhas, membrosAbertos, folha };
}

function aoVoltarDoSistema() {
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

function sincronizar() {
  if (typeof window === "undefined") return;
  ouvir();
  while (entradas < camadas.length) {
    entradas += 1;
    window.history.pushState({ streamzCamada: true }, "");
  }
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
    };
  }, [ligado]);
}
