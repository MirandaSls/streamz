/**
 * "Saiu versão nova do app de celular?" — e, desde este módulo, o que fazer a
 * respeito.
 *
 * ## Por que isto existe e não é só `useAtualizacao`
 *
 * O desktop atualiza sozinho: a janelinha de abertura chama o atualizador do
 * Tauri, que baixa o `.exe`, roda o instalador em silêncio e reinicia o app
 * (§5 e §5.2 do processo). **Nada disso existe no Android.** O
 * `tauri-plugin-updater` é desktop-only — nem entra no `.apk`, por um
 * `[target.'cfg(not(any(target_os = "android", ...)))']` no `Cargo.toml`.
 *
 * O que existe no lugar é nosso: este módulo decide, e o plugin Kotlin
 * `atualizador` (`src-tauri/src/atualizador.rs` + `AtualizadorPlugin.kt`) baixa
 * o `.apk`, confere o **sha256** e abre o instalador do sistema.
 *
 * ## O limite honesto: "sozinho" para no instalador
 *
 * Fora da Play, **nenhum app Android instala outro sem uma tela de confirmação
 * do sistema**. Não é falta de permissão nossa nem de engenhosidade: pular essa
 * tela exige ser a loja, ser *device owner* (aparelho gerenciado por empresa)
 * ou estar assinado com a chave da plataforma. Então "atualiza sozinho" quer
 * dizer, com todas as letras: *o app percebe, baixa em segundo plano, confere o
 * pacote e abre o instalador já com o arquivo pronto* — resta um toque em
 * "Atualizar". É o que Discord, Fortnite e todo APK fora da loja fazem. A UI
 * diz isso, e a doc também (`docs/APPS-MOBILE.md` §13).
 *
 * ## A separação
 *
 * Tudo que é decisão mora aqui e é testado sem rede nem DOM:
 * `novidadeDoManifesto` (o manifesto presta?) e `decidirAtualizacao` (abertura
 * baixa; app aberto avisa). O `fetch` fica na casca, e a ponte com o Kotlin
 * fica em `lib/desktop.ts`.
 */

import { API_URL } from "./config";

/**
 * O que a rota devolve. O formato é o do atualizador do Tauri (é a mesma rota
 * do desktop), e por isso tem `pub_date` em snake_case e a chave de plataforma
 * no formato `<target>-<arch>`. No Android a `signature` vem **vazia** e o
 * `sha256` vem preenchido — a troca está explicada em `updates.service.ts`.
 */
export interface ManifestoDeAtualizacao {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms?: Record<string, { signature: string; url: string; sha256?: string }>;
}

/** O que o atualizador precisa saber. `null` = não há novidade. */
export interface NovidadeDeAtualizacao {
  versao: string;
  notas: string | null;
  /** o `.apk`, direto. Não é mais a página de download: o app baixa sozinho. */
  url: string;
  /** o digest que o app confere antes de chamar o instalador. Minúsculo. */
  sha256: string;
}

/**
 * O `arch` que vai na URL. A rota é `/:target/:arch/:version` porque o formato
 * é do Tauri; no Android o nosso `.apk` é **universal** (carrega os quatro
 * ABIs), então não há arquitetura a distinguir e o valor é uma constante.
 */
export const ARCO_ANDROID = "universal";

/**
 * De quanto em quanto tempo reconsultar com o app aberto.
 *
 * Trinta minutos é o intervalo pedido, e ele é generoso de propósito: a rota
 * responde 204 na esmagadora maioria das vezes, e uma consulta a cada poucos
 * minutos seria ruído de rede e de bateria para descobrir a mesma coisa. Quem
 * abre o app do zero já checa na abertura, que é o caminho comum.
 */
export const INTERVALO_DE_CHECAGEM_MS = 30 * 60 * 1000;

/** Um sha256 de verdade: 64 hexadecimais. */
const DIGEST = /^[0-9a-f]{64}$/;

/**
 * A decisão, sem rede: o manifesto traz novidade em que dá para confiar?
 *
 * Ela é conservadora de propósito, e ficou **mais** conservadora quando o card
 * deixou de só avisar e passou a instalar:
 *
 * - sem `url` não há o que baixar (antes: um botão que não levava a lugar
 *   nenhum; agora: um download para o vazio);
 * - **sem `sha256` válido não há novidade nenhuma.** Este é o ponto. Baixar um
 *   `.apk` e entregá-lo ao instalador sem conferir o conteúdo é exatamente o
 *   ataque que o digest existe para impedir, e "o servidor esqueceu de
 *   configurar" não pode virar "então instale qualquer coisa". A API já recusa
 *   servir sem digest; esta é a segunda tranca, do lado do cliente, porque a
 *   primeira mora num `.env` que uma pessoa apressada edita.
 *
 * A comparação de versão **não é feita aqui**: quem já sabe se a versão é mais
 * nova é a API (`ehMaisNova` em `updates/versao.ts`), que responde 204 quando o
 * app está em dia. Repetir a regra no cliente daria duas verdades sobre o que é
 * "mais novo", e a do servidor é a que manda.
 */
