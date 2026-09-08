// Degrau 3 da F2 (§6 do CONTRATO-F2.md): **`@discordjs/voice` sozinho, sem
// bot**, apontado para a ponte, tocando um `.ogg` → tem de aparecer um
// participante `bot:` na sala do LiveKit.
//
// Este arquivo é só o cliente. Quem sobe o ambiente descartável (LiveKit de
// brinquedo, terminador TLS, a ponte compilada da branch) e confere os
// participantes é o `prova-voz-degrau3.sh` ao lado.
//
// O que ele prova, na ordem em que acontece:
//
//   1. o aperto de mão do voice gateway contra a nossa ponte (HELLO, IDENTIFY,
//      READY, descoberta de IP no UDP, SELECT_PROTOCOL, SESSION_DESCRIPTION);
//   2. o RTP cifrado em `aead_aes256_gcm_rtpsize` saindo de uma lib de verdade;
//   3. e — o risco nº 2 do §15 — o quadro Opus chegando ao `WriteSample` do
//      pion sem transcodificação.
//
// **O JWT de entrada é assinado aqui** porque o lote B (que o assina na API)
// ainda não existe nesta branch. O shape é o do §3 do CONTRATO-F2.md, campo por
// campo; quando o lote B entrar, é este objeto que tem de continuar batendo.

import { createReadStream } from 'node:fs';
import { createHmac } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from '@discordjs/voice';

const ambiente = (nome, padrao) => {
  const valor = process.env[nome] ?? padrao;
  if (valor === undefined) throw new Error(`falta a variável ${nome}`);
  return valor;
};

const ENDPOINT = ambiente('PONTE_ENDPOINT', 'voz.teste'); // sem esquema e sem porta (§D5.8, risco 3)
const SEGREDO = ambiente('PONTE_VOZ_SEGREDO');
const LK_URL = ambiente('LIVEKIT_URL'); // o que a ponte usa para entrar na sala
const LK_KEY = ambiente('LIVEKIT_API_KEY', 'devkey');
const LK_SECRET = ambiente('LIVEKIT_API_SECRET', 'secret');
const SALA = ambiente('SALA', 'voice:prova-degrau3');
const OGG = ambiente('OGG', '/prova/audio.ogg');
const SEGUNDOS = Number(ambiente('SEGUNDOS', '20'));

// Os mesmos números do §3 do contrato: snowflake em string decimal, sempre.
const BOT = ambiente('BOT_ID', '1420000000000000001');
const GUILD = ambiente('GUILD_ID', '1418000000000000002');
const CANAL = ambiente('CANAL_ID', '1419000000000000003');
const SESSAO = ambiente('SESSION_ID', 'prova-degrau3-0001');
const IDENTIDADE = `bot:${BOT}`;
const NOME = 'Bot de música (prova)';

const emB64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

function assinarHs256(carga, segredo) {
  const cabecalho = emB64({ alg: 'HS256', typ: 'JWT' });
  const corpo = emB64(carga);
  const assinatura = createHmac('sha256', segredo).update(`${cabecalho}.${corpo}`).digest('base64url');
  return `${cabecalho}.${corpo}.${assinatura}`;
}

// O token do LiveKit que a API assinaria (§D5.6): `roomJoin`, `canPublish`,
// `canSubscribe: false` (bot de música não escuta), `canPublishData: false`.
function tokenDoLiveKit() {
  const agora = Math.floor(Date.now() / 1000);
  return assinarHs256(
    {
      iss: LK_KEY,
      sub: IDENTIDADE,
      name: NOME,
      nbf: agora - 10,
      exp: agora + 6 * 60 * 60, // 6 h, como decidido no §3 do contrato
      video: {
        room: SALA,
        roomJoin: true,
        canPublish: true,
        canSubscribe: false,
        canPublishData: false,
      },
    },
    LK_SECRET,
  );
}

