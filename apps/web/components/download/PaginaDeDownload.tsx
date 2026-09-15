"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { rotuloPlataforma, type DownloadCatalogo, type DownloadDisponivel } from "@streamz/shared";
import MarcaLockup from "@/components/ui/MarcaLockup";
import { Download, RefreshCw } from "@/components/ui/icones";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { BotaoDaPagina, LinkDaPagina } from "@/components/download/BotaoDaPagina";
import { ComposicaoDoApp } from "@/components/download/ComposicaoDoApp";
import EtapaDaSenha from "@/components/download/EtapaDaSenha";
import FundoDoTopo from "@/components/download/FundoDoTopo";
import {
  ID_DO_TERMINAL_MAC,
  InstalarPeloTerminal,
  notaDeInstalacao,
} from "@/components/download/InstalacaoNoSistema";
import { SecaoDePlataformas } from "@/components/download/SecaoDePlataformas";
import {
  dataDoInstalador,
  detectarSistema,
  disponivelPara,
  ofertaDoTopo,
  plataformaDaUrl,
  plataformasPorExtenso,
  type EstadoDoCatalogo,
  type OfertaDoTopo,
  type SistemaDetectado,
} from "@/components/download/plataformas";

/**
 * Download dos apps, no molde da página de download do Discord
 * (`referencias-discord/publico/<perfil>/15-download-inteira.png`): topo com
 * título grande, subtítulo com as plataformas e o botão "Baixar para <sistema
 * detectado>", a imagem do app, e uma seção por família de plataforma abaixo.
 *
 * **A proteção por senha é a mesma da página antiga.** Nenhum botão daqui
 * baixa nada: todos abrem a etapa da senha (`EtapaDaSenha`), que manda a senha
 * para `POST /api/downloads/token` e só então navega para o link que a API
 * devolve. O catálogo (`GET /api/downloads`) diz só para quais sistemas existe
 * instalador, com tamanho e data — sem nome de arquivo nem URL.
 *
 * **É a raiz do site no navegador** (`streamz.chat`), montada por
 * `app/page.tsx` — quem chega pelo endereço puro quer o app. Por isso quem só
 * quer o chat tem "Abrir no navegador" logo abaixo do botão principal (sem ele
 * teria de saber `/app` de cor), e o "Entrar" do cabeçalho vai a `/login`, não
 * a `/`, que é esta mesma página. `/download` só redireciona para cá.
 *
 * Plataformas: as de `DOWNLOAD_PLATAFORMAS` (windows, macos, linux, android —
 * o android é o `.apk` instalado à mão, não a Play). Sem instalador publicado,
 * o botão fica "em breve". iOS não existe: nenhum botão de loja.
 *
 * Medidas do topo (capturas com escala conhecida em `publico/`: desktop 1440
 * @2x, Pixel 7 412 @2,625):
 * - **Título**: versal de 50 e passo de 65 no desktop (coluna x=1135: "B" em
 *   y=367–467 @2x; o "D" da segunda linha começa em y=497) → 70px com a versal
 *   de 0,714 da Noto Sans, `leading-[65px]`. Pixel 7: versal de 28 (74px
 *   @2,625, x=310 y=309–382) e passo de 40 (segunda linha em y=414) → 40px/40.
 *   Caixa alta em `font-headline font-extrabold` (Noto Sans 800 no lugar da ABC
 *   Ginto Nord, design.md). Largura do bloco no desktop: x=655–2228 @2x → ~790.
 * - **Subtítulo**: passo de 26 no desktop (linhas em y=945 e 997 @2x) e haste
 *   mais alta de 29px @2x (ascendente, ~14,5) → 20px, `text-text-lg` com
 *   `leading-[26px]`. Pixel 7: passo de 22 e haste de 30px @2,625 (11,4) →
 *   16px, `leading-[22px]`. Cor: branco sobre o degradê → `text-text-default`.
 * - **Ritmo**: título → subtítulo ≈24; subtítulo → botão ≈40 (base do
 *   subtítulo em y≈1015 @2x, botão em 1106); botão → imagem 120 no desktop
 *   (botão termina em y=601 CSS, imagem começa em ≈722) e ≈56 no Pixel 7.
 * - **Cabeçalho**: logo a 41 da esquerda e "Entrar" a 40 da direita, centro da
 *   linha em y≈60 (desktop); no Pixel 7 o centro fica em y≈31. Aqui 120 e 64
 *   de altura. O menu de links do Discord (Nitro, Descobrir, Carreiras…) não
 *   tem par no Streamz e não entra; no celular, sem menu, some o hambúrguer.
 * - **Topo**: o título começa ≈56 abaixo do cabeçalho no desktop (versal em
 *   y=183) e ≈48 no Pixel 7 (versal em y≈118).
 */
