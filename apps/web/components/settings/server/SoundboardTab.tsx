"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Pencil, RefreshCw, Trash2, Volume2 } from "@/components/ui/icones";
import {
  MAX_SOUNDBOARD_DURACAO_MS,
  MAX_SOUNDBOARD_POR_GUILD,
  MAX_SOUNDBOARD_SIZE,
  displayNameOf,
  type SoundboardSound,
} from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import Emoji from "@/components/ui/Emoji";
import { BotaoDeIcone, Button } from "@/components/ui/primitivos";
import {
  TABELA_CABECALHO,
  TituloDaPagina,
} from "@/components/settings/server/pagina";
import { api } from "@/lib/api";
import { tocarNaSaida, volumeDoEfeito } from "@/lib/soundboard-audio";
import { useGuilds } from "@/stores/guilds";
import { useSoundboard } from "@/stores/soundboard";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

const SEGUNDOS = (MAX_SOUNDBOARD_DURACAO_MS / 1000).toFixed(1).replace(".", ",");
const KILOBYTES = Math.round(MAX_SOUNDBOARD_SIZE / 1024);

/**
 * Aba "Painel de efeitos sonoros": a tabela dos sons do servidor.
 *
 * **Redesenho medido no catálogo** (cartão 6p-sons) — não havia print 1:1 do
 * usuário nem CSS isolado desta tela específica (a busca em
 * `docs/referencias-discord/tokens/css-bruto/` só devolve `soundboardContainer`/
 * `soundboardHeader`, que é o painel da **chamada**, não esta aba — ver
 * `voice/PainelDeSons.tsx`). A referência é a captura de tela atual do próprio
 * app do Discord no guia oficial (`suporte/imagens/discord-basics/
 * 12612888127767-discord-soundboard-guide-using-adding-and-managing-sounds/
 * 08.png` e `09.png`, tema escuro, "5 Slots of 8 available"). É imagem de
 * catálogo — **§7 da ADR-0009: só para proporção, presença e ordem, nunca
 * para px** —, e foi isso que ela decidiu:
 *
 * | o que o print mostra | antes (nesta aba) | depois |
 * |---|---|---|
 * | colunas | — | **Emoji \| Nome \| Enviado por**, na mesma ordem do Discord (o "Som" com `<audio controls>` nativo não existe lá: quem quer ouvir aperta o emoji) |
 * | hover da linha (`09.png`) | só "Remover" | **lápis + lixeira** à direita — o Discord tem "Edit Sound" (renomear, trocar emoji, ajustar volume, `blog/…/02-editar-som.png`); o Streamz não tem `PATCH` de som (`apps/api/.../soundboard.controller.ts` só tem `GET`/`POST`/`DELETE`), então o lápis fica **visível e desabilitado**, dica "Editar som (em breve)" (§6.6 do PROCESSO) |
 * | largura das colunas | 220/auto/32%/88 | **72/auto/40%/88** — não medidas fresh (catálogo não dá px), herdadas de `EmojiTab.tsx`, a aba vizinha do mesmo grupo "Expressões" do menu: mesma grade ao trocar de aba, e a coluna de imagem/emoji já tinha sido medida ali (print `100649`, citado em `TABELA_CABECALHO`) |
 *
 * O card de 148×40 do painel de chamada (`loadingSoundItem_b2dcc1`,
 * `css-bruto/sob-demanda/d6f353f39f71fa89.css`) **não** é desta tela: aqui é
 * tabela, lá é grade de cards — confirmado pelo próprio print da configuração
 * (`08.png`), que mostra tabela.
 *
 * Não é o único lugar de gestão, e não deveria ser: quem percebe que falta um
 * som está **na chamada**, com o painel aberto, e ali o "+ Adicionar som" e o
 * menu de contexto do card resolvem sem sair da call. Esta aba é a entrada
 * pelas configurações — as duas mandam nas mesmas rotas, e a lista se atualiza
 * pelos eventos `soundboard.updated`, então não há duas cópias do estado.
 *
 * **Por que a prévia não usa `useSoundboard().tocarLocalmente`:** aquela
 * função é para quem **ouve o `soundboard.play` de outra pessoa na chamada**
 * (`hooks/useRealtime.ts:384`). Esta prévia chama `tocarNaSaida`
 * (`lib/soundboard-audio.ts`) direto, com o volume de `volumeDoEfeito` (volume
 * dos efeitos vezes o de referência do arquivo — a mesma conta do painel da
 * chamada); `tocarNaSaida` também respeita `deafened`, então surdo cala a
 * prévia igual cala o resto. Antes a prévia criava um `Audio` próprio e por
 * isso tocava no alto-falante do sistema mesmo com um fone escolhido em "Voz e
 * vídeo"; agora sai no mesmo dispositivo dos efeitos da chamada.
 *
 * **Estados cobertos** (o pedido do cartão 6p-sons):
 * - **carregando** — `useSoundboard().carregado` começa `false`; enquanto isso
 *   a tabela mostra linhas-esqueleto (`LinhaEsqueleto`) do mesmo `h-[55px]`
 *   das linhas reais, em vez de "Nenhum som ainda." como se já soubéssemos que
 *   não há nada.
 * - **vazio** — "Nenhum som ainda.", só depois de `carregado` (a frase da
 *   aba Emoji, mesmo padrão).
 * - **erro** — a store expõe `falhouCarregar` (antes a falha do
 *   `GET /soundboard` virava lista vazia e esta aba dizia "Nenhum som ainda."
 *   para quem estava sem internet). Na primeira carga que falha, a tabela e a
 *   contagem "Sons — 0/N" (que afirmaria um zero que ninguém sabe) dão lugar a
 *   `BlocoDeErro`, o mesmo desenho de `EngajamentoTab.tsx`, com "Tentar de
 *   novo" chamando `recarregar()`.
 * - **sem permissão** — não existe dentro desta página: `ServerSettingsModal.tsx`
 *   só lista a entrada "Painel de efeitos sonoros" para quem tem
 *   `MANAGE_EMOJIS` (mesmo padrão de `AplicativosTab.tsx`/`EngajamentoTab.tsx`),
 *   então quem chega aqui sempre pode gerenciar. Dentro da permissão, o teto
 *   do servidor (`MAX_SOUNDBOARD_POR_GUILD`) já desabilitava "Adicionar som" —
 *   mantido.
 * - **hover/foco** — lápis e lixeira só aparecem no hover da linha ou com o
 *   teclado (`focus-within`, como a aba Emoji); o botão de tocar fica sempre
 *   visível (é como se identifica o som, não uma ação secundária) e usa a
 *   família `fundo="sempre"` já medida de `BotaoDeIcone` (item 4 do cabeçalho
 *   dele). Tooltip e anel de foco vêm dos primitivos, não escritos aqui.
 * - **desabilitado** — "Adicionar som" no teto (já existia); "Editar" sempre
 *   (recurso ausente, acima); "Remover" desabilita por linha enquanto aquela
 *   remoção está em voo, para um clique duplo não disparar duas requisições.
 */
