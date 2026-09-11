"use client";

import { useEffect, useState } from "react";
import { Hash, Lock, Megaphone, Shield, Trash2, Volume2 } from "@/components/ui/icones";
import {
  MAX_CHANNEL_TOPIC,
  SLOWMODE_PRESETS,
  overridesEfetivos,
  slowmodeLabel,
  type Channel,
  type EscopoDePermissao,
  type PermissionOverwrite,
} from "@streamz/shared";
import EditorDePermissoes from "@/components/permissoes/EditorDePermissoes";
import JanelaDeConfiguracoes, { ItemPerigo, type ItemDeMenu } from "@/components/ui/JanelaDeConfiguracoes";
import { Rotulo, SliderMarcas, ToggleLinha } from "@/components/ui/controls";
import { Button, TextArea, TextInput } from "@/components/ui/primitivos";
import { RegistrarAlteracoes, useControleDeAlteracoes } from "@/components/ui/alteracoes";
import { api } from "@/lib/api";
import { useChannels, type UpdateChannelInput } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useCategoryOverrides, useChannelOverrides, usePermissions } from "@/stores/permissions";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

type Aba = "geral" | "permissoes";

const ROTULO: Record<Aba, string> = {
  geral: "Visão geral",
  permissoes: "Permissões",
};

/** Ícone do canal na barra lateral, para a tela não parecer genérica. */
function iconeDoCanal(channel: Channel) {
  if (channel.type === "VOICE") return <Volume2 size={18} aria-hidden="true" />;
  if (channel.type === "ANNOUNCEMENT") return <Megaphone size={18} aria-hidden="true" />;
  if (channel.private) return <Lock size={18} aria-hidden="true" />;
  return <Hash size={18} aria-hidden="true" />;
}

/**
 * Que lista de permissões esta tela oferece.
 *
 * Canal de anúncios conta como texto: o que muda nele é quem pode postar, não
 * o vocabulário de permissões — oferecer "Falar" ali seria caixinha inerte.
 */
function escopoDoCanal(channel: Channel): EscopoDePermissao {
  return channel.type === "VOICE" ? "voz" : "texto";
}

/** Paradas do modo lento com o rótulo humano do contrato. */
const PARADAS = SLOWMODE_PRESETS.map((s) => ({ valor: s, label: slowmodeLabel(s) }));

/**
 * Configurações do canal — **tela cheia**, como no Discord.
 *
 * Não é um `Dialog`: as configurações de canal usam a mesma moldura das de
 * servidor e de usuário (barra lateral com o nome do canal, conteúdo centrado,
 * botão ESC redondo). O nome do canal é o cabeçalho da barra; o `<h1>` é o nome
 * da aba.
 *
 * O formulário é local até salvar, e é a barra de "alterações não salvas" que
 * aparece quando há o que gravar — trocar de aba não perde o que foi digitado.
 *
 * A aba "Permissões" é a exceção a esse "local até salvar": lá cada clique
 * grava. Ver `EditorDePermissoes` — só o interruptor de "canal privado", que é
 * campo do canal e não regra, continua passando pela barra.
 */
