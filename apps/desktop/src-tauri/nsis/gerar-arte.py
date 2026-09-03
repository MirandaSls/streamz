#!/usr/bin/env python3
"""
Gera a arte do instalador NSIS a partir de `icons/icon.png`.

Por que um script e não os BMPs soltos: BMP é um formato que ninguém edita à
mão, e o instalador precisa de cinco tamanhos diferentes do mesmo ícone. Com o
script versionado, trocar a marca é rodar de novo — sem isso, os arquivos
binários viram órfãos que ninguém sabe regerar.

Como rodar (o host não tem node nem python com Pillow; ver §3 do
docs/PROCESSO-DE-DESENVOLVIMENTO.md):

    docker run --rm -v <worktree>:/w -w /w/apps/desktop/src-tauri python:3-slim \
      bash -lc "apt-get update -qq && apt-get install -y -qq fonts-dejavu-core \
                && pip install --quiet pillow && python nsis/gerar-arte.py"

Saída (tudo commitado, porque o runner do CI não roda Pillow):
  nsis/cabecalho.bmp      150x57   MUI_HEADERIMAGE_BITMAP
  nsis/lateral.bmp        164x314  MUI_WELCOMEFINISHPAGE_BITMAP
  nsis/anim/quadro-NN.bmp 128x128  12 quadros do pulso (NN = 01..12)
  nsis/anim/instalando.avi         os mesmos 12 quadros, AVI RGB sem compressão

Todos os BMP saem em BMP3 24 bits: é o único sabor que o MUI2 e o
`LoadImage`/`STM_SETIMAGE` do Win32 aceitam sem surpresa (BMP de 32 bits com
canal alfa aparece preto em algumas versões do Windows).
"""

from __future__ import annotations

import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent  # apps/desktop/src-tauri
ICONE = RAIZ / "icons" / "icon.png"

# Tokens da marca (apps/web/tailwind.config.ts). Repetidos aqui de propósito:
# um BMP não importa TypeScript, e um instalador que muda de cor sozinho porque
# alguém mexeu no tema da web seria pior que a duplicação.
RAIL = (0x0B, 0x0B, 0x0F)  # Void Ink — fundo da lateral
PANEL = (0x14, 0x14, 0x19)  # fundo do cabeçalho (= MUI_BGCOLOR)
CHAT = (0x1A, 0x1A, 0x20)  # fundo da página de instalação
BORDA = (0x2A, 0x2A, 0x33)
ACCENT = (0x9B, 0xE3, 0x1F)  # Volt Lime
PAPER = (0xFD, 0xFD, 0xFB)
MUTED = (0x8A, 0x8A, 0x8E)

# Desenhamos tudo em 4x e reduzimos com LANCZOS. Sem isso o canto arredondado
# de um retângulo de 150x57 fica serrilhado — e canto arredondado serrilhado
# chama mais atenção que canto reto.
SS = 4


def fonte(tamanho: int, negrito: bool = True) -> ImageFont.FreeTypeFont:
    caminhos = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if negrito else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for c in caminhos:
        if Path(c).exists():
            return ImageFont.truetype(c, tamanho)
    return ImageFont.load_default()


def icone(tamanho: int) -> Image.Image:
    """O ícone do app em RGBA, reamostrado para `tamanho`."""
    img = Image.open(ICONE).convert("RGBA")
    return img.resize((tamanho, tamanho), Image.LANCZOS)


def tela(largura: int, altura: int, cor) -> Image.Image:
    return Image.new("RGB", (largura * SS, altura * SS), cor)


def reduzir(img: Image.Image, largura: int, altura: int) -> Image.Image:
    return img.resize((largura, altura), Image.LANCZOS)


