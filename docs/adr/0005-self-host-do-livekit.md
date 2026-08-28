# ADR-0005: Self-host do LiveKit para público brasileiro

**Status:** Aceita (2026-08-27)
**Data:** 2026-08-27
**Decisores:** Arthur Miranda
**Substitui:** [ADR-0003](0003-livekit-cloud-como-sfu.md)
**Escopo afetado:** `docker-compose.prod.yml`, `livekit.prod.example.yaml`,
`Caddyfile.example`, `.env.example`, `docs/selfhost-livekit.md`,
`packages/shared/src/index.ts`, `apps/web/stores/voice.ts`

## Contexto

A ADR-0003 escolheu LiveKit Cloud, e a premissa que sustentava a escolha está
escrita lá com todas as letras: *"o público-alvo do produto é global"*. Sob essa
premissa, o self-host de nó único foi eliminado por um motivo correto — uma sala
com alguém em Sydney e alguém em Londres, com SFU em São Paulo, passa de 400 ms
de mouth-to-ear, e o build aberto do LiveKit não faz cascading.

**A premissa mudou.** O produto vai operar com usuários concentrados no Brasil e
servidor em São Paulo. Com isso, o contra que eliminava a opção A deixa de
existir: o primeiro salto de todo mundo é curto, e o cascading — a única
capacidade que o Cloud tem e o build aberto não — deixa de comprar qualidade.

O que resta na comparação é custo. O Cloud cobra por participante-minuto e
banda; o self-host cabe no VPS que a aplicação já ocupa, porque o SFU **não
transcodifica** e sobra CPU (a API é um processo Node, que usa um core).

## Opções consideradas

### A. Manter o LiveKit Cloud

**A favor:** zero operação de mídia, TURN/TLS/443 incluído, failover.
**Contra:** paga-se por cascading que, com sala regionalmente homogênea, não
entrega nada. É custo variável por uma propriedade sem uso.

### B. Self-host em máquina separada

Isola a mídia por completo: um `VACUUM` do Postgres não pode roubar CPU do SFU, e
uma queda do servidor de mídia não derruba o chat.

**Contra:** dobra o custo mensal para resolver, com hardware, um problema que o
`cpuset` resolve de graça. A API assina o token **localmente**
(`AccessToken` do SDK, ver `VoiceService`), então não há acoplamento de rede
entre os dois — o que também significa que não há ganho arquitetural em separar.

### C. Self-host junto da aplicação, com cores isolados

Um VPS, quatro serviços, `cpuset` reservando metade da máquina para a mídia.

**Contra:** ponto único de falha — reiniciar o servidor derruba chat e chamada
juntos. E a operação de mídia passa a ser nossa: UDP no firewall, `use_external_ip`,
certificado, fallback para rede que bloqueia UDP.

## Decisão

**Opção C.** O isolamento que importa é de CPU, não de máquina, e `cpuset` o
entrega sem custo. O ponto único de falha é aceitável no estágio atual: o chat
já depende do mesmo servidor.

`docker-compose.prod.yml` sobe Caddy (TLS para web, API e signaling) e o LiveKit
com cores próprios. A mídia **não passa pelo proxy** — vai direto na UDP 7882,
que é a porta cuja abertura decide se o produto tem som. O runbook completo está
em `docs/selfhost-livekit.md`.

### Qualidade, que é a outra metade da decisão

Sair do Cloud tira o teto de custo por minuto e, com ele, o motivo de ser
conservador com bitrate. Os tetos passam a viver no contrato
(`SCREEN_QUALITY` e `MEDIA_QUALITY` em `packages/shared`), não em default de
SDK: tela até 1440p60, padrão **1440p30 a 6 Mbps**, microfone em 64 kbps sem
DTX, áudio de tela em 160 kbps estéreo.

O ponto não óbvio: **resolução sem bitrate não é qualidade**. O default do
`livekit-client` é calibrado para 1080p; publicar 1440p sem subir o
`videoEncoding` junto entrega mais pixels, todos borrados. Por isso o bitrate
mora *dentro* do preset — os dois não podem se separar.

## Consequências

**Positivas**
- Custo fixo e previsível, dentro do VPS já contratado.
- Qualidade deixa de ser limitada por custo por minuto.
- Nenhuma linha de código mudou para trocar de provedor: o `VoiceService`
  continua assinando contra qualquer endpoint LiveKit.

**Negativas**
- **Banda de saída vira o limite do recurso**, e ela é multiplicada por
  espectador: 1440p30 com 10 pessoas assistindo são ~60 Mbps sustentados. O
  número a vigiar é a velocidade da porta do servidor em Mbps, não o volume
  mensal de transferência.
- Sem cascading: uma sala com participante em outro continente fica pior do que
  ficaria no Cloud.
- TURN sai desligado. Quem estiver em rede que só libera 443 de saída não
  conecta — ligar exige domínio e certificado próprios.
- Reiniciar o servidor derruba chamada e chat juntos.

## Quando reabrir

Quando houver participante fora da América do Sul em sala com brasileiro, ou
quando a chamada precisar sobreviver a um reboot. O caminho de volta é o mesmo
que a ADR-0003 descreve: trocar `LIVEKIT_URL`, `LIVEKIT_API_KEY` e
`LIVEKIT_API_SECRET`. Nenhum código conhece a diferença.
