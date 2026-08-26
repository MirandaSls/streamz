# NewDisc — produto e regras de negócio

O que o NewDisc **é**, as regras que governam cada feature e as decisões de escopo
tomadas no MVP. É a fonte da verdade de *comportamento* — como o sistema decide,
não como está codificado (isso é `CLAUDE.md`) nem como se parece (`design.md`).

Referência de produto: **Discord** (via stoatchat / Revolt). Toda regra abaixo
reflete o que está implementado; cortes conscientes estão marcados **[corte MVP]**.

## Visão

Chat em comunidades (servidores → canais) e mensagens diretas, em tempo real, com
voz/vídeo/tela e app desktop. Um usuário entra num servidor por convite, conversa
em canais de texto, entra em canais de voz, troca DMs 1-a-1 ou em grupo, e
modera sua comunidade.

## Entidades e papéis

- **Usuário** — conta com `username` único e senha. Tem um `status` de presença.
- **Servidor (guild)** — comunidade criada por um usuário. Tem canais, membros,
  convites e banimentos.
- **Papéis num servidor:** `OWNER` (3) > `ADMIN` (2) > `MEMBER` (1). "Moderação" =
  OWNER ou ADMIN. Um ator só age sobre papel **estritamente inferior**.
  - **[corte MVP]** Não há promoção/rebaixamento de cargo. Na prática só existem
    **OWNER** (o criador) e **MEMBER** (quem entra por convite); ADMIN existe no
    modelo mas nenhuma rota o atribui.
- **Canal** — `TEXT` ou `VOICE`, dentro de um servidor. Pode ser privado e/ou
  somente-leitura.
- **Mensagem** — em um canal de texto; pode ter anexos, reações e respostas (thread).
- **DM** — conversa direta 1-a-1 ou grupo (3+), fora de qualquer servidor. É um
  **canal** sem servidor (`type` DM/GROUP): tudo que vale para mensagem de canal
  — reação, anexo, edição, remoção, thread, busca — vale numa DM (ADR-0001).

## Contas e sessão

### Registro e login
- **Registro:** `email` (único), `username` 3–32 chars no alfabeto `a-zA-Z0-9_.-`,
  `password` 8–128 chars e `birthDate` opcional (`YYYY-MM-DD`). A senha passa por um
  **medidor** que é o mesmo dos dois lados (`forcaDeSenha` no contrato): pontuação 0
  — curta demais, palavra óbvia ou poucos caracteres distintos — é recusada pela API
  e pela tela. Senha guardada com **argon2**. E-mail ou username duplicado → `409`
  (a mensagem diz qual dos dois). O usuário nasce **ONLINE**.
- **Idade mínima:** 13 anos quando a data é informada, como no Discord.
- **Login:** um campo só, que aceita **e-mail ou usuário**. Toda recusa devolve a
  mesma mensagem genérica — não revela se a conta existe, se está trancada ou se
  está desativada.
- **Bloqueio por força bruta:** 5 senhas erradas seguidas trancam a **conta** por
  15 minutos (o teto do throttler é por IP e não cobre ataque distribuído). O
  bloqueio não é anunciado; acertar a senha zera o contador.

### Verificação de e-mail e recuperação de senha
- **Verificação:** o registro dispara um link que vale 24 h (`POST
  /auth/verify-email`). Pedir outro (`/auth/resend-verification`, ou `POST
  /me/email/resend` já autenticado) **invalida o anterior** — só o último link vale.
  A conta funciona sem confirmar; a confirmação é o que marca `emailVerified`.
- **Esqueci a senha:** `POST /auth/forgot-password` responde **sempre 200**, exista
  ou não a conta. `POST /auth/reset-password` troca a senha, destranca a conta e
  **revoga todas as sessões** — quem pede a redefinição costuma ter perdido o
  controle de alguma delas. Token de uso único, 1 h de validade.
