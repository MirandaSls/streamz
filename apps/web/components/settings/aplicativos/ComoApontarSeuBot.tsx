"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "@/components/ui/icones";
import { Section } from "@/components/ui/controls";
import { Button } from "@/components/ui/primitivos";
import { API_URL } from "@/lib/config";
import { BlocoDeCodigo } from "@/lib/markdown";
import { ui } from "@/stores/ui";

/**
 * Os trechos do §14 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`, já com **a URL
 * desta instância**.
 *
 * A URL sai de `API_URL` (`lib/config.ts`) e nunca é escrita à mão: quem sobe
 * a própria instância abre esta tela e copia o trecho que já funciona ali.
 *
 * As três armadilhas medidas no §14, que estão nos trechos abaixo:
 *
 * - **discord.js**: `rest.api` vai **sem** `/v10` — a lib acrescenta
 *   (`${api}/v${version}${rota}`). Com o `/v10` escrito, toda rota vira
 *   `/api/v10/v10/...` e responde 404.
 * - **discord.py**: `Route.BASE` vai **com** a versão, ao contrário, **e** a
 *   segunda linha (`DEFAULT_GATEWAY`) não é opcional: sem ela o bot faz o REST
 *   inteiro contra o Streamz e abre o WebSocket no Discord de verdade, que
 *   recusa o token com close 4004 — um erro que parece nosso e não é.
 * - **Lavalink**: nada muda. Ele nem sabe que existe Discord.
 *
 * Não tem par no Discord (a documentação dele mora fora do cliente). O bloco
 * de código **é** o do chat (`BlocoDeCodigo` de `lib/markdown.tsx`, o
 * `.markup code` medido: raio 4, borda 1px `--border-normal`, fundo
 * `--background-code`, 14/18, `padding:.5em`, tinta `--text-code`), com o
 * mesmo destaque de sintaxe e o mesmo botão de copiar no hover, para o trecho
 * ler como código em qualquer lugar do app. Vai com `documento`: sem quebra de
 * linha (rola dentro de si, porque o trecho é para copiar e comparar linha a
 * linha), sem os tetos de largura da linha de mensagem e sem ligaduras.
 *
 * O botão "Copiar" do título continua: o do bloco só aparece no hover, e no
 * celular não há hover — ali o do título é o único alvo de 44px.
 */
export function ComoApontarSeuBot() {
  const enderecos = useMemo(() => {
    const base = API_URL.replace(/\/+$/, "");
    // o gateway compatível é `/gateway` no mesmo processo que serve `/api`
    // (`discord-compat/gateway/servidor.ts`), então basta trocar o esquema
    const gateway = `${base.replace(/^http/, "ws")}/gateway`;
    return { base, rest: `${base}/api`, restComVersao: `${base}/api/v10`, gateway };
  }, []);

  return (
    <Section id="apontar" title="Como apontar seu bot" semDivisoria>
      <p className="mb-6 text-text-sm text-text-subtle">
        O bot que você já escreveu para o Discord roda aqui sem mudar de biblioteca: o que muda é o
        endereço. Os trechos abaixo já vêm com o endereço <strong className="text-text-default">desta</strong>{" "}
        instância.
      </p>

      {/* Esta seção resolve "como aponto"; a referência completa (todas as
          rotas, eventos do gateway, permissões, códigos de erro) mora na página
          pública e não cabe dentro do modal de configurações. */}
      <p className="mb-6 text-text-sm text-text-subtle">
        A referência completa da API — rotas, eventos do gateway, permissões e códigos de erro — está
        em{" "}
        <a
          href="/desenvolvedores"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-text-link hover:underline"
        >
          Desenvolvedores
        </a>
        .
      </p>

      <Trecho
        titulo="discord.js v14"
        nota="O `rest.api` vai sem o `/v10`: a lib acrescenta a versão sozinha. A URL do gateway não se configura — o `WebSocketManager` a pede pelo mesmo REST, então trocar o `rest.api` já a redireciona."
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
    api: '${enderecos.rest}',   // sem /v10: a lib acrescenta
    version: '10',
    cdn: '${enderecos.base}/cdn',   // opcional
  },
});

client.on('messageCreate', (m) => { if (m.content === '!ping') m.reply('pong'); });
client.login(process.env.STREAMZ_BOT_TOKEN);`}
      />

      <Trecho
        titulo="discord.py"
        nota="São DUAS linhas, não uma. O `Route.BASE` vai COM a versão (ao contrário do discord.js), e sem a segunda linha o bot faz o REST inteiro contra o Streamz e abre o WebSocket no Discord de verdade, que recusa o token com close 4004."
        linguagem="python"
        codigo={`import os, discord, yarl
from discord.ext import commands
from discord.gateway import DiscordWebSocket

# São DUAS linhas, não uma.
discord.http.Route.BASE = '${enderecos.restComVersao}'          # com a versão
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL('${enderecos.gateway}')

bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

@bot.command()
async def ping(ctx): await ctx.send('pong')

bot.run(os.environ['STREAMZ_BOT_TOKEN'])`}
      />

      <Trecho
        titulo="Lavalink"
        nota="Nada muda no Lavalink. Ele nem sabe que existe Discord: recebe `endpoint`, `token` e `sessionId` do bot e conecta. O `application.yml` continua igual — quem foi apontado para cá é o bot, pelos passos acima."
        linguagem="http"
        codigo={`PATCH http://lavalink:2333/v4/sessions/{sessionId}/players/{guildId}
{ "voice": { "token": "…", "endpoint": "…", "sessionId": "…" } }`}
      />

      <p className="mt-6 text-text-xs text-text-muted">
        O token vai no cabeçalho como{" "}
        <code className="rounded border border-border-normal bg-background-code px-[0.2em] font-mono text-text-code">
          Authorization: Bot &lt;token&gt;
        </code>
        , exatamente como no Discord — as bibliotecas põem o prefixo sozinhas.
      </p>
    </Section>
  );
}

/** Um bloco de código com título, nota e botão de copiar com retorno visível. */
function Trecho({
  titulo,
  nota,
  linguagem,
  codigo,
}: {
  titulo: string;
  nota: string;
  linguagem: string;
  codigo: string;
}) {
  const [copiado, setCopiado] = useState(false);

  // o retorno some sozinho: sem isso, dois trechos copiados seguidos deixam
  // dois "Copiado" na tela e nenhum diz qual foi o último
  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiado]);

  function copiar() {
    const falhou = () => ui.toast("Não foi possível copiar o trecho", "error");
    const escrita = navigator.clipboard?.writeText(codigo);
    if (!escrita) return falhou();
    escrita.then(() => setCopiado(true), falhou);
  }

  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-text-md font-semibold text-text-strong">{titulo}</h4>
        <Button
          variante="secundario"
          tamanho="sm"
          aria-label={`Copiar o trecho de ${titulo}`}
          icone={copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          onClick={copiar}
          className="shrink-0 celular:h-[44px]"
        >
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="mb-2 text-text-sm text-text-muted">{nota}</p>
      {/* `documento` desliga a ligadura de propósito: com ela `===` vira `≡` e
          `=>` vira `⇒` na tela, e quem lê o trecho para digitar à mão copia o
          glifo errado — o botão manda o texto certo, mas os olhos vão no que
          veem. `linguagem` é a do cercado: js e python têm destaque; http não
          tem gramática e sai sem cor, como no chat. */}
      <BlocoDeCodigo lang={linguagem} v={codigo} documento />
    </div>
  );
}
