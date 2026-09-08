import { Controller } from "@nestjs/common";
import { InteractionsService } from "./interactions.service";

/**
 * O REST **interno** das interações: o que o navegador chama.
 *
 * ── Lote A (domínio) implementa. ──
 *
 * `Authorization: Bearer` + `JwtGuard`, como todo o resto do REST do produto.
 * Não confundir com `/api/v10/**`, que é a casca de compatibilidade e fala
 * `Authorization: Bot <token>` (ou, no caso do callback, token nenhum).
 *
 * | Método | Rota | O quê |
 * |---|---|---|
 * | POST | `/api/channels/:id/interactions` | dispara `/play` |
 * | GET | `/api/guilds/:id/comandos-de-app` | o que o composer sugere |
 *
 * **Divergência do documento, registrada:** o §9 desenhou
 * `POST /api/interactions` (com o canal no corpo) e
 * `GET /api/guilds/:id/application-commands`. As rotas são as de cima —
 * o canal é o recurso, e o resto do REST interno é em português. O documento é
 * corrigido no PR final da fase.
 *
 * O `POST` devolve `InteracaoCriada` e **não** espera o bot: a resposta dele
 * chega pelo socket, como qualquer outra mensagem. Um bot que leve 8 s para
 * resolver um link do YouTube não pode segurar o `fetch` do composer.
 */
@Controller()
export class InteractionsController {
  constructor(protected readonly interacoes: InteractionsService) {}
}
