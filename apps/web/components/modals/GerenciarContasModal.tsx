"use client";

import { useState } from "react";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { LogOut, MoreHorizontal, Trash2 } from "@/components/ui/icones";
import { BotaoDeIcone, Button, Tooltip } from "@/components/ui/primitivos";
import { LIMITE_DE_CONTAS, cabeMaisUma, lerCofreDoDisco, type ContaGuardada } from "@/lib/contas";
import { esquecerConta, sairDaConta, trocarDeConta } from "@/lib/troca-de-contas";
import { useVoice } from "@/stores/voice";
import { ui, useUI } from "@/stores/ui";

/**
 * "Gerenciar contas": as contas logadas neste aparelho, com a ativa marcada.
 *
 * Medido no print `2026-09-03 202931`. A escala do recorte foi fixada em 1,25
 * por dois elementos conhecidos do Discord — o avatar do cartão mede 50px de
 * tela (= 40 de CSS, um dos tamanhos padrão dele) e o botão largo mede 47 (=
 * 37,6 ≈ 38, a altura do botão médio) —, e confirmada pela largura: o conteúdo
 * dá 430 de CSS, que são os 480 da nossa `Dialog` menos os 24 de padding de
 * cada lado. Ou seja: esta é a caixa padrão do app, sem largura própria.
 *
 * Daí saem os números abaixo (tela ÷ 1,25):
 *   cartão 538×78 → 430×62, raio 8, avatar de 40 com 11 de folga em volta;
 *   nome a 12 do avatar; "..." com o centro a 39 da borda direita do cartão;
 *   botão largo 538×47 → 430×38, a 27 abaixo do cartão.
 * Os `p-3`/`gap-2.5`/`h-10` do Tailwind caíam em 11,6/9,7/38,8 porque a raiz do
 * app era de 15,5px no print (todo `rem` encolhia 3%) — a raiz subiu para 16px
 * depois (ADR-0009), mas os números abaixo continuam os do recorte original;
 * é a mesma correção registrada no `ProfilePopover`, e é por ela que os tokens
 * batiam com o print em vez de precisarem de valores fixos.
 *
 * O recorte foi reamostrado antes de chegar aqui (os dois campos idênticos do
 * print irmão medem 55 e 50), então cada número tem ±1 de incerteza.
 *
 * Confirmação do fundo do cartão (rodada de redesenho, cartão 7i-contas): o
 * print `202931` amostra `#333338` no cartão contra `#18181b` no fundo do
 * modal. `--border-normal` (`#9696a033`, alfa 0,2) composto sobre
 * `--background-base-lower` (`#1a1a1e`, o fundo do `Modal`) dá exatamente
 * `rgb(51,51,56)` = `#333338` — bate dígito a dígito. Ou seja: `bg-border-
 * normal` não é um "token mais próximo" arbitrário, é a conta que fecha com o
 * print. Mesma conta com `--border-strong` (alfa 0,44) para o hover dá
 * `#505057`; não há print do hover para confirmar, então esse valor entra
 * como medido-por-composição, não como "visto".
 *
 * Estados cobertos nesta rodada (não estavam no recorte original, que é
 * estático):
 * - **vazio**: só acontece no instante entre sair da última conta e o
 *   `location.replace` de `irPara` desfazer esta tela — o Discord nunca
 *   mostra este modal sem conta nenhuma. Não medido (não é um estado dele);
 *   mensagem curta em vez de lista em branco, para não piscar um `<ul>` vazio.
 * - **carregando**: o clique não troca de conta na hora, ele busca um token
 *   novo primeiro (`trocarDeConta`). Enquanto isso, a "..." do cartão em
 *   troca vira um `status` giratório (mesmo spinner de `QuickSwitcher.tsx` e
 *   `MessageList.tsx`: `border-border-normal border-t-text-muted`, a dupla já
 *   usada em toda lista do app que espera rede), e os outros cartões ficam
 *   `aria-disabled` — sem isso dava para abrir o menu de outra conta e
 *   disparar "Sair"/"Remover" enquanto a troca da primeira ainda está no ar.
 * - **erro**: continua por `ui.toast` (o padrão do app para falha assíncrona
 *   fora de formulário) — sem redesenho aqui, é o mesmo canal que "pedir-
 *   senha" já usava.
 * - **sem permissão**: não existe um estado de permissão nesta tela — o cofre
 *   é só do aparelho, ninguém pede acesso a ele. O único bloqueio é de
 *   capacidade (5 contas), coberto por "desabilitado" abaixo; não inventei um
 *   estado que o app não tem.
 * - **hover**: `hover:bg-border-strong`, como já estava.
 * - **foco**: o anel de `:focus-visible` de `globals.css` é global e já
 *   cobre esta `div[role=button][tabIndex=0]` sem CSS local (mesmo mecanismo
 *   do `Button`, ver o cabeçalho dele) — por isso não há classe de foco
 *   escrita aqui.
 * - **desabilitado**: o botão "Adicionar uma conta" com o cofre cheio, já
 *   existia; agora também a "..." de cada conta enquanto outra troca está em
 *   andamento (via `desabilitado`/`motivoDesabilitado` do `BotaoDeIcone`).
 */
