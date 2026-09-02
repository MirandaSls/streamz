"use client";

import type { ComponentProps, ComponentType } from "react";

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
  Hash,
  Link as LinkIcon,
  Lock,
  MagnifyingGlass as MagnifyingGlassRaw,
  Megaphone,
  PencilSimple,
  SignOut,
  Phone,
  PhoneDisconnect,
  Plus as PlusRaw,
  SpeakerHigh,
  Trash,
  Tray,
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
 * Nem tudo sai do Phosphor. Onde o desenho — e não o peso — é que está errado,
 * o ícone vem do ativo do próprio Discord; ver `doDiscord` no fim do arquivo.
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
  Hash,
  LinkIcon as Link2,
  Lock,
  Megaphone,
  PencilSimple as Pencil,
  Phone,
  PhoneDisconnect as PhoneOff,
  SignOut as LogOut,
  SpeakerHigh as Volume2,
  Trash as Trash2,
  Tray as Inbox,
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

/*
 * Caminhos traçados do material de origem (ver `svg/MAPA.md`). Não editar à
 * mão: cada um saiu de um arquivo, e o próximo vem do mesmo lugar do mesmo
 * jeito.
 */
const MIC_1 =
  "M50.0003 16.667C46.4641 16.667 43.0727 18.0718 40.5722 20.5722C38.0717 23.0727 36.667 26.4641 36.667 30.0003V43.3337C36.667 46.8699 38.0717 50.2613 40.5722 52.7617C43.0727 55.2622 46.4641 56.667 50.0003 56.667C53.5365 56.667 56.9279 55.2622 59.4284 52.7617C61.9289 50.2613 63.3337 46.8699 63.3337 43.3337V30.0003C63.3337 26.4641 61.9289 23.0727 59.4284 20.5722C56.9279 18.0718 53.5365 16.667 50.0003 16.667Z";
const MIC_2 =
  "M29.9997 43.3333C29.9997 42.4493 29.6485 41.6014 29.0234 40.9763C28.3982 40.3512 27.5504 40 26.6663 40C25.7823 40 24.9344 40.3512 24.3093 40.9763C23.6842 41.6014 23.333 42.4493 23.333 43.3333C23.3308 49.83 25.7003 56.1041 29.9966 60.9774C34.293 65.8507 40.2206 68.9879 46.6663 69.8V76.6667H39.9997C39.1156 76.6667 38.2678 77.0179 37.6427 77.643C37.0175 78.2681 36.6663 79.1159 36.6663 80C36.6663 80.8841 37.0175 81.7319 37.6427 82.357C38.2678 82.9821 39.1156 83.3333 39.9997 83.3333H59.9997C60.8837 83.3333 61.7316 82.9821 62.3567 82.357C62.9818 81.7319 63.333 80.8841 63.333 80C63.333 79.1159 62.9818 78.2681 62.3567 77.643C61.7316 77.0179 60.8837 76.6667 59.9997 76.6667H53.333V69.8C59.7788 68.9879 65.7064 65.8507 70.0027 60.9774C74.299 56.1041 76.6686 49.83 76.6663 43.3333C76.6663 42.4493 76.3152 41.6014 75.69 40.9763C75.0649 40.3512 74.2171 40 73.333 40C72.449 40 71.6011 40.3512 70.976 40.9763C70.3509 41.6014 69.9997 42.4493 69.9997 43.3333C69.9997 48.6377 67.8925 53.7247 64.1418 57.4755C60.3911 61.2262 55.304 63.3333 49.9997 63.3333C44.6953 63.3333 39.6083 61.2262 35.8575 57.4755C32.1068 53.7247 29.9997 48.6377 29.9997 43.3333Z";
