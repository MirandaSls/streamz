#!/usr/bin/env python3
"""
Régua de pixel para os prints 1:1 (§6.3 do PROCESSO), sem Pillow nem docker.

O host não tem Pillow e os subagentes não rodam docker; este leitor de PNG em
Python puro basta para tirar medida de print (PNG 8 bits, RGB/RGBA/cinza, sem
entrelaçamento — o formato das capturas de tela do Windows e do Chromium).

    python3 scripts/paridade/medir.py tamanho  <png>
    python3 scripts/paridade/medir.py pixel    <png> <x> <y>
    python3 scripts/paridade/medir.py linha    <png> <y> <x0> <x1>   # trechos de cor ao longo de uma linha
    python3 scripts/paridade/medir.py coluna   <png> <x> <y0> <y1>   # idem numa coluna
    python3 scripts/paridade/medir.py caixa    <png> <x> <y> [tol]   # retângulo da cor em (x,y), crescendo até mudar

`linha`/`coluna` imprimem cada trecho contínuo como "início–fim (tamanho) #rrggbb":
é daí que sai altura, largura, raio e espaçamento. `tol` é a diferença máxima
por canal para contar como a mesma cor (padrão 0; use 2–6 contra antisserrilhado).
"""
import struct
import sys
import zlib


def ler_png(caminho):
    with open(caminho, "rb") as f:
        dados = f.read()
    if dados[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{caminho}: não é PNG")
    pos = 8
    idat = b""
    largura = altura = prof = tipo = entrel = None
    while pos < len(dados):
        (n,) = struct.unpack(">I", dados[pos : pos + 4])
        tipo_bloco = dados[pos + 4 : pos + 8]
        corpo = dados[pos + 8 : pos + 8 + n]
        pos += 12 + n
        if tipo_bloco == b"IHDR":
            largura, altura, prof, tipo, _, _, entrel = struct.unpack(">IIBBBBB", corpo)
        elif tipo_bloco == b"IDAT":
            idat += corpo
        elif tipo_bloco == b"IEND":
            break
    if prof != 8 or entrel != 0 or tipo not in (0, 2, 4, 6):
        raise SystemExit(f"{caminho}: formato não suportado (profundidade {prof}, tipo {tipo}, entrelaçado {entrel})")
    canais = {0: 1, 2: 3, 4: 2, 6: 4}[tipo]
    bruto = zlib.decompress(idat)
    passo = largura * canais
    linhas = []
    anterior = bytearray(passo)
    i = 0
    for _ in range(altura):
        filtro = bruto[i]
        atual = bytearray(bruto[i + 1 : i + 1 + passo])
        i += 1 + passo
        for x in range(passo):
            a = atual[x - canais] if x >= canais else 0
            b = anterior[x]
            c = anterior[x - canais] if x >= canais else 0
            if filtro == 1:
                atual[x] = (atual[x] + a) & 255
            elif filtro == 2:
                atual[x] = (atual[x] + b) & 255
            elif filtro == 3:
                atual[x] = (atual[x] + ((a + b) >> 1)) & 255
            elif filtro == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                atual[x] = (atual[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        linhas.append(atual)
        anterior = atual
    return largura, altura, canais, linhas


class Imagem:
    def __init__(self, caminho):
        self.largura, self.altura, self.canais, self.linhas = ler_png(caminho)

    def rgb(self, x, y):
        linha = self.linhas[y]
        k = x * self.canais
        if self.canais in (1, 2):
            v = linha[k]
            return (v, v, v)
        return (linha[k], linha[k + 1], linha[k + 2])


def hexa(c):
    return "#%02x%02x%02x" % c


def igual(a, b, tol):
    return all(abs(p - q) <= tol for p, q in zip(a, b))


def trechos(cores, inicio, tol):
    saida = []
    ini = inicio
    atual = cores[0]
    for k, c in enumerate(cores[1:], 1):
        if not igual(c, atual, tol):
            saida.append((ini, inicio + k - 1, atual))
            ini = inicio + k
            atual = c
    saida.append((ini, inicio + len(cores) - 1, atual))
    return saida


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    cmd, caminho = argv[1], argv[2]
    img = Imagem(caminho)
    n = [int(v) for v in argv[3:]]
    # coordenadas fora da imagem são presas à borda (x1 = largura não estoura)
    lim = lambda v, m: max(0, min(v, m - 1))
    if cmd == "tamanho":
        print(f"{img.largura}x{img.altura} ({img.canais} canais)")
    elif cmd == "pixel":
        print(hexa(img.rgb(n[0], n[1])))
    elif cmd in ("linha", "coluna"):
        tol = n[3] if len(n) > 3 else 0
        if cmd == "linha":
            y, x0, x1 = lim(n[0], img.altura), lim(n[1], img.largura), lim(n[2], img.largura)
            cores = [img.rgb(x, y) for x in range(x0, x1 + 1)]
            base = x0
        else:
            x, y0, y1 = lim(n[0], img.largura), lim(n[1], img.altura), lim(n[2], img.altura)
            cores = [img.rgb(x, y) for y in range(y0, y1 + 1)]
            base = y0
        for a, b, c in trechos(cores, base, tol):
            print(f"{a}–{b} ({b - a + 1}) {hexa(c)}")
    elif cmd == "caixa":
        x, y = n[0], n[1]
        tol = n[2] if len(n) > 2 else 0
        alvo = img.rgb(x, y)
        esq = x
        while esq > 0 and igual(img.rgb(esq - 1, y), alvo, tol):
            esq -= 1
        dir_ = x
        while dir_ < img.largura - 1 and igual(img.rgb(dir_ + 1, y), alvo, tol):
            dir_ += 1
        cima = y
        while cima > 0 and igual(img.rgb(x, cima - 1), alvo, tol):
            cima -= 1
        baixo = y
        while baixo < img.altura - 1 and igual(img.rgb(x, baixo + 1), alvo, tol):
            baixo += 1
        print(f"{hexa(alvo)} x {esq}–{dir_} ({dir_ - esq + 1}) · y {cima}–{baixo} ({baixo - cima + 1})")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
