# Streamz — produto e regras de negócio

O que o Streamz **é**, as regras que governam cada feature e as decisões de escopo
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
- **Papéis num servidor:** `OWNER` (3) > `ADMIN` (2) > `MEMBER` (1) — a
  hierarquia que decide *sobre quem* se age (um ator só age sobre papel
  estritamente inferior; o dono nunca é alvo). **O que se pode fazer** já não vem
  do papel, e sim das **permissões por cargo** (ver "Cargos e permissões"): o
  papel é a hierarquia, o cargo é a capacidade.
- **Cargo (role)** — conjunto nomeado de permissões dentro de um servidor, com
  cor, posição e "mencionável". Todo servidor tem o `@everyone`, que vale para
  todo mundo.
- **Canal** — `TEXT`, `VOICE` ou `ANNOUNCEMENT`, dentro de um servidor. Pode ser
  privado, somente-leitura, sensível (NSFW), ter tópico, modo lento e estar
  dentro de uma **categoria**.
- **Mensagem** — em um canal de texto; pode ter anexos, reações e respostas (thread).
- **DM** — conversa direta 1-a-1 ou grupo (3+), fora de qualquer servidor. É um
  **canal** sem servidor (`type` DM/GROUP): tudo que vale para mensagem de canal
  — reação, anexo, edição, remoção, thread, busca — vale numa DM (ADR-0001).

## Contas e sessão

### Registro e login
- **Registro:** `email` (único), `username` 3–32 chars no alfabeto `a-zA-Z0-9_.-` e
  `password` 6–128 chars. A senha só é verificada por **comprimento** — não há
  medidor de força, lista de senhas óbvias nem data de nascimento. Senha guardada
  com **argon2**. E-mail ou username duplicado → `409` (a mensagem diz qual dos
  dois). O usuário nasce **ONLINE**.
- **Login:** um campo só, que aceita **e-mail ou usuário**. Toda recusa devolve a
  mesma mensagem genérica — não revela se a conta existe, se está trancada ou se
  está desativada.
- **Bloqueio por força bruta:** 5 senhas erradas seguidas trancam a **conta** por
  15 minutos (o teto do throttler é por IP e não cobre ataque distribuído). O
  bloqueio não é anunciado; acertar a senha zera o contador.

### Verificação de e-mail e recuperação de senha
- **Verificação (a pedido):** o registro **não envia e-mail** — a conta nasce
  utilizável e entra direto no app. Quem quiser confirmar o e-mail pede o link na
  aba Conta (`POST /me/email/resend`) ou por `/auth/resend-verification`; o link
  vale 24 h (`POST /auth/verify-email`) e pedir outro **invalida o anterior**. A
  confirmação é só o que marca `emailVerified`.
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
  `usuario_excluido_…`, o nome vira "Usuário excluído", e e-mail, avatar,
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

- **Criar canal comum:** basta ser membro. **Criar canal privado,
  somente-leitura ou de anúncios:** exige `MANAGE_CHANNELS`. Nome 1–64 chars.
  Novo canal vai para o fim do seu bloco.
- **Categorias:** agrupam canais na barra lateral (nome até 64 chars). Não
  autorizam nada e não mudam a rota de canal nenhum — são ordem e rótulo. Canal
  sem categoria fica no topo; apagar a categoria **solta** os canais em vez de
  levá-los junto. Categoria fechada continua mostrando o canal aberto.
- **Reordenar:** arrastar canal (entre e dentro de categorias) e categoria manda
  um lote só — mandar um PATCH por canal deixaria a lista inconsistente no meio
  do caminho. Exige `MANAGE_CHANNELS`.
- **Tópico:** descrição curta do canal (até 1024 chars), mostrada no cabeçalho.
- **Modo lento:** intervalo mínimo entre mensagens do mesmo autor, 0 a 6 h
  (presets de 5 s a 6 h). Quem modera o canal não é barrado. A API recusa com
  `429` **e** o cliente barra antes de mandar, para a mensagem otimista não
  aparecer e sumir na cara de quem escreveu.
- **Sensível (NSFW):** o canal pede confirmação antes de abrir; o "sim" vale por
  aba (é um consentimento do momento, não uma preferência guardada).
- **Anúncios:** canal de texto em que **só quem tem `SEND_MESSAGES` no canal
  posta** — na prática, a moderação. **[corte MVP]** Não há "seguir canal de
  anúncios" em outro servidor.
- **Privado:** só moderação e a **allowlist** (`ChannelMember`) enxergam e postam.
  A allowlist só admite quem já é membro do servidor; sua gestão (ver/adicionar/
  remover) é exclusiva de moderação.
