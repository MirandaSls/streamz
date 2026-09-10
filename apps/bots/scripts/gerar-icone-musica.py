#!/usr/bin/env python3
"""Gera o ícone do bot **Streamz Música** — uma nota musical na paleta do repo.

Arte própria, desenhada aqui com primitivas do Pillow: nada copiado de
terceiros. A paleta é a do `design.md` — Void Ink no fundo, Volt Lime na nota.

    docker run --rm -v /opt/stack/streamz:/w -w /w python:3-slim bash -lc \
      "pip install --quiet pillow && python apps/bots/scripts/gerar-icone-musica.py"

Saída: apps/bots/assets/musica.png (512x512, PNG com transparência fora do disco).
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


def desenhar() -> Image.Image:
    imagem = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(imagem)

    # Disco de fundo.
    lapis.ellipse((0, 0, L - 1, L - 1), fill=FUNDO)

    # ── A nota: duas cabeças, duas hastes e a barra que as une (uma colcheia
    # dupla, a forma que todo mundo lê como "música"). Só elipses e retângulos.
    haste_larg = int(L * 0.055)
    topo = int(L * 0.235)
    base = int(L * 0.665)

    esq_x = int(L * 0.335)
    dir_x = int(L * 0.635)

    # Hastes.
    lapis.rectangle((esq_x, topo, esq_x + haste_larg, base), fill=LIMAO)
    lapis.rectangle((dir_x, topo, dir_x + haste_larg, base), fill=LIMAO)

    # Barra que liga as duas, com uma leve inclinação — é o que evita o ar de
    # "duas barras soltas" que uma barra reta dá.
    barra_alt = int(L * 0.105)
    lapis.polygon(
        [
            (esq_x, topo),
            (dir_x + haste_larg, int(topo - L * 0.030)),
            (dir_x + haste_larg, int(topo - L * 0.030) + barra_alt),
            (esq_x, topo + barra_alt),
        ],
        fill=LIMAO,
    )

    # Cabeças, ovais e inclinadas como numa partitura: desenhadas retas numa
    # camada própria e rotacionadas, porque `ellipse` não gira.
    cabeca_larg = int(L * 0.190)
    cabeca_alt = int(L * 0.140)
    for x in (esq_x + haste_larg, dir_x + haste_larg):
        camada = Image.new("RGBA", (cabeca_larg * 2, cabeca_alt * 2), (0, 0, 0, 0))
        ImageDraw.Draw(camada).ellipse(
            (cabeca_larg // 2, cabeca_alt // 2, cabeca_larg // 2 + cabeca_larg, cabeca_alt // 2 + cabeca_alt),
            fill=LIMAO,
        )
        camada = camada.rotate(20, resample=Image.BICUBIC, expand=False)
        imagem.alpha_composite(camada, (x - cabeca_larg - cabeca_larg // 2, base - cabeca_alt))

    return imagem.resize((LADO, LADO), Image.LANCZOS)


def principal() -> None:
    destino = Path(__file__).resolve().parents[1] / "assets" / "musica.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar().save(destino, "PNG")
    print(f"escrito: {destino}")


if __name__ == "__main__":
    principal()
