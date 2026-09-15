"use client";

import { useInteracoesDeBot } from "@/stores/interacoes-de-bot";
import ModalDeBot from "./ModalDeBot";

/**
 * ── onda 3 ── O ponto único onde o modal de um bot (callback 9) é montado.
 *
 * Montado **uma vez** no shell (`app/app/page.tsx`, nos dois leiautes), como o
 * `ModalHost`: o modal de bot não pertence a uma mensagem nem a um canal — ele
 * pode vir de um botão, de um select ou de um comando de barra, e continua
 * aberto se a pessoa trocar de canal no meio, como no Discord.
 *
 * O desenho (cabeçalho com o avatar do bot, o aviso "Isto será enviado
 * para…", os campos e os botões Cancelar/Enviar) é o `ModalDeBot` (cartão
 * 3f); este arquivo só decide **se** ele existe — `key={modal.interactionId}`
 * garante que, se um segundo `interaction.modal` chegar (não deveria: a store
 * só permite um modal aberto por vez), o formulário remonta do zero em vez de
 * herdar valores digitados para outro modal.
 */
export default function HostDeModalDeBot() {
  const modal = useInteracoesDeBot((s) => s.modal);
  if (!modal) return null;
  return <ModalDeBot key={modal.interactionId} aberto={modal} />;
}
