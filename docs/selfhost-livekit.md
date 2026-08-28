# LiveKit self-hosted

Como subir o servidor de mídia junto da aplicação, num VPS só. A alternativa
(LiveKit Cloud) continua a um `.env` de distância — ver o cabeçalho da seção
LiveKit em `.env.example` para o trade-off.

## Topologia

```
              :443  ┌─────────┐
  navegador ────────│  Caddy  │──► web:3000        (Next)
                    │  (TLS)  │──► api:3333        (NestJS: REST + WS do chat)
                    └─────────┘──► livekit:7880    (signaling, wss)
                                        │
  navegador ────────────────────────────┘
        :7882/udp  ── mídia (áudio, vídeo, tela), direto, sem passar pelo Caddy
```

O ponto que confunde: **a mídia não passa pelo proxy**. O Caddy só carrega o
_signaling_ — a negociação. Áudio e vídeo vão direto do navegador para a porta
UDP do servidor. Se a 7882/udp estiver fechada, a chamada conecta, a interface
mostra todo mundo na sala, e não sai som nenhum. É o sintoma mais comum e o que
menos parece um erro de rede.

## Pré-requisitos

**DNS** — três registros A para o IP do servidor, propagados **antes** de subir
o Caddy (ele pede o certificado no boot; sem DNS o desafio falha):

| Nome | Aponta para |
|---|---|
| `streamz.exemplo.com` | IP do servidor |
| `api.streamz.exemplo.com` | idem |
| `livekit.streamz.exemplo.com` | idem |

**Firewall** — no provedor *e* no sistema (`ufw`). Esquecer o do provedor é
metade dos casos de "abri a porta e não funcionou":

| Porta | Protocolo | Para quê |
|---|---|---|
| 80, 443 | TCP | Caddy (certificado + tudo que é HTTPS) |
| 7882 | **UDP** | mídia WebRTC — a que importa |
| 7881 | TCP | fallback ICE/TCP para rede que bloqueia UDP |

Se o provedor tiver proteção anti-DDoS que filtra UDP por padrão, peça a
liberação da 7882 antes de qualquer outra coisa.

## Passo a passo

```bash
# 1. configs a partir dos modelos
cp livekit.prod.example.yaml livekit.yaml
cp Caddyfile.example Caddyfile
cp .env.example .env

# 2. o secret do LiveKit — o MESMO valor nos dois arquivos
openssl rand -hex 32
#    -> cole em `keys:` do livekit.yaml e em LIVEKIT_API_SECRET do .env

# 3. no Caddyfile: troque os três domínios e o e-mail do ACME
# 4. no .env: domínios reais, segredos de JWT, e
#    LIVEKIT_URL / NEXT_PUBLIC_LIVEKIT_URL = wss://livekit.seudominio
#    LIVEKIT_API_KEY = streamz   (a chave que está no livekit.yaml)

# 5. no ar
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile livekit up -d --build
```

As `NEXT_PUBLIC_*` são embutidas no bundle **em tempo de build**: mudá-las no
`.env` depois não tem efeito nenhum até um `--build` da imagem da web.

## O teste que vale

Um "funciona aqui" no navegador do próprio servidor não prova nada — não passa
por NAT nem por firewall de rede alheia. O teste real é uma chamada com **três
pessoas em redes diferentes**: 4G, wifi corporativo e casa. É isso que exercita
o `use_external_ip`, o filtro de UDP do provedor e o fallback TCP de uma vez.

## Quando algo não funciona

| Sintoma | Causa quase certa |
|---|---|
| Entra na sala, ninguém ouve ninguém | 7882/udp fechada, ou `use_external_ip: false` |
| Só quem está em rede corporativa não conecta | 7881/tcp fechada (fallback ICE) |
| O navegador recusa a conexão do LiveKit | `LIVEKIT_URL` em `ws://` numa página https |
| Áudio corta em rajadas | mídia disputando CPU — confira o `cpuset` do override |
| Rede que só libera 443 não conecta | é o caso do TURN, ver abaixo |

**TURN** só é necessário para redes que liberam exclusivamente a 443 de saída.
Ele está desligado em `livekit.prod.example.yaml` de propósito: exige domínio e
certificado próprios (o Caddy não termina TLS de TURN sem o módulo `layer4`), e
resolve uma fatia pequena dos casos. Ligue quando alguém reclamar, não antes.

## Qualidade

Os tetos ficam no contrato (`packages/shared`), não no cliente:
`SCREEN_QUALITY` para tela e `MEDIA_QUALITY` para microfone, áudio de tela e
câmera. O padrão da tela é **1440p30 a 6 Mbps**.

O SFU **não transcodifica** — ele encaminha. Por isso a resolução quase não
altera a CPU do servidor, e o custo aparece todo em banda de saída, multiplicada
por espectador: uma tela em 1440p30 com 10 pessoas assistindo são ~60 Mbps
sustentados e ~27 GB por hora. Antes de subir esses números, o limite real a
verificar é a **velocidade da porta do servidor em Mbps** — não o volume mensal
de transferência.