- **Somente-leitura:** todos leem, **só moderação posta**.
- **Autorização central:** duas portas cobrem todo acesso a canal —
  *pode ver?* (`VIEW_CHANNEL` na permissão efetiva, ou ser participante da
  conversa) e *pode postar?* (`SEND_MESSAGES` na permissão efetiva). Toda
  leitura/escrita de mensagem, entrada na sala de tempo real e emissão de token
  de voz passam por elas. "Privado" e "somente-leitura" continuam existindo como
  atalho na UI: são espelhos de um `deny` no `@everyone` do canal.

## Cargos e permissões

- **Permissão é um bitfield** (ver `docs/adr/0002`): `VIEW_CHANNEL`,
  `SEND_MESSAGES`, `MANAGE_MESSAGES`, `MANAGE_CHANNELS`, `MANAGE_ROLES`,
  `KICK_MEMBERS`, `BAN_MEMBERS`, `MANAGE_GUILD`, `CREATE_INVITE`,
  `ATTACH_FILES`, `ADD_REACTIONS`, `MENTION_EVERYONE`, `CONNECT`, `SPEAK`,
  `MUTE_MEMBERS`, `MODERATE_MEMBERS`, `MANAGE_EMOJIS`, `VIEW_AUDIT_LOG` e
  `ADMINISTRATOR`. Os bits são **estáveis para sempre**: o valor fica gravado em
  cada cargo e em cada regra de canal.
- **Permissão efetiva** = união das permissões dos cargos do membro (a começar
  pelo `@everyone`), depois os **overrides do canal** aplicados na ordem
  `deny` → `allow`, primeiro os do `@everyone`, depois os dos cargos e por fim os
  do usuário. `ADMINISTRATOR` e o **dono** ignoram tudo.
- **Cargos:** nome até 32 chars, cor opcional, `hoist` (seção própria na lista de
  membros), `mentionable` e posição (maior = mais alto). O `@everyone` é criado
  com o servidor: não se apaga nem se atribui.
- **Quem mexe:** `MANAGE_ROLES` cria, edita, ordena e atribui — e **nunca acima
  de si mesmo**: não se dá nem se tira um cargo mais alto que o seu.
- **Cor do nome:** o nome do autor aparece na cor do seu cargo colorido mais
  alto, na timeline e na lista de membros.
- **Menção a cargo:** `@cargo` só é oferecida para cargos `mentionable`. O texto
  guarda `<@&id>` (e não o nome, que muda) e a menção **conta como menção** para
  quem tem o cargo — badge, faixa amarela e caixa de entrada.
- **Transferir posse:** o dono passa o servidor para outro membro (confirmando
  pelo nome); quem entrega vira ADMIN.

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
- **Responder (reply):** qualquer mensagem do mesmo canal pode ser citada. A
  resposta mostra a linha de referência (autor + trecho de até 100 caracteres)
  e o clique nela rola até a original, que fica destacada por 2 s. O
  **"@ ligado"** (padrão, como no Discord) faz a resposta **contar como menção**
  para quem escreveu a original; desligado, ela é só uma citação.
- **Threads:** uma **thread nomeada** nasce de uma mensagem-raiz (o id da thread
  *é* o da raiz); a raiz passa a exibir o nome, os avatares de quem participa e
  quantas respostas tem. O painel de threads do cabeçalho lista as ativas e as
  arquivadas, e quem criou (ou a moderação) renomeia e arquiva. Respostas
  continuam com profundidade **1** — responde-se a uma raiz, nunca a uma
  resposta —, e raiz sem nome segue funcionando como thread sem nome.
- **Fixadas:** até **50 por canal**. Fixa a moderação (OWNER/ADMIN) ou, em
  conversa direta, qualquer participante. Fixar narra no canal uma mensagem de
  sistema ("X fixou uma mensagem neste canal", com "Ver mensagem"); o painel do
  cabeçalho lista as fixadas com "ir para a mensagem".
- **Reações:** um emoji por usuário por mensagem (reagir de novo não duplica;
  remover o que não existe não dá erro). Saída agrupada por emoji com contagem.
- **Histórico:** paginação por **cursor**, 50 por página, ordem cronológica;
  scroll infinito para o passado. Só mensagens-raiz.