const MIC_MUDO =
  "M19 85.667L85.6667 19.0003C86.1481 18.3584 86.3818 17.5644 86.3249 16.764C86.2681 15.9637 85.9244 15.2107 85.357 14.6433C84.7896 14.0759 84.0367 13.7323 83.2363 13.6754C82.4359 13.6185 81.6419 13.8522 81 14.3337L14.3333 81.0003C13.9513 81.2869 13.6352 81.6522 13.4067 82.0715C13.1781 82.4908 13.0422 82.9543 13.0084 83.4307C12.9745 83.9071 13.0434 84.3852 13.2104 84.8326C13.3774 85.28 13.6386 85.6863 13.9763 86.024C14.314 86.3617 14.7203 86.6229 15.1677 86.7899C15.6152 86.9569 16.0933 87.0258 16.5696 86.9919C17.046 86.9581 17.5095 86.8223 17.9288 86.5937C18.3482 86.3651 18.7135 86.0491 19 85.667ZM46 67.7337C45.3 68.4337 45.6667 69.667 46.6667 69.8003V76.667H40C39.1159 76.667 38.2681 77.0182 37.643 77.6433C37.0179 78.2684 36.6667 79.1163 36.6667 80.0003C36.6667 80.8844 37.0179 81.7322 37.643 82.3574C38.2681 82.9825 39.1159 83.3337 40 83.3337H60C60.8841 83.3337 61.7319 82.9825 62.357 82.3574C62.9821 81.7322 63.3333 80.8844 63.3333 80.0003C63.3333 79.1163 62.9821 78.2684 62.357 77.6433C61.7319 77.0182 60.8841 76.667 60 76.667H53.3333V69.8003C59.7791 68.9882 65.7067 65.851 70.003 60.9777C74.2994 56.1045 76.6689 49.8304 76.6667 43.3337C76.6667 42.4496 76.3155 41.6018 75.6904 40.9766C75.0652 40.3515 74.2174 40.0003 73.3333 40.0003C72.4493 40.0003 71.6014 40.3515 70.9763 40.9766C70.3512 41.6018 70 42.4496 70 43.3337C70 48.167 68.2667 52.6337 65.4 56.1003L65.3333 56.167C63.5763 58.2788 61.4023 60.0052 58.9475 61.2383C56.4927 62.4715 53.8098 63.1848 51.0667 63.3337C50.6402 63.355 50.2366 63.5331 49.9333 63.8337L46 67.767V67.7337ZM61.2 25.067C61.7 24.567 61.8333 23.8003 61.4667 23.2003C59.976 20.6881 57.7016 18.735 54.993 17.6411C52.2843 16.5472 49.2914 16.3731 46.4742 17.1455C43.657 17.918 41.1715 19.5943 39.3996 21.9167C37.6277 24.2391 36.6675 27.0792 36.6667 30.0003V43.3337C36.6667 44.3337 36.7667 45.267 37 46.2003C37.2333 47.3337 38.6333 47.6337 39.4667 46.8003L61.2 25.067ZM26.8667 56.6003C27.4 57.5337 28.6333 57.6337 29.3667 56.9003L31.8667 54.4003C32.4 53.867 32.5 53.067 32.1333 52.367C30.7201 49.5661 29.9891 46.4708 30 43.3337C30 42.4496 29.6488 41.6018 29.0237 40.9766C28.3986 40.3515 27.5507 40.0003 26.6667 40.0003C25.7826 40.0003 24.9348 40.3515 24.3096 40.9766C23.6845 41.6018 23.3333 42.4496 23.3333 43.3337C23.3333 48.167 24.6333 52.7003 26.8667 56.6003Z";
