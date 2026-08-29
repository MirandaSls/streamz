# ADR-0008: Painel do administrador da instância

**Status:** Aceita e implementada (2026-08-28)
**Data:** 2026-08-28
**Decisores:** Arthur Miranda
**Escopo afetado:** `apps/api/src/modules/{admin,voice,messages}`, `packages/shared`, `apps/web/{components/settings/admin,stores,lib}`, `.env.example`

## Contexto

Quem opera esta instância do Streamz não tem nenhuma visão do conjunto. A
autorização do projeto é toda **por servidor** (ADR-0002): o bitfield de
`computePermissions` responde "o que este membro pode fazer *neste* servidor", e
`assertCanViewChannel` recusa canal de quem não é membro. Isso é o desenho certo
para moderação — e deixa o dono da instância sem resposta para três perguntas
que são de operação, não de moderação:

1. **Quais contas existem?** Não há listagem de usuários; `UsersService.search`
   devolve no máximo dez linhas, por prefixo, e omite quem pergunta.
2. **Quem está em chamada, e onde?** O estado de voz vive na memória da API
   (`voice-state.store.ts`) e é difundido por sala do WebSocket — salas nas
   quais só entra quem é membro do servidor ou participante da conversa. De
   fora, o estado é invisível: nem "quantas chamadas há agora" é respondível.
3. **O que está sendo dito?** Ler um canal exige ser membro dele. Para ver o
   conteúdo de um servidor, o operador teria de **entrar** nele — o que muda a
   lista de membros, aparece na barra lateral de todo mundo e não funciona para
   conversa direta, onde entrar não é sequer possível.

O caminho "óbvio" — criar uma conta de operação e entrar em tudo — é o pior
deles: é visível para os usuários, altera o objeto observado, não alcança DM, e
distribui o poder pelos servidores em vez de concentrá-lo num lugar auditável.

## Fatores de decisão

- **Não abrir um segundo caminho de escrita.** Moderação já existe, com
  hierarquia e bitfield. Um poder de instância que também escrevesse seria a
  forma mais fácil de furar as regras que o resto do código gasta tanto para
  manter.
- **Não poder ser conquistado por dentro.** Se o papel morar no banco, qualquer
  falha de escrita — hoje ou daqui a um ano — vira escalada de privilégio.
- **Não mexer no significado das salas do gateway.** Fazer o administrador
  entrar em todas as salas para observar em tempo real quebraria a invariante
  que `RealtimeService.leaveChannelRooms` existe para manter.
- **Reaproveitar os DTOs.** Uma segunda montagem de "mensagem" ou de "estado de
  voz" só para o painel envelheceria sozinha.

## Opções consideradas

### A. Papel de instância no banco (`User.isAdmin`), com rota que promove

Espelha o `MemberRole`. **Contra:** cria a escalada de privilégio que o item 2
dos fatores descarta — existindo a rota, existe o alvo. E a coluna vira mais um
lugar onde um `UPDATE` errado é catastrófico.

### B. Papel de instância no banco, sem rota, semeado por script

Tira a rota, mas mantém a coluna: o poder ainda é conquistável por escrita
direta no banco, e a fonte da verdade fica invisível no deploy (ninguém sabe
quem é admin sem consultar o Postgres).

### C. Lista de e-mails no ambiente da API — **escolhida**

`PLATFORM_ADMIN_EMAILS` é a fonte da verdade; o guard cruza o e-mail da conta
autenticada com ela. Não há coluna, não há rota, não há migration. Trocar quem
manda é editar o `.env` e reiniciar — visível no deploy e revogável na hora.

**Contra, assumido:** mudar a lista exige reiniciar a API, e a variável tem de
ser tratada como segredo de operação. Ambos são aceitáveis para uma decisão que
se toma uma vez.

### D. Ferramenta fora do app (psql, um painel separado)

Zero superfície nova no produto. **Contra:** não responde a pergunta 2 de jeito
nenhum — o estado de voz não está no banco —, e ler mensagem por SQL não passa
por auditoria, não renderiza anexo e não é utilizável no dia a dia.

## Decisão

Um módulo `modules/admin` **só de leitura**, atrás de `PlatformAdminGuard`, com
a lista de administradores vinda de `PLATFORM_ADMIN_EMAILS`.

Três detalhes que não são acessórios:

- **O e-mail precisa estar verificado.** `AccountService.excluir` grava
  `email: null` ao anonimizar a conta, o que **libera** o endereço. Sem essa
  condição, bastaria registrar uma conta nova com o e-mail do administrador para
  herdar o painel. A regra inteira é uma função pura em `modules/admin/admins.ts`,
  com teste.
- **Leitura de mensagem entra no log do servidor.** Não vai para `AuditLog`
  porque aquela tabela é por servidor (`guildId` obrigatório) e a leitura
  frequentemente não tem servidor nenhum — é DM. Um poder sem rastro é o que
  transforma administrador em bisbilhoteiro.
- **O painel busca em intervalo, não escuta o WebSocket.** As chamadas
  recarregam a cada 5 s (e o relógio pausa com a aba escondida). É o preço de
  não mudar o significado das salas do gateway.

Do lado do cliente, as abas entram no registro de `components/settings/tabs.tsx`
com `group: "admin"` e são montadas só quando `GET /admin/me` responde `true` —
que é conveniência de desenho, não segurança: a autorização é a do servidor.

## Consequências

**Positivas**

- As três perguntas passam a ter resposta sem entrar em servidor nenhum e sem
  aparecer para os usuários.
- O poder de instância é indistinguível de qualquer outra conta no banco: não há
  linha a proteger, porque não há linha.
- `assertCanViewChannel` continua sendo o único caminho de leitura do app. A
  exceção tem um nome comprido (`historicoSemChecagemDeAcesso`), um chamador só
  e um guard acima dela.

**Negativas**

- Existe agora um segundo eixo de autorização no projeto. Quem lê o código
  precisa saber que "permissão" (bitfield, por servidor) e "administrador da
  instância" (ambiente, global) são coisas diferentes que não se convertem uma
  na outra.
- Trocar a lista de administradores exige reiniciar a API.
- O painel é um poder de leitura amplo sobre conversas privadas. O log é o
  contrapeso, e é um contrapeso fraco: ele detecta, não impede. Um "quem leu o
  quê" visível para o usuário lido seria mais forte, e fica registrado aqui como
  o próximo passo se a instância deixar de ser de dono único.
- `salasAbertas()` faz `SCAN` no Redis. É barato na escala atual e cursorizado,
  mas é a primeira varredura de chaves do projeto — se a instância crescer, vira
  um índice mantido à parte.

## Plano de migração

Nenhuma migration: a decisão não toca o schema. Para ligar o painel numa
instância existente, basta preencher `PLATFORM_ADMIN_EMAILS` e reiniciar a API.
O boot registra no log se o e-mail listado não tem conta ou não está verificado.
