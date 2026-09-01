"use client";

import type { ComponentType } from "react";

import {
  ArrowClockwise,
  Check as CheckRaw,
  ChatCircle,
  DotsThreeVertical,
  Prohibit,
  Question,
  UserMinus,
  CaretDown as CaretDownRaw,
  CaretRight as CaretRightRaw,
  Checks,
  Compass,
  DotsThree as DotsThreeRaw,
  FolderPlus,
  GearSix,
  Hash,
  Headphones,
  Link as LinkIcon,
  Lock,
  MagnifyingGlass as MagnifyingGlassRaw,
  Megaphone,
  Microphone,
  MicrophoneSlash,
  PencilSimple,
  SignOut,
  Phone,
  PhoneDisconnect,
  Plus as PlusRaw,
  SpeakerHigh,
  Trash,
  UserPlus,
  Users,
  VideoCamera,
  VideoCameraSlash,
  Waveform,
  WifiHigh,
  WifiSlash,
  X as XRaw,
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

/**
 * O Discord **não** é uniformemente preenchido, e foi isso que eu errei ao
 * ligar `fill` para tudo de uma vez.
 *
 * Os pictogramas dele — pessoa, microfone, fone, engrenagem — são sólidos. As
 * **marcas utilitárias** — o `+` de nova conversa, o `×` de fechar, as setas, a
 * lupa — são traço. São classes diferentes de sinal: o pictograma nomeia uma
 * coisa e precisa de corpo para ser reconhecido; a marca utilitária é gesto
 * puro, e engordá-la a transforma num carimbo que grita mais alto que o nome do
 * item ao lado.
 *
 * `bold` e não `regular` porque o resto da interface é sólido: traço fino
 * demais ao lado de pictograma cheio lê como ícone de outra família.
 *
 * O `weight` vem **antes** do spread de propósito: quem chamar pode sobrescrever.
 */
function traco<P extends IconProps>(Icone: ComponentType<P>) {
  return function MarcaDeTraco(props: P) {
    return <Icone weight="bold" {...props} />;
  };
}

export const Plus = traco(PlusRaw);
export const X = traco(XRaw);
export const Check = traco(CheckRaw);
export const ChevronDown = traco(CaretDownRaw);
export const ChevronRight = traco(CaretRightRaw);
export const Search = traco(MagnifyingGlassRaw);
export const MoreHorizontal = traco(DotsThreeRaw);
export const MoreVertical = traco(DotsThreeVertical);

export {
  ArrowClockwise as RotateCw,
  Checks as CheckCheck,
  Compass,
  FolderPlus,
  GearSix as Settings,
  Hash,
  Headphones,
  LinkIcon as Link2,
  Lock,
  Megaphone,
  Microphone as Mic,
  MicrophoneSlash as MicOff,
  PencilSimple as Pencil,
  Phone,
  PhoneDisconnect as PhoneOff,
  SignOut as LogOut,
  SpeakerHigh as Volume2,
  Trash as Trash2,
  UserPlus,
  Users,
  UserMinus,
  Prohibit as UserX,
  Question as HelpCircle,
  ChatCircle as MessageSquare,
  VideoCamera as Video,
  VideoCameraSlash as VideoOff,
  Waveform as AudioLines,
  WifiHigh as Signal,
  WifiSlash as SignalZero,
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
