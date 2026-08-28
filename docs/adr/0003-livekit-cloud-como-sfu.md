# ADR-0003: LiveKit Cloud como SFU de voz/vídeo/tela

**Status:** Substituída por [ADR-0005](0005-self-host-do-livekit.md) (2026-08-27)
**Data:** 2026-08-26
**Decisores:** Arthur Miranda
**Escopo afetado:** `.env` / `.env.example`, `PENDENCIAS.md`, `README.md`; nenhum código

## Contexto

O Streamz não transporta mídia. `VoiceService` (`apps/api/src/modules/voice/`)
só **assina um token** de acesso (`AccessToken` do `livekit-server-sdk`) para a
sala `voice:<channelId>` ou `dm:<channelId>`; nenhum pacote RTP passa pela API.
O cliente (`apps/web/stores/voice.ts`) conecta com
`new Room({ adaptiveStream: true, dynacast: true })` e negocia camada e
resolução sozinho.

Consequência: **CPU e RAM do servidor quase não decidem a qualidade percebida.**
LiveKit é SFU, não MCU — ele encaminha streams, não transcodifica. Quem decide é
a rede: latência até cada participante, perda de pacote e banda de saída. Acima
de ~250–300 ms de *mouth-to-ear* a conversa deixa de ser natural, e é esse
número que manda, não o bitrate.

O público-alvo do produto é **global**, não regional. Isso é o que torna a
escolha não óbvia: para usuários concentrados num país, um único nó bem
posicionado resolveria.

## Opções consideradas

### A. Self-host de um nó único

Um VPS de 4 vCPU / 1 Gbps em São Paulo aguenta bem mais que o MVP — o gargalo é
a NIC, não o processador (1 Gbps ÷ ~1,5 Mbps por assinante de vídeo ≈ 600
streams de saída). Custo baixo e previsível.

**Contra, e é o que elimina a opção:** com participantes em continentes
diferentes, os dois trechos cruzam o planeta. Sydney + Londres com SFU em São
Paulo passa de 400 ms de mouth-to-ear. Além disso, um `reboot` derruba todas as
chamadas ao mesmo tempo e não há failover.

### B. Self-host multi-região (vários nós + Redis)

O LiveKit aberto roda multi-nó com Redis, mas **distribui *salas* entre nós — uma
sala vive num nó só**. Ele não faz cascata entre nós.

**Contra:** não resolve o problema. Uma sala com um brasileiro e um alemão
continua tendo alguém com latência ruim, independente de quantos nós existam.
Paga-se N regiões (certificado, TURN, monitoramento, deploy em cada uma) sem
comprar a propriedade que interessa.

### C. Self-host multi-região com *sala fixada por região*

Variante viável de B: um campo de região no servidor (guild) escolhe o nó. Foi o
que o próprio Discord fez por anos, com o seletor de região no canal de voz.
Funciona quando a comunidade é regionalmente homogênea, e é bem mais barato que
o Cloud sob uso pesado.

**Contra:** não resolve sala mista, que é justamente o caso de um produto global;
e exige operar N regiões desde o dia 1.

### D. LiveKit Cloud

O Cloud faz *multi-home* / cascading: a mesma sala se espalha por vários edges,
cada participante conecta no mais próximo e os edges relayam entre si. O
primeiro salto de cada usuário passa a ser ~30 ms e só o trecho entre edges é
longo. Traz junto TURN em TLS/443 (o que salva usuário atrás de firewall
corporativo) e failover.

**Contra:** custo por participante-minuto + banda, que cresce com o uso; e
dependência de fornecedor para a parte mais visível do produto.

## Decisão

**LiveKit Cloud.** O cascading é uma capacidade que o build aberto não tem, e é
exatamente a que um produto com usuários no mundo todo precisa. As outras opções
não são "mais baratas pelo mesmo resultado" — elas entregam resultado pior.

A troca é de configuração: `LIVEKIT_URL`, `LIVEKIT_API_KEY` e
`LIVEKIT_API_SECRET` no `.env`. **Zero linha de código**, porque
`VoiceService.assinarToken` já assina contra qualquer endpoint LiveKit e devolve
a URL junto do token.

Isto **não** afeta anexos: imagem e vídeo continuam no Cloudflare R2
(`StorageService`), cujo egress grátis é o oposto do problema de banda de mídia.
São duas camadas independentes.

## Consequências

**Positivas**
- Qualidade de chamada boa por padrão para usuário em qualquer lugar, sem
  operação de infra de mídia.
- TURN/TLS/443, NAT e certificados deixam de ser problema nosso.
- O `docker-compose` com profile `livekit` continua existindo como caminho de
  dev offline — dá para exercitar voz sem conta e sem internet.

**Negativas**
- Custo variável, atrelado a minutos e banda. Uso pesado de vídeo pode virar o
  item mais caro do projeto; precisa de acompanhamento, não de fé.
- Dependência de fornecedor no caminho crítico. Mitigada pelo fato de o código
  ser agnóstico: a saída é trocar três variáveis de ambiente.
- Sem credencial, voz responde `503`. É o comportamento desejado (mesmo padrão
  de R2 e SMTP), mas significa que um deploy sem as chaves sobe com voz morta e
  o resto funcionando — falha silenciosa para quem não olhar a rota.

## Quando reabrir

Quando a conta de banda do Cloud justificar operar N regiões. O caminho de saída
é a opção **C**, e o contrato já a suporta: `VoiceTokenResponse`
(`packages/shared/src/index.ts`) devolve `url` **por requisição**, então
regionalizar é um mapa `região → {url, key, secret}` dentro do `VoiceService` —
sem tocar em `packages/shared` nem no cliente.
