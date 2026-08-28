"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Volume2 } from "lucide-react";
import type { GuildChannelType } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { ChannelAccessList } from "@/components/modals/ChannelAccessModal";
import { RadioLinha, Rotulo, ToggleLinha } from "@/components/ui/controls";
import { useAuth } from "@/stores/auth";
import { useCanModerate, useGuilds } from "@/stores/guilds";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { useUI } from "@/stores/ui";

/** Tipos criáveis dentro de um servidor, com a descrição que o Discord mostra. */
const TIPOS: {
  valor: GuildChannelType;
  rotulo: string;
  descricao: string;
  icone: typeof Hash;
}[] = [
  {
    valor: "TEXT",
    rotulo: "Texto",
    descricao: "Envie mensagens, imagens, GIFs, emojis, opiniões e trocadilhos",
    icone: Hash,
  },
  {
    valor: "VOICE",
    rotulo: "Voz",
    descricao: "Converse por voz, vídeo e compartilhamento de tela",
    icone: Volume2,
  },
  {
    valor: "ANNOUNCEMENT",
    rotulo: "Anúncios",
    descricao: "Todo mundo lê, só a moderação publica",
    icone: Megaphone,
  },
];

/**
 * Criação de canal, na ordem do Discord: **tipo → nome → privacidade**.
 *
 * A categoria não é um campo: ela vem do "+" que foi clicado e aparece no
 * subtítulo. E a allowlist do canal privado não cabe aqui — o Discord cria o
 * canal primeiro e só então pergunta quem entra, que é o segundo passo deste
 * mesmo modal.
 */
export default function CreateChannelModal({
  categoryId = null,
}: {
  categoryId?: string | null;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);
  const create = useChannels((s) => s.create);
  const categoria = useCategories((s) => s.categories.find((c) => c.id === categoryId) ?? null);

  const [name, setName] = useState("");
  const [type, setType] = useState<GuildChannelType>("TEXT");
  const [isPrivate, setPrivate] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  /** id do canal recém-criado: enquanto for null estamos no primeiro passo. */
  const [criadoId, setCriadoId] = useState<string | null>(null);

  const anuncio = type === "ANNOUNCEMENT";
  const tipos = TIPOS.filter((t) => t.valor !== "ANNOUNCEMENT" || canModerate);

  async function submit() {
    if (!guildId || !name.trim() || saving) return;
    setSaving(true);
    // o `create` da store devolve só um booleano; comparar os ids de antes e
    // depois é o que dá o canal novo para o segundo passo
    const antes = new Set(useChannels.getState().channels.map((c) => c.id));
    const ok = await create(guildId, {
      name,
      type,
      isPrivate,
      readOnly,
      memberIds: [],
      categoryId,
    });
    setSaving(false);
    if (!ok) return;
    const novo = useChannels.getState().channels.find((c) => !antes.has(c.id));
    if (isPrivate && novo) {
      setCriadoId(novo.id);
      return;
    }
    closeModal();
  }

  if (criadoId) {
    return (
      <Dialog
        title="Adicionar membros ou cargos"
        description={`Quem você marcar consegue ver #${name.trim()}. Moderadores entram sempre.`}
        onClose={closeModal}
        footer={<PrimaryButton onClick={closeModal}>Concluir</PrimaryButton>}
      >
        <ChannelAccessList channelId={criadoId} />
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Criar canal"
      description={categoria ? `em ${categoria.name}` : undefined}
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton disabled={!name.trim() || saving} onClick={submit}>
            {saving ? "Criando…" : "Criar canal"}
          </PrimaryButton>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary">
          Tipo de canal
        </legend>
        <div className="flex flex-col gap-1">
          {tipos.map((option) => {
            const Icone = option.icone;
            return (
              <RadioLinha
                key={option.valor}
                name="tipo-de-canal"
                checked={type === option.valor}
                onChange={() => setType(option.valor)}
                titulo={option.rotulo}
                hint={option.descricao}
                icon={<Icone size={20} />}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <Rotulo htmlFor="novo-canal-nome">Nome do canal</Rotulo>
        <div className="flex h-10 items-center gap-1 rounded-[3px] bg-rail px-2.5">
          <span aria-hidden="true" className="shrink-0 text-txt-muted">
            {type === "VOICE" ? <Volume2 size={18} /> : "#"}
          </span>
          <input
            id="novo-canal-nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            maxLength={64}
            placeholder="novo-canal"
            className="min-w-0 flex-1 bg-transparent text-txt-normal outline-none placeholder:text-txt-muted"
          />
        </div>
      </div>

      {canModerate && !anuncio && (
        <div className="mt-4 border-t border-border pt-1">
          <ToggleLinha
            checked={isPrivate}
            onChange={setPrivate}
            icon={<Lock size={18} />}
            titulo="Canal privado"
            hint="Só os membros e cargos escolhidos conseguem ver este canal."
          />
          <ToggleLinha
            checked={readOnly}
            onChange={setReadOnly}
            icon={<Megaphone size={18} />}
            titulo="Somente leitura"
            hint="Todo mundo lê; só a moderação envia mensagens."
          />
        </div>
      )}
    </Dialog>
  );
}
