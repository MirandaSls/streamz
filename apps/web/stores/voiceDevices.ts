"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { restaurarAtenuacaoDoWindows, suspenderAtenuacaoDoWindows } from "@/lib/desktop";
// só o tipo: importar `sistemaDeAudio` de verdade arrastaria `lib/microfone`
// (e o supressor, com AudioWorklet) para dentro desta store, que hoje é leve e
// é montada por qualquer tela que mostre uma lista de aparelhos
import type { SistemaDeAudio } from "@/lib/microfone";

/**
 * Microfone, saída de áudio e câmera escolhidos pelo usuário.
 *
 * Fica numa store própria (e não dentro de `voice.ts`) porque a escolha de
 * dispositivo vale **fora** de qualquer chamada: a aba "Voz e vídeo" das
 * configurações mexe nela com o app parado, e a call em andamento apenas
 * reage. Os ids são persistidos — trocar de fone não deve virar um ritual a
 * cada reload.
 *
 * ## Por que a lista vinha com um aparelho só e sem nome
 *
 * O Chromium **esconde a lista inteira** de quem não tem a permissão de mídia
 * *concedida*: `enumerateDevices()` devolve exatamente uma entrada por tipo,
 * com `deviceId` e `label` vazios. É isso, e não um bug nosso de renderização,
 * que produzia "Padrão do sistema / Microfone 1" e "Padrão do sistema /
 * Saída 1" nos prints `2026-09-03 191339` e `191344`.
 *
 * O código antigo já pedia `getUserMedia` antes de listar, e mesmo assim caía
 * nisso, por duas razões medidas:
 *
 * 1. **`getUserMedia` resolver não é o mesmo que ter a permissão.** No desktop,
 *    o `--auto-accept-camera-and-microphone-capture` do WebView2 aceita a
 *    captura sem prompt, mas não registra a concessão: medido em Chromium
 *    headless com essa flag, `getUserMedia` devolve uma faixa com o nome certo
 *    e `navigator.permissions.query({name:"microphone"})` continua em
 *    `"prompt"` — com a faixa **viva** e depois de pará-la, `enumerateDevices`
 *    segue devolvendo `[audioinput ""], [videoinput ""], [audiooutput ""]`.
 *    Enumerar com a trilha aberta, que é o truque que funciona no Firefox, não
 *    resolve esse caso: só a permissão de verdade resolve. No desktop a flag
 *    deu lugar a um ouvinte de `PermissionRequested` do WebView2, que responde
 *    `ALLOW` sem pop-up **e** registra a concessão (`src-tauri/src/permissoes.rs`).
 * 2. **`autorizado` era ligado no sucesso do `getUserMedia`**, então o motivo
 *    ficava `"ok"` e a tela não dizia nada — e, como `refresh()` só pedia
 *    permissão quando `autorizado` era falso, nunca mais tentava.
 *
 * Agora `autorizado` é o que se pode *verificar*: veio rótulo. Sem rótulo o
 * motivo é `"sem-rotulos"` e a tela explica. E a permissão é pedida enquanto a
 * lista estiver anônima (uma vez por sessão sem forçar, sempre que o usuário
 * clicar em "Atualizar lista").
 */

/**
 * Por que não há microfone nem câmera à disposição.
 *
 * `inseguro` é o caso que mais confunde: fora de `localhost`, o navegador só
 * expõe `navigator.mediaDevices` sobre **https**. Abrir o app pelo IP da rede
 * (`http://192.168.x.x:3000`) faz a API sumir inteira, e antes disso o código
 * apenas retornava — nenhuma permissão era pedida e nenhum erro aparecia, o que
 * é indistinguível de "o botão está quebrado".
 *
 * `sem-rotulos` é o caso novo: a captura funciona, mas o navegador não conta o
 * nome de nada. Dizer "permissão negada" aqui mandaria a pessoa procurar um
 * cadeado que, no desktop, não existe.
 */
export type MotivoDeMidia = "ok" | "negado" | "inseguro" | "indisponivel" | "sem-rotulos";