export default function PaginaDeDownload() {
  const [estado, setEstado] = useState<EstadoDoCatalogo>({ tipo: "carregando" });
  const [sistema, setSistema] = useState<SistemaDetectado>(null);
  const [escolhido, setEscolhido] = useState<DownloadDisponivel | null>(null);
  // a cada "tentar de novo" o efeito do catálogo roda outra vez
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: "carregando" });
    api
      .downloadCatalogo()
      .then((catalogo) => {
        if (vivo) setEstado({ tipo: "pronto", catalogo });
      })
      .catch(() => {
        // a página antiga tratava a falha como "nenhum instalador" e deixava
        // todos os botões apagados sem dizer por quê; agora é um estado próprio,
        // com "tentar de novo"
        if (vivo) setEstado({ tipo: "erro" });
      });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  // `navigator` e `location` só existem no cliente (a web é exportada estática)
  useEffect(() => {
    setSistema(
      plataformaDaUrl(window.location.search) ??
        detectarSistema(navigator.userAgent, navigator.maxTouchPoints),
    );
  }, []);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  const catalogo = estado.tipo === "pronto" ? estado.catalogo : null;
  const oferta = ofertaDoTopo(estado, sistema);
  const carregando = estado.tipo === "carregando";

  return (
    <div className="min-h-[100dvh] bg-background-base-lowest text-text-default">
      <div className="relative">
        <FundoDoTopo />

        {/* Celular: as áreas seguras entram no padding (o `viewportFit: "cover"`
            do layout faz o `env()` responder), para a marca não cair atrás do
            entalhe nem, deitado, atrás da câmera. */}
        <header className="relative mx-auto flex h-[120px] max-w-[1920px] items-center justify-between px-10 celular:h-[calc(64px+env(safe-area-inset-top))] celular:pl-[max(1.5rem,env(safe-area-inset-left))] celular:pr-[max(1.5rem,env(safe-area-inset-right))] celular:pt-[env(safe-area-inset-top)]">
          <Link href="/" aria-label="Streamz, início" className="flex min-h-[44px] items-center rounded-lg">
            {/* logo do Discord: ~145×22 nas duas capturas; o símbolo de 22 dá a
                mesma altura */}
            <MarcaLockup size={22} className="text-text-strong" />
          </Link>
          <LinkDaPagina href="/login" medida="compacto">
            Entrar
          </LinkDaPagina>
        </header>

        <section
          aria-labelledby="download-titulo"
          className="relative flex flex-col items-center px-10 pt-[56px] text-center celular:pl-[max(1.5rem,env(safe-area-inset-left))] celular:pr-[max(1.5rem,env(safe-area-inset-right))] celular:pt-[48px]"
        >
          <h1
            id="download-titulo"
            className="max-w-[790px] font-headline text-[70px] font-extrabold uppercase leading-[65px] text-text-strong celular:text-[40px] celular:leading-[40px]"
          >
            Baixe o app do Streamz
          </h1>
          <p className="mt-6 max-w-[800px] text-text-lg leading-[26px] text-text-default celular:text-text-md celular:leading-[22px]">
            Chat de comunidade com voz, vídeo e compartilhamento de tela. Para {plataformasPorExtenso()}.
          </p>

          {/* `celular:w-full`: dá largura definida ao contêiner no celular, para
              a coluna de botões do estado "lista" (abaixo) poder ser
              `w-full` de verdade — porcentagem de largura só resolve contra um
              pai com largura definida, e sem isto os três botões ficavam cada
              um do tamanho do próprio texto. Não muda nada nos outros estados
              (um botão só), que continuam centrados pelo `items-center`. */}
          <div className="mt-10 flex min-h-[48px] flex-col items-center celular:w-full">
            <AcaoDoTopo oferta={oferta} aoEscolher={setEscolhido} aoTentarDeNovo={tentarDeNovo} />
          </div>

          {/* Fora do `AcaoDoTopo` só nos estados em que ele não oferece o
              navegador como ação principal (sem instalador, ele já oferece). */}
          {oferta.tipo !== "nao-configurado" && oferta.tipo !== "vazio" ? (
            <p className="mt-4 text-text-sm text-text-muted">
              Prefere não instalar?{" "}
              <Link href="/app" className="font-medium text-text-link hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center">
                Abrir no navegador
              </Link>
            </p>
          ) : null}

          <ComposicaoDoApp className="mt-[120px] max-w-[944px] celular:mt-[56px] celular:max-w-[560px]" />
        </section>
      </div>

      {/* No celular a seção "celular" vem primeiro, como no Discord do iPhone
          (`web-mobile-ios/15-download-inteira.png`: o cartão do telefone logo
          depois da imagem do app, o de computador só abaixo). */}
      <main
        id="plataformas"
        className="flex flex-col gap-[120px] px-10 pb-[120px] pt-[232px] celular:gap-[80px] celular:pb-[80px] celular:pl-[max(1.5rem,env(safe-area-inset-left))] celular:pr-[max(1.5rem,env(safe-area-inset-right))] celular:pt-[112px]"
      >
        <SecaoDePlataformas
          id="computador"
          titulo="Baixe para computador"
          texto="O Streamz numa janela própria, com notificações do sistema e atualização automática."
          imagem="computador"
          carregando={carregando}
          aoEscolher={setEscolhido}
          plataformas={(["windows", "macos", "linux"] as const).map((p) => ({
            plataforma: p,
            disponivel: disponivelPara(catalogo, p),
          }))}
          extra={<InstrucoesDoComputador catalogo={catalogo} />}
        />
        <SecaoDePlataformas
          id="celular"
          titulo="Baixe para celular"
          texto="O app de Android é um .apk instalado à mão, fora da Play: abra o arquivo baixado e permita a instalação quando o sistema pedir. Depois disso ele se atualiza sozinho."
          imagem="celular"
          imagemAntes
          className="celular:order-first"
          carregando={carregando}
          aoEscolher={setEscolhido}
          plataformas={[{ plataforma: "android", disponivel: disponivelPara(catalogo, "android") }]}
          nota="Para iPhone e iPad ainda não há app."
        />
      </main>

      <footer className="border-t border-border-subtle px-10 py-10 celular:pb-[max(2.5rem,env(safe-area-inset-bottom))] celular:pl-[max(1.5rem,env(safe-area-inset-left))] celular:pr-[max(1.5rem,env(safe-area-inset-right))]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6">
          <MarcaLockup size={22} className="text-text-strong" />
          <nav aria-label="Conta" className="flex gap-2">
            <Link
              href="/login"
              className="inline-flex h-[44px] items-center rounded-lg px-3 text-text-md font-medium text-text-link hover:underline"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="inline-flex h-[44px] items-center rounded-lg px-3 text-text-md font-medium text-text-link hover:underline"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </footer>

      {escolhido ? <EtapaDaSenha disponivel={escolhido} aoFechar={() => setEscolhido(null)} /> : null}
    </div>
  );
}

