"use client";

import { useId, useState } from "react";
import { MAX_APP_NAME, appCriarSchema } from "@streamz/shared";
import { Button, Campo, MensagemDeAjuda, TextInput } from "@/components/ui/primitivos";
import { errorMessage } from "@/stores/socket-adapter";
import { TituloDaTela, Voltar } from "./pecas";

/**
 * Criar aplicativo: só o nome.
 *
 * O Discord cria aplicativo no portal web, num diálogo "Create an application"
 * com um campo NAME — não no cliente, e sem referência de medida aqui dentro.
 * O formulário usa só primitivos (`Campo` = `.legend_b717a1`, rótulo 16/500
 * sem caixa-alta; `TextInput` md de 40), e os botões ficam à direita na ordem
 * dos rodapés de diálogo do Discord (secundário, depois o primário). As
 * distâncias entre título, texto e campo (8/24): não medidas.
 *
 * Estados: **inválido** (nome vazio ou só espaços) desabilita "Criar" — é o
 * mesmo `appCriarSchema` da API, recusando antes do round-trip; **enviando**
 * troca o texto do botão pelos três pontos do primitivo (`carregando`, que
 * também bloqueia o segundo clique); **erro** da API vira mensagem de ajuda
 * de erro acima do campo e mantém o que foi digitado.
 */
export function TelaDeCriar({
  aoVoltar,
  aoCriar,
}: {
  aoVoltar: () => void;
  aoCriar: (nome: string) => Promise<void>;
}) {
  const id = useId();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const valido = appCriarSchema.safeParse({ name: nome }).success && nome.trim().length > 0;

  async function enviar() {
    if (!valido || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoCriar(nome.trim());
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível criar o aplicativo"));
      setSalvando(false);
    }
  }

  return (
    <div>
      <Voltar onClick={aoVoltar}>Aplicativos</Voltar>
      <TituloDaTela>Criar aplicativo</TituloDaTela>
      <p className="mt-2 text-text-sm text-text-subtle">
        Só o nome. Descrição, ícone e visibilidade se editam depois — o token aparece assim que o
        aplicativo existir, uma única vez.
      </p>

      {erro ? (
        <div className="mt-4">
          <MensagemDeAjuda tom="erro">{erro}</MensagemDeAjuda>
        </div>
      ) : null}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <Campo
          rotulo="Nome"
          htmlFor={id}
          obrigatorio
          ajuda={`Vira também o nome do usuário-bot na lista de membros. ${nome.trim().length}/${MAX_APP_NAME}`}
        >
          <TextInput
            id={id}
            value={nome}
            maxLength={MAX_APP_NAME}
            autoFocus
            placeholder="Música do Zé"
            disabled={salvando}
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variante="secundario" onClick={aoVoltar} className="celular:flex-1">
            Cancelar
          </Button>
          <Button
            type="submit"
            variante="primario"
            disabled={!valido}
            carregando={salvando}
            className="celular:flex-1"
          >
            Criar
          </Button>
        </div>
      </form>
    </div>
  );
}
