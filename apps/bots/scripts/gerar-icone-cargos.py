#!/usr/bin/env python3
"""Gera o ícone do bot **Streamz Cargos** — uma etiqueta na paleta do repo.

Arte própria, desenhada aqui com primitivas do Pillow: nada copiado de
terceiros (e, em especial, nada da arte de nenhum bot de *reaction roles* do
Discord). A paleta é a do `design.md` — Void Ink no fundo, Volt Lime na
etiqueta.

A forma é uma etiqueta de bagagem, com o furo do cordão, e uma marca de
conferido no corpo dela: é o que um cargo é (um rótulo que alguém vestiu) e lê
bem no tamanho em que o ícone aparece de verdade, que é 32 px na lista de
membros.

    docker run --rm -v /opt/stack/streamz:/w -w /w python:3-slim bash -lc \
      "pip install --quiet pillow && python apps/bots/scripts/gerar-icone-cargos.py"

Saída: apps/bots/assets/cargos.png (512x512, PNG com transparência fora do disco).
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


def etiqueta() -> Image.Image:
    """A etiqueta sozinha, na horizontal, para ser girada depois."""
    alt = int(L * 0.34)
    larg = int(L * 0.68)
    camada = Image.new("RGBA", (larg, alt), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(camada)

    # Corpo: retângulo arredondado à direita e um bico à esquerda — o formato de
    # etiqueta. O bico é um triângulo que avança sobre o retângulo, para os dois
    # virarem uma peça só sem emenda visível.
    bico = int(alt * 0.55)
    lapis.rounded_rectangle((bico, 0, larg - 1, alt - 1), radius=int(alt * 0.20), fill=LIMAO)
    lapis.polygon(
        [(0, alt // 2), (bico + int(alt * 0.25), 0), (bico + int(alt * 0.25), alt - 1)],
        fill=LIMAO,
    )

    # O furo do cordão, **vazado** até o fundo: por isso a cor é transparente e
    # não a do disco — assim o buraco continua um buraco se o fundo mudar.
    raio = int(alt * 0.125)
    furo = (bico + int(alt * 0.42), alt // 2)
    lapis.ellipse(
        (furo[0] - raio, furo[1] - raio, furo[0] + raio, furo[1] + raio),
        fill=(0, 0, 0, 0),
    )

    # A marca de conferido, também vazada: é o "você pegou este cargo". Fica
    # centrada no que sobra do corpo, à direita do furo, para não encostar em
    # nenhuma das duas bordas arredondadas.
    x1 = furo[0] + raio + int(alt * 0.24)
    x2 = larg - int(alt * 0.26)
    y = alt // 2
    perna = int(alt * 0.20)
    grossura = int(alt * 0.13)
    lapis.line(
        [(x1, y + int(alt * 0.02)), (x1 + perna, y + perna)],
        fill=(0, 0, 0, 0),
        width=grossura,
        joint="curve",
    )
    lapis.line(
        [(x1 + perna, y + perna), (x2, y - int(alt * 0.26))],
        fill=(0, 0, 0, 0),
        width=grossura,
        joint="curve",
    )

    return camada


def desenhar() -> Image.Image:
    imagem = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    ImageDraw.Draw(imagem).ellipse((0, 0, L - 1, L - 1), fill=FUNDO)

    # A etiqueta entra inclinada — pendurada, e não deitada. `expand=True` para
    # o giro não cortar as pontas.
    girada = etiqueta().rotate(-30, resample=Image.BICUBIC, expand=True)
    imagem.alpha_composite(girada, ((L - girada.width) // 2, (L - girada.height) // 2))

    return imagem.resize((LADO, LADO), Image.LANCZOS)


def principal() -> None:
    destino = Path(__file__).resolve().parents[1] / "assets" / "cargos.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar().save(destino, "PNG")
    print(f"escrito: {destino}")


if __name__ == "__main__":
    principal()
