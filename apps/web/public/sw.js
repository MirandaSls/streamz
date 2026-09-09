/*
 * Service worker do Streamz — deliberadamente **sem cache nenhum**.
 *
 * ## Por que ele existe
 *
 * Só por um motivo: um site sem service worker não é instalável. O Chrome
 * exige um SW registrado com um ouvinte de `fetch` para oferecer "Instalar
 * app" (e para o `beforeinstallprompt` chegar). Ele não está aqui para deixar
 * o app mais rápido nem para funcionar sem rede.
 *
 * ## Por que ele NÃO cacheia HTML
 *
 * Porque o Streamz já tem checagem de versão própria, e ela é incompatível com
 * um HTML servido do disco do navegador:
 *
 *  - o app de desktop pergunta ao updater do Tauri, que consulta
 *    `/api/updates`, se há versão nova;
 *  - a web serve `index.html` novo a cada publicação, e é assim que o
 *    navegador recebe o bundle novo.
 *
 * Um SW que guardasse o documento (o padrão "network falling back to cache",
 * ou pior, "cache first") deixaria a pessoa presa numa versão antiga do app
 * mesmo depois de a publicação ter ido ao ar — e falando com uma API que já
 * mudou. O sintoma clássico é "recarreguei e continua a versão velha", que só
 * some quando alguém desinstala o SW. Nós teríamos duas máquinas de release
 * discordando; a que ficou é a que já existe.
 *
 * O mesmo vale para JS/CSS: os arquivos do Next já vêm com hash no nome e com
 * `Cache-Control` imutável, então o cache do navegador faz esse trabalho sem
 * precisar de código nosso. O que sobraria para o SW é justamente a parte
 * perigosa.
 *
 * ## O que ele faz, então
 *
 *  - `install`: `skipWaiting()`, para uma versão nova deste arquivo assumir
 *    na hora em vez de esperar todas as abas fecharem — sem estado guardado,
 *    não há motivo para a espera.
 *  - `activate`: `clients.claim()` (assume as abas já abertas, senão a
 *    primeira visita fica sem SW controlando e o Chrome não considera o site
 *    instalável até o segundo carregamento) e **apaga todos os caches**. Isso
 *    é a chave geral: se algum dia entrar aqui um SW que cacheia, ou se
 *    alguém tiver ficado com um de uma versão anterior, publicar este arquivo
 *    limpa o que ficou.
 *  - `fetch`: um ouvinte que **não chama `respondWith`**. É o mínimo que o
 *    Chrome exige, e é passthrough de verdade — o navegador segue para a rede
 *    como se o SW não existisse. `event.respondWith(fetch(event.request))`
 *    pareceria equivalente e não é: refazer a requisição pelo `fetch` do
 *    worker atrapalha requisições com `Range` (áudio e vídeo do app) e
 *    duplica o corpo de uploads.
 *
 * Não é registrado dentro do app de desktop: ver `deveRegistrarServiceWorker`
 * em `apps/web/lib/instalacao.ts`. Este arquivo mora em `public/`, então o
 * export estático o copia para `out/` e ele acaba dentro do bundle do Tauri —
 * onde fica inerte, porque ninguém o registra.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
      await self.clients.claim();
    })(),
  );
});

/*
 * Sem corpo de propósito — ver o cabeçalho. Não apagar achando que é código
 * morto: sem um ouvinte de `fetch` registrado, o Chrome não considera o site
 * instalável e o banner de instalação para de aparecer.
 */
self.addEventListener("fetch", () => {});