- **Sem SMTP:** o provedor `console` imprime assunto e link no log da API, e o fluxo
  inteiro roda em dev sem servidor de e-mail. Em produção, a falta de `SMTP_URL` faz
  as rotas que dependem de envio responderem `503` (mesmo padrão de R2/LiveKit).

### Verificação em duas etapas (TOTP)
- **Ativar** tem dois passos: `POST /me/mfa/setup` devolve segredo, `otpauth://` e o
  QR já em data-URL; `POST /me/mfa/enable` confirma um código do app e só então liga
  o 2FA. Sem o segundo passo ninguém tranca a própria conta com um segredo que
  nunca escaneou.
- **Códigos de recuperação:** 10 por ativação, mostrados **uma única vez** (o banco
  guarda só o SHA-256). Alfabeto sem `0/O`, `1/I/L` e `S/5`, porque são lidos de um
  papel. Uso único; `POST /me/mfa/recovery-codes` gera um conjunto novo e invalida o
  antigo.
- **Login com 2FA:** o primeiro fator devolve um **desafio** (`{ mfaRequired: true,
  ticket }`), não uma sessão. `POST /auth/mfa` fecha o login com o código do app ou
  um código de recuperação. O ticket dura 5 min e é assinado com um segredo derivado
  do `JWT_SECRET` — assinado com o mesmo, passaria pelo guard como access token.
- **Desativar** exige senha **e** código: ter a aba aberta não basta.

### Sessão e dispositivos
- **Dois tokens:** access token curto (`15m`) + refresh token longo (`7d`). Do
  refresh guarda-se apenas o **hash do jti**, nunca o token.
- **Rotação na mesma linha:** cada `/auth/refresh` troca o hash antigo pelo novo num
  único update guardado por "não revogado e não expirado". Um refresh vazado morre
  no primeiro uso e dois refreshes simultâneos só deixam um passar. Reaproveitar a
  linha dá à sessão uma **identidade estável** — o access token carrega a claim `sid`
  com o id dela, e é assim que a lista de dispositivos sabe qual é a atual.
- **Dispositivos:** `GET /me/sessions` lista as sessões vivas com navegador/sistema
  (lido do `User-Agent`), IP, quando começou e quando renovou pela última vez.
  `DELETE /me/sessions/:id` encerra uma; `DELETE /me/sessions` encerra todas menos a
  atual. Quem é encerrado recebe `sessions.revoked` na sala do usuário.
- **Trocar a senha** (`PATCH /me/password`) derruba as **outras** sessões e mantém a
  que fez a troca. **Logout** revoga o refresh (idempotente).

### Desativar e excluir
- **Desativar** (`POST /me/disable`) é reversível: a conta sai de todos os aparelhos
  e **volta quando o dono entra de novo**. Nada é apagado.
- **Excluir** (`DELETE /me`) é definitivo e anonimiza: username vira
  `usuario_excluido_…`, o nome vira "Usuário excluído", e e-mail, nascimento, avatar,
  2FA, tokens e participações em servidores/conversas somem. **As mensagens ficam**,
  como no Discord — apagá-las abriria buracos em conversas de terceiros. Pede senha
  e, com 2FA ligado, o código.
- **Servidor sem dono:** ao excluir a conta, cada servidor do dono passa para o
  membro mais antigo que sobra (ADMIN antes de MEMBER); sem mais ninguém, o servidor
  é apagado junto. A alternativa — exigir transferência manual — travaria a exclusão,
  porque o MVP não tem tela de transferir propriedade.
- **O corte é imediato:** conta desativada ou excluída derruba o access token que
  ainda valeria por até 15 min (cache de 60 s no `AccountStatusService`, invalidado
  na hora por quem desativa/exclui/reativa) e o socket não conecta.

### Limites de requisição
- Login, refresh e registro têm teto por IP; as rotas de e-mail (verificação e
  "esqueci a senha") têm o mais apertado — 5 por hora —, porque cada chamada custa um
  envio real e a rota é pública. Códigos (2FA, redefinição) e operações sensíveis da
  conta também têm teto próprio. Estourar responde `429`.
