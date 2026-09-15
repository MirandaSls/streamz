"use client";

import { SPOILER_PREFIX, type Attachment } from "@streamz/shared";
import { Eye, EyeOff, FileText, Pencil, Trash2 } from "@/components/ui/icones";
import { BotaoDeIcone } from "@/components/ui/primitivos";

/** Um arquivo escolhido, ainda não enviado — dá para renomear e marcar spoiler. */
export interface AnexoLocal {
  id: string;
  file: File;
  /** nome editável, sem o prefixo de spoiler (que entra na hora do envio). */
  nome: string;
  spoiler: boolean;
  /** URL local para a prévia de imagem (revogada ao remover). */
  previewUrl?: string;
  /** 0–100 enquanto sobe; -1 antes de começar. */
  progresso: number;
}

/** Arquivo com o nome final: o prefixo de spoiler é parte do nome, como no Discord. */
export function comNomeFinal(anexo: AnexoLocal): File {
  const nome = anexo.spoiler ? `${SPOILER_PREFIX}${anexo.nome}` : anexo.nome;
  if (nome === anexo.file.name) return anexo.file;
  return new File([anexo.file], nome, { type: anexo.file.type });
}

/**
 * Lado do cartão: `.upload_aa605f{min/max-width:200px;min/max-height:200px}`
 * (`css-bruto/189281.5822d78d11927f2a.css`). Era 216, sem origem.
 */
const LADO = 200;
/**
 * No celular, 128. 200 é meia tela de um telefone de 390 e, com o teclado
 * aberto (janela de ~460), a faixa de prévia sozinha comia metade do que sobrava
 * da conversa. 128 mostra três anexos na largura com as ações sempre visíveis.
 * Não medido no Discord móvel.
 */
const LADO_MOBILE = 128;

/**
 * A faixa de anexos pendentes dentro da caixa do composer.
 *
 * `.channelAttachmentArea_b77158{display:flex;gap:24px;padding:20px 10px 10px}`
 * e `:last-child{padding-inline-end:30px}` (`css-bruto`). Os 20px de cima não
 * são respiro gratuito: é onde cabe a barra de ações, que o Discord desloca
 * `translate(25%,-25%)` para fora do canto do cartão. Uma linha só, com rolagem
 * horizontal — quebrar em várias empurrava a timeline a cada arquivo.
 *
 * A borda de baixo, separando os anexos do texto, **não foi medida** (não achei
 * a regra no CSS capturado nem um print 1:1 com anexo pendente); fica a
 * `border-subtle`, que é a do `.stackedBars__74017` logo acima.
 */