export function novidadeDoManifesto(
  manifesto: ManifestoDeAtualizacao | null,
  plataforma = `android-${ARCO_ANDROID}`,
): NovidadeDeAtualizacao | null {
  if (!manifesto?.version) return null;
  const alvo = manifesto.platforms?.[plataforma];
  const url = alvo?.url?.trim();
  if (!url) return null;
  const sha256 = alvo?.sha256?.trim().toLowerCase() ?? "";
  if (!DIGEST.test(sha256)) return null;
  return {
    versao: manifesto.version,
    notas: manifesto.notes?.trim() || null,
    url,
    sha256,
  };
}

/**
 * O que o atualizador sabe de si mesmo na hora de decidir. Tudo que vem do
 * componente, nada que venha do mundo.
 */
export interface EstadoDoAtualizador {
  /**
   * É a **abertura**? Verdadeiro só na primeira checagem desta execução do app.
   * A distinção é o coração do pedido: quem acabou de abrir não estava fazendo
   * nada, e o download pode começar sozinho; quem já está no app pode estar no
   * meio de uma conversa ou de uma chamada, e aí o certo é oferecer.
   */
  abertura: boolean;
  /** A versão que o usuário dispensou tocando no "x". `null` = nenhuma. */
  dispensada: string | null;
  /** Já há um download ou uma instalação em curso? */
  ocupado: boolean;
}

/**
 * O que fazer com a novidade encontrada.
 *
 * - `"baixar"` — começar o download em segundo plano, com a barrinha discreta,
 *   e abrir o instalador ao terminar.
 * - `"avisar"` — mostrar o card "Versão X disponível — Instalar" e esperar o
 *   toque.
 * - `"nada"` — não há o que fazer.
 */
export type AcaoDeAtualizacao = "baixar" | "avisar" | "nada";

/**
 * A regra inteira, pura: abertura baixa, app aberto avisa.
 *
 * Três cuidados que valem mais que a regra principal:
 *
 * 1. **`ocupado` vence tudo.** A checagem periódica volta a cada 30 min e não
 *    pode reiniciar um download de 40 MB que está em 80%, nem empilhar um
 *    segundo por cima do primeiro.
 * 2. **`dispensada` não vale na abertura.** Dispensar é "agora não"; fechar o
 *    app e abrir de novo é justamente o momento em que atualizar não incomoda
 *    ninguém. Guardar "não me avise mais desta versão" para sempre seria o
 *    usuário desligar o aviso sem saber que desligou.
 * 3. **`dispensada` compara a versão, não um booleano.** Dispensar a 1.2.0 não
 *    pode calar a 1.3.0, que é outra informação.
 */
export function decidirAtualizacao(
  novidade: NovidadeDeAtualizacao | null,
  estado: EstadoDoAtualizador,
): AcaoDeAtualizacao {
  if (!novidade) return "nada";
  if (estado.ocupado) return "nada";
  if (estado.abertura) return "baixar";
  if (estado.dispensada === novidade.versao) return "nada";
  return "avisar";
}

/**
 * Consulta a rota e devolve a novidade, ou `null`.
 *
 * **Nunca lança.** Sem rede, com a API fora do ar, com 204 (está em dia) ou com
 * um corpo que não é JSON, a resposta é a mesma: `null`, e o app segue como se
 * nada tivesse acontecido. Atualização é conveniência; derrubar a abertura do
 * app por causa dela seria trocar um incômodo por um defeito.
 *
 * `versaoAtual` vem do `getVersion()` do Tauri — é a versão do `.apk`
 * instalado, não a do bundle da web (que é sempre a que veio dentro dele).
 */
export async function checarAtualizacaoDoAndroid(
  versaoAtual: string,
  buscar: typeof fetch = fetch,
): Promise<NovidadeDeAtualizacao | null> {
  if (!versaoAtual) return null;
  try {
    const resposta = await buscar(
      `${API_URL}/api/updates/android/${ARCO_ANDROID}/${encodeURIComponent(versaoAtual)}`,
    );
    // 204 é "está em dia" — o protocolo do Tauri, reaproveitado aqui
    if (resposta.status === 204 || !resposta.ok) return null;
    return novidadeDoManifesto((await resposta.json()) as ManifestoDeAtualizacao);
  } catch {
    return null;
  }
}
