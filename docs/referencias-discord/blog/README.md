# Referências visuais: blog e newsroom oficiais do Discord

Coleta feita em 11/09/2026. São screenshots e mockups de produto que mostram a UI
real do Discord, tirados dos posts oficiais. Cada arquivo está descrito em
`manifesto.json`, com origem, data do post, contexto, plataforma, tela (rótulos do
`../TELAS.md`) e tema.

## Números

- **481 arquivos** em `imagens/` (480 imagens/GIFs + 1 vídeo `.webm`), vindos de **132 posts**.
- **22 vídeos do YouTube** entram no manifesto só como URL, com `arquivo: null`.
  Estão lá porque são demos de feature, mas ninguém conferiu o conteúdo quadro a quadro.
- Total no manifesto: 503 entradas. Tamanho da pasta: cerca de 470 MB (a maior parte são GIFs).
- Por plataforma: desktop 395 · iOS 38 · Android 14 · web 1 · desconhecida 33.
  "desconhecida" junta Meta Quest/VR, Xbox, PS5, e-mails, mockups estilizados sem
  moldura de aparelho e telas de celular sem identificação clara do sistema.
- Por tema: escuro 387 · claro 62 · outro 32 (temas de cor Nitro, gradientes,
  perfis coloridos, comparativos claro×escuro).
- Por ano do post: 2019: 12 · 2020: 11 · 2021: 24 · 2022: 90 · 2023: 102 · 2024: 80 · 2025: 79 · 2026: 83.

### Como saber o que é UI antiga

Os nomes das pastas começam com `aaaa-mm` do post, e `data_publicacao` está no manifesto.
Os marcos de UI são estes:

- **até 2023-11:** navegação mobile antiga (gavetas). A pasta `2020-07-how-discord-made-android-in-app-navigation` mostra o Android de 2020.
- **2023-12:** redesign do app mobile, com abas Servidores/Mensagens/Notificações/Você, em
  `2023-12-improving-our-mobile-experience/` (iOS, tema claro e Midnight). O ajuste
  seguinte, com a aba Home unificada, está em `2024-05-refining-discords-mobile-experience-with-your/`.
- **2025-03:** refresh visual do desktop (temas Light/Ash/Dark/Onyx, densidade da UI,
  controles de chamada centralizados e overlay novo), em `2025-03-player-release-q12025/`.
  O detalhamento das opções de exibição está em
  `2026-04-making-discord-on-desktop-look-just-right/`, e os temas em
  `2026-02-bring-your-vibe-to-discord-with-new-themes-in/`.
- **2025-11:** configurações redesenhadas em janela flutuante, editor de emoji e
  criação de DM em grupo, em `2025-11-a-cornucopia-of-updates-make-discord-on-desktop/`.
- **2026-08:** refresh visual do mobile ("squircles"), em `2026-08-improving-mobile-with-squircles-styles-and/`.
- Atenção: a página de segurança `Helping your teen stay safe on Discord` tem data de 2022-05,
  mas as capturas são atuais (Ignorar, kit de segurança, filtros). A página foi
  atualizada sem mudar a data.

## Fontes varridas

1. **`discord.com/blog`** e as seis categorias (`/category/product`, `company`,
   `community`, `how-to-discord`, `safety`, `engineering`). O "Load More" só revela
   itens já presentes no HTML, e cada listagem para em cerca de 100 posts (limite do
   Webflow). O RSS (`/blog/rss.xml`) também só traz 100. A listagem direta deu 353 posts.
2. **Wayback Machine (CDX)** com o prefixo `discord.com/blog/` para recuperar os posts
   antigos que saíram das listagens: mais 127 slugs, entre eles fórum, threads,
   AutoMod, soundboard, super reações, atividades, onboarding, palco e stickers.
3. **Busca na web** para confirmar posts de feature específicos (polls, clips,
   pedidos de mensagem, Family Center, redesign mobile, visual refresh, quests).
4. **Safety News Hub** (`discord.com/safety-news`) mais o CDX de `discord.com/safety/`
   (235 URLs, das quais cerca de 60 dão 404). Foi a fonte de denúncia, alertas de
   segurança, Ignorar, filtros de conteúdo sensível, Family Center e AutoMod.
