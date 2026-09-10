import { GatewayIntentBits } from "discord.js";
import { Permission } from "@streamz/shared";
import type { Bot, ContextoDoBot } from "../runtime/tipos";
import { COMANDOS } from "./comandos";
import { ServicoDeMusica, definirServico, obterServico } from "./servico";

/**
 * **Streamz Música** — o bot oficial de música da instância.
 *
 * O nome é próprio de propósito. Os bots que fazem isto no Discord (e todo
 * mundo sabe quais são) são serviços de terceiros, de código fechado, que só
 * falam com o `discord.com`: não dá para instalá-los aqui, e usar o nome ou a
 * marca deles seria se passar por eles. Este é nosso, roda neste servidor, e o
 * código está no repositório.
 *
 * ## O que ele faz hoje **sem a ponte de voz**
 *
 * Sobe, conecta no gateway, registra os onze comandos de barra, aparece no
 * diretório, entra em servidores e **responde a tudo**. O que ele não faz é
 * emitir som: para isso a ponte de voz (`apps/ponte-voz`) precisa estar no ar,
 * com `voz.streamz.chat` no DNS e a 7883/udp aberta — duas ações do dono do
 * servidor que ainda não foram feitas. O `/tocar` nesse estado responde a
 * frase de `SEM_PONTE_DE_VOZ` em vez de pendurar (ver `servico.ts`).
 */

const bot: Bot = {
  nome: "Streamz Música",

  // A descrição vai para o diretório e é contrato com quem instala: ela diz o
  // que o bot **não** faz (Spotify) antes de alguém descobrir sozinho.
  descricao:
    "Toca música nos canais de voz do servidor. Busca por nome ou link, fila, " +
    "repetição, embaralhar e volume — por comando de barra ou pelo prefixo `!`. " +
    "Link do Spotify vira busca: o Spotify não libera o áudio para outros " +
    "aplicativos, então toca a gravação equivalente.",

  comandos: COMANDOS,

  // Obrigatório para música: sem `GuildVoiceStates` o bot não enxerga em que
  // canal quem pediu está, e o cliente do Lavalink nunca recebe o
  // `VOICE_STATE_UPDATE` que ele repassa ao servidor de áudio.
  intents: [GatewayIntentBits.GuildVoiceStates],

  // O que a tela de instalação sugere. Só o necessário: ver e escrever no canal
  // onde responde, entrar e falar no canal de voz. Nada de gerenciar nada.
  permissoesPadrao:
    Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.CONNECT | Permission.SPEAK,

  icone: "assets/musica.png",

  async aoIniciar(ctx: ContextoDoBot) {
    const servico = new ServicoDeMusica(ctx);
    definirServico(servico);
    await servico.iniciar();
  },

  async aoDesligar() {
    // Sair das calls antes de o processo morrer: um bot que some sem sair fica
    // na coluna de voz do web até a faxina do estado de voz passar.
    try {
      await obterServico().desligar();
    } finally {
      definirServico(null);
    }
  },
};

export default bot;
