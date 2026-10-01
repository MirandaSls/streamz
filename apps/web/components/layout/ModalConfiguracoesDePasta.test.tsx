import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModalConfiguracoesDePasta } from "./ModalConfiguracoesDePasta";

// o Modal real só monta no cliente (portal); aqui interessa o corpo, então ele vira passagem direta
vi.mock("@/components/ui/primitivos", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function html(folderColor: string | null) {
  return renderToStaticMarkup(
    <ModalConfiguracoesDePasta
      aberto
      folderName={null}
      folderColor={folderColor}
      placeholderNome="Pasta"
      onSalvar={() => {}}
      onFechar={() => {}}
    />,
  );
}

function swatchPadrao(h: string): string {
  const m = h.match(/<button[^>]*aria-label="Cor padrão"[^>]*>.*?<\/button>/s);
  if (!m) throw new Error("swatch padrão ausente");
  return m[0];
}

describe("ModalConfiguracoesDePasta — swatch da cor padrão", () => {
  it("cor padrão: fundo de marca cheio e check escuro", () => {
    const s = swatchPadrao(html(null));
    expect(s).toContain("bg-background-brand");
    expect(s).toContain('aria-checked="true"');
    expect(s).toContain("<svg");
    expect(s).toContain("text-control-primary-text-default");
  });

  it("outra cor: continua verde, sem check", () => {
    const s = swatchPadrao(html("#3498db"));
    expect(s).toContain("bg-background-brand");
    expect(s).toContain('aria-checked="false"');
    expect(s).not.toContain("<svg");
  });
});
