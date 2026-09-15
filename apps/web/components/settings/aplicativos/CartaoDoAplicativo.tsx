"use client";

import { useState, type MouseEvent } from "react";
import { PERMISSION_INFO, permissionNames, type AppDetalhe } from "@streamz/shared";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { Check, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "@/components/ui/icones";
import { BotaoDeIcone, Button, Switch } from "@/components/ui/primitivos";
import { dataCompleta } from "@/lib/format";
import { ui } from "@/stores/ui";
import { IconeDoApp, SecaoDoCartao, dataCurta } from "./pecas";

/**
 * Um aplicativo meu na lista — o cartão `.authedAppV2` da aba Authorized Apps
 * do Discord, com o conteúdo do portal do desenvolvedor do Streamz.
 *
 * Forma (`tokens/css-bruto/sob-demanda/216947.c1fba293adbe783f.css`):
 * - cartão: `.authedAppV2{background-color:var(--background-mod-subtle);
 *   border-radius:var(--radius-sm);margin-bottom:16px;overflow:hidden}`;
 * - cabeçalho: `.headerV2{align-items:center;display:grid;grid-template-columns:
 *   auto minmax(0,1fr) auto auto;background-color:var(--background-mod-subtle);
 *   padding:16px}` — o **segundo** véu sobre o do cartão é o que clareia a
 *   faixa de cima (catálogo: `#313136` no cabeçalho, `#28282d` no corpo);
 * - texto do cabeçalho: `.headerTextContainerV2{margin:0 12px;overflow:hidden}`
 *   + `.headerText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
 * - corpo: `.appDetailsContainer{padding:4px 16px}`;
 * - rodapé: `.footer{align-items:center;display:flex;justify-content:flex-end;
 *   margin:16px 0}`;
 * - botão "…": `.actionMenuButton__8dc78{background-color:var(--background-
 *   base-lower);border-radius:var(--radius-xs);padding:var(--space-8)}` e
 *   `:hover{background-color:var(--interactive-background-hover)}` — é o
 *   `fundo="sempre"` do `BotaoDeIcone`, que já pinta exatamente esse par. 32 =
 *   8 + 16 + 8 (catálogo ÷2: y 642–705 = 64px), então o glifo é de 16.
 *
 * Texto (catálogo ÷2, altura de maiúscula): nome "B" 22px → 11 → 16px em
 * `#fbfbfb` (`--text-strong`); linha de baixo "A" 20px → 10 → 14px, também
 * `#fbfbfb`; 4 entre as duas linhas (topo das maiúsculas a 21 e 44 do topo do
 * cabeçalho, com 74 de altura total). Peso do nome: não medido.
 *
 * Botão de apagar = "Deauthorize": fundo `#35353a` sobre `#28282d` e texto
 * `#f16f6c` (≈ `--text-feedback-critical` com antisserrilhado) → o
 * `critico-secundario`; 32 de altura (y 1212–1275 = 64px) → `sm`. O "Editar"
 * ao lado é nosso (o Discord não edita app de terceiro): `secundario` no mesmo
 * degrau.
 *
 * O que é Streamz e não Discord: o conteúdo das seções. "About and Policies"
 * vira **Sobre** (descrição e usuário-bot — o Streamz não tem termos de uso
 * nem política de privacidade por aplicativo, e os links não foram
 * inventados); "Permissions" vira **Permissões sugeridas** (a lista com o
 * visto é o mesmo desenho, `.permission{align-items:center;display:flex;
 * margin-top:8px}` + `.permissionCheckmark{width:23px;height:18px}` — glifo de
 * 18 com 5 de folga); "Server Access" vira **Servidores** (navega, como lá);
 * **Visibilidade** e **Token** são do portal.
 */
type Secao = "sobre" | "permissoes" | "visibilidade" | "token";

export function CartaoDoAplicativo({
  app,
  aoEditar,
  aoVerServidores,
  aoRegenerar,
  aoApagar,
  aoPublicar,
}: {
  app: AppDetalhe;
  aoEditar: () => void;
  aoVerServidores: () => void;
  aoRegenerar: () => void;
  aoApagar: () => void;
  /** devolve quando a API respondeu, para o interruptor destravar. */
  aoPublicar: (valor: boolean) => Promise<void>;
}) {
  // Várias abertas ao mesmo tempo, como no catálogo (as duas seções do
  // primeiro cartão estão abertas juntas).
  const [abertas, setAbertas] = useState<ReadonlySet<Secao>>(() => new Set());
  const [publicando, setPublicando] = useState(false);

  const permissoes = permissionNames(app.permissoesPadrao);
  const alternar = (secao: Secao) =>
    setAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(secao)) proximas.delete(secao);
      else proximas.add(secao);
      return proximas;
    });

  function abrirMenu(e: MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    ui.openContextMenu(
      // alinhado pela direita do botão, 8 abaixo — a folga não foi medida
      Math.max(8, r.right - MENU_WIDTH),
      r.bottom + 8,
      [
        { label: "Editar aplicativo", icon: <Pencil size={18} />, onSelect: aoEditar },
        { label: "Regenerar token", icon: <RefreshCw size={18} />, onSelect: aoRegenerar },
        { separator: true },
        { label: "Apagar aplicativo", icon: <Trash2 size={18} />, danger: true, onSelect: aoApagar },
        { separator: true },
        {
          // "Copy App ID" do menu do Discord. O id que as bibliotecas pedem é o
          // snowflake (string decimal), não o id interno do registro.
          label: "Copiar ID do aplicativo",
          onSelect: () => {
            const escrita = navigator.clipboard?.writeText(app.snowflake);
            if (!escrita) {
              ui.toast("Não foi possível copiar o ID", "error");
              return;
            }
            escrita.then(
              () => ui.toast("ID do aplicativo copiado"),
              () => ui.toast("Não foi possível copiar o ID", "error"),
            );
          },
        },
      ],
      MENU_WIDTH,
    );
  }

  async function publicar(valor: boolean) {
    setPublicando(true);
    try {
      await aoPublicar(valor);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <li className="mb-4 list-none overflow-hidden rounded-lg bg-background-mod-subtle last:mb-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center bg-background-mod-subtle p-4">
        <IconeDoApp app={app} />
        <div className="mx-3 overflow-hidden">
          <h3 className="truncate text-text-md font-semibold text-text-strong">{app.name}</h3>
          <p className="mt-1 truncate text-text-sm text-text-strong">Criado em {dataCurta(app.createdAt)}</p>
        </div>
        <BotaoDeIcone
          rotulo={`Mais opções de ${app.name}`}
          semDica
          icone={<MoreHorizontal size={16} />}
          tamanho="md"
          tamanhoDoIcone={16}
          forma="reto"
          fundo="sempre"
          aria-haspopup="menu"
          onClick={abrirMenu}
          // `reto` não emite raio: o `rounded` aqui é o `--radius-xs` (4) do
          // `.actionMenuButton`, sem disputar com o `rounded-lg` do degrau `md`.
          // No celular o alvo cresce a 44 por fora, sem mudar a caixa de 32.
          className="relative rounded celular:before:absolute celular:before:-inset-[6px] celular:before:content-['']"
        />
      </div>

      <div className="px-4 py-1">
        <SecaoDoCartao
          titulo="Sobre"
          resumo={`@${app.botUser.username}`}
          aberta={abertas.has("sobre")}
          aoAlternar={() => alternar("sobre")}
        >
          <p className="text-text-sm text-text-default">
            {app.description ? app.description : <span className="text-text-muted">Sem descrição.</span>}
          </p>
          <p className="mt-2 text-text-sm text-text-subtle">
            Usuário-bot <span className="text-text-default">@{app.botUser.username}</span> — é ele que
            aparece na lista de membros dos servidores onde o aplicativo está.
          </p>
        </SecaoDoCartao>

        <SecaoDoCartao
          titulo="Permissões sugeridas"
          resumo={
            permissoes.length === 0
              ? "Nenhuma permissão sugerida"
              : permissoes.length === 1
                ? "1 permissão sugerida"
                : `${permissoes.length} permissões sugeridas`
          }
          aberta={abertas.has("permissoes")}
          aoAlternar={() => alternar("permissoes")}
        >
          {permissoes.length === 0 ? (
            <p className="text-text-sm text-text-muted">
              A tela de instalação vem sem nada marcado. Mude em &ldquo;Editar&rdquo;.
            </p>
          ) : (
            <ul>
              {permissoes.map((nome) => (
                <li key={nome} className="mt-2 flex items-center first:mt-0">
                  <Check size={18} aria-hidden="true" className="mr-[5px] shrink-0 text-icon-feedback-positive" />
                  <span className="text-text-sm text-text-default">{PERMISSION_INFO[nome].label}</span>
                </li>
              ))}
            </ul>
          )}
        </SecaoDoCartao>

        <SecaoDoCartao
          titulo="Visibilidade"
          resumo={app.publico ? "Publicado em Descobrir aplicativos" : "Privado"}
          aberta={abertas.has("visibilidade")}
          aoAlternar={() => alternar("visibilidade")}
        >
          {/* O interruptor salva sozinho: publicar é decisão de um clique, e o
              efeito (aparecer ou sumir de "Descobrir aplicativos") é o que a
              pessoa quer ver na hora — o `PUBLIC BOT` do portal do Discord. */}
          <div className="flex items-start justify-between gap-4 pt-1">
            <p className="min-w-0 text-text-sm text-text-subtle">
              Publicado, qualquer pessoa desta instância encontra o aplicativo em &ldquo;Descobrir
              aplicativos&rdquo; e pode adicioná-lo a um servidor onde tenha permissão. Privado, só você.
            </p>
            <Switch
              marcado={app.publico}
              aoMudar={(v) => void publicar(v)}
              desabilitado={publicando}
              rotulo="Publicar no diretório"
            />
          </div>
        </SecaoDoCartao>

        <SecaoDoCartao
          titulo="Token"
          resumo={
            app.tokenPrefixo
              ? `${app.tokenPrefixo}… · emitido em ${app.tokenCriadoEm ? dataCurta(app.tokenCriadoEm) : "—"}`
              : "Sem token em vigor"
          }
          aberta={abertas.has("token")}
          aoAlternar={() => alternar("token")}
        >
          <p className="text-text-sm text-text-subtle">
            Por segurança, o token só é visto <strong className="text-text-default">uma vez</strong>, quando
            é criado. Se você o perdeu, regenere — e lembre que isso derruba o bot que estiver usando o
            antigo.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-sm">
            <dt className="text-text-muted">Prefixo</dt>
            <dd className="font-mono text-text-default">
              {app.tokenPrefixo ? `${app.tokenPrefixo}…` : "sem token em vigor"}
            </dd>
            <dt className="text-text-muted">Emitido em</dt>
            <dd className="text-text-default">{app.tokenCriadoEm ? dataCompleta(app.tokenCriadoEm) : "—"}</dd>
          </dl>
          <p className="mt-2 text-text-xs text-text-muted">
            O prefixo identifica <strong>o bot</strong>, não o token: ele sai do id do usuário-bot e não muda
            quando você regenera. Quem distingue um token do outro é a data.
          </p>
          <Button
            variante="secundario"
            tamanho="sm"
            icone={<RefreshCw size={16} aria-hidden="true" />}
            onClick={aoRegenerar}
            className="mt-3 celular:h-[44px]"
          >
            Regenerar token
          </Button>
        </SecaoDoCartao>

        <SecaoDoCartao
          titulo="Servidores"
          resumo="Onde este aplicativo está instalado"
          navegar={aoVerServidores}
        />

        <div className="my-4 flex items-center justify-end gap-2">
          <Button
            variante="secundario"
            tamanho="sm"
            onClick={aoEditar}
            className="celular:h-[44px]"
          >
            Editar
          </Button>
          <Button
            variante="critico-secundario"
            tamanho="sm"
            onClick={aoApagar}
            className="shrink-0 celular:h-[44px]"
          >
            Apagar
          </Button>
        </div>
      </div>
    </li>
  );
}
