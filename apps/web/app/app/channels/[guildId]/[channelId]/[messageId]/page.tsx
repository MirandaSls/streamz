import LinkDeMensagem from "./LinkDeMensagem";

/**
 * Link de mensagem é coisa de navegador, como o convite: num app instalado não há URL para colar, e clicar num link desses abre o navegador.
 *
 * O parâmetro devolvido é um descarte. `output: "export"` exige que toda rota
 * dinâmica diga quais caminhos existem, e **lista vazia ele lê como "não
 * implementou"** — o build morre em "is missing generateStaticParams()". Um
 * item gera uma página de lixo que o desktop nunca visita, e é o preço de o
 * export existir.
 *
 * Na web nada muda: o build do servidor mantém o `dynamicParams` padrão e
 * continua atendendo qualquer link de mensagem sob demanda.
 */
export function generateStaticParams() {
  return [{ guildId: "_", channelId: "_", messageId: "_" }];
}

export default function Page() {
  return <LinkDeMensagem />;
}
