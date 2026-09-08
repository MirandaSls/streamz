#!/usr/bin/env python3
"""
Gera os seis sons padrão do painel de efeitos sonoros ("Sons do Streamz").

**Por que sintetizados.** Os nomes são os do Discord (quack, airhorn, cricket,
golf clap, sad horn, ba dum tss) porque é o vocabulário que quem chega já
conhece — os *arquivos* não são: copiá-los seria pegar áudio de outro produto.
Aqui cada um é construído com numpy a partir de osciladores e ruído, e sai em
MP3 mono 22,05 kHz, que é o que uma sala inteira baixa no instante do clique.

**O que estes arquivos são e o que não são.** São um lugar de partida honesto:
reconhecíveis, curtos e no nível certo. Não são gravações — o `quack` é um pato
de desenho, o `cricket` é um grilo de sintetizador. A estrutura foi feita para
que trocá-los seja uma cópia de arquivo: os nomes vivem em `SONS_PADRAO`
(`packages/shared/src/soundboard.ts`), que aponta para
`apps/web/public/sons/soundboard/<nome>.mp3`. Substituir o arquivo troca o som,
e nada mais precisa mudar.

Como rodar (o host não tem python; ver §3 do PROCESSO-DE-DESENVOLVIMENTO):

    docker run --rm -v "$PWD:/w" -w /w python:3-slim sh -c \
      "pip install --quiet numpy lameenc && python scripts/gerar-sons-do-soundboard.py"
"""

from __future__ import annotations

import math
import os

import lameenc
import numpy as np

TAXA = 22_050
PASTA = os.path.join("apps", "web", "public", "sons", "soundboard")

# Todo som sai normalizado neste pico. Não é 1.0 de propósito: o volume final é
# o do ouvinte (o deslizador do painel) vezes o do som, e um arquivo colado no
# teto não deixa margem para o segundo fator.
PICO = 0.86


def t(dur: float) -> np.ndarray:
    """Eixo do tempo, em segundos."""
    return np.arange(int(TAXA * dur)) / TAXA


def env(x: np.ndarray, ataque: float, decaimento: float, curva: float = 2.0) -> np.ndarray:
    """Envelope ataque-decaimento sobre um vetor já do tamanho certo."""
    n = len(x)
    a = max(1, int(TAXA * ataque))
    subida = np.linspace(0.0, 1.0, a)
    d = max(1, n - a)
    descida = np.linspace(1.0, 0.0, d) ** curva
    e = np.concatenate([subida, descida])[:n]
    # o decaimento pedido pode ser menor que o resto do vetor: o rabo fica em 0
    if decaimento > 0 and int(TAXA * decaimento) < d:
        corte = a + int(TAXA * decaimento)
        e[corte:] = 0.0
    return e


def serra(freq: np.ndarray | float, x: np.ndarray) -> np.ndarray:
    """Dente de serra por fase acumulada (aceita frequência variável)."""
    f = np.full_like(x, freq, dtype=float) if np.isscalar(freq) else np.asarray(freq, dtype=float)
    fase = np.cumsum(f) / TAXA
    return 2.0 * (fase - np.floor(fase + 0.5))


def seno(freq: np.ndarray | float, x: np.ndarray) -> np.ndarray:
    f = np.full_like(x, freq, dtype=float) if np.isscalar(freq) else np.asarray(freq, dtype=float)
    return np.sin(2.0 * np.pi * np.cumsum(f) / TAXA)


def passa_baixa(x: np.ndarray, corte: float) -> np.ndarray:
    """Um polo — suficiente para tirar o brilho de serra e de ruído branco."""
    a = math.exp(-2.0 * math.pi * corte / TAXA)
    y = np.empty_like(x)
    anterior = 0.0
    for i, v in enumerate(x):
        anterior = (1.0 - a) * v + a * anterior
        y[i] = anterior
    return y


def passa_alta(x: np.ndarray, corte: float) -> np.ndarray:
    return x - passa_baixa(x, corte)


def passa_faixa(x: np.ndarray, baixo: float, alto: float) -> np.ndarray:
    return passa_alta(passa_baixa(x, alto), baixo)


def normalizar(x: np.ndarray) -> np.ndarray:
    pico = float(np.max(np.abs(x))) or 1.0
    x = x / pico * PICO
    # 5 ms de rampa nas pontas: sem elas o corte seco vira um "clique"
    r = int(TAXA * 0.005)
    if len(x) > 2 * r:
        x[:r] *= np.linspace(0.0, 1.0, r)
        x[-r:] *= np.linspace(1.0, 0.0, r)
    return x


