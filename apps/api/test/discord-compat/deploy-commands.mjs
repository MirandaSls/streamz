// **O `deploy-commands.js` padrão do guia do discord.js**, e é esse o ponto:
// a prova 1 da F3 é que o script que todo tutorial manda copiar roda contra a
// nossa API sem erro e sem gambiarra.
//
// Comparado com o do guia (https://discordjs.guide/creating-your-bot/command-deployment)
// há exatamente **duas** diferenças, e nenhuma delas é sobre comandos:
//
//   1. os comandos vêm inline em vez de saírem de `commands/**/*.js` (o guia lê
//      o diretório; aqui não há diretório a ler);
//   2. o `new REST()` recebe `{ api: API_URL }` — que é a mesma linha que o §14
//      do documento manda o dono do bot escrever para apontar um bot ao
//      Streamz. Sem ela o script iria para o discord.com, que é o esperado.
//
// O resto — `Routes.applicationGuildCommands`, o `rest.put`, o `body`, o
// try/catch, as mensagens — é palavra por palavra o do guia.
//
// Entrada: SEMENTE (o JSON de `semear.mjs`) e API_URL.
// Saída: uma linha de JSON no stdout com os comandos criados, para o resto da
// prova saber os ids.

import { REST, Routes, SlashCommandBuilder } from "discord.js";

const semente = JSON.parse(process.env.SEMENTE);
const API = process.env.API_URL;

const clientId = semente.bot.applicationSnowflake;
const guildId = semente.servidor.snowflake;
const token = semente.bot.token;

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Toca uma música")
    .addStringOption((option) =>
      option.setName("url").setDescription("link ou termo de busca").setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Responde com pong")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Ajusta o volume")
    .addIntegerOption((o) => o.setName("nivel").setDescription("de 0 a 100").setRequired(true))
    .addBooleanOption((o) => o.setName("suave").setDescription("transição suave"))
    .toJSON(),
];

const rest = new REST({ api: API }).setToken(token);

try {
  console.error(`Started refreshing ${commands.length} application (/) commands.`);

  const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });

  console.error(`Successfully reloaded ${data.length} application (/) commands.`);
  process.stdout.write(`${JSON.stringify(data)}\n`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