/** O que fica embaixo do subtítulo, para cada estado do catálogo. */
function AcaoDoTopo({
  oferta,
  aoEscolher,
  aoTentarDeNovo,
}: {
  oferta: OfertaDoTopo;
  aoEscolher: (disponivel: DownloadDisponivel) => void;
  aoTentarDeNovo: () => void;
}) {
  switch (oferta.tipo) {
    case "carregando":
      return (
        <BotaoDaPagina disabled aria-busy icone={<Download size={24} />}>
          Carregando…
        </BotaoDaPagina>
      );

    case "erro":
      return (
        <>
          <p role="alert" className="mb-4 max-w-[480px] text-text-md text-text-feedback-critical">
            Não foi possível carregar a lista de instaladores. Confira a conexão e tente de novo.
          </p>
          <BotaoDaPagina onClick={aoTentarDeNovo} icone={<RefreshCw size={20} />}>
            Tentar de novo
          </BotaoDaPagina>
        </>
      );

    case "nao-configurado":
      return (
        <>
          <p className="mb-4 max-w-[480px] text-text-md text-text-default">
            <strong className="font-semibold text-text-strong">Download indisponível.</strong> Este servidor
            ainda não publicou o app de desktop. Enquanto isso, dá para usar o Streamz no navegador.
          </p>
          <LinkDaPagina href="/app">Abrir no navegador</LinkDaPagina>
        </>
      );

    case "vazio":
      return (
        <>
          <p className="mb-4 max-w-[480px] text-text-md text-text-default">
            Nenhum instalador foi publicado ainda. Enquanto isso, dá para usar o Streamz no navegador.
          </p>
          <LinkDaPagina href="/app">Abrir no navegador</LinkDaPagina>
        </>
      );

    case "principal": {
      const { disponivel } = oferta;
      const data = dataDoInstalador(disponivel.atualizadoEm);
      return (
        <>
          <BotaoDaPagina icone={<Download size={24} />} onClick={() => aoEscolher(disponivel)}>
            Baixar para {rotuloPlataforma(disponivel.plataforma)}
          </BotaoDaPagina>
          <p className="mt-3 text-text-sm text-text-muted">
            {formatBytes(disponivel.tamanho)}
            {data ? ` · atualizado em ${data}` : ""}
          </p>
          {/* No Mac o Terminal é o caminho recomendado (sem o bloqueio do
              Gatekeeper), mas o bloco com o comando mora na seção "computador":
              no topo ele quebraria o desenho do Discord, e duas cópias dariam
              dois ids iguais. Daqui só a âncora. */}
          {disponivel.plataforma === "macos" ? (
            <a
              href={`#${ID_DO_TERMINAL_MAC}`}
              className="mt-2 text-text-sm font-medium text-text-link hover:underline celular:inline-flex celular:min-h-[44px] celular:items-center"
            >
              Recomendado no Mac: instalar pelo Terminal
            </a>
          ) : null}
        </>
      );
    }

    case "lista": {
      const { sistema, disponiveis } = oferta;
      const aviso =
        sistema === "ios"
          ? "Ainda não há app para iPhone e iPad. Escolha outra plataforma:"
          : sistema
            ? `Ainda não há instalador para ${rotuloPlataforma(sistema)}. Escolha outra plataforma:`
            : "Escolha a plataforma:";
      return (
        <>
          <p className="mb-4 max-w-[480px] text-text-md text-text-default">{aviso}</p>
          {/* No desktop os botões ficam numa linha centralizada — cada um do
              tamanho do próprio texto, como o resto da página. No celular isso
              empilhava três larguras diferentes centralizadas uma sob a outra
              (visto na captura `m-download.png`); a lista de plataformas do
              Discord no celular (`publico/web-mobile-ios/15-download-*.png`)
              é uma coluna de botões da largura da coluna, não do texto — por
              isso `celular:w-full` em cada botão dentro de uma coluna
              (`celular:flex-col celular:items-stretch`). */}
          <div className="flex flex-wrap justify-center gap-4 celular:w-full celular:flex-col celular:items-stretch celular:gap-2">
            {disponiveis.map((d) => (
              <BotaoDaPagina
                key={d.plataforma}
                icone={<Download size={24} />}
                onClick={() => aoEscolher(d)}
                className="celular:w-full"
              >
                Baixar para {rotuloPlataforma(d.plataforma)}
              </BotaoDaPagina>
            ))}
          </div>
        </>
      );
    }
  }
}

/**
 * O que vem abaixo dos botões da seção "computador": o comando do Terminal
 * (só com instalador de macOS publicado — o script baixa esse mesmo arquivo) e
 * a instrução de pós-download de cada sistema que tem instalador. As mesmas
 * instruções reaparecem no "O download começou" da `EtapaDaSenha`.
 */
function InstrucoesDoComputador({ catalogo }: { catalogo: DownloadCatalogo | null }) {
  const temMac = disponivelPara(catalogo, "macos") !== null;
  const notas = (["macos", "linux"] as const)
    .filter((p) => disponivelPara(catalogo, p) !== null)
    .map((p) => ({ plataforma: p, nota: notaDeInstalacao(p) }));
  if (!temMac && notas.length === 0) return null;
  return (
    <div className="mt-8 flex w-full max-w-[560px] flex-col items-center gap-6 lg:items-start">
      {temMac ? <InstalarPeloTerminal /> : null}
      {notas.length > 0 ? (
        <ul className="flex flex-col gap-2 text-text-sm text-text-muted">
          {notas.map(({ plataforma, nota }) => (
            <li key={plataforma}>{nota}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
