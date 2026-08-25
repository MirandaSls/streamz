"use client";

import { useEffect } from "react";
import { pttCombina } from "@/stores/ptt-core";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Atalhos globais de voz: Ctrl+Shift+M (mudo), Ctrl+Shift+D (surdo) e a tecla
 * de push-to-talk.
 *
 * Fica montado no app inteiro, e não no painel de voz, porque os dois primeiros
 * valem fora de qualquer call — é o mesmo par de botões do rodapé. O
 * push-to-talk **não** chama `preventDefault`: a tecla continua digitando
 * normalmente na conversa, ela só abre o microfone enquanto está apertada.
 *
 * `keyup` pode se perder quando a janela some com a tecla apertada (alt-tab),
 * o que deixaria o microfone aberto: o `blur` fecha por segurança.
 */
export default function VoiceHotkeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const prefs = useVoicePrefs.getState();

      if (e.ctrlKey && e.shiftKey && !e.altKey) {
        if (e.code === "KeyM") {
          e.preventDefault();
          prefs.toggleMute();
          return;
        }
        if (e.code === "KeyD") {
          e.preventDefault();
          prefs.toggleDeafen();
          return;
        }
      }

      // auto-repeat do teclado dispara keydown sem parar; o estado puro ignora,
      // mas nem chamar é mais barato
      if (e.repeat) return;
      if (prefs.pushToTalk && pttCombina(e.code, prefs.pttKey)) prefs.pressPtt();
    }

    function onKeyUp(e: KeyboardEvent) {
      const prefs = useVoicePrefs.getState();
      if (prefs.pushToTalk && pttCombina(e.code, prefs.pttKey)) prefs.releasePtt();
    }

    function onBlur() {
      const prefs = useVoicePrefs.getState();
      if (prefs.pushToTalk && prefs.pttAtivo) prefs.releasePtt();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return null;
}
