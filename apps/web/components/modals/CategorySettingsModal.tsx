"use client";

import { useEffect, useState } from "react";
import {
  MAX_CATEGORY_NAME,
  Permission,
  comEstadoDaRegra,
  estadoDaRegra,
  type PermissionOverwrite,
} from "@streamz/shared";
import { Settings2, Shield, Trash2 } from "@/components/ui/icones";
import EditorDePermissoes from "@/components/permissoes/EditorDePermissoes";
import JanelaDeConfiguracoes, {
  ItemPerigo,
  type ItemDeMenu,
} from "@/components/ui/JanelaDeConfiguracoes";
import { Rotulo } from "@/components/ui/controls";
import { TextInput } from "@/components/ui/primitivos";
import { RegistrarAlteracoes, useControleDeAlteracoes } from "@/components/ui/alteracoes";
import { api } from "@/lib/api";
import { useCategories } from "@/stores/categories";
import { useEveryoneRole, useCategoryOverrides, usePermissions } from "@/stores/permissions";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

type Aba = "geral" | "permissoes";

const ROTULO: Record<Aba, string> = {
  geral: "Visão geral",
  permissoes: "Permissões",
};

/**
 * Configurações da categoria — a irmã de `ChannelSettingsModal`.
 *
 * Mesma moldura (`JanelaDeConfiguracoes`), mesmas duas abas, mesmo rodapé
 * vermelho. Ela existe porque a categoria passou a ter permissões próprias
 * (c-cargos): antes só dava para renomeá-la por um `prompt` do menu de
 * contexto, e um `prompt` não tem onde pôr uma tela de regras.
 *
 * Prints `docs/Reference/Captura de tela 2026-09-04 102238.png` (visão geral) e
 * `102249.png` (permissões).
 */
