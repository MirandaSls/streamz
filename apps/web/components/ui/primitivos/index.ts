/**
 * Primitivos da interface (ADR-0009, onda 0.4): a mesma peça em todo o app,
 * com as medidas e os tokens do Discord. Tela nova usa daqui; `<button>`,
 * `<input>` e `title=` soltos com visual próprio são o que a migração da 0.8
 * tira do código.
 *
 * Nome do componente = nome da peça no Discord (para achar no CSS dele);
 * props em português, como o resto do app.
 */
export { Button, type ButtonProps, type VarianteDeBotao, type TamanhoDeBotao } from "./Button";
export {
  BotaoDeIcone,
  type BotaoDeIconeProps,
  type TamanhoDeBotaoDeIcone,
  type LadoDeBotaoDeIcone,
  type FormaDeBotaoDeIcone,
  type FundoDeBotaoDeIcone,
  type TomDeBotaoDeIcone,
  type VarianteDeBotaoDeIcone,
  type OpacidadeDeBotaoDesabilitado,
} from "./BotaoDeIcone";
export { Tooltip, type TooltipProps, type LadoDaDica, type CorDaDica } from "./Tooltip";
export {
  TextInput,
  TextArea,
  Campo,
  type TextInputProps,
  type TextAreaProps,
  type CampoProps,
  type TamanhoDeCampo,
} from "./TextInput";
export { Select, MultiSelect, type SelectProps, type MultiSelectProps, type OpcaoDeSelect } from "./Select";
export { Switch, type SwitchProps } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { RadioGroup, type RadioGroupProps, type OpcaoDeRadio } from "./Radio";
export { LinhaDeControle, type LinhaDeControleProps } from "./LinhaDeControle";
export {
  Popout,
  usePosicaoFlutuante,
  calcularPosicaoFlutuante,
  type PopoutProps,
  type LadoDoPopout,
  type AlinhamentoDoPopout,
  type Retangulo,
  type AncoraDoPopout,
  type PosicaoCalculada,
  type PosicaoFlutuante,
  type OpcoesDePosicao,
} from "./Popout";
export { Modal, type ModalProps, type TamanhoDeModal } from "./Modal";
export { Tabs, type TabsProps, type AbaDeTabs } from "./Tabs";
export { Badge, type BadgeProps, type TomDoBadge } from "./Badge";
export { Divider, type DividerProps } from "./Divider";
