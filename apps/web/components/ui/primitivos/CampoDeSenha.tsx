"use client";

import { forwardRef, useState } from "react";

import { Eye, EyeOff } from "@/components/ui/icones";
import { TextInput, type TextInputProps } from "./TextInput";

/**
 * `TextInput` de senha com o olho de mostrar/ocultar sempre visível.
 *
 * Existe porque o app não tinha olho próprio: o que aparecia era o
 * `::-ms-reveal` nativo do Edge/WebView2, que só surge com foco e texto no
 * campo (o bug "só aparece às vezes"). O nativo é escondido no `globals.css`
 * e este botão fica sempre na caixa. `onMouseDown` com `preventDefault` evita
 * que o clique tire o foco do campo.
 */
export type CampoDeSenhaProps = Omit<TextInputProps, "type" | "sufixo">;

export const CampoDeSenha = forwardRef<HTMLInputElement, CampoDeSenhaProps>(function CampoDeSenha(props, ref) {
  const [visivel, setVisivel] = useState(false);
  const Icone = visivel ? EyeOff : Eye;
  return (
    <TextInput
      {...props}
      ref={ref}
      type={visivel ? "text" : "password"}
      sufixo={
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          onMouseDown={(e) => e.preventDefault()}
          disabled={props.disabled}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          className="shrink-0 text-interactive-text-default transition-colors hover:text-interactive-text-hover disabled:cursor-not-allowed"
        >
          <Icone size={20} aria-hidden="true" />
        </button>
      }
    />
  );
});
