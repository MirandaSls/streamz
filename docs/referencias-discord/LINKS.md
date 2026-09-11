# Catálogo de links — referências de UI do Discord

Só links, nada baixado. Aqui entra o que fica atrás de login, é pago ou grande demais
para trazer para a pasta (vídeos, bibliotecas inteiras de telas, arquivos Figma). As
imagens que deu para baixar estão em `desenvolvedores/`, `blog/`, `suporte/`, `lojas/`,
`publico/` e `tokens/`.

Todos os links foram abertos em 11/09/2026. "Abre" quer dizer que a página respondeu;
nos serviços pagos, a vitrine abre e o conteúdo completo pede conta. Os preços são os
que as páginas de planos mostravam nesse dia.

A lista está em ordem de utilidade para o Streamz, e cada item traz a categoria entre
colchetes.

---

## Os 10 mais úteis

1. **[Galeria] Mobbin — Discord iOS, Android e Web**
   - iOS: https://mobbin.com/apps/discord-ios-c976e767-6954-431c-8781-4dd82480d80f
   - Android: https://mobbin.com/apps/discord-android-faf15c28-fc30-4803-bdfa-73a73c206ee4/_/screens
   - Web (fluxos públicos de exemplo): onboarding https://mobbin.com/explore/flows/0cf60f93-ebd2-4ed0-8062-6519bb878d89 · configurações do app https://mobbin.com/explore/flows/fa0dd600-021f-4351-837a-03cc0e67dd94 · entrar em servidor https://mobbin.com/explore/flows/c097bc8c-1ed6-4ead-a5c1-28fc2c3354cf
   - **Cobre:** telas e fluxos gravados das três plataformas: login/registro, home, lista de canais, configurações de conversa, compartilhar tela no celular, criar evento, notificações, chamada recebida (web), atividade de whiteboard (web), guia do servidor.
   - **Preço:** *freemium*. As telas avulsas (`/explore/screens/...`) abrem sem conta. As páginas do app redirecionam para o login; o plano gratuito tem limite e o Pro é pago.
   - **Para o Streamz:** é a fonte mais completa e atualizada de telas **mobile** reais, justamente onde a pasta `desenvolvedores/` quase não tem nada.

2. **[Figma] Discord UI Kit — Muhsin Ataul**
   - https://www.figma.com/community/file/1087464748597886212/discord-ui-kit
   - **Cobre:** componentes do desktop agrupados em mensagens, servidor, app/bot, barra lateral, usuário e modais. Serve para montar mockups de bots e embeds. Atualizado há cerca de 8 meses, com 18,6 mil usuários. A página não diz se tem tema claro.
   - **Preço:** gratuito (CC BY 4.0).
   - **Para o Streamz:** é o kit mantido mais recente e o único pensado para UI de **bots** (embeds, componentes, perfil de app). Serve para medir espaçamentos e estados sem precisar de captura.

3. **[Galeria] Nicelydone — Discord (web)**
   - Telas: https://nicelydone.club/apps/discord · componentes: https://nicelydone.club/apps/discord/components · fluxos: https://nicelydone.club/apps/discord/flows
   - **Cobre:** 251 telas do app web, 29 telas de marketing, 50 componentes (48 modais/popovers, entre outros) e fluxos de onboarding, redefinição de senha etc.
   - **Preço:** conta gratuita com acesso limitado. O Pro custa US$ 15/mês (ou US$ 30 no plano de time), com desconto no anual.
   - **Para o Streamz:** é o melhor catálogo de **componentes isolados** do cliente web (modais, popovers, menus), já que o Streamz é web-first.

