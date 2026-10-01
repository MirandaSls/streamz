"use client";

import { useId, useState } from "react";
import { GUILD_FOLDER_COLORS, MAX_FOLDER_NAME_LENGTH } from "@streamz/shared";
import { Button, Campo, Modal, TextInput } from "@/components/ui/primitivos";
import { Check, Pencil } from "@/components/ui/icones";

/**
 * "Configurações de pasta" (clique direito na pasta da barra de servidores):
 * nome e cor. Edita um **rascunho**; Pronto, ×, Esc e clique fora aplicam o
 * rascunho — como o Discord, que não tem "Cancelar" aqui.
 *
 * `color: null` é a cor padrão da UI (o accent do tema), por isso o contrato
 * não fixa uma cor de tema; nome vazio vira `null` (nome derivado dos servidores).
 */

export interface ConfiguracoesDePasta {
  name: string | null;
  color: string | null;
}

export interface ModalConfiguracoesDePastaProps {
  aberto: boolean;
  folderName: string | null;
  folderColor: string | null;
  /** Nome derivado dos servidores da pasta; aparece como placeholder. */
  placeholderNome: string;
  onSalvar: (v: ConfiguracoesDePasta) => void;
  onFechar: () => void;
}

const COR_HEX = /^#[0-9a-fA-F]{6}$/;

/** Nomes das 20 cores de `GUILD_FOLDER_COLORS`, na mesma ordem (duas linhas de 10), para o leitor de tela. */
const NOMES_DAS_CORES = [
  "Ciano", "Verde-menta", "Azul-claro", "Rosa-lilás", "Rosa",
  "Amarelo", "Amarelo-ouro", "Salmão", "Branco", "Azul-acinzentado-claro",
  "Turquesa", "Verde", "Azul", "Roxo", "Rosa-escuro",
  "Âmbar", "Laranja", "Vermelho", "Branco-gelo", "Cinza-azulado",
];

function mesmaCor(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

/** Normaliza o rascunho no formato de saída: espaços aparados, vazio vira `null`. */
export function rascunhoParaSaida(nome: string, cor: string | null): ConfiguracoesDePasta {
  const limpo = nome.trim().slice(0, MAX_FOLDER_NAME_LENGTH);
  return { name: limpo === "" ? null : limpo, color: cor !== null && COR_HEX.test(cor) ? cor : null };
}

export function ModalConfiguracoesDePasta(props: ModalConfiguracoesDePastaProps) {
  if (!props.aberto) return null;
  return <Conteudo {...props} />;
}

function Conteudo({
  folderName,
  folderColor,
  placeholderNome,
  onSalvar,
  onFechar,
}: ModalConfiguracoesDePastaProps) {
  const idDoNome = useId();
  const [nome, setNome] = useState(folderName ?? "");
  const [cor, setCor] = useState<string | null>(folderColor);

  function concluir() {
    onSalvar(rascunhoParaSaida(nome, cor));
    onFechar();
  }

  return (
    <Modal aoFechar={concluir} titulo="Configurações de pasta" tamanho="medio" classeDoCorpo="flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          concluir();
        }}
      >
        <Campo rotulo="Nome da pasta" htmlFor={idDoNome} rotuloDiscreto>
          <TextInput
            id={idDoNome}
            data-autofocus
            value={nome}
            maxLength={MAX_FOLDER_NAME_LENGTH}
            placeholder={placeholderNome || "Pasta do servidor"}
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>

        <Campo rotulo="Cor da pasta" rotuloDiscreto>
          <div role="radiogroup" aria-label="Cor da pasta" className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={cor === null}
                aria-label="Cor padrão"
                onClick={() => setCor(null)}
                className="flex h-[50px] w-[70px] items-center justify-center rounded-[3px] bg-background-brand outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-link"
              >
                {cor === null && (
                  <Check width={24} height={24} aria-hidden className="shrink-0 text-control-primary-text-default" />
                )}
              </button>
              <label
                aria-label="Cor personalizada"
                className="relative flex h-[50px] w-[70px] cursor-pointer items-center justify-center rounded-[3px] border border-border-subtle focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text-link"
                style={cor !== null ? { backgroundColor: cor } : undefined}
              >
                <input
                  type="color"
                  value={cor && COR_HEX.test(cor) ? cor.toLowerCase() : "#9be31f"}
                  onChange={(e) => {
                    if (COR_HEX.test(e.target.value)) setCor(e.target.value.toLowerCase());
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Escolher cor personalizada"
                />
                <Pencil
                  width={14}
                  height={14}
                  aria-hidden
                  className={`absolute right-1 top-1 ${cor !== null ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" : "text-text-normal"}`}
                />
              </label>
            </div>

            <div className="grid grid-cols-10 gap-x-2 gap-y-2" style={{ width: "fit-content" }}>
              {GUILD_FOLDER_COLORS.map((c, i) => {
                const marcada = mesmaCor(c, cor);
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    aria-label={NOMES_DAS_CORES[i] ?? c}
                    onClick={() => setCor(c)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-link"
                    style={{ backgroundColor: c }}
                  >
                    {marcada && <Check width={14} height={14} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>
        </Campo>

        <Button type="submit" larguraTotal>
          Pronto
        </Button>
      </form>
    </Modal>
  );
}