export default function GerenciarContasModal() {
  const closeModal = useUI((s) => s.closeModal);
  const openModal = useUI((s) => s.openModal);
  // o cofre não é reativo (é `localStorage`): este contador força a releitura
  // depois de sair/remover, que é a única coisa que muda a lista sem sair da tela
  const [versao, setVersao] = useState(0);
  const cofre = lerCofreDoDisco();
  void versao;

  const [ocupada, setOcupada] = useState<string | null>(null);

  async function escolher(conta: ContaGuardada) {
    if (conta.user.id === cofre.ativa || ocupada) return;
    if (!conta.refreshToken) {
      // sessão caducada: a troca de um clique não existe mais, vira um login
      openModal({ kind: "adicionarConta", voltar: true });
      return;
    }
    if (!(await pedirParaSairDaCall())) return;
    setOcupada(conta.user.id);
    const r = await trocarDeConta(conta.user.id);
    // `ok` termina em `location.replace`: esta tela morre junto e não volta
    if (r.ok) return;
    setOcupada(null);
    setVersao((v) => v + 1);
    if (r.motivo === "pedir-senha") {
      ui.toast("A sessão desta conta expirou. Entre com a senha de novo.", "error");
      openModal({ kind: "adicionarConta", voltar: true });
    } else if (r.motivo === "falhou") {
      ui.toast("Não foi possível trocar de conta. Tente de novo.", "error");
    }
  }

  function abrirMenu(conta: ContaGuardada, botao: HTMLElement) {
    const r = botao.getBoundingClientRect();
    ui.openContextMenu(r.left, r.bottom + 4, [
      {
        label: "Sair",
        icon: <LogOut size={16} />,
        danger: true,
        onSelect: () => void sair(conta),
      },
      {
        label: "Remover deste dispositivo",
        icon: <Trash2 size={16} />,
        onSelect: () => void remover(conta),
      },
    ]);
  }

  /** Sair revoga a sessão **daquela** conta na API — as outras não sentem nada. */
  async function sair(conta: ContaGuardada) {
    // a "..." que abriu este menu já vem `desabilitado` enquanto `ocupada` é
    // outra conta (ver o botão abaixo), mas o menu pode ter sido aberto um
    // instante antes: reconferir aqui evita duas trocas em paralelo no cofre.
    if (ocupada) return;
    const ehAtiva = conta.user.id === cofre.ativa;
    if (ehAtiva && !(await pedirParaSairDaCall())) return;
    setOcupada(conta.user.id);
    const proxima = await sairDaConta(conta.user.id);
    if (!ehAtiva) {
      setOcupada(null);
      setVersao((v) => v + 1);
      return;
    }
    await irPara(proxima);
  }

  /** Só esquece o aparelho: a sessão segue viva (e listada em "Dispositivos"). */
  async function remover(conta: ContaGuardada) {
    if (ocupada) return; // mesma reconferência de `sair`, ver o comentário lá
    const ehAtiva = conta.user.id === cofre.ativa;
    if (ehAtiva && !(await pedirParaSairDaCall())) return;
    const proxima = esquecerConta(conta.user.id);
    if (!ehAtiva) {
      setVersao((v) => v + 1);
      return;
    }
    await irPara(proxima);
  }

  /** Saiu da conta em uso: cai na próxima do cofre, ou no login se não há. */
  async function irPara(userId: string | null) {
    if (userId && (await trocarDeConta(userId)).ok) return;
    window.location.replace("/login");
  }

  const cheio = !cabeMaisUma(cofre);

  return (
    <Dialog
      telaCheiaNoCelular
      title="Gerenciar contas"
      description="Troque de contas, entre, saia, vai com tudo."
      onClose={closeModal}
    >
      <ul className="mt-2 flex flex-col gap-2">
        {cofre.contas.length === 0 ? (
          // Estado vazio — ver o comentário do cabeçalho: transitório, nosso,
          // não do Discord. `role="status"` porque ele só aparece a caminho
          // de outra tela, não é um resultado de busca para anunciar alto.
          <li role="status" className="px-1 py-6 text-center text-text-sm text-text-muted">
            Nenhuma conta neste dispositivo.
          </li>
        ) : (
          cofre.contas.map((conta) => {
            const ativa = conta.user.id === cofre.ativa;
            const trocando = ocupada === conta.user.id;
            // qualquer troca em andamento (não só a desta conta) congela a
            // lista inteira — ver o comentário do cabeçalho sobre a corrida
            // entre "..." de uma conta e a troca de outra.
            const bloqueada = ativa || !!ocupada;
            // conta de fundo com sessão viva não ganha segunda linha: no print só
            // a ativa tem uma, e inventar "@usuario" repetiria o que está acima
            const legenda = ativa
              ? "Conta ativa"
              : trocando
                ? "Entrando…"
                : conta.refreshToken
                  ? null
                  : "Sessão expirada";
            return (
              <li key={conta.user.id}>
                {/*
                  O cartão inteiro é o alvo da troca — no Discord não há um botão
                  "trocar" dentro dele, clicar na conta *é* trocar. O da conta
                  ativa não é botão: não há para onde ir, e um alvo que não faz
                  nada é pior que nenhum.
                */}
                <div
                  className={`flex items-center gap-2.5 rounded-lg bg-border-normal p-3 ${
                    bloqueada ? "" : "cursor-pointer transition hover:bg-border-strong"
                  }`}
                  role={ativa ? undefined : "button"}
                  aria-disabled={!ativa && bloqueada ? true : undefined}
                  aria-busy={trocando || undefined}
                  tabIndex={ativa ? undefined : 0}
                  onClick={bloqueada ? undefined : () => void escolher(conta)}
                  onKeyDown={
                    bloqueada
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void escolher(conta);
                          }
                        }
                  }
                >
                  <Avatar user={conta.user} size="lg" className={trocando ? "opacity-60" : ""} />
                  {/*
                    O nome aqui é o **username**, não o de exibição: no print o
                    cartão diz `paulin1337` enquanto o card do usuário, do mesmo
                    aparelho, diz "paulin". Faz sentido — este modal existe para
                    distinguir contas, e é o username que é único.
                  */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold leading-5 text-text-strong">
                      {conta.user.username}
                    </p>
                    {legenda && (
                      <p
                        className={`truncate text-sm leading-5 ${
                          ativa
                            ? "text-status-positive"
                            : trocando
                              ? "text-text-muted"
                              : "text-status-danger"
                        }`}
                      >
                        {legenda}
                      </p>
                    )}
                  </div>
                  {trocando ? (
                    // Mesmo spinner de `QuickSwitcher.tsx`/`MessageList.tsx`
                    // (`border-border-normal border-t-text-muted`) — é o
                    // vocabulário de "carregando" que o resto do app já usa
                    // em lista, não um desenho novo para esta tela.
                    <span
                      role="status"
                      aria-label={`Entrando em ${conta.user.username}`}
                      className="mr-3 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border-normal border-t-text-muted"
                    />
                  ) : (
                    <BotaoDeIcone
                      rotulo={`Opções de ${conta.user.username}`}
                      icone={<MoreHorizontal size={20} />}
                      aria-haspopup="menu"
                      desabilitado={!!ocupada}
                      motivoDesabilitado="Aguarde a troca de conta terminar"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirMenu(conta, e.currentTarget);
                      }}
                      className="mr-3 celular:h-[44px] celular:w-[44px]"
                    />
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <Tooltip
        rotulo={`Limite de ${LIMITE_DE_CONTAS} contas por dispositivo`}
        desabilitado={!cheio}
        className="w-full"
      >
        <Button
          variante="secundario"
          tamanho="md"
          larguraTotal
          disabled={cheio}
          onClick={() => openModal({ kind: "adicionarConta", voltar: true })}
          className="mt-7 celular:h-[44px]"
        >
          Adicionar uma conta
        </Button>
      </Tooltip>
    </Dialog>
  );
}

/**
 * Trocar de conta derruba a chamada: o LiveKit autentica pelo usuário, e a
 * sessão nova não herda a sala. Sair sem avisar quem está no meio de uma
 * conversa seria surpresa demais — daí a confirmação.
 */
async function pedirParaSairDaCall(): Promise<boolean> {
  const voz = useVoice.getState();
  if (!voz.channelId) return true;
  const ok = await ui.confirm({
    title: "Sair da chamada?",
    message: "Trocar de conta encerra a chamada em que você está agora.",
    confirmLabel: "Trocar mesmo assim",
    danger: true,
  });
  if (!ok) return false;
  await voz.disconnect();
  return true;
}