const FONE =
  "M49.9997 19.9999C45.7772 19.9973 41.6017 20.886 37.7462 22.608C33.8908 24.33 30.4423 26.8465 27.6263 29.9928C24.8103 33.1392 22.6902 36.8446 21.4047 40.8667C20.1192 44.8888 19.6972 49.1369 20.1664 53.3333H26.3997C29.0808 53.3302 31.7231 53.974 34.1023 55.21C36.4815 56.4461 38.5274 58.2378 40.0664 60.4333L44.633 67C45.9428 68.8681 46.5976 71.1172 46.495 73.3964C46.3925 75.6757 45.5386 77.8569 44.0664 79.6C42.6869 81.3208 40.7517 82.508 38.5926 82.9581C36.4335 83.4081 34.1851 83.093 32.233 82.0666C25.1235 78.1286 19.5239 71.94 16.314 64.4734C13.1041 57.0068 12.4658 48.6854 14.4996 40.8166C16.5333 32.9479 21.1237 25.9778 27.5495 21.0016C33.9754 16.0254 41.8724 13.3252 49.9997 13.3252C58.127 13.3252 66.024 16.0254 72.4499 21.0016C78.8757 25.9778 83.4661 32.9479 85.4998 40.8166C87.5336 48.6854 86.8953 57.0068 83.6854 64.4734C80.4755 71.94 74.8759 78.1286 67.7664 82.0666C63.533 84.4333 58.6664 82.8333 55.933 79.6C54.4608 77.8569 53.6068 75.6757 53.5043 73.3964C53.4018 71.1172 54.0565 68.8681 55.3664 67L59.9664 60.4333C61.5053 58.2378 63.5512 56.4461 65.9304 55.21C68.3096 53.974 70.9519 53.3302 73.633 53.3333H79.833C80.3022 49.1369 79.8802 44.8888 78.5947 40.8667C77.3092 36.8446 75.1891 33.1392 72.3731 29.9928C69.5571 26.8465 66.1086 24.33 62.2532 22.608C58.3977 20.886 54.2222 19.9973 49.9997 19.9999Z";
const FONE_SURDO =
  "M85.6667 19C86.1481 18.3581 86.3818 17.5641 86.3249 16.7638C86.2681 15.9634 85.9244 15.2104 85.357 14.643C84.7896 14.0757 84.0367 13.732 83.2363 13.6751C82.4359 13.6182 81.6419 13.852 81 14.3334L14.3333 81C13.9513 81.2866 13.6352 81.6519 13.4067 82.0712C13.1781 82.4905 13.0422 82.954 13.0084 83.4304C12.9745 83.9068 13.0434 84.3849 13.2104 84.8323C13.3774 85.2797 13.6386 85.686 13.9763 86.0237C14.314 86.3614 14.7203 86.6226 15.1677 86.7896C15.6152 86.9566 16.0933 87.0255 16.5696 86.9917C17.046 86.9578 17.5095 86.822 17.9288 86.5934C18.3482 86.3648 18.7135 86.0488 19 85.6667L85.6667 19ZM66.8667 19.8C67.0487 19.6242 67.1864 19.4077 67.2684 19.1684C67.3505 18.929 67.3747 18.6736 67.3389 18.4231C67.3031 18.1726 67.2084 17.9341 67.0626 17.7273C66.9168 17.5205 66.7239 17.3512 66.5 17.2334C59.6115 13.7681 51.8059 12.5628 44.193 13.7886C36.5801 15.0145 29.5475 18.6093 24.095 24.0617C18.6425 29.5142 15.0478 36.5469 13.8219 44.1598C12.596 51.7726 13.8014 59.5783 17.2667 66.4667C17.7333 67.4667 19.0333 67.6334 19.8 66.8667L30.4667 56.2001C31.3 55.3667 30.9667 53.9334 29.8 53.6667C28.6811 53.4394 27.5418 53.3277 26.4 53.3334H20.1667C19.5759 48.0654 20.3915 42.735 22.5305 37.8848C24.6695 33.0345 28.0555 28.8376 32.3438 25.7214C36.632 22.6051 41.6694 20.6807 46.9432 20.1441C52.2169 19.6076 57.5387 20.478 62.3667 22.6667C63.0333 22.9667 63.8333 22.8334 64.3333 22.3334L66.8667 19.8ZM77.3333 37.6001C77.1871 37.2818 77.1406 36.9268 77.2001 36.5817C77.2597 36.2366 77.4223 35.9176 77.6667 35.6667L80.2 33.1334C80.3758 32.9514 80.5923 32.8137 80.8317 32.7316C81.0711 32.6495 81.3265 32.6254 81.577 32.6612C81.8275 32.6969 82.0659 32.7916 82.2728 32.9375C82.4796 33.0833 82.6488 33.2761 82.7667 33.5001C87.0269 41.9647 87.8445 51.7501 85.048 60.8044C82.2516 69.8587 76.0583 77.4787 67.7667 82.0667C63.5333 84.4334 58.6667 82.8334 55.9333 79.6C54.4611 77.857 53.6072 75.6758 53.5046 73.3965C53.4021 71.1173 54.0569 68.8682 55.3667 67.0001L59.9667 60.4334C61.5056 58.2379 63.5515 56.4462 65.9307 55.2101C68.3099 53.9741 70.9522 53.3303 73.6333 53.3334H79.8333C80.4166 47.9599 79.5535 42.5281 77.3333 37.6001ZM43.6667 69.6667C44.5 68.8334 45.8333 69.0667 46.1333 70.1334C46.5889 71.7601 46.6387 73.4736 46.2784 75.124C45.9181 76.7743 45.1587 78.3112 44.0667 79.6C42.6872 81.3209 40.752 82.5081 38.5929 82.9582C36.4338 83.4082 34.1854 83.0931 32.2333 82.0667C32.1618 82.0277 32.1002 81.9728 32.0531 81.9062C32.0061 81.8397 31.975 81.7632 31.9621 81.6828C31.9492 81.6023 31.955 81.52 31.9789 81.4421C32.0028 81.3642 32.0442 81.2928 32.1 81.2334L43.7 69.6334L43.6667 69.6667Z";