- **[fora do escopo]** Login social (OAuth): o modelo `OAuthAccount` existe no banco
  e `linkedProviders` está no contrato, mas nenhum provedor é vinculável.

## Servidores e membros

- **Criar servidor:** qualquer usuário autenticado. O criador vira **OWNER** e um
  canal `#geral` (texto) é criado automaticamente. Nome 2–64 chars.
- **Visibilidade:** você só lista/vê servidores dos quais é membro. Um MEMBER não
  enxerga canais privados fora de sua allowlist; moderação vê todos.

### Moderação

- **Quem modera:** só OWNER/ADMIN. Ninguém modera a si mesmo. Só se age sobre
  papel estritamente inferior → **o OWNER nunca pode ser expulso nem banido**, e
  um ADMIN não atinge outro ADMIN.
- **Expulsar (kick):** remove o membro. Ele **pode voltar por convite**.
- **Banir (ban):** remove o membro e **bloqueia a reentrada** (mesmo com convite
  válido). Registra quem baniu e um motivo opcional (0–200 chars). Um ban por
  usuário/servidor.
- **Desbanir (unban):** remove o registro de ban (idempotente).
- **Tempo real:** quem é expulso/banido **sai da tela na hora** (evento
  `guild.removed`) e o acesso ao vivo é cortado junto — a conexão é retirada das
  salas dos canais do servidor, então não chega mais mensagem nenhuma nem com a
  aba aberta. Vale igual para quem perde acesso a um canal privado.

## Canais

- **Criar canal comum:** basta ser membro. **Criar canal privado ou
  somente-leitura:** exige moderação. Nome 1–64 chars. Novo canal vai para o fim
  da lista.
- **Privado:** só moderação e a **allowlist** (`ChannelMember`) enxergam e postam.
  A allowlist só admite quem já é membro do servidor; sua gestão (ver/adicionar/
  remover) é exclusiva de moderação.
- **Somente-leitura:** todos leem, **só moderação posta**.
- **Autorização central:** duas portas cobrem todo acesso a canal —
  *pode ver?* (membro + allowlist se privado) e *pode postar?* (ver + não é
  somente-leitura para não-moderador). Toda leitura/escrita de mensagem, entrada
  na sala de tempo real e emissão de token de voz passam por elas.

## Mensagens

- **Enviar:** requer poder postar no canal. Precisa de **texto OU ao menos um
  anexo** — mensagem totalmente vazia é recusada. Acima de **2000 caracteres** a
  mensagem é **recusada, não truncada**: o cliente recebe `ws.error` e sabe que
  nada foi enviado.
- **Validação:** todo comando do WebSocket é validado contra um schema do
  contrato compartilhado antes de tocar o banco. Payload malformado volta como
  `ws.error` com a razão; erro interno nunca vaza detalhe do servidor.
- **Limite de ritmo:** cada conexão tem um teto de comandos por segundo
  (mensagem, DM e "digitando"), com rajada tolerada. Estourar devolve
  `ws.error`, não desconecta.
- **Editar:** **só o autor** edita a própria mensagem (nem a moderação edita
  mensagem alheia). Marca "(editado)".
- **Apagar:** o **autor ou a moderação** (OWNER/ADMIN). Apagar uma mensagem-raiz
  apaga as respostas em cascata.
- **Threads (respostas):** profundidade **1** — responde-se a uma mensagem-raiz,
  nunca a uma resposta. O pai tem que ser do mesmo canal. A timeline principal
  mostra só as raízes; cada raiz exibe o contador de respostas.
- **Reações:** um emoji por usuário por mensagem (reagir de novo não duplica;
  remover o que não existe não dá erro). Saída agrupada por emoji com contagem.
- **Histórico:** paginação por **cursor**, 50 por página, ordem cronológica;
  scroll infinito para o passado. Só mensagens-raiz.
- **Busca:** por conteúdo dentro de um canal (`contains`, sem full-text), 30
  resultados, mais recentes primeiro.