export default function SoundboardTab({ guildId }: { guildId: string }) {
  const sons = useSoundboard((s) => s.guilds.find((g) => g.guildId === guildId)?.sounds ?? []);
  const carregado = useSoundboard((s) => s.carregado);
  const falhouCarregar = useSoundboard((s) => s.falhouCarregar);
  const recarregar = useSoundboard((s) => s.recarregar);
  const volume = useSoundboard((s) => s.volume);
  const members = useGuilds((s) => s.members);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const previaRef = useRef<HTMLAudioElement | null>(null);
  // sair da aba com uma prévia tocando não deveria deixar som de fundo
  useEffect(() => () => previaRef.current?.pause(), []);

  function tocarPreview(som: SoundboardSound) {
    // um segundo clique rápido em outro som não deve somar às duas prévias
    previaRef.current?.pause();
    // autoplay bloqueado, arquivo fora do ar ou ensurdecido: `tocarNaSaida`
    // fica em silêncio — é só uma prévia, sem toast
    previaRef.current = tocarNaSaida(som.url, volumeDoEfeito(som, volume));
  }

  const erroNaCarga = !carregado && falhouCarregar;

  async function removerSom(som: SoundboardSound) {
    const ok = await ui.confirm({
      title: `Remover "${som.name}"?`,
      message: "O som sai do painel de todo mundo do servidor.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    setRemovendoId(som.id);
    try {
      await api.deleteSound(guildId, som.id);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível remover"), "error");
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <>
      <TituloDaPagina
        titulo="Painel de efeitos sonoros"
        subtitulo={`Sons que qualquer um da chamada toca para todo mundo ouvir. Até ${MAX_SOUNDBOARD_POR_GUILD} por servidor; MP3, OGG ou WAV de até ${KILOBYTES} KB e ${SEGUNDOS} segundos.`}
        acao={
          <Button
            variante="primario"
            tamanho="md"
            disabled={sons.length >= MAX_SOUNDBOARD_POR_GUILD}
            onClick={() => ui.openModal({ kind: "adicionarSom", guildId })}
            className="celular:h-[44px]"
          >
            Adicionar som
          </Button>
        }
      />

      {erroNaCarga ? (
        <BlocoDeErro tentar={() => void recarregar()} />
      ) : (
        <>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.02em] text-text-subtle">
            Sons — {sons.length}/{MAX_SOUNDBOARD_POR_GUILD}
          </p>

          {/* Fora da tabela de propósito: um `<span>` dentro de `<tbody>` não é
              HTML válido (só `<tr>` pode filhar `tbody`), e o navegador reordena
              conteúdo inválido — o que quebraria a hidratação do React. */}
          <p aria-live="polite" className="sr-only">
            {!carregado ? "Carregando sons…" : ""}
          </p>

          {/* A tabela rola por dentro no celular: `table-fixed` sem piso de
              largura espremeria quatro colunas em 358px e nenhuma ficaria legível.
              Em 520 (a mesma soma da aba Emoji) o piso não tem efeito no desktop. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed">
              <colgroup>
                <col className="w-[72px]" />
                <col />
                <col className="w-[40%]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead>
                <tr className={`h-10 ${TABELA_CABECALHO}`}>
                  <th scope="col" className="font-bold">
                    Emoji
                  </th>
                  <th scope="col" className="font-bold">
                    Nome
                  </th>
                  <th scope="col" className="font-bold">
                    Enviado por
                  </th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!carregado ? (
                  [0, 1, 2].map((i) => <LinhaEsqueleto key={i} />)
                ) : sons.length === 0 ? (
                  <tr className="h-[55px]">
                    <td colSpan={4} className="text-sm text-text-muted">
                      Nenhum som ainda.
                    </td>
                  </tr>
                ) : (
                  sons.map((som) => {
                    const autor = members.find((m) => m.user.id === som.createdById)?.user ?? null;
                    const removendo = removendoId === som.id;
                    return (
                      <tr key={som.id} className="group h-[55px] border-b border-border-subtle align-middle">
                        <td className="pr-2">
                          <BotaoDeIcone
                            rotulo={`Tocar "${som.name}"`}
                            icone={
                              som.emoji ? (
                                <Emoji emoji={som.emoji} tamanho={16} />
                              ) : (
                                <Volume2 size={16} aria-hidden="true" />
                              )
                            }
                            tamanho={28}
                            tamanhoDoIcone={16}
                            forma="disco"
                            fundo="sempre"
                            onClick={() => tocarPreview(som)}
                          />
                        </td>
                        <td className="pr-2">
                          <span className="truncate text-sm text-text-strong">{som.name}</span>
                        </td>
                        <td className="pr-2">
                          {autor ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar user={autor} size="sm" surface="border-background-base-lower" />
                              <span className="truncate text-sm text-text-default">
                                {displayNameOf(autor)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm text-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className="flex items-center justify-end gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 celular:opacity-100">
                            <BotaoDeIcone
                              rotulo="Editar"
                              icone={<Pencil size={16} />}
                              tamanho="md"
                              comFundo
                              desabilitado
                              motivoDesabilitado="Editar som (em breve)"
                              className="celular:h-[44px] celular:w-[44px]"
                            />
                            <BotaoDeIcone
                              rotulo="Remover"
                              icone={<Trash2 size={16} />}
                              tamanho="md"
                              comFundo
                              perigo
                              desabilitado={removendo}
                              onClick={() => void removerSom(som)}
                              className="celular:h-[44px] celular:w-[44px]"
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Falha da primeira carga dos sons. Desenho de `BlocoDeErro` em
 * `EngajamentoTab.tsx` (caixa `rounded-[4px] border border-border-subtle
 * bg-background-base-lowest`, `AlertTriangle` em `--status-warning`, botão
 * secundário com `RefreshCw`) — repetido, e não importado, porque lá é função
 * local sem `export`, num arquivo fora da lista deste cartão.
 */
function BlocoDeErro({ tentar }: { tentar: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-[4px] border border-border-subtle bg-background-base-lowest px-3 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-status-warning" aria-hidden="true" />
        <p className="min-w-0 text-sm text-text-muted">Não foi possível carregar os sons.</p>
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

/**
 * Linha-fantasma do estado de carregamento: as mesmas quatro colunas da linha
 * real, em barras `animate-pulse` — a forma da tabela que vai aparecer, sem
 * prometer nomes. `animate-pulse` é utilitário do Tailwind (como em
 * `voice/PainelDeSons.tsx`'s `PainelCarregando`), não um keyframe novo de
 * `globals.css`.
 */
function LinhaEsqueleto() {
  return (
    <tr aria-hidden="true" className="h-[55px] border-b border-border-subtle align-middle">
      <td className="pr-2">
        <div className="h-7 w-7 animate-pulse rounded-full bg-background-mod-muted" />
      </td>
      <td className="pr-2">
        <div className="h-3 w-24 animate-pulse rounded bg-background-mod-muted" />
      </td>
      <td className="pr-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-background-mod-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-background-mod-muted" />
        </div>
      </td>
      <td />
    </tr>
  );
}
