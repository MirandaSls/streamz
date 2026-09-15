"use client";

import { LinhaDeControle, Switch } from "@/components/ui/primitivos";
import { useSettings } from "@/stores/settings";

/**
 * Aba "Avançado".
 *
 * Existe porque o `developerMode` (`stores/settings.ts`) já mudava o app — é
 * ele que revela "Copiar ID" nos menus de contexto — e não tinha interruptor em
 * lugar nenhum: parecia bug para quem lia o código e era inalcançável para quem
 * usava.
 *
 * A lista segue a aba do Discord (imagem de catálogo
 * `suporte/imagens/safety-privacy-and-policy/4407571667351-how-to-find-user-ids-for-law-enforcement/01.png`,
 * escala desconhecida): "Modo desenvolvedor" e "Modo de teste de aplicativos",
 * cada um numa `LinhaDeControle` com o interruptor à direita, rente ao título.
 * A "Aceleração de hardware" que aparece na mesma imagem não entra: no Discord
 * de 2026-09 ela mora em "Sistema" (print `docs/Reference/Captura de tela
 * 2026-09-01 114404.png`), não aqui.
 *
 * O modo de teste de aplicativos **não existe** no Streamz: fica visível e
 * desligado, com o "(em breve)" no rótulo (§6.6 do PROCESSO). Os bots do
 * portal (`AplicativosTab`) não têm uma versão "de teste" para o cliente
 * carregar.
 *
 * Os estados da tela: não há carregando nem erro — a preferência é local
 * (`localStorage`, via o `persist` da store) e muda na hora, sem "Salvar"; por
 * isso a aba não registra alterações pendentes.
 */
export default function AvancadoTab() {
  const developerMode = useSettings((s) => s.developerMode);
  const set = useSettings((s) => s.set);

  return (
    <div>
      <LinhaDeControle
        htmlFor="avancado-modo-desenvolvedor"
        rotulo="Modo desenvolvedor"
        descricao="Mostra nos menus de contexto os itens úteis para quem cria bots com a API do Streamz, como “Copiar ID” de usuários, canais, servidores e mensagens."
        controle={
          <Switch
            id="avancado-modo-desenvolvedor"
            marcado={developerMode}
            aoMudar={(marcado) => set({ developerMode: marcado })}
          />
        }
      />
      <LinhaDeControle
        htmlFor="avancado-modo-de-teste"
        rotulo="Modo de teste de aplicativos (em breve)"
        descricao="Informe o ID de um aplicativo seu para ligar o modo de teste dele neste aparelho."
        semDivisoria
        controle={
          <Switch
            id="avancado-modo-de-teste"
            marcado={false}
            aoMudar={() => {}}
            desabilitado
          />
        }
      />
    </div>
  );
}
