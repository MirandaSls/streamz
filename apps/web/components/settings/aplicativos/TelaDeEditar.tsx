"use client";

import { useId, useRef, useState } from "react";
import {
  ACCEPT_IMAGEM_DE_PERFIL,
  MAX_APP_DESCRIPTION,
  MAX_APP_NAME,
  PERMISSION_INFO,
  PERMISSION_ORDER,
  Permission,
  appCriarSchema,
  hasPermission,
  type AppDetalhe,
} from "@streamz/shared";
import { Image as ImagemIcone } from "@/components/ui/icones";
import { Section } from "@/components/ui/controls";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import { Button, Campo, LinhaDeControle, Switch, TextArea, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { IconeDoApp, MensagemDeAjuda, TituloDaTela, Voltar } from "./pecas";

/**
 * Editar aplicativo: ícone, nome, descrição e permissões sugeridas.
 *
 * Visibilidade, token, servidores e apagar saíram daqui para o cartão da
 * lista (`CartaoDoAplicativo`), que é onde o Discord põe as ações de um app na
 * aba dele. O que sobra é formulário, e formulário de configuração no Discord
 * **não tem botão Salvar por bloco**: acumula e mostra a barra flutuante de
 * "alterações não salvas" — por isso `useAlteracoesNaoSalvas`, a mesma barra
 * de Perfil e Minha conta (`ui/alteracoes.tsx`), que o shell desenha e que
 * barra trocar de aba ou fechar a janela com pendência.
 *
 * O "Voltar" daqui é navegação **interna** da aba, que o shell não enxerga;
 * com pendência ele pergunta antes de descartar, em vez de perder o que foi
 * digitado em silêncio (a barra do shell só sacode na saída que ele controla).
 *
 * Ícone: o upload salva sozinho (não entra na barra), como o avatar em Perfil.
 * 503 da API é armazenamento de arquivos desligado nesta instância — o botão
 * fica desabilitado com o motivo, em vez de falhar a cada tentativa.
 *
 * Permissões: agrupadas por `PERMISSION_INFO[n].group`, na ordem de
 * `PERMISSION_ORDER`, em `Section` + `LinhaDeControle` com `Switch` — o mesmo
 * desenho da aba Cargos (`server/CargosTab.tsx`), que é onde o Discord mostra
 * interruptor por permissão. Medidas: as dos primitivos.
 */
export function TelaDeEditar({
  app,
  aoVoltar,
  aoTrocar,
}: {
  app: AppDetalhe;
  aoVoltar: () => void;
  aoTrocar: (app: AppDetalhe) => void;
}) {
  const idNome = useId();
  const idDescricao = useId();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(app.name);
  const [descricao, setDescricao] = useState(app.description ?? "");
  const [permissoes, setPermissoes] = useState(app.permissoesPadrao);
  const [enviandoIcone, setEnviandoIcone] = useState(false);
  const [semArmazenamento, setSemArmazenamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nomeValido = nome.trim().length > 0 && appCriarSchema.safeParse({ name: nome }).success;
  const sujo =
    nome.trim() !== app.name ||
    descricao.trim() !== (app.description ?? "") ||
    permissoes !== app.permissoesPadrao;

  function redefinir() {
    setNome(app.name);
    setDescricao(app.description ?? "");
    setPermissoes(app.permissoesPadrao);
  }

  useAlteracoesNaoSalvas({
    dirty: sujo,
    salvar: async () => {
      if (!nomeValido) {
        ui.toast("O nome do aplicativo não pode ficar vazio.", "error");
        return;
      }
      try {
        aoTrocar(
          await api.editarApp(app.id, {
            name: nome.trim(),
            description: descricao.trim() || null,
            permissoesPadrao: permissoes,
          }),
        );
        // o `app` novo chega por props; o formulário passa a bater com ele
        setNome(nome.trim());
        setDescricao(descricao.trim());
        ui.toast("Aplicativo salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar o aplicativo"), "error");
      }
    },
    redefinir,
  });

  async function voltar() {
    if (sujo) {
      const descartar = await ui.confirm({
        title: "Descartar as alterações?",
        message: "Nome, descrição e permissões voltam ao que estava salvo.",
        confirmLabel: "Descartar",
        danger: true,
      });
      if (!descartar) return;
    }
    aoVoltar();
  }

  async function enviarIcone(arquivo: File) {
    setEnviandoIcone(true);
    setErro(null);
    try {
      aoTrocar(await api.atualizarIconeDoApp(app.id, arquivo));
    } catch (e) {
      if (isApiError(e, 503)) setSemArmazenamento(true);
      setErro(errorMessage(e, "Não foi possível enviar o ícone"));
    } finally {
      setEnviandoIcone(false);
    }
  }

  async function removerIcone() {
    setEnviandoIcone(true);
    setErro(null);
    try {
      aoTrocar(await api.removerIconeDoApp(app.id));
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível remover o ícone"));
    } finally {
      setEnviandoIcone(false);
    }
  }

  return (
    <div>
      <Voltar onClick={() => void voltar()}>Aplicativos</Voltar>
      <TituloDaTela>{app.name}</TituloDaTela>
      <p className="mt-1 truncate text-text-sm text-text-subtle">
        @{app.botUser.username} · {app.publico ? "Publicado" : "Privado"}
      </p>

      {erro ? (
        <div className="mt-4">
          <MensagemDeAjuda tom="erro">{erro}</MensagemDeAjuda>
        </div>
      ) : null}

      <div className="mt-6">
        <Section title="Ícone">
          <div className="flex flex-wrap items-center gap-4">
            <IconeDoApp app={app} tamanho={80} />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <input
                ref={arquivoRef}
                type="file"
                accept={ACCEPT_IMAGEM_DE_PERFIL}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void enviarIcone(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variante="secundario"
                  tamanho="sm"
                  icone={<ImagemIcone size={16} aria-hidden="true" />}
                  disabled={semArmazenamento}
                  carregando={enviandoIcone}
                  onClick={() => arquivoRef.current?.click()}
                  className="celular:h-[44px]"
                >
                  {app.iconUrl ? "Trocar ícone" : "Escolher ícone"}
                </Button>
                {app.iconUrl ? (
                  <Button
                    variante="critico-link"
                    disabled={enviandoIcone}
                    onClick={() => void removerIcone()}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
              <p className="text-text-xs text-text-muted">
                {semArmazenamento
                  ? "Envio de arquivos desligado nesta instância."
                  : "Sem ícone, a lista usa a inicial do nome. PNG, JPEG, GIF ou WebP, até 4 MB."}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Informações gerais">
          <Campo
            rotulo="Nome"
            htmlFor={idNome}
            obrigatorio
            erro={nomeValido ? null : "O nome não pode ficar vazio."}
            ajuda={`${nome.trim().length}/${MAX_APP_NAME}`}
          >
            <TextInput
              id={idNome}
              value={nome}
              maxLength={MAX_APP_NAME}
              erro={!nomeValido}
              onChange={(e) => setNome(e.target.value)}
            />
          </Campo>

          <Campo
            rotulo="Descrição"
            htmlFor={idDescricao}
            descricao="A linha que aparece no cartão de “Descobrir aplicativos”."
            className="mt-6"
          >
            <TextArea
              id={idDescricao}
              value={descricao}
              rows={3}
              maxLength={MAX_APP_DESCRIPTION}
              contador
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>
        </Section>

        <EditorDePermissoesSugeridas valor={permissoes} aoMudar={setPermissoes} />
      </div>
    </div>
  );
}

const GRUPOS: { id: "geral" | "membros" | "mensagens" | "voz"; label: string }[] = [
  { id: "geral", label: "Permissões gerais do servidor" },
  { id: "membros", label: "Permissões de membro" },
  { id: "mensagens", label: "Permissões de texto" },
  { id: "voz", label: "Permissões de voz" },
];

/**
 * As permissões que a tela de instalação vem com marcadas. Não concedem nada:
 * quem instala pode desmarcar, e a API recusa o que a pessoa não tem.
 *
 * Agrupadas como no `CargosTab` (campo `group`), e não por
 * `secoesDePermissoes(escopo)`, que é do editor de overrides de canal: o cargo
 * gerenciado de um app é de servidor, sem escopo de canal.
 */
function EditorDePermissoesSugeridas({ valor, aoMudar }: { valor: number; aoMudar: (v: number) => void }) {
  const ids = useId();
  const grupos = GRUPOS.map((g) => ({
    ...g,
    nomes: PERMISSION_ORDER.filter((n) => PERMISSION_INFO[n].group === g.id),
  })).filter((g) => g.nomes.length > 0);

  return (
    <>
      <p className="mb-4 text-text-sm text-text-subtle">
        <strong className="font-semibold text-text-default">Permissões sugeridas:</strong> o que vem
        pré-marcado na tela de instalação. Não concede nada — quem instala pode desmarcar, e a API recusa
        o que a pessoa não tem.
      </p>
      {grupos.map((grupo, i) => (
        <Section key={grupo.id} title={grupo.label} semDivisoria={i === grupos.length - 1}>
          {grupo.nomes.map((nome) => {
            const id = `${ids}-${nome}`;
            const marcado = hasPermission(valor, Permission[nome]);
            return (
              <LinhaDeControle
                key={nome}
                htmlFor={id}
                rotulo={PERMISSION_INFO[nome].label}
                descricao={PERMISSION_INFO[nome].description}
                controle={
                  <Switch
                    id={id}
                    marcado={marcado}
                    aoMudar={(v) => aoMudar(v ? valor | Permission[nome] : valor & ~Permission[nome])}
                  />
                }
              />
            );
          })}
        </Section>
      ))}
    </>
  );
}
