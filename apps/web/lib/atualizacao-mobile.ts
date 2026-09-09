/**
 * "Saiu versão nova do app de celular?" — a metade que o Android tem.
 *
 * ## Por que isto existe e não é só `useAtualizacao`
 *
 * O desktop atualiza sozinho: a janelinha de abertura chama o atualizador do
 * Tauri, que baixa o `.exe`, roda o instalador em silêncio e reinicia o app
 * (§5 e §5.2 do processo). **Nada disso existe no Android.** O
 * `tauri-plugin-updater` é desktop-only — nem entra no `.apk`, por um
 * `[target.'cfg(not(any(target_os = "android", ...)))']` no `Cargo.toml` — e
 * não poderia existir mesmo: o Android não deixa um app instalar outro app sem
 * a permissão `REQUEST_INSTALL_PACKAGES`, que é justamente a que a Play trata
 * como sinal de malware.
 *
 * Então o que dá para fazer honestamente é **avisar**. Este módulo consulta a
 * mesma rota `/api/updates` (com o alvo `android`, ver `updates.service.ts`) e,
 * quando há versão nova, quem chamou mostra um card que abre
 * `streamz.chat/download` no navegador do sistema. Quem baixa e instala é o
 * usuário, com o Android perguntando se confia na origem. Quando o app estiver
 * na Play, quem atualiza é a loja e este caminho vira decoração — as variáveis
 * `ANDROID_UPDATE_*` ficam vazias e a rota responde 204.
 *
 * A separação "parte pura / parte que fala com o mundo" é a de sempre: a
 * decisão (`novidadeDoManifesto`) é testável sem rede, e o `fetch` fica na
 * casca.
 */

import { API_URL } from "./config";

/**
 * O que a rota devolve. O formato é o do atualizador do Tauri (é a mesma rota
 * do desktop), e por isso tem `pub_date` em snake_case e a chave de plataforma
 * no formato `<target>-<arch>`. No Android a `signature` vem **vazia**: não há
 * nada assinado porque não há nada instalado automaticamente.
 */
export interface ManifestoDeAtualizacao {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms?: Record<string, { signature: string; url: string }>;
}

/** O que o card precisa mostrar. `null` = não há novidade. */
export interface NovidadeDeAtualizacao {
  versao: string;
  notas: string | null;
  /** para onde mandar o usuário; sempre a página, nunca o `.apk` direto. */
  url: string;
}

/**
 * O `arch` que vai na URL. A rota é `/:target/:arch/:version` porque o formato
 * é do Tauri; no Android o nosso `.apk` é **universal** (carrega os quatro
 * ABIs), então não há arquitetura a distinguir e o valor é uma constante.
 */
export const ARCO_ANDROID = "universal";

/**
 * A decisão, sem rede: o manifesto traz novidade que valha um card?
 *
 * Ela é conservadora de propósito. Um manifesto sem `url` não vira card —
 * um botão "Baixar atualização" que não leva a lugar nenhum é pior que nenhum
 * botão. E a comparação de versão **não é feita aqui**: quem já sabe se a
 * versão é mais nova é a API (`ehMaisNova` em `updates/versao.ts`), que
 * responde 204 quando o app está em dia. Repetir a regra no cliente daria duas
 * verdades sobre o que é "mais novo", e a do servidor é a que manda.
 */
export function novidadeDoManifesto(
  manifesto: ManifestoDeAtualizacao | null,
  plataforma = `android-${ARCO_ANDROID}`,
): NovidadeDeAtualizacao | null {
  if (!manifesto?.version) return null;
  const url = manifesto.platforms?.[plataforma]?.url?.trim();
  if (!url) return null;
  return {
    versao: manifesto.version,
    notas: manifesto.notes?.trim() || null,
    url,
  };
}

/**
 * Consulta a rota e devolve a novidade, ou `null`.
 *
 * **Nunca lança.** Sem rede, com a API fora do ar, com 204 (está em dia) ou com
 * um corpo que não é JSON, a resposta é a mesma: `null`, e o app segue como se
 * nada tivesse acontecido. Aviso de atualização é conveniência; derrubar a
 * abertura do app por causa dele seria trocar um incômodo por um defeito.
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
