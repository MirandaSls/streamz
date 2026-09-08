# Prova 3b da F3 (§12): o mesmo caminho da prova 3, com **discord.py** e
# `app_commands`.
#
# Vale por si e vale pelo que ela cobre e o discord.js não: o `CommandTree` do
# discord.py casa o `INTERACTION_CREATE` com a árvore **local** de comandos,
# pelo `data["name"]` e pelo `data["type"]`, e monta o `Namespace` das opções
# pelo `data["options"]` e pelo `data["resolved"]`. Um payload que o discord.js
# aceita e o discord.py não é exatamente o tipo de defeito que só uma segunda
# lib acha — foi assim que o `KeyError` de `bitrate` apareceu na F1.
#
# Os dois monkeypatches são os mesmos da prova 4 da F1, pelo mesmo motivo
# (`DEFAULT_GATEWAY`); ver `prova-discordpy.py` para o porquê inteiro.
#
# O `tree.sync()` **não** é chamado: quem registrou os comandos foi o
# `deploy-commands.mjs` (a prova 1). Aqui a árvore local só precisa conhecer o
# `/play` para o dispatch achar o callback — que é o caso de um bot que faz o
# deploy num script à parte, como o guia do discord.js manda.
#
# Roda num `python:3-slim` com `pip install discord.py`. Ver `prova-f3.sh`.
# Entrada: SEMENTE, API_URL e ID_DO_COMANDO (o cuid do /play).

import asyncio
import json
import os
import sys
import urllib.request

import discord
import yarl
from discord import app_commands
from discord.gateway import DiscordWebSocket

semente = json.loads(os.environ["SEMENTE"])
api = os.environ["API_URL"]
id_do_comando = os.environ["ID_DO_COMANDO"]
token = semente["bot"]["token"]

discord.http.Route.BASE = f"{api}/v10"

pedido = urllib.request.Request(
    f"{api}/v10/gateway/bot", headers={"Authorization": f"Bot {token}"}
)
with urllib.request.urlopen(pedido, timeout=15) as resposta:
    info = json.load(resposta)
DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL(info["url"])

intents = discord.Intents.default()
cliente = discord.Client(intents=intents)
arvore = app_commands.CommandTree(cliente)

resultado = {"ready": False, "interacao": None, "defer": False, "edit": False}


@arvore.command(name="play", description="Toca uma música")
@app_commands.describe(url="link ou termo de busca")
async def play(interacao: discord.Interaction, url: str):
    resultado["interacao"] = {
        "comando": interacao.command.name if interacao.command else None,
        "usuario": str(interacao.user),
        "canal": str(interacao.channel_id),
        "guild": str(interacao.guild_id),
        "url": url,
    }
    print(f"OK   3b-1. interactionCreate chegou — {resultado['interacao']}", flush=True)

    await interacao.response.defer()
    resultado["defer"] = True
    print("OK   3b-2. response.defer() (o 'pensando…')", flush=True)

    await asyncio.sleep(1.5)
    await interacao.edit_original_response(content="pong do python")
    resultado["edit"] = True
    print("OK   3b-3. edit_original_response('pong do python')", flush=True)

    await cliente.close()


@cliente.event
async def on_ready():
    resultado["ready"] = True
    print(f"OK   3b-0. discord.py em ready — user={cliente.user} guilds={len(cliente.guilds)}", flush=True)

    # Dispara o comando pelo REST **interno**, como o composer faria. É a única
    # parte que não é a lib: no Streamz quem digita `/play` é uma pessoa.
    corpo = json.dumps(
        {"commandId": id_do_comando, "options": [{"name": "url", "type": 3, "value": "rickroll"}]}
    ).encode()
    disparo = urllib.request.Request(
        f"{api}/channels/{semente['canal']['id']}/interactions",
        data=corpo,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {semente['dono']['accessToken']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(disparo, timeout=15) as r:
            print(f"OK   3b-0b. POST /channels/:id/interactions → {r.status}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"FALHA 3b-0b. POST /channels/:id/interactions: {e}", flush=True)
        await cliente.close()


async def principal():
    try:
        await asyncio.wait_for(cliente.start(token), timeout=120)
    except asyncio.TimeoutError:
        print("FALHA tempo esgotado (120 s)", flush=True)
    except Exception as e:  # noqa: BLE001 — a prova quer o texto do erro, qualquer que seja
        print(f"FALHA {type(e).__name__}: {e}", flush=True)
    finally:
        if not cliente.is_closed():
            await cliente.close()


asyncio.run(principal())

ok = resultado["ready"] and resultado["defer"] and resultado["edit"]
print(f"\n=== PROVA 3b (discord.py app_commands): {'OK' if ok else 'FALHOU'} === {resultado}", flush=True)
sys.exit(0 if ok else 1)
