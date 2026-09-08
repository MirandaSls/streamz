# Prova 4 da F1 (§12): o mesmo caminho, com **discord.py**.
#
# Vale por si e vale pelo que ela cobre e o discord.js não: o discord.py pede
# compressão **por padrão** (`compress=True`, que vira `compress=zlib-stream` na
# query do WebSocket). Nós ignoramos e mandamos quadro de texto; ele funciona
# assim mesmo porque `DiscordWebSocket.received_message` só descomprime
# `if type(msg) is bytes`. Se um dia alguém "consertar" isso mandando binário
# sem implementar o zlib-stream, é este script que quebra primeiro.
#
# O monkeypatch é uma linha e tem que **incluir a versão** (ao contrário do
# discord.js, onde `rest.api` vai sem `/v10`).
#
# Roda num `python:3-slim` com `pip install discord.py`. Ver `prova.sh`.
# Entrada: SEMENTE (o JSON de `semear.mjs`) e API_URL.

import asyncio
import json
import os
import sys

import discord
from discord.ext import commands

semente = json.loads(os.environ["SEMENTE"])
api = os.environ["API_URL"]  # ex.: http://localhost:3410/api

# A linha do §14. Com a versão junto.
discord.http.Route.BASE = f"{api}/v10"

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

resultado = {"ready": False, "guilds": 0, "pong": False}


@bot.event
async def on_ready():
    resultado["ready"] = True
    resultado["guilds"] = len(bot.guilds)
    print(f"OK   4a. discord.py em ready — user={bot.user} guilds={len(bot.guilds)}", flush=True)

    # Manda o !ping pelo próprio bot e confirma que o pong volta pelo gateway:
    # é o mesmo par de provas do script do discord.js, com a lib do outro lado.
    canal = bot.get_channel(int(semente["canal"]["snowflake"]))
    if canal is None:
        print("FALHA 4b. o canal não entrou no cache (GUILD_CREATE incompleto?)", flush=True)
        await bot.close()
        return
    await canal.send("!ping-py")


@bot.event
async def on_message(mensagem):
    if mensagem.content == "!ping-py":
        resultado["pong"] = True
        print(
            f"OK   4b. MESSAGE_CREATE chegou pelo gateway — "
            f"autor={mensagem.author} conteudo={mensagem.content!r}",
            flush=True,
        )
        await bot.close()


async def principal():
    try:
        await asyncio.wait_for(bot.start(semente["bot"]["token"]), timeout=90)
    except asyncio.TimeoutError:
        print("FALHA tempo esgotado (90 s)", flush=True)
    except Exception as e:  # noqa: BLE001 — a prova quer o texto do erro, qualquer que seja
        print(f"FALHA {type(e).__name__}: {e}", flush=True)
    finally:
        if not bot.is_closed():
            await bot.close()


asyncio.run(principal())

ok = resultado["ready"] and resultado["guilds"] >= 1 and resultado["pong"]
print(f"\n=== PROVA 4 (discord.py): {'OK' if ok else 'FALHOU'} === {resultado}", flush=True)
sys.exit(0 if ok else 1)