const ENGRENAGEM =
  "M45.2 13.6663C43.6667 13.833 42.8667 15.433 43.0667 16.933C43.6667 20.7997 42.4333 24.2663 39.8 25.3663C37.1334 26.4663 33.8334 24.8663 31.5 21.6997C30.6 20.4997 28.9 19.9663 27.7 20.8997C25.1334 22.8663 22.8667 25.133 20.9 27.6997C19.9667 28.8997 20.5 30.5997 21.7 31.4997C24.9 33.833 26.4667 37.1663 25.3667 39.7997C24.2667 42.4663 20.8 43.6663 16.9334 43.0663C15.4334 42.833 13.8334 43.6663 13.6334 45.1997C13.2165 48.3861 13.2165 51.6132 13.6334 54.7996C13.8334 56.333 15.4334 57.133 16.9334 56.933C20.8 56.333 24.2667 57.5663 25.3667 60.1996C26.4667 62.8663 24.9 66.1663 21.7 68.4996C20.5 69.3996 19.9667 71.0997 20.9 72.2997C22.8667 74.8663 25.1334 77.133 27.7 79.0996C28.9 80.033 30.6 79.4996 31.5 78.2996C33.8334 75.133 37.1667 73.533 39.8 74.633C42.4667 75.733 43.6667 79.1996 43.0667 83.0663C42.8333 84.5663 43.6667 86.1663 45.2 86.3663C48.3864 86.7832 51.6136 86.7832 54.8 86.3663C56.3333 86.1663 57.1334 84.5663 56.9333 83.0663C56.3333 79.1996 57.5667 75.733 60.2 74.633C62.8667 73.533 66.1667 75.0996 68.5 78.2996C69.4 79.4996 71.1 80.033 72.3 79.0996C74.8667 77.133 77.1333 74.8663 79.1 72.2997C80.0333 71.0997 79.5 69.3996 78.3 68.4996C75.1 66.1663 73.5333 62.833 74.6333 60.1996C75.7333 57.533 79.2 56.333 83.0667 56.933C84.5667 57.1663 86.1667 56.333 86.3667 54.7996C86.7836 51.6132 86.7836 48.3861 86.3667 45.1997C86.1667 43.6663 84.5667 42.8663 83.0667 43.0663C79.2 43.6663 75.7333 42.433 74.6333 39.7997C73.5333 37.133 75.1 33.833 78.3 31.4997C79.5 30.5997 80.0333 28.8997 79.1 27.6997C77.1397 25.1461 74.8536 22.86 72.3 20.8997C71.1 19.9663 69.4 20.4997 68.5 21.6997C66.1667 24.8997 62.8334 26.4663 60.2 25.3663C57.5334 24.2663 56.3333 20.7997 56.9333 16.933C57.1667 15.433 56.3333 13.833 54.8 13.633C51.6136 13.2161 48.3864 13.2161 45.2 13.633V13.6663ZM63.3333 49.9996C63.3333 53.5359 61.9286 56.9273 59.4281 59.4277C56.9276 61.9282 53.5362 63.333 50 63.333C46.4638 63.333 43.0724 61.9282 40.5719 59.4277C38.0714 56.9273 36.6667 53.5359 36.6667 49.9996C36.6667 46.4634 38.0714 43.072 40.5719 40.5716C43.0724 38.0711 46.4638 36.6663 50 36.6663C53.5362 36.6663 56.9276 38.0711 59.4281 40.5716C61.9286 43.072 63.3333 46.4634 63.3333 49.9996Z";
