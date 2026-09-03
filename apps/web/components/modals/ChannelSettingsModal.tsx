"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Shield, Trash2, Volume2 } from "@/components/ui/icones";
import { MAX_CHANNEL_TOPIC, SLOWMODE_PRESETS, slowmodeLabel, type Channel } from "@streamz/shared";
import { ChannelAccessList } from "@/components/modals/ChannelAccessModal";
import JanelaDeConfiguracoes, { ItemPerigo, type ItemDeMenu } from "@/components/ui/JanelaDeConfiguracoes";
import { Rotulo, SliderMarcas, ToggleLinha } from "@/components/ui/controls";
import { RegistrarAlteracoes, useControleDeAlteracoes } from "@/components/ui/alteracoes";
import { useChannels, type UpdateChannelInput } from "@/stores/channels";
import { useUI } from "@/stores/ui";

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
 */
export default function ChannelSettingsModal({
  channelId,
  tab = "geral",
}: {
  channelId: string;
  tab?: "geral" | "permissoes";
}) {
  const closeModal = useUI((s) => s.closeModal);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));
  const update = useChannels((s) => s.update);
  const remove = useChannels((s) => s.remove);

  const [aba, setAba] = useState<Aba>(tab);
  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [slowmode, setSlowmode] = useState(channel?.slowmodeSeconds ?? 0);
  const [nsfw, setNsfw] = useState(channel?.nsfw ?? false);
  const [readOnly, setReadOnly] = useState(channel?.readOnly ?? false);
  const [isPrivate, setPrivate] = useState(channel?.private ?? false);
  const [saving, setSaving] = useState(false);
  const alteracoes = useControleDeAlteracoes();

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

  const itens: ItemDeMenu[] = [
    { id: "geral", label: ROTULO.geral, icon: iconeDoCanal(channel) },
    { id: "permissoes", label: ROTULO.permissoes, icon: <Shield size={18} aria-hidden="true" /> },
  ];

  const paradaAtual = Math.max(
    0,
    PARADAS.findIndex((p) => p.valor === slowmode),
  );

  const nomeExibido = `${voz ? "" : "#"}${channel.name ?? "canal"}`;

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
            <input
              id="canal-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none"
            />
          </div>

          {!voz && (
            <div>
              <Rotulo htmlFor="canal-topico" contador={`${topic.length}/${MAX_CHANNEL_TOPIC}`}>
                Tópico do canal
              </Rotulo>
              <textarea
                id="canal-topico"
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, MAX_CHANNEL_TOPIC))}
                rows={3}
                placeholder="Sobre o que é este canal?"
                className="w-full resize-none rounded-[3px] bg-rail px-2.5 py-2 text-txt-normal outline-none placeholder:text-txt-muted"
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
            <div className="border-t border-border pt-1">
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
            <p className="rounded-[4px] bg-panel px-3 py-2 text-xs text-txt-muted">
              Canal de anúncios: só a moderação publica. Seguir o canal em outro servidor ainda não
              está disponível.
            </p>
          )}
        </div>
      )}

      {aba === "permissoes" && (
        <div className="space-y-6">
          <div className="border-b border-border pb-1">
            <ToggleLinha
              checked={isPrivate}
              onChange={setPrivate}
              icon={<Lock size={18} />}
              titulo="Canal privado"
              hint="Só moderadores e os membros marcados abaixo enxergam o canal."
            />
          </div>

          <div>
            <Rotulo>Membros com acesso</Rotulo>
            <ChannelAccessList channelId={channelId} />
            <p className="mt-2 text-xs text-txt-muted">
              A marcação vale na hora — não depende do botão salvar.
            </p>
          </div>
        </div>
      )}
    </JanelaDeConfiguracoes>
  );
}
