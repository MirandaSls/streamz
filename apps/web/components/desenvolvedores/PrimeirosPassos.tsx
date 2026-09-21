"use client";

import { useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Lightbulb } from "@/components/ui/icones";
import { Button } from "@/components/ui/primitivos";
import { Cercado } from "@/components/desenvolvedores/Codigo";
import { Secao } from "@/components/desenvolvedores/Secao";

/**
 * O guia que converte: do zero a um bot respondendo `!ping`, em quatro passos.
 *
 * Fica **antes** da referência de propósito. Quem chega aqui não quer saber
 * quais rotas existem: quer saber se o bot que já escreveu roda. A referência
 * é para depois — e para quem volta.
 *
 * Os trechos são os do §14 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`, com as
 * três armadilhas que custaram tempo lá dentro:
 *
 * - **discord.js**: `rest.api` vai **sem** `/v10` — a lib acrescenta a versão
 *   (`${api}/v${version}${rota}`). Com o `/v10` escrito, toda rota vira
 *   `/api/v10/v10/...` e responde 404.
 * - **discord.py**: `Route.BASE` vai **com** a versão, ao contrário, **e** a
 *   segunda linha (`DEFAULT_GATEWAY`) não é opcional: sem ela o bot faz o REST
 *   contra o Streamz e abre o WebSocket no Discord de verdade, que recusa o
 *   token com close 4004 — um erro que parece nosso e não é.
 * - **Lavalink**: nada muda. Ele nem sabe que existe Discord.
 *
 * As URLs saem de `servidor` (a especificação, ou a `API_URL` desta
 * instância): quem sobe a própria instância abre esta página e copia o trecho
 * que já funciona ali, sem trocar domínio à mão.
 */
export function PrimeirosPassos({ servidor }: { servidor: string }) {
  const enderecos = useMemo(() => {
    const comVersao = servidor.replace(/\/+$/, "");
    // o `rest.api` do discord.js é a base SEM a versão; o `Route.BASE` do
    // discord.py é COM. Tiramos o `/v10` do fim para ter as duas formas.
    const semVersao = comVersao.replace(/\/v\d+$/, "");
    const raiz = semVersao.replace(/\/api$/, "");
    return {
      comVersao,
      semVersao,
      gateway: `${raiz.replace(/^http/, "ws")}/gateway`,
      cdn: `${raiz}/cdn`,
    };
  }, [servidor]);

  return (
    // "Rode o seu primeiro bot", e não "Primeiros passos": a especificação
    // publica um guia com esse nome (`x-guias`, o primeiro deles), e dois
    // títulos iguais em duas seções diferentes mandam o leitor para a errada.
    // Esta é a receita com as URLs **desta** instância; a de lá é o conceito.
    <Secao ancora="primeiros-passos" titulo="Rode o seu primeiro bot" className="flex flex-col gap-6">
      <p className="max-w-[720px] text-text-md leading-relaxed text-text-subtle">
        Quatro passos, nenhum deles no seu código de comando: o que muda entre o Discord e o Streamz é o
        endereço e o token.
      </p>

      <ol className="flex flex-col gap-4">
        <Passo numero={1} titulo="Crie o aplicativo">
          <p className="text-text-md leading-relaxed text-text-subtle">
            Um aplicativo é a identidade do seu bot: nome, avatar e o usuário-bot que vai aparecer na lista
            de membros. Ele se cria dentro do app, em Configurações → Aplicativos.
          </p>
          <Button
            href="/app?settings=aplicativos"
            variante="primario"
            tamanho="sm"
            iconeDireita={<ArrowRight size={16} aria-hidden="true" />}
            className="mt-4 celular:h-[44px] celular:w-full"
          >
            Abrir Aplicativos
          </Button>
        </Passo>

        <Passo numero={2} titulo="Copie o token">
          <p className="text-text-md leading-relaxed text-text-subtle">
            Na tela do aplicativo, gere o token do bot. Ele aparece{" "}
            <strong className="font-semibold text-text-default">uma única vez</strong> — guarde numa variável
            de ambiente, nunca no repositório. Toda chamada à API vai com ele no cabeçalho:
          </p>
          <Cercado
            className="mt-4"
            rotulo="Cabeçalho"
            linguagem="http"
            codigo={`Authorization: Bot SEU_TOKEN`}
          />
          <Aviso tom="atencao">
            O prefixo <code className="font-mono">Bot</code> é obrigatório, com o espaço — as bibliotecas o
            colocam sozinhas. Sem ele a API responde <code className="font-mono">401</code>. Vazou? Gere
            outro: o antigo é revogado na hora.
          </Aviso>
        </Passo>

        <Passo numero={3} titulo="Aponte a biblioteca para esta instância">
          <p className="text-text-md leading-relaxed text-text-subtle">
            É a única mudança de código. Repare que a forma não é a mesma nas duas bibliotecas — e que no
            discord.py são <strong className="font-semibold text-text-default">duas</strong> linhas.
          </p>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Cercado
              rotulo="discord.js v14 — index.js"
              linguagem="js"
              codigo={`const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,   // obrigatório para música
  ],
  rest: {
    api: '${enderecos.semVersao}',   // sem /v10: a lib acrescenta
    version: '10',
    cdn: '${enderecos.cdn}',   // opcional
  },
});

client.on('messageCreate', (m) => {
  if (m.content === '!ping') m.reply('pong');
});

client.login(process.env.STREAMZ_BOT_TOKEN);`}
            />
            <Cercado
              rotulo="discord.py — bot.py"
              linguagem="python"
              codigo={`import os, discord, yarl
from discord.ext import commands
from discord.gateway import DiscordWebSocket

# São DUAS linhas, não uma.
discord.http.Route.BASE = '${enderecos.comVersao}'   # com a versão
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL('${enderecos.gateway}')

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

@bot.command()
async def ping(ctx):
    await ctx.send('pong')

bot.run(os.environ['STREAMZ_BOT_TOKEN'])`}
            />
          </div>

          <Aviso tom="atencao">
            <strong className="font-semibold text-text-default">discord.js:</strong> o{" "}
            <code className="font-mono">rest.api</code> vai <em>sem</em> o <code className="font-mono">/v10</code>{" "}
            — a lib acrescenta a versão sozinha, e com ela escrita toda rota vira{" "}
            <code className="font-mono">/api/v10/v10/…</code> e responde 404. A URL do gateway não se
            configura: o <code className="font-mono">WebSocketManager</code> a pede pelo mesmo REST.{" "}
            <strong className="font-semibold text-text-default">discord.py:</strong> o{" "}
            <code className="font-mono">Route.BASE</code> vai <em>com</em> a versão, e sem a linha do{" "}
            <code className="font-mono">DEFAULT_GATEWAY</code> o bot abre o WebSocket no Discord de verdade,
            que recusa o token com close 4004.
          </Aviso>
        </Passo>

        <Passo numero={4} titulo="Rode e chame o bot para um servidor">
          <p className="text-text-md leading-relaxed text-text-subtle">
            Suba o processo com o token no ambiente. Depois, no Streamz, adicione o aplicativo a um servidor
            em que você tenha permissão de gerenciar — o usuário-bot entra na lista de membros e já responde.
          </p>
          <Cercado
            className="mt-4"
            rotulo="Terminal"
            linguagem="bash"
            codigo={`export STREAMZ_BOT_TOKEN='…'
node index.js        # discord.js
python bot.py        # discord.py`}
          />
          <Aviso tom="dica">
            Bot de música não muda nada: o Lavalink não sabe que existe Discord — ele recebe{" "}
            <code className="font-mono">endpoint</code>, <code className="font-mono">token</code> e{" "}
            <code className="font-mono">sessionId</code> do seu bot e conecta. Quem foi apontado para cá é o
            bot, nos passos acima.
          </Aviso>
        </Passo>
      </ol>
    </Secao>
  );
}

