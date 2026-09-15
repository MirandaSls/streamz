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

// ── d-social ──
/**
 * Pedido de amizade: aceita um nome de usuário e diz se ele existe, então é
 * também uma forma de enumerar contas. O teto é folgado para uso humano e
 * apertado para varredura.
 */
export const FRIEND_REQUEST_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 15 },
});

/**
 * Rotas que disparam e-mail (verificação, "esqueci a senha"). O teto é baixo
 * porque cada chamada custa um envio real e a rota é pública — sem ele, dá para
 * usar o servidor de e-mail do projeto para inundar a caixa de um terceiro.
 */
export const AUTH_EMAIL_THROTTLE = Throttle({
  default: { ttl: seconds(3600), limit: 5 },
});

/**
 * Segundo fator e redefinição por token: força bruta de 6 dígitos. O bloqueio
 * por conta (`lockout.ts`) cobre a senha; aqui é o teto por IP dos códigos.
 */
export const AUTH_MFA_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 10 },
});

/** Operações sensíveis da própria conta (trocar senha/e-mail, desativar, excluir). */
export const ACCOUNT_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 10 },
});

/**
 * Senha da página de download. O teto é o mais apertado do arquivo porque o
 * alvo é uma senha **única e compartilhada**: não há conta para bloquear (o
 * `lockout.ts` cobre login, não isto), então o limite por IP é a única barreira
 * contra força bruta.
 */
export const DOWNLOAD_SENHA_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 8 },
});

// ── j-bots ──
/**
 * Criar aplicativo e regenerar token.
 *
 * Criar um aplicativo cria **uma conta de usuário** (a do bot) e uma
 * credencial de longa duração: é a rota de registro com outro nome, e merece o
 * mesmo tipo de freio. O teto é por hora, não por minuto, porque o uso humano
 * é "faço um bot, depois outro", não uma sequência.
 */
export const APP_CREATE_THROTTLE = Throttle({
  default: { ttl: seconds(3600), limit: 10 },
});

/**
 * Quem está pedindo, para os tetos que contam **por pessoa** e não por IP.
 *
 * O `ThrottlerGuard` global roda antes do `JwtGuard` do controller, então o
 * `req.user` ainda não existe: o `sub` sai do próprio Bearer, **só
 * decodificado**, sem conferir a assinatura. É seguro para contar: um token
 * forjado com outro `sub` escapa deste teto, mas cai no 401 do `JwtGuard` logo
 * depois, sem ir ao banco. Sem Bearer legível, conta pelo IP, como o global.
 */
export function rastreioPorUsuario(req: Record<string, unknown>): string {
  const headers = req.headers as { authorization?: unknown } | undefined;
  const header = headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const partes = header.slice(7).split(".");
    if (partes.length === 3 && partes[1]) {
      try {
        const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as {
          sub?: unknown;
        };
        if (typeof payload.sub === "string" && payload.sub.length > 0) return `usuario:${payload.sub}`;
      } catch {
        // payload ilegível: conta pelo IP
      }
    }
  }
  return String(req.ip ?? "");
}

// ── api-interacoes ──
/**
 * Autocomplete de comando de barra (`POST channels/:id/interactions/autocomplete`).
 *
 * O composer pede sugestões a cada pausa da digitação, e o teto global (300/min
 * **por IP**) derrubava a rota para quem digita rápido ou para várias pessoas
 * atrás do mesmo NAT. Aqui a conta é **por usuário** e o teto é o dobro: 600/min
 * são 10 pedidos por segundo sustentados, acima de qualquer digitação humana e
 * ainda um freio para um script. Número de projeto, não do Discord (o cliente
 * deles não expõe o teto do autocomplete): "não medido".
 */
export const AUTOCOMPLETE_THROTTLE = Throttle({
  default: { ttl: seconds(60), limit: 600, getTracker: rastreioPorUsuario },
});
