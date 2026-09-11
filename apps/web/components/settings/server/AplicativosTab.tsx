"use client";

import { useEffect, useState } from "react";
import {
  displayNameOf,
  permissionNames,
  PERMISSION_INFO,
  type AppInstalacao,
} from "@streamz/shared";
import { Bot } from "@/components/ui/icones";
import { TituloDaPagina } from "@/components/settings/server/pagina";
import Avatar from "@/components/ui/Avatar";
import { Button, Tooltip } from "@/components/ui/primitivos";
import TagDeBot from "@/components/ui/TagDeBot";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * ── j-bots ── Aba "Aplicativos" das configurações do servidor: o que está
 * instalado aqui, com o que cada um pode fazer, e o botão de tirar.
 *
 * É a contrapartida de "Descobrir aplicativos" (lote B): lá se instala, aqui se
 * confere e se remove. Sem esta tela, um app instalado por outro moderador só
 * apareceria como um membro a mais na lista, e a única pista de que ele tem
 * `MANAGE_MESSAGES` seria abrir a aba de cargos e reconhecer o cargo gerenciado
 * pelo nome.
 *
 * `MANAGE_GUILD` esconde a aba inteira (o registro em `ServerSettingsModal` é
 * quem faz isso) **e** a API repete a checagem nas três rotas — a mesma dobra
 * das outras abas: esconder é conforto, a permissão de verdade é a do servidor.
 *
 * **As permissões aqui são leitura, não edição.** Mudar o que o app pode fazer
 * é mexer no cargo gerenciado dele, e isso tem um lugar: a aba "Cargos", que já
 * sabe fazer a trava de escalada de privilégio. Duas telas escrevendo no mesmo
 * cargo seriam duas chances de discordarem.
 */
export default function AplicativosTab({ guildId }: { guildId: string }) {
  /** `null` = ainda carregando; `[]` = carregou e não há nada. */
  const [apps, setApps] = useState<AppInstalacao[] | null>(null);
  /**
   * A rota `GET /guilds/:id/aplicativos` é do lote B da F4 e pode não existir
   * na API contra a qual esta tela está rodando. Quando ela responde 404, a
   * tela diz isso em vez de fingir que o servidor não tem aplicativo nenhum —
   * "vazio" e "a rota não existe" são coisas diferentes, e a segunda é um
   * defeito que ninguém veria se as duas desenhassem a mesma frase.
   */
  const [semRota, setSemRota] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .appsDoServidor(guildId)
      .then((lista) => vivo && setApps(lista))
      .catch((e) => {
        if (!vivo) return;
        const status = (e as { status?: number })?.status;
        if (status === 404) {
          setSemRota(true);
        } else {
          ui.toast(errorMessage(e, "Não foi possível listar os aplicativos"), "error");
        }
        setApps([]);
      });
    return () => {
      vivo = false;
    };
  }, [guildId]);

  async function remover(item: AppInstalacao) {
    const ok = await ui.confirm({
      title: `Remover ${item.app.name}`,
      message:
        "O aplicativo sai do servidor: o bot deixa a lista de membros, o cargo dele é apagado e " +
        "ele para de receber os eventos daqui. Para trazer de volta é preciso instalar de novo, " +
        "escolhendo as permissões outra vez.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removerApp(guildId, item.applicationId);
      setApps((lista) => lista?.filter((x) => x.id !== item.id) ?? null);
      ui.toast(`${item.app.name} foi removido do servidor`);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o aplicativo"), "error");
    }
  }

  return (
    <div>
      <TituloDaPagina
        titulo="Aplicativos"
        subtitulo="Os bots instalados neste servidor, o que cada um pode fazer e quem os trouxe."
      />

      {semRota && (
        <p className="mb-4 rounded-lg border border-border-subtle bg-background-base-lowest p-3 text-sm text-text-muted">
          A instalação de aplicativos ainda não está disponível nesta instância.
        </p>
      )}

      {apps === null && <p className="text-sm text-text-muted">Carregando…</p>}

      {apps !== null && apps.length === 0 && !semRota && (
        <p className="text-sm text-text-muted">
          Nenhum aplicativo instalado. Encontre um em “Descobrir aplicativos” e adicione-o aqui.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {(apps ?? []).map((item) => (
          <LinhaDeApp key={item.id} item={item} aoRemover={() => void remover(item)} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Uma instalação na lista.
 *
 * No celular a linha vira coluna (`celular:` no `flex-col`): em 358px de largura
 * útil, o nome do app, quem instalou e o botão "Remover" lado a lado deixavam o
 * nome com 90px e truncando no terceiro caractere. Empilhado, cada um tem a
 * linha inteira, e o botão fica com os 44px de alvo que o dedo precisa.
 */
function LinhaDeApp({ item, aoRemover }: { item: AppInstalacao; aoRemover: () => void }) {
  const concedidas = permissionNames(item.permissions);
  return (
    <li className="rounded-lg border border-border-subtle bg-background-base-lowest p-3">
      <div className="flex items-start gap-3 celular:flex-col">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconeDoApp url={item.app.iconUrl} nome={item.app.name} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-text-strong">{item.app.name}</span>
              <TagDeBot />
            </div>
            {item.app.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{item.app.description}</p>
            )}
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
              <Avatar user={item.instaladoPor} size="xs" surface="border-background-base-lowest" />
              <span className="truncate">
                Instalado por {displayNameOf(item.instaladoPor)} em{" "}
                {horaCompleta(item.createdAt)}
              </span>
            </p>
          </div>
        </div>

        <Button
          variante="critico-secundario"
          tamanho="sm"
          onClick={aoRemover}
          aria-label={`Remover ${item.app.name} do servidor`}
          /* 32px é a altura dos botões desta família de páginas (`h-8` em
             "Perfil do servidor" e "Cargos"); no celular ele sobe para o piso
             de toque de 44 e ocupa a linha inteira, porque uma ação destrutiva
             encolhida num canto é a que mais se aperta por engano. */
          className="celular:h-[44px] celular:w-full"
        >
          Remover
        </Button>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
          Permissões concedidas
        </p>
        {concedidas.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nenhuma. O bot só faz o que qualquer membro faria.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {concedidas.map((nome) => (
              <li key={nome}>
                <Tooltip rotulo={PERMISSION_INFO[nome].description}>
                  <span className="rounded-[3px] bg-input-background-default px-1.5 py-0.5 text-xs text-text-default">
                    {PERMISSION_INFO[nome].label}
                  </span>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * O ícone do aplicativo, 40px. Sem ícone entra a carinha de robô do acervo —
 * e não a inicial do nome, que é o que fazemos com servidor e pessoa: um app
 * sem ícone é a maioria dos apps, e uma coluna de letras soltas não diria que
 * aquilo ali é um bot.
 */
function IconeDoApp({ url, nome }: { url: string | null; nome: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-input-background-default text-text-muted">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Bot size={22} role="img" aria-label={`${nome} não tem ícone`} />
      )}
    </span>
  );
}
