"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2 } from "@/components/ui/icones";
import {
  ACCEPT_IMAGEM_DE_PERFIL,
  MAX_ABOUT_ME,
  MAX_PRONOUNS,
  ROLE_COLORS,
  customStatusOf,
  displayNameOf,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import SeletorDeCor, { ehHex } from "@/components/settings/SeletorDeCor";
import { ESTILO_ROTULO } from "@/components/settings/campos";
import { BotaoDeIcone, Button, TextArea, TextInput } from "@/components/ui/primitivos";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const COR_PADRAO = "#9be31f";

/**
 * Aba "Perfil": foto, banner (imagem ou cor), pronomes e "Sobre mim", com a
 * prévia do cartão **sempre** à direita.
 *
 * A foto também é trocável pela aba "Minha conta", num botão de câmera sobre o
 * avatar. Ter os dois caminhos não é duplicação à toa: lá se edita a *conta*
 * (quem você é para o sistema) e aqui a *aparência do perfil*, que é onde a
 * pessoa vem quando quer mexer em como o cartão dela aparece — e a foto é
 * metade desse cartão. Só aqui, porém, dá para **remover**.
 *
 * A prévia não é um extra de tela grande: ela é o objeto que se está editando,
 * e no desktop ela fica **ao lado** — os 740px do painel comportam as duas
 * colunas. No celular não há 740px: as duas empilham (`celular:flex-col`), a
 * prévia embaixo, porque a alternativa era o formulário em 62px de largura.
 *
 * Salvar é da barra de alterações não salvas do shell; o banner e a remoção
 * dele são upload, que acontece na hora (não há o que "desfazer" localmente).
 */
export default function PerfilTab() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

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

  // o perfil rico não cabe no PublicUser da sessão — busca uma vez ao montar
  const meuId = user?.id;
  useEffect(() => {
    if (!meuId) return;
    let vivo = true;
    api
      .profile(meuId)
      .then((p) => {
        if (!vivo) return;
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
      })
      .catch(() => {
        // sem perfil carregado os campos ficam vazios; salvar ainda funciona
      });
    return () => {
      vivo = false;
    };
  }, [meuId]);

  const dirty =
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
            aboutMe: aboutMe.trim() || null,
            pronouns: pronouns.trim() || null,
            bannerColor,
          }),
        );
        setSalvo({ aboutMe, pronouns, bannerColor });
        ui.toast("Perfil salvo.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível salvar o perfil"), "error");
      }
    },
    redefinir: () => {
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

  return (
    // No celular as duas colunas **empilham**: os 280px da prévia sobre os
    // 358 de conteúdo deixavam 62 para o formulário — "Escolher foto"
    // vazava do botão, o texto de ajuda saía uma palavra por linha e as 18
    // amostras de cor viravam uma coluna de 18 linhas.
    <div className="flex gap-6 celular:flex-col celular:gap-5">
      <div className="min-w-0 flex-1">
        <h3 className={ESTILO_ROTULO}>Foto do perfil</h3>
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
          Sem foto, o perfil usa as iniciais do seu nome.
        </p>

        <h3 className={`${ESTILO_ROTULO} mt-5`}>Banner do perfil</h3>
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
            disabled={enviando}
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
              onClick={() => void removerBanner()}
              className="celular:h-[44px] celular:w-[44px]"
            />
          )}
        </div>

        <h3 className={`${ESTILO_ROTULO} mt-5`}>Cor do banner</h3>
        <SeletorDeCor
          rotulo="Cor do banner"
          value={bannerColor}
          onChange={setBannerColor}
          cores={ROLE_COLORS}
        />
        <p className="mt-2 text-xs text-text-muted">
          Sem imagem, o perfil usa a cor. O envio precisa do armazenamento configurado.
        </p>

        <label htmlFor="pronouns" className={`${ESTILO_ROTULO} mt-5`}>
          Pronomes
        </label>
        <TextInput
          id="pronouns"
          value={pronouns}
          maxLength={MAX_PRONOUNS}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="ele/dele, ela/dela, elu/delu…"
        />

        <label htmlFor="aboutMe" className={`${ESTILO_ROTULO} mt-5`}>
          Sobre mim
        </label>
        <TextArea
          id="aboutMe"
          value={aboutMe}
          maxLength={MAX_ABOUT_ME}
          rows={4}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder="Fale um pouco sobre você."
        />
        <p className="mt-1 text-xs text-text-muted">
          {aboutMe.length}/{MAX_ABOUT_ME}
        </p>
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
                  {displayNameOf(user)}
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
