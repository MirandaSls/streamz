/**
 * Forma do pacote de dados de emoji da `emoji-picker-react`.
 *
 * Existe para o `tsc` **não** inferir o tipo literal do JSON de 197 KB: sem
 * esta declaração o typecheck do pacote web fica ~20 s mais lento, porque o
 * compilador monta o tipo de cada um dos ~1.900 objetos do arquivo. O que a
 * gente lê dele são três campos, e são estes.
 */
declare module "emoji-picker-react/dist/data/emojis.json" {
  const dados: {
    emojis: Record<string, { n: string[]; u: string; v?: string[] }[]>;
  };
  export default dados;
}
