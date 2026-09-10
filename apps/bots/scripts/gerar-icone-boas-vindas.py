#!/usr/bin/env python3
"""Gera o ícone do bot **Streamz Boas-vindas** — um aceno saindo de uma porta.

Arte própria, desenhada aqui com primitivas do Pillow: nada copiado de
terceiros. A paleta é a do `design.md` — Void Ink no fundo, Volt Lime no
desenho, e um lime rebaixado para a porta, que é cenário e não pode disputar
atenção com a mão.

    docker run --rm -v /opt/stack/streamz:/w -w /w python:3-slim bash -lc \
      "pip install --quiet pillow && python apps/bots/scripts/gerar-icone-boas-vindas.py"

Saída: apps/bots/assets/boas-vindas.png (512x512, PNG com transparência fora do disco).
"""

from pathlib import Path

from PIL import Image, ImageDraw

# design.md: Void Ink (#0B0B0F) e Volt Lime (#9BE31F).
FUNDO = (11, 11, 15, 255)
LIMAO = (155, 227, 31, 255)
# A porta é cenário: o mesmo lime, rebaixado sobre o fundo, para a mão ficar
# sendo a primeira coisa que se lê num favicon de 16 px.
PORTA = (74, 104, 22, 255)

# Desenhamos 4x maior e reduzimos no fim: é o antialias mais simples que
# existe, e o Pillow não tem traçado suavizado nas primitivas.
ESCALA = 4
LADO = 512
L = LADO * ESCALA


def desenhar_porta(imagem: Image.Image) -> None:
    """Um vão de porta em arco, aberto, atrás da mão."""
    lapis = ImageDraw.Draw(imagem)

    esq, dir_ = int(L * 0.215), int(L * 0.785)
    topo, base = int(L * 0.135), int(L * 0.845)
    raio = (dir_ - esq) // 2
    traco = int(L * 0.052)

    # Os dois montantes são retângulos **cheios**, e não o contorno de um
    # retângulo: o contorno desenharia também a linha de cima, que corta o arco
    # ao meio, e tapá-la com o fundo deixa um degrau visível na emenda.
    lapis.rectangle((esq, topo + raio, esq + traco, base), fill=PORTA)
    lapis.rectangle((dir_ - traco, topo + raio, dir_, base), fill=PORTA)
    lapis.arc((esq, topo, dir_, topo + 2 * raio), 180, 360, fill=PORTA, width=traco)

    # A soleira, que dá o chão e evita a porta "flutuando".
    lapis.rounded_rectangle(
        (int(L * 0.170), base, int(L * 0.830), base + traco),
        radius=traco // 2,
        fill=PORTA,
    )


def camada_da_mao() -> Image.Image:
    """A mão aberta, de frente: palma, quatro dedos e o polegar."""
    larg, alt = int(L * 0.50), int(L * 0.66)
    camada = Image.new("RGBA", (larg, alt), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(camada)

    palma_esq, palma_dir = int(larg * 0.20), int(larg * 0.80)
    palma_topo, palma_base = int(alt * 0.46), int(alt * 0.92)
    lapis.rounded_rectangle(
        (palma_esq, palma_topo, palma_dir, palma_base),
        radius=int(larg * 0.20),
        fill=LIMAO,
    )

    # Quatro dedos, de comprimentos diferentes — dedos iguais viram um pente.
    dedo_larg = int(larg * 0.125)
    folga = int(larg * 0.025)
    primeiro = palma_esq + int(larg * 0.02)
    topos = [alt * 0.20, alt * 0.10, alt * 0.13, alt * 0.24]
    for i, topo in enumerate(topos):
        x0 = primeiro + i * (dedo_larg + folga)
        lapis.rounded_rectangle(
            (x0, int(topo), x0 + dedo_larg, palma_topo + int(alt * 0.08)),
            radius=dedo_larg // 2,
            fill=LIMAO,
        )

    # O polegar: um dedo deitado, colado na lateral esquerda da palma.
    polegar = Image.new("RGBA", (larg, alt), (0, 0, 0, 0))
    ImageDraw.Draw(polegar).rounded_rectangle(
        (int(larg * 0.02), int(alt * 0.52), int(larg * 0.30), int(alt * 0.66)),
        radius=int(alt * 0.07),
        fill=LIMAO,
    )
    camada.alpha_composite(polegar.rotate(28, resample=Image.BICUBIC, center=(int(larg * 0.30), int(alt * 0.59))))

    return camada


def desenhar_aceno(imagem: Image.Image) -> None:
    """A mão inclinada, mais os dois arcos que dizem 'ela está se mexendo'."""
    mao = camada_da_mao().rotate(-16, resample=Image.BICUBIC, expand=False)
    imagem.alpha_composite(mao, (int(L * 0.255), int(L * 0.240)))

    lapis = ImageDraw.Draw(imagem)
    traco = int(L * 0.032)
    for raio, largura in ((int(L * 0.10), traco), (int(L * 0.17), traco)):
        centro_x, centro_y = int(L * 0.640), int(L * 0.400)
        lapis.arc(
            (centro_x - raio, centro_y - raio, centro_x + raio, centro_y + raio),
            -70,
            25,
            fill=LIMAO,
            width=largura,
        )


def desenhar() -> Image.Image:
    imagem = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    ImageDraw.Draw(imagem).ellipse((0, 0, L - 1, L - 1), fill=FUNDO)
    desenhar_porta(imagem)
    desenhar_aceno(imagem)
    return imagem.resize((LADO, LADO), Image.LANCZOS)


def principal() -> None:
    destino = Path(__file__).resolve().parents[1] / "assets" / "boas-vindas.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    desenhar().save(destino, "PNG")
    print(f"escrito: {destino}")


if __name__ == "__main__":
    principal()
