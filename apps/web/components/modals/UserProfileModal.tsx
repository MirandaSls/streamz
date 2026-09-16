"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  UserCheck,
  UserPlus,
} from "@/components/ui/icones";
import {
  customStatusOf,
  displayNameOf,
  rolesOf,
  type MemberRole,
  type UserProfile,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { PilulasDeCargo } from "@/components/ui/perfil/PilulasDeCargo";
import { BotaoDeIcone, Button, Tabs, type AbaDeTabs } from "@/components/ui/primitivos";
import TagDeBot from "@/components/ui/TagDeBot";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { useNotas } from "@/stores/notas";
import { usePermissions } from "@/stores/permissions";
import { resolveStatus, usePresence } from "@/stores/presence";
import { errorMessage } from "@/stores/socket-adapter";
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";

const PAPEL: Record<MemberRole, string> = {
  OWNER: "Dono do servidor",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

type Aba = "sobre" | "servidores" | "amigos";

/** "25 de agosto de 2026" — a data dos selos "membro desde". */
const DATA_SELO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Perfil completo — o "ver perfil" do Discord.
 *
 * O cartão não tem título escrito: começa no banner, com as ações sobrepostas à
 * faixa e o resto do conteúdo em **abas** (Sobre mim, Servidores mútuos, Amigos
 * mútuos). Empilhar tudo numa coluna só, como antes, fazia o cartão crescer sem
 * fim e enterrava os botões no fim da rolagem.
 *
 * Os "em comum" e a relação são calculados pelo servidor por espectador
 * (`GET /users/:id/profile`), por isso o modal busca em vez de ler das stores.
 */
export default function UserProfileModal({
  userId,
  guildId,
}: {
  userId: string;
  guildId?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const openModal = useUI((s) => s.openModal);
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const openWith = useDMs((s) => s.openWith);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  // Cargos deste membro NO servidor do cartão — só existem para consulta
  // quando `guildId` é o servidor CARREGADO: `members`/`roles` da store são
  // sempre do `activeGuildId`, nunca de um servidor arbitrário (não há um
  // "buscar membros deste outro servidor" para o modal chamar).
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const membrosDoServidor = useGuilds((s) => s.members);
  const roles = usePermissions((s) => s.roles);
  const send = useFriends((s) => s.send);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);
  // pedidos pendentes: o `relationship` do perfil diz "incoming"/"outgoing",
  // mas aceitar/recusar pede o id do PEDIDO, não do usuário — só a página
  // Amigos carrega essas duas listas, então o modal também precisa (idempotente:
  // `load` sem `force` não repete a chamada se já veio de lá).
  const loadFriends = useFriends((s) => s.load);
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  const accept = useFriends((s) => s.accept);
  const dismiss = useFriends((s) => s.dismiss);
  const nota = useNotas((s) => s.nota(userId));

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("sobre");

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    let vivo = true;
    api
      .profile(userId, guildId)
      .then((p) => vivo && setProfile(p))
      .catch((e) => vivo && setErro(errorMessage(e, "Não foi possível carregar o perfil")));
    return () => {
      vivo = false;
    };
  }, [userId, guildId]);

  if (!profile) return <Esqueleto erro={erro} onClose={closeModal} />;

  const user = profile.user;
  const status = resolveStatus(statuses, user);
  const nome = displayNameOf(user);
  const personalizado = customStatusOf(user);
  const euMesmo = profile.relationship === "self" || user.id === me?.id;
  const bloqueado = profile.relationship === "blocked";
  // Cargos como o popout monta (`ProfilePopover.tsx`, `meusCargos`/`chips`):
  // só quando este é o servidor cujos membros a store tem (ver o comentário
  // acima de `activeGuildId`). Fora disso (outro servidor, ou os membros ainda
  // carregando) fica `null` e o rótulo de hierarquia ("Em X: Dono/Admin/
  // Membro") continua sendo o que aparece.
  const membroAqui =
    guildId && guildId === activeGuildId
      ? membrosDoServidor.find((m) => m.user.id === user.id)
      : undefined;
  const cargosAqui = membroAqui ? rolesOf(membroAqui.roleIds, roles) : null;
  // o pedido pendente, achado pelo id do outro lado — `undefined` enquanto as
  // listas de amigos ainda não chegaram (a store carrega em paralelo).
  const meuPedido =
    profile.relationship === "incoming"
      ? incoming.find((r) => r.user.id === user.id)
      : profile.relationship === "outgoing"
        ? outgoing.find((r) => r.user.id === user.id)
        : undefined;

  function abrirMenu(alvo: HTMLElement) {
    if (!profile) return;
    const itens: MenuItem[] = [];
    if (profile.relationship === "friend") {
      itens.push({ label: "Remover amigo", danger: true, onSelect: () => void remove(user) });
    }
    if (profile.relationship === "incoming" && meuPedido) {
      itens.push({
        label: "Recusar pedido",
        danger: true,
        onSelect: () => void dismiss(meuPedido.id),
      });
    }
    if (profile.relationship === "outgoing" && meuPedido) {
      itens.push({
        label: "Cancelar pedido",
        danger: true,
        onSelect: () => void dismiss(meuPedido.id),
      });
    }
    // nota privada (`docs/CONTRATO-MENUS.md` §2) — não depende da relação
    itens.push({
      label: nota ? "Editar nota" : "Adicionar nota",
      description: "Visível apenas para você",
      onSelect: () => ui.openModal({ kind: "notaDeUsuario", userId: user.id }),
    });
    itens.push(
      bloqueado
        ? { label: "Desbloquear", onSelect: () => void unblock(user.id) }
        : { label: "Bloquear", danger: true, onSelect: () => void block(user) },
    );
    const r = anchorOf(alvo);
    ui.openContextMenu(r.x, r.y + r.height + 4, itens);
  }

  // rótulo exatamente como no cartão ("Sobre mim" / "Servidores em comum" /
  // "Amigos em comum"); o contador vai no `Badge` do próprio `Tabs`, não mais
  // costurado no texto do rótulo.
  const abas: AbaDeTabs<Aba>[] = [
    { valor: "sobre", rotulo: "Sobre mim" },
    { valor: "servidores", rotulo: "Servidores em comum", contador: profile.mutualGuilds.length },
    { valor: "amigos", rotulo: "Amigos em comum", contador: profile.mutualFriends.length },
  ];

  return (
    <Dialog
      telaCheiaNoCelular
      title={`Perfil de ${nome}`}
      hideHeader
      semPadding
      showClose={false}
      onClose={closeModal}
      className="w-[600px]"
    >
      <div>
        <div className="relative">
          {profile.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="h-[120px] w-full object-cover" />
          ) : (
            <div
              className="h-[120px] w-full"
              style={{ backgroundColor: profile.bannerColor ?? "var(--brand-500)" }}
            />
          )}

          {/* ações sobre a faixa do banner, como no Discord — não no fim do cartão.
              Ordem e posição (canto superior direito, sobre o banner) vêm do
              popover 1:1 (`docs/Reference/Captura de tela 2026-08-31
              101804.png`) e do popout de outra pessoa em
              `blog/2026-02-how-to-customize-your-discord-profile/
              04-popout-com-cores-nitro.png`: os dois têm a ação principal e o
              "…" nesse canto, nunca no rodapé do cartão. */}
          {/* No celular a fileira ganha `left-4` e quebra: "Enviar mensagem" +
              "Adicionar amigo" + o "⋯" somam ~370 e, ancorados só pela direita,
              o primeiro botão saía pela borda esquerda da tela. */}
          <div className="absolute right-4 top-4 flex items-center gap-2 celular:left-4 celular:flex-wrap celular:justify-end">
            {!euMesmo && (
              <>
                <Button
                  variante="primario"
                  tamanho="sm"
                  icone={<MessageSquare size={16} aria-hidden="true" />}
                  // bloqueado: mandar mensagem exige desbloquear primeiro — o
                  // Discord também não abre DM para quem está bloqueado. Não é
                  // "sem permissão" do servidor (a rota de perfil não checa
                  // nada disso, ver "faltando"), é a relação local mesmo.
                  disabled={bloqueado}
                  onClick={() => {
                    closeModal();
                    void openWith(user.id);
                  }}
                  className="celular:h-[44px]"
                >
                  Enviar mensagem
                </Button>
                {profile.relationship === "none" && (
                  <Button
                    variante="secundario"
                    tamanho="sm"
                    icone={<UserPlus size={16} aria-hidden="true" />}
                    onClick={() => void send(user.username)}
                    className="celular:h-[44px]"
                  >
                    Adicionar amigo
                  </Button>
                )}
                {/* pedido meu, ainda sem resposta: mostra o estado, não some —
                    cancelar é uma ação destrutiva, então mora no "…", não aqui */}
                {profile.relationship === "outgoing" && (
                  <Button
                    variante="secundario"
                    tamanho="sm"
                    disabled
                    icone={<Clock size={16} aria-hidden="true" />}
                    className="celular:h-[44px]"
                  >
                    Pedido enviado
                  </Button>
                )}
                {/* pedido da outra pessoa: aceitar fica à mão; recusar é
                    destrutivo e mora no "…", como cancelar */}
                {profile.relationship === "incoming" && meuPedido && (
                  <Button
                    variante="positivo"
                    tamanho="sm"
                    icone={<UserCheck size={16} aria-hidden="true" />}
                    onClick={() => void accept(meuPedido.id)}
                    className="celular:h-[44px]"
                  >
                    Aceitar pedido
                  </Button>
                )}
                <BotaoDeIcone
                  rotulo="Mais opções"
                  icone={<MoreHorizontal size={18} />}
                  tamanho="md"
                  comFundo
                  aria-haspopup="menu"
                  onClick={(e) => abrirMenu(e.currentTarget)}
                  className="bg-background-base-lowest celular:h-[44px] celular:w-[44px]"
                />
              </>
            )}
            {/* Meu próprio cartão completo: mesmo destino do "Editar perfil"
                do popout (`ProfilePopover.tsx`, `editarPerfil`) — sem esse
                botão, abrir o MEU perfil completo (em vez do cartão pequeno)
                não tinha nenhum jeito de chegar às Configurações daqui. */}
            {euMesmo && (
              <Button
                variante="secundario"
                tamanho="sm"
                icone={<Pencil size={16} aria-hidden="true" />}
                onClick={() => openModal({ kind: "settings", tab: "perfil" })}
                className="celular:h-[44px]"
              >
                Editar perfil
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="-mt-12 mb-3 w-fit rounded-full border-[6px] border-background-base-lower">
            <Avatar user={user} size="xl" status={status} surface="border-background-base-lower" />
          </div>

          {/* Sem cartão por dentro do cartão: nos dois prints 1:1 (popover
              101804) e no popout de outra pessoa (blog 2026-02, acima), nome,
              usuário, bio e "Member Since" assentam direto no fundo do modal
              (`bg-background-surface-high`, herdado do `Modal`) — não há uma
              segunda superfície atrás deles. Era isso que a revisão mediu como
              "#202024 no miolo com faixas de #242429 nas laterais": o
              `bg-background-base-low` daqui por cima do `bg-background-
              surface-high` do modal, um desvio de superfície que o Discord não
              tem. */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-xl font-bold text-text-strong">{nome}</span>
              {/* ── j-bots ── a caixa é `items-baseline` por causa dos pronomes,
                  que são texto e têm que assentar na mesma linha do nome. A
                  pílula não é texto: pela linha de base ela desceria abaixo
                  dela, então `self-center` a devolve ao meio da linha. */}
              {user.bot && <TagDeBot className="self-center" />}
              {profile.pronouns && (
                <span className="truncate text-sm text-text-muted">{profile.pronouns}</span>
              )}
            </div>
            <div className="truncate text-sm text-text-default">@{user.username}</div>
            {personalizado && <div className="mt-1 text-sm text-text-default">{personalizado}</div>}

            <Tabs
              valor={aba}
              aoMudar={setAba}
              abas={abas}
              rotulo="Seções do perfil"
              className="mt-3 celular:-mx-4 celular:px-4 celular:[scrollbar-width:none]"
            />

            <div className="mt-3 max-h-[280px] overflow-y-auto text-sm text-text-default">
              {aba === "sobre" && (
                <>
                  {profile.aboutMe ? (
                    <p className="whitespace-pre-wrap break-words">{profile.aboutMe}</p>
                  ) : (
                    <p className="text-text-muted">Esta pessoa ainda não escreveu nada por aqui.</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-6">
                    <InfoDoPerfil
                      titulo="Membro do Streamz desde"
                      valor={DATA_SELO.format(new Date(profile.createdAt))}
                    />
                    {/* Cargos de verdade (pílulas do popout) quando dá para
                        montá-los; sem cargo próprio (só o @everyone) a lista
                        fica vazia e o rótulo de hierarquia de baixo é o que
                        sobra de informação — não uma pílula solta sem nada. */}
                    {guild &&
                      profile.guildRole &&
                      (cargosAqui && cargosAqui.length > 0 ? (
                        <div className="min-w-0">
                          <div className="truncate text-text-sm font-semibold text-text-default">
                            {`Cargos em ${guild.name}`}
                          </div>
                          <div className="mt-1">
                            <PilulasDeCargo
                              cargos={cargosAqui}
                              podeRemover={false}
                              podeAdicionar={false}
                              aoRemover={() => {}}
                              aoAdicionar={() => {}}
                            />
                          </div>
                        </div>
                      ) : (
                        <InfoDoPerfil titulo={`Em ${guild.name}`} valor={PAPEL[profile.guildRole]} />
                      ))}
                  </div>
                </>
              )}

              {aba === "servidores" &&
                (profile.mutualGuilds.length === 0 ? (
                  <p className="text-text-muted">Nenhum servidor em comum.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {profile.mutualGuilds.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 rounded px-1 py-1">
                        {g.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.iconUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-input-background-default text-[10px] font-semibold text-text-strong">
                            {g.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{g.name}</span>
                      </li>
                    ))}
                  </ul>
                ))}

              {aba === "amigos" &&
                (profile.mutualFriends.length === 0 ? (
                  <p className="text-text-muted">Nenhum amigo em comum.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {profile.mutualFriends.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={(e) => ui.openProfile(f, anchorOf(e.currentTarget))}
                          className="flex w-full items-center gap-2 rounded px-1 py-1 hover:bg-interactive-background-hover"
                        >
                          <Avatar user={f} size="sm" surface="border-background-base-low" />
                          <span className="truncate">{displayNameOf(f)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Rótulo + valor empilhados, sem cartão, sem borda e sem caixa alta —
 * "Member Since" no popout de OUTRA pessoa em `blog/2026-02-how-to-
 * customize-your-discord-profile/05-widgets-de-perfil.png` (dark, 2026) é
 * exatamente isso: título em peso maior sobre o valor em cor apagada, direto
 * no fundo do cartão. A versão anterior (cartão com borda, ícone de
 * calendário e CAIXA ALTA) foi a divergência medida pela revisão de
 * 2026-09-11 — aquele visual não aparece em nenhuma referência.
 */
function InfoDoPerfil({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-text-sm font-semibold text-text-default">{titulo}</div>
      <div className="truncate text-text-sm text-text-muted">{valor}</div>
    </div>
  );
}

/**
 * Esqueleto do próprio cartão enquanto o perfil carrega (e quando ele falha).
 *
 * Trocar o cartão por uma caixinha com "Carregando…" fazia o modal mudar de
 * tamanho e de forma no meio do caminho — o Discord mantém a moldura e
 * preenche. Sem cartão aninhado por dentro (mesmo ajuste do corpo carregado):
 * os retângulos assentam direto no fundo do modal.
 *
 * **Carregando** pulsa (`animate-pulse`); **erro** não — pulsar ali sugeriria
 * que a busca ainda está em andamento, quando já falhou e não vai se resolver
 * sozinha. A moldura (banner e avatar) fica parada e cinza nos dois estados;
 * só o texto muda.
 */
function Esqueleto({ erro, onClose }: { erro: string | null; onClose: () => void }) {
  const pulsar = erro ? "" : "animate-pulse";
  return (
    <Dialog
      title="Perfil"
      hideHeader
      semPadding
      telaCheiaNoCelular
      onClose={onClose}
      className="w-[600px]"
    >
      <div>
        <div className={`h-[120px] w-full bg-background-base-lowest ${pulsar}`} />
        <div className="px-4 pb-4">
          <div className="-mt-12 mb-3 w-fit rounded-full border-[6px] border-background-base-lower">
            <span className={`block h-20 w-20 rounded-full bg-background-base-lowest ${pulsar}`} />
          </div>
          {erro ? (
            <p role="alert" className="text-text-sm text-text-muted">
              {erro}
            </p>
          ) : (
            <div className="flex flex-col gap-2" aria-hidden="true">
              <span className="h-5 w-40 animate-pulse rounded bg-background-base-lowest" />
              <span className="h-4 w-24 animate-pulse rounded bg-background-base-lowest" />
              <span className="mt-3 h-3 w-full animate-pulse rounded bg-background-base-lowest" />
              <span className="h-3 w-2/3 animate-pulse rounded bg-background-base-lowest" />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
