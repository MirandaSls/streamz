"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Smile, Trash2 } from "@/components/ui/icones";
import {
  ACCEPT_IMAGEM_DE_PERFIL,
  MAX_ABOUT_ME,
  MAX_DISPLAY_NAME,
  MAX_PRONOUNS,
  ROLE_COLORS,
  customStatusOf,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import SeletorDeCor, { ehHex } from "@/components/settings/SeletorDeCor";
import { ESTILO_ROTULO } from "@/components/settings/campos";
import PickerPanel from "@/components/media/PickerPanel";
import { BotaoDeIcone, Button, TextArea, TextInput } from "@/components/ui/primitivos";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const COR_PADRAO = "#9be31f";

/**
 * Aba "Perfil" (cartão 6e-perfil, redesenho de paridade sobre a versão de
 * vocabulário anterior) — campos à esquerda, prévia do cartão à direita, como
 * a aba "Profiles" do Discord (print `suporte/imagens/account-settings/
 * 4403147417623-custom-profiles/03.png`, que mostra a ordem real: Display
 * Name, Pronouns, Avatar…; e `.../11.png` para "About Me").
 *
 * ## O que mudou neste cartão
 *
 * 1. **Nome de exibição entrou nesta aba.** Faltava por completo — só existia
 *    em "Minha conta" (`ContaTab.LinhaDeNomeDeExibicao`, que continua lá: o
 *    print mostra os dois lugares editando o mesmo campo no Discord real, e o
 *    botão "Editar perfil de usuário" de `ContaTab` já manda para cá
 *    esperando encontrar o nome).
 * 2. **Ordem dos campos** é a do print: nome, pronomes, foto, banner, cor,
 *    sobre mim. Antes a foto e o banner vinham primeiro.
 * 3. **Cor do banner em popout** (`SeletorDeCor`, mesmo cartão) — era uma
 *    faixa de amostras sempre aberta.
 * 4. **Carregando e erro de verdade.** A busca de `GET /users/:id/profile`
 *    engolia toda falha (`.catch(() => {})`) e começava com os campos vazios
 *    até resolver — se a pessoa editasse pronomes/sobre mim **antes** da
 *    resposta chegar, salvar mandava os valores vazios por cima do que já
 *    existia no servidor (a base de comparação, `salvo`, começava zerada). A
 *    busca falha zero vezes num servidor saudável — por isso não apareceu
 *    antes —, mas o estado existe e este cartão pede para cobri-lo. Agora:
 *    enquanto carrega, pronomes fica `disabled` (mesmo tratamento visual de
 *    "campo ocupado" que `campos.tsx` já documenta — o Discord não tem outro
 *    token para isso); se a busca falhar de verdade, banner/cor/sobre mim
 *    somem e viram um aviso com "Tentar de novo" (o padrão do cartão
 *    6c-minha-conta, `ContaTab.tsx`), em vez de ficarem lá vazios prontos
 *    para apagar dado real.
 * 5. **Sem permissão.** Esta tela é sempre o próprio perfil — não existe "ver
 *    o perfil de outra pessoa sem poder editar" aqui (isso é o `ProfilePopover`,
 *    outro arquivo). A única negação possível é a API recusar uma ação (cor
 *    inválida, upload sem armazenamento configurado): já vira toast de erro
 *    pelos `catch` abaixo. Não há estado de tela novo para desenhar (mesma
 *    conclusão do cartão 6c, item 10 do cabeçalho de `ContaTab.tsx`).
 * 6. **Emoji no "Sobre mim"** (rodada de correção `conta-seguranca-perfil`):
 *    faltava o botão que o catálogo mostra no canto superior direito do
 *    campo (`suporte/imagens/account-settings/4403147417623-custom-profiles/
 *    11.png`). Abre o `PickerPanel` (`components/media/PickerPanel`) travado
 *    na aba "emoji" — `guildId={null}`, porque aqui não há servidor: um
 *    `guildId` implícito (o servidor aberto na barra lateral antes de entrar
 *    nas configurações) faria a engrenagem de "gerenciar emoji" desse
 *    servidor aparecer sem relação com o próprio perfil. `PickerPanel` está
 *    fora da lista deste cartão e sempre desenha as 3 abas (GIF/Figurinha/
 *    Emoji); `onTab` ignora a troca, então clicar em GIF ou Figurinha aqui
 *    não faz nada — a aba visível nunca deixa de ser "Emoji". O emoji entra
 *    no ponto do cursor do `<textarea>` (não sempre no fim), via
 *    `selectionStart`/`selectionEnd` do `ref` — sem isso, editar o meio do
 *    texto e abrir o seletor jogaria o emoji para o fim, fora do lugar onde
 *    se estava digitando.
 *
 * A foto também é trocável pela aba "Minha conta", num botão de câmera sobre
 * o avatar. Ter os dois caminhos não é duplicação à toa: lá se edita a
 * *conta* e aqui a *aparência do perfil* — e a foto é metade desse cartão. Só
 * aqui, porém, dá para **remover**.
 *
 * A prévia não é um extra de tela grande: ela é o objeto que se está editando,
 * e no desktop ela fica **ao lado** — os 740px do painel comportam as duas
 * colunas. No celular as duas empilham (`celular:flex-col`), a prévia embaixo.
 *
 * Salvar é da barra de alterações não salvas do shell; o banner e a remoção
 * dele são upload, que acontece na hora (não há o que "desfazer" localmente).
 */
export default function PerfilTab() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  // nome de exibição vem da sessão (já carregada para a tela abrir) — não
  // depende da busca do perfil rico, então não entra no estado de carregando/
  // erro abaixo (item 5 do cabeçalho)
  const [displayName, setDisplayName] = useState(() => user?.displayName ?? "");
  const [displayNameSalvo, setDisplayNameSalvo] = useState(() => user?.displayName ?? "");

  const [aboutMe, setAboutMe] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bannerColor, setBannerColor] = useState(COR_PADRAO);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvo, setSalvo] = useState({ aboutMe: "", pronouns: "", bannerColor: COR_PADRAO });
  const fileRef = useRef<HTMLInputElement>(null);
  // input próprio: um só, compartilhado com o banner, mandaria a foto para a
  // rota errada dependendo de qual botão foi clicado por último
  const fotoRef = useRef<HTMLInputElement>(null);
  // botão de emoji do "Sobre mim" (item 4 do catálogo suporte/imagens/
  // account-settings/4403147417623-custom-profiles/11.png) — o `ref` do
  // textarea é o que deixa inserir no ponto do cursor, em vez de sempre no
  // fim do texto.
  const [emojiAberto, setEmojiAberto] = useState(false);
  const aboutMeRef = useRef<HTMLTextAreaElement>(null);

  // carregandoPerfil = a primeira busca do perfil rico ainda não terminou;
  // perfilCarregado = ela já terminou com sucesso ao menos uma vez. erro só é
  // "verdadeiro erro" quando as duas dizem que não há dado nenhum — timing
  // do item 9 de `ContaTab.tsx`.
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);
  const [perfilCarregado, setPerfilCarregado] = useState(false);
  const erroPerfil = !carregandoPerfil && !perfilCarregado;
  // guarda contra `setState` depois de a aba trocar e este componente
  // desmontar (só a aba visível fica montada — comentário de `ContaTab.tsx`)
  const vivoRef = useRef(true);
  useEffect(
    () => () => {
      vivoRef.current = false;
    },
    [],
  );

  // o perfil rico não cabe no PublicUser da sessão — busca ao montar, e de
  // novo se "Tentar de novo" for clicado
  const meuId = user?.id;
  const buscarPerfil = useCallback(() => {
    if (!meuId) return;
    setCarregandoPerfil(true);
    api
      .profile(meuId)
      .then((p) => {
        if (!vivoRef.current) return;
        const carregado = {
          aboutMe: p.aboutMe ?? "",
          pronouns: p.pronouns ?? "",
          bannerColor: p.bannerColor ?? COR_PADRAO,
        };
        setAboutMe(carregado.aboutMe);
        setPronouns(carregado.pronouns);
        setBannerColor(carregado.bannerColor);
        setSalvo(carregado);
        setBannerUrl(p.bannerUrl);
        setPerfilCarregado(true);
      })
      .catch(() => {
        if (vivoRef.current) setPerfilCarregado(false);
      })
      .finally(() => {
        if (vivoRef.current) setCarregandoPerfil(false);
      });
  }, [meuId]);

  useEffect(() => {
    buscarPerfil();
  }, [buscarPerfil]);

  const dirty =
    displayName !== displayNameSalvo ||
    aboutMe !== salvo.aboutMe ||
    pronouns !== salvo.pronouns ||
    bannerColor !== salvo.bannerColor;

  useAlteracoesNaoSalvas({
    dirty,
    salvar: async () => {
      if (bannerColor && !ehHex(bannerColor)) {
        ui.toast("Cor inválida — use #rrggbb.", "error");
        return;
      }
      try {
        setUser(
          await api.updateProfile({
            displayName: displayName.trim() || null,
            aboutMe: aboutMe.trim() || null,
            pronouns: pronouns.trim() || null,
            bannerColor,
          }),
        );
        setDisplayNameSalvo(displayName);
        setSalvo({ aboutMe, pronouns, bannerColor });
        ui.toast("Perfil salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar o perfil"), "error");
      }
    },
    redefinir: () => {
      setDisplayName(displayNameSalvo);
      setAboutMe(salvo.aboutMe);
      setPronouns(salvo.pronouns);
      setBannerColor(salvo.bannerColor);
    },
  });

  if (!user) return null;
  const personalizado = customStatusOf(user);

  async function enviarBanner(file: File) {
    setEnviando(true);
    try {
      await api.updateBanner(file);
      const p = await api.profile(meuId!);
      setBannerUrl(p.bannerUrl);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar o banner"), "error");
    } finally {
      setEnviando(false);
    }
  }

  async function removerBanner() {
    try {
      await api.removeBanner();
      setBannerUrl(null);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover o banner"), "error");
    }
  }

  /**
   * Todo arquivo escolhido passa antes pelo ajuste de enquadramento: o que sobe
   * é o recorte, não o original. Cancelar ali não envia nada. A exceção é o
   * GIF, que sobe inteiro para não perder a animação — quem decide é o
   * `recortarImagem` da store.
   */
  async function escolherFoto(file: File) {
    const recortada = await ui.recortarImagem(file, "avatar");
    if (recortada) await enviarFoto(recortada);
  }

  async function escolherBanner(file: File) {
    const recortado = await ui.recortarImagem(file, "banner");
    if (recortado) await enviarBanner(recortado);
  }

  // a foto vive na sessão (`useAuth`), não no perfil carregado aqui: trocar já
  // atualiza a prévia ao lado e toda tela que mostra o avatar
  async function enviarFoto(file: File) {
    setEnviandoFoto(true);
    try {
      setUser(await api.updateAvatar(file));
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível enviar a foto"), "error");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    setEnviandoFoto(true);
    try {
      setUser(await api.removeAvatar());
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover a foto"), "error");
    } finally {
      setEnviandoFoto(false);
    }
  }

  /**
   * Insere no ponto do cursor (não sempre no fim) e devolve o foco pro
   * textarea depois — sem isto, o próximo caractere digitado iria para o
   * fim do texto, não para onde o emoji entrou.
   */
  function inserirEmojiNoSobreMim(texto: string) {
    const el = aboutMeRef.current;
    const inicio = el?.selectionStart ?? aboutMe.length;
    const fim = el?.selectionEnd ?? aboutMe.length;
    const novo = aboutMe.slice(0, inicio) + texto + aboutMe.slice(fim);
    setAboutMe(novo.slice(0, MAX_ABOUT_ME));
    setEmojiAberto(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const posicao = inicio + texto.length;
      el.setSelectionRange(posicao, posicao);
    });
  }

  return (
    // No celular as duas colunas **empilham**: os 280px da prévia sobre os
    // 358 de conteúdo deixavam 62 para o formulário — "Escolher foto"
    // vazava do botão, o texto de ajuda saía uma palavra por linha e as 18
    // amostras de cor viravam uma coluna de 18 linhas.
    <div className="flex gap-6 celular:flex-col celular:gap-5">
      <div className="min-w-0 flex-1">
        <label htmlFor="displayName" className={ESTILO_ROTULO}>
          Nome de exibição
        </label>
        <TextInput
          id="displayName"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={user.username}
        />

        <label
          htmlFor="pronouns"
          className={`${ESTILO_ROTULO} mt-5 ${carregandoPerfil ? "opacity-50" : ""}`}
        >
          Pronomes
        </label>
        <TextInput
          id="pronouns"
          value={pronouns}
          maxLength={MAX_PRONOUNS}
          disabled={carregandoPerfil}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="ele/dele, ela/dela, elu/delu…"
        />
        {erroPerfil && (
          <p className="mt-1 text-xs text-text-feedback-critical">
            Não foi possível carregar os pronomes salvos.
          </p>
        )}

        <h3 className={`${ESTILO_ROTULO} mt-5`}>Foto do perfil</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar user={user} size="xl" surface="border-background-base-lowest" />
          <input
            ref={fotoRef}
            type="file"
            accept={ACCEPT_IMAGEM_DE_PERFIL}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolherFoto(f);
              e.target.value = "";
            }}
          />
          <Button
            variante="primario"
            tamanho="sm"
            icone={<Camera size={16} aria-hidden="true" />}
            disabled={enviandoFoto}
            onClick={() => fotoRef.current?.click()}
            className="celular:h-[44px]"
          >
            {enviandoFoto ? "Enviando…" : user.avatarUrl ? "Trocar foto" : "Escolher foto"}
          </Button>
          {user.avatarUrl && (
            <BotaoDeIcone
              rotulo="Remover foto"
              icone={<Trash2 size={16} />}
              tamanho="lg"
              comFundo
              perigo
              disabled={enviandoFoto}
              onClick={() => void removerFoto()}
              className="celular:h-[44px] celular:w-[44px]"
            />
          )}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Sem foto, o perfil usa o símbolo do Streamz sobre uma cor do seu perfil.
        </p>

        {erroPerfil ? (
          // banner, cor e sobre mim dependem todos da mesma busca — sumir com
          // os três em vez de mostrá-los vazios evita salvar por cima do que
          // já existe no servidor (item 4 do cabeçalho)
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-background-base-lower p-3">
            <p className="text-sm text-text-muted">
              Não foi possível carregar o banner e o &quot;sobre mim&quot;.
            </p>
            <Button variante="secundario" tamanho="sm" onClick={buscarPerfil}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <>
            <h3 className={`${ESTILO_ROTULO} mt-5 ${carregandoPerfil ? "opacity-50" : ""}`}>
              Banner do perfil
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_IMAGEM_DE_PERFIL}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void escolherBanner(f);
                  e.target.value = "";
                }}
              />
              <Button
                variante="primario"
                tamanho="sm"
                icone={<ImageIcon size={16} aria-hidden="true" />}
                disabled={enviando || carregandoPerfil}
                onClick={() => fileRef.current?.click()}
                className="celular:h-[44px]"
              >
                {enviando ? "Enviando…" : "Trocar banner"}
              </Button>
              {bannerUrl && (
                <BotaoDeIcone
                  rotulo="Remover banner"
                  icone={<Trash2 size={16} />}
                  tamanho="lg"
                  comFundo
                  perigo
                  disabled={carregandoPerfil}
                  onClick={() => void removerBanner()}
                  className="celular:h-[44px] celular:w-[44px]"
                />
              )}
            </div>

            <h3 className={`${ESTILO_ROTULO} mt-5 ${carregandoPerfil ? "opacity-50" : ""}`}>
              Cor do banner
            </h3>
            <SeletorDeCor
              rotulo="Cor do banner"
              value={bannerColor}
              onChange={setBannerColor}
              cores={ROLE_COLORS}
              disabled={carregandoPerfil}
            />
            <p className="mt-2 text-xs text-text-muted">
              Sem imagem, o perfil usa a cor. O envio precisa do armazenamento configurado.
            </p>

            <label
              htmlFor="aboutMe"
              className={`${ESTILO_ROTULO} mt-5 ${carregandoPerfil ? "opacity-50" : ""}`}
            >
              Sobre mim
            </label>
            {/* `relative` é NOSSO, não do primitivo `TextArea` (que já tem
                o dele por dentro, num `<div>` que não expõe `ref` para
                pendurar irmão nenhum) — o botão de emoji é filho deste
                wrapper, não do wrapper interno do primitivo. */}
            <div className="relative">
              <TextArea
                id="aboutMe"
                ref={aboutMeRef}
                value={aboutMe}
                maxLength={MAX_ABOUT_ME}
                rows={4}
                disabled={carregandoPerfil}
                contador
                onChange={(e) => setAboutMe(e.target.value)}
                placeholder="Fale um pouco sobre você."
                // espaço pro botão de emoji não ficar por cima do texto
                // digitado na primeira linha
                className="pr-9"
              />
              <BotaoDeIcone
                rotulo="Inserir emoji"
                icone={<Smile size={16} aria-hidden="true" />}
                tamanho="sm"
                disabled={carregandoPerfil}
                onClick={() => setEmojiAberto((v) => !v)}
                className="absolute right-1.5 top-1.5"
              />
              {emojiAberto && (
                <PickerPanel
                  // aba fixa em "emoji" — "Sobre mim" é texto puro, sem GIF
                  // nem figurinha (o catálogo mostra só um emoji no canto,
                  // suporte/imagens/account-settings/
                  // 4403147417623-custom-profiles/11.png); `onTab` ignora a
                  // troca porque `PickerPanel` (fora da lista deste cartão)
                  // sempre desenha as 3 abas — clicar em GIF/Figurinha aqui
                  // não faz nada, a de emoji nunca sai da tela.
                  tab="emoji"
                  onTab={() => {}}
                  // `null`, não o servidor ativo da barra lateral: aqui é o
                  // perfil da conta, sem vínculo com um servidor — "só
                  // leitura" do item 4, sem o link de gerenciar emoji de um
                  // servidor que por acaso estava aberto antes de entrar
                  // nas configurações.
                  guildId={null}
                  onClose={() => setEmojiAberto(false)}
                  onPickEmoji={inserirEmojiNoSobreMim}
                  onGif={() => setEmojiAberto(false)}
                  onSticker={() => setEmojiAberto(false)}
                  className="absolute right-1.5 top-1.5"
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* prévia: o mesmo cartão que os outros veem */}
      <div className="w-[280px] shrink-0 celular:w-full">
        <h3 className={ESTILO_ROTULO}>Prévia</h3>
        <div className="overflow-hidden rounded-lg bg-background-surface-higher">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-[60px] w-full object-cover" />
          ) : (
            <div className="h-[60px] w-full" style={{ backgroundColor: bannerColor }} />
          )}
          <div className="px-4 pb-4">
            <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-background-surface-higher">
              <Avatar user={user} size="xl" status={user.status} surface="border-background-surface-higher" />
            </div>
            <div className="rounded-lg bg-background-base-low p-3">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-xl font-bold leading-6 text-text-strong">
                  {displayName.trim() || user.username}
                </span>
                {pronouns.trim() && (
                  <span className="truncate text-xs text-text-muted">{pronouns.trim()}</span>
                )}
              </div>
              <div className="truncate text-sm text-text-default">@{user.username}</div>
              {personalizado && <div className="mt-1 text-sm text-text-default">{personalizado}</div>}
              {aboutMe.trim() && (
                <>
                  <div className="mt-3 border-t border-border-subtle pt-3 text-xs font-bold uppercase text-text-subtle">
                    Sobre mim
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-default">
                    {aboutMe}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
