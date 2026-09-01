"use client";

import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  Checks,
  Compass,
  DotsThree,
  FolderPlus,
  GearSix,
  Hash,
  Headphones,
  Link as LinkIcon,
  Lock,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  MicrophoneSlash,
  PencilSimple,
  SignOut,
  Phone,
  PhoneDisconnect,
  Plus,
  SpeakerHigh,
  Trash,
  UserPlus,
  Users,
  VideoCamera,
  VideoCameraSlash,
  Waveform,
  WifiHigh,
  WifiSlash,
  X,
  type IconProps,
} from "@phosphor-icons/react";

/**
 * Os ícones do **cromo** do app — rail, barra lateral, rodapé, cabeçalho e
 * barra de chamada.
 *
 * Por que este arquivo existe: a diferença entre os nossos ícones e os do
 * Discord nunca foi de desenho, foi de **peso**. O conjunto deles é sólido,
 * preenchido, de terminações arredondadas; o lucide, que usávamos, é de
 * contorno com traço uniforme. Acertar a forma de cada ícone não adianta
 * enquanto a família inteira for vazada — é a propriedade que atravessa o
 * conjunto que faz a tela parecer de outro produto.
 *
 * A troca é para o Phosphor (MIT), que tem peso `fill` com o mesmo arredondado.
 * O peso é definido **uma vez** pelo `IconContext` (ver `PesoDosIcones`), e não
 * em cada chamada: um `weight="fill"` esquecido num ícone só apareceria como um
 * contorno solitário no meio da barra.
 *
 * Os nomes continuam os do lucide de propósito. São ~60 pontos de uso; renomear
 * tudo junto misturaria a mudança visual, que se revisa olhando, com um
 * renomear mecânico, que se revisa lendo. Quando o resto do app migrar, os
 * nomes viram os do Phosphor de uma vez.
 */

export {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  ArrowClockwise as RotateCw,
  Checks as CheckCheck,
  Compass,
  DotsThree as MoreHorizontal,
  FolderPlus,
  GearSix as Settings,
  Hash,
  Headphones,
  LinkIcon as Link2,
  Lock,
  MagnifyingGlass as Search,
  Megaphone,
  Microphone as Mic,
  MicrophoneSlash as MicOff,
  PencilSimple as Pencil,
  Phone,
  PhoneDisconnect as PhoneOff,
  SignOut as LogOut,
  Plus,
  SpeakerHigh as Volume2,
  Trash as Trash2,
  UserPlus,
  Users,
  VideoCamera as Video,
  VideoCameraSlash as VideoOff,
  Waveform as AudioLines,
  WifiHigh as Signal,
  WifiSlash as SignalZero,
  X,
};

/**
 * Fone cortado — o "áudio desligado".
 *
 * O Phosphor não tem essa variante (tem `Headphones` e nada de cortado), e o
 * print mostra fone **com barra**, não alto-falante mudo: trocar o desenho
 * mudaria o significado de "não escuto ninguém" para "não estou emitindo som".
 *
 * Em vez de desenhar um fone nosso, que sairia com outro peso e outro
 * arredondado, a barra é sobreposta ao fone da própria família. O traço herda a
 * cor do texto e leva um contorno da cor do fundo por baixo, que é o que dá o
 * recorte — sem ele a barra se funde ao fone e vira um borrão.
 */
export function HeadphoneOff({ size = 24, className = "", ...resto }: IconProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Headphones size={size} {...resto} />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        {/* o traço de baixo é o recorte: mesma linha, mais grossa, na cor da
            superfície — é o que separa a barra do desenho embaixo dela */}
        <line x1="4" y1="20" x2="20" y2="4" stroke="var(--fundo-do-icone, #101015)" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