4. **[Galeria] Page Flows — Discord iOS e Web** (a antiga Screenlane agora redireciona para cá)
   - iOS: https://pageflows.com/ios/products/discord/ · Web: https://pageflows.com/web/products/discord/
   - Exemplos: editar perfil https://pageflows.com/post/desktop-web/updating-your-profile/discord/ · explorar servidores https://pageflows.com/post/desktop-web/exploring-discoverable-server/discord/
   - **Cobre:** gravações em vídeo dos fluxos, quebradas tela a tela: onboarding, busca, configurações, perfil e descoberta de servidores.
   - **Preço:** pago. Teste de 3 dias, depois US$ 39 por trimestre ou US$ 99 por ano; plano de time US$ 199/ano para 3 pessoas.
   - **Para o Streamz:** mostra as **transições e a ordem das telas**, que captura estática não mostra (ex.: o passo a passo do onboarding).

5. **[Ferramenta] Discohook — construtor e prévia de mensagens**
   - https://discohook.app · código: https://github.com/discohook/discohook
   - **Cobre:** prévia fiel de mensagem de webhook/bot com conteúdo, embeds, botões e o formato novo de **componentes** (layout v2), com editor ao lado.
   - **Preço:** gratuito, com código aberto.
   - **Para o Streamz:** dá para montar um payload da API de bots e comparar lado a lado com a renderização do Streamz. É o teste de compatibilidade visual mais barato que existe.

6. **[Código] discord-components (Skyra) — web components de mensagens**
   - Docs: https://discord-components.js.org/ · repositório: https://github.com/skyra-project/discord-components
   - **Cobre:** mensagem, cabeçalho de comando, embed com campos e rodapé, action row, botão, string select, modal, enquete, reações, resposta, thread, convite, mensagem de sistema, anexos. **Não tem** os componentes v2 (container, section, gallery).
   - **Preço:** gratuito (código aberto, com bindings React).
   - **Para o Streamz:** é uma implementação de referência de **estrutura HTML/CSS** de mensagem e embed, útil para conferir anatomia e nomes de parte.

7. **[Tokens] BetterDiscord — referência de variáveis CSS do Discord**
   - https://docs.betterdiscord.app/discord/variables · ambiente de tema: https://docs.betterdiscord.app/themes/introduction/environment
   - **Cobre:** despejo das variáveis CSS do `:root` do cliente (cores de fundo, texto, marca, gradientes, estados), mais as orientações de como os temas encontram classes pelo DevTools.
   - **Preço:** gratuito.
   - **Para o Streamz:** dá o **nome semântico** de cada cor/superfície do Discord, o que ajuda a batizar os tokens do `design.md` com a mesma granularidade.

8. **[Figma] Ultimate Discord Library — Pukima**
   - https://www.figma.com/community/file/1316822758717784787/ultimate-discord-library
   - **Cobre:** ícones, assets e mockups de UI. Traz variáveis com os mesmos nomes das do Discord e tema claro e escuro por *variable modes* ("agora com as cores novas"). Atualizado há cerca de 2 anos, antes do refresh de 2025. 7,1 mil usuários.
   - **Preço:** gratuito (CC BY 4.0).
   - **Para o Streamz:** é a melhor fonte de **ícones** e da paleta em modo claro/escuro. Os temas Ash/Onyx do refresh de 2025 ainda não entraram.

9. **[Vídeo oficial] "New Mobile Updates Are Here!" — canal Discord**
   - https://www.youtube.com/watch?v=kpy_KfSTeYg (05/12/2023, 21 s)
   - **Cobre:** o lançamento do **redesign mobile de 2023**: barra de abas (Servidores, Mensagens, Notificações, Você) e tema Midnight.
   - **Preço:** gratuito.
   - **Para o Streamz:** é a fonte oficial da navegação por abas do mobile, que o `TELAS.md` pede em "mobile > barra de abas".

10. **[Vídeo oficial] "Introducing the NEW Discord Game Overlay" — canal Discord**
    - https://www.youtube.com/watch?v=nieYrkCEKFU (25/03/2025, 3 min 49 s)
    - **Cobre:** o overlay novo por widgets e a barra de ações. Saiu no mesmo lançamento do **refresh do desktop** (temas Light/Ash/Dark/Onyx, densidade de UI, lista de canais redimensionável), que aparece nas tomadas do cliente.
    - **Preço:** gratuito.
    - **Para o Streamz:** é a única peça oficial em vídeo do cliente desktop pós-refresh. Serve de referência de movimento para painéis flutuantes (popout/PiP).

