"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_PERMISSIONS,
  PERMISSION_INFO,
  PERMISSION_ORDER,
  Permission,
  hasPermission,
} from "@streamz/shared";
import { IconeDoApp } from "@/components/apps/CardDeApp";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Section, Toggle } from "@/components/ui/controls";
import { useAplicativos, type ServidorParaInstalar } from "@/stores/aplicativos";

/**
 * "Adicionar ao servidor" — escolher o servidor, escolher as permissões,
 * autorizar.
 *
 * ── j-bots · F4, lote B ──
 *
 * ## Modal no desktop, tela cheia no celular — e por que assim
 *
 * `Dialog` com `telaCheiaNoCelular`: é o interruptor que o próprio `Dialog`
 * expõe e que os modais-tarefa do app já usam (criar canal, convite, emojis,
 * enquete). No celular ele vira tela cheia com barra de 56 e seta de voltar, e
 * o "voltar" do Android fecha — tudo já ligado.
 *
 * Não é folha inferior. `components/mobile/FolhaInferior.tsx` é **código
 * morto** (nunca importado; `abrirFolha`/`FolhaMobile` nunca são chamados), e o
 * contrato manda não adotá-lo nem apagá-lo nesta fase. Das três folhas de
 * verdade — `PopoverFlutuante`, `ContextMenu folha`, `PickerPanel` — nenhuma
 * serve: as três são menus curtos ancorados, e isto é um formulário com 21
 * interruptores e uma lista de servidores, que numa folha de `85dvh` rolaria
 * dentro de uma caixa que também rola. É a definição de modal-tarefa, que é o
 * caso para o qual o `telaCheiaNoCelular` foi feito.
 *
 * ## O agrupamento das permissões
 *
 * Pelo campo `group` de `PERMISSION_INFO`, na ordem de `PERMISSION_ORDER` —
 * **o mesmo do `CargosTab.tsx`**, e não o `secoesDePermissoes(escopo)`, que é
 * do editor de regras de canal. Um cargo de servidor não tem escopo de canal:
 * usar aquele agrupamento traria seções que aqui não querem dizer nada.
 *
 * ## O que fica desabilitado, e por quê não escondido
 *
 * A permissão que **eu** não tenho no servidor escolhido aparece, apagada e
 * travada, com a explicação. Escondê-la responderia à pergunta errada: quem
 * está instalando um bot de música e não acha "Conectar" na lista conclui que o
 * Streamz não tem voz, não que ele próprio não pode conceder aquilo. É a
 * mesma escolha do `EditorDePermissoes` nas regras de canal.
 *
 * A trava real é do servidor: `RolesService.validarPermissoes` recusa com 403
 * (§4 do contrato). Esta tela só evita que a pessoa descubra isso depois de
 * apertar "Autorizar".
 */

/** Os quatro grupos, na ordem e com os rótulos do `CargosTab`. */
const GRUPOS: { id: "geral" | "membros" | "mensagens" | "voz"; label: string }[] = [
  { id: "geral", label: "Permissões gerais do servidor" },
  { id: "membros", label: "Permissões de membro" },
  { id: "mensagens", label: "Permissões de texto" },
  { id: "voz", label: "Permissões de voz" },
];

