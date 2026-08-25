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
- **DM** — conversa direta 1-a-1 ou grupo (3+), fora de qualquer servidor.

## Contas e sessão

- **Registro:** `username` 3–32 chars, alfabeto `a-zA-Z0-9_.-`; `password` 6–128
  chars (sem regra de complexidade). Senha guardada com **argon2**. Username
  duplicado → `409`. O usuário nasce **ONLINE**.
- **Login:** credenciais inválidas devolvem sempre a mesma mensagem genérica (não
  revela se o usuário existe).
- **Sessão (dois tokens):** access token curto (`15m`) + refresh token longo
  (`7d`). Do refresh guarda-se apenas o **hash do jti**, nunca o token.
- **Rotação de refresh:** cada `/auth/refresh` **revoga** o token apresentado e
  emite um par novo, atomicamente. Um refresh só vale se registrado, não revogado
  e não expirado → **reuso de token vazado morre no primeiro uso**. Falha na
  emissão faz rollback do revoke.
- **Logout:** revoga o refresh. Logout com token já inválido responde sucesso
  mesmo assim (idempotente).
- **Limite de tentativas:** login, refresh e registro têm teto por IP (o registro
  é o mais apertado, por hora), assim como upload e convites. Estourar responde
  `429`. É contenção de abuso, não cota de uso.
- **[corte MVP]** Não há editar perfil, avatar ou definir status manualmente.

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
  tempo real, em qualquer aba/dispositivo. Mesmo teto de 2000 caracteres das
  mensagens de canal, com a mesma recusa em vez de truncar.
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

- **SQLite no dev, Postgres em prod.** Desenvolver sem infra externa; os enums
  viram texto no banco, com os valores garantidos pela validação da aplicação. A
  migração e a primeira migration são pendência conhecida (`PENDENCIAS.md`).
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