def gravar(nome: str, audio: np.ndarray) -> None:
    pcm = (normalizar(audio) * 32767).astype("<i2")
    codificador = lameenc.Encoder()
    codificador.set_bit_rate(96)
    codificador.set_in_sample_rate(TAXA)
    codificador.set_channels(1)
    codificador.set_quality(2)
    mp3 = codificador.encode(pcm.tobytes()) + codificador.flush()
    caminho = os.path.join(PASTA, f"{nome}.mp3")
    with open(caminho, "wb") as f:
        f.write(mp3)
    print(f"{caminho}: {len(mp3) / 1024:.1f} KB, {len(pcm) / TAXA:.2f}s")


# ── os seis ────────────────────────────────────────────────────────────────


def quack() -> np.ndarray:
    """
    Pato de desenho: dois grasnados curtos.

    A receita é a clássica — serra grave (as pregas), formante de banda passante
    varrendo para baixo (a boca fechando) e um envelope de 180 ms. O que faz
    soar "pato" e não "buzina" é a varredura do formante, não o timbre da serra.
    """
    saida = []
    for i, (f0, dur) in enumerate([(300.0, 0.17), (260.0, 0.2)]):
        x = t(dur)
        # a altura sobe um pouco e cai: é o contorno de um grasnado
        curva = f0 * (1.0 + 0.28 * np.sin(np.pi * np.linspace(0.0, 1.0, len(x)) ** 0.7))
        bruto = serra(curva, x)
        formante = np.linspace(1150.0, 620.0, len(x))
        # varredura de formante feita por mistura de duas bandas fixas: o filtro
        # de um polo não aceita corte variável, e o ouvido não distingue
        baixo = passa_faixa(bruto, 300.0, 700.0)
        alto = passa_faixa(bruto, 700.0, 1500.0)
        p = (formante - 620.0) / (1150.0 - 620.0)
        som = baixo * (1.0 - p) + alto * p
        som = np.tanh(som * 3.0)
        saida.append(som * env(x, 0.008, dur, curva=1.6))
        if i == 0:
            saida.append(np.zeros(int(TAXA * 0.07)))
    return np.concatenate(saida)


def airhorn() -> np.ndarray:
    """
    Buzina de ar: três serras em quinta e oitava, distorcidas.

    O empilhamento (fundamental, quinta, oitava) é o que dá o acorde metálico;
    a distorção é o que o torna alto sem precisar de volume. A leve
    desafinação (`0.997`) evita o som de sintetizador perfeito.
    """
    dur = 0.9
    x = t(dur)
    f = 233.0
    som = (
        serra(f, x)
        + 0.85 * serra(f * 1.4983, x)
        + 0.7 * serra(f * 2.0 * 0.997, x)
        + 0.4 * serra(f * 3.0, x)
    )
    som = np.tanh(som * 2.2)
    som = passa_faixa(som, 180.0, 5200.0)
    # ataque de 25 ms, corpo cheio e queda no fim — é o gesto de apertar a lata
    e = np.ones(len(x))
    a = int(TAXA * 0.025)
    e[:a] = np.linspace(0.0, 1.0, a)
    q = int(TAXA * 0.12)
    e[-q:] = np.linspace(1.0, 0.0, q) ** 1.5
    return som * e


def cricket() -> np.ndarray:
    """
    Grilo: quatro estridulações agudas.

    Um grilo é ~4,5 kHz recortado por uma modulação de ~55 Hz — o "rrr" de cada
    chilro. É o silêncio entre eles que faz a piada funcionar, então os
    intervalos são longos de propósito.
    """
    partes = []
    for i in range(4):
        dur = 0.085
        x = t(dur)
        portadora = seno(4550.0 + i * 40.0, x)
        recorte = 0.5 + 0.5 * np.sign(np.sin(2.0 * np.pi * 55.0 * x))
        partes.append(portadora * recorte * env(x, 0.004, dur, curva=1.2) * 0.85)
        partes.append(np.zeros(int(TAXA * (0.13 if i % 2 == 0 else 0.3))))
    return np.concatenate(partes)


