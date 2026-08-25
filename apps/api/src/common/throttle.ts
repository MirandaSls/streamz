import { Throttle, seconds } from "@nestjs/throttler";

/**
 * Limites de requisição por IP.
 *
 * O teto global (`DEFAULT_THROTTLE`) é folgado de propósito: serve de rede de
 * segurança contra abuso automatizado, não de cota de uso — a UI faz muitas
 * chamadas de leitura por minuto. As rotas caras ou atacáveis por força bruta
 * ganham tetos próprios abaixo.
 *
 * Atenção: a contagem é por IP visto pelo Node. Atrás de proxy/CDN é preciso
 * `app.set("trust proxy", …)` para não colapsar todo mundo num IP só.
 */
export const DEFAULT_THROTTLE = { ttl: seconds(60), limit: 300 };

/** Login: força bruta de senha. */
export const AUTH_LOGIN_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 10 },
});

/** Registro: criação em massa de contas. */
export const AUTH_REGISTER_THROTTLE = Throttle({
  default: { ttl: seconds(3600), limit: 5 },
});

/** Upload: cada chamada custa banda e um objeto no bucket. */
export const UPLOAD_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 20 },
});

/** Criação de convite. */
export const INVITE_CREATE_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 10 },
});

/** Prévia de convite: é rota pública, dá para varrer códigos por ela. */
export const INVITE_PREVIEW_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 30 },
});
