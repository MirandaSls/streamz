"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import {
  MAX_ABOUT_ME,
  MAX_PRONOUNS,
  customStatusOf,
  displayNameOf,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Aba "Perfil" de Minha conta: banner (imagem ou cor), pronomes e "Sobre mim",
 * com a prévia do cartão ao lado — como o Discord mostra ao editar.
 *
 * O shell de configurações é do agente E; este componente é só o conteúdo da
 * aba, para poder ser montado lá sem que os dois mexam no mesmo arquivo.
 */
export default function PerfilTab() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [aboutMe, setAboutMe] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bannerColor, setBannerColor] = useState("#5865f2");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // o perfil rico não cabe no PublicUser da sessão — busca uma vez ao montar
  const meuId = user?.id;
  useEffect(() => {
    if (!meuId) return;
    let vivo = true;
    api
      .profile(meuId)
      .then((p) => {
        if (!vivo) return;
        setAboutMe(p.aboutMe ?? "");
        setPronouns(p.pronouns ?? "");
        setBannerColor(p.bannerColor ?? "#5865f2");
        setBannerUrl(p.bannerUrl);
      })
      .catch(() => {
        // sem perfil carregado os campos ficam vazios; salvar ainda funciona
      });
    return () => {
      vivo = false;
    };
  }, [meuId]);

  if (!user) return null;
  const personalizado = customStatusOf(user);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      setUser(
        await api.updateProfile({
          aboutMe: aboutMe.trim() || null,
          pronouns: pronouns.trim() || null,
          bannerColor,
        }),
      );
      ui.toast("Perfil salvo.");
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar o perfil"), "error");
    } finally {
      setSalvando(false);
    }
  }

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

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 text-xs font-bold uppercase text-txt-secondary">Banner do perfil</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarBanner(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={enviando}
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
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
          <label className="ml-1 flex items-center gap-2 text-sm text-txt-muted">
            Cor
            <input
              type="color"
              value={bannerColor}
              onChange={(e) => setBannerColor(e.target.value)}
              aria-label="Cor do banner"
              className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-txt-muted">
          Sem imagem, o perfil usa a cor. O envio precisa do armazenamento configurado.
        </p>

        <label htmlFor="pronouns" className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary">
          Pronomes
        </label>
        <input
          id="pronouns"
          value={pronouns}
          maxLength={MAX_PRONOUNS}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="ele/dele, ela/dela, elu/delu…"
          className="h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        />

        <label htmlFor="aboutMe" className="mb-2 mt-5 block text-xs font-bold uppercase text-txt-secondary">
          Sobre mim
        </label>
        <textarea
          id="aboutMe"
          value={aboutMe}
          maxLength={MAX_ABOUT_ME}
          rows={4}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder="Fale um pouco sobre você."
          className="w-full resize-none rounded-[3px] bg-rail p-2.5 text-txt-normal outline-none placeholder:text-txt-muted"
        />
        <p className="mt-1 text-xs text-txt-muted">
          {aboutMe.length}/{MAX_ABOUT_ME}
        </p>

        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar()}
          className="mt-4 h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar perfil"}
        </button>
      </div>

      {/* prévia: o mesmo cartão que os outros veem */}
      <div className="w-full shrink-0 md:w-[300px]">
        <h3 className="mb-2 text-xs font-bold uppercase text-txt-secondary">Prévia</h3>
        <div className="overflow-hidden rounded-lg bg-[#111214]">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-[60px] w-full object-cover" />
          ) : (
            <div className="h-[60px] w-full" style={{ backgroundColor: bannerColor }} />
          )}
          <div className="px-4 pb-4">
            <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-[#111214]">
              <Avatar user={user} size="xl" status={user.status} surface="border-[#111214]" />
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
                  <div className="mt-3 border-t border-[#3f4147] pt-3 text-xs font-bold uppercase text-txt-secondary">
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