- **Busca:** por conteúdo, num canal (30 resultados) ou no **servidor inteiro**
  (50), sempre restrita aos canais que **quem busca** enxerga. Aceita filtros
  `from:@usuário`, `in:#canal`, `has:link|image|file`, `before:`/`after:`
  (AAAA-MM-DD) e `mentions:@usuário`; filtro com valor inválido volta a ser
  texto, em vez de virar um filtro invisível que não acha nada. Resultados no
  painel da direita, agrupados por canal, com "ir para".
- **Ir para a mensagem:** carrega uma janela de 25 mensagens antes e depois da
  alvo, rola até ela e a destaca por 2 s. É o que fixadas, caixa de entrada,
  busca, resposta e "copiar link da mensagem"
  (`/app/channels/:guildId/:channelId/:messageId`, com `@me` em conversa) usam.
- **Mensagens de sistema:** narração do canal (fixar; entrada de membro), sem
  avatar, com ícone e texto apagado. Não são editáveis, fixáveis nem indexadas
  pela busca.
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
- **Faxina diária:** anexos órfãos (enviados e nunca vinculados a uma mensagem),
  refresh tokens vencidos e status personalizados expirados são apagados por um
  job diário. Ele roda **por processo** — com mais de uma instância da API o job
  repete.

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
- **Listar e revogar:** `MANAGE_GUILD` lista os convites do servidor (código,
  usos/limite, expiração, quem criou e para qual canal) e revoga qualquer um.
  Revogar é imediato: o código deixa de valer.

## Não lido e menções

- Cada usuário tem um `lastReadAt` por canal. **Não lido** = existe mensagem
  depois disso (ou nunca abriu e há mensagem). Abrir o canal, ou receber
  mensagem com o canal na tela e a janela visível, marca como lido.
- **Menção** = `@username` no texto (limite de palavra), `@everyone`/`@here`,
  um **cargo meu** (`<@&id>`) **ou** resposta a uma mensagem minha com o
  "@ ligado", de outro autor, depois de `lastReadAt` — uma mensagem que seja
  duas dessas coisas conta uma vez só. Aparece como badge vermelho no rail, no canal e na DM; a
  mensagem ganha faixa amarela para quem foi mencionado.
- Mensagem de outro servidor/conversa fora da tela notifica se a janela está
  escondida; dentro do app só menção e DM notificam.
- **Caixa de entrada** (cabeçalho): "Para você" reúne as menções não lidas de
  todos os servidores e conversas (clique leva até a mensagem); "Não lidos"
  agrupa por servidor os canais com novidade e tem "marcar tudo como lido".

## Perfil

- **Nome de exibição** (até 32 caracteres) é o que aparece em toda parte;
  vazio = `@username`. **Avatar** por upload (imagem, até 4 MB; exige R2).
- **Status manual**: Online (automático), Ausente, Não perturbe, Invisível
  (aparece offline). Vale enquanto conectado; desconectar = offline.
- Mudanças de perfil e status são vistas por todos na hora (`user.updated`).

## Papéis e gestão

- Só o **dono** promove a ADMIN / rebaixa a MEMBER, e é ele quem **transfere a
  posse** (quem entrega vira ADMIN). O dono não é alvo de moderação.
- `MANAGE_CHANNELS` renomeia e apaga canal (o último canal de texto fica);
  `MANAGE_GUILD` edita nome, ícone e descrição do servidor e revoga qualquer
  convite; quem criou revoga o próprio.
- Qualquer membro sai do servidor, exceto o dono — o dono **apaga** o servidor
  (canais, mensagens e convites em cascata).
- **Configurações do servidor** é uma tela cheia com as abas Visão geral,
  Cargos, Membros, Convites, Banimentos, Entrada e regras, Registro de auditoria
  e Denúncias. Cada aba pede a permissão que a API exigiria e **some** para quem
  não a tem: quem só pode banir vê "Banimentos" e nada mais.

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
- **Gestão do grupo:** qualquer participante adiciona gente (até o teto de 10
  além do criador); o **dono** remove participante, renomeia o grupo e troca o
  ícone. Cada uma dessas ações vira uma **mensagem de sistema** na conversa
  ("X adicionou Y", "X saiu do grupo", "X mudou o nome do grupo para…").
- **Coluna de participantes:** o cabeçalho da conversa abre a lista de quem está
  nela (em 1-a-1, os detalhes da pessoa).

## Voz / vídeo / tela

- **Entrar:** quem pode **ver** o canal recebe um token do LiveKit (válido 1h) com
  permissão de publicar e receber áudio/vídeo. A sala é isolada por canal.
- **Canal precisa ser de voz:** pedir token para um canal de texto responde
  `400`. Sem credenciais do LiveKit a rota responde `503` claro, no mesmo espírito
  do storage — voz é opcional no dev.