export interface VoiceDevicesState {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  inputId: string | null;
  outputId: string | null;
  cameraId: string | null;
  /** true quando os rótulos vieram (permissão concedida de verdade). */
  autorizado: boolean;
  /**
   * O navegador deixa escolher a saída?
   *
   * `HTMLMediaElement.setSinkId` é o que faz a escolha valer: sem ele o
   * `<audio>` toca sempre na saída do sistema, e oferecer uma lista que não
   * muda nada é pior que não oferecer. Onde ele existe (compat do MDN, set.
   * 2026): Chrome 49+, Edge 17+, Firefox 116+ e — só agora — **Safari 18.4**,
   * que é macOS 15.4; antes disso o WebKit nem sequer enumerava as saídas. O
   * WKWebView do app de macOS é o WebKit do sistema, então ali a resposta é a
   * versão do macOS da máquina, e é justamente por isso que esta flag é
   * **detecção**, não tabela de navegador. Em Android (Chrome e Firefox) não
   * existe em nenhuma versão.
   */
  saidaSelecionavel: boolean;
  motivo: MotivoDeMidia;
  setInput: (id: string | null) => void;
  setOutput: (id: string | null) => void;
  setCamera: (id: string | null) => void;
  /** `forcar` reabre o pedido de permissão mesmo depois de uma recusa. */
  refresh: (forcar?: boolean) => Promise<void>;
}

/**
 * Por que a captura falhou AGORA, sem esperar o `refresh()`.
 *
 * Quem chama `getUserMedia` direto precisa disso no `catch`: em contexto
 * inseguro o erro é um `TypeError` de `mediaDevices` indefinido, e dizer
 * "libere a permissão no navegador" manda a pessoa procurar um cadeado que
 * nunca vai existir.
 */
export function motivoDaFalha(): MotivoDeMidia {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return typeof window !== "undefined" && window.isSecureContext
      ? "indisponivel"
      : "inseguro";
  }
  return "negado";
}

/** Frase pronta para a tela, ou `null` quando está tudo certo. */
export function explicarMidia(motivo: MotivoDeMidia): string | null {
  if (motivo === "ok") return null;
  if (motivo === "inseguro") {
    return "O navegador só libera microfone e câmera em https ou em localhost. Este endereço é http na rede local, então nem a permissão chega a ser pedida — abra o app por http://localhost:3000 ou sirva por https.";
  }
  if (motivo === "negado") {
    return "Permissão de microfone e câmera negada. Libere no cadeado da barra de endereço e tente de novo.";
  }
  if (motivo === "sem-rotulos") {
    return "O navegador aceitou a captura mas não está entregando o nome dos aparelhos, e sem isso ele mostra um dispositivo genérico por tipo. Autorize o microfone para este endereço e atualize a lista.";
  }
  return "Este navegador não expõe microfone nem câmera.";
}

const KEY = "voiceDevices";

type Ids = Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId">;

function load(): Ids {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return JSON.parse(raw) as Ids;
  } catch {
    // storage indisponível ou corrompido: volta ao padrão do sistema
  }
  return { inputId: null, outputId: null, cameraId: null };
}

function save(ids: Ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // sem storage não há o que persistir
  }
}

/** `mediaDevices` não existe em contexto inseguro (http fora de localhost) nem no SSR. */
function midia(): MediaDevices | null {
  if (typeof navigator === "undefined") return null;
  return navigator.mediaDevices ?? null;
}

/**
 * `setSinkId` é o que faz a escolha de saída valer alguma coisa (as versões
 * por navegador estão em `saidaSelecionavel`). Detecção no protótipo, e não
 * lista de user agents: no app de macOS quem responde é a versão do sistema.
 */
function temSetSinkId(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId === "function"
  );
}

/**
 * `default` e `communications` são apelidos do Chromium para o aparelho que o
 * Windows escolheu — o mesmo hardware aparecendo de novo, com "Padrão -" ou
 * "Comunicações -" grudado no nome. A linha "Padrão do sistema" (id `null`) já
 * é esse apelido, então listá-los outra vez só duplicaria a lista.
 */
export function aparelhosReais(lista: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return lista.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
}

/** Um rótulo por dispositivo, igual em todo lugar que mostra a lista. */
export interface OpcaoDeDispositivo {
  id: string;
  nome: string;
}

/**
 * Nome que vai para a tela. O `label` vazio é o navegador escondendo o
 * aparelho; numerar é o último recurso, e é melhor que uma linha em branco.
 */
export function opcoesDe(lista: MediaDeviceInfo[], prefixo: string): OpcaoDeDispositivo[] {
  return lista.map((d, i) => ({ id: d.deviceId, nome: d.label || `${prefixo} ${i + 1}` }));
}