const AMIGOS_1 =
  "M53.3333 43.3337C56.8696 43.3337 60.2609 41.9289 62.7614 39.4284C65.2619 36.9279 66.6667 33.5365 66.6667 30.0003C66.6667 26.4641 65.2619 23.0727 62.7614 20.5722C60.2609 18.0718 56.8696 16.667 53.3333 16.667C49.7971 16.667 46.4057 18.0718 43.9052 20.5722C41.4048 23.0727 40 26.4641 40 30.0003C40 33.5365 41.4048 36.9279 43.9052 39.4284C46.4057 41.9289 49.7971 43.3337 53.3333 43.3337Z";
const AMIGOS_2 =
  "M20 26.6667V24.1667C20 21.8667 21.8667 20 24.1667 20C26.4667 20 28.3 21.8667 28.6 24.1667C30.4 38.8333 41.5333 50 53.3333 50H56.6667C63.7391 50 70.5219 52.8095 75.5228 57.8105C80.5238 62.8115 83.3333 69.5942 83.3333 76.6667C83.3333 78.4348 82.631 80.1305 81.3807 81.3807C80.1305 82.631 78.4348 83.3333 76.6667 83.3333C76.5166 83.3324 76.3709 83.2834 76.2508 83.1933C76.1308 83.1033 76.0429 82.9771 76 82.8333C74.9908 80.0411 73.5018 77.4466 71.6 75.1667C71.1 74.5 70.2 74.9667 70.3 75.7333L71.1333 82.4C71.2 82.9 70.8 83.3333 70.3 83.3333H40C38.2319 83.3333 36.5362 82.631 35.286 81.3807C34.0357 80.1305 33.3333 78.4348 33.3333 76.6667V69.2667C33.3333 64.0333 31.1 59.1 28.2333 54.7C22.9083 46.3153 20.0547 36.5993 20 26.6667Z";

/**
 * ── Os ícones que vêm do próprio Discord ──────────────────────────────────
 *
 * Traçados dos ativos de referência em `docs/Reference/Discord assets icons/`,
 * sem o `<rect>` de fundo e com o preenchimento em `currentColor`.
 *
 * **A cor sai fora de propósito.** O microfone mudo e o fone surdo vêm com
 * vermelho `#F23F42` chapado no arquivo. Aqui eles herdam a cor de quem chama,
 * porque quem decide o vermelho é o `FooterSplit` — que pinta ícone **e** véu
 * juntos. Vermelho preso dentro do glifo brigaria com o estado desligado em vez
 * de compor com ele, e não dá para apagar nos lugares onde o ícone aparece
 * pequeno sobre fundo já colorido, como o crachá do avatar.
 *
 * **O quadro fica como veio.** Ao contrário do `Amigos`, estes já ocupam ~73%
 * do quadro de origem, que é a proporção dos do Phosphor. E eles aparecem
 * **lado a lado**: o quadro original é o que guarda a relação de tamanho entre
 * eles — o microfone é mesmo um pouco menor que o fone no Discord.
 * Reenquadrar cada um "para ficar do mesmo tamanho" desfaria justamente o que
 * faz a fileira parecer certa.
 */