def salvar_bmp(img: Image.Image, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(destino, format="BMP")
    print(f"  {destino.relative_to(RAIZ)}  {img.size[0]}x{img.size[1]}")


def retangulo_arredondado(d: ImageDraw.ImageDraw, caixa, raio, **kw) -> None:
    d.rounded_rectangle([c * SS for c in caixa], radius=raio * SS, **kw)


# --------------------------------------------------------------------------
# 1. Cabeçalho (150x57)
# --------------------------------------------------------------------------
# O MUI desenha esta imagem encostada na direita da faixa do cabeçalho, e o
# resto da faixa fica na cor de MUI_BGCOLOR. Por isso o fundo do BMP é CHAT, o
# mesmo valor de MUI_BGCOLOR no installer.nsi: a emenda tem que sumir.
def cabecalho() -> None:
    L, A = 150, 57
    img = tela(L, A, CHAT)
    d = ImageDraw.Draw(img)

    # Cartão arredondado atrás do ícone — é o "canto arredondado" que dá para
    # ter no NSIS: desenhado no bitmap, não na janela.
    retangulo_arredondado(d, (96, 6, 144, 50), 12, fill=RAIL, outline=BORDA, width=1 * SS)

    img = reduzir(img, L, A)
    ic = icone(34)
    img.paste(ic, (103, 12), ic)

    # Filete limão à esquerda do cartão: separa a arte do texto do cabeçalho.
    d = ImageDraw.Draw(img)
    d.rectangle([88, 18, 89, 38], fill=ACCENT)

    salvar_bmp(img, AQUI / "cabecalho.bmp")


# --------------------------------------------------------------------------
# 2. Lateral da página de boas-vindas (164x314)
# --------------------------------------------------------------------------
def lateral() -> None:
    L, A = 164, 314
    img = tela(L, A, RAIL)
    d = ImageDraw.Draw(img)

    # Gradiente vertical discreto RAIL -> CHAT. Faixa a faixa porque Pillow não
    # tem gradiente nativo e 314 linhas é barato.
    for y in range(A * SS):
        t = y / (A * SS - 1)
        cor = tuple(round(RAIL[i] + (CHAT[i] - RAIL[i]) * t) for i in range(3))
        d.line([(0, y), (L * SS, y)], fill=cor)

    # Halo do limão atrás do ícone: anéis arredondados com opacidade caindo.
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dh = ImageDraw.Draw(halo)
    for i in range(10, 0, -1):
        raio = 34 + i * 5
        alfa = int(9 * (1 - i / 10) ** 1.5) + 2
        dh.rounded_rectangle(
            [(82 - raio) * SS, (104 - raio) * SS, (82 + raio) * SS, (104 + raio) * SS],
            radius=int(raio * 0.34) * SS,
            outline=ACCENT + (alfa,),
            width=2 * SS,
        )
    img = Image.alpha_composite(img.convert("RGBA"), halo).convert("RGB")

    img = reduzir(img, L, A)
    d = ImageDraw.Draw(img)

    ic = icone(84)
    img.paste(ic, (82 - 42, 104 - 42), ic)

    f_marca = fonte(19)
    texto = "STREAMZ"
    # Espaçamento manual: o Pillow não tem tracking, e caixa-alta colada num
    # tamanho desses lê como um borrão.
    largura = sum(d.textlength(c, font=f_marca) for c in texto) + 2.2 * (len(texto) - 1)
    x = 82 - largura / 2
    for c in texto:
        d.text((x, 168), c, font=f_marca, fill=PAPER)
        x += d.textlength(c, font=f_marca) + 2.2

    d.rectangle([62, 196, 102, 197], fill=ACCENT)

    f_sub = fonte(10, negrito=False)
    for i, linha in enumerate(("Conversa, voz e tela", "em tempo real")):
        w = d.textlength(linha, font=f_sub)
        d.text((82 - w / 2, 208 + i * 14), linha, font=f_sub, fill=MUTED)

    salvar_bmp(img, AQUI / "lateral.bmp")


# --------------------------------------------------------------------------
# 3. Quadros do pulso (128x128) + AVI
# --------------------------------------------------------------------------
QUADROS = 12
LADO = 128


def quadros() -> list[Image.Image]:
    saida = []
    for n in range(QUADROS):
        # Um ciclo completo de seno por sequência: o quadro 12 emenda no 1 sem
        # salto, que é o que o AVI em laço precisa.
        fase = 2 * math.pi * n / QUADROS
        pulso = (1 - math.cos(fase)) / 2  # 0 -> 1 -> 0, suave nas pontas

        img = Image.new("RGB", (LADO * SS, LADO * SS), CHAT)

        # Anel de luz que abre para fora e desaparece: é o "quique" percebido.
        halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
        dh = ImageDraw.Draw(halo)
        for k in range(3):
            avanco = (pulso + k / 3) % 1.0
            raio = 34 + avanco * 26
            alfa = int(70 * (1 - avanco) ** 2)
            if alfa <= 0:
                continue
            dh.rounded_rectangle(
                [(64 - raio) * SS, (64 - raio) * SS, (64 + raio) * SS, (64 + raio) * SS],
                radius=int(raio * 0.34) * SS,
                outline=ACCENT + (alfa,),
                width=2 * SS,
            )
        img = Image.alpha_composite(img.convert("RGBA"), halo).convert("RGB")
        img = reduzir(img, LADO, LADO)

        # Escala + quique vertical do ícone.
        lado_ic = round(62 + 8 * pulso)
        subida = round(3 * math.sin(fase))
        ic = icone(lado_ic)
        img.paste(ic, (64 - lado_ic // 2, 64 - lado_ic // 2 - subida), ic)

        saida.append(img)
    return saida


# --------------------------------------------------------------------------
# 4. Empacotar os quadros num AVI RGB sem compressão
# --------------------------------------------------------------------------
# O controle SysAnimate32 do Windows só toca AVI sem compressão (ou RLE8), sem
# áudio e com um fluxo só — exatamente o que este muxer escreve. É AVI 1.0
# puro, com idx1 e sem OpenDML, porque o controle é de 1995 e não ganha nada
# com extensão nova.
MICROS_POR_QUADRO = 70_000  # ~14 fps: um pulso completo em 0,84 s
AVIF_HASINDEX = 0x00000010
AVIIF_KEYFRAME = 0x00000010


def _lista(fcc: bytes, corpo: bytes) -> bytes:
    return b"LIST" + struct.pack("<I", len(corpo) + 4) + fcc + corpo


def _chunk(fcc: bytes, corpo: bytes) -> bytes:
    pad = b"\x00" if len(corpo) % 2 else b""
    return fcc + struct.pack("<I", len(corpo)) + corpo + pad


def dib(img: Image.Image) -> bytes:
    """Os pixels de baixo para cima, BGR, com as linhas alinhadas em 4 bytes."""
    largura, altura = img.size
    px = img.convert("RGB").load()
    passo = (largura * 3 + 3) & ~3
    linhas = []
    for y in range(altura - 1, -1, -1):
        linha = bytearray()
        for x in range(largura):
            r, g, b = px[x, y]
            linha += bytes((b, g, r))
        linha += b"\x00" * (passo - len(linha))
        linhas.append(bytes(linha))
    return b"".join(linhas)


def avi(imgs: list[Image.Image], destino: Path) -> None:
    largura, altura = imgs[0].size
    dados = [dib(i) for i in imgs]
    tamanho_quadro = len(dados[0])

    bih = struct.pack(
        "<IiiHHIIiiII",
        40, largura, altura, 1, 24, 0, tamanho_quadro, 0, 0, 0, 0,
    )
    avih = struct.pack(
        "<IIIIIIIIII4I",
        MICROS_POR_QUADRO,
        tamanho_quadro * 1_000_000 // MICROS_POR_QUADRO,
        0,
        AVIF_HASINDEX,
        len(imgs),
        0,
        1,
        tamanho_quadro,
        largura,
        altura,
        0, 0, 0, 0,
    )
    strh = struct.pack(
        "<4s4sIHHIIIIIIiI4h",
        b"vids",
        # fccHandler 0 = "os bytes são um DIB". É o que os AVI antigos de
        # instalador usam e o que o SysAnimate32 espera.
        b"\x00\x00\x00\x00",
        0, 0, 0, 0,
        MICROS_POR_QUADRO,          # dwScale
        1_000_000,                  # dwRate  -> Rate/Scale = fps
        0,
        len(imgs),
        tamanho_quadro,
        -1,
        0,
        0, 0, largura, altura,
    )

    hdrl = _lista(b"hdrl", _chunk(b"avih", avih) + _lista(b"strl", _chunk(b"strh", strh) + _chunk(b"strf", bih)))

    movi = b""
    indice = b""
    # O deslocamento no idx1 é relativo ao início do corpo da lista 'movi'
    # (logo depois do fourcc), e não ao início do arquivo.
    pos = 4
    for d in dados:
        movi += _chunk(b"00db", d)
        indice += struct.pack("<4sIII", b"00db", AVIIF_KEYFRAME, pos, len(d))
        pos += 8 + len(d) + (len(d) % 2)
    movi_lista = _lista(b"movi", movi)

    corpo = b"AVI " + hdrl + movi_lista + _chunk(b"idx1", indice)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(b"RIFF" + struct.pack("<I", len(corpo)) + corpo)
    print(f"  {destino.relative_to(RAIZ)}  {largura}x{altura} {len(imgs)} quadros")


def main() -> None:
    print("gerando a arte do instalador a partir de", ICONE.relative_to(RAIZ))
    cabecalho()
    lateral()
    qs = quadros()
    for n, img in enumerate(qs, start=1):
        salvar_bmp(img, AQUI / "anim" / f"quadro-{n:02d}.bmp")
    avi(qs, AQUI / "anim" / "instalando.avi")


if __name__ == "__main__":
    main()