/** O nome do escolhido, ou "Padrão do sistema" quando ninguém foi escolhido. */
export function nomeEscolhido(
  lista: MediaDeviceInfo[],
  id: string | null,
  prefixo: string,
): string {
  if (id === null) return "Padrão do sistema";
  return opcoesDe(lista, prefixo).find((o) => o.id === id)?.nome ?? "Padrão do sistema";
}

/**
 * Onde a pessoa troca a saída quando não é aqui dentro.
 *
 * Mandar "use as configurações do sistema" sem dizer quais é quase o mesmo que
 * não dizer nada — e o caminho tem nome diferente em cada sistema. `outro`
 * cobre também o "ainda não sei" de `useSistemaDeAudio` (o `null` antes de
 * montar), porque uma frase genérica e certa é melhor que um caminho inventado.
 */
const SAIDA_FIXA: Record<SistemaDeAudio, string> = {
  windows:
    "Este navegador não troca a saída de áudio: o som vai sempre para o aparelho padrão do Windows. Para trocar, use Configurações ▸ Sistema ▸ Som, ou o ícone de volume na barra de tarefas.",
  "macos-webkit":
    "Aqui a saída de áudio é sempre a do sistema: escolher o aparelho por dentro do app só passou a existir no WebKit com o Safari 18.4 (macOS 15.4). Para trocar, use Ajustes do Sistema ▸ Som ▸ Saída (Preferências do Sistema, no macOS antigo) ou o ícone de som na barra de menus.",
  "macos-chromium":
    "Este navegador não troca a saída de áudio: o som vai sempre para o aparelho padrão do Mac. Para trocar, use Ajustes do Sistema ▸ Som ▸ Saída, ou o ícone de som na barra de menus.",
  outro:
    "Este navegador não troca a saída de áudio: o som vai sempre para o aparelho padrão do sistema. Para trocar, use as configurações de som do sistema.",
};

/** O que a tela faz com a lista de saída neste navegador. */
export interface EscolhaDeSaida {
  /** Aparelhos a oferecer — **vazio** quando escolher não mudaria nada. */
  opcoes: OpcaoDeDispositivo[];
  /** O id a exibir como escolhido; `null` é "padrão do sistema". */
  escolhido: string | null;
  /** Por que não dá para escolher (e onde trocar), ou `null` quando dá. */
  motivoFixo: string | null;
}

/**
 * A única regra de "oferecer ou não a lista de saída", para os três lugares
 * que a mostram: o menu da setinha do fone, a aba "Voz e vídeo" e o painel de
 * dentro da chamada.
 *
 * Ela nasceu sozinha no menu da setinha, e os outros dois desenhavam o seletor
 * sem olhar a flag — no macOS (WKWebView sem `setSinkId`) a pessoa escolhia, o
 * `aplicarSaida` voltava em silêncio e o som continuava no mesmo aparelho: é o
 * relato "não consigo alterar o dispositivo de saída". Esconder a lista sem
 * dizer nada seria a outra metade do mesmo defeito, por isso o `motivoFixo`
 * acompanha o corte — e por isso ele diz **onde** trocar, já que no app não dá.
 */
export function escolhaDeSaida(
  estado: Pick<VoiceDevicesState, "outputs" | "outputId" | "saidaSelecionavel">,
  sistema: SistemaDeAudio | null,
  prefixo = "Saída",
): EscolhaDeSaida {
  if (!estado.saidaSelecionavel) {
    // o id guardado continua no storage (o navegador pode ganhar a API numa
    // atualização do sistema), mas na tela ele seria uma escolha mentirosa
    return { opcoes: [], escolhido: null, motivoFixo: SAIDA_FIXA[sistema ?? "outro"] };
  }
  return { opcoes: opcoesDe(estado.outputs, prefixo), escolhido: estado.outputId, motivoFixo: null };
}

/** true quando pelo menos um aparelho veio com nome — a prova de que há permissão. */
function temRotulo(lista: MediaDeviceInfo[]): boolean {
  return lista.some((d) => d.label !== "");
}

/**
 * `permissions.query` não existe em todo navegador (o Firefox só ganhou
 * `microphone` recentemente e o Safari não tem). `null` quer dizer "não dá para
 * saber" — nesse caso vale tentar pedir.
 */
