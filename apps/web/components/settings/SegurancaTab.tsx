"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Download,
  Laptop,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "@/components/ui/icones";
import type { MfaSetup, MinhaConta } from "@streamz/shared";
import { ConfiguracoesRelacionadas, RadioCards, Section } from "@/components/ui/controls";
import { Button } from "@/components/ui/primitivos";
import { CampoDeTexto, Erro } from "@/components/settings/campos";
import { useIrParaAba } from "@/components/settings/navegacao";
import {
  usePrivacidade,
  type FiltroDeConteudo,
  type QuemPodeChamar,
} from "@/stores/privacidade";
import { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";
import { useConta } from "@/stores/conta";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * "Privacidade e segurança": verificação em duas etapas, filtro de conteúdo,
 * quem pode te chamar e o que fazer com os seus dados.
 *
 * A lista de sessões **não** está aqui: ela é a aba "Dispositivos". Ter as duas
 * mostrando a mesma lista significava duas telas para encerrar a mesma sessão,
 * e nenhuma das duas era a resposta óbvia para "onde eu deslogo o outro
 * computador".
 *
 * A conta é recarregada depois de cada operação de 2FA em vez de ser adivinhada
 * no cliente — quantos códigos de recuperação sobraram é conta do servidor.
 *
 * Estados cobertos (cartão 6d): **carregando** e **erro** nos dois blocos que
 * dependem de `conta` (esqueleto pulsando / linha de erro com "Tentar de
 * novo" — mesma forma da `Esqueleto` de `modals/UserProfileModal.tsx`);
 * **vazio** no cartão de 2FA, quando `recoveryCodesLeft` chega a zero (aviso
 * em `--status-warning`, não silêncio); hover/foco/desabilitado vêm de graça
 * dos primitivos (`Button`, `CampoDeTexto`). **Não existe estado "sem
 * permissão"**: as rotas de `/me/*` só respondem pelo dono do token — não há
 * papel nem ownership para negar aqui, diferente de uma aba de servidor.
 */
export default function SegurancaTab() {
  // a conta vive numa store, e não aqui: `account.updated` chega a todas as
  // conexões da pessoa, e ligar o 2FA num aparelho tem de aparecer no outro
  const conta = useConta((s) => s.conta);
  const carregar = useConta((s) => s.carregar);
  const irParaAba = useIrParaAba();

  // `carregando` é local porque `useConta.carregar` só avisa erro por toast
  // (nunca relança) — sem um estado próprio aqui, a tela não distingue "ainda
  // buscando" de "buscou e falhou", e o bloco de 2FA mostraria "Desativada"
  // por engano enquanto a conta de verdade ainda não chegou.
  const [carregando, setCarregando] = useState(true);

  const tentar = useCallback(() => {
    setCarregando(true);
    void carregar().finally(() => setCarregando(false));
  }, [carregar]);

  useEffect(() => {
    tentar();
  }, [tentar]);

  // depois do primeiro carregamento, `conta` continua `null` só quando a
  // busca falhou — em sucesso o servidor sempre devolve a conta de quem está
  // autenticado.
  const falhouCarregar = !carregando && !conta;

  return (
    <>
      <BlocoDeMfa
        conta={conta}
        carregando={carregando}
        falhouCarregar={falhouCarregar}
        recarregar={tentar}
      />
      <BlocoDeFiltro />
      <BlocoDeMensagens />
      <BlocoDeDados
        conta={conta}
        carregando={carregando}
        falhouCarregar={falhouCarregar}
        recarregar={tentar}
      />
      <ConfiguracoesRelacionadas
        titulo="Configurações relacionadas"
        itens={[
          {
            id: "dispositivos",
            label: "Dispositivos",
            hint: "Veja e encerre as sessões abertas da sua conta.",
            icon: <Laptop size={18} aria-hidden="true" />,
            onSelect: () => irParaAba("dispositivos"),
          },
        ]}
      />
    </>
  );
}

/**
 * Linha rótulo + ação, na forma da linha carregada (ícone/texto à esquerda,
 * botão à direita) — mesma altura, para a tela não pular quando a busca da
 * conta falha. `comBorda` replica a divisória que separa o cartão de 2FA das
 * suas próprias formas; o de "Dados e privacidade" não tem.
 */
function LinhaDeErro({
  mensagem,
  tentar,
  comBorda = false,
}: {
  mensagem: string;
  tentar: () => void;
  comBorda?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${
        comBorda ? "border-b border-border-subtle" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">{mensagem}</p>
      </div>
      <Button
        variante="secundario"
        tamanho="sm"
        icone={<RefreshCw size={14} aria-hidden="true" />}
        onClick={tentar}
        className="shrink-0 celular:h-[44px]"
      >
        Tentar de novo
      </Button>
    </div>
  );
}

/** Esqueleto da mesma linha, enquanto a conta ainda não chegou. */
function LinhaDeEsqueleto({ comBorda = false }: { comBorda?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-between gap-4 py-3 ${
        comBorda ? "border-b border-border-subtle" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="h-3.5 w-32 animate-pulse rounded bg-background-base-lowest" />
        <span className="h-3 w-56 animate-pulse rounded bg-background-base-lowest" />
      </div>
      <span className="h-8 w-24 shrink-0 animate-pulse rounded-lg bg-background-base-lowest" />
    </div>
  );
}

// ── privacidade ──────────────────────────────────────────────

function BlocoDeFiltro() {
  const filtro = usePrivacidade((s) => s.filtro);
  const set = usePrivacidade((s) => s.set);

  return (
    <Section id="filtro" title="Filtro de conteúdo explícito">
      <RadioCards<FiltroDeConteudo>
        legend="Filtro de conteúdo explícito"
        legendaOculta
        columns={1}
        value={filtro}
        onChange={(v) => set({ filtro: v })}
        options={[
          {
            value: "todos",
            label: "Filtrar tudo",
            hint: "Toda imagem enviada em conversa direta é analisada.",
          },
          {
            value: "naoAmigos",
            label: "Filtrar de quem não é meu amigo",
            hint: "O padrão: seus amigos passam, o resto é analisado.",
          },
          {
            value: "nenhum",
            label: "Não filtrar",
            hint: "Nada é analisado. Por sua conta e risco.",
          },
        ]}
      />
    </Section>
  );
}

function BlocoDeMensagens() {
  const quem = usePrivacidade((s) => s.quemPodeChamar);
  const set = usePrivacidade((s) => s.set);

  return (
    <Section id="mensagens" title="Quem pode te mandar mensagem">
      <RadioCards<QuemPodeChamar>
        legend="Quem pode te mandar mensagem"
        legendaOculta
        columns={1}
        value={quem}
        onChange={(v) => set({ quemPodeChamar: v })}
        options={[
          { value: "todos", label: "Qualquer pessoa" },
          { value: "amigosDeAmigos", label: "Amigos de amigos" },
          { value: "amigos", label: "Apenas meus amigos" },
        ]}
      />
      <p className="pt-3 text-xs text-text-muted">
        Bloquear alguém encerra a conversa dos dois lados, independente desta escolha.
      </p>
    </Section>
  );
}

/**
 * "Dados e privacidade" com a única ação que o app consegue cumprir hoje:
 * baixar o que a própria API já devolve sobre a conta. Um botão de "solicitar
 * meus dados" que abre um chamado inexistente seria pior que não ter botão.
 *
 * O botão fica desabilitado até `conta` chegar (`carregando` ou
 * `falhouCarregar`): `baixar` fecha sobre a `conta` da store, e clicar antes
 * dela chegar gravaria `"conta": null` no arquivo — o mesmo bug que o
 * esqueleto do bloco de 2FA evita para a tela, aqui evitado para o arquivo
 * exportado.
 */
function BlocoDeDados({
  conta,
  carregando,
  falhouCarregar,
  recarregar,
}: {
  conta: MinhaConta | null;
  carregando: boolean;
  falhouCarregar: boolean;
  recarregar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function baixar() {
    setOcupado(true);
    try {
      const [perfil, sessoes] = await Promise.all([api.me(), api.sessions().catch(() => [])]);
      const dados = JSON.stringify({ conta, perfil, sessoes }, null, 2);
      const url = URL.createObjectURL(new Blob([dados], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "streamz-meus-dados.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível montar o arquivo"), "error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Section id="dados" title="Dados e privacidade" semDivisoria>
      {carregando ? (
        <LinhaDeEsqueleto />
      ) : falhouCarregar ? (
        <LinhaDeErro mensagem="Não foi possível carregar os dados da sua conta." tentar={recarregar} />
      ) : (
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-strong">Baixar meus dados</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Um arquivo com a sua conta, o seu perfil e as suas sessões ativas.
            </p>
          </div>
          <Button
            variante="secundario"
            tamanho="sm"
            icone={<Download size={14} aria-hidden="true" />}
            disabled={ocupado}
            onClick={() => void baixar()}
            className="shrink-0 celular:h-[44px]"
          >
            {ocupado ? "Montando…" : "Baixar"}
          </Button>
        </div>
      )}
    </Section>
  );
}

// ── 2FA ──────────────────────────────────────────────────────

function BlocoDeMfa({
  conta,
  carregando,
  falhouCarregar,
  recarregar,
}: {
  conta: MinhaConta | null;
  carregando: boolean;
  falhouCarregar: boolean;
  /** também é o "Tentar de novo" do estado de erro. */
  recarregar: () => void;
}) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [desligando, setDesligando] = useState(false);
  const [regerando, setRegerando] = useState(false);
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function limpar() {
    setSetup(null);
    setDesligando(false);
    setRegerando(false);
    setCodigo("");
    setSenha("");
    setErro(null);
  }

  async function comecar() {
    setErro(null);
    setOcupado(true);
    try {
      setSetup(await api.mfaSetup());
    } catch (e) {
      setErro(mensagemDeAuth(e, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  async function ativar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const { recoveryCodes } = await api.mfaEnable(codigo.trim());
      limpar();
      setCodigosNovos(recoveryCodes);
      await recarregar();
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  async function desativar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.mfaDisable(senha, codigo.trim());
      limpar();
      setCodigosNovos(null);
      await recarregar();
      ui.toast("Verificação em duas etapas desligada.");
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  // a senha é pedida num campo `type="password"` aqui, e não no `ui.prompt`:
  // aquele diálogo é de texto simples e mostraria a senha na tela
  async function regerar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const { recoveryCodes } = await api.mfaRecoveryCodes(senha);
      limpar();
      setCodigosNovos(recoveryCodes);
      await recarregar();
    } catch (err) {
      setErro(mensagemDeAuth(err, "conta"));
    } finally {
      setOcupado(false);
    }
  }

  const ligado = !!conta?.mfaEnabled;
  // estado **vazio** do cartão: 2FA ligado mas sem nenhum código de
  // recuperação sobrando — perder o autenticador nesse ponto tranca a conta,
  // então o aviso troca de cor em vez de terminar em "0" como se fosse só
  // informativo.
  const semCodigos = ligado && (conta?.recoveryCodesLeft ?? 0) === 0;

  return (
    <Section id="seguranca" title="Segurança da conta">
      {carregando ? (
        <LinhaDeEsqueleto comBorda />
      ) : falhouCarregar ? (
        <LinhaDeErro
          mensagem="Não foi possível carregar o estado da verificação em duas etapas."
          tentar={recarregar}
          comBorda
        />
      ) : (
        <>
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-text-strong">
              {ligado ? (
                <ShieldCheck size={16} className="text-status-positive" aria-hidden="true" />
              ) : (
                <ShieldOff size={16} className="text-text-muted" aria-hidden="true" />
              )}
              {ligado ? "Ativa" : "Desativada"}
            </p>
            <p
              className={`mt-0.5 flex items-center gap-1 text-xs ${
                semCodigos ? "text-status-warning" : "text-text-muted"
              }`}
            >
              {semCodigos && (
                <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
              )}
              {ligado
                ? semCodigos
                  ? "Nenhum código de recuperação restante — gere novos códigos."
                  : `${conta?.recoveryCodesLeft ?? 0} código(s) de recuperação restante(s).`
                : "Um código de 6 dígitos do seu app autenticador, além da senha."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {ligado && (
              <Button
                variante="secundario"
                tamanho="sm"
                onClick={() => (regerando ? limpar() : (setDesligando(false), setRegerando(true)))}
                className="celular:h-[44px]"
              >
                {regerando ? "Cancelar" : "Novos códigos"}
              </Button>
            )}
            {ligado ? (
              <Button
                variante="critico-secundario"
                tamanho="sm"
                onClick={() => (desligando ? limpar() : (setRegerando(false), setDesligando(true)))}
                className="celular:h-[44px]"
              >
                {desligando ? "Cancelar" : "Desativar"}
              </Button>
            ) : (
              <Button
                variante="primario"
                tamanho="sm"
                disabled={ocupado}
                onClick={() => (setup ? limpar() : void comecar())}
                className="celular:h-[44px]"
              >
                {setup ? "Cancelar" : "Ativar"}
              </Button>
            )}
          </div>
        </div>

        {setup && (
          <form onSubmit={ativar} noValidate className="pt-3">
            <p className="mb-3 text-sm text-text-default">
              Leia o QR no seu app autenticador (Google Authenticator, Authy, 1Password…) e digite o
              código que ele mostrar.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="QR code da verificação em duas etapas"
                width={160}
                height={160}
                // `bg-white` é a exceção deliberada ao vocabulário de tokens: um
                // QR precisa de zona de silêncio clara para o leitor de câmera
                // achar as bordas, e isso vale nos dois temas — não é uma
                // escolha de cor de superfície.
                className="rounded bg-white p-2"
              />
              <div className="min-w-0">
                <p className="mb-1 text-xs font-bold uppercase text-text-subtle">
                  Ou digite o segredo
                </p>
                <code className="block break-all rounded bg-input-background-default px-2 py-1 text-sm text-text-default">
                  {setup.secret}
                </code>
                <BotaoCopiar texto={setup.secret} rotulo="Copiar segredo" />
              </div>
            </div>
            <CampoDeTexto
              id="mfa-codigo"
              rotulo="Código do app"
              autoComplete="one-time-code"
              value={codigo}
              onChange={setCodigo}
              disabled={ocupado}
            />
            <Erro texto={erro} />
            <PrimaryButton type="submit" disabled={ocupado || !codigo.trim()}>
              {ocupado ? "Confirmando…" : "Ativar"}
            </PrimaryButton>
          </form>
        )}

        {regerando && (
          <form onSubmit={regerar} noValidate className="pt-3">
            <p className="mb-3 text-sm text-text-default">
              Os códigos atuais deixam de valer assim que os novos forem gerados.
            </p>
            <CampoDeTexto
              id="mfa-senha-regerar"
              rotulo="Sua senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={setSenha}
              disabled={ocupado}
            />
            <Erro texto={erro} />
            <PrimaryButton type="submit" disabled={ocupado || !senha}>
              {ocupado ? "Gerando…" : "Gerar novos códigos"}
            </PrimaryButton>
          </form>
        )}

        {desligando && (
          <form onSubmit={desativar} noValidate className="pt-3">
            <CampoDeTexto
              id="mfa-senha"
              rotulo="Sua senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={setSenha}
              disabled={ocupado}
            />
            <CampoDeTexto
              id="mfa-codigo-off"
              rotulo="Código do app ou de recuperação"
              autoComplete="one-time-code"
              value={codigo}
              onChange={setCodigo}
              disabled={ocupado}
            />
            <Erro texto={erro} />
            <PrimaryButton type="submit" danger disabled={ocupado || !senha || !codigo.trim()}>
              {ocupado ? "Aguarde…" : "Desativar verificação em duas etapas"}
            </PrimaryButton>
          </form>
        )}

        {codigosNovos && <CodigosDeRecuperacao codigos={codigosNovos} aoFechar={() => setCodigosNovos(null)} />}
        </>
      )}
    </Section>
  );
}

/**
 * Os códigos aparecem **uma única vez**: o servidor só guarda o hash. Por isso a
 * tela insiste em copiar/baixar antes de fechar.
 */
function CodigosDeRecuperacao({
  codigos,
  aoFechar,
}: {
  codigos: string[];
  aoFechar: () => void;
}) {
  const texto = codigos.join("\n");

  function baixar() {
    const blob = new Blob([`Códigos de recuperação do Streamz\n\n${texto}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streamz-codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 rounded border border-status-warning bg-background-base-lowest p-3">
      <p className="mb-2 text-sm font-medium text-text-strong">
        Guarde estes códigos agora — eles não aparecem de novo.
      </p>
      <ul className="mb-3 grid grid-cols-2 gap-1 font-mono text-sm text-text-default">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <BotaoCopiar texto={texto} rotulo="Copiar todos" />
        <Button variante="secundario" tamanho="sm" onClick={baixar} className="celular:h-[44px]">
          Baixar .txt
        </Button>
        <SecondaryButton onClick={aoFechar}>Já guardei</SecondaryButton>
      </div>
    </div>
  );
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      variante="secundario"
      tamanho="sm"
      icone={<Copy size={14} aria-hidden="true" />}
      onClick={() => {
        void navigator.clipboard
          .writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          })
          .catch(() => ui.toast("Não foi possível copiar", "error"));
      }}
      className="mt-2 celular:h-[44px]"
    >
      {copiado ? "Copiado!" : rotulo}
    </Button>
  );
}
