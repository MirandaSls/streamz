"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppDetalhe, TokenCriado } from "@streamz/shared";
import { Bot, Plus, Search } from "@/components/ui/icones";
import { Button, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { CartaoDoAplicativo } from "@/components/settings/aplicativos/CartaoDoAplicativo";
import { ComoApontarSeuBot } from "@/components/settings/aplicativos/ComoApontarSeuBot";
import { PainelDoToken } from "@/components/settings/aplicativos/PainelDoToken";
import { TelaDeCriar } from "@/components/settings/aplicativos/TelaDeCriar";
import { TelaDeEditar } from "@/components/settings/aplicativos/TelaDeEditar";
import { TelaDeServidores } from "@/components/settings/aplicativos/TelaDeServidores";
import {
  CaixaDeApresentacao,
  CartaoEsqueleto,
  ErroComNovaTentativa,
  MensagemDeAjuda,
} from "@/components/settings/aplicativos/pecas";

/**
 * "Configurações → Aplicativos": o portal do desenvolvedor do Streamz (F4,
 * lote A), no desenho da aba **Authorized Apps** do Discord (cartão
 * 6l-aplicativos-usuario, onda 6).
 *
 * **Por que essa régua.** No Discord, "aplicativos" nas configurações de
 * usuário é a lista dos apps que a pessoa autorizou; os apps que ela *criou*
 * moram no portal web. O Streamz não tem autorização OAuth de terceiros — a
 * aba sempre foi a dos apps criados —, então a forma vem da aba do cliente (é
 * ela que fica ao lado de Dispositivos, na mesma janela) e o conteúdo é o do
 * portal. Nada do fluxo de autorizar/desautorizar foi inventado.
 *
 * Ordem da página, de cima para baixo, como no catálogo
 * (`suporte/imagens/announcements/40758571676951-…/11.png`, ÷2 — ver
 * `aplicativos/pecas.tsx`):
 * 1. caixa de apresentação (a "Applications"), com o "Criar aplicativo";
 * 2. **40** até a busca (y 400–479 = 80px);
 * 3. busca de **44** de altura (y 480–567 = 88px, borda incluída; o `sm`/`md`
 *    do `TextInput` são 32/40, por isso o número); texto 16px ("S" 22px) —
 *    `.searchContainer{margin-bottom:16px}` até o primeiro cartão;
 * 4. os cartões, 16 entre eles (`.authedAppV2{margin-bottom:16px}`).
 * A seção "Como apontar seu bot" vem depois, e não tem par no Discord.
 *
 * As subtelas (criar, editar, servidores) são estado local e não rota: a aba
 * vive dentro do modal de configurações, que no celular já é mestre-detalhe
 * (`JanelaDeConfiguracoes`). Navegação de verdade aqui dentro daria três
 * camadas de "voltar" para a mesma tela.
 *
 * Estados da lista: **carregando** (dois cartões-esqueleto na altura real);
 * **erro** ao carregar (mensagem de ajuda de erro com "Tentar de novo" — antes
 * a tela ficava em "Carregando…" para sempre, porque `apps` continuava `null`);
 * **vazio** (o `.emptyState{min-height:200px}` do módulo do Discord, centrado,
 * com o convite a criar); **busca sem resultado**; **erro de ação** (apagar,
 * regenerar, publicar) numa mensagem acima da lista, que não apaga a lista.
 * **Sem permissão** não existe na lista: `GET /applications` só filtra pelo
 * dono do token; o 403 ("este aplicativo não é seu") só aparece numa ação
 * sobre um app que mudou de mãos, e cai no erro de ação. Hover, foco e
 * desabilitado vêm dos primitivos (`Button`, `BotaoDeIcone`, `Switch`,
 * `TextInput`) e do `:focus-visible` global.
 *
 * **O token em claro** existe uma vez, na resposta de criar ou de regenerar:
 * fica em `useState` deste componente, some quando o painel fecha, e não passa
 * por store, `localStorage` nem log. Fora dele a tela mostra só `tokenPrefixo`
 * (8 caracteres, que identificam **o bot** e não mudam ao regenerar) e
 * `tokenCriadoEm` — é a data que distingue um token do outro.
 */

/** Qual das telas está à mostra. */
type Tela =
  | { nome: "lista" }
  | { nome: "criar" }
  | { nome: "editar"; id: string }
  | { nome: "servidores"; id: string };

export default function AplicativosTab() {
  const [apps, setApps] = useState<AppDetalhe[] | null>(null);
  /** falha ao carregar a lista (sem lista para mostrar). */
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null);
  /** falha de uma ação sobre a lista já carregada. */
  const [erroDeAcao, setErroDeAcao] = useState<string | null>(null);
  const [tela, setTela] = useState<Tela>({ nome: "lista" });
  const [busca, setBusca] = useState("");

  /**
   * O token em claro, e o nome do aplicativo a que ele pertence.
   *
   * Estado local, deliberadamente: uma store sobreviveria à aba fechada e um
   * `localStorage` sobreviveria ao navegador fechado. Aqui, trocar de tela já
   * o apaga.
   */
  const [token, setToken] = useState<{ nomeDoApp: string; token: TokenCriado } | null>(null);

  const carregar = useCallback(async () => {
    setErroAoCarregar(null);
    try {
      setApps(await api.meusApps());
    } catch (e) {
      setErroAoCarregar(errorMessage(e, "Não foi possível carregar os seus aplicativos"));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const emFoco =
    tela.nome === "editar" || tela.nome === "servidores" ? (apps?.find((a) => a.id === tela.id) ?? null) : null;

  // o app sumiu (apagado em outra aba do navegador, recarga): volta para a lista
  // em vez de deixar a aba em branco
  useEffect(() => {
    if ((tela.nome === "editar" || tela.nome === "servidores") && apps && !emFoco) {
      setTela({ nome: "lista" });
    }
  }, [tela, apps, emFoco]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (!apps || !q) return apps;
    return apps.filter((a) => a.name.toLocaleLowerCase("pt-BR").includes(q));
  }, [apps, busca]);

  function voltarParaALista() {
    setToken(null);
    setTela({ nome: "lista" });
  }

  // ── criar ────────────────────────────────────────────────
  async function criar(nome: string) {
    const criado = await api.criarApp(nome);
    setApps((atuais) => [criado.app, ...(atuais ?? [])]);
    // o painel do token vem por cima da lista: fechar o painel é voltar para ela
    setBusca("");
    setTela({ nome: "lista" });
    setToken({ nomeDoApp: criado.app.name, token: criado.token });
  }

  // ── regenerar ────────────────────────────────────────────
  /**
   * Confirmação **dupla**, porque o efeito é imediato e não tem desfazer: um
   * `confirm` com o aviso, e depois um `prompt` que exige digitar o nome do
   * aplicativo — é o mesmo par que apagar um servidor usa.
   */
  async function regenerar(app: AppDetalhe) {
    const certeza = await ui.confirm({
      title: `Regenerar o token de ${app.name}?`,
      message:
        "O bot atual vai parar de funcionar na hora: o token que ele usa é revogado " +
        "assim que o novo é emitido. O token novo aparece uma única vez.",
      confirmLabel: "Continuar",
      danger: true,
    });
    if (!certeza) return;

    const digitado = await ui.prompt({
      title: "Confirme o nome do aplicativo",
      message: "Para evitar derrubar o bot errado, digite o nome dele.",
      label: "Nome do aplicativo",
      placeholder: app.name,
      confirmLabel: "Regenerar token",
      danger: true,
    });
    if (digitado?.trim() !== app.name) return;

    setErroDeAcao(null);
    try {
      const novo = await api.regenerarTokenDoApp(app.id);
      setToken({ nomeDoApp: app.name, token: novo });
      setTela({ nome: "lista" });
      await carregar();
    } catch (e) {
      setErroDeAcao(errorMessage(e, "Não foi possível regenerar o token"));
    }
  }

  // ── apagar ───────────────────────────────────────────────
  async function apagar(app: AppDetalhe) {
    const certeza = await ui.confirm({
      title: `Apagar ${app.name}?`,
      message:
        "O aplicativo, o usuário-bot e o token somem para sempre, e o bot sai de " +
        "todos os servidores onde estiver instalado. Não dá para desfazer.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!certeza) return;
    setErroDeAcao(null);
    try {
      await api.apagarApp(app.id);
      setApps((atuais) => (atuais ?? []).filter((a) => a.id !== app.id));
      voltarParaALista();
    } catch (e) {
      setErroDeAcao(errorMessage(e, "Não foi possível apagar o aplicativo"));
    }
  }

  // ── publicar ─────────────────────────────────────────────
  async function publicar(app: AppDetalhe, valor: boolean) {
    setErroDeAcao(null);
    try {
      trocar(await api.editarApp(app.id, { publico: valor }));
    } catch (e) {
      setErroDeAcao(errorMessage(e, "Não foi possível mudar a visibilidade"));
    }
  }

  /** Troca o app da lista pelo que a API devolveu, sem recarregar tudo. */
  function trocar(app: AppDetalhe) {
    setApps((atuais) => (atuais ?? []).map((a) => (a.id === app.id ? app : a)));
  }

  if (tela.nome === "criar") {
    return <TelaDeCriar aoVoltar={voltarParaALista} aoCriar={criar} />;
  }
  if (emFoco && tela.nome === "editar") {
    // `key`: trocar de app remonta o formulário com os valores do outro
    return <TelaDeEditar key={emFoco.id} app={emFoco} aoVoltar={voltarParaALista} aoTrocar={trocar} />;
  }
  if (emFoco && tela.nome === "servidores") {
    return <TelaDeServidores app={emFoco} aoVoltar={voltarParaALista} />;
  }

  return (
    <>
      <section data-secao="meus" className="mb-10 scroll-mt-4">
        <CaixaDeApresentacao
          titulo="Meus aplicativos"
          acao={
            <Button
              variante="primario"
              tamanho="sm"
              icone={<Plus size={16} aria-hidden="true" />}
              onClick={() => setTela({ nome: "criar" })}
              className="celular:h-[44px] celular:w-full"
            >
              Criar aplicativo
            </Button>
          }
        >
          Um aplicativo é o registro de um bot nesta instância: ele ganha uma conta própria, um token e
          um lugar em &ldquo;Descobrir aplicativos&rdquo; quando você quiser.
        </CaixaDeApresentacao>

        {token ? (
          <div className="mt-4">
            <PainelDoToken nomeDoApp={token.nomeDoApp} token={token.token} aoFechar={() => setToken(null)} />
          </div>
        ) : null}

        {erroDeAcao ? (
          <div className="mt-4">
            <MensagemDeAjuda tom="erro">{erroDeAcao}</MensagemDeAjuda>
          </div>
        ) : null}

        <div className="mt-10">
          {apps === null ? (
            erroAoCarregar ? (
              <ErroComNovaTentativa mensagem={erroAoCarregar} tentar={() => void carregar()} />
            ) : (
              <div aria-busy="true" aria-label="Carregando aplicativos">
                <CartaoEsqueleto />
                <CartaoEsqueleto />
              </div>
            )
          ) : apps.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg bg-background-mod-subtle p-4 text-center">
              <Bot size={40} aria-hidden="true" className="text-icon-muted" />
              <p className="text-text-md font-semibold text-text-strong">Nenhum aplicativo ainda</p>
              <p className="text-text-sm text-text-subtle">
                Crie o primeiro para ganhar um token e colocar seu bot para rodar aqui.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <TextInput
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aoLimpar={() => setBusca("")}
                  placeholder="Buscar aplicativos"
                  aria-label="Buscar aplicativos"
                  tamanho={44}
                  prefixo={<Search size={16} aria-hidden="true" className="shrink-0 text-icon-muted" />}
                />
              </div>
              {filtrados && filtrados.length > 0 ? (
                <ul>
                  {filtrados.map((app) => (
                    <CartaoDoAplicativo
                      key={app.id}
                      app={app}
                      aoEditar={() => setTela({ nome: "editar", id: app.id })}
                      aoVerServidores={() => setTela({ nome: "servidores", id: app.id })}
                      aoRegenerar={() => void regenerar(app)}
                      aoApagar={() => void apagar(app)}
                      aoPublicar={(v) => publicar(app, v)}
                    />
                  ))}
                </ul>
              ) : (
                <p role="status" className="py-8 text-center text-text-sm text-text-muted">
                  Nenhum aplicativo com &ldquo;{busca.trim()}&rdquo;.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <ComoApontarSeuBot />
    </>
  );
}
