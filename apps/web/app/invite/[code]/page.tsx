import AceitarConvite from "./AceitarConvite";

/**
 * Convite é link que se abre no **navegador**: num app instalado não há endereço para colar. Esta rota existe para a web, e o app de desktop — que empacota a web como HTML estático — não precisa dela.
 *
 * O parâmetro devolvido é um descarte. `output: "export"` exige que toda rota
 * dinâmica diga quais caminhos existem, e **lista vazia ele lê como "não
 * implementou"** — o build morre em "is missing generateStaticParams()". Um
 * item gera uma página de lixo que o desktop nunca visita, e é o preço de o
 * export existir.
 *
 * Na web nada muda: o build do servidor mantém o `dynamicParams` padrão e
 * continua atendendo qualquer código de convite sob demanda.
 */
export function generateStaticParams() {
  return [{ code: "_" }];
}

export default function Page() {
  return <AceitarConvite />;
}
