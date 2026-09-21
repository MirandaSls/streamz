"use client";

import PaginaDeDesenvolvedores from "@/components/desenvolvedores/PaginaDeDesenvolvedores";

/**
 * `/desenvolvedores` — a documentação da API de bots.
 *
 * Rota pública: não passa por `useAuth` nem redireciona para `/login`. Quem
 * chega aqui geralmente ainda não tem conta — está decidindo se escreve o bot.
 *
 * Client component como todas as rotas da web (o desktop embute este app como
 * export estático, `next.config.mjs`): a especificação OpenAPI é buscada no
 * navegador, depois de montar.
 */
export default function Desenvolvedores() {
  return <PaginaDeDesenvolvedores />;
}
