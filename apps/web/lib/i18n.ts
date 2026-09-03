"use client";

import { useSettings, type Locale } from "@/stores/settings";

/**
 * Dicionário mínimo pt-BR / en-US.
 *
 * O app inteiro é escrito em pt-BR (convenção do projeto): o que existe aqui é
 * a **estrutura** de tradução e os textos das telas de configuração, que são as
 * que oferecem a troca de idioma. Traduzir o resto é acrescentar chaves — não
 * mudar arquitetura.
 *
 * `pt-BR` é a fonte da verdade das chaves: `Dicionario` é derivado dele, então
 * esquecer uma chave em `en-US` quebra o typecheck, e não a tela.
 */

const PT_BR = {
  // ── shell ──
  "config.titulo": "Configurações",
  "config.grupoUsuario": "Configurações de usuário",
  "config.grupoApp": "Configurações do app",
  "config.grupoAdmin": "Administração",
  "config.fechar": "Fechar",
  "config.sair": "Sair",
  "config.versao": "Versão",
  "config.restaurar": "Restaurar padrões",

  // ── abas ──
  "aba.conta": "Minha conta",
  "aba.perfil": "Perfil",
  "aba.privacidade": "Privacidade e segurança",
  "aba.sessoes": "Dispositivos",
  "aba.aparencia": "Aparência",
  "aba.acessibilidade": "Acessibilidade",
  "aba.voz": "Voz e vídeo",
  "aba.notificacoes": "Notificações",
  "aba.teclado": "Teclado",
  "aba.idioma": "Idioma",

  // ── abas do painel do administrador da instância ──
  "aba.adminVisao": "Visão geral",
  "aba.adminUsuarios": "Usuários",
  "aba.adminChamadas": "Chamadas",
  "aba.adminMensagens": "Mensagens",
  "aba.adminServidores": "Servidores",

  // ── aparência ──
  "aparencia.tema": "Tema",
  "aparencia.escuro": "Escuro",
  "aparencia.claro": "Claro",
  "aparencia.emBreve": "em breve",
  "aparencia.escalaFonte": "Escala da fonte",
  "aparencia.espacoGrupos": "Espaço entre grupos de mensagens",
  "aparencia.modoCompacto": "Modo compacto",
  "aparencia.modoCompactoAjuda": "Mensagens sem avatar, com a hora à esquerda.",
  "aparencia.zoom": "Zoom do app",
  "aparencia.zoomAjuda": "Também dá para usar Ctrl + = e Ctrl + −.",
  "aparencia.previa": "Prévia",
  "aparencia.mensagens": "Mensagens",

  // ── acessibilidade ──
  "notif.sons": "Sons",
  "conta.secMinhaConta": "Minha conta",
  "conta.secSenha": "Senha e autenticação",
  "conta.secEncerrar": "Encerrar a conta",
  "config.relacionadas": "Configurações relacionadas",
  "config.editarPerfil": "Editar perfil",
  "acess.secLegibilidade": "Legibilidade do texto",
  "acess.secCor": "Cor e contraste",
  "acess.secMovimento": "Movimento reduzido",
  "acess.secChat": "Caixa de chat",
  "acess.reduzirMovimento": "Reduzir movimento",
  "acess.reduzirMovimentoAjuda": "Desliga transições e animações da interface.",
  "acess.saturacao": "Saturação das cores",
  "acess.mostrarHora": "Sempre mostrar a hora nas mensagens",
  "acess.tamanhoEmoji": "Tamanho do emoji",
  "acess.enviarCom": "Enviar mensagem com",
  "acess.enter": "Enter",
  "acess.ctrlEnter": "Ctrl + Enter",

  // ── voz ──
  "voz.entrada": "Dispositivo de entrada",
  "voz.processamento": "Processamento de voz",
  "voz.ruido": "Redução de ruído",
  "voz.ruidoOff": "Desligada",
  "voz.ruidoPadrao": "Padrão",
  "voz.ruidoAvancada": "Avançada",
  "voz.ruidoAjuda":
    "A avançada roda uma rede neural no seu computador e tira teclado, ventilador e ar-condicionado — em troca de mais CPU. A padrão é a do navegador.",
  "voz.eco": "Cancelamento de eco",
  "voz.ganho": "Controle automático de ganho",
  "voz.saida": "Dispositivo de saída",
  "voz.camera": "Câmera",
  "voz.volumeEntrada": "Volume de entrada",
  "voz.volumeSaida": "Volume de saída",
  "voz.modo": "Modo de transmissão",
  "voz.atividade": "Atividade de voz",
  "voz.ptt": "Apertar para falar",
  "voz.pttTecla": "Tecla do apertar para falar",
  "voz.testarMic": "Vamos conferir",
  "voz.testar": "Testar microfone",
  "voz.parar": "Parar teste",
  "voz.tela": "Compartilhar tela",
  "voz.telaAudio": "Compartilhar áudio do sistema",
  "voz.telaAudioAjuda": "Leva o som do que está tocando junto com a imagem.",
  "voz.previaCamera": "Prévia da câmera",
  "voz.ligarCamera": "Ligar câmera",
  "voz.desligarCamera": "Desligar câmera",
  "voz.semPermissao": "Sem permissão de mídia. Autorize o microfone/câmera no navegador.",
  "voz.padraoSistema": "Padrão do sistema",
  "voz.dispositivos": "Dispositivos",
  "voz.gravarTecla": "Gravar atalho",
  "voz.apertePara": "Aperte a combinação…",

  // ── notificações ──
  "notif.desktop": "Notificações da área de trabalho",
  "notif.som": "Som de notificação",
  "notif.badge": "Contador no ícone do app",
  "notif.dnd": "“Não perturbe” silencia tudo",
  "notif.dndAjuda": "Nem menções notificam enquanto o status for Não perturbe.",
  "notif.padrao": "Padrão para servidores e conversas",
  "notif.tudo": "Todas as mensagens",
  "notif.mencoes": "Apenas @menções",
  "notif.nada": "Nada",
  "notif.silenciar": "Silenciar",
  "notif.dessilenciar": "Dessilenciar",
  "notif.por15": "Por 15 minutos",
  "notif.por60": "Por 1 hora",
  "notif.por480": "Por 8 horas",
  "notif.por1440": "Por 24 horas",
  "notif.ateReativar": "Até eu reativar",
  "notif.silenciadoAte": "Silenciado até",
  "notif.tocarSom": "Tocar som",
  "notif.esteDispositivo": "Neste dispositivo",

  // ── teclado ──
  "teclado.intro": "Os atalhos abaixo valem em qualquer tela do app.",
  "atalho.quickSwitcher": "Abrir a busca rápida",
  "atalho.caixaDeEntrada": "Abrir a caixa de entrada",
  "atalho.canalAnterior": "Canal anterior",
  "atalho.canalProximo": "Próximo canal",
  "atalho.naoLidoAnterior": "Canal não lido anterior",
  "atalho.naoLidoProximo": "Próximo canal não lido",
  "atalho.servidorAnterior": "Servidor anterior",
  "atalho.servidorProximo": "Próximo servidor",
  "atalho.marcarLido": "Marcar canal como lido / fechar o que estiver aberto",
  "atalho.marcarServidorLido": "Marcar o servidor inteiro como lido",
  "atalho.alternarMudo": "Silenciar / reativar o microfone",
  "atalho.alternarSurdo": "Desativar / reativar o áudio",
  "atalho.configuracoes": "Abrir as configurações",
  "atalho.mostrarAtalhos": "Mostrar estes atalhos",
  "atalho.zoomMais": "Aumentar o zoom",
  "atalho.zoomMenos": "Diminuir o zoom",
  "atalho.zoomPadrao": "Zoom padrão",

  // ── idioma ──
  "idioma.escolha": "Idioma do app",
  "idioma.ajuda": "Vale para as telas de configuração; o resto do app segue em português.",

  // ── sessões ──
  "sessoes.intro": "Aqui estão todos os dispositivos com a sua sessão aberta.",
  "sessoes.atual": "Este dispositivo",
  "sessoes.encerrar": "Encerrar",
  "sessoes.encerrarTudo": "Encerrar todas as outras",
  "sessoes.vazio": "Nenhuma outra sessão ativa.",
  "sessoes.indisponivel": "A lista de sessões ainda não está disponível nesta API.",
  "sessoes.desde": "Iniciada em",
  "sessoes.expira": "Expira em",

  // ── busca rápida ──
  "quick.titulo": "Para onde vamos?",
  "quick.placeholder": "Onde você quer ir?",
  "quick.vazio": "Nada encontrado.",
  "quick.recentes": "Recentes",
} as const;