function doDiscord(viewBox: string, ...caminhos: string[]) {
  return function GlifoDoDiscord({
    size = 24,
    ...resto
  }: { size?: number | string } & ComponentProps<"svg">) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={viewBox}
        fill="currentColor"
        {...resto}
      >
        {caminhos.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

/** O quadro em que o material de origem foi desenhado. */
const QUADRO = "0 0 100 100";

export const Mic = doDiscord(QUADRO, MIC_1, MIC_2);
export const Headphones = doDiscord(QUADRO, FONE);

/**
 * Os dois cortados — "estou mudo" e "não escuto ninguém".
 *
 * O `MicrophoneSlash` do Phosphor existe e é bom; o problema era o par. Fone
 * cortado não existe lá, e a versão anterior daqui era um `Headphones` com uma
 * barra desenhada por cima, e um contorno na cor do fundo por baixo dela para
 * dar o recorte. Esse contorno era `var(--fundo-do-icone, #101015)` — e a
 * variável nunca chegou a ser definida em lugar nenhum, então o recorte ficava
 * chumbado num cinza escuro. Sobre o véu vermelho do estado desligado, ele
 * aparecia como um risco escuro atravessando o ícone.
 *
 * No traço de verdade o recorte é vazado no próprio caminho: funciona sobre
 * qualquer fundo, e os dois passam a ser o mesmo gesto, que é o que o par
 * precisa para ler como par.
 */
export const MicOff = doDiscord(QUADRO, MIC_MUDO);
export const HeadphoneOff = doDiscord(QUADRO, FONE_SURDO);

/**
 * A engrenagem.
 *
 * `GearSix` tem seis dentes retos; a do Discord tem oito, mais curtos e
 * arredondados. Sozinha a diferença seria pequena, mas ela fica encostada no
 * microfone e no fone no rodapé — e ali, com os dois vizinhos sendo o traço do
 * Discord, a de seis é a única peça da fileira de outra mão.
 *
 * Fora do `doDiscord` por causa do `fillRule`: o miolo furado deste caminho só
 * existe com `evenodd`. Com a regra padrão o furo preenche e a engrenagem vira
 * um disco dentado.
 */
export function Settings({
  size = 24,
  ...resto
}: { size?: number | string } & ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={QUADRO}
      fill="currentColor"
      {...resto}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={ENGRENAGEM} />
    </svg>
  );
}

/**
 * Amigos — a pessoa acenando.
 *
 * `Users`, que estava aqui, são **duas pessoas**: no Discord esse desenho é
 * "membros" e "grupo", e é o que usamos nesses dois lugares. A aba Amigos tem
 * glifo próprio lá, e a diferença não é decorativa — com `Users` nos três
 * lugares, a home do modo DM fica com o mesmo sinal da lista de membros de um
 * servidor, que é justamente a distinção que a barra precisa fazer. No Phosphor
 * não há equivalente: `HandWaving` é só a mão, sem corpo, e `Person` não acena.
 *
 * Este é o único cujo `viewBox` foi mexido. O glifo ocupa ~67% do quadro de
 * origem contra os ~73% dos outros, e ele não aparece ao lado deles — aparece
 * sozinho, entre ícones do Phosphor. No quadro original sairia visivelmente
 * menor que os vizinhos. A janela abaixo é o mesmo desenho reenquadrado; o
 * caminho não foi tocado.
 */
export const Amigos = doDiscord("7.2 5.6 88.9 88.9", AMIGOS_1, AMIGOS_2);
