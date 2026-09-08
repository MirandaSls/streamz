# A ponte de voz (§D5.5). O contexto de build é a **raiz do repo**:
#
#   build: { context: ., dockerfile: apps/ponte-voz/Dockerfile }
#
# `golang:1.26`, e não a `1.23` do §12 do documento: o `server-sdk-go/v2@v2.18.1`
# e o `golang.org/x/crypto@v0.57.0` exigem `go >= 1.26` (medido pelo coordenador
# em 2026-09-08; está no §2 do CONTRATO-F2.md).

FROM golang:1.26 AS construcao

WORKDIR /src

# As dependências primeiro: assim uma mudança em `.go` não refaz o download.
COPY apps/ponte-voz/go.mod apps/ponte-voz/go.sum ./
RUN go mod download

COPY apps/ponte-voz/ ./

# Estático (`CGO_ENABLED=0`): não há libopus nem libwebrtc nesta ponte — o
# quadro Opus é repassado, não decodificado (§D5.1).
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /saida/ponte-voz .

# ── imagem final ─────────────────────────────────────────────
#
# Alpine, e não `scratch`, por duas razões concretas:
#   1. `ca-certificates` — a ponte abre um WSS contra o LiveKit
#      (`wss://livekit.streamz.chat`) com o token que veio no JWT; sem as CAs
#      isso falha com "x509: certificate signed by unknown authority" e o áudio
#      não sai.
#   2. o `HEALTHCHECK` precisa de algum binário que fale HTTP.
FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
    && adduser -D -H -u 10001 ponte

COPY --from=construcao /saida/ponte-voz /usr/local/bin/ponte-voz

USER ponte

# 8080/tcp é o voice gateway (o Traefik fala com ele por dentro da rede do
# compose); 7883/udp é a mídia, publicada direta no host — o Traefik não faz UDP.
EXPOSE 8080
EXPOSE 7883/udp

# `GET /saude` é a rota que o `Servir` expõe. A porta sai do ambiente porque o
# compose pode mudá-la.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PONTE_VOZ_PORTA_WS:-8080}/saude" || exit 1

ENTRYPOINT ["/usr/local/bin/ponte-voz"]
