import LinkDeCanal from "./LinkDeCanal";

/**
 * Link de canal (`channelLinkPath`): "Copiar link do canal" e o "Abrir no
 * navegador" do app que não faz chamada (`lib/suporte-a-chamadas.ts`). Até
 * aqui só a rota com mensagem existia, e o link do canal dava 404 no site.
 *
 * O parâmetro descartável é o mesmo motivo da rota de mensagem ao lado:
 * `output: "export"` exige que toda rota dinâmica liste ao menos um caminho.
 */
export function generateStaticParams() {
  return [{ guildId: "_", channelId: "_" }];
}

export default function Page() {
  return <LinkDeCanal />;
}
