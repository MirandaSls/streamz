import LinkDeMensagem from "./LinkDeMensagem";

/**
 * O app de desktop empacota a web como HTML estático (`output: "export"`), e o
 * export exige saber de antemão quais caminhos existem. Para esta rota a
 * resposta é **nenhum**: link de mensagem é coisa de navegador — num app
 * instalado não há URL para colar, e o link abre o navegador, não o app.
 *
 * A lista vazia faz o export ignorar a rota; no build do servidor
 * (`standalone`) o `dynamicParams` padrão continua gerando sob demanda, então
 * a web não muda em nada.
 *
 * Sem isto o `tauri build` morre em "is missing generateStaticParams()" — foi
 * o que quebrou o instalador quando esta rota nasceu, sem ninguém notar,
 * porque nada no CI provava que o export ainda era possível. Agora prova (ver
 * o passo "Export do desktop" em ci.yml).
 */
export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <LinkDeMensagem />;
}