- **Estado de voz ao vivo:** quem entra, sai, muta, ensurdece, liga a câmera ou
  transmite a tela emite `voice.state` para o canal. A barra lateral lista quem
  está na sala com esses ícones, e `connected: false` é a saída — o cliente
  remove o participante em vez de manter um estado zumbi.
- **Chamada em conversa direta:** ligar toca para os outros participantes por
  até **30 s**; dá para atender, recusar ou encerrar, e a chamada expira sozinha
  se ninguém atender. A conversa é a sala: não existe modelo "de chamada"
  separado (ADR-0001).
- **Dispositivos e apertar-para-falar:** microfone, saída e câmera são
  escolhidos num painel único, montado tanto durante a chamada quanto na aba
  "Voz e vídeo" das configurações. Com o PTT ligado o microfone só abre com a
  tecla apertada e continua aberto por 200 ms depois de soltar, para a última
  sílaba não sumir. A aba tem ainda volumes, teste de microfone com medidor e
  prévia da câmera — toda trilha aberta ali é fechada ao sair da tela.
- **Compartilhar tela:** resolução (720p, 1080p, 1440p) e taxa de quadros (30 ou
  60 fps) escolhidas no seletor, que mostra o quanto cada combinação consome de
  internet de subida. O padrão é 1440p30: ler código na tela de alguém depende
  de resolução, não de fluidez.
- **[corte MVP]** O token ignora o modo somente-leitura: quem vê o canal de voz
  fala nele. O estado de voz vive **em memória do processo** — com mais de uma
  instância da API cada uma teria a sua visão da sala.

## Presença

- **ONLINE / OFFLINE** derivam da conexão em tempo real: fica ONLINE na primeira
  aba aberta e OFFLINE quando a última fecha (contagem por usuário suporta várias
  abas). Mudanças são transmitidas a todos.
- **Status manual** (Ausente, Não perturbe, Invisível) vale enquanto conectado e
  vence o automático; há ainda **ausência automática** por inatividade.
- **Status personalizado:** texto (até 128 chars) + emoji, com validade opcional
  (o vencido é tratado como ausente na leitura, sem depender do horário da
  faxina).

## Amigos, bloqueio e perfil

- **Amizade:** um pedido de A para B (`PENDING`) que vira amizade (`ACCEPTED`) ao
  ser aceito. É **uma linha só** para o par, com chave canônica — não existe o
  estado impossível "A é amigo de B mas B não é de A". A página Amigos lista
  online, todos, pendentes (recebidos e enviados) e bloqueados.
- **Bloqueio:** esconde as mensagens da pessoa na timeline, impede pedido de
  amizade e abrir conversa. É unilateral e desfazível.
- **Perfil rico:** nome de exibição, avatar, "sobre mim" (190 chars), pronomes
  (40 chars) e faixa do cartão (cor ou imagem). O cartão de perfil mostra os
  cargos do servidor de onde foi aberto e as ações de relação (adicionar,
  aceitar, remover, bloquear).
- **Visto por último:** a última desconexão aparece no perfil de quem está
  offline.

## Notificações e preferências

- **Nível por escopo:** cada canal, cada servidor e o padrão global têm um nível
  — `ALL`, `MENTIONS` ou `NONE`. O mais específico vence; o escopo é uma coluna
  canônica (`global` | `guild:<id>` | `channel:<id>`), porque no Postgres dois
  `NULL` são distintos e um índice único sobre colunas nuláveis deixaria passar
  duplicata do mesmo escopo.
- **Silenciar** é independente do nível (silenciar não apaga o "só menções" por
  baixo) e pode ter prazo — sem prazo é "até eu reativar". Canal silenciado não
  conta como não lido e aparece apagado na barra lateral.
- **Preferências:** aparência (modo compacto, escala da fonte, espaço entre
  grupos, tamanho do emoji), acessibilidade, idioma (pt-BR / en-US), som e
  contador de notificação, e `Enter` × `Ctrl+Enter` para enviar.
- **Atalhos e busca rápida:** `Ctrl+K` abre o seletor de servidor/canal/conversa;
  a aba Teclado lista os atalhos.
- **Configurações do usuário** é uma tela cheia com dez abas (Perfil, Conta,
  Segurança, Dispositivos, Notificações, Aparência, Acessibilidade, Idioma,
  Voz e vídeo, Teclado).

## Emojis, figurinhas e mídia