---

## Demais links, em ordem de utilidade

11. **[Figma] Discord iOS UI Kit — Bryan Buoncammino**
    - https://www.figma.com/community/file/1235699474804478241/discord-ios-ui-kit
    - **Cobre:** clone 1:1 do iOS; em 24/03/2025 ganhou DMs e a aba de amigos totalmente prototipadas. 784 usuários.
    - **Preço:** gratuito (CC BY 4.0).
    - **Para o Streamz:** é o kit mobile mais recente. Serve para as gavetas e a lista de DMs no web mobile.

12. **[Oficial] Blog do Discord — "Revamped Overlay & Refreshed Desktop" (Q1 2025)**
    - https://discord.com/blog/player-release-q12025
    - **Cobre:** o texto e as imagens do refresh do desktop (quatro temas, densidade Spacious/Default/Compact, controles de voz centralizados, overlay).
    - **Preço:** gratuito.
    - **Para o Streamz:** explica as decisões do refresh. As imagens são responsabilidade da pasta `blog/`.

13. **[Oficial] Suporte — "Mobile Visual Refresh: What's Changing"**
    - https://support.discord.com/hc/en-us/articles/42383370736023-Mobile-Visual-Refresh-What-s-Changing
    - **Cobre:** o refresh mobile que levou os quatro temas ao celular, a regra de formas ("pessoas são círculos, coisas são squircles"), os tiles de chamada e a barra de chat mais limpa.
    - **Preço:** gratuito. O curl leva 403 da Cloudflare, mas a página abre no navegador.
    - **Para o Streamz:** a regra de formas vale ouro para padronizar avatar e ícone de servidor.

14. **[Figma] Discord UI — Free UI Kit (Recreated) — figr.design**
    - https://www.figma.com/community/file/1235705031121618225/discord-ui-free-ui-kit-recreated
    - **Cobre:** o app web desktop, com templates e componentes. Atualizado há cerca de 3 anos, portanto antes do refresh. 11,7 mil usuários.
    - **Preço:** gratuito (CC BY 4.0).
    - **Para o Streamz:** base boa para o layout de 3 colunas. As cores já estão defasadas.

15. **[Figma] Discord UI Mockup — Barry Scheffka**
    - https://www.figma.com/community/file/994323951589690341/discord-ui-mockup
    - **Cobre:** as abas "Home" e "Explore Public Servers" do desktop, atualizadas em abril de 2023. 11,3 mil usuários.
    - **Preço:** gratuito.
    - **Para o Streamz:** referência para a home de amigos e para a descoberta de servidores.

16. **[Vídeo oficial] Recursos específicos — canal Discord**
    - Enquetes, 08/04/2024: https://www.youtube.com/watch?v=rS3N9k3NaGA
    - Fóruns, 14/09/2022: https://www.youtube.com/watch?v=y4MxuHNIIg0
    - Soundboard, 13/04/2023: https://www.youtube.com/watch?v=DJgQWMx_WQM
    - Perfis por servidor, 15/11/2023: https://www.youtube.com/watch?v=dMhdGErYnpI
    - PiP redimensionável no desktop, 15/08/2024: https://www.youtube.com/watch?v=ehq2SQHqSyE
    - Stage com texto e vídeo, 14/02/2023: https://www.youtube.com/watch?v=zabdmpYznnU
    - Chat de texto na voz, 01/06/2022: https://www.youtube.com/watch?v=IlEAb60EYWU
    - Temas personalizados, 08/09/2025: https://www.youtube.com/watch?v=tzzo8aKtO04
    - Novidades do outono de 2023: https://www.youtube.com/watch?v=prqNIjn6fe8
    - Atividades no mobile, 15/03/2023: https://www.youtube.com/watch?v=hE87_XVPNFE
    - Apps e App Directory: https://www.youtube.com/watch?v=UDwRoz4MAOs (2024) e https://www.youtube.com/watch?v=voGr-SA_b4Q (2022)
    - Canal completo: https://www.youtube.com/@discord
    - **Cobre:** tomadas curtas (14 s a 90 s) de cada recurso no cliente.
    - **Preço:** gratuito.
    - **Para o Streamz:** um vídeo por item do checklist (enquete, fórum, soundboard, stage, atividades). Não existe vídeo oficial de "tour" do refresh do desktop; o mais próximo é o do overlay (item 10).

