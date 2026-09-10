#!/usr/bin/env python3
"""Gera o ícone do bot **Streamz Moderação** — um escudo na paleta do repo.

Arte própria, desenhada aqui com primitivas do Pillow: nada copiado de
terceiros (os bots de moderação do Discord são serviços fechados de outras
empresas; a arte deles não entra neste repositório nem como referência).

A paleta é a do `design.md`, a mesma do ícone da música: Void Ink no disco de
fundo, Volt Lime no escudo.

    docker run --rm -v /opt/stack/streamz:/w -w /w python:3-slim bash -lc \
      "pip install --quiet pillow && python apps/bots/scripts/gerar-icone-moderacao.py"

Saída: apps/bots/assets/moderacao.png (512x512, PNG com transparência fora do disco).
"""

from pathlib import Path

from PIL import Image, ImageDraw

# design.md: Void Ink (#0B0B0F) e Volt Lime (#9BE31F).
FUNDO = (11, 11, 15, 255)
LIMAO = (155, 227, 31, 255)

# Desenhamos 4x maior e reduzimos no fim: é o antialias mais simples que
# existe, e o Pillow não tem traçado suavizado nas primitivas.
ESCALA = 4
LADO = 512
L = LADO * ESCALA


def contorno_do_escudo(topo: float, base: float, meia_largura: float, ombro: float) -> list:
    """Meio brasão: ombros retos em cima, ponta arredondada embaixo.

    O escudo é a forma que todo mundo lê como "proteção", e desenhá-lo por
    polígono (em vez de colar duas elipses) mantém a silhueta simétrica em
    qualquer tamanho. A metade de baixo é uma curva quadrática amostrada em
    passos — de novo, a saída mais simples: o Pillow não tem `bezier`.
    """
    centro = L / 2
    pontos = [
        (centro - meia_largura, topo),
        (centro + meia_largura, topo),
        (centro + meia_largura, ombro),
    ]
    # Curva do lado direito, do ombro até a ponta, e depois espelhada.
    passos = 48
    direita = []
    for i in range(passos + 1):
        t = i / passos
        # Bézier quadrática: ombro → controle (canto inferior) → ponta.
        x = (1 - t) ** 2 * (centro + meia_largura) + 2 * (1 - t) * t * (centro + meia_largura) + t**2 * centro
        y = (1 - t) ** 2 * ombro + 2 * (1 - t) * t * base + t**2 * base
        direita.append((x, y))
    pontos.extend(direita)
    pontos.extend([(2 * centro - x, y) for x, y in reversed(direita)])
    pontos.append((centro - meia_largura, ombro))
    return pontos


def desenhar() -> Image.Image:
    imagem = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(imagem)

    # Disco de fundo, igual ao da música — os oficiais têm de parecer da mesma
    # família na grade do diretório.
    lapis.ellipse((0, 0, L - 1, L - 1), fill=FUNDO)

    # O escudo, cheio.
    lapis.polygon(
        contorno_do_escudo(topo=L * 0.235, base=L * 0.790, meia_largura=L * 0.235, ombro=L * 0.520),
        fill=LIMAO,
    )

    # A mordida escura por dentro deixa o escudo com **contorno** em vez de uma
    # mancha limão: em 32px, que é o tamanho que a lista de membros usa, uma
    # mancha cheia não se distingue do ícone da música.
    lapis.polygon(
        contorno_do_escudo(topo=L * 0.310, base=L * 0.700, meia_largura=L * 0.163, ombro=L * 0.500),
        fill=FUNDO,
    )

    # O visto dentro do escudo: duas barras grossas, a curta descendo e a longa
    # subindo. Desenhadas como polígonos porque `line` com `width` sai com as
    # pontas quadradas fora do eixo.
    def barra(p1, p2, espessura):
        (x1, y1), (x2, y2) = p1, p2
        dx, dy = x2 - x1, y2 - y1
        comprimento = (dx * dx + dy * dy) ** 0.5
        nx, ny = -dy / comprimento * espessura / 2, dx / comprimento * espessura / 2
        lapis.polygon(
            [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)],
            fill=LIMAO,
        )

    espessura = L * 0.062
    cotovelo = (L * 0.462, L * 0.585)
    barra((L * 0.395, L * 0.500), cotovelo, espessura)
    barra(cotovelo, (L * 0.605, L * 0.395), espessura)
    # As pontas arredondadas, que o polígono não dá.
    for x, y in ((L * 0.395, L * 0.500), cotovelo, (L * 0.605, L * 0.395)):
        r = espessura / 2
        lapis.ellipse((x - r, y - r, x + r, y + r), fill=LIMAO)

    return imagem.resize((LADO, LADO), Image.LANCZOS)


def principal() -> None:
    destino = Path(__file__).resolve().parents[1] / "assets" / "moderacao.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar().save(destino, "PNG")
    print(f"escrito: {destino}")


if __name__ == "__main__":
    principal()
