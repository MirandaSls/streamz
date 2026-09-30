"use client";

import { useEffect, useId, useState } from "react";
import { rotuloPlataforma, type DownloadDisponivel, type DownloadVersao } from "@streamz/shared";
import { FieldLabel } from "@/components/auth/AuthCard";
import { Button, Modal, Select, TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { formatBytes } from "@/lib/format";
import { notaDeInstalacao } from "./InstalacaoNoSistema";
import { BlocoDeComando } from "./BlocoDeComando";
import {
  comandoDeDownloadMac,
  comandoDoTerminalMac,
  dataDoInstalador,
  mensagemDeErroDoDownload,
  ORIGEM_PADRAO_DO_INSTALADOR,
  origemDoInstalador,
} from "./plataformas";

/** Como o Mac recebe o app: o `.dmg` pelo navegador ou um comando no Terminal. */
type ModoMac = "dmg" | "instalar" | "baixar";

const OPCOES_MAC: { valor: ModoMac; rotulo: string }[] = [
  { valor: "dmg", rotulo: "Arquivo .dmg" },
  { valor: "instalar", rotulo: "Instalar pelo Terminal" },
  { valor: "baixar", rotulo: "Baixar pelo Terminal" },
];

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
  // `null` = lista não aberta: o fluxo normal baixa o mais recente sem passo extra
  const [versoes, setVersoes] = useState<DownloadVersao[] | null>(null);
  const [versaoEscolhida, setVersaoEscolhida] = useState<string | null>(null);
  const [listando, setListando] = useState(false);
  const idDaVersao = `${idDoFormulario}-versao`;
  const ehMac = disponivel.plataforma === "macos";
  const [modo, setModo] = useState<ModoMac>("dmg");
  // tela de resultado dos modos de Terminal; só existe com a senha já aceita
  const [comComando, setComComando] = useState(false);
  // a origem só é conhecida no navegador: o pré-render parte da de produção
  const [origem, setOrigem] = useState(ORIGEM_PADRAO_DO_INSTALADOR);
  const idDoModo = `${idDoFormulario}-modo`;
  const porTerminal = ehMac && modo !== "dmg";
  const escolhida = versoes?.find((v) => v.versao === versaoEscolhida) ?? null;
  const tamanho = escolhida?.tamanho ?? disponivel.tamanho;
  const data = dataDoInstalador(escolhida?.atualizadoEm ?? disponivel.atualizadoEm);

  // o foco vai para o Select quando a lista chega: o botão que tinha o foco
  // some do DOM e, sem isso, o foco cairia no <body>
  useEffect(() => {
    if (versoes) document.getElementById(idDaVersao)?.focus();
  }, [versoes, idDaVersao]);

  useEffect(() => {
    setOrigem(origemDoInstalador(window.location.protocol, window.location.origin));
  }, []);

  function aoMudarModo(novo: ModoMac) {
    setModo(novo);
    setErro(null);
    // a lista aberta num modo não vale no outro: cada um recomeça do padrão
    setVersoes(null);
    setVersaoEscolhida(null);
  }

  // Só confere a senha (a lista de versões exige a mesma) e troca de tela. A
  // senha nunca entra no comando: o script pede de novo, sem deixá-la no histórico.
  async function aoVerComando() {
    setErro(null);
    setCarregando(true);
    try {
      const { versoes: lista } = await api.downloadVersoes(senha, disponivel.plataforma);
      if (lista.length === 0) {
        setErro("Nenhuma versão disponível para este sistema.");
        return;
      }
      setVersoes(lista);
      setVersaoEscolhida(lista[0].versao);
      setSenha("");
      setComComando(true);
    } catch (err) {
      setErro(mensagemDeErroDoDownload(err));
    } finally {
      setCarregando(false);
    }
  }

  function aoVoltar() {
    setComComando(false);
    setVersoes(null);
    setVersaoEscolhida(null);
  }

  async function aoListarVersoes() {
    if (carregando || listando) return;
    if (!senha.trim()) {
      setErro("Informe a senha para ver as versões");
      return;
    }
    setErro(null);
    setListando(true);
    try {
      const { versoes: lista } = await api.downloadVersoes(senha, disponivel.plataforma);
      if (lista.length === 0) {
        setErro("Nenhuma versão disponível para este sistema.");
        return;
      }
      setVersoes(lista);
      setVersaoEscolhida(lista[0].versao);
    } catch (err) {
      setErro(mensagemDeErroDoDownload(err));
    } finally {
      setListando(false);
    }
  }

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (carregando || !senha.trim()) return;
    if (porTerminal) {
      void aoVerComando();
      return;
    }
    setErro(null);
    setCarregando(true);
    try {
      // `undefined` quando a lista não foi aberta ou a escolhida é a mais
      // recente: o caminho normal segue idêntico ao de antes da seletor
      const versaoPedida =
        versoes && versaoEscolhida && versaoEscolhida !== versoes[0].versao ? versaoEscolhida : undefined;
      const autorizado = await api.downloadAutorizar(senha, disponivel.plataforma, versaoPedida);
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
    // a instrução do sistema (Gatekeeper, `chmod +x`) aparece aqui, no momento
    // em que o arquivo chega — é quando a pessoa vai tropeçar nela
    const nota = notaDeInstalacao(disponivel.plataforma);
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
      >
        {nota ? <p className="text-text-sm text-text-muted">{nota}</p> : null}
      </Modal>
    );
  }

  if (comComando && versoes) {
    // a mais recente vai sem `versao`: o script já busca sempre a última
    const versaoDoComando =
      versaoEscolhida && versaoEscolhida !== versoes[0].versao ? versaoEscolhida : undefined;
    const instalar = modo === "instalar";
    const comando = instalar
      ? comandoDoTerminalMac(origem, API_URL, versaoDoComando)
      : comandoDeDownloadMac(API_URL, versaoDoComando);
    return (
      <Modal
        aoFechar={aoFechar}
        titulo={instalar ? "Instalar pelo Terminal" : "Baixar pelo Terminal"}
        subtitulo="Senha aceita. Escolha a versão e cole o comando no Terminal."
        rodape={
          <>
            <Button variante="secundario" onClick={aoVoltar} className="celular:h-[48px]">
              Voltar
            </Button>
            <Button variante="primario" onClick={aoFechar} className="celular:h-[48px]">
              Fechar
            </Button>
          </>
        }
      >
        <FieldLabel htmlFor={idDaVersao}>Versão</FieldLabel>
        <Select
          id={idDaVersao}
          opcoes={versoes.map((v, i) => ({
            valor: v.versao,
            rotulo: i === 0 ? `${v.versao} (mais recente)` : v.versao,
          }))}
          valor={versaoEscolhida}
          aoMudar={setVersaoEscolhida}
        />
        <BlocoDeComando
          className="mt-4"
          titulo={instalar ? "Comando de instalação" : "Comando de download"}
          comando={comando}
          dica={
            instalar
              ? "Cole no Terminal. Ele pede a mesma senha de acesso."
              : "Cole no Terminal. Ele pede a senha e salva o .dmg em Downloads."
          }
        />
      </Modal>
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
            disabled={!senha.trim() || listando}
            className="celular:h-[48px]"
          >
            {porTerminal ? "Ver comando" : "Baixar"}
          </Button>
        </>
      }
    >
      <form id={idDoFormulario} onSubmit={aoEnviar} noValidate>
        <p className="mb-4 text-text-sm text-text-muted">
          {rotulo} · {formatBytes(tamanho)}
          {escolhida ? ` · versão ${escolhida.versao}` : ""}
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
          disabled={carregando || listando}
          erro={!!erro}
          autoFocus
        />

        {ehMac ? (
          <fieldset className="mt-4 min-w-0 border-0 p-0" disabled={carregando || listando}>
            <legend className="mb-2 text-text-sm font-medium text-text-strong">Como quer baixar?</legend>
            <div className="flex flex-col gap-2">
              {OPCOES_MAC.map((o) => (
                <label
                  key={o.valor}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-text-sm text-text-default celular:min-h-[44px] focus-within:ring-2 focus-within:ring-brand-500 ${
                    modo === o.valor ? "border-brand-500 bg-brand-500/10" : "border-border-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    name={idDoModo}
                    value={o.valor}
                    checked={modo === o.valor}
                    onChange={() => aoMudarModo(o.valor)}
                    className="accent-brand-500"
                  />
                  {o.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {porTerminal ? null : versoes ? (
          <div className="mt-4">
            <FieldLabel htmlFor={idDaVersao}>Versão</FieldLabel>
            <Select
              id={idDaVersao}
              opcoes={versoes.map((v, i) => ({
                valor: v.versao,
                rotulo: i === 0 ? `${v.versao} (mais recente)` : v.versao,
              }))}
              valor={versaoEscolhida}
              aoMudar={setVersaoEscolhida}
              desabilitado={carregando}
            />
          </div>
        ) : (
          <Button
            variante="link"
            type="button"
            onClick={aoListarVersoes}
            carregando={listando}
            disabled={carregando}
            className="mt-2 celular:min-h-[44px]"
          >
            Escolher outra versão
          </Button>
        )}

        <p role="alert" aria-live="polite" className="sr-only">
          {erro}
        </p>
      </form>
    </Modal>
  );
}