17. **[Datamining] Discord Previews**
    - https://discordpreviews.com/ (redes: X, Bluesky, Mastodon; servidor com 42 mil membros)
    - **Cobre:** capturas de experimentos e mudanças de UI assim que entram no cliente, inclusive as várias versões do refresh de 2025.
    - **Preço:** gratuito.
    - **Para o Streamz:** mostra a **evolução** de cada tela; boa para decidir entre layout antigo e novo.

18. **[Datamining] Discord-Datamining (GitHub)**
    - https://github.com/Discord-Datamining/Discord-Datamining
    - **Cobre:** diffs de cada build do Canary com strings de UI e comentários com capturas. É **grande** (histórico de anos).
    - **Preço:** gratuito.
    - **Para o Streamz:** os textos oficiais de UI em inglês ajudam a traduzir rótulos com fidelidade.

19. **[Galeria] Refero — Discord (site)**
    - https://refero.design/156-discord.com
    - **Cobre:** páginas do **site de marketing** discord.com (6 visíveis, mais 34 atrás de login), não do app.
    - **Preço:** *freemium*; ver tudo exige conta e há planos pagos.
    - **Para o Streamz:** só serve para a landing page e as páginas públicas.

20. **[Wiki de fãs] Discord Wiki (Fandom)**
    - https://discord.fandom.com/wiki/Discord_Wiki
    - **Cobre:** cerca de 440 páginas por categoria: recursos, contas, bots, emblemas, mensagens, moderação, recursos pagos e de servidor, *easter eggs*.
    - **Preço:** gratuito.
    - **Para o Streamz:** checklist de recursos e nomes, e às vezes datas de lançamento. Tem poucas imagens atuais.

21. **[Mod/Tema] Vencord — documentação**
    - https://docs.vencord.dev/
    - **Cobre:** a API de plugins, com nomes das superfícies do cliente (menus de contexto, comandos de barra, botões de ação de mensagem, *message accessories*).
    - **Preço:** gratuito.
    - **Para o Streamz:** dá nome às "zonas" de extensão da mensagem, útil ao planejar onde entram os componentes de bot.

22. **[Mod/Tema] Mapas de classes CSS do cliente**
    - SyndiShanX Update-Classes: https://github.com/SyndiShanX/Update-Classes (ferramenta: https://syndishanx.github.io/Website/Update_Classes.html)
    - discord-update-classnames: https://github.com/fedeericodl/discord-update-classnames
    - LeafyLuigi discord-themes, lista de classes em mapa SCSS: https://github.com/LeafyLuigi/discord-themes
    - **Cobre:** pares de classes antigas e novas do cliente web, com o nome legível do componente antes do hash.
    - **Preço:** gratuito.
    - **Para o Streamz:** um dicionário de **nomes de componentes** do Discord (`chatContent`, `membersWrap`…). Ajuda a batizar componentes React com o mesmo recorte.

23. **[Oficial] Design guidelines do Discord Social SDK**
    - https://docs.discord.com/developers/discord-social-sdk/design-guidelines
    - **Cobre:** cerca de 80 slides em 4K sobre lista de amigos unificada, DMs, status/presença, canais vinculados, login, contas provisórias e consoles. Mostram UI **de jogo** integrada ao Discord, não o cliente.
    - **Preço:** gratuito. Não foram baixados: pesados e fora do escopo "cliente".
    - **Para o Streamz:** a matriz de status e presença (StatusPresence) é a parte aproveitável.

