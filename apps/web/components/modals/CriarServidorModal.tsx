"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronRight, ImagePlus, Pencil } from "@/components/ui/icones";
import { MAX_GUILD_ICON_SIZE } from "@streamz/shared";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { BotaoDeIcone, Button, Campo, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/**
 * "Criar servidor" / "Entrar em um servidor" — cartão 7a-criar-servidor.
 *
 * Antes as duas ações eram um `PromptDialog` genérico (um campo, Cancelar/Criar
 * — `stores/guilds.ts` `create()`/`joinByCode()`, que continuam existindo mas
 * não são mais chamados daqui: este modal chama a API direto e escreve no
 * `useGuilds` do mesmo jeito que `KickModal`/`BanModal` já fazem
 * (`useGuilds.setState`), porque as duas funções antigas abrem o próprio
 * `ui.prompt()` por dentro — não dava para reusá-las sem reabrir a caixa
 * velha por cima desta).
 *
 * Três telas, na ordem do Discord (`modal-criar-servidor.webp`, referência
 * `desenvolvedores/imagens/servidor-e-comunidade/` — proporção e ordem, escala
 * desconhecida; a tela de personalização é o print 1:1
 * `suporte/imagens/server-settings/204849977-how-do-i-create-a-server/06.png`,
 * também escala desconhecida mas nítido: "Customize Your Server", ícone
 * circular central, "SERVER NAME", "Back"/"Create"):
 *
 * 1. **"criar"** — título + descrição, e a única linha possível hoje ("Criar o
 *    meu"): o Discord tem mais quatro linhas de modelo ("START FROM A
 *    TEMPLATE" — Jogos/Amigos/Estudos/Escola) que o Streamz não tem, e por
 *    isso ficam de fora (não é "(em breve)" porque não há infraestrutura de
 *    modelo nenhuma para prometer — só o rótulo "Criar o meu" seguiria vivo).
 *    Embaixo, o mesmo link do Discord para a terceira tela.
 * 2. **"personalizar"** — ícone (upload direto; sem o recorte de
 *    `ui.recortarImagem`, que só conhece os formatos `avatar`/`banner` do
 *    `FormatoDeRecorte` — o mesmo que `PerfilDoServidorTab.tsx` já faz para o
 *    ícone de servidor) e nome. "Voltar" e "Criar".
 * 3. **"entrar"** — o código ou link do convite. "Voltar" e "Entrar em um
 *    servidor".
 *
 * A API não aceita ícone **na criação** (`POST /guilds` só recebe `name`) — só
 * depois, por `PATCH .../icon`. Por isso "Criar" faz as duas chamadas em
 * sequência com o botão em `carregando` até as duas terminarem: preferir isso
 * a fechar o modal logo após criar (e deixar o upload do ícone acontecer por
 * trás) evita a sensação de "o ícone que eu escolhi sumiu" se o upload falhar
 * sozinho — aqui, se falhar, o servidor já existe (não desfazemos) mas quem
 * criou ainda está olhando para a caixa quando o aviso aparece.
 */

const ACEITA_ICONE = "image/png,image/jpeg,image/gif,image/webp";
const TETO_ICONE_MB = Math.round(MAX_GUILD_ICON_SIZE / (1024 * 1024));

type Tela = "criar" | "personalizar" | "entrar";

/**
 * Aceita link completo (com ou sem `https://`, nosso domínio ou não) e código
 * puro — Discord aceita as duas formas no mesmo campo. Não é o
 * `codigoDeConviteDaUrl` de `lib/links-de-convite.ts`: aquele só reconhece
 * link do **nosso** host (é o que decide se uma URL colada no chat vira
 * cartão de convite); aqui a pessoa está deliberadamente colando um convite
 * neste campo, então um link de outro host ou um código sozinho também
 * servem — quem valida de verdade é o `POST /invites/:code/redeem`.
 */
function extrairCodigoDoConvite(bruto: string): string {
  const texto = bruto.trim();
  if (!texto) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    const partes = url.pathname.split("/").filter(Boolean);
    if (texto.includes("/") && partes.length > 0) return partes[partes.length - 1];
  } catch {
    // não parseou como URL nem com o https:// na frente — segue como código puro
  }
  return texto;
}