export default function ChannelSettingsModal({
  channelId,
  tab = "geral",
}: {
  channelId: string;
  tab?: "geral" | "permissoes";
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));
  const update = useChannels((s) => s.update);
  const remove = useChannels((s) => s.remove);
  const handleChannelUpdated = useChannels((s) => s.handleUpdated);
  const handleOverrides = usePermissions((s) => s.handleOverrides);
  const overrides = useChannelOverrides(channelId);
  const daCategoria = useCategoryOverrides(channel?.categoryId ?? null);

  const [aba, setAba] = useState<Aba>(tab);
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmodeSeconds ?? 0);
  const [nsfw, setNsfw] = useState(channel?.nsfw ?? false);
  const [readOnly, setReadOnly] = useState(channel?.readOnly ?? false);
  const [isPrivate, setPrivate] = useState(channel?.private ?? false);
  const [saving, setSaving] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const alteracoes = useControleDeAlteracoes();

  /**
   * Recarrega as regras deste canal ao abrir a tela.
   *
   * A store já traz as do servidor inteiro, mas de quando o servidor foi
   * aberto; quem chega aqui vai editar, e editar em cima de uma cópia velha é
   * como se apaga em silêncio a regra que outra pessoa acabou de criar.
   */
  useEffect(() => {
    if (!guildId) return;
    let vivo = true;
    void api
      .channelOverrides(guildId, channelId)
      .then((lista) => {
        if (vivo) handleOverrides(guildId, channelId, lista);
      })
      .catch(() => {
        // sem rede, segue com o que a store tem — melhor que uma lista vazia
      });
    return () => {
      vivo = false;
    };
  }, [guildId, channelId, handleOverrides]);

  if (!channel) return null;
  const voz = channel.type === "VOICE";
  const anuncio = channel.type === "ANNOUNCEMENT";

  const patch: UpdateChannelInput = {};
  if (name.trim() && name.trim() !== channel.name) patch.name = name.trim();
  if ((topic.trim() || null) !== channel.topic) patch.topic = topic.trim() || null;
  if (slowmode !== channel.slowmodeSeconds) patch.slowmodeSeconds = slowmode;
  if (nsfw !== channel.nsfw) patch.nsfw = nsfw;
  if (readOnly !== channel.readOnly) patch.readOnly = readOnly;
  if (isPrivate !== channel.private) patch.isPrivate = isPrivate;
  const dirty = Object.keys(patch).length > 0;

  function redefinir() {
    if (!channel) return;
    setName(channel.name ?? "");
    setTopic(channel.topic ?? "");
    setSlowmode(channel.slowmodeSeconds);
    setNsfw(channel.nsfw);
    setReadOnly(channel.readOnly);
    setPrivate(channel.private);
  }

  async function salvar() {
    if (!dirty || saving) return;
    setSaving(true);
    await update(channelId, patch);
    setSaving(false);
  }

  /**
   * Regra gravada na hora (o `PUT` devolve a lista inteira do canal).
   *
   * A resposta entra na store pelo mesmo `handleOverrides` do evento
   * `channel.overrides` do gateway: assim a tela não fica esperando o
   * websocket voltar para mostrar o que ela mesma acabou de mandar.
   */
  async function gravarRegra(o: PermissionOverwrite) {
    if (!guildId) return;
    try {
      handleOverrides(
        guildId,
        channelId,
        await api.setChannelOverride(guildId, channelId, {
          roleId: o.roleId,
          userId: o.userId,
          allow: o.allow,
          deny: o.deny,
        }),
      );
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar a regra"), "error");
    }
  }

  async function apagarRegra(targetId: string) {
    if (!guildId) return;
    try {
      handleOverrides(
        guildId,
        channelId,
        await api.removeChannelOverride(guildId, channelId, targetId),
      );
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover a regra"), "error");
    }
  }

  /** Devolve o canal às regras da categoria; a API responde com o canal novo. */
  async function sincronizar() {
    if (!guildId || sincronizando) return;
    setSincronizando(true);
    try {
      handleChannelUpdated(await api.syncChannelWithCategory(guildId, channelId));
      // as regras do canal foram apagadas lá: recarregar é o que faz a lista
      // desta tela parar de mostrar o que não vale mais
      handleOverrides(guildId, channelId, await api.channelOverrides(guildId, channelId));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível sincronizar com a categoria"), "error");
    } finally {
      setSincronizando(false);
    }
  }

  const itens: ItemDeMenu[] = [
    { id: "geral", label: ROTULO.geral, icon: iconeDoCanal(channel) },
    { id: "permissoes", label: ROTULO.permissoes, icon: <Shield size={18} aria-hidden="true" /> },
  ];

  const paradaAtual = Math.max(
    0,
    PARADAS.findIndex((p) => p.valor === slowmode),
  );

  const nomeExibido = `${voz ? "" : "#"}${channel.name ?? "canal"}`;

  /*
   * Canal sincronizado não tem regra própria: quem manda é a categoria, e é ela
   * que a tela precisa mostrar. Passar a lista do canal (vazia) faria a aba
   * dizer "nenhuma regra" logo abaixo do aviso que diz "as regras são as da
   * categoria" — e a primeira edição pareceria estar mudando o nada.
   */
  const regrasVisiveis: PermissionOverwrite[] = [
    ...overridesEfetivos<PermissionOverwrite>(channel.syncedWithCategory, overrides, daCategoria),
  ];

  return (
    <JanelaDeConfiguracoes
      titulo={nomeExibido}
      cabecalho={nomeExibido}
      grupos={[{ id: "canal", itens }]}
      abaId={aba}
      onAba={(id) => setAba(id as Aba)}
      tituloAba={ROTULO[aba]}
      controle={alteracoes}
      onClose={closeModal}
      rodapeMenu={
        <ItemPerigo
          icon={<Trash2 size={18} />}
          onClick={async () => {
            // o `remove` da store já pergunta antes; a tela só fecha se apagou
            await remove(channel);
            if (!useChannels.getState().channels.some((c) => c.id === channelId)) closeModal();
          }}
        >
          Apagar canal
        </ItemPerigo>
      }
    >
      <RegistrarAlteracoes dirty={dirty} salvar={salvar} redefinir={redefinir} />

      {aba === "geral" && (
        <div className="space-y-6">
          <div>
            <Rotulo htmlFor="canal-nome">Nome do canal</Rotulo>
            <TextInput
              id="canal-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
          </div>

          {!voz && (
            <div>
              <Rotulo htmlFor="canal-topico" contador={`${topic.length}/${MAX_CHANNEL_TOPIC}`}>
                Tópico do canal
              </Rotulo>
              <TextArea
                id="canal-topico"
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHANNEL_TOPIC))}
                rows={3}
                placeholder="Sobre o que é este canal?"
              />
            </div>
          )}

          {!voz && (
            <SliderMarcas
              legenda="Modo lento"
              opcoes={PARADAS}
              indice={paradaAtual}
              onChange={(i) => setSlowmode(PARADAS[i].valor)}
              hint="Membros só podem enviar uma mensagem a cada intervalo. Moderadores não são afetados."
            />
          )}

          {!voz && (
            <div className="border-t border-border-subtle pt-1">
              <ToggleLinha
                checked={nsfw}
                onChange={setNsfw}
                titulo="Canal com conteúdo sensível"
                hint="Quem abrir o canal vê um aviso e precisa confirmar a entrada."
              />
              {!anuncio && (
                <ToggleLinha
                  checked={readOnly}
                  onChange={setReadOnly}
                  titulo="Somente leitura"
                  hint="Só moderadores enviam mensagens."
                />
              )}
            </div>
          )}

          {anuncio && (
            <p className="rounded-[4px] bg-background-base-lowest px-3 py-2 text-xs text-text-muted">
              Canal de anúncios: só a moderação publica. Seguir o canal em outro servidor ainda não
              está disponível.
            </p>
          )}
        </div>
      )}

      {/*
        A allowlist de membros (`ChannelAccessList`) saiu daqui de propósito.
        Ela era uma segunda maneira de dizer a mesma coisa: "este membro vê o
        canal" é, no contrato, uma regra de usuário com `allow` de
        VIEW_CHANNEL — que o editor abaixo mostra e edita nativamente, junto
        das outras vinte permissões. Manter as duas telas significaria duas
        formas de gravar o mesmo dado, e a de cima calada sobre o que a de
        baixo fez. O `ChannelAccessModal` continua existindo como atalho do
        menu de contexto; quem quiser o quadro inteiro vem para cá.
      */}
      {aba === "permissoes" && guildId && (
        <EditorDePermissoes
          guildId={guildId}
          escopo={escopoDoCanal(channel)}
          privadoLabel="Canal privado"
          privadoDescricao="Ao tornar o canal privado, só os cargos e membros marcados aqui embaixo o enxergam. Moderadores continuam entrando."
          privado={isPrivate}
          onPrivado={setPrivate}
          overrides={regrasVisiveis}
          onSalvarRegra={gravarRegra}
          onRemoverRegra={apagarRegra}
          aviso={
            channel.categoryId ? (
              // no celular o aviso e o botão empilham: lado a lado, o texto
              // ficava em quatro linhas de ~250px ao lado de um botão largo
              <div className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-2 celular:flex-col celular:items-stretch celular:gap-2">
                <p className="min-w-0 text-xs text-text-muted">
                  {channel.syncedWithCategory
                    ? "Sincronizado com a categoria: as regras abaixo são as dela, e a primeira edição feita aqui desgruda o canal."
                    : "Este canal tem regras próprias — elas não seguem mais a categoria."}
                </p>
                {!channel.syncedWithCategory && (
                  <Button
                    variante="secundario"
                    tamanho="sm"
                    disabled={sincronizando}
                    onClick={() => void sincronizar()}
                    className="shrink-0 celular:h-[44px]"
                  >
                    {sincronizando ? "Sincronizando…" : "Sincronizar com a categoria"}
                  </Button>
                )}
              </div>
            ) : null
          }
        />
      )}
    </JanelaDeConfiguracoes>
  );
}
