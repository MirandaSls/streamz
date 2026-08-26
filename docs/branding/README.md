# Marca — de onde vem cada arquivo do produto

`marca/` é o pacote v1.0 entregue pelo design (não editar à mão; ele é a fonte
da verdade do desenho). `descartado/` guarda identidades que foram substituídas.
Este arquivo diz como cada peça do pacote vira asset dentro do app, e como
regenerar. A decisão que levou a esta identidade está em
[ADR-0004](../adr/0004-identidade-visual-volt-lime.md).

## O símbolo tem quatro cópias, de propósito

| Onde | Formato | Para quê |
|---|---|---|
| `marca/logo-simbolo-limao.svg` | SVG | **fonte da verdade** do desenho |
| `apps/web/components/ui/Marca.tsx` | React | símbolo na tela, em `currentColor` |
| `apps/web/app/icon.svg` | SVG | favicon |
| `apps/desktop/logo.svg` | SVG | entrada do `tauri icon` |

Mudou o traço? Mude no pacote primeiro, depois propague para as três cópias e
regenere os PNGs abaixo.

O `Marca.tsx` recorta o "Z" por **máscara**, não por `fill-rule="evenodd"`: as
três formas do recorte se sobrepõem, e com evenodd a sobreposição voltaria a
preencher, deixando uma cunha dentro da barra.

## PNGs — como regenerar

Os PNGs do app **não** são gerados no build; são assets versionados. Todos saem
do `tauri icon`, que rasteriza o SVG:

```bash
cd apps/desktop
pnpm exec tauri icon logo.svg          # regenera src-tauri/icons/ inteiro
```

Depois copie os três que a web usa:

```bash
cp src-tauri/icons/ios/AppIcon-60x60@3x.png      ../web/app/apple-icon.png      # 180
cp src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png ../web/public/icone-192.png
cp src-tauri/icons/icon.png                      ../web/public/icone-512.png
```

> O comentário dentro do `logo.svg` não pode conter `--`: o parser XML do
> `tauri icon` recusa o arquivo com `InvalidComment`.

## `apps/web/app/opengraph-image.png`

Imagem de compartilhamento (1200×630). É PNG porque raspador de link (Slack,
Discord, WhatsApp, Facebook) não renderiza SVG em `og:image`, e é **arquivo
estático** porque a web também é buildada com `output: "export"` para o Tauri,
onde rota de imagem não sobrevive.

Reproduz o `marca/og-image-1200x630.svg` com a Archivo de verdade — o `<text>`
do pacote dependeria da fonte instalada em quem abrisse o arquivo.

Para regenerar é preciso rasterizar SVG + texto. O caminho usado foi o
`ImageResponse` do `next/og` (satori + resvg, já embutidos no Next), com a
Archivo baixada do Google Fonts **sem** enviar `User-Agent` — com user-agent de
navegador o Google devolve woff2, que o satori não lê; sem nenhum, devolve ttf.

> **No Windows o `next/og` está quebrado** (Next 14.2.35): ele monta o caminho
> das próprias fontes com `path.join(import.meta.url, …)`, o que vira
> `.\file:\C:\…` e estoura em `fileURLToPath`. Em Linux funciona. Se precisar
> gerar no Windows, troque as três chamadas
> `fileURLToPath(join(import.meta.url, "../X"))` por
> `fileURLToPath(new URL("./X", import.meta.url))` em
> `node_modules/…/next/dist/compiled/@vercel/og/index.node.js`, gere, e desfaça.
> Foi por causa desse bug que a imagem virou asset em vez de rota.

## Regras de uso que valem no código

Estão no pacote (`marca/LEIA-ME.txt`) e viraram sistema no
`apps/web/tailwind.config.ts`:

- **Limão só sobre escuro.** Nunca limão como texto sobre Paper.
- **Texto e ícone sobre `accent` são `accent-ink`**, nunca branco — branco sobre
  Volt Lime dá 1,57:1.
- **Área de respiro** = 30% da altura da marca; tamanho mínimo 16px digital.
- Sem gradiente, sombra, rotação ou distorção sobre a marca.
- Tracking −4,5% é de display: só a partir de 24px. Em caixa-alta pequena o
  tracking é **positivo**.
