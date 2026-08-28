"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import {
  MAX_ABOUT_ME,
  MAX_PRONOUNS,
  ROLE_COLORS,
  customStatusOf,
  displayNameOf,
} from "@streamz/shared";
import { useAlteracoesNaoSalvas } from "@/components/ui/alteracoes";
import SeletorDeCor, { ehHex } from "@/components/settings/SeletorDeCor";
import { ESTILO_AREA, ESTILO_CAMPO, ESTILO_ROTULO } from "@/components/settings/campos";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
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
 * A prévia não é um extra de tela grande: ela é o objeto que se está editando.
 * Empilhá-la embaixo em telas estreitas quebrava o laço entre o campo e o
 * efeito — e os 740px do painel de configurações são fixos, então a coluna
 * cabe em qualquer janela que consiga abrir esta tela.
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
   * é o recorte, não o original. Cancelar ali não envia nada.
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
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <h3 className={ESTILO_ROTULO}>Foto do perfil</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar user={user} size="xl" surface="border-panel" />
          <input
            ref={fotoRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolherFoto(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={enviandoFoto}
            onClick={() => fotoRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            <Camera size={16} aria-hidden="true" />
            {enviandoFoto ? "Enviando…" : user.avatarUrl ? "Trocar foto" : "Escolher foto"}
          </button>
          {user.avatarUrl && (
            <Tooltip label="Remover foto">
              <button
                type="button"
                disabled={enviandoFoto}
                onClick={() => void removerFoto()}
                aria-label="Remover foto"
                className="grid h-9 w-9 place-items-center rounded-[3px] text-txt-secondary transition hover:bg-hov hover:text-red disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          )}
        </div>
        <p className="mt-2 text-xs text-txt-muted">
          Sem foto, o perfil usa as iniciais do seu nome.
        </p>

        <h3 className={`${ESTILO_ROTULO} mt-5`}>Banner do perfil</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolherBanner(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-50"
          >
            <ImageIcon size={16} aria-hidden="true" />
            {enviando ? "Enviando…" : "Trocar banner"}
          </button>
          {bannerUrl && (
            <Tooltip label="Remover banner">
              <button
                type="button"
                onClick={() => void removerBanner()}
                aria-label="Remover banner"
                className="grid h-9 w-9 place-items-center rounded-[3px] text-txt-secondary transition hover:bg-hov hover:text-red"
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          )}
        </div>

        <h3 className={`${ESTILO_ROTULO} mt-5`}>Cor do banner</h3>
        <SeletorDeCor
          rotulo="Cor do banner"
          value={bannerColor}
          onChange={setBannerColor}
          cores={ROLE_COLORS}
        />
        <p className="mt-2 text-xs text-txt-muted">
          Sem imagem, o perfil usa a cor. O envio precisa do armazenamento configurado.
        </p>

        <label htmlFor="pronouns" className={`${ESTILO_ROTULO} mt-5`}>
          Pronomes
        </label>
        <input
          id="pronouns"
          value={pronouns}
          maxLength={MAX_PRONOUNS}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="ele/dele, ela/dela, elu/delu…"
          className={ESTILO_CAMPO}
        />

        <label htmlFor="aboutMe" className={`${ESTILO_ROTULO} mt-5`}>
          Sobre mim
        </label>
        <textarea
          id="aboutMe"
          value={aboutMe}
          maxLength={MAX_ABOUT_ME}
          rows={4}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder="Fale um pouco sobre você."
          className={ESTILO_AREA}
        />
        <p className="mt-1 text-xs text-txt-muted">
          {aboutMe.length}/{MAX_ABOUT_ME}
        </p>
      </div>

      {/* prévia: o mesmo cartão que os outros veem */}
      <div className="w-[280px] shrink-0">
        <h3 className={ESTILO_ROTULO}>Prévia</h3>
        <div className="overflow-hidden rounded-lg bg-overlay">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-[60px] w-full object-cover" />
          ) : (
            <div className="h-[60px] w-full" style={{ backgroundColor: bannerColor }} />
          )}
          <div className="px-4 pb-4">
            <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-overlay">
              <Avatar user={user} size="xl" status={user.status} surface="border-overlay" />
            </div>
            <div className="rounded-lg bg-footer p-3">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-xl font-bold leading-6 text-txt-primary">
                  {displayNameOf(user)}
                </span>
                {pronouns.trim() && (
                  <span className="truncate text-xs text-txt-muted">{pronouns.trim()}</span>
                )}
              </div>
              <div className="truncate text-sm text-txt-normal">@{user.username}</div>
              {personalizado && <div className="mt-1 text-sm text-txt-normal">{personalizado}</div>}
              {aboutMe.trim() && (
                <>
                  <div className="mt-3 border-t border-border pt-3 text-xs font-bold uppercase text-txt-secondary">
                    Sobre mim
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-txt-normal">
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
