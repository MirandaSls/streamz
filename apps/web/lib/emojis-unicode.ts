/**
 * Lista curta de emojis unicode com nome curto, para o autocomplete de `:`.
 *
 * Por que uma lista nossa e não a da biblioteca do seletor: a
 * `emoji-picker-react` não expõe busca por nome — só o componente inteiro —,
 * e puxar um pacote de dados de milhares de emojis (centenas de KB no bundle)
 * para completar o que a pessoa digita não se paga. O seletor completo continua
 * ali no botão de emoji; aqui ficam os que de fato se digitam por atalho.
 *
 * `nome` segue a convenção do Discord (inglês, minúsculo, `_`) porque é o que a
 * memória de quem vem de lá já tem; `busca` acrescenta as palavras em português.
 */

export interface EmojiUnicode {
  nome: string;
  char: string;
  /** palavras extras que também encontram este emoji. */
  busca: string;
}

export const EMOJIS_UNICODE: readonly EmojiUnicode[] = [
  { nome: "smile", char: "😄", busca: "sorriso feliz" },
  { nome: "grinning", char: "😀", busca: "sorriso" },
  { nome: "joy", char: "😂", busca: "chorando de rir risada" },
  { nome: "rofl", char: "🤣", busca: "rolando de rir risada" },
  { nome: "sweat_smile", char: "😅", busca: "alivio suor" },
  { nome: "wink", char: "😉", busca: "piscada" },
  { nome: "blush", char: "😊", busca: "envergonhado sorriso" },
  { nome: "heart_eyes", char: "😍", busca: "apaixonado amor" },
  { nome: "kissing_heart", char: "😘", busca: "beijo" },
  { nome: "thinking", char: "🤔", busca: "pensando duvida" },
  { nome: "neutral_face", char: "😐", busca: "neutro" },
  { nome: "expressionless", char: "😑", busca: "sem expressao" },
  { nome: "smirk", char: "😏", busca: "sarcasmo" },
  { nome: "unamused", char: "😒", busca: "sem graca" },
  { nome: "sob", char: "😭", busca: "chorando choro" },
  { nome: "cry", char: "😢", busca: "triste lagrima" },
  { nome: "rage", char: "😡", busca: "raiva bravo" },
  { nome: "angry", char: "😠", busca: "bravo" },
  { nome: "sleeping", char: "😴", busca: "dormindo sono" },
  { nome: "yawning_face", char: "🥱", busca: "bocejo sono" },
  { nome: "sunglasses", char: "😎", busca: "estiloso oculos" },
  { nome: "nerd_face", char: "🤓", busca: "nerd" },
  { nome: "star_struck", char: "🤩", busca: "deslumbrado estrela" },
  { nome: "partying_face", char: "🥳", busca: "festa comemorando" },
  { nome: "exploding_head", char: "🤯", busca: "explodindo mente" },
  { nome: "hot_face", char: "🥵", busca: "calor" },
  { nome: "cold_face", char: "🥶", busca: "frio" },
  { nome: "face_with_monocle", char: "🧐", busca: "analisando" },
  { nome: "zany_face", char: "🤪", busca: "doido" },
  { nome: "shushing_face", char: "🤫", busca: "silencio segredo" },
  { nome: "hugging_face", char: "🤗", busca: "abraco" },
  { nome: "pleading_face", char: "🥺", busca: "pedindo suplicando" },
  { nome: "melting_face", char: "🫠", busca: "derretendo" },
  { nome: "skull", char: "💀", busca: "caveira morto" },
  { nome: "ghost", char: "👻", busca: "fantasma" },
  { nome: "alien", char: "👽", busca: "et" },
  { nome: "robot", char: "🤖", busca: "robo bot" },
  { nome: "poop", char: "💩", busca: "coco" },
  { nome: "clown_face", char: "🤡", busca: "palhaco" },
  { nome: "thumbsup", char: "👍", busca: "joia positivo curtir" },
  { nome: "thumbsdown", char: "👎", busca: "negativo descurtir" },
  { nome: "ok_hand", char: "👌", busca: "ok certo" },
  { nome: "clap", char: "👏", busca: "palmas aplauso" },
  { nome: "wave", char: "👋", busca: "tchau ola aceno" },
  { nome: "pray", char: "🙏", busca: "obrigado por favor reza" },
  { nome: "muscle", char: "💪", busca: "forca musculo" },
  { nome: "point_right", char: "👉", busca: "aponta direita" },
  { nome: "point_left", char: "👈", busca: "aponta esquerda" },
  { nome: "raised_hands", char: "🙌", busca: "comemorando maos" },
  { nome: "handshake", char: "🤝", busca: "acordo aperto de mao" },
  { nome: "writing_hand", char: "✍️", busca: "escrevendo" },
  { nome: "eyes", char: "👀", busca: "olhando olhos" },
  { nome: "brain", char: "🧠", busca: "cerebro" },
  { nome: "heart", char: "❤️", busca: "coracao amor" },
  { nome: "broken_heart", char: "💔", busca: "coracao partido" },
  { nome: "sparkling_heart", char: "💖", busca: "coracao brilhante" },
  { nome: "fire", char: "🔥", busca: "fogo top" },
  { nome: "sparkles", char: "✨", busca: "brilho" },
  { nome: "star", char: "⭐", busca: "estrela" },
  { nome: "zap", char: "⚡", busca: "raio energia" },
  { nome: "boom", char: "💥", busca: "explosao" },
  { nome: "tada", char: "🎉", busca: "festa comemoracao parabens" },
  { nome: "confetti_ball", char: "🎊", busca: "confete festa" },
  { nome: "balloon", char: "🎈", busca: "balao" },
  { nome: "gift", char: "🎁", busca: "presente" },
  { nome: "birthday", char: "🎂", busca: "bolo aniversario" },
  { nome: "trophy", char: "🏆", busca: "trofeu vitoria" },
  { nome: "medal", char: "🏅", busca: "medalha" },
  { nome: "rocket", char: "🚀", busca: "foguete lancamento deploy" },
  { nome: "bug", char: "🐛", busca: "inseto erro" },
  { nome: "computer", char: "💻", busca: "notebook pc" },
  { nome: "keyboard", char: "⌨️", busca: "teclado" },
  { nome: "iphone", char: "📱", busca: "celular telefone" },
  { nome: "bulb", char: "💡", busca: "ideia lampada" },
  { nome: "wrench", char: "🔧", busca: "chave conserto" },
  { nome: "hammer", char: "🔨", busca: "martelo" },
  { nome: "lock", char: "🔒", busca: "cadeado seguro" },
  { nome: "key", char: "🔑", busca: "chave" },
  { nome: "mag", char: "🔍", busca: "lupa busca" },
  { nome: "link", char: "🔗", busca: "elo corrente" },
  { nome: "pushpin", char: "📌", busca: "fixar alfinete" },
  { nome: "memo", char: "📝", busca: "nota anotacao" },
  { nome: "books", char: "📚", busca: "livros estudo" },
  { nome: "chart", char: "📈", busca: "grafico subindo" },
  { nome: "calendar", char: "📅", busca: "data agenda" },
  { nome: "hourglass", char: "⏳", busca: "ampulheta espera" },
  { nome: "alarm_clock", char: "⏰", busca: "despertador" },
  { nome: "bell", char: "🔔", busca: "sino notificacao" },
  { nome: "no_bell", char: "🔕", busca: "mudo silenciar" },
  { nome: "mailbox", char: "📬", busca: "caixa correio" },
  { nome: "email", char: "📧", busca: "mensagem correio" },
  { nome: "warning", char: "⚠️", busca: "atencao cuidado" },
  { nome: "no_entry", char: "⛔", busca: "proibido" },
  { nome: "white_check_mark", char: "✅", busca: "certo feito ok" },
  { nome: "x", char: "❌", busca: "errado nao" },
  { nome: "question", char: "❓", busca: "duvida interrogacao" },
  { nome: "exclamation", char: "❗", busca: "exclamacao" },
  { nome: "recycle", char: "♻️", busca: "reciclar" },
  { nome: "checkered_flag", char: "🏁", busca: "fim bandeira" },
  { nome: "coffee", char: "☕", busca: "cafe" },
  { nome: "beer", char: "🍺", busca: "cerveja" },
  { nome: "pizza", char: "🍕", busca: "pizza" },
  { nome: "hamburger", char: "🍔", busca: "lanche" },
  { nome: "popcorn", char: "🍿", busca: "pipoca filme" },
  { nome: "cake", char: "🍰", busca: "bolo doce" },
  { nome: "apple", char: "🍎", busca: "maca fruta" },
  { nome: "avocado", char: "🥑", busca: "abacate" },
  { nome: "dog", char: "🐶", busca: "cachorro" },
  { nome: "cat", char: "🐱", busca: "gato" },
  { nome: "fox", char: "🦊", busca: "raposa" },
  { nome: "bear", char: "🐻", busca: "urso" },
  { nome: "penguin", char: "🐧", busca: "pinguim" },
  { nome: "unicorn", char: "🦄", busca: "unicornio" },
  { nome: "whale", char: "🐳", busca: "baleia" },
  { nome: "snake", char: "🐍", busca: "cobra python" },
  { nome: "sun", char: "☀️", busca: "sol" },
  { nome: "cloud", char: "☁️", busca: "nuvem" },
  { nome: "rainbow", char: "🌈", busca: "arco iris" },
  { nome: "snowflake", char: "❄️", busca: "neve floco" },
  { nome: "earth_americas", char: "🌎", busca: "terra mundo planeta" },
  { nome: "moon", char: "🌙", busca: "lua noite" },
  { nome: "soccer", char: "⚽", busca: "futebol bola" },
  { nome: "video_game", char: "🎮", busca: "jogo controle" },
  { nome: "musical_note", char: "🎵", busca: "musica nota" },
  { nome: "headphones", char: "🎧", busca: "fone musica" },
  { nome: "microphone", char: "🎤", busca: "microfone" },
  { nome: "camera", char: "📷", busca: "foto camera" },
  { nome: "movie_camera", char: "🎬", busca: "filme cinema" },
  { nome: "art", char: "🎨", busca: "arte pintura" },
  { nome: "money", char: "💰", busca: "dinheiro grana" },
  { nome: "car", char: "🚗", busca: "carro" },
  { nome: "airplane", char: "✈️", busca: "aviao viagem" },
  { nome: "house", char: "🏠", busca: "casa" },
  { nome: "office", char: "🏢", busca: "escritorio predio" },
];

/** Emojis unicode que casam com o termo digitado, por nome ou palavra-chave. */
export function buscarEmojisUnicode(termo: string, limite = 10): EmojiUnicode[] {
  const q = termo.trim().toLowerCase();
  if (!q) return EMOJIS_UNICODE.slice(0, limite);
  // quem começa com o termo vem antes de quem só o contém
  const comeca: EmojiUnicode[] = [];
  const contem: EmojiUnicode[] = [];
  for (const e of EMOJIS_UNICODE) {
    if (e.nome.startsWith(q)) comeca.push(e);
    else if (e.nome.includes(q) || e.busca.includes(q)) contem.push(e);
    if (comeca.length >= limite) break;
  }
  return [...comeca, ...contem].slice(0, limite);
}
