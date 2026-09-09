"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PERMISSION_INFO,
  Permission,
  alvoDoOverwrite,
  comEstadoDaRegra,
  displayNameOf,
  estadoDaRegra,
  hasPermission,
  secoesDePermissoes,
  type EscopoDePermissao,
  type EstadoDaRegra,
  type PermissionOverwrite,
} from "@streamz/shared";
import { ChevronDown, Lock, Plus, X } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { Switch } from "@/components/ui/controls";
import AdicionarAlvoPopover, {
  useFiltroDeAlvo,
} from "@/components/permissoes/AdicionarAlvoPopover";
import TriEstado from "@/components/permissoes/TriEstado";
import { alvosDasRegras, alvosDisponiveis, type Alvo } from "@/components/permissoes/alvos";
import { useGuilds } from "@/stores/guilds";
import { useMyPermissions, useRoles } from "@/stores/permissions";

/**
 * A aba "Permissões" — a mesma para canal e para categoria.
 *
 * É um componente só porque as duas telas são a mesma tela: o cartão de
 * "privado" no topo, as permissões avançadas embaixo, e a lista de alvos à
 * esquerda com o tri-estado à direita. O que muda entre elas é o **escopo**
 * (`secoesDePermissoes` decide se aparece a seção de voz, a de texto ou as
 * duas) e quem grava a regra — que entra por `onSalvarRegra`/`onRemoverRegra`,
 * e não por um `if` sobre o tipo do dono aqui dentro.
 *
 * Leiaute do print `docs/Reference/Captura de tela 2026-09-04 102249.png`.
 *
 * **A edição de regra é imediata.** Cada clique no tri-estado grava a regra
 * inteira, como a antiga lista de acesso já fazia ("A marcação vale na hora —
 * não depende do botão salvar"). O interruptor de privado é a exceção: ele
 * pertence ao canal/categoria, não às regras, e por isso continua passando pela
 * barra de alterações não salvas de quem nos usa.
 */

export interface EditorDePermissoesProps {
  guildId: string;
  escopo: EscopoDePermissao;
  /** rótulo do cartão: "Canal privado" | "Categoria privada". */
  privadoLabel: string;
  privadoDescricao: string;
  privado: boolean;
  onPrivado: (v: boolean) => void;
  overrides: PermissionOverwrite[];
  onSalvarRegra: (o: PermissionOverwrite) => void | Promise<void>;
  onRemoverRegra: (targetId: string) => void | Promise<void>;
  /** aviso acima do editor (o "sincronizado com a categoria" do canal). */
  aviso?: ReactNode;
}

