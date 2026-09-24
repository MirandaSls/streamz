"use client";

import { MonitorX, Video } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import { isGroupChannel } from "@streamz/shared";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useVoice } from "@/stores/voice";

/**
 * Sigla do servidor sem ícone — o mesmo fallback do rail (`acronym` em
 * `GuildRail.tsx`), repetido aqui porque aquela função não é exportada e este
 * cartão só pode tocar neste arquivo. Mesma regra: iniciais de cada palavra,
 * até 4 letras.
 */
function sigla(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * O ícone de onde a transmissão está: o servidor da chamada (imagem ou sigla
 * sobre o mesmo fundo neutro que `GuildRail` usa em repouso — aqui não há
 * hover nem estado ativo para herdar o limão) ou, numa DM/grupo, o mesmo
 * avatar que o resto do app já desenha para aquela conversa (`Avatar`/
 * `GroupAvatar`, ambos 32px em `size="md"`) — nunca uma versão nova de
 * nenhum dos dois.
 *
 * A origem sai direto de `useVoice`: `guildId`/`channelId` já são o par que
 * `GuildRail` usa para o selo de voz do rail (`vozGuildId`), sem precisar
 * cruzar canal → servidor de novo.
 */
function IconeDaOrigem() {
  const guildId = useVoice((s) => s.guildId);
  const channelId = useVoice((s) => s.channelId);
  const guild = useGuilds((s) => (guildId ? s.guilds.find((g) => g.id === guildId) : undefined));
  const dm = useDMs((s) => (!guildId && channelId ? s.channels.find((c) => c.id === channelId) : undefined));

  return (
    <span className="relative inline-grid h-8 w-8 shrink-0 place-items-center">
      {guildId ? (
        // servidor: imagem ou sigla, raio 8 (medida pedida para este selo —
        // o rail usa 12, mas aqui a peça é outra e menor).
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-interactive-background-hover text-[11px] font-semibold text-text-default"
        >
          {guild?.iconUrl ? (
            // o ícone é servido pelo proxy público da API, como em GuildRail
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guild.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            guild && sigla(guild.name)
          )}
        </span>
      ) : dm && isGroupChannel(dm) ? (
        <GroupAvatar iconUrl={dm.iconUrl} members={dm.others} size="md" />
      ) : dm?.others[0] ? (
        <Avatar user={dm.others[0]} size="md" />
      ) : (
        // instante entre a store de voz e as de servidor/DM ainda carregando
        // o registro — mesmo fundo neutro do resto do estado sem foto, sem
        // inventar sigla nem avatar de ninguém.
        <span aria-hidden="true" className="h-8 w-8 rounded-lg bg-interactive-background-hover" />
      )}

      {/*
        Selo "esta é a transmissão": quadrado vermelho com a câmera, como o
        Discord marca o ícone que está transmitindo. Vermelho é
        `bg-status-danger` — o mesmo token da pílula "AO VIVO"
        (`ScreenShareButton.AoVivoIndicador`, `CallStage`, `TileDeVoz`), não
        um vermelho novo — com `text-control-critical-primary-text-default`
        por cima, o par de texto/ícone que já acompanha esse fundo nos
        mesmos lugares.
        O anel é `background-base-low`: a cor do painel onde este cartão mora
        (`UserFooter.tsx`, o mesmo token que o `Avatar` do card do usuário usa
        em `surface`) — é o que separa o selo do ícone por baixo, como o anel
        do avatar separa a bolinha de status da foto.
        Fica **fora** do quadrado com `overflow-hidden` de cima (é irmão dele
        dentro do wrapper relativo), senão o corte do ícone cortaria o selo
        também.
      */}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-[6px] bg-status-danger text-control-critical-primary-text-default ring-2 ring-background-base-low"
      >
        <Video size={10} />
      </span>
    </span>
  );
}

/**
 * Linha "Transmitir" — topo do painel flutuante, acima de "Voz conectada",
 * só quando a **minha** tela está no ar (`screenOn`). É o equivalente do
 * bloco que o Discord mostra ali enquanto o usuário compartilha: a fonte
 * transmitida à esquerda e um jeito de parar sem procurar o botão na barra
 * de controles.
 *
 * Sem subtítulo com o nome da janela/aba: a store (`stores/voice.ts`) não
 * guarda qual fonte foi escolhida no seletor, só o fato de estar no ar
 * (`screenOn`) — inventar um nome aqui seria mentir um dado que não existe.
 *
 * O ícone à esquerda deixou de ser um quadrado de marca com um `MonitorUp`
 * solto (ver o comentário de `WelcomeModal.tsx` sobre ícone-sobre-decoração):
 * agora é o ícone do **servidor** da chamada, ou o avatar da **conversa**,
 * exatamente como o resto do app já os desenha — o selo vermelho de câmera
 * por cima é o que diz "é esta transmissão", como o Discord faz no cabeçalho
 * flutuante. Ver `IconeDaOrigem`.
 *
 * Parar por aqui chama o mesmo `pararTela` que `ScreenShareButton` já usa: um
 * caminho só de "encerrar a captura", como o resto do produto exige (§ o
 * comentário de `AoVivoIndicador`, que por essa mesma razão não duplica um
 * botão de parar).
 */
export function BlocoTransmitindo() {
  const screenOn = useVoice((s) => s.screenOn);
  const pararTela = useVoice((s) => s.pararTela);

  if (!screenOn) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-muted px-3.5 py-3">
      <IconeDaOrigem />

      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">Transmitir</span>

      <BotaoDeIcone
        rotulo="Parar de transmitir"
        icone={<MonitorX size={20} />}
        tamanho="md"
        comFundo
        onClick={() => void pararTela()}
      />
    </div>
  );
}