/** Um passo numerado: o número em pastilha, o título e o conteúdo. */
function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-border-subtle bg-background-base-low p-5 celular:p-4">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-control-primary-background-default text-text-sm font-semibold text-control-primary-text-default"
        >
          {numero}
        </span>
        <h3 className="min-w-0 text-heading-md font-semibold text-text-strong">
          <span className="sr-only">Passo {numero}: </span>
          {titulo}
        </h3>
      </div>
      {children}
    </li>
  );
}

/**
 * Nota de atenção ou dica.
 *
 * Duas decisões de legibilidade. A cor não carrega sozinha o recado (quem não
 * distingue as duas vê a mesma caixa): o ícone e a palavra que abre a frase,
 * só para leitor de tela, dizem qual é. E o **texto fica na tinta de corpo** —
 * o amarelo mora na barra e no ícone: uma nota inteira em `--text-feedback-
 * warning` com `<strong>` e `<code>` por dentro vira três cores brigando, e a
 * de menor contraste é justamente a do meio da frase.
 */
function Aviso({ tom, children }: { tom: "atencao" | "dica"; children: ReactNode }) {
  const atencao = tom === "atencao";
  return (
    <div
      className={`mt-4 flex gap-3 rounded-lg border-l-2 p-3 text-text-sm leading-relaxed text-text-subtle ${
        atencao
          ? "border-border-feedback-warning bg-background-feedback-warning"
          : "border-border-feedback-info bg-background-feedback-info"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 ${atencao ? "text-text-feedback-warning" : "text-text-feedback-info"}`}
        aria-hidden="true"
      >
        {atencao ? <AlertTriangle size={16} /> : <Lightbulb size={16} />}
      </span>
      <p className="min-w-0">
        <span className="sr-only">{atencao ? "Atenção: " : "Dica: "}</span>
        {children}
      </p>
    </div>
  );
}