export type ChaveDeTexto = keyof typeof PT_BR;
type Dicionario = Record<ChaveDeTexto, string>;

const EN_US: Dicionario = {
  "config.titulo": "Settings",
  "config.grupoUsuario": "User settings",
  "config.grupoApp": "App settings",
  "config.grupoAdmin": "Administration",
  "config.fechar": "Close",
  "config.sair": "Log out",
  "config.versao": "Version",
  "config.restaurar": "Reset to defaults",

  "aba.conta": "My account",
  "aba.perfil": "Profile",
  "aba.privacidade": "Privacy & safety",
  "aba.sessoes": "Devices",
  "aba.aparencia": "Appearance",
  "aba.acessibilidade": "Accessibility",
  "aba.voz": "Voice & video",
  "aba.notificacoes": "Notifications",
  "aba.teclado": "Keybinds",
  "aba.idioma": "Language",

  "aba.adminVisao": "Overview",
  "aba.adminUsuarios": "Users",
  "aba.adminChamadas": "Calls",
  "aba.adminMensagens": "Messages",
  "aba.adminServidores": "Servers",

  "aparencia.tema": "Theme",
  "aparencia.escuro": "Dark",
  "aparencia.claro": "Light",
  "aparencia.emBreve": "coming soon",
  "aparencia.escalaFonte": "Font scale",
  "aparencia.espacoGrupos": "Space between message groups",
  "aparencia.modoCompacto": "Compact mode",
  "aparencia.modoCompactoAjuda": "Messages without avatars, timestamp on the left.",
  "aparencia.zoom": "App zoom",
  "aparencia.zoomAjuda": "You can also use Ctrl + = and Ctrl + −.",
  "aparencia.previa": "Preview",
  "aparencia.mensagens": "Messages",

  "notif.sons": "Sounds",
  "conta.secMinhaConta": "My account",
  "conta.secSenha": "Password and authentication",
  "conta.secEncerrar": "Close account",
  "config.relacionadas": "Related settings",
  "config.editarPerfil": "Edit profile",
  "acess.secLegibilidade": "Text readability",
  "acess.secCor": "Color and contrast",
  "acess.secMovimento": "Reduced motion",
  "acess.secChat": "Chat box",
  "acess.reduzirMovimento": "Reduce motion",
  "acess.reduzirMovimentoAjuda": "Turns off interface transitions and animations.",
  "acess.saturacao": "Color saturation",
  "acess.mostrarHora": "Always show message timestamps",
  "acess.tamanhoEmoji": "Emoji size",
  "acess.enviarCom": "Send message with",
  "acess.enter": "Enter",
  "acess.ctrlEnter": "Ctrl + Enter",

  "voz.entrada": "Input device",
  "voz.processamento": "Voice processing",
  "voz.ruido": "Noise suppression",
  "voz.ruidoOff": "Off",
  "voz.ruidoPadrao": "Standard",
  "voz.ruidoAvancada": "Advanced",
  "voz.ruidoAjuda":
    "Advanced runs a neural network on your computer and removes keyboard, fan and air conditioning noise — at the cost of more CPU. Standard is the browser's own.",
  "voz.eco": "Echo cancellation",
  "voz.ganho": "Automatic gain control",
  "voz.saida": "Output device",
  "voz.camera": "Camera",
  "voz.volumeEntrada": "Input volume",
  "voz.volumeSaida": "Output volume",
  "voz.modo": "Input mode",
  "voz.atividade": "Voice activity",
  "voz.ptt": "Push to talk",
  "voz.pttTecla": "Push to talk shortcut",
  "voz.testarMic": "Let us check",
  "voz.testar": "Test microphone",
  "voz.parar": "Stop testing",
  "voz.tela": "Screen share",
  "voz.telaAudio": "Share system audio",
  "voz.telaAudioAjuda": "Sends whatever is playing along with the picture.",
  "voz.previaCamera": "Camera preview",
  "voz.ligarCamera": "Turn on camera",
  "voz.desligarCamera": "Turn off camera",
  "voz.semPermissao": "No media permission. Allow the microphone/camera in your browser.",
  "voz.padraoSistema": "System default",
  "voz.dispositivos": "Devices",
  "voz.gravarTecla": "Record shortcut",
  "voz.apertePara": "Press the combination…",

  "notif.desktop": "Desktop notifications",
  "notif.som": "Notification sound",
  "notif.badge": "Badge on the app icon",
  "notif.dnd": "“Do not disturb” silences everything",
  "notif.dndAjuda": "Not even mentions notify while your status is Do not disturb.",
  "notif.padrao": "Default for servers and conversations",
  "notif.tudo": "All messages",
  "notif.mencoes": "Only @mentions",
  "notif.nada": "Nothing",
  "notif.silenciar": "Mute",
  "notif.dessilenciar": "Unmute",
  "notif.por15": "For 15 minutes",
  "notif.por60": "For 1 hour",
  "notif.por480": "For 8 hours",
  "notif.por1440": "For 24 hours",
  "notif.ateReativar": "Until I turn it back on",
  "notif.silenciadoAte": "Muted until",
  "notif.tocarSom": "Play sound",
  "notif.esteDispositivo": "On this device",

  "teclado.intro": "These shortcuts work anywhere in the app.",
  "atalho.quickSwitcher": "Open quick switcher",
  "atalho.caixaDeEntrada": "Open the inbox",
  "atalho.canalAnterior": "Previous channel",
  "atalho.canalProximo": "Next channel",
  "atalho.naoLidoAnterior": "Previous unread channel",
  "atalho.naoLidoProximo": "Next unread channel",
  "atalho.servidorAnterior": "Previous server",
  "atalho.servidorProximo": "Next server",
  "atalho.marcarLido": "Mark channel read / close what is open",
  "atalho.marcarServidorLido": "Mark the whole server read",
  "atalho.alternarMudo": "Mute / unmute the microphone",
  "atalho.alternarSurdo": "Deafen / undeafen",
  "atalho.configuracoes": "Open settings",
  "atalho.mostrarAtalhos": "Show these shortcuts",
  "atalho.zoomMais": "Zoom in",
  "atalho.zoomMenos": "Zoom out",
  "atalho.zoomPadrao": "Reset zoom",

  "idioma.escolha": "App language",
  "idioma.ajuda": "Applies to the settings screens; the rest of the app stays in Portuguese.",

  "sessoes.intro": "Here is every device with an open session of yours.",
  "sessoes.atual": "This device",
  "sessoes.encerrar": "End session",
  "sessoes.encerrarTudo": "End all other sessions",
  "sessoes.vazio": "No other active sessions.",
  "sessoes.indisponivel": "This API does not expose the session list yet.",
  "sessoes.desde": "Started on",
  "sessoes.expira": "Expires on",

  "quick.titulo": "Where to?",
  "quick.placeholder": "Where would you like to go?",
  "quick.vazio": "Nothing found.",
  "quick.recentes": "Recent",
};

const DICIONARIOS: Record<Locale, Dicionario> = { "pt-BR": PT_BR, "en-US": EN_US };

/** Nome de cada idioma, no próprio idioma (como o Discord lista). */
export const NOMES_DE_IDIOMA: Record<Locale, string> = {
  "pt-BR": "Português do Brasil",
  "en-US": "English (US)",
};

export const LOCALES = Object.keys(NOMES_DE_IDIOMA) as Locale[];

/** Traduz uma chave num idioma específico (útil fora de componentes). */
export function traduzir(locale: Locale, chave: ChaveDeTexto): string {
  return DICIONARIOS[locale][chave] ?? DICIONARIOS["pt-BR"][chave];
}

/** Hook das telas: devolve o tradutor já preso ao idioma escolhido. */
export function useT(): (chave: ChaveDeTexto) => string {
  const locale = useSettings((s) => s.locale);
  return (chave) => traduzir(locale, chave);
}