export default function EditorDePermissoes({
  guildId,
  escopo,
  privadoLabel,
  privadoDescricao,
  privado,
  onPrivado,
  overrides,
  onSalvarRegra,
  onRemoverRegra,
  aviso,
}: EditorDePermissoesProps) {
  const roles = useRoles();
  const membros = useGuilds((s) => s.members);
  const minhas = useMyPermissions(guildId);
  const podeGerenciar = hasPermission(minhas, Permission.MANAGE_ROLES);

  // aberta por padrão: no Discord a seção começa fechada, mas lá ela divide a
  // aba com outras coisas — aqui ela **é** a aba, e abrir a tela num acordeão
  // fechado esconderia tudo que a pessoa veio ver
  const [avancadas, setAvancadas] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [popover, setPopover] = useState(false);
  const botaoMais = useRef<HTMLButtonElement>(null);
  const idPrivado = useId();
  const { filtro, setFiltro } = useFiltroDeAlvo(popover);

  const paraAlvo = useMemo(
    () => membros.map((m) => ({ id: m.user.id, nome: displayNameOf(m.user) })),
    [membros],
  );
  const alvos = useMemo(
    () => alvosDasRegras(overrides, roles, paraAlvo),
    [overrides, roles, paraAlvo],
  );
  const disponiveis = useMemo(
    () => alvosDisponiveis(overrides, roles, paraAlvo, filtro),
    [overrides, roles, paraAlvo, filtro],
  );

  // a seleção mora numa chave, e não num índice: apagar uma regra reordena a
  // lista, e um índice guardado passaria a apontar para o vizinho
  const alvoAtual = alvos.find((a) => a.chave === selecionado) ?? alvos[0] ?? null;

  const regra: PermissionOverwrite | undefined = alvoAtual
    ? overrides.find((o) => alvoDoOverwrite(o) === alvoAtual.chave)
    : undefined;

  /** A regra em edição, ou uma vazia quando o alvo ainda não tem nenhuma. */
  const regraOuVazia: PermissionOverwrite = regra ?? {
    roleId: alvoAtual?.tipo === "cargo" ? alvoAtual.id : null,
    userId: alvoAtual?.tipo === "membro" ? alvoAtual.id : null,
    allow: 0,
    deny: 0,
  };

  function mudar(bit: number, estado: EstadoDaRegra) {
    void onSalvarRegra(comEstadoDaRegra(regraOuVazia, bit, estado));
  }

  function escolher(alvo: Alvo) {
    setPopover(false);
    setSelecionado(alvo.chave);
    // regra vazia é o "adicione este alvo à lista": ela não muda permissão
    // nenhuma, só faz o alvo existir para ser editado em seguida
    void onSalvarRegra({
      roleId: alvo.tipo === "cargo" ? alvo.id : null,
      userId: alvo.tipo === "membro" ? alvo.id : null,
      allow: 0,
      deny: 0,
    });
  }

  const usuarioDe = (id: string) => membros.find((m) => m.user.id === id)?.user ?? null;

  if (!podeGerenciar) {
    return (
      <p className="rounded-[4px] border border-border bg-panel px-3 py-2 text-sm text-txt-muted">
        Só quem tem “Gerenciar cargos” pode mudar as permissões{" "}
        {escopo === "categoria" ? "desta categoria" : "deste canal"}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {aviso}

      {/* O cartão do topo. A linha é a `ToggleLinha` do app em espírito (ícone,
          título, interruptor), mas montada aqui porque no print a explicação
          ocupa a largura inteira do cartão, embaixo dos dois — e não a coluna
          da esquerda, que é onde a `ToggleLinha` a coloca. */}
      <div className="rounded-[4px] bg-panel p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-2">
            <Lock size={18} aria-hidden="true" className="shrink-0 text-txt-secondary" />
            <label
              htmlFor={idPrivado}
              className="cursor-pointer truncate text-sm font-bold text-txt-primary"
            >
              {privadoLabel}
            </label>
          </span>
          <Switch id={idPrivado} checked={privado} onChange={onPrivado} />
        </div>
        <p className="mt-2 text-xs leading-4 text-txt-muted">{privadoDescricao}</p>
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          aria-expanded={avancadas}
          onClick={() => setAvancadas((v) => !v)}
          className="flex items-center gap-2 text-base font-semibold text-txt-primary transition hover:text-txt-normal celular:min-h-[44px]"
        >
          <span>Permissões avançadas</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`text-txt-muted transition-transform ${avancadas ? "" : "-rotate-90"}`}
          />
        </button>

        {avancadas && (
          /* No celular as duas colunas viram duas faixas empilhadas: a de
             cargos tem 180px fixos e a de permissões precisa de bem mais que os
             ~190 que sobrariam numa tela de 390. */
          <div className="mt-4 flex gap-6 celular:flex-col celular:gap-4">
            <div className="w-[180px] shrink-0 celular:w-full">
              <div className="mb-1 flex items-center justify-between gap-2 px-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                  Cargos/membros
                </h3>
                <Tooltip label="Adicionar cargo ou membro">
                  <button
                    ref={botaoMais}
                    type="button"
                    aria-label="Adicionar cargo ou membro"
                    aria-haspopup="dialog"
                    aria-expanded={popover}
                    onClick={() => setPopover((v) => !v)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-txt-muted transition hover:bg-hov hover:text-txt-primary celular:-my-2 celular:h-[44px] celular:w-[44px]"
                  >
                    <Plus size={14} />
                  </button>
                </Tooltip>
              </div>

              <ul>
                {alvos.map((alvo) => {
                  const ativo = alvo.chave === alvoAtual?.chave;
                  const user = alvo.tipo === "membro" ? usuarioDe(alvo.id) : null;
                  return (
                    <li
                      key={alvo.chave}
                      className={`group mb-0.5 flex h-8 items-center rounded-[4px] pr-1 transition celular:h-[44px] ${
                        ativo ? "bg-sel" : "hover:bg-hov"
                      }`}
                    >
                      {/* linha e "remover" são irmãos, não aninhados: botão
                          dentro de botão não é HTML válido e o clique no ✕
                          selecionaria o alvo antes de apagá-lo */}
                      <button
                        type="button"
                        aria-current={ativo ? "true" : undefined}
                        onClick={() => setSelecionado(alvo.chave)}
                        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[4px] px-2 text-left text-sm celular:h-[44px] ${
                          ativo ? "text-txt-primary" : "text-txt-normal"
                        }`}
                      >
                        {user ? (
                          <Avatar user={user} size="sm" surface="border-chat" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-txt-muted"
                            // cor de cargo é dado do servidor, não token de tema
                            style={alvo.cor ? { backgroundColor: alvo.cor } : undefined}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{alvo.nome}</span>
                      </button>

                      {/* o @everyone não sai: é o padrão do canal, e sem ele não
                          haveria onde dizer o que vale para todo mundo */}
                      {!alvo.padrao && (
                        <button
                          type="button"
                          aria-label={`Remover regra de ${alvo.nome}`}
                          onClick={() => void onRemoverRegra(alvo.id)}
                          /* no dedo não há hover: sem isto "remover regra" não tinha caminho */
                          className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt-muted opacity-0 transition hover:text-red focus-visible:opacity-100 group-hover:opacity-100 celular:h-[44px] celular:w-[44px] celular:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 px-2 text-xs leading-4 text-txt-muted">
                As regras valem na hora — não dependem do botão salvar.
              </p>

              <AdicionarAlvoPopover
                ancora={botaoMais}
                aberto={popover}
                onFechar={() => setPopover(false)}
                alvos={disponiveis}
                filtro={filtro}
                onFiltro={setFiltro}
                onEscolher={escolher}
                usuario={usuarioDe}
              />
            </div>

            <div className="min-w-0 flex-1">
              {secoesDePermissoes(escopo).map((secao) => (
                <section key={secao.id} className="mb-6 last:mb-0">
                  <h3 className="mb-2 text-base font-semibold text-txt-primary">{secao.label}</h3>
                  {secao.permissions.map((nome) => {
                    const bit = Permission[nome];
                    // a API recusa conceder um bit que quem edita não tem; a
                    // tela trava o controle em vez de deixar tentar e falhar
                    const posso = hasPermission(minhas, bit);
                    return (
                      <div
                        key={nome}
                        className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-txt-primary">
                            {PERMISSION_INFO[nome].label}
                          </p>
                          <p className="mt-0.5 text-xs leading-4 text-txt-muted">
                            {PERMISSION_INFO[nome].description}
                          </p>
                        </div>
                        <TriEstado
                          rotulo={PERMISSION_INFO[nome].label}
                          valor={estadoDaRegra(regra, bit)}
                          onChange={(estado) => mudar(bit, estado)}
                          disabled={!posso}
                          motivoDesabilitado={
                            posso
                              ? undefined
                              : "Você não pode dar nem tirar uma permissão que você mesmo não tem."
                          }
                        />
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