export function AreaDeAnexos({
  pendentes,
  prontos,
  compacto,
  onRemoverPendente,
  onRenomear,
  onSpoiler,
  onRemoverPronto,
}: {
  pendentes: AnexoLocal[];
  /** já enviados (o GIF escolhido no seletor): só dá para tirar. */
  prontos: Attachment[];
  compacto: boolean;
  onRemoverPendente: (id: string) => void;
  onRenomear: (anexo: AnexoLocal) => void;
  onSpoiler: (id: string) => void;
  onRemoverPronto: (id: string) => void;
}) {
  return (
    <ul
      aria-label="Anexos a enviar"
      className={`flex overflow-x-auto border-b border-border-subtle ${
        compacto ? "gap-2 p-2" : "gap-6 pb-2.5 pl-2.5 pr-[30px] pt-5"
      }`}
    >
      {pendentes.map((anexo) => (
        <li key={anexo.id} className="shrink-0">
          <CartaoDeAnexo
            nome={anexo.nome}
            compacto={compacto}
            imagem={anexo.previewUrl}
            borrado={anexo.spoiler}
            progresso={anexo.progresso}
            acoes={
              <>
                <AcaoDoCartao
                  rotulo={anexo.spoiler ? "Não marcar como spoiler" : "Marcar como spoiler"}
                  compacto={compacto}
                  icone={anexo.spoiler ? <EyeOff size={20} /> : <Eye size={20} />}
                  onClick={() => onSpoiler(anexo.id)}
                  ativo={anexo.spoiler}
                />
                <AcaoDoCartao
                  rotulo="Modificar anexo"
                  compacto={compacto}
                  icone={<Pencil size={20} />}
                  onClick={() => onRenomear(anexo)}
                />
                <AcaoDoCartao
                  rotulo={`Remover ${anexo.nome}`}
                  compacto={compacto}
                  perigo
                  icone={<Trash2 size={20} />}
                  onClick={() => onRemoverPendente(anexo.id)}
                />
              </>
            }
          />
        </li>
      ))}
      {prontos.map((a) => (
        <li key={a.id} className="shrink-0">
          <CartaoDeAnexo
            nome={a.filename}
            compacto={compacto}
            imagem={a.url}
            acoes={
              <AcaoDoCartao
                rotulo={`Remover ${a.filename}`}
                compacto={compacto}
                perigo
                icone={<Trash2 size={20} />}
                onClick={() => onRemoverPronto(a.id)}
              />
            }
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Um cartão de anexo pendente.
 *
 * `.upload_aa605f`: `padding:8px`, `border:1px solid var(--border-normal)`,
 * `border-radius:var(--radius-sm)` (8), `box-shadow:var(--shadow-low)`, fundo
 * `--background-surface-high`. O nome embaixo, `.filename__41ea0{margin-top:8px;
 * text-overflow:ellipsis}`. O tamanho em bytes saiu: não está no cartão do
 * Discord.
 *
 * As ações moram na `.actionBar_aa605f` (`position:absolute; inset-inline-end:0;
 * transform:translate(25%,-25%)`), com `.smallActionBar_aa605f{opacity:0}` que
 * acende no `:hover` e no `:focus-within` do cartão — o foco de teclado também
 * as mostra. **No celular elas não se escondem**: `hover` é um gesto que o dedo
 * não tem, e sem elas um arquivo escolhido por engano ia junto com a mensagem.
 */
function CartaoDeAnexo({
  nome,
  compacto,
  imagem,
  borrado = false,
  progresso = -1,
  acoes,
}: {
  nome: string;
  compacto: boolean;
  imagem?: string;
  borrado?: boolean;
  progresso?: number;
  acoes: React.ReactNode;
}) {
  const lado = compacto ? LADO_MOBILE : LADO;
  return (
    <div
      style={{ height: lado, width: lado }}
      className="group/anexo relative flex flex-col rounded-lg border border-border-normal bg-background-surface-high p-2 shadow-shadow-low"
    >
      <div className="relative mt-auto grid min-h-0 flex-1 place-items-center overflow-hidden rounded">
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagem}
            alt={nome}
            className={`h-full w-full object-contain ${borrado ? "blur-lg" : ""}`}
          />
        ) : (
          <FileText size={compacto ? 40 : 64} strokeWidth={1} aria-hidden="true" className="text-text-muted" />
        )}
      </div>

      <span className={`truncate text-text-default ${compacto ? "mt-1 text-text-xs" : "mt-2 text-text-sm"}`}>
        {nome}
      </span>

      {progresso >= 0 && (
        <div
          role="progressbar"
          aria-valuenow={progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Enviando ${nome}`}
          className="mt-1 h-1 overflow-hidden rounded bg-background-mod-strong"
        >
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progresso}%` }} />
        </div>
      )}

      {/* `.miniPopover_aa605f{height:24px}`. O fundo e a sombra da barrinha não
          estão no módulo capturado: fica a superfície de popout do app. */}
      <div
        className={`absolute right-0 top-0 z-[5] flex items-center gap-0.5 rounded-lg bg-background-surface-higher shadow-popout transition-opacity ${
          compacto
            ? "opacity-100"
            : "translate-x-1/4 -translate-y-1/4 opacity-0 group-hover/anexo:opacity-100 group-focus-within/anexo:opacity-100"
        }`}
      >
        {acoes}
      </div>
    </div>
  );
}

/**
 * Botão da barrinha do cartão: 24×24 (`.miniPopover_aa605f` tem 24 de altura),
 * glifo de 20 como o resto das barras de ação medidas no primitivo. No celular
 * vira 32 — ali é o único jeito de agir. Fundo `hover-selecionado` no desktop
 * (a mesma família do resto do composer, item 13 de `BotaoDeIcone.tsx`); no
 * celular a barrinha já fica sempre visível (comentário acima, sem hover para
 * medir), então fica em `hover` puro.
 */
function AcaoDoCartao({
  rotulo,
  icone,
  onClick,
  compacto,
  perigo = false,
  ativo = false,
}: {
  rotulo: string;
  icone: React.ReactNode;
  onClick: () => void;
  compacto: boolean;
  perigo?: boolean;
  ativo?: boolean;
}) {
  return (
    <BotaoDeIcone
      rotulo={rotulo}
      icone={icone}
      onClick={onClick}
      tamanho={compacto ? "md" : "sm"}
      fundo={compacto ? "hover" : "hover-selecionado"}
      tom={perigo ? "perigo" : undefined}
      ativo={ativo}
    />
  );
}
