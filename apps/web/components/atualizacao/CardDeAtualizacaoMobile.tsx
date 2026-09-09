"use client";

import { useEffect, useState } from "react";
import { Download, X } from "@/components/ui/icones";
import { abrirNoSistema, isTauri } from "@/lib/desktop";
import { ehMobileAgora } from "@/hooks/useEhMobile";
import {
  checarAtualizacaoDoAndroid,
  type NovidadeDeAtualizacao,
} from "@/lib/atualizacao-mobile";

/**
 * "Saiu versão nova" no app de celular — a versão honesta do que o desktop faz
 * sozinho.
 *
 * No desktop a atualização é automática: a janelinha de abertura baixa o `.exe`
 * e instala (§5.2 do processo). **No Android isso não existe** — o atualizador
 * do Tauri é desktop-only, e um app que instala outro app precisaria da
 * permissão `REQUEST_INSTALL_PACKAGES`, que a Play trata como sinal de
 * malware. O máximo que dá para fazer sem mentir é avisar e abrir a página de
 * download no navegador do sistema; quem instala é o usuário.
 *
 * Por que **no navegador do sistema** e não numa aba: dentro do webview do
 * Tauri um download não tem para onde ir. É o mesmo motivo do `opener` no
 * visualizador de imagem (§4.1), e a permissão é a mesma —
 * `opener:allow-open-url` em `capabilities/mobile.json`.
 *
 * Só aparece dentro do app de celular. No site não faz sentido (atualizar é
 * recarregar a página) e no desktop já existe a setinha verde da barra de
 * título, que faz mais: ela atualiza de verdade.
 *
 * Fechar é por sessão, de propósito: não guardamos "não mostrar mais" em
 * `localStorage`. Uma versão nova é informação que muda — a próxima abertura do
 * app deve avisar de novo se ainda estiver desatualizado, e "silenciar para
 * sempre" seria como o usuário desligar o aviso sem saber que desligou.
 */
export default function CardDeAtualizacaoMobile() {
  const [novidade, setNovidade] = useState<NovidadeDeAtualizacao | null>(null);
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    if (!isTauri() || !ehMobileAgora()) return;
    let vivo = true;
    void (async () => {
      try {
        // `getVersion()` é a versão do `.apk` instalado — não a do bundle da
        // web, que é sempre a que veio dentro dele. O `import()` dinâmico é o
        // padrão do `lib/desktop`: fora do app, o módulo nem carrega.
        const { getVersion } = await import("@tauri-apps/api/app");
        const encontrada = await checarAtualizacaoDoAndroid(await getVersion());
        if (vivo) setNovidade(encontrada);
      } catch {
        // aviso de atualização é conveniência: falhar aqui não pode aparecer
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!novidade || fechado) return null;

  return (
    <div
      role="status"
      // acima da barra de abas do `ShellMobile`, encostado nas laterais.
      // `env(safe-area-inset-bottom)` não entra aqui porque quem já reserva o
      // recorte inferior é a barra de abas, embaixo deste card.
      className="fixed inset-x-2 bottom-[68px] z-40 flex items-center gap-3 rounded-[8px] border border-border bg-chat px-3 py-3 shadow-lg"
    >
      <Download size={20} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-txt-primary">
          Versão {novidade.versao} disponível
        </p>
        <p className="truncate text-xs text-txt-muted">
          {novidade.notas ?? "Baixe a nova versão no navegador."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void abrirNoSistema(novidade.url)}
        className="shrink-0 rounded-[3px] bg-accent px-3 py-2 text-sm font-medium text-accent-ink"
      >
        Baixar
      </button>
      <button
        type="button"
        aria-label="Dispensar aviso de atualização"
        onClick={() => setFechado(true)}
        className="shrink-0 p-1 text-txt-muted"
      >
        <X size={16} />
      </button>
    </div>
  );
}