export default function CriarServidorModal({ tela: telaInicial = "criar" }: { tela?: "criar" | "entrar" }) {
  const closeModal = useUI((s) => s.closeModal);
  const [tela, setTela] = useState<Tela>(telaInicial);
  const [nome, setNome] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  // a pré-visualização é um object URL do arquivo escolhido — nasce e morre
  // com ele, como em `RecortarImagemModal.tsx`
  useEffect(() => {
    if (!arquivo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  // erro é por tela: trocar de tela sem ter corrigido nada não devia deixar o
  // aviso da tela anterior pendurado numa caixa que não tem mais o campo dele
  useEffect(() => {
    setErro(null);
  }, [tela]);

  // o campo certo ganha foco a cada troca de tela — o `useEffect` de foco do
  // `Modal` só roda na PRIMEIRA montagem (`[montado]`), então trocar de tela
  // depois disso não move o foco sozinho
  useEffect(() => {
    if (tela === "personalizar") nomeRef.current?.focus();
    if (tela === "entrar") codigoRef.current?.focus();
  }, [tela]);

  function escolherIcone(f: File) {
    if (f.size > MAX_GUILD_ICON_SIZE) {
      ui.toast(`Imagem grande demais — o teto é ${TETO_ICONE_MB} MB.`, "error");
      return;
    }
    setArquivo(f);
  }

  async function criar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      const criado = await api.createGuild(nomeLimpo);
      let guildFinal: typeof criado = criado;
      if (arquivo) {
        try {
          // `updateGuildIcon` devolve `Guild`, sem `channels` (não é
          // `GuildWithChannels` — só `POST /guilds` traz os canais iniciais);
          // por isso só o `iconUrl` é aproveitado, e o resto do objeto
          // continua o da criação.
          const comIcone = await api.updateGuildIcon(criado.id, arquivo);
          guildFinal = { ...guildFinal, iconUrl: comIcone.iconUrl };
        } catch (e) {
          // o servidor já existe — o que falhou foi só o ícone, e dá para
          // trocar depois em Configurações. Desfazer a criação por isso
          // custaria mais do que avisar e seguir.
          ui.toast(
            errorMessage(e, "Servidor criado, mas o ícone não subiu. Troque-o em Configurações do servidor."),
            "error",
          );
        }
      }
      useGuilds.setState((s) => ({ guilds: [...s.guilds, guildFinal] }));
      useGuilds.getState().select(guildFinal);
      closeModal();
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível criar o servidor"));
    } finally {
      setCarregando(false);
    }
  }

  async function entrar() {
    const code = extrairCodigoDoConvite(codigo);
    if (!code || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      const guild = await api.redeemInvite(code);
      // a lista completa traz não-lido e menções — igual a `entrarPorConvite`
      // em `stores/guilds.ts`, que este modal não chama (ela erra por toast,
      // não por texto dentro da caixa, e o cartão pede o estado de erro aqui)
      const guilds = await api.listGuilds();
      useGuilds.setState({ guilds });
      useGuilds.getState().select(guild);
      closeModal();
    } catch (e) {
      // é aqui que "Convite inválido", "Convite expirado", "Convite atingiu o
      // limite de usos" e "Você foi banido deste servidor" (403 do
      // `invites.service.ts`) aparecem — o texto já vem do backend
      setErro(errorMessage(e, "Convite inválido"));
    } finally {
      setCarregando(false);
    }
  }

  if (tela === "criar") {
    return (
      <Dialog
        title="Crie seu servidor"
        description="Seu servidor é onde você e seus amigos se encontram. Crie o seu e comece a conversar."
        onClose={closeModal}
      >
        <button
          type="button"
          onClick={() => setTela("personalizar")}
          className="flex w-full items-center gap-3 rounded-lg bg-background-base-lowest p-3 text-left transition hover:bg-interactive-background-hover"
        >
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-input-background-default text-text-subtle"
          >
            <Pencil size={20} />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-text-strong">Criar o meu</span>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
        </button>

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <p className="text-text-md font-semibold text-text-strong">Já tem um convite?</p>
          <SecondaryButton full onClick={() => setTela("entrar")}>
            Entrar em um servidor
          </SecondaryButton>
        </div>
      </Dialog>
    );
  }

  if (tela === "personalizar") {
    return (
      <Dialog
        title="Personalize seu servidor"
        description="Dê ao seu novo servidor um nome e um ícone. Você pode mudar isso quando quiser."
        onClose={closeModal}
        footer={
          <div className="flex w-full items-center justify-between">
            <Button variante="neutro" disabled={carregando} onClick={() => setTela("criar")}>
              Voltar
            </Button>
            <Button
              variante="primario"
              carregando={carregando}
              disabled={!nome.trim()}
              onClick={() => void criar()}
            >
              Criar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center">
          <div className="relative">
            {/* o círculo em si não é clicável (mesmo padrão de `ContaTab.tsx`
                e `GroupSettingsModal.tsx`): quem dispara o seletor de arquivo
                é só o distintivo da câmera, então não há dois alvos de
                clique empilhados um sobre o outro */}
            <div
              aria-hidden="true"
              className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border-2 border-dashed border-border-subtle bg-background-base-lowest text-text-muted"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus size={24} />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACEITA_ICONE}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) escolherIcone(f);
                e.target.value = "";
              }}
            />
            <BotaoDeIcone
              rotulo="Adicionar um ícone"
              icone={<Camera size={16} />}
              comFundo
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-background-base-lowest text-text-strong shadow-popout"
            />
          </div>
        </div>

        <Campo rotulo="Nome do servidor" htmlFor="criarServidorNome" className="mt-6" erro={erro}>
          <TextInput
            id="criarServidorNome"
            ref={nomeRef}
            value={nome}
            maxLength={64}
            erro={!!erro}
            disabled={carregando}
            onChange={(e) => {
              setNome(e.target.value);
              setErro(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void criar();
              }
            }}
            placeholder="Ex.: Time de produto"
          />
        </Campo>

        {/* o mesmo aviso de `app/register/page.tsx` (Termos + Privacidade),
            sem virar link: o Streamz ainda não tem as páginas para apontar,
            e um link morto seria pior do que texto simples */}
        <p className="mt-3 text-text-xs text-text-muted">
          Ao criar um servidor, você concorda com os{" "}
          <span className="font-medium text-text-default">Termos de Serviço</span> e com a{" "}
          <span className="font-medium text-text-default">Política de Privacidade</span> do Streamz.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Entrar em um servidor"
      description="Cole um convite abaixo para entrar num servidor que já existe."
      onClose={closeModal}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variante="neutro" disabled={carregando} onClick={() => setTela("criar")}>
            Voltar
          </Button>
          <Button
            variante="primario"
            carregando={carregando}
            disabled={!codigo.trim()}
            onClick={() => void entrar()}
          >
            Entrar em um servidor
          </Button>
        </div>
      }
    >
      <Campo rotulo="Link do convite" htmlFor="criarServidorConvite" erro={erro}>
        <TextInput
          id="criarServidorConvite"
          ref={codigoRef}
          value={codigo}
          erro={!!erro}
          disabled={carregando}
          onChange={(e) => {
            setCodigo(e.target.value);
            setErro(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void entrar();
            }
          }}
          placeholder="Ex.: https://streamz.chat/invite/hTKzmak ou hTKzmak"
        />
      </Campo>
    </Dialog>
  );
}
