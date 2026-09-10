#!/usr/bin/env python3
"""Gera o ícone do bot **Streamz Níveis** — uma estrela sobre uma barra de
progresso, na paleta do repositório.

Arte própria, desenhada aqui com primitivas do Pillow: nada copiado de terceiro
(e em especial nada dos bots de nível de código fechado que existem no Discord).
A paleta é a do `design.md` — Void Ink no disco de fundo, Volt Lime no traço.

O motivo é o que o bot faz: a **barra** é o progresso dentro do nível (a mesma
que o `/nivel` desenha em texto) e a **estrela** é a subida. Os dois juntos se
leem como "níveis" a 32 px, que é o tamanho em que o ícone vive na lista de
aplicativos — foi por isso que a barra ficou grossa e com só três segmentos:
com oito, a 32 px ela vira uma faixa cinza.

    docker run --rm -v /opt/stack/streamz:/w -w /w python:3-slim bash -lc \
      "pip install --quiet pillow && python apps/bots/scripts/gerar-icone-niveis.py"

Saída: apps/bots/assets/niveis.png (512x512, PNG com transparência fora do disco).
"""

from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

# design.md: Void Ink (#0B0B0F) e Volt Lime (#9BE31F).
FUNDO = (11, 11, 15, 255)
LIMAO = (155, 227, 31, 255)
# O "ainda não conquistado" da barra: o limão a 22% **já misturado** com o Void
# Ink, e opaco. Misturado à mão de propósito: o `ImageDraw` do Pillow **escreve**
# o pixel com o alfa que recebe em vez de compor sobre o que está embaixo, então
# um `(155, 227, 31, 56)` aqui não daria verde escuro — daria um buraco
# semitransparente no disco, que num fundo claro aparece esbranquiçado.
LIMAO_APAGADO = (43, 58, 19, 255)

# Desenhamos 4x maior e reduzimos no fim: é o antialias mais simples que existe,
# e o Pillow não tem traçado suavizado nas primitivas.
ESCALA = 4
LADO = 512
L = LADO * ESCALA


def estrela(centro_x: float, centro_y: float, raio: float, raio_interno: float) -> list:
    """Os dez vértices de uma estrela de cinco pontas, ponta para cima."""
    pontos = []
    for i in range(10):
        # -90° põe a primeira ponta para cima; alternamos externo/interno.
        angulo = -pi / 2 + i * pi / 5
        r = raio if i % 2 == 0 else raio_interno
        pontos.append((centro_x + r * cos(angulo), centro_y + r * sin(angulo)))
    return pontos


def desenhar() -> Image.Image:
    imagem = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(imagem)

    # Disco de fundo.
    lapis.ellipse((0, 0, L - 1, L - 1), fill=FUNDO)

    # ── A estrela, na metade de cima.
    lapis.polygon(
        estrela(L * 0.5, L * 0.395, L * 0.235, L * 0.105),
        fill=LIMAO,
    )

    # ── A barra de progresso, na metade de baixo: três segmentos, dois cheios.
    # Dois de três é o que faz a barra parecer *em progresso* — cheia parece um
    # selo, vazia parece um erro.
    largura_total = L * 0.50
    esquerda = (L - largura_total) / 2
    topo = L * 0.665
    altura = L * 0.088
    vao = L * 0.022
    segmento = (largura_total - 2 * vao) / 3

    for i in range(3):
        x = esquerda + i * (segmento + vao)
        lapis.rounded_rectangle(
            (x, topo, x + segmento, topo + altura),
            radius=altura / 2,
            fill=LIMAO if i < 2 else LIMAO_APAGADO,
        )

    return imagem.resize((LADO, LADO), Image.LANCZOS)


def principal() -> None:
    destino = Path(__file__).resolve().parents[1] / "assets" / "niveis.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar().save(destino, "PNG")
    print(f"escrito: {destino}")


if __name__ == "__main__":
    principal()