5. **Newsroom** (`discord.com/newsroom`): conferi a listagem. Os press releases são
   corporativos e não entraram na extração. Os anúncios de produto da newsroom
   apontam para posts do blog que já estão cobertos (Orbs, Player Release Q1 2025,
   Quests).

Dos cerca de 610 posts e páginas extraídos, 184 foram selecionados pelo título e
tema (produto, how-to e segurança com UI), e deles saíram 817 mídias para triagem.
Ficaram de fora ilustrações, arte de marketing, fotos, gráficos de engenharia, UI
de jogos de terceiros, o Developer Portal (outra pasta cuida disso) e
duplicatas (removidas por md5).

**Não triado:** posts de engenharia, transparência, staff picks, merch e
spotlights de comunidade não foram abertos, pelo título. Os changelogs e patch
notes de 2023 a 2026 foram extraídos, mas quase só têm texto (1 ou 2 imagens de
capa). Os press releases da newsroom também não foram extraídos.

## Cobertura: plataforma × grupo de tela

Cada imagem conta uma vez por grupo, mesmo quando tem várias telas do mesmo grupo.

| Grupo | desktop | web | web-mobile | ios | android | tablet | desconhecida |
|---|---:|---:|---:|---:|---:|---:|---:|
| autenticação | 4 | 1 | · | · | · | · | 2 |
| home | 14 | · | · | 10 | 1 | · | 4 |
| servidor | 93 | · | · | 7 | 7 | · | 2 |
| chat | 82 | · | · | 14 | 4 | · | · |
| voz e vídeo | 49 | · | · | 4 | · | · | 11 |
| perfil | 41 | · | · | 2 | · | · | 8 |
| configurações do usuário | 84 | · | · | 7 | · | · | 4 |
| configurações do servidor | 43 | · | · | 1 | · | · | · |
| configurações do canal | 10 | · | · | · | · | · | · |
| modais | 55 | · | · | 2 | 1 | · | 2 |
| descoberta | 54 | · | · | 2 | · | · | 1 |
| mobile | 2 | · | · | 13 | 6 | · | 5 |

Os pontos fortes são estes:

- aparência, temas e densidade (2025/2026);
- perfil e personalização (popout, editar perfil, status, loja, decorações, placas de nome);
- notificações e caixa de entrada;
- AutoMod e moderação;
- apps, lançador de atividades e comandos;
- overlay de jogo;
- Go Live e compartilhamento de tela;
- soundboard, super reações e figurinhas;
- fórum, threads e palco (UI de 2021/2022);
- fluxos de denúncia e segurança (2024 a 2026);
- conexões e integração com console (Xbox/PS5).

## Lacunas

Telas do checklist **sem nenhuma referência** neste conjunto:

- autenticação > registro · esqueci a senha
- servidor > anúncios · eventos · diretório/canais e cargos
- chat > edição · fixadas · **enquete** (o blog não tem post de enquetes com screenshot; só aparece citada em changelog de texto)
- voz e vídeo > janela flutuante/popout · chamada de DM (toque)
- configurações do usuário > dispositivos · idioma · modo streamer
- configurações do servidor > visão geral · widget · modelo · banimentos · registro de auditoria · descoberta · excluir servidor
- configurações do canal > convites · integrações
- modais > entrar em servidor · página de convite · impulsionar
- mobile > permissões do sistema · widget

**Cobertura fraca** (1 ou 2 imagens): login por QR, verificação, cabeçalho do
canal, onboarding do servidor (1 GIF mobile + a tela de configuração), seletor de
GIF, busca, texto e imagens, atalhos de teclado, emojis e membros nas
configurações do servidor, convites, modais de criar servidor/canal/cargo/convite,
troca rápida, menu de toque longo e notificação push.

Por plataforma, faltam **web** e **web-mobile** (o blog quase só mostra o app
desktop), **tablet** e **Android** recente: as imagens Android são de 2020 e de
um post de performance de 2025. O mobile atual aparece sobretudo em iOS.

## Como reproduzir

Os scripts ficam em `../ferramentas/`, todos com o prefixo `blog-`:

- `blog-listar.mjs`: listagens com Load More.
- `blog-extrair.mjs`: extrai as mídias de cada post, com seção, alt, legenda e texto em volta.
- `blog-baixar-staging.mjs`: baixa as mídias para triagem.
- `blog-folhas.mjs`: gera as folhas de contato.
- `blog-publicar.mjs`: copia o que foi aprovado e grava o manifesto.