async function estadoDaPermissao(): Promise<PermissionState | null> {
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return p?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Já pedimos permissão nesta sessão? Sem isso, cada abrir de menu com a lista
 * anônima viraria um novo prompt — e no desktop, onde a lista fica anônima por
 * outro motivo, seria um prompt por clique. O botão "Atualizar lista" passa
 * `forcar` e ignora esta trava.
 */
let jaPediu = false;
/** Um `refresh` de cada vez: quatro componentes montando juntos não são quatro prompts. */
let emCurso: Promise<void> | null = null;

/**
 * Suspende a atenuação do Windows antes de abrir uma captura, e a devolve
 * depois. Sempre pareados — inclusive no caminho de erro.
 *
 * Toda captura de microfone do Chromium abre como stream de **comunicações**
 * (`AudioCategory_Communications`, decidido no `Open()` da captura WASAPI e sem
 * opção de desligar), e o padrão do Windows é abaixar em 80% o volume dos
 * outros aplicativos enquanto isso dura. Não é só a chamada que abre captura: a
 * sonda de rótulos logo abaixo e o teste de microfone também — e sem isto
 * montar a aba "Voz e vídeo" já abaixava a música.
 *
 * Quem conta quantos pedidos estão de pé é a própria ponte (`lib/desktop.ts`),
 * para que a suspensão da chamada participe da mesma conta só por usar o par.
 * Estes dois nomes existem porque dizem a intenção no ponto de uso; não há
 * regra aqui.
 */
export async function suspenderAtenuacaoDaCaptura(): Promise<void> {
  await suspenderAtenuacaoDoWindows();
}

/** Par de `suspenderAtenuacaoDaCaptura`. */
export function devolverAtenuacao(): void {
  void restaurarAtenuacaoDoWindows();
}

export const useVoiceDevicesStore = create<VoiceDevicesState>((set, get) => ({
  inputs: [],
  outputs: [],
  cameras: [],
  ...load(),
  autorizado: false,
  saidaSelecionavel: true,
  motivo: "ok",

  setInput: (id) => {
    const next = { ...ids(get()), inputId: id };
    save(next);
    set(next);
  },
  setOutput: (id) => {
    const next = { ...ids(get()), outputId: id };
    save(next);
    set(next);
  },
  setCamera: (id) => {
    const next = { ...ids(get()), cameraId: id };
    save(next);
    set(next);
  },

  refresh: (forcar = false) => {
    if (emCurso && !forcar) return emCurso;
    const p = (async () => {
      const md = midia();
      if (!md) {
        // silêncio aqui era o bug: sem `mediaDevices` nada acontecia e a tela
        // ficava idêntica a "ainda não cliquei". Agora o motivo vai para a tela.
        const seguro = typeof window !== "undefined" && window.isSecureContext;
        set({
          autorizado: false,
          // também aqui: o valor inicial é `true` (o servidor não tem
          // `HTMLMediaElement`, e chutar `false` na renderização do servidor
          // trocaria o texto na frente da pessoa na hidratação), então sem esta
          // linha o caminho sem `mediaDevices` ficaria com a flag por medir
          saidaSelecionavel: temSetSinkId(),
          motivo: seguro ? "indisponivel" : "inseguro",
          inputs: [],
          outputs: [],
          cameras: [],
        });
        return;
      }

      const enumerar = () => md.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      let todos = await enumerar();
      let motivo: MotivoDeMidia = "ok";

      // A lista anônima é a única coisa que distingue "não tenho permissão" de
      // "tenho": o navegador não conta de outro jeito.
      if (!temRotulo(todos)) {
        const estado = await estadoDaPermissao();
        if (estado === "denied" && !forcar) {
          motivo = "negado";
        } else if (jaPediu && !forcar) {
          motivo = "sem-rotulos";
        } else {
          jaPediu = true;
          let faixa: MediaStream | null = null;
          // antes do `getUserMedia`: esta sonda abre uma captura de verdade, e
          // sem isto só montar a aba "Voz e vídeo" já abaixava o volume dos
          // outros aplicativos (ver `suspenderAtenuacaoDaCaptura`, acima)
          await suspenderAtenuacaoDaCaptura();
          try {
            // A sonda quer rótulo, não processamento: pedir tudo desligado
            // poupa a cadeia de tratamento **da nossa** captura (é o que vira
            // `AUDCLNT_STREAMOPTIONS_RAW` no Windows). O que isto **não** faz
            // é tirar o stream da categoria de comunicações — o Chromium a
            // marca incondicionalmente —, e é a categoria, não o processamento,
            // que liga o ducking do Windows e põe o fone Bluetooth em
            // mãos-livres. Do ducking cuida a linha acima; do fone, só avisar
            // (`ehMicrofoneDeFoneBluetooth`).
            faixa = await md.getUserMedia({
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            });
            // enumerar com a trilha **viva**: é o que o Firefox exige para
            // entregar rótulo sem permissão persistida. No Chromium não muda
            // nada (medido), mas também não custa nada.
            todos = await enumerar();
          } catch {
            motivo = "negado";
          } finally {
            faixa?.getTracks().forEach((t) => t.stop());
            devolverAtenuacao();
          }
          if (motivo === "ok" && !temRotulo(todos)) motivo = "sem-rotulos";
        }
      }

      const inputs = aparelhosReais(todos.filter((d) => d.kind === "audioinput"));
      const outputs = aparelhosReais(todos.filter((d) => d.kind === "audiooutput"));
      const cameras = aparelhosReais(todos.filter((d) => d.kind === "videoinput"));
      set({
        autorizado: temRotulo(todos),
        saidaSelecionavel: temSetSinkId(),
        motivo,
        inputs,
        outputs,
        cameras,
      });

      // dispositivo escolhido que foi desconectado volta a "padrão do sistema"
      const atual = ids(get());
      const valido = (id: string | null, lista: MediaDeviceInfo[]) =>
        id === null || lista.some((d) => d.deviceId === id) ? id : null;
      const next: Ids = {
        inputId: valido(atual.inputId, inputs),
        outputId: valido(atual.outputId, outputs),
        cameraId: valido(atual.cameraId, cameras),
      };
      if (
        next.inputId !== atual.inputId ||
        next.outputId !== atual.outputId ||
        next.cameraId !== atual.cameraId
      ) {
        save(next);
        set(next);
      }
    })();
    emCurso = p.finally(() => {
      if (emCurso === p) emCurso = null;
    });
    return emCurso;
  },
}));

function ids(s: VoiceDevicesState): Ids {
  return { inputId: s.inputId, outputId: s.outputId, cameraId: s.cameraId };
}

/**
 * `devicechange` é assinado **uma vez por documento**, no primeiro uso.
 *
 * Era um par de `addEventListener`/`removeEventListener` no efeito do hook, com
 * uma trava de módulo: o segundo componente a montar não assinava (a trava já
 * estava de pé) e o primeiro a desmontar removia o ouvinte de todo mundo.
 * Depois de abrir e fechar o menu do microfone uma vez, plugar um fone não
 * atualizava mais nada. Um ouvinte que vive o documento inteiro não tem esse
 * problema e não vaza: é um só.
 */
let assinado = false;
function assinarTrocaDeDispositivo() {
  if (assinado) return;
  const md = midia();
  if (!md?.addEventListener) return;
  assinado = true;
  md.addEventListener("devicechange", () => {
    void useVoiceDevicesStore.getState().refresh();
  });
}

/**
 * Hook público — a lista é a mesma no menu da setinha, no painel da call e na
 * aba "Voz e vídeo": os três montam isto. Lista na montagem e reage a
 * `devicechange`, então plugar um fone atualiza sozinho.
 */
export function useVoiceDevices(): VoiceDevicesState {
  const state = useVoiceDevicesStore();

  useEffect(() => {
    void useVoiceDevicesStore.getState().refresh();
    assinarTrocaDeDispositivo();
  }, []);

  return state;
}

/**
 * Aponta um `<audio>` para a saída escolhida. Onde `setSinkId` não existe (ver
 * `saidaSelecionavel`) o elemento continua na saída padrão, que é o
 * comportamento aceitável — falhar aqui não pode calar o áudio. O que **não**
 * pode é a tela oferecer a escolha assim mesmo: é `escolhaDeSaida` quem
 * impede, e este retorno silencioso é a prova de que ela precisa existir.
 */
export async function aplicarSaida(el: HTMLMediaElement, outputId: string | null) {
  const alvo = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (!outputId || typeof alvo.setSinkId !== "function") return;
  await alvo.setSinkId(outputId).catch(() => {});
}
