"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Volume2 } from "@/components/ui/icones";
import { Permission, type Channel, type GuildChannelType } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { ChannelAccessList } from "@/components/modals/ChannelAccessModal";
import { RadioLinha, Rotulo, ToggleLinha } from "@/components/ui/controls";
import { TextInput } from "@/components/ui/primitivos";
import { useGuilds } from "@/stores/guilds";
import { useCan } from "@/stores/permissions";
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
 *
 * `tipo` é o mesmo raciocínio aplicado ao tipo: o "+" de "Canais de Voz" já
 * decidiu que o canal é de voz, e abrir o modal em "Texto" faria a pessoa
 * corrigir a escolha que ela acabou de fazer. Vem `undefined` do "+" de uma
 * categoria de verdade (que aceita os dois) e do "Criar canal" do menu do
 * servidor — aí a pergunta continua de pé, começando em Texto.
 */
export default function CreateChannelModal({
  categoryId = null,
  tipo,
}: {
  categoryId?: string | null;
  tipo?: GuildChannelType;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  // a mesma permissão que a API exige em `channels.service` (MANAGE_CHANNELS):
  // o antigo `canModerate` deixava passar quem só expulsa membros, e o POST dava 403
  const podeGerenciarCanais = useCan(Permission.MANAGE_CHANNELS);
  const create = useChannels((s) => s.create);
  // `select` abre a **vista** do canal sem entrar na call: quem conecta é o
  // `connect` da store de voz, e ele não é chamado aqui (ver `abrirCanalNovo`)
  const select = useChannels((s) => s.select);
  const expandirCategoria = useCategories((s) => s.expandir);
  const categoria = useCategories((s) => s.categories.find((c) => c.id === categoryId) ?? null);

  const [name, setName] = useState("");
  const [type, setType] = useState<GuildChannelType>(tipo ?? "TEXT");
  const [isPrivate, setPrivate] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  /** id do canal recém-criado: enquanto for null estamos no primeiro passo. */
  const [criadoId, setCriadoId] = useState<string | null>(null);

  const anuncio = type === "ANNOUNCEMENT";
  const tipos = TIPOS.filter((t) => t.valor !== "ANNOUNCEMENT" || podeGerenciarCanais);

  /**
   * Depois de criar, vai para o canal — como no Discord.
   *
   * Sem isto o canal novo era criado **e não aparecia**: se a categoria de
   * destino estava recolhida, ele nascia escondido dentro dela e dava a
   * impressão de que a criação falhara. Então duas coisas, nesta ordem: abrir a
   * categoria (`expandir`, que não fecha a que já está aberta) e selecionar o
   * canal.
   *
   * `select` serve aos dois tipos. Em canal de voz ele monta a vista da sala
   * (só define `voiceChannelId`) — **não entra na call**: quem conecta é o
   * `connect` da store de voz, e ninguém o chama a partir daqui. É a mesma
   * chamada que o balão de conversa do canal de voz faz na barra lateral.
   */
  function abrirCanalNovo(novo: Channel) {
    if (novo.categoryId) expandirCategoria(novo.categoryId);
    select(novo);
  }

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
    // navega para o canal novo mesmo no caso privado: o segundo passo continua
    // por cima, e ao fechá-lo a pessoa já cai dentro do canal que acabou de criar
    if (novo) abrirCanalNovo(novo);
    if (isPrivate && novo) {
      setCriadoId(novo.id);
      return;
    }
    closeModal();
  }

  if (criadoId) {
    return (
      <Dialog
        telaCheiaNoCelular
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
      telaCheiaNoCelular
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
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
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
        <TextInput
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
          prefixo={
            <span aria-hidden="true" className="shrink-0 text-text-muted">
              {type === "VOICE" ? <Volume2 size={18} /> : "#"}
            </span>
          }
        />
      </div>

      {podeGerenciarCanais && !anuncio && (
        <div className="mt-4 border-t border-border-subtle pt-1">
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