export default function AdicionarAoServidor() {
  const app = useAplicativos((s) => s.instalando);
  const servidores = useAplicativos((s) => s.servidores);
  const carregandoServidores = useAplicativos((s) => s.carregandoServidores);
  const autorizando = useAplicativos((s) => s.autorizando);
  const fechar = useAplicativos((s) => s.fecharInstalacao);
  const instalar = useAplicativos((s) => s.instalar);

  const [guildId, setGuildId] = useState<string | null>(null);
  const [permissoes, setPermissoes] = useState(0);

  // pré-marcado com o que o dono do app sugeriu. Sugerir não é conceder: quem
  // instala pode desmarcar tudo, e a API só grava o que vier daqui.
  useEffect(() => {
    setPermissoes(app?.permissoesPadrao ?? 0);
  }, [app]);

  // o primeiro servidor da lista vem escolhido: com um servidor só — o caso
  // comum — não faz sentido obrigar a escolher o único que existe
  useEffect(() => {
    setGuildId((atual) =>
      atual && servidores.some((s) => s.id === atual) ? atual : (servidores[0]?.id ?? null),
    );
  }, [servidores]);

  const servidor = useMemo(
    () => servidores.find((s) => s.id === guildId) ?? null,
    [servidores, guildId],
  );

  /**
   * O que eu posso conceder neste servidor.
   *
   * Sem servidor escolhido, nada — e não "tudo": a lista abre travada em vez de
   * abrir permissiva e travar depois, que é o que faria a pessoa marcar sete
   * caixas e ver seis se apagarem ao escolher o servidor.
   */
  const minhas = servidor?.minhas ?? 0;
  const souAdmin = hasPermission(minhas, Permission.ADMINISTRATOR);
  const posso = (bit: number) => souAdmin || hasPermission(minhas, bit);

  /**
   * O bitfield que vai no `POST`, já podado.
   *
   * Podar aqui não é a checagem — a checagem é do servidor. É o que impede que
   * uma permissão marcada **antes** de trocar de servidor viaje junto e vire um
   * 403 que a pessoa não entende, porque a caixa que o causou já está apagada
   * na tela.
   */
  const aConceder = useMemo(() => {
    let bits = 0;
    for (const nome of PERMISSION_ORDER) {
      const bit = Permission[nome];
      if (hasPermission(permissoes, bit) && posso(bit)) bits |= bit;
    }
    return bits & ALL_PERMISSIONS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissoes, minhas, souAdmin]);

  if (!app) return null;

  const semServidores = !carregandoServidores && servidores.length === 0;

  return (
    <Dialog
      telaCheiaNoCelular
      title="Adicionar ao servidor"
      description={`${app.name} vai entrar como membro, com um cargo próprio.`}
      onClose={fechar}
      className="w-[440px]"
      footer={
        <>
          <SecondaryButton onClick={fechar}>Cancelar</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (guildId) void instalar(guildId, aConceder);
            }}
            disabled={!guildId || autorizando}
          >
            {autorizando ? "Autorizando…" : "Autorizar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <IconeDoApp app={app} lado={48} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-txt-primary">{app.name}</p>
          <p className="truncate text-sm text-txt-muted">
            {app.description ?? "Sem descrição."}
          </p>
        </div>
      </div>

      <Section title="Adicionar a">
        {carregandoServidores ? (
          <p className="py-2 text-sm text-txt-muted">Vendo onde você pode adicionar…</p>
        ) : semServidores ? (
          <p className="py-2 text-sm text-txt-muted">
            Você precisa de <strong className="text-txt-normal">Gerenciar servidor</strong> em
            algum servidor para adicionar um aplicativo.
          </p>
        ) : (
          <EscolhaDeServidor
            servidores={servidores}
            escolhido={guildId}
            aoEscolher={setGuildId}
          />
        )}
      </Section>

      {GRUPOS.map((g) => {
        const nomes = PERMISSION_ORDER.filter((n) => PERMISSION_INFO[n].group === g.id);
        if (nomes.length === 0) return null;
        return (
          <Section key={g.id} title={g.label}>
            {nomes.map((n) => {
              const bit = Permission[n];
              const permitido = posso(bit);
              return (
                <Toggle
                  key={n}
                  checked={hasPermission(permissoes, bit) && permitido}
                  disabled={!permitido || !guildId}
                  onChange={(v) =>
                    setPermissoes((p) => (v ? p | bit : p & ~bit))
                  }
                  label={PERMISSION_INFO[n].label}
                  hint={
                    permitido
                      ? PERMISSION_INFO[n].description
                      : // a explicação substitui a descrição: a pergunta que a
                        // pessoa faz olhando um interruptor travado é "por
                        // quê?", e não "o que ele faz?"
                        "Você não tem esta permissão neste servidor, então não pode concedê-la."
                  }
                />
              );
            })}
          </Section>
        );
      })}
    </Dialog>
  );
}

/**
 * Os servidores em que eu tenho `MANAGE_GUILD`.
 *
 * Uma lista de rádios, e não um `<select>` como o §11 sugere: o `<select>`
 * nativo não desenha o ícone do servidor, e num telefone ele abre a roda de
 * seleção do sistema por cima da tela cheia. A lista rola dentro da própria
 * caixa e mostra a mesma cara que o rail mostra.
 */
function EscolhaDeServidor({
  servidores,
  escolhido,
  aoEscolher,
}: {
  servidores: ServidorParaInstalar[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Servidor" className="max-h-52 overflow-y-auto rounded bg-void/50">
      {servidores.map((s) => {
        const ativo = s.id === escolhido;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => aoEscolher(s.id)}
            /* 44px de alvo de toque, literal: a raiz é 15,5px e `h-11` mediria
               42,6 (ver o cabeçalho de `components/mobile/pecas.tsx`) */
            className={`flex h-[44px] w-full items-center gap-2.5 px-3 text-left text-sm transition-colors ${
              ativo ? "bg-hov text-txt-primary" : "text-txt-normal hover:bg-hov/60"
            }`}
          >
            <IconeDoServidor servidor={s} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span
              aria-hidden="true"
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                ativo ? "border-accent" : "border-txt-muted"
              }`}
            >
              {ativo && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A mesma sigla que o rail usa quando o servidor não tem ícone. */
function IconeDoServidor({ servidor }: { servidor: ServidorParaInstalar }) {
  if (servidor.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={servidor.iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-hov text-[10px] font-semibold text-txt-normal"
    >
      {servidor.name
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}
