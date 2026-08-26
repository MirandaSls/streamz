import Marca from "./Marca";

/**
 * Lockup horizontal: símbolo + wordmark. Dentro do app o wordmark é **texto
 * real** em Archivo, não curvas — escala, seleciona, é lido por leitor de tela e
 * não depende de conversão. Os SVGs de lockup do pacote de marca existem para
 * material externo, onde a fonte pode não estar disponível.
 *
 * Tracking -4,5% é do pacote e só vale a partir de 24px (`tracking-wordmark`).
 */
export default function MarcaLockup({
  size = 36,
  className,
}: {
  /** altura do símbolo em px; o wordmark acompanha */
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      {/* limão no símbolo, wordmark na cor do contexto: é o lockup escuro do pacote */}
      <Marca size={size} className="text-accent" />
      <span
        className="font-display font-extrabold uppercase leading-none tracking-wordmark"
        style={{ fontSize: size * 0.86 }}
      >
        Streamz
      </span>
    </span>
  );
}