24. **[Figma] Arquivos mais antigos (histórico)**
    - "Discord New Mobile UI", mockup do mobile novo de 2023, 2,8 mil usuários: https://www.figma.com/community/file/1235275810279752269/discord-new-mobile-ui
    - "Discord UI Design", marcado com dark e light mode, cerca de 4 anos: https://www.figma.com/community/file/1174716122520306480/discord-ui-design
    - "👾 Discord" (Spencer Camp), tirado do web app pelo DevTools, cerca de 7 anos: https://www.figma.com/community/file/818668544591341056
    - "Discord UI Components (Community)", incompleto: https://www.figma.com/community/file/1243200669763057143/discord-ui-components-community
    - **Preço:** todos gratuitos (CC BY 4.0).
    - **Para o Streamz:** consulta pontual; não servem como referência de cor.

25. **[Galeria] App Fuel — onboarding do Discord (mobile)**
    - https://theappfuel.com/examples/discord_onboarding
    - **Cobre:** o fluxo de registro e o onboarding do produto no mobile, com comentários de UX.
    - **Preço:** página pública gratuita.
    - **Para o Streamz:** referência de "autenticação > registro" e "mobile > onboarding do app".

26. **[Clone OSS] Spacebar (antigo Fosscord)**
    - Servidor: https://github.com/spacebarchat/server (2,2 mil estrelas, ativo) · cliente: https://github.com/spacebarchat/client · docs: https://docs.spacebar.chat/
    - **Cobre:** reimplementação da API do Discord, compatível com bots e clientes existentes. O README não traz capturas.
    - **Preço:** gratuito.
    - **Para o Streamz:** não vale como referência visual, mas é o **projeto mais próximo da compatibilidade com a API de bots** que o Streamz busca. Vale só para comparar.

27. **[Clone OSS] Stoat (antigo Revolt), a referência de arquitetura do Streamz**
    - https://stoat.chat/ · web: https://github.com/stoatchat/for-web · web legado (Revite): https://github.com/stoatchat/for-legacy-web
    - **Cobre:** o site tem capturas do app; os READMEs, não.
    - **Preço:** gratuito.
    - **Para o Streamz:** comparação direta com a referência de produto citada no `CLAUDE.md`.

28. **[Clone OSS] Rediscord — Discord UI recriada em Next.js + Tailwind**
    - Demo ao vivo: https://rediscord-gamma.vercel.app/ · código: https://github.com/igorm84/rediscord
    - **Cobre:** home de amigos (Online/All/Pending/Blocked/Add), lista de DMs, "Active Now" e status.
    - **Preço:** gratuito.
    - **Para o Streamz:** usa a mesma stack do Streamz. Dá para inspecionar o DOM e o Tailwind de uma recriação fiel da home.

29. **[Clone OSS] Outros com capturas**
    - DiscordJetpackCompose, clone do app **Android** com cerca de 27 capturas no README (2022): https://github.com/oianmol/DiscordJetpackCompose
    - Valkyrie, React + Go: https://github.com/sentrionic/Valkyrie
    - React-Discord-Clone: https://github.com/ericellb/React-Discord-Clone
    - **Preço:** todos gratuitos.
    - **Para o Streamz:** comparação apenas. O de Jetpack Compose é o único com várias telas mobile.

---

## Pesquisados e deixados de fora

- **UI Sources**: foi comprada pela ScreensDesign (https://screensdesign.com/), que é focada em iOS. Não achei página do Discord lá.
- **Screenlane**: `screenlane.com/screens/product/discord/` redireciona para a Page Flows (item 4).
- **Blog da GetStream (clone em Next.js)**: o link do tutorial dá 404. O repositório `GetStream/discord-clone-nextjs` existe, mas não tem capturas.
- **Vídeos de terceiros no YouTube** sobre o "UI novo de 2025": existem vários, mas são opinião ou tutorial de reverter o visual. Não entraram.