export default function CategorySettingsModal({
  categoryId,
  tab = "geral",
}: {
  categoryId: string;
  tab?: "geral" | "permissoes";
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  const category = useCategories((s) => s.categories.find((c) => c.id === categoryId));
  const removeCategory = useCategories((s) => s.remove);
  const handleUpdated = useCategories((s) => s.handleUpdated);
  const handleCategoryOverrides = usePermissions((s) => s.handleCategoryOverrides);
  const overrides = useCategoryOverrides(categoryId);
  const everyone = useEveryoneRole();

  const [aba, setAba] = useState<Aba>(tab);
  const [name, setName] = useState(category?.name ?? "");
  const alteracoes = useControleDeAlteracoes();

  /**
   * As regras já vêm no pacote que a store carrega ao entrar no servidor; esta
   * busca é só para o caso de outra pessoa ter mexido nelas desde então. Sem
   * ela a tela abriria mostrando o estado do momento em que o servidor foi
   * aberto, que pode ser de horas atrás.
   */
  useEffect(() => {
    if (!guildId) return;
    let vivo = true;
    void api
      .categoryOverrides(guildId, categoryId)
      .then((lista) => {
        if (vivo) handleCategoryOverrides({ guildId, categoryId, overrides: lista });
      })
      .catch(() => {
        // sem rede a tela segue com o que a store já tinha: é melhor mostrar o
        // conhecido do que uma lista vazia que parece "não há regra nenhuma"
      });
    return () => {
      vivo = false;
    };
  }, [guildId, categoryId, handleCategoryOverrides]);

  if (!category || !guildId) return null;

  const patchNome = name.trim() && name.trim() !== category.name ? name.trim() : null;
  const dirty = patchNome !== null;

  async function salvar() {
    if (!patchNome || !guildId) return;
    try {
      /*
       * Chama a API direto em vez de `useCategories().rename`: aquele abre um
       * `prompt` para pedir o nome, e aqui o nome já está no campo da aba. O
       * resultado entra na store pelo mesmo `handleUpdated` que o evento
       * `category.updated` do gateway usa — então o caminho é o mesmo, com ou
       * sem websocket de pé.
       */
      handleUpdated(await api.renameCategory(guildId, categoryId, patchNome));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível renomear a categoria"), "error");
    }
  }

  /**
   * "Categoria privada" é a regra do @everyone negando "Ver canais".
   *
   * Categoria não tem coluna `private` no contrato (ver `Category` em
   * `packages/shared/src/canais.ts`) — e nem precisa: privada **é** exatamente
   * isso, e derivar da regra evita duas fontes para o mesmo fato, que é como
   * nasce a tela que diz "privada" enquanto todo mundo continua entrando.
   */
  const regraDoEveryone = overrides.find((o) => o.roleId === everyone?.id);
  const privado = estadoDaRegra(regraDoEveryone, Permission.VIEW_CHANNEL) === "negar";

  async function gravarRegra(o: PermissionOverwrite) {
    if (!guildId) return;
    try {
      handleCategoryOverrides({
        guildId,
        categoryId,
        overrides: await api.setCategoryOverride(guildId, categoryId, {
          roleId: o.roleId,
          userId: o.userId,
          allow: o.allow,
          deny: o.deny,
        }),
      });
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar a regra"), "error");
    }
  }

  async function apagarRegra(targetId: string) {
    if (!guildId) return;
    try {
      handleCategoryOverrides({
        guildId,
        categoryId,
        overrides: await api.removeCategoryOverride(guildId, categoryId, targetId),
      });
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover a regra"), "error");
    }
  }

  const itens: ItemDeMenu[] = [
    // o vocabulário não tem pasta solta (só `FolderPlus`, que é "criar"), e
    // o canal usa o ícone do próprio tipo aqui — para a categoria o mais
    // próximo é o de ajustes
    { id: "geral", label: ROTULO.geral, icon: <Settings2 size={18} aria-hidden="true" /> },
    { id: "permissoes", label: ROTULO.permissoes, icon: <Shield size={18} aria-hidden="true" /> },
  ];

  return (
    <JanelaDeConfiguracoes
      titulo={`Configurações de ${category.name}`}
      // o shell já põe o cabeçalho em caixa-alta e apagado, como o nome da
      // categoria aparece na barra lateral — não vale repetir a formatação aqui
      cabecalho={category.name}
      grupos={[{ id: "categoria", itens }]}
      abaId={aba}
      onAba={(id) => setAba(id as Aba)}
      tituloAba={ROTULO[aba]}
      controle={alteracoes}
      onClose={closeModal}
      rodapeMenu={
        <ItemPerigo
          icon={<Trash2 size={18} />}
          onClick={async () => {
            // o `remove` da store já pergunta antes, como o de canal; a tela só
            // fecha se a categoria de fato saiu
            await removeCategory(guildId, category);
            if (!useCategories.getState().categories.some((c) => c.id === categoryId)) {
              closeModal();
            }
          }}
        >
          Excluir categoria
        </ItemPerigo>
      }
    >
      <RegistrarAlteracoes
        dirty={dirty}
        salvar={salvar}
        redefinir={() => setName(category.name)}
      />

      {aba === "geral" && (
        <div>
          <Rotulo htmlFor="categoria-nome">Nome da categoria</Rotulo>
          <TextInput
            id="categoria-nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_CATEGORY_NAME}
          />
        </div>
      )}

      {aba === "permissoes" && (
        <EditorDePermissoes
          guildId={guildId}
          escopo="categoria"
          privadoLabel="Categoria privada"
          privadoDescricao="Ao tornar a categoria privada, só os cargos e membros marcados aqui embaixo enxergam os canais dela. Os canais sincronizados com a categoria seguem esta configuração automaticamente."
          privado={privado}
          onPrivado={(v) =>
            void gravarRegra(
              comEstadoDaRegra(
                regraDoEveryone ?? {
                  roleId: everyone?.id ?? null,
                  userId: null,
                  allow: 0,
                  deny: 0,
                },
                Permission.VIEW_CHANNEL,
                v ? "negar" : "herdar",
              ),
            )
          }
          overrides={overrides}
          onSalvarRegra={gravarRegra}
          onRemoverRegra={apagarRegra}
        />
      )}
    </JanelaDeConfiguracoes>
  );
}
