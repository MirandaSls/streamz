"use client";

import { useId, useState } from "react";
import { rotuloPlataforma, type DownloadDisponivel } from "@streamz/shared";
import { FieldLabel } from "@/components/auth/AuthCard";
import { Button, Modal, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { dataDoInstalador, mensagemDeErroDoDownload } from "./plataformas";

/**
 * A etapa da senha, aberta pelo botão "Baixar" da plataforma escolhida.
 *
 * **O fluxo de segurança é o da página antiga, sem mudança nenhuma.** A senha
 * não é conferida aqui: esta caixa só a envia. Quem decide é
 * `POST /api/downloads/token` (`api.downloadAutorizar`), e o arquivo só sai por
 * uma rota que exige o token que essa checagem emite. Não há link de download
 * no HTML — abrir o DevTools e chamar a função de sucesso na mão não produz
 * nada, porque o link ainda não existe.
 *
 * É o `Modal` primitivo (480, raio 12, Esc, foco preso e devolvido). No celular
 * ele ocupa a largura da tela e o "voltar" do sistema o fecha antes de sair da
 * página — isso já vem do primitivo (`useVoltarNoCelular`).
 *
 * Os casos que a página antiga tratava, todos aqui:
 * - senha errada (401), muitas tentativas (429) e a frase do servidor para
 *   404/503 (sem instalador para o sistema, download desligado);
 * - carregando: o botão troca o texto pelos três pontos e o campo trava;
 * - "o download começou": se o navegador bloqueou, informar a senha de novo
 *   gera um link novo (o token vale só 120 s — `DOWNLOAD_TOKEN_TTL_SECONDS`).
 */
export default function EtapaDaSenha({
  disponivel,
  aoFechar,
}: {
  disponivel: DownloadDisponivel;
  aoFechar: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const idDoFormulario = useId();
  const rotulo = rotuloPlataforma(disponivel.plataforma);
  const data = dataDoInstalador(disponivel.atualizadoEm);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (carregando || !senha.trim()) return;
    setErro(null);
    setCarregando(true);
    try {
      const autorizado = await api.downloadAutorizar(senha, disponivel.plataforma);
      // navegação direta: o browser assume a transferência (barra de progresso,
      // pausar, retomar). Um fetch+blob teria de segurar o instalador inteiro
      // na memória da aba antes de salvar. A resposta é `Content-Disposition:
      // attachment`, então a página não sai do lugar e este estado sobrevive.
      window.location.href = autorizado.url;
      setBaixando(autorizado.filename);
      setSenha("");
    } catch (err) {
      setErro(mensagemDeErroDoDownload(err));
    } finally {
      setCarregando(false);
    }
  }

  if (baixando) {
    return (
      <Modal
        aoFechar={aoFechar}
        titulo="O download começou"
        subtitulo={`Se nada aconteceu, o navegador pode ter bloqueado — informe a senha de novo para gerar um link novo (${baixando}).`}
        rodape={
          <>
            <Button variante="secundario" onClick={aoFechar} className="celular:h-[48px]">
              Fechar
            </Button>
            <Button
              variante="primario"
              onClick={() => setBaixando(null)}
              className="celular:h-[48px]"
              data-autofocus
            >
              Baixar de novo
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Modal
      aoFechar={aoFechar}
      titulo={`Baixar para ${rotulo}`}
      subtitulo="O app ainda é fechado. Informe a senha de acesso para baixar."
      rodape={
        <>
          <Button
            variante="secundario"
            onClick={aoFechar}
            disabled={carregando}
            className="celular:h-[48px]"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={idDoFormulario}
            variante="primario"
            carregando={carregando}
            disabled={!senha.trim()}
            className="celular:h-[48px]"
          >
            Baixar
          </Button>
        </>
      }
    >
      <form id={idDoFormulario} onSubmit={aoEnviar} noValidate>
        <p className="mb-4 text-text-sm text-text-muted">
          {rotulo} · {formatBytes(disponivel.tamanho)}
          {data ? ` · atualizado em ${data}` : ""}
        </p>

        <FieldLabel htmlFor={`${idDoFormulario}-senha`} invalid={!!erro} hint={erro ?? undefined}>
          Senha de acesso
        </FieldLabel>
        <TextInput
          id={`${idDoFormulario}-senha`}
          name="senha"
          type="password"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          disabled={carregando}
          erro={!!erro}
          autoFocus
        />

        <p role="alert" aria-live="polite" className="sr-only">
          {erro}
        </p>
      </form>
    </Modal>
  );
}