- **Canal de escrita é WebSocket:** criar/editar/apagar/reagir passam pelo
  gateway em tempo real; o REST de mensagens serve só leitura.

## Anexos

- **Limite:** 25 MB por arquivo, até **10 anexos por mensagem**.
- **Segurança:** o tipo é derivado dos **magic-bytes** (PNG/JPEG/GIF/WebP são
  reconhecidos e renderizam inline; qualquer outro vira download genérico). Nunca
  se confia no tipo declarado pelo cliente — evita servir HTML/SVG executável.
  Nome do arquivo é sanitizado.
- **Vínculo seguro:** o arquivo é enviado antes (fica "solto") e só é amarrado à
  mensagem no envio — e **apenas anexos do próprio autor, ainda não usados**.
  Ninguém anexa arquivo alheio.
- **Leitura autorizada, URL com validade:** não existe URL pública permanente de
  anexo. A API devolve uma **URL assinada do storage que expira em 1 h**; quem
  recarrega a mensagem recebe uma nova. Quando não há como assinar, a leitura sai
  pelo **proxy da API**, que exige token — ou o token curto embutido na URL, ou o
  do usuário, e aí a permissão é reavaliada pelo canal da mensagem (anexo ainda
  solto só o próprio autor lê). Antes bastava conhecer o id para baixar anexo de
  canal privado.
- **Storage opcional no dev:** sem credenciais de storage (R2), o upload responde
  um erro claro (`503`) e o resto do app segue funcionando.
- **[corte MVP]** Limpeza de anexos órfãos (enviados e nunca vinculados) é job
  futuro, não implementado.

## Convites

- **Criar:** qualquer membro do servidor. Um convite tem código de 8 caracteres e,
  opcionalmente, **limite de usos** e **expiração** — ausentes = ilimitado / nunca
  expira.
- **Preview público:** dá para ver o servidor de um convite (nome/ícone) e se ele
  é válido **sem estar logado**.
- **Resgatar (redeem):** entra como **MEMBER**. Um convite é recusado se expirou,
  atingiu o limite de usos, ou se o usuário está **banido** naquele servidor. Quem
  já é membro recebe o servidor de volta **sem gastar um uso**. A contagem de usos
  é atômica (à prova de corrida no limite).
- **Entrada só por convite:** não há "entrar por id" — o convite é o único caminho
  de entrada, e é onde o ban é verificado.
- **[corte MVP]** Não há revogar convite nem listar os convites de um servidor.

## Não lido e menções

- Cada usuário tem um `lastReadAt` por canal. **Não lido** = existe mensagem
  depois disso (ou nunca abriu e há mensagem). Abrir o canal, ou receber
  mensagem com o canal na tela e a janela visível, marca como lido.
- **Menção** = `@username` no texto (limite de palavra), de outro autor, depois
  de `lastReadAt`. Aparece como badge vermelho no rail, no canal e na DM; a
  mensagem ganha faixa amarela para quem foi mencionado.
- Mensagem de outro servidor/conversa fora da tela notifica se a janela está
  escondida; dentro do app só menção e DM notificam.

## Perfil

- **Nome de exibição** (até 32 caracteres) é o que aparece em toda parte;
  vazio = `@username`. **Avatar** por upload (imagem, até 4 MB; exige R2).
- **Status manual**: Online (automático), Ausente, Não perturbe, Invisível
  (aparece offline). Vale enquanto conectado; desconectar = offline.
- Mudanças de perfil e status são vistas por todos na hora (`user.updated`).

## Papéis e gestão

- Só o **dono** promove a ADMIN / rebaixa a MEMBER; o dono não muda de papel
  nem transfere a posse (**[corte MVP]**).
- Moderação renomeia e apaga canal (o último canal de texto fica) e revoga
  qualquer convite; quem criou revoga o próprio.
- Qualquer membro sai do servidor, exceto o dono — o dono **apaga** o servidor
  (canais, mensagens e convites em cascata).

## Texto da mensagem