// O JWT do `VOICE_SERVER_UPDATE`, campo por campo do §3 do CONTRATO-F2.md.
function tokenDaPonte() {
  const agora = Math.floor(Date.now() / 1000);
  return assinarHs256(
    {
      iss: 'streamz-api',
      aud: 'ponte-voz',
      sub: BOT,
      gid: GUILD,
      sid: SESSAO,
      sala: SALA,
      canal: CANAL,
      nome: NOME,
      ident: IDENTIDADE,
      lk: tokenDoLiveKit(),
      lkUrl: LK_URL,
      iat: agora,
      exp: agora + 15 * 60, // 15 min (§3: 60 s quebra a reconexão do @discordjs/voice)
    },
    SEGREDO,
  );
}

function agora() {
  return new Date().toISOString().slice(11, 23);
}

function contar(rotulo) {
  console.log(`[${agora()}] ${rotulo}`);
}

async function principal() {
  const token = tokenDaPonte();
  contar(`JWT da ponte montado: ${token.length} bytes (o risco nº 1 do §D5.8 é justamente o tamanho)`);
  contar(`endpoint=${ENDPOINT} sala=${SALA} identidade=${IDENTIDADE}`);

  // O "adaptador" é o que, num bot de verdade, fala com o gateway principal.
  // Aqui não há gateway: nós mesmos entregamos o VOICE_STATE_UPDATE e o
  // VOICE_SERVER_UPDATE, na ordem do §8 do documento.
  let metodos;
  const conexao = joinVoiceChannel({
    channelId: CANAL,
    guildId: GUILD,
    selfDeaf: true,
    selfMute: false,
    debug: true,
    adapterCreator: (m) => {
      metodos = m;
      return {
        // O op 4 que a lib mandaria ao gateway: aqui vira um `console.log`.
        sendPayload: (carga) => {
          contar(`op 4 UPDATE_VOICE_STATE que o bot mandaria: ${JSON.stringify(carga.d)}`);
          return true;
        },
        destroy: () => {},
      };
    },
  });

  conexao.on('debug', (mensagem) => contar(`[voice] ${mensagem}`));
  conexao.on('error', (erro) => console.error(`[voice] erro:`, erro));
  conexao.on('stateChange', (de, para) => contar(`[voice] ${de.status} → ${para.status}`));

  metodos.onVoiceStateUpdate({
    guild_id: GUILD,
    channel_id: CANAL,
    user_id: BOT,
    session_id: SESSAO,
    deaf: false,
    mute: false,
    self_deaf: true,
    self_mute: false,
    self_video: false,
    suppress: false,
  });
  metodos.onVoiceServerUpdate({ token, guild_id: GUILD, endpoint: ENDPOINT });

  await entersState(conexao, VoiceConnectionStatus.Ready, 30_000);
  contar('conexão de voz PRONTA (o aperto de mão inteiro passou)');

  const tocador = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  tocador.on('error', (erro) => console.error('[tocador] erro:', erro));
  tocador.on('stateChange', (de, para) => contar(`[tocador] ${de.status} → ${para.status}`));
  conexao.subscribe(tocador);

  // `OggOpus`: o quadro sai do arquivo e vai para o fio **sem passar por codec**
  // — é exatamente o que o Lavalink faz (§8, "o bot nunca decodifica").
  const recurso = createAudioResource(createReadStream(OGG), { inputType: StreamType.OggOpus });
  tocador.play(recurso);
  await entersState(tocador, AudioPlayerStatus.Playing, 15_000);
  contar('tocando');

  const ateQuando = Date.now() + SEGUNDOS * 1000;
  while (Date.now() < ateQuando) {
    await esperar(2000);
    contar(`tocados ${Math.round(recurso.playbackDuration / 1000)} s (estado: ${tocador.state.status})`);
    if (tocador.state.status === AudioPlayerStatus.Idle && recurso.playbackDuration > 0) {
      // Fim do arquivo: recomeça, para o participante ficar na sala o tempo da
      // conferência.
      tocador.play(createAudioResource(createReadStream(OGG), { inputType: StreamType.OggOpus }));
    }
  }

  contar(`FIM: ${Math.round(recurso.playbackDuration / 1000)} s de áudio empurrados para a ponte`);
  conexao.destroy();
  await esperar(500);
}

principal().then(
  () => process.exit(0),
  (erro) => {
    console.error('prova-voz-degrau3 falhou:', erro);
    process.exit(1);
  },
);
