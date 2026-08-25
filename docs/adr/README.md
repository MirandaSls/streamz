# Architecture Decision Records

Decisão arquitetural com trade-off real vira ADR datada aqui — não comentário no
código nem parágrafo no `CLAUDE.md`. O `CLAUDE.md` descreve o que **é**; a ADR
registra **por que** e o que foi descartado no caminho.

## Índice

| ADR                                          | Título                                | Status   | Data       |
| -------------------------------------------- | ------------------------------------- | -------- | ---------- |
| [0001](0001-unificar-dm-em-channel-message.md) | Unificar DM e grupo em Channel/Message | Proposta | 2026-08-25 |

## Como escrever uma

Arquivo `NNNN-titulo-em-kebab-case.md`, numeração sequencial, em pt-BR. Estrutura
mínima: **contexto** (o problema, com referência ao código), **opções
consideradas** (com os contras honestos), **decisão**, **consequências**
(positivas *e* negativas) e, quando muda o banco, o **plano de migração**.

Status: `Proposta` → `Aceita` → `Depreciada` / `Substituída por ADR-NNNN`. ADR
aceita não se edita: escreve-se outra que a substitui.
