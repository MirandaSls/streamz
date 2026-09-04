/**
 * Trocar de conta: o que acontece entre clicar numa conta do cofre e o app
 * voltar já sendo outra pessoa.
 *
 * A parte que decide (`planoDeTroca`) é pura e testada; a parte que executa
 * fala com a API, com o cofre e com a navegação.
 *
 * **Por que a troca termina num recarregamento da página.** Uma sessão do
 * Streamz é mais do que o par de tokens: é o socket autenticado no handshake,
 * o rail de servidores, as DMs, os amigos, as não-lidas, a presença, os
 * rascunhos, a voz. Trocar de conta em memória significaria zerar e recarregar
 * cada uma dessas stores na ordem certa, e qualquer uma esquecida vaza dado de
 * uma conta para a outra — o modo de falha mais feio que existe num app de
 * conversa. Um `location.replace("/app")` faz o mesmo trabalho, de graça e sem
 * lista para manter, com o custo de um flash de carregamento que o Discord
 * também tem. `session.ts` já usa a mesma saída ao expirar a sessão, e o
 * caminho vale igual no desktop (o `get_asset` do Tauri resolve `/app` para
 * `app/index.html`).
 */
import type { AuthTokens, PublicUser } from "@streamz/shared";
import { api, usuarioDoToken } from "./api";
import {
  atualizarRefresh,
  ativarConta,
  contaDe,
  guardarConta,
  lerCofreDoDisco,
  marcarExpirada,
  mudarCofre,
  removerConta,
  type Cofre,
} from "./contas";
import { salvarTokens } from "./session";
import { salvarUsuarioGuardado } from "./usuario-guardado";

/** O que dá para fazer com um clique numa conta da lista. */
export type PlanoDeTroca =
  /** já é a conta em uso: fechar o modal e não fazer nada */
  | { tipo: "ja-ativa" }
  /** some do cofre entre a renderização e o clique */
  | { tipo: "desconhecida" }
  /** sem refresh vivo: a troca vira "entre de novo com a senha" */
  | { tipo: "pedir-senha"; user: PublicUser }
  /** o caminho normal: renovar com este token e assumir a sessão */
  | { tipo: "trocar"; user: PublicUser; refreshToken: string };

/**
 * Decide o que fazer ao pedir a conta `userId`. Puro de propósito: é a regra
 * que precisa de teste, e ela não depende de rede nem de navegador.
 */
export function planoDeTroca(cofre: Cofre, userId: string): PlanoDeTroca {
  const conta = contaDe(cofre, userId);
  if (!conta) return { tipo: "desconhecida" };
  if (cofre.ativa === userId) return { tipo: "ja-ativa" };
  if (!conta.refreshToken) return { tipo: "pedir-senha", user: conta.user };
  return { tipo: "trocar", user: conta.user, refreshToken: conta.refreshToken };
}

/**
 * Assume a sessão que os tokens representam: grava tokens, cofre e retrato, e
 * recarrega o app.
 *
 * A ordem importa. Os tokens vão primeiro porque `usuarioDoToken` já rodou e o
 * que vem depois só grava; o cofre vem antes do retrato para que, se a página
 * morrer no meio, o próximo carregamento leia um cofre coerente; e a navegação
 * é a última linha, porque é ela que descarta tudo que está em memória.
 */
export function assumirSessao(user: PublicUser, tokens: AuthTokens): void {
  salvarTokens(tokens);
  mudarCofre((cofre) => guardarConta(cofre, user, tokens.refreshToken));
  salvarUsuarioGuardado(user);
  if (typeof window !== "undefined") window.location.replace("/app");
}

/** Resultado de uma troca — quem chamou decide o que mostrar. */
export type ResultadoDaTroca =
  | { ok: true }
  | { ok: false; motivo: "ja-ativa" | "desconhecida" | "pedir-senha" | "falhou" };

/**
 * Troca para a conta `userId`.
 *
 * Um refresh recusado aqui **não** derruba a sessão em uso: é o token da outra
 * conta que morreu, não o nosso. Por isso não passa por `renovarTokens()` (que
 * lê o refresh ativo e chama `expirarSessao` na recusa) e sim por
 * `api.refreshDe`, que recebe o token de fora. A conta fica marcada como
 * expirada no cofre e a próxima tentativa pede a senha.
 */
export async function trocarDeConta(userId: string): Promise<ResultadoDaTroca> {
  const plano = planoDeTroca(lerCofreDoDisco(), userId);
  if (plano.tipo !== "trocar") return { ok: false, motivo: plano.tipo };

  let tokens: AuthTokens;
  try {
    tokens = await api.refreshDe(plano.refreshToken);
  } catch {
    mudarCofre((cofre) => marcarExpirada(cofre, userId));
    return { ok: false, motivo: "pedir-senha" };
  }

  // o retrato do cofre pode ser de dias atrás (avatar novo, nome novo): quem
  // manda é a API, e agora temos um access token válido para perguntar
  let user: PublicUser;
  try {
    user = await usuarioDoToken(tokens.accessToken);
  } catch {
    // a rede caiu entre uma chamada e outra; o refresh já rotacionou, então o
    // token novo precisa ser guardado ou a conta some do cofre por engano
    mudarCofre((cofre) => atualizarRefresh(cofre, userId, tokens.refreshToken));
    return { ok: false, motivo: "falhou" };
  }

  mudarCofre((cofre) => ativarConta(cofre, userId));
  assumirSessao(user, tokens);
  return { ok: true };
}

/**
 * Sai da conta `userId`: revoga **só aquela** sessão na API e tira do cofre.
 *
 * `/auth/logout` é rota pública e identifica a sessão pelo `jti` do refresh
 * token do corpo — o `Authorization` da conta em uso vai junto e é ignorado.
 * É isso que deixa sair de uma conta de fundo sem tocar na atual.
 *
 * Devolve o id da conta para a qual o app deve ir agora (`null` = login).
 */
export async function sairDaConta(userId: string): Promise<string | null> {
  const conta = contaDe(lerCofreDoDisco(), userId);
  if (conta?.refreshToken) await api.logout(conta.refreshToken).catch(() => {});
  const cofre = mudarCofre((c) => removerConta(c, userId));
  return cofre.ativa;
}

/** Só esquece a conta no aparelho — a sessão continua viva no servidor. */
export function esquecerConta(userId: string): string | null {
  return mudarCofre((cofre) => removerConta(cofre, userId)).ativa;
}
