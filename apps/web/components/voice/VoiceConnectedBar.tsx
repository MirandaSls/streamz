"use client";

import { useRef, useState } from "react";
import { AudioLines, Apps, PhoneOff, RotateCw, Signal, SignalZero, Video, VideoOff } from "@/components/ui/icones";
import Tooltip from "@/components/ui/Tooltip";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import BotaoDeSons from "@/components/voice/BotaoDeSons";
import PopoverDeRuido from "@/components/voice/PopoverDeRuido";
import ScreenShareButton from "@/components/voice/ScreenShareButton";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { ui } from "@/stores/ui";
import { useVoice } from "@/stores/voice";
import { rotuloDoPing, useVoicePing, type QualidadeDeVoz } from "@/stores/voice-ping";

/**
 * Barra "Voz conectada" — mora acima do painel do usuário, no rodapé da coluna
 * 2, como no Discord.
 *
 * Ela existe para o caso em que a call **não está na tela**: o usuário entrou
 * num canal de voz e foi ler outro canal de texto. Sem essa barra não haveria
 * como voltar para a call, nem lembrar que ela existe.
 *
 * São duas linhas, e a divisão é deliberada: a de cima responde "onde eu estou
 * e como saio"; a de baixo é a fileira de ações largas, que precisam de alvo
 * grande porque são usadas no meio de uma conversa, sem olhar.
 *
 * A **supressão de ruído** mora na linha de cima, colada no desligar, e não na
 * barra do palco: é a posição do Discord, e a razão é a mesma que justifica
 * este painel existir — quem entrou num canal de voz e foi ler outro canal não
 * tem o palco na tela, e é justamente aí que se percebe que o microfone está
 * captando o ventilador. O ícone **abre uma caixa** (ver `PopoverDeRuido`), não
 * alterna direto: quem clica ali está em dúvida, e a dúvida se responde falando
 * e vendo a barra mexer.
 *
 * A fileira de baixo é **quatro cápsulas de tamanho fixo**, não mais
 * `flex-1` esticando para preencher a barra. Medido nas prints `2026-08-31
 * 101842` (coluna x=200 e x=340, y=803–834, contando o 1px de borda
 * antisserrilhada) e `160106` (repete as mesmas quatro): câmera, tela,
 * atividade, soundboard, 74×32 cada, 10px de vão, ocupando x=24–349
 * (24–97, 108–181, 192–265, 276–349). Uma rodada anterior tinha descontado
 * essa borda e medido 30 de altura — os 2px que faltavam. Tínhamos 3
 * controles esticados (101 e 102px, e um terceiro sem cápsula em x≈250–259,
 * porque `flex-1` cresce até a barra acabar). "Atividade" não existe no
 * produto (§6.6): fica visível a 50%, com a dica "(em breve)", em vez de
 * sumir e a fileira virar 3 outra vez.
 *
 * Sem rótulo de texto: dois botões com texto ("Vídeo", "Tela") pareciam mais
 * claros e são menos: o rótulo empurra o alvo clicável para menos da metade
 * da largura e obriga a abreviar quando a coluna encolhe.
 *
 * O ícone de sinal responde ao **ping** (`useVoicePing`, medido a cada 2 s):
 * tooltip "Ping: N ms" no hover e a cor pela qualidade — o verde de
 * "conectado" é `--icon-feedback-positive` (#5eb479), medido no miolo do
 * ícone e no selo da print `101842` (linha y=774, x=39 e x=44); amarelo e
 * vermelho são os tokens de aviso/perigo que já existiam (não remedidos
 * nesta rodada).
 */

/** Cor do selo do sinal pela qualidade; "excelente" = verde de "conectado"
 *  medido (ver comentário do componente); boa/ruim sem medida nesta rodada.
 *  O fundo do selo é `#1d2726` (print `101842`, linha y=759–790 x=24–55, e a
 *  mesma cor em `160106` x=24–30 y=610) — mais escuro que o próprio cartão
 *  (`#202024`) no canal R, então não é opacidade de token sobre o fundo:
 *  `bg-icon-feedback-positive/15` (ou `bg-status-positive/15`) sobre `#202024`
 *  clareia para `#24332c`/verde translúcido, e o medido escurece. Fica o
 *  valor cru até achar um token que bata (ver "faltando"); o ícone continua
 *  `text-icon-feedback-positive`. */