- **Emoji personalizado:** até **50 por servidor**, 256 KB, nome sem os
  dois-pontos. Quem tem `MANAGE_EMOJIS` cria e apaga. No texto vale `:nome:`, que
  o composer troca por `<:nome:id>` antes de enviar; a leitura é por uma rota
  própria de imagem, e não pela autorização do canal — emoji aparece em mensagem
  de qualquer canal, inclusive para quem já saiu do servidor de origem.
- **Figurinhas:** até **25 por servidor**, 512 KB. Uma figurinha **sozinha já é
  mensagem** (não precisa de texto).
- **Reação com emoji personalizado:** só reage quem é membro do servidor dono do
  emoji — a reação vai para todo mundo que lê o canal.
- **GIF:** busca por categorias e por termo (Tenor). Sem `TENOR_API_KEY` a busca
  responde `503` claro e o resto do app segue funcionando.
- **Composer:** autocomplete de `:emoji`, `@membro`, `@cargo`, `#canal` e
  `/comando`, rascunho por canal, anexo com prévia e progresso, colar imagem,
  spoiler de anexo e `↑` no campo vazio para editar a última mensagem.
- **Mídia na mensagem:** imagens em grade com galeria navegável, vídeo do
  YouTube vira player, imagem direta vira a própria imagem, e "remover prévia"
  desliga o card de link daquela mensagem (autor ou moderação). A coluna 4 tem a
  **galeria de mídia do canal**.

## Moderação, auditoria e comunidade

- **Castigo (timeout):** `MODERATE_MEMBERS` silencia um membro por um tempo
  (presets de 60 s a 1 semana; teto de 28 dias). Quem está de castigo **não
  escreve nem reage** — a recusa acontece antes de gravar —, e o composer é
  trocado por um aviso com a contagem.
- **Expulsar/banir com motivo:** motivo de até 512 chars, e o banimento pode
  **apagar as mensagens recentes** do banido. Quem é moderado recebe um aviso na
  conversa direta.
- **Apagar em lote:** modo "selecionar mensagens" e "apagar as mensagens depois
  desta", até **100 por vez** (`MANAGE_MESSAGES`). O evento
  `messages.bulkDeleted` some com todas de uma vez para quem está lendo.
- **Registro de auditoria:** toda ação de moderação e de estrutura (kick, ban,
  unban, castigo, papel/cargo, canal, cargo, convite, mensagem, servidor, emoji,
  figurinha) entra num registro com ator, alvo, motivo e o antes/depois de cada
  campo. Leitura por `MANAGE_GUILD`, com filtro por ação e por autor.
- **Denúncias:** qualquer um denuncia uma mensagem escolhendo o motivo (spam,
  assédio, ódio, violência, conteúdo adulto, automutilação, outro) e até 500
  chars de detalhe. A moderação vê a fila do servidor e marca como resolvida;
  denúncia nova chega ao vivo para quem modera.
- **Enquetes:** pergunta (300 chars) e 2 a 10 opções (55 chars cada), com
  duração de 1 hora a 2 semanas. A enquete **é uma face da mensagem**, não uma
  mensagem à parte: nasce pelo gateway como qualquer escrita, e voto/desvoto/
  encerramento atualizam a contagem ao vivo. O autor ou a moderação encerram
  antes do prazo; a lista de quem votou é visível depois.
- **Entrada e regras:** o servidor pode ter um **canal de sistema** (onde entra
  "X entrou no servidor"), um **canal de regras** — enquanto ele existir, postar
  exige aceitar as regras — e uma **tela de boas-vindas** com descrição (300
  chars) e até 5 canais em destaque, mostrada uma vez a quem entra.
- **Descobrir:** um servidor pode se marcar como público e aparecer na lista de
  descoberta, com nome, descrição e nº de membros.

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
- **Permissão é bitfield, hierarquia é papel.** O que se *pode fazer* vem dos
  cargos (com overrides por canal); *sobre quem* se age continua vindo de
  OWNER/ADMIN/MEMBER. Separar os dois evita a pergunta "quem é mais forte?" toda
  vez que se cria um cargo novo. Ver `docs/adr/0002`.
- **Enquete e figurinha são faces da mensagem**, não entidades paralelas — pela
  mesma razão que a DM é um canal (ADR-0001): um caminho de escrita, um caminho
  de leitura, um caminho de tempo real.
- **A narração do sistema tem um tipo só.** Fixar, entrada de membro, aviso da
  moderação e eventos de grupo são valores do mesmo enum de `MessageType`, com
  o texto derivado no contrato — api e cliente não divergem sobre a frase.
