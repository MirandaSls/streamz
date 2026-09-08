// A prova do `compress=zlib-stream` (F2, lote C) com o **`zlib-sync` de
// verdade** — o mesmo módulo nativo que o `@discordjs/ws` carrega quando está
// instalado, e a razão de o zlib-stream existir aqui (§7, "Compressão").
//
// O teste unitário (`compressao.spec.ts`) prende o formato com o `zlib` do
// Node, que é o que dá para rodar na bateria sem trazer uma dependência nativa
// para o monorepo. Este script fecha a outra metade: o cliente é o módulo real.
//
// Roda num contêiner descartável, contra um Streamz já de pé:
//
//   SEM=$(docker exec -e API_URL=http://localhost:3333/api <api> \
//           node apps/api/test/discord-compat/semear.mjs | tail -1)
//   docker run --rm --network <rede> -e SEMENTE="$SEM" \
//     -e API_URL=http://<api>:3333/api -v "$PWD:/prova:ro" -w /tmp node:22 \
//     bash -lc 'npm i --silent zlib-sync ws && cp /prova/prova-zlib.mjs . && node prova-zlib.mjs'
//
// O op 4 no fim só rende o par de voz se a API tiver `PONTE_VOZ_SEGREDO` e as
// três variáveis do LiveKit (é o que o `prova-op4.sh` configura); sem elas, os
// três primeiros quadros já provam o que este script existe para provar.

import zlib from "zlib-sync";
import WebSocket from "ws";

const semente = JSON.parse(process.env.SEMENTE);
const base = process.env.API_URL.replace(/^http/, "ws").replace(/\/api$/, "");
const comVoz = process.env.COM_VOZ !== "0";

// Um inflate só para a conexão inteira — é o ponto: o dicionário atravessa as
// mensagens, e um inflate por quadro estouraria no segundo.
const inflate = new zlib.Inflate({ chunkSize: 65535, to: "string" });
const quadros = [];
let binarios = 0;
let textos = 0;

const soquete = new WebSocket(`${base}/gateway?v=10&encoding=json&compress=zlib-stream`);
soquete.on("message", (dado, binario) => {
  if (!binario) {
    textos += 1;
    quadros.push(JSON.parse(String(dado)));
    return;
  }
  binarios += 1;
  const bloco = Buffer.from(dado);
  // `00 00 FF FF` é o fim de mensagem do `Z_SYNC_FLUSH`. É exatamente o teste
  // que o `@discordjs/ws` faz antes de mandar o bloco para o inflate.
  const fim = bloco.length >= 4 && bloco.readUInt32BE(bloco.length - 4) === 0x0000ffff;
  inflate.push(bloco, fim && zlib.Z_SYNC_FLUSH);
  if (!fim) return;
  if (inflate.err) throw new Error(`zlib-sync: ${inflate.msg}`);
  quadros.push(JSON.parse(inflate.result));
});

await new Promise((ok, erro) => {
  soquete.once("open", ok);
  soquete.once("error", erro);
});

soquete.send(JSON.stringify({ op: 2, d: { token: semente.bot.token, intents: 1 | (1 << 7) } }));
await new Promise((r) => setTimeout(r, 2500));

if (comVoz) {
  soquete.send(
    JSON.stringify({
      op: 4,
      d: {
        guild_id: semente.servidor.snowflake,
        channel_id: semente.canalDeVoz.snowflake,
        self_deaf: true,
        self_mute: false,
      },
    }),
  );
  await new Promise((r) => setTimeout(r, 2500));
}
soquete.close();

console.log(`quadros: binarios=${binarios} texto=${textos}`);
console.log(
  "lidos pelo zlib-sync:",
  quadros.map((q) => `op=${q.op}${q.t ? ` ${q.t}` : ""}${q.s ? ` s=${q.s}` : ""}`).join(" | "),
);
const servidorDeVoz = quadros.find((q) => q.t === "VOICE_SERVER_UPDATE");
if (servidorDeVoz) {
  console.log(
    `VOICE_SERVER_UPDATE descomprimido: endpoint=${servidorDeVoz.d.endpoint} token=${servidorDeVoz.d.token.length} bytes`,
  );
}

const nomes = quadros.filter((q) => q.op === 0).map((q) => q.t);
const esperados = comVoz
  ? ["READY", "GUILD_CREATE", "VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"]
  : ["READY", "GUILD_CREATE"];
const ok =
  textos === 0 &&
  binarios >= esperados.length + 1 &&
  quadros[0]?.op === 10 &&
  esperados.every((n) => nomes.includes(n));
console.log(ok ? "\n=== zlib-sync leu TODOS os quadros: OK ===" : "\n=== FALHOU ===");
process.exit(ok ? 0 : 1);
