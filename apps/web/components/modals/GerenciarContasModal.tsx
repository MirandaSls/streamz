"use client";

import { useState } from "react";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { LogOut, MoreHorizontal, Trash2 } from "@/components/ui/icones";
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
 * Os `p-3`/`gap-2.5`/`h-10` do Tailwind caem em 11,6/9,7/38,8 porque a raiz do
 * app é de 15,5px (todo `rem` encolhe 3%) — é a mesma correção registrada no
 * `ProfilePopover`, e é por ela que os tokens batem com o print em vez de
 * precisarem de valores fixos.
 *
 * O recorte foi reamostrado antes de chegar aqui (os dois campos idênticos do
 * print irmão medem 55 e 50), então cada número tem ±1 de incerteza.
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
        {cofre.contas.map((conta) => {
          const ativa = conta.user.id === cofre.ativa;
          // conta de fundo com sessão viva não ganha segunda linha: no print só
          // a ativa tem uma, e inventar "@usuario" repetiria o que está acima
          const legenda = ativa ? "Conta ativa" : conta.refreshToken ? null : "Sessão expirada";
          return (
            <li key={conta.user.id}>
              {/*
                O cartão inteiro é o alvo da troca — no Discord não há um botão
                "trocar" dentro dele, clicar na conta *é* trocar. O da conta
                ativa não é botão: não há para onde ir, e um alvo que não faz
                nada é pior que nenhum.
              */}
              <div
                className={`flex items-center gap-2.5 rounded-lg bg-border-strong p-3 ${
                  ativa || ocupada ? "" : "cursor-pointer transition hover:bg-border-strong-hover"
                }`}
                role={ativa ? undefined : "button"}
                tabIndex={ativa ? undefined : 0}
                onClick={ativa ? undefined : () => void escolher(conta)}
                onKeyDown={
                  ativa
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void escolher(conta);
                        }
                      }
                }
              >
                <Avatar user={conta.user} size="lg" />
                {/*
                  O nome aqui é o **username**, não o de exibição: no print o
                  cartão diz `paulin1337` enquanto o card do usuário, do mesmo
                  aparelho, diz "paulin". Faz sentido — este modal existe para
                  distinguir contas, e é o username que é único.
                */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold leading-5 text-txt-primary">
                    {conta.user.username}
                  </p>
                  {legenda && (
                    <p className={`truncate text-sm leading-5 ${ativa ? "text-green" : "text-red"}`}>
                      {legenda}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Opções de ${conta.user.username}`}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    abrirMenu(conta, e.currentTarget);
                  }}
                  className="mr-3 grid h-8 celular:h-[44px] w-8 celular:w-[44px] shrink-0 place-items-center rounded text-txt-secondary transition hover:text-txt-primary"
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={cheio}
        onClick={() => openModal({ kind: "adicionarConta", voltar: true })}
        title={cheio ? `Limite de ${LIMITE_DE_CONTAS} contas por dispositivo` : undefined}
        className="mt-7 h-10 celular:h-[44px] w-full rounded-lg bg-border-strong text-base font-medium text-txt-primary transition hover:bg-border-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        Adicionar uma conta
      </button>
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