- Markdown do Discord: `**negrito**`, `*itálico*`, `__sublinhado__`,
  `~~riscado~~`, `` `código` ``, blocos ```` ``` ````, `||spoiler||`, `> citação`,
  `#` títulos, links automáticos e `@menção`. Sem HTML.
- A primeira URL da mensagem vira uma **prévia** (Open Graph) buscada pela API
  (só http(s), hosts públicos, 512 KB, 5 s, cache de 1 h).

## Mensagens diretas (DMs)

- **1-a-1:** um único canal por dupla, garantido por uma chave canônica (abrir a
  mesma conversa duas vezes devolve o mesmo canal). Não se abre DM consigo mesmo.
- **Grupo:** **mínimo 3 participantes** e no máximo **10 convidados além do
  criador**, sem repetição; todos precisam existir. O criador é o dono; nome do
  grupo é opcional.
- **Sair do grupo:** qualquer participante sai quando quiser. Se quem sai era o
  dono, a posse passa a outro; o último a sair leva o grupo (e as mensagens)
  junto. Conversa 1-a-1 não tem "sair".
- **Entrega:** ao enviar, todos os participantes (inclusive o autor) recebem em
  tempo real, em qualquer aba/dispositivo — pela sala da conversa, que o socket
  de cada participante entra ao conectar. Mesmo teto de 2000 caracteres das
  mensagens de canal, com a mesma recusa em vez de truncar.
- **Acesso:** ser participante. Não há papel, allowlist nem somente-leitura; em
  DM **só o autor apaga** a própria mensagem (não existe moderador).
- **Recursos:** reação, anexo, edição, remoção, thread, busca e histórico
  paginado são os mesmos do canal de servidor (`/channels/:id/messages…`).
- **[corte MVP]** Não há adicionar/remover participante nem renomear grupo.

## Voz / vídeo / tela

- **Entrar:** quem pode **ver** o canal recebe um token do LiveKit (válido 1h) com
  permissão de publicar e receber áudio/vídeo. A sala é isolada por canal.
- **Canal precisa ser de voz:** pedir token para um canal de texto responde
  `400`. Sem credenciais do LiveKit a rota responde `503` claro, no mesmo espírito
  do storage — voz é opcional no dev.
- **[corte MVP]** O token ignora o modo somente-leitura: quem vê o canal de voz
  fala nele.

## Presença

- **ONLINE / OFFLINE** derivam da conexão em tempo real: fica ONLINE na primeira
  aba aberta e OFFLINE quando a última fecha (contagem por usuário suporta várias
  abas). Mudanças são transmitidas a todos.
- **[corte MVP]** `IDLE` e `DND` existem no modelo mas nunca são definidos — não há
  status manual nem detecção de inatividade.

## Decisões de escopo (por que o MVP é assim)

- **Postgres em dev e em prod, sem variante.** Manter dois bancos "quase iguais"
  saía mais caro que subir um container: a semântica divergia em silêncio (busca
  sensível a caixa, por exemplo) e cada mudança de modelo tinha que ser feita
  duas vezes. Com isso os enums ficam garantidos pelo banco, não pela aplicação.
- **Escrita de mensagem por WebSocket, não REST.** O tempo real é o caminho
  principal; o REST cobre só leitura (histórico, thread, busca).
- **Autorização concentrada**, não espalhada pelos handlers — uma mudança de regra
  de acesso acontece num lugar só.
- **Anexos e voz são opcionais** e degradam sozinhos quando não configurados, para
  não travar o desenvolvimento local.
- **Nada é servido só pelo id.** Anexo, canal privado e sala de tempo real exigem
  autorização a cada leitura; um id vazado não vira acesso.
- **Limites são recusa explícita, nunca truncamento silencioso.** O cliente
  sempre sabe que a ação não passou.
- **Papéis mínimos, sem matriz de permissões fina.** Só os dois modos de canal
  (privado, somente-leitura) e a hierarquia OWNER/ADMIN/MEMBER — sem overrides por
  permissão (silenciar, gerenciar mensagens, etc.).
