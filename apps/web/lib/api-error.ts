/**
 * Erro de requisição à API com o status HTTP preservado.
 *
 * Existe para que a UI decida como mostrar a falha (inline no formulário, toast,
 * redirect) em vez de o cliente HTTP chamar `alert` — o módulo de rede não tem
 * contexto para escolher a apresentação.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True quando a falha veio da API com este status (e não de rede/parse). */
export function isApiError(erro: unknown, status?: number): erro is ApiError {
  return erro instanceof ApiError && (status === undefined || erro.status === status);
}
