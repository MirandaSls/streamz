# Prova 4 da F1 (§12): o mesmo caminho, com **discord.py**.
#
# Vale por si e vale pelo que ela cobre e o discord.js não: o discord.py pede
# compressão **por padrão** (`compress=True`, que vira `compress=zlib-stream` na
# query do WebSocket). Nós ignoramos e mandamos quadro de texto; ele funciona
# assim mesmo porque `DiscordWebSocket.received_message` só descomprime
# `if type(msg) is bytes`. Se um dia alguém "consertar" isso mandando binário
# sem implementar o zlib-stream, é este script que quebra primeiro.
#
# ── São DUAS linhas de monkeypatch, não uma ──────────────────────────────────
#
# O §14 do documento diz que basta `discord.http.Route.BASE`, porque "a URL do
# gateway vem de `get_bot_gateway()` (nossa rota)". **Isso não é mais verdade.**
# Medido no discord.py 2.7.1: `Client.connect` não chama `get_bot_gateway()`, e
# `DiscordWebSocket.from_client` cai em `DEFAULT_GATEWAY`, que é a constante
# `wss://gateway.discord.gg/`. Sem a segunda linha o bot faz o REST inteiro
# contra o Streamz e depois abre o WebSocket **no Discord de verdade**, que
# recusa o nosso token com close 4004 — um erro que parece nosso e não é.
#
# (Ao contrário do discord.js, onde trocar `rest.api` redireciona o gateway
# junto, porque lá o `WebSocketManager` chama `/gateway/bot` pelo mesmo REST.)
#
# Roda num `python:3-slim` com `pip install discord.py`. Ver `prova.sh`.
# Entrada: SEMENTE (o JSON de `semear.mjs`) e API_URL.

import asyncio
import json
import os
import sys
import urllib.request

import discord
import yarl
from discord.ext import commands
from discord.gateway import DiscordWebSocket

semente = json.loads(os.environ["SEMENTE"])
api = os.environ["API_URL"]  # ex.: http://localhost:3410/api
token = semente["bot"]["token"]

# 1) o REST. Com a versão junto (ao contrário do discord.js).
discord.http.Route.BASE = f"{api}/v10"

# 2) o gateway. A URL sai da **nossa** rota `/gateway/bot` — é assim que o dono
#    descobriria qual é, e de quebra prova que a rota responde o que deve.
pedido = urllib.request.Request(
    f"{api}/v10/gateway/bot", headers={"Authorization": f"Bot {token}"}
)
with urllib.request.urlopen(pedido, timeout=15) as resposta:
    info = json.load(resposta)
print(f"OK   4a. GET /gateway/bot → {info}", flush=True)
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL(info["url"])

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

resultado = {"ready": False, "guilds": 0, "eco": False}


@bot.event
async def on_ready():
    resultado["ready"] = True
    resultado["guilds"] = len(bot.guilds)
    print(f"OK   4b. discord.py em ready — user={bot.user} guilds={len(bot.guilds)}", flush=True)

    # Manda uma mensagem pelo próprio bot e confirma que ela volta pelo gateway:
    # é o par REST → dispatch, com a lib do outro lado.
    canal = bot.get_channel(int(semente["canal"]["snowflake"]))
    if canal is None:
        print("FALHA 4c. o canal não entrou no cache (GUILD_CREATE incompleto?)", flush=True)
        await bot.close()
        return
    await canal.send("ping-do-python")


@bot.event
async def on_message(mensagem):
    if mensagem.content == "ping-do-python":
        resultado["eco"] = True
        print(
            f"OK   4c. MESSAGE_CREATE chegou pelo gateway — "
            f"autor={mensagem.author} conteudo={mensagem.content!r}",
            flush=True,
        )
        await bot.close()


async def principal():
    try:
        await asyncio.wait_for(bot.start(token), timeout=90)
    except asyncio.TimeoutError:
        print("FALHA tempo esgotado (90 s)", flush=True)
    except Exception as e:  # noqa: BLE001 — a prova quer o texto do erro, qualquer que seja
        print(f"FALHA {type(e).__name__}: {e}", flush=True)
    finally:
        if not bot.is_closed():
            await bot.close()


asyncio.run(principal())

ok = resultado["ready"] and resultado["guilds"] >= 1 and resultado["eco"]
print(f"\n=== PROVA 4 (discord.py): {'OK' if ok else 'FALHOU'} === {resultado}", flush=True)
sys.exit(0 if ok else 1)