const COR_DO_SINAL: Record<QualidadeDeVoz, string> = {
  excelente: "bg-[#1d2726] text-icon-feedback-positive",
  boa: "bg-status-warning/15 text-status-warning",
  ruim: "bg-status-danger/15 text-status-danger",
};
export default function VoiceConnectedBar() {
  const channelId = useVoice((s) => s.channelId);
  const guildId = useVoice((s) => s.guildId);
  const nomeDoCanal = useVoice((s) => s.channelName);
  const status = useVoice((s) => s.status);
  const erro = useVoice((s) => s.erro);
  const camOn = useVoice((s) => s.camOn);
  const ruidoAvancado = useVoice((s) => s.audio.processamento.ruido === "avancada");
  const toggleCam = useVoice((s) => s.toggleCam);
  const disconnect = useVoice((s) => s.disconnect);
  const reconnect = useVoice((s) => s.reconnect);
  const conversas = useDMs((s) => s.channels);
  const guilds = useGuilds((s) => s.guilds);
  // store própria: a medição de 2 em 2 s não passa pelo `tick` da grade
  const pingMs = useVoicePing((s) => s.pingMs);
  const qualidade = useVoicePing((s) => s.qualidade);

  const [ruidoAberto, setRuidoAberto] = useState(false);
  // o botão, não a caixa: quem posiciona e fecha é o `PopoverFlutuante`
  const botaoDoRuido = useRef<HTMLButtonElement>(null);

  if (!channelId) return null;

  const conversa = conversas.find((d) => d.id === channelId);
  const titulo = guildId ? nomeDoCanal || "voz" : conversa ? dmTitle(conversa) : "Chamada";
  const servidor = guildId ? guilds.find((g) => g.id === guildId)?.name ?? null : null;
  const falhou = status === "error";

  /** Volta para o canal da call — o caminho de "onde isso está acontecendo?". */
  function irParaCall() {
    if (guildId) {
      const guild = guilds.find((g) => g.id === guildId);
      const canal = useChannels.getState().channels.find((c) => c.id === channelId);
      ui.setView("guild");
      if (guild) useGuilds.getState().select(guild);
      if (canal) useChannels.getState().select(canal);
      return;
    }
    ui.setView("dm");
    if (conversa) useDMs.getState().select(conversa);
  }

  return (
    <div /*
        Sem moldura própria: esta é a **seção de cima de um cartão só**, não um
        cartão separado. No Discord o bloco inteiro tem 163px contínuos, com uma
        divisória de 1px entre voz e usuário; nós tínhamos dois cartões com 8px
        de fundo aparecendo no meio.

        O que torna a junção segura: a seção do usuário **não se move** — em
        chamada ou fora dela ela ocupa a mesma faixa, e é a seção de voz que
        cresce para cima. Por isso o respiro fixo das listas continua valendo.

        Altura: Discord 104px só na seção de voz (y=745–848 na print `101842`;
        104 também em `160106`, y=575–678): 14 até o selo, selo de 32, 12 até
        as cápsulas, cápsula de 32, 14 embaixo. A nossa linha de cima tinha 36
        (título de 20 + subtítulo de 16 empilhados, maior que o selo de 32) —
        travada em `h-8` com `leading-[18px]`/`leading-[14px]` abaixo, o total
        fecha 14+32+12+32+14 = 104, com as cápsulas também em 32 (ver a
        fileira de baixo).

        Divisória: `border-border-muted`, não `-subtle` — no Discord a linha
        entre voz e usuário (y=849 em `101842`) é a mesma cor da borda do
        cartão (y=744/906), e o token que bate com essa cor mais escura é
        `-muted`.
      */
      className="flex shrink-0 flex-col gap-3 border-b border-border-muted px-3.5 pb-[14px] pt-[14px]" data-voice-bar>
      <div className="flex h-8 items-center gap-1">
        {/*
          O selo sai de dentro da linha do título e vira irmão dela: no Discord
          o ícone fica à esquerda e **título e subtítulo empilham ao lado dele**.
          Do jeito anterior o subtítulo começava na borda do painel, embaixo do
          ícone — o nome do canal caía 39px à esquerda do título. É o mesmo
          sintoma de "ficar no canto" que o participante do canal tinha.
        */}
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {/* Selo de 32px em volta do sinal, como no Discord: sem ele o estado
              "conectado" é só um texto verde, e o bloco perde a âncora visual
              que diz onde a call mora. A cor vem da qualidade medida do ping. */}
          <Tooltip label={falhou ? "Sem conexão" : rotuloDoPing(pingMs)}>
            <span
              aria-label={falhou ? "Sem conexão" : rotuloDoPing(pingMs)}
              /* Quadrado arredondado, não círculo. Eu tinha feito redondo no #55 e
                 estava errado: o ajuste de raio no perfil de pixels do canto dá
                 7,5 (erro 0,015) contra 16 do círculo (erro 0,54) — uma ordem de
                 grandeza. A aresta reta de cima e a da esquerda existem no print,
                 e num círculo elas não existiriam. */
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                falhou
                  ? "bg-status-danger/15 text-status-danger"
                  : status === "connecting"
                    ? "bg-interactive-background-hover text-text-muted"
                    : COR_DO_SINAL[qualidade ?? "excelente"]
              }`}
            >
              {falhou ? (
                <SignalZero size={18} aria-hidden="true" />
              ) : (
                <Signal size={18} aria-hidden="true" />
              )}
            </span>
          </Tooltip>

          <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* o texto precisa do próprio span: `truncate` num container flex
                corta sem reticências */}
            <span
              // `leading-[18px]`: com o subtítulo abaixo em `leading-[14px]`,
              // 18+14=32 preenche exatamente o selo de 32 ao lado — sem travar
              // a entrelinha, o `text-sm`/`text-xs` padrão empilhados somavam
              // 36 e a linha de cima crescia mais que o selo (ver comentário
              // do container).
              className={`truncate text-sm font-semibold leading-[18px] ${
                // verde medido `#5eb479` = `--text-feedback-positive` (mesmo
                // par que `CanalDeVoz.tsx` já usa para "Em voz"); tínhamos
                // `--status-positive` (`#3d9e60`, o mesmo do bolinha "online",
                // mais escuro e menos saturado — print `101842` linha y=774).
                falhou ? "text-status-danger" : status === "connecting" ? "text-text-muted" : "text-text-feedback-positive"
              }`}
            >
              {falhou ? "Erro de voz" : status === "connecting" ? "Conectando…" : "Voz conectada"}
            </span>
            <button
              type="button"
              onClick={irParaCall}
              // `text-text-subtle` (não `-muted`) nas duas partes, sem cor à
              // parte no nome do servidor: no Discord "canal" e "/ servidor"
              // são um pico de cor só (#a1a2a7/#a6a7ac, print `101842` y=782).
              // Tínhamos `-muted` no canal e `text-channels-default` no
              // servidor — duas cores, e a segunda mais escura que a medida.
              className="block max-w-full truncate text-left text-xs leading-[14px] text-text-subtle hover:underline"
            >
              {titulo}
              {servidor && <span> / {servidor}</span>}
            </button>
          </span>
        </span>

        <BotaoDeIcone
          ref={botaoDoRuido}
          rotulo="Supressão de ruído"
          icone={<AudioLines size={20} />}
          tamanho="md"
          comFundo
          ativo={ruidoAvancado}
          aria-expanded={ruidoAberto}
          onClick={() => setRuidoAberto((v) => !v)}
        />

        <PopoverFlutuante
          ancora={botaoDoRuido}
          aberto={ruidoAberto}
          onFechar={() => setRuidoAberto(false)}
          rotulo="Supressão de ruído"
        >
          <PopoverDeRuido />
        </PopoverFlutuante>

        {/* sem botão de chat aqui: o nome do canal logo acima já leva à call, e
            o chat do canal de voz tem o próprio alternador no cabeçalho dele */}
        <BotaoDeIcone
          rotulo="Desconectar"
          icone={<PhoneOff size={20} />}
          tamanho="md"
          comFundo
          perigo
          onClick={() => void disconnect()}
        />
      </div>

      {falhou && (
        // erro real (a queda da mídia), não "não configurado": só aqui faz
        // sentido gastar vermelho e oferecer a repetição
        <div className="flex items-center gap-2 rounded-[4px] bg-status-danger/15 px-2 py-1.5 text-xs text-status-danger">
          <span className="min-w-0 flex-1 truncate">{erro}</span>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="flex shrink-0 items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw size={12} aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      )}

      {/* Quatro cápsulas de 74×32 com 10px de vão (`gap-2.5`), medidas nas
          prints `101842`/`160106` — ver o comentário do componente. Nada mais
          cresce por `flex-1`: cada slot tem o tamanho medido, e o que sobra
          de largura na coluna fica vazio à direita, como no Discord (a
          fileira não "estica" para preencher o painel). */}
      <div className="flex items-center gap-2.5">
        {/* Câmera: única das quatro que é só deste arquivo, então o tamanho
            vai direto na classe (74×32, sem wrapper). */}
        <Tooltip label={camOn ? "Desligar câmera" : "Ligar câmera"} className="h-8 w-[74px] shrink-0">
          <button
            type="button"
            onClick={() => void toggleCam()}
            aria-pressed={camOn}
            aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
            className={`grid h-full w-full place-items-center rounded-lg transition ${
              camOn
                ? "bg-border-strong text-text-strong"
                : "bg-border-normal/60 text-interactive-text-active hover:bg-border-normal hover:text-text-strong"
            }`}
          >
            {camOn ? <Video size={20} /> : <VideoOff size={18} />}
          </button>
        </Tooltip>

        {/* `ScreenShareButton`/`BotaoDeSons` não estão na lista deste cartão
            (§ escopo): a `variante="largo"` de cada um cresce por `flex-1`
            **próprio**, hardcoded no arquivo deles. O invólucro `flex` abaixo
            dá a esse `flex-1` um pai de largura fixa para preencher — 74 de
            largura sai certo —, e agora, com a correção de altura desta
            rodada (30→32, ver o comentário do componente), o invólucro subiu
            para `h-8`. O **botão** de dentro dos dois continua `h-[30px]`/
            `height: 30` (ver `ScreenShareButton.tsx:100` e
            `BotaoDeSons.tsx:68`, fora da lista deste cartão): sobra 2px de
            fundo do invólucro embaixo do botão. Não dá para fechar sem tocar
            nos dois arquivos — ver "faltando". */}
        <div className="flex h-8 w-[74px] shrink-0">
          <ScreenShareButton variante="largo" />
        </div>

        {/* "Atividade": terceiro botão do Discord nesta fileira (`101842`/
            `160106`: câmera, tela, atividade, soundboard) e o único que o
            Streamz não tem — não existe palco de atividade no produto, e
            simular uma função que não existe é pior que a ausência (§6.6,
            mesma regra do "presente"/"apps" do composer). Fica visível a 50%
            (via `desabilitado`), com a dica explicando o motivo, no lugar do
            terceiro ícone solto que virava a vaga do soundboard.
            Glifo `Apps` (as quatro formas em 2×2), não `Gamepad2`: o Discord
            mostra o mesmo losango/triângulo/flor/estrela do botão "Apps" do
            composer nesta vaga (manchas em x=221–227/231–235 e y=814–817/
            822–824, print `101842`) — controle de videogame não tem par lá. */}
        <BotaoDeIcone
          rotulo="Atividades"
          motivoDesabilitado="Atividades (em breve)"
          desabilitado
          icone={<Apps size={20} aria-hidden="true" />}
          // mesma cápsula de câmera e tela — ver o comentário em `BotaoDeSons`
          fundo="hover"
          className="bg-border-normal/60"
          style={{ width: 74, height: 32 }}
        />

        {/* Mesmo caso do invólucro da tela acima: `h-8` (32) aqui, mas o botão
            de dentro continua `height: 30` (`BotaoDeSons.tsx:68`, fora da
            lista deste cartão) — ver "faltando". */}
        <div className="flex h-8 w-[74px] shrink-0">
          <BotaoDeSons variante="largo" />
        </div>
      </div>
    </div>
  );
}
