import { z } from "zod";

/**
 * Diagnóstico enviado pelo cliente (web/desktop) para `POST /api/diagnostics/client`.
 *
 * Por que existe: erro de navegador nunca chega ao servidor, então bug que só
 * acontece com certos usuários (voz caindo, WS reconectando, exceção de JS) era
 * invisível. O cliente junta poucos eventos e envia em lote.
 */

// Lista fechada: o servidor indexa/filtra por tipo, e texto livre aqui viraria
// cardinalidade sem controle nos logs.
export const TIPOS_DE_DIAGNOSTICO = [
  "js.erro",
  "js.promessa",
  "voz.queda",
  "voz.conexao",
  "voz.midia",
  "ws.conexao",
] as const;
export type TipoDeDiagnostico = (typeof TIPOS_DE_DIAGNOSTICO)[number];

// Teto por lote: um cliente em loop de erro não pode inundar a API nem o log.
export const MAX_EVENTOS_DE_DIAGNOSTICO = 20;

export const diagnosticoDoClienteSchema = z.object({
  eventos: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_DE_DIAGNOSTICO),
        mensagem: z.string().min(1).max(500),
        // stack, motivo de desconexão do LiveKit, etc.
        detalhe: z.string().max(4000).optional(),
        // Momento no cliente: o envio pode atrasar (offline/lote), então o
        // horário de recebimento não serve para reconstruir a sequência.
        em: z.string().datetime(),
        // pathname da página, sem query (que pode carregar token/convite).
        rota: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(MAX_EVENTOS_DE_DIAGNOSTICO),
  // "desktop/1.3.16"; ausente no navegador.
  cliente: z.string().max(40).optional(),
});
export type DiagnosticoDoCliente = z.infer<typeof diagnosticoDoClienteSchema>;
export type EventoDeDiagnostico = DiagnosticoDoCliente["eventos"][number];