def golf_clap() -> np.ndarray:
    """
    Palmas educadas: sete batidas esparsas, sem entusiasmo.

    Uma palma é ruído de banda larga com decaimento de ~40 ms; o que muda de
    "aplauso" para "golf clap" é o andamento (lento, irregular) e o número de
    batidas — sete, não trinta.
    """
    rng = np.random.default_rng(7)
    total = np.zeros(int(TAXA * 1.5))
    inicios = [0.0, 0.19, 0.41, 0.6, 0.83, 1.06, 1.28]
    for i, quando in enumerate(inicios):
        dur = 0.09
        x = t(dur)
        ruido = rng.standard_normal(len(x))
        palma = passa_faixa(ruido, 900.0, 6000.0) * env(x, 0.001, dur, curva=3.2)
        # cada palma um pouco diferente da outra: iguais soam como um efeito
        palma *= 0.7 + 0.3 * float(rng.random())
        # as últimas mais fracas — a plateia já está desistindo
        palma *= 1.0 - 0.06 * i
        n = int(TAXA * quando)
        total[n : n + len(palma)] += palma[: len(total) - n]
    return total


def sad_horn() -> np.ndarray:
    """
    "Wah wah wah waaah": quatro notas descendentes de trombone.

    Serra filtrada (o corpo do metal), quatro semitons para baixo e a última
    nota longa, com vibrato e uma queda de altura no fim — é a queda que faz o
    som soar como uma decepção, e não como uma escala.
    """
    partes = []
    notas = [(392.0, 0.16), (370.0, 0.16), (349.0, 0.16), (330.0, 0.62)]
    for i, (f, dur) in enumerate(notas):
        x = t(dur)
        ultima = i == len(notas) - 1
        curva = np.full(len(x), f)
        if ultima:
            vibrato = 1.0 + 0.012 * np.sin(2.0 * np.pi * 5.5 * x)
            queda = np.linspace(1.0, 0.86, len(x)) ** 2
            curva = f * vibrato * queda
        som = serra(curva, x) + 0.5 * serra(curva * 2.0, x)
        som = passa_baixa(som, 1500.0)
        e = env(x, 0.02, dur, curva=1.2 if ultima else 0.8)
        partes.append(som * e)
        if not ultima:
            partes.append(np.zeros(int(TAXA * 0.04)))
    return np.concatenate(partes)


def ba_dum_tss() -> np.ndarray:
    """
    A piada de bateria: dois tons e um prato.

    Tom = seno com a altura caindo rápido (é a pele afrouxando) mais um estalo
    de ruído no ataque. Prato = ruído passa-alta com decaimento longo. O
    andamento (curto-curto-longo) é o que faz a frase, e por isso os intervalos
    aqui não são arredondados.
    """
    rng = np.random.default_rng(11)
    total = np.zeros(int(TAXA * 1.5))

    def tom(f0: float, f1: float, dur: float) -> np.ndarray:
        x = t(dur)
        curva = np.linspace(f0, f1, len(x))
        corpo = seno(curva, x) * env(x, 0.002, dur, curva=2.4)
        estalo = passa_faixa(rng.standard_normal(len(x)), 1200.0, 5000.0)
        estalo *= env(x, 0.0005, 0.02, curva=6.0) * 0.35
        return corpo + estalo

    def prato(dur: float) -> np.ndarray:
        x = t(dur)
        ruido = passa_alta(rng.standard_normal(len(x)), 5200.0)
        # dois metais superpostos dão o "shhh" que ruído puro não dá
        brilho = passa_faixa(rng.standard_normal(len(x)), 7000.0, 10000.0) * 0.6
        return (ruido + brilho) * env(x, 0.001, dur, curva=1.6)

    for quando, som in [
        (0.0, tom(190.0, 120.0, 0.22)),
        (0.19, tom(150.0, 95.0, 0.22)),
        (0.4, prato(0.95) * 0.9),
    ]:
        n = int(TAXA * quando)
        total[n : n + len(som)] += som[: len(total) - n]
    return total


def main() -> None:
    os.makedirs(PASTA, exist_ok=True)
    for nome, fn in [
        ("quack", quack),
        ("airhorn", airhorn),
        ("cricket", cricket),
        ("golf-clap", golf_clap),
        ("sad-horn", sad_horn),
        ("ba-dum-tss", ba_dum_tss),
    ]:
        gravar(nome, fn().astype(float))


if __name__ == "__main__":
    main()
