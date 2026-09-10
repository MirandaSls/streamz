# Streamz Cargos

O bot oficial de **cargos por reação** da instância. Uma pasta, como manda o
[`CONTRATO.md`](../../CONTRATO.md) — nada fora daqui, além do ícone
(`assets/cargos.png`), do script que o gera
(`scripts/gerar-icone-cargos.py`), da prova (`prova-cargos.sh`) e do serviço
`bot-cargos` no fim do bloco de bots do `docker-compose.yml`.

Nome, arte e descrição são próprios. Os bots que fazem isto no Discord são
serviços fechados de outras empresas; usar o nome ou a arte deles seria se
passar por eles.

Ele só é possível por causa da F5 da compatibilidade: desde o PR #196 a reação
chega ao bot como `MESSAGE_REACTION_ADD` de verdade, com `user_id` e emoji, e
não mais como um `MESSAGE_UPDATE` da mensagem inteira (§7 e §12 F5 do
`docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`).

## Os comandos

| Ação | O que faz |
|---|---|
| `/painel criar <canal> <título \| descrição>` | publica a mensagem do painel e devolve o id dele |
| `/painel adicionar <id> <emoji> <cargo> [rótulo]` | liga o emoji ao cargo, reage na mensagem e passa a valer |
| `/painel remover <id> <emoji>` | o emoji para de dar cargo |
| `/painel modo <id> <normal\|unico\|so-adicionar\|travado>` | troca o modo |
| `/painel listar` | os painéis do servidor, com os ids |
| `/painel apagar <id>` | apaga a mensagem e esquece o painel (não tira cargo de ninguém) |

A ação é a **primeira opção** do `/painel`, e não um subcomando: o `PUT` de
registro recusa os tipos 1 e 2 com `50035` (§9 do documento). No prefixo lê-se
igual: `!painel criar #geral Cargos | Escolha os seus`.

Os quatro modos:

| Modo | Reagir | Desreagir |
|---|---|---|
| `normal` | dá o cargo | tira o cargo |
| `unico` | dá o cargo e **tira o anterior** do mesmo painel (e a reação dele) | tira o cargo |
| `so-adicionar` | dá o cargo | não tira nada |
| `travado` | dá o cargo **na primeira vez**; depois desfaz a reação e não troca | não tira nada |

**Só quem tem `Gerenciar cargos`** mexe nos painéis; quem não tem leva uma
recusa efêmera. E o **cargo do bot precisa estar acima** dos cargos que ele
distribui — é a regra do Streamz para gente e para bot
(`GuildsService.assertPodeMexerNoCargo`), e o bot a confere **antes** de
publicar o item, para dizer "arraste o meu cargo para cima de X" em vez de
deixar um `50013 Missing Permissions` aparecer na primeira reação.

## Estado: arquivo, não banco

Um JSON por servidor em `/dados/<guildId>.json` (volume próprio, `CARGOS_DIR`),
com escrita atômica (`.tmp` + `rename`) — **nada no banco do Streamz**. Guarda
`messageId → { emoji → cargoId, modo }`. Na subida o bot **reconcilia**: painel
cujo canal ou mensagem sumiu é esquecido, e o que só não deu para conferir
(rede, 500) fica para a próxima. Nenhum dos dois derruba o bot.

## O que ainda não funciona nesta instância

`membro.roles.add()` do discord.js é
`PUT /guilds/:id/members/:uid/roles/:rid`, e o §12 F5 do documento lista
"membros/cargos no REST" como **ainda na fila**. Enquanto essa rota não existir,
o bot publica painéis, reage neles e recebe as reações — e ao tentar dar o cargo
registra no log **qual rota falta**, em vez de um 404 pelado. O `prova-cargos.sh`
sonda a rota e marca os passos do cargo como `PEND` quando ela não está lá.

## Rodar

```bash
docker compose --profile bots up -d --build bot-cargos

# a prova ponta a ponta, na bancada descartável (sobe e derruba tudo)
./apps/bots/prova-cargos.sh
```

`CARGOS_DIR` (padrão `/dados`) diz onde os painéis ficam.
