"use client";

import { useEffect } from "react";
import { ACOES_DE_VOZ, actionForEvent } from "@/lib/shortcuts";
import { atalhosEfetivos, useAtalhos } from "@/stores/atalhos";
import { pttCombina } from "@/stores/ptt-core";
import { useVoice } from "@/stores/voice";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Atalhos globais de voz: Ctrl+Shift+M (mudo), Ctrl+Shift+D (surdo),
 * Ctrl+Shift+K (desconectar), Ctrl+Shift+F (tela cheia do palco) e a tecla de
 * push-to-talk.
 *
 * Os dois primeiros ficam montados no app inteiro, e não no painel de voz,
 * porque valem fora de qualquer call — é o mesmo par de botões do rodapé. Eles
 * estão no registro de `lib/shortcuts` (a aba "Teclado" lista e regrava), mas
 * quem os executa é **só** este componente: o `useKeyboardShortcuts` os pula
 * (`ACOES_DE_VOZ`). Com dois ouvintes a mesma tecla dava mudo e desmudo, e o
 * som tocava por nada. Este é o dono porque mudo/surdo precisam valer com um
 * modal aberto — a combinação vem do registro, então a
 * regravação da aba vale aqui também. O push-to-talk **não** chama
 * `preventDefault`: a tecla continua digitando normalmente na conversa, ela só
 * abre o microfone enquanto está apertada.
 *
 * Atalho que muda estado sem nada na tela mudar precisa de som: quem aperta
 * Ctrl+Shift+M no meio de uma frase não está olhando para o rodapé, e o som é
 * a única confirmação de que o microfone fechou. Quem o toca é
 * `useVoicePrefs.toggleMute`/`toggleDeafen`, para valer também no botão do
 * rodapé e na barra da call — aqui só se dispara a ação.
 *
 * `keyup` pode se perder quando a janela some com a tecla apertada (alt-tab),
 * o que deixaria o microfone aberto: o `blur` fecha por segurança.
 */
export default function VoiceHotkeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const prefs = useVoicePrefs.getState();

      const acao = actionForEvent(e, atalhosEfetivos(useAtalhos.getState().regravados));
      if (acao && ACOES_DE_VOZ.has(acao)) {
        e.preventDefault();
        // o som é da store (`voicePrefs`), não daqui: tocá-lo também neste
        // ponto dobrava o aviso do atalho e deixava o botão do rodapé mudo
        if (acao === "alternarMudo") prefs.toggleMute();
        else prefs.toggleDeafen();
        return;
      }

      if (e.ctrlKey && e.shiftKey && !e.altKey) {
        if (e.code === "KeyK") {
          e.preventDefault();
          if (useVoice.getState().channelId) void useVoice.getState().disconnect();
          return;
        }
        if (e.code === "KeyF") {
          e.preventDefault();
          alternarPalco();
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

/**
 * O palco é achado pelo DOM (`data-voice-panel`/`data-call-stage`) porque o
 * atalho é global e não sabe qual dos dois está montado — guardar o elemento
 * numa store só para isto acoplaria a store ao React.
 */
function alternarPalco() {
  if (typeof document === "undefined") return;
  const palco = document.querySelector<HTMLElement>("[data-voice-panel], [data-call-stage]");
  if (!palco) return;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void palco.requestFullscreen().catch(() => {});
}
