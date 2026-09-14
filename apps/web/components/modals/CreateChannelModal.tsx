"use client";

import { useState } from "react";
import { Hash, Lock, Megaphone, Volume2 } from "@/components/ui/icones";
import { Permission, type Channel, type GuildChannelType } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { ChannelAccessList } from "@/components/modals/ChannelAccessModal";
import { RadioLinha, ToggleLinha } from "@/components/ui/controls";
import { Button, Campo, TextInput } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";
import { useGuilds } from "@/stores/guilds";
import { useCan } from "@/stores/permissions";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";

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
 * Altura de toque do rodapé no celular: mesmos 44px que `Dialog.tsx`
 * (`ALTURA_DE_TOQUE`) já documenta como o piso de toque contra os 40 do `md`
 * do Discord — este cartão não mede de novo, só repete o valor porque o
 * rodapé daqui usa `Button` direto (para o `carregando`/`erro` abaixo, ver a
 * função `submit`), não o `PrimaryButton`/`SecondaryButton` que já o aplicam
 * sozinhos.
 */
const ALTURA_DE_TOQUE = "!h-[44px]";

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
 *
 * **Fórum não entra.** O Discord tem um quarto tipo aqui; o Streamz não tem
 * fórum (nem o contrato em `packages/shared` — `GUILD_CHANNEL_TYPES` só lista
 * TEXT/VOICE/ANNOUNCEMENT). A regra do §6.6 pede a opção visível e desabilitada
 * com "(em breve)" para o que falta, mas isso exige um ícone de fórum em
 * `icones.tsx`, fora da lista deste cartão — ver "faltando".
 *
 * **Sem captura do diálogo real.** `referencias.json` marca
 * `modal-criar-canal` como lacuna (nenhum print 1:1 do formulário de criação,
 * só do resultado pós-criação). As medidas de espaçamento abaixo vêm do CSS
 * bruto do Discord para o padrão `RadioBar`/`radioGroupContainer`
 * (`radioGroupContainer__71ec0 { gap: var(--space-8) }`,
 * `docs/referencias-discord/tokens/css-bruto/sob-demanda/ceefc5c2d0e6b094.css`)
 * — a atribuição desse CSS a ESTE modal específico não é certa (a classe é
 * genérica, reaproveitada em outras telas), então fica registrado como medida
 * de origem incerta, não como confirmação de paridade.
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
  // `select` abre a **vista** do canal sem entrar na call: quem conecta é o
  // `connect` da store de voz, e ele não é chamado aqui (ver `abrirCanalNovo`)
  const select = useChannels((s) => s.select);
  const expandirCategoria = useCategories((s) => s.expandir);
  const categoria = useCategories((s) => s.categories.find((c) => c.id === categoryId) ?? null);
  const ehMobile = useEhMobile();

  const [name, setName] = useState("");
  const [type, setType] = useState<GuildChannelType>(tipo ?? "TEXT");
  const [isPrivate, setPrivate] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  // erro por campo, como `CriarServidorModal.tsx` (cartão 7a): o texto vem do
  // backend (nome duplicado, por exemplo) em vez de um aviso genérico, e some
  // assim que a pessoa mexe no nome de novo.
  const [erro, setErro] = useState<string | null>(null);
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

  /**
   * Chama a API direto, como `CriarServidorModal.tsx` — o `create` de
   * `stores/channels.ts` só devolve um booleano e já resolve o erro num toast,
   * e este cartão pede o estado de erro **dentro** da caixa (rótulo abaixo do
   * campo), não só um aviso que passa. `handleCreated` é a mesma função que o
   * evento de socket usa para inserir o canal na lista, então o estado fica
   * igual ao de antes (dedup por id incluído).
   */
  async function submit() {
    const nomeLimpo = name.trim();
    if (!guildId || !nomeLimpo || saving) return;
    setSaving(true);
    setErro(null);
    try {
      const novo = await api.createChannel(guildId, nomeLimpo, type, {
        isPrivate,
        readOnly,
        memberIds: [],
        categoryId,
      });
      useChannels.getState().handleCreated(novo);
      // navega para o canal novo mesmo no caso privado: o segundo passo continua
      // por cima, e ao fechá-lo a pessoa já cai dentro do canal que acabou de criar
      abrirCanalNovo(novo);
      ui.toast(`Canal ${novo.name ?? nomeLimpo} criado`);
      if (isPrivate) {
        setCriadoId(novo.id);
        return;
      }
      closeModal();
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível criar o canal"));
    } finally {
      setSaving(false);
    }
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
          <Button
            variante="primario"
            tamanho="md"
            type="button"
            carregando={saving}
            disabled={!name.trim()}
            onClick={() => void submit()}
            className={ehMobile ? ALTURA_DE_TOQUE : ""}
          >
            Criar canal
          </Button>
          <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
        </>
      }
    >
      {/* `disabled` no fieldset cascateia para os `<input type="radio">` de
          dentro (nativo do HTML, sem precisar de uma prop de `RadioLinha` que
          não existe) — trava a escolha de tipo enquanto o POST está em voo,
          como o resto do formulário. */}
      <fieldset disabled={saving}>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
          Tipo de canal
        </legend>
        {/* gap 8px: `--space-8` do `radioGroupContainer` medido no CSS bruto do
            Discord (ver o comentário do arquivo) — trocado do gap-1 (4px) que
            não tinha origem nenhuma. */}
        <div className="flex flex-col gap-2">
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

      <Campo rotulo="Nome do canal" htmlFor="novo-canal-nome" erro={erro} className="mt-5">
        <TextInput
          id="novo-canal-nome"
          value={name}
          autoFocus
          disabled={saving}
          erro={!!erro}
          onChange={(e) => {
            setName(e.target.value);
            setErro(null);
          }}
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
      </Campo>

      {podeGerenciarCanais && !anuncio && (
        <div className="mt-4 border-t border-border-subtle pt-1">
          {/* mesmo truque do fieldset acima: `contents` tira a caixa própria
              (sem isto o border-0/padding-0 default do fieldset some com a
              margem/borda deste bloco), só a cascata de `disabled` fica. */}
          <fieldset disabled={saving} className="contents">
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
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
