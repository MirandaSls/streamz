; ===========================================================================
; Instalador do Streamz.
;
; ISTO É UM FORK do template oficial do tauri-bundler, da tag
; `tauri-cli-v2.11.4` (a versão presa no pnpm-lock.yaml):
;   crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi
;
; Ele continua sendo um template do Handlebars: as expressões entre chaves duplas são preenchidas pelo
; bundler na hora de gerar o .nsi de verdade. Toda linha nossa está marcada com
; `streamz:` — o resto é idêntico ao original de propósito, porque é aí que
; moram o contrato do updater (`/UPDATE`, `/P`, `/S`, `/R`, `/NS`), os hooks
; (`NSIS_HOOK_*`) e a migração de instalações antigas do WiX.
;
; **Ao subir a versão do @tauri-apps/cli, refaça o diff contra o installer.nsi
; da tag nova.** Um template preso numa versão velha quebra em silêncio: o
; instalador compila e o updater é que para de funcionar.
;
; Ver docs/PROCESSO-DE-DESENVOLVIMENTO.md §5.
; ===========================================================================

Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

; Keep above !include to stay ahead of any plugin command
; see https://github.com/tauri-apps/tauri/pull/15422#discussion_r3289239624
{{#if signed_plugins_path}}
!addplugindir "{{signed_plugins_path}}"
{{/if}}

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define UNINSTALLERHEADERIMAGE "{{uninstaller_header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"

; --------------------------------------------------------------- streamz ---
; `STREAMZ_ARTE_*` são os caminhos absolutos da animação e vêm do
; `nsis/ganchos.nsh` (`bundle.windows.nsis.installerHooks`) — o único ponto por
; onde o bundler entrega um caminho absoluto de arquivo NOSSO para dentro do
; script. Absoluto é obrigatório: o .nsi renderizado é gravado na pasta de
; saída do build, então um `File "nsis/anim/..."` relativo procuraria a arte
; lá dentro, e não aqui no repositório.
!ifndef STREAMZ_ARTE_AVI
  ; Sem os ganchos não dá para achar a arte. O instalador continua inteiro;
  ; só perde o ícone animado.
  !warning "streamz: `installerHooks` não configurado — a página de instalação sai sem animação."
  !define STREAMZ_SEM_ANIMACAO
!endif

; Paleta da marca (apps/web/tailwind.config.ts). Em hexadecimal sem `#`, que é
; o formato do MUI.
!define STREAMZ_FUNDO   "1A1A20" ; `chat`
!define STREAMZ_TEXTO   "FDFDFB" ; `txt-primary`
!define STREAMZ_LOG     "D8D8D4" ; `txt-normal`
; A barra de progresso não usa MUI: ela quer COLORREF (0x00BBGGRR), que é o
; hexadecimal invertido.
!define STREAMZ_BARRA        0x1FE39B ; #9BE31F, Volt Lime
!define STREAMZ_BARRA_FUNDO  0x201A1A ; #1A1A20

; Constantes do Win32. `/ifndef` porque parte delas já chega pelo WinCore.nsh /
; nsDialogs.nsh dependendo da versão do NSIS, e redefinir é erro.
!define /ifndef SW_HIDE 0
!define /ifndef SW_SHOW 5
!define /ifndef HWND_BOTTOM 1
!define /ifndef WS_CHILD 0x40000000
!define /ifndef WS_VISIBLE 0x10000000
!define /ifndef SS_BITMAP 0x0000000E
!define /ifndef SS_CENTERIMAGE 0x00000200
!define /ifndef SWP_NOSIZE 0x0001
!define /ifndef SWP_NOMOVE 0x0002
!define /ifndef SWP_NOZORDER 0x0004
!define /ifndef SWP_NOACTIVATE 0x0010
!define /ifndef PBM_SETBARCOLOR 0x0409 ; WM_USER + 9
!define /ifndef PBM_SETBKCOLOR 0x2001  ; CCM_SETBKCOLOR
; SysAnimate32 (comctl32). Nenhum .nsh padrão traz estas — ver
; https://learn.microsoft.com/windows/win32/controls/animation-control-reference
!define /ifndef ACS_CENTER 0x0001
!define /ifndef ACS_AUTOPLAY 0x0004
!define /ifndef ACM_STOP 0x0466  ; WM_USER + 102
!define /ifndef ACM_OPENW 0x0467 ; WM_USER + 103 (a versão Unicode; o script é `Unicode true`)

Var StreamzAnim       ; HWND do SysAnimate32 tocando o pulso do ícone
Var StreamzParado     ; HWND do STATIC com o quadro parado (plano B)
Var StreamzBitmap     ; HBITMAP desse quadro, para liberar depois
Var StreamzFundo      ; HWND do retângulo que escurece a página de instalação

; Pinta um controle com as cores da marca depois de desligar o tema visual.
; Sem desligar o tema, o Windows desenha botão, caixa de grupo e barra de
; progresso com as cores dele e ignora SetCtlColors e PBM_SETBARCOLOR.
!macro StreamzSemTema HWND
  System::Call 'uxtheme::SetWindowTheme(p ${HWND}, w " ", w " ")'
!macroend

; Pega um filho do diálogo por ID e pinta. Silencioso se o controle não
; existir: os IDs mudam entre versões do NSIS e uma página torta é melhor que
; um instalador que não abre.
!macro StreamzPintarFilho DIALOGO ID
  GetDlgItem $9 ${DIALOGO} ${ID}
  ${If} $9 <> 0
    SetCtlColors $9 "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}"
  ${EndIf}
!macroend
; ------------------------------------------------------------ /streamz ---

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Enable header images for installer and uninstaller pages when either image is configured.
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!else if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
!endif

; Uninstaller header image
!if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${UNINSTALLERHEADERIMAGE}"
!endif

; Uninstaller icon
!if "${UNINSTALLERICON}" != ""
  !define MUI_UNICON "${UNINSTALLERICON}"
!endif

; --------------------------------------------------------------- streamz ---
; O MUI2 aplica MUI_BGCOLOR/MUI_TEXTCOLOR sozinho na faixa do cabeçalho
; (Interface.nsh) e na página de boas-vindas (Pages/Welcome.nsh, que é
; nsDialogs). As páginas nativas — diretório e instalação — não têm essa
; alça e são escurecidas à mão, em `EscurecerDiretorio` e `MostrarInstalacao`.
;
; Precisa vir ANTES da primeira `!insertmacro MUI_PAGE_*`: é ela que dispara o
; MUI_INTERFACE, e o MUI_DEFAULT só vale para quem ainda não foi definido.
!define MUI_BGCOLOR "${STREAMZ_FUNDO}"
!define MUI_TEXTCOLOR "${STREAMZ_TEXTO}"
; Cores do log da página de instalação (que fica escondido, mas aparece em
; `makensis /V4` e em quem clicar em "Mostrar detalhes" via teclado).
!define MUI_INSTFILESPAGE_COLORS "${STREAMZ_LOG} ${STREAMZ_FUNDO}"
; `smooth` = PBS_SMOOTH, a barra contínua em vez dos blocos de Windows 95.
; De propósito SEM `colored`: a cor da barra é aplicada em MostrarInstalacao,
; que também desliga o tema visual — sem isso o Windows ignora a cor.
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
; Extrai a animação para o $PLUGINSDIR. O NSIS não chama .onGUIInit em modo
; /S, então a instalação silenciosa do updater não paga por isso.
!define MUI_CUSTOMFUNCTION_GUIINIT StreamzIniciarGUI
; ------------------------------------------------------------ /streamz ---

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
; streamz: texto próprio, em pt-BR e inglês (LangString lá embaixo, depois dos
; idiomas). O resto das páginas usa a tradução que vem com o MUI.
!define MUI_WELCOMEPAGE_TITLE "$(streamzBoasVindasTitulo)"
!define MUI_WELCOMEPAGE_TEXT "$(streamzBoasVindasTexto)"
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  ;
  ; A WiX installer stores the installation info in registry
  ; using a UUID and so we have to loop through all keys under
  ; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
  ; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
  ;
  ; This has a potential issue that there maybe another installation that matches
  ; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
  ; however, this should be fine since the user will have to confirm the uninstallation
  ; and they can chose to abort it if doesn't make sense.
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $WixMode 1
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
    Goto compare_version
  wix_loop_done:

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installar version with the existing installation
  ; and modify the messages presented to the user accordingly
  compare_version:
  StrCpy $R4 "$(older)"
  ${If} $WixMode = 1
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0
  ; Reinstalling the same version
  ${If} $R0 = 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
  ; Upgrading
  ${ElseIf} $R0 = 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ; Downgrading
  ${ElseIf} $R0 = -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ${Else}
    Abort
  ${EndIf}

  ; Skip showing the page if passive
  ;
  ; Note that we don't call this earlier at the begining
  ; of this function because we need to populate some variables
  ; related to current installed version if detected and whether
  ; we are downgrading or not.
  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}
    SetCtlColors $R4 "" "${STREAMZ_FUNDO}" ; streamz

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1
    SetCtlColors $R1 "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}" ; streamz

    ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
    Pop $R2
    ; streamz: rádio com tema ligado é desenhado pelo Windows, que pinta o
    ; rótulo em cinza-escuro e não olha o SetCtlColors — sumiria no fundo.
    !insertmacro StreamzSemTema $R2
    SetCtlColors $R2 "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}"
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
    Pop $R3
    !insertmacro StreamzSemTema $R3 ; streamz
    SetCtlColors $R3 "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}" ; streamz
    ; Disable this radio button if downgrading and downgrades are disabled
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ; Check the first radio button if this the first time
    ; we enter this page or if the second button wasn't
    ; selected the last time we were on this page
    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; If migrating from Wix, always uninstall
  ${If} $WixMode = 1
    Goto reinst_uninstall
  ${EndIf}

  ; In update mode, always proceeds without uninstalling
  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ; $R0 holds whether same(0)/upgrading(1)/downgrading(-1) version
  ; $R1 holds the radio buttons state:
  ;   1 => first choice was selected
  ;   0 => second choice was selected
  ${If} $R0 = 0 ; Same version, proceed
    ${If} $R1 = 1              ; User chose to add/reinstall
      Goto reinst_done
    ${Else}                    ; User chose to uninstall
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R0 = 1 ; Upgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${ElseIf} $R0 = -1 ; Downgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${EndIf}

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $WixMode = 1
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|} ; append /UPDATE
      ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|} ; append /P
      StrCpy $R1 "$R1 _?=$4" ; append uninstall directory
      ExecWait '$R1' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ; User cancelled wix uninstaller? return to select un/reinstall page
      ${If} $WixMode = 1
      ${AndIf} $0 = 1602
        Abort
      ${EndIf}

      ; User cancelled NSIS uninstaller? return to select un/reinstall page
      ${If} $0 = 1
        Abort
      ${EndIf}

      ; Other erros? show generic error message and return to select un/reinstall page
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${EndIf}
  reinst_done:
FunctionEnd

; 5. Choose install directory page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_CUSTOMFUNCTION_SHOW EscurecerDiretorio ; streamz
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
Var AppStartMenuFolder
!if "${STARTMENUFOLDER}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"
!else
  !define MUI_PAGE_CUSTOMFUNCTION_PRE Skip
!endif
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page
; streamz: é aqui que mora o ícone animado; ver `MostrarInstalacao`.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW MostrarInstalacao
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE SairInstalacao
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page — REMOVIDA (streamz)
;
; O original terminava numa página de conclusão com duas caixinhas ("criar
; atalho na área de trabalho" e "executar agora") e um botão Concluir. O
; pedido aqui é o contrário: o instalador se fecha sozinho e o app abre.
; Quem faz as três coisas que a página fazia:
;   - fechar sozinho ....... `SetAutoClose true` no fim da `Section Install`
;   - atalho na área de trabalho ... `Call CreateOrUpdateDesktopShortcut`, também
;     na `Section Install` (a caixinha vinha marcada por padrão, então criar
;     sempre é o mesmo comportamento de antes)
;   - abrir o app .......... `.onInstSuccess`
;
; O comentário do template original defende a página de conclusão dizendo que
; a página de instalação tem informação útil para depurar. Isso continua
; valendo: `SetAutoClose true` é a ÚLTIMA linha da seção, então uma instalação
; que aborta no meio nunca chega lá e a janela fica na tela com o erro.

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; Uninstaller Pages
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow ; Add add a `Delete app data` check box
  ; $1 inner dialog HWND
  ; $2 window DPI
  ; $3 style
  ; $4 x
  ; $5 y
  ; $6 width
  ; $7 height
  FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
  System::Call "user32::GetDpiForWindow(p r1) i .r2"
  ${If} $(^RTL) = 1
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $4 50 * $2
  ${Else}
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $4 0 * $2
  ${EndIf}
  IntOp $5 100 * $2
  IntOp $6 400 * $2
  IntOp $7 25 * $2
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  IntOp $7 $7 / 96
  System::Call 'user32::CreateWindowEx(i r3, w "${__NSD_CheckBox_CLASS}", w "$(deleteAppData)", i ${__NSD_CheckBox_STYLE}, i r4, i r5, i r6, i r7, p r1, i0, i0, i0) i .s'
  Pop $DeleteAppDataCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
  SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

; --------------------------------------------------------------- streamz ---
; Textos próprios. O `!ifdef` existe porque a lista de idiomas vem do
; `tauri.conf.json` (`bundle.windows.nsis.languages`, hoje PortugueseBR e
; English): se alguém tirar um dos dois daqui, o build continua.
!ifdef LANG_PORTUGUESEBR
  LangString streamzBoasVindasTitulo ${LANG_PORTUGUESEBR} "Bem-vindo ao ${PRODUCTNAME}"
  LangString streamzBoasVindasTexto ${LANG_PORTUGUESEBR} "Este assistente instala o ${PRODUCTNAME} ${VERSION} neste computador.$\r$\n$\r$\nSão dois passos: escolher a pasta e esperar. Quando terminar, o instalador se fecha sozinho e o ${PRODUCTNAME} abre.$\r$\n$\r$\nClique em Avançar para continuar."
!endif
!ifdef LANG_ENGLISH
  LangString streamzBoasVindasTitulo ${LANG_ENGLISH} "Welcome to ${PRODUCTNAME}"
  LangString streamzBoasVindasTexto ${LANG_ENGLISH} "This wizard will install ${PRODUCTNAME} ${VERSION} on this computer.$\r$\n$\r$\nTwo steps: pick a folder and wait. When it is done the installer closes itself and ${PRODUCTNAME} starts.$\r$\n$\r$\nClick Next to continue."
!endif
; ------------------------------------------------------------ /streamz ---

Function .onInit
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd


Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
    ; If downgrading
    ${If} $R0 = -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 <> 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$INSTDIR\${MAINBINARYNAME}.exe,0" "Open with ${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; streamz: no original isto só valia para /S e /P, porque a página de
  ; conclusão cuidava do caso com janela. Sem ela, vale sempre — e a função
  ; continua se recusando a criar atalho em atualização (/UPDATE) e com /NS.
  Call CreateOrUpdateDesktopShortcut

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; streamz: fecha sozinho em toda instalação que termina bem — era só no modo
  ; passivo. Fica na última linha da seção de propósito: instalação que aborta
  ; não passa por aqui, e a janela continua na tela mostrando o erro.
  ;
  ; Por que não `AutoCloseWindow true` no topo do arquivo: aquele atributo vale
  ; para o binário inteiro, e este .nsi também gera o DESINSTALADOR — que
  ; sumiria da tela antes de a pessoa ler o resultado.
  SetAutoClose true
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
    ${EndIf}
  ${Else}
    ; streamz: instalação com janela. Era a caixinha "executar agora" da página
    ; de conclusão que abria o app; sem ela, abrimos aqui.
    ;
    ; `$UpdateMode` fica de fora porque quem manda numa atualização é o
    ; tauri-plugin-updater: ele passa /UPDATE (e /R quando quer religar o app)
    ; e faz o relaunch por conta própria. Abrir aqui também daria duas
    ; instâncias — e o Streamz não é single-instance.
    ;
    ; `RunMainBinary` usa nsis_tauri_utils::RunAsUser, que é o jeito do Tauri
    ; de lançar o app como o USUÁRIO. `Exec` puro herdaria o token elevado
    ; deste instalador (installMode perMachine = RequestExecutionLevel admin) e
    ; o app rodaria como administrador — arrastar-e-soltar pararia de
    ; funcionar e a pasta de dados sairia no perfil errado.
    ${If} $UpdateMode <> 1
      Call RunMainBinary
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Delete app data if the checkbox is selected
  ; and if not updating
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; Clear the install location $INSTDIR from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Auto close if passive mode or updating
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd


; ===========================================================================
; streamz: tema escuro e ícone animado
; ===========================================================================

Function StreamzIniciarGUI
  ; Chamada pelo .onGUIInit do MUI (MUI_CUSTOMFUNCTION_GUIINIT). O NSIS não
  ; chama .onGUIInit em modo /S, então nada disto acontece numa instalação
  ; silenciosa.
!ifndef STREAMZ_SEM_ANIMACAO
  InitPluginsDir
  File "/oname=$PLUGINSDIR\instalando.avi" "${STREAMZ_ARTE_AVI}"
  File "/oname=$PLUGINSDIR\parado.bmp" "${STREAMZ_ARTE_PARADO}"
!endif
FunctionEnd


Function EscurecerDiretorio
  ; Página de diretório. É um diálogo nativo do NSIS (não nsDialogs), então o
  ; MUI_BGCOLOR não chega aqui sozinho.
  FindWindow $8 "#32770" "" $HWNDPARENT
  ${If} $8 = 0
    Return
  ${EndIf}
  SetCtlColors $8 "" "${STREAMZ_FUNDO}"
  ; IDs do IDD_DIR do NSIS: 1006 texto de introdução, 1020 caixa "Pasta de
  ; destino", 1019 campo do caminho, 1023/1024 espaço necessário/disponível.
  !insertmacro StreamzPintarFilho $8 1006
  !insertmacro StreamzPintarFilho $8 1019
  !insertmacro StreamzPintarFilho $8 1023
  !insertmacro StreamzPintarFilho $8 1024
  GetDlgItem $9 $8 1020
  ${If} $9 <> 0
    !insertmacro StreamzSemTema $9
    SetCtlColors $9 "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}"
  ${EndIf}
FunctionEnd


Function MostrarInstalacao
  ; Roda no callback SHOW da página de instalação, depois de o MUI preencher
  ; $mui.InstFilesPage* (Pages/InstallFiles.nsh) e ANTES de a thread de
  ; instalação começar.
  ;
  ; Só mexe em $0-$9: $R0 atravessa daqui (`PageReinstall` grava a comparação
  ; de versão nele e a `Section EarlyChecks` lê), e $R1-$R9 são da mesma
  ; família. Registrador baixo ninguém carrega entre página e seção.

  ; --- medidas ------------------------------------------------------------
  ; Windows 10 1607+; o template oficial já depende dela na confirmação da
  ; desinstalação. Se um dia falhar, 96 dpi é o mínimo razoável.
  System::Call "user32::GetDpiForWindow(p $mui.InstFilesPage) i .r2"
  ${If} $2 < 48
    StrCpy $2 96
  ${EndIf}

  System::Call "*(i, i, i, i) p .r1"
  System::Call "user32::GetClientRect(p $mui.InstFilesPage, p r1)"
  System::Call "*$1(i .r3, i .r4, i .r8, i .r9)" ; $8 = largura, $9 = altura
  System::Free $1
  ${If} $8 < 200
  ${OrIf} $9 < 100
    Return ; diálogo em tamanho inesperado: melhor não mexer em nada
  ${EndIf}

  ; --- fundo escuro -------------------------------------------------------
  ; Duas vias de propósito. SetCtlColors no diálogo resolve o caso comum; o
  ; STATIC vazio no fundo da pilha z garante a cor mesmo se o WM_CTLCOLORDLG
  ; não chegar — um static sem texto pinta o retângulo inteiro com o pincel
  ; que o SetCtlColors devolve.
  SetCtlColors $mui.InstFilesPage "" "${STREAMZ_FUNDO}"
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i ${WS_CHILD}|${WS_VISIBLE}, i 0, i 0, i r8, i r9, p $mui.InstFilesPage, i 0, i 0, i 0) p .r0'
  StrCpy $StreamzFundo $0
  ${If} $StreamzFundo <> 0
    SetCtlColors $StreamzFundo "" "${STREAMZ_FUNDO}"
    System::Call "user32::SetWindowPos(p $StreamzFundo, p ${HWND_BOTTOM}, i 0, i 0, i 0, i 0, i ${SWP_NOMOVE}|${SWP_NOSIZE}|${SWP_NOACTIVATE})"
  ${EndIf}

  ; --- fora o log ---------------------------------------------------------
  ; A lista de "Extract: ..." é ruído para quem instala. Ela continua sendo
  ; escrita, e o `SairInstalacao` a traz de volta se a instalação abortar — é
  ; nela que o NSIS escreve a mensagem de um `Abort "..."` (a seção do WebView2
  ; tem três).
  ShowWindow $mui.InstFilesPage.Log ${SW_HIDE}
  ShowWindow $mui.InstFilesPage.ShowLogButton ${SW_HIDE}

  ; --- barra de progresso -------------------------------------------------
  ; Medidas em pixels de 96 dpi, escaladas pelo DPI da janela.
  ; $3 = margem lateral (24), $4 = altura da barra (12), $5 = topo da barra
  ; (altura - 58), $6 = largura útil.
  IntOp $3 24 * $2
  IntOp $3 $3 / 96
  IntOp $4 12 * $2
  IntOp $4 $4 / 96
  IntOp $5 58 * $2
  IntOp $5 $5 / 96
  IntOp $5 $9 - $5
  IntOp $6 $8 - $3
  IntOp $6 $6 - $3
  System::Call "user32::SetWindowPos(p $mui.InstFilesPage.ProgressBar, p 0, i r3, i r5, i r6, i r4, i ${SWP_NOZORDER}|${SWP_NOACTIVATE})"
  ; A cor só cola com o tema visual desligado: com ele ligado o uxtheme
  ; desenha a barra verde do Windows e engole o PBM_SETBARCOLOR.
  !insertmacro StreamzSemTema $mui.InstFilesPage.ProgressBar
  SendMessage $mui.InstFilesPage.ProgressBar ${PBM_SETBARCOLOR} 0 ${STREAMZ_BARRA}
  SendMessage $mui.InstFilesPage.ProgressBar ${PBM_SETBKCOLOR} 0 ${STREAMZ_BARRA_FUNDO}

  ; --- rótulo de status (o "Extraindo: ..." de uma linha) ------------------
  ; $7 = topo (altura - 32), $0 = altura (16). Fica ABAIXO da barra.
  IntOp $7 32 * $2
  IntOp $7 $7 / 96
  IntOp $7 $9 - $7
  IntOp $0 16 * $2
  IntOp $0 $0 / 96
  System::Call "user32::SetWindowPos(p $mui.InstFilesPage.Text, p 0, i r3, i r7, i r6, i r0, i ${SWP_NOZORDER}|${SWP_NOACTIVATE})"
  SetCtlColors $mui.InstFilesPage.Text "${STREAMZ_TEXTO}" "${STREAMZ_FUNDO}"

!ifndef STREAMZ_SEM_ANIMACAO
  ; --- ícone animado ------------------------------------------------------
  ; SysAnimate32 e não um temporizador trocando bitmaps: o NSIS roda a
  ; instalação numa thread separada, e o `File` do executável principal é uma
  ; chamada única que bloqueia por segundos. Quem troca quadro em callback de
  ; script não desenha nada durante justamente o trecho que a animação existe
  ; para cobrir. O SysAnimate32 toca o AVI sozinho, no seu próprio relógio.
  ;
  ; (nsDialogs::CreateTimer não serve aqui: ele faz SetTimer no diálogo do
  ; nsDialogs, e nesta página não existe nenhum — o handle está zerado desde
  ; que a página de reinstalação fechou. Com HWND nulo o Windows gera um id
  ; próprio, e o TimerProc do plugin usa esse id como ENDEREÇO de código para
  ; executar. Ver Contrib/nsDialogs/nsDialogs.c, CreateTimer e TimerProc.)
  ;
  ; $7 = margem de cima, $0 = altura livre acima da barra.
  IntOp $7 12 * $2
  IntOp $7 $7 / 96
  IntOp $0 $5 - $7
  ${If} $0 >= 128
    IntOp $1 $8 - 128
    IntOp $1 $1 / 2      ; x centralizado
    IntOp $0 $0 - 128
    IntOp $0 $0 / 2
    IntOp $0 $0 + $7     ; y centralizado no espaço livre
    System::Call 'user32::CreateWindowEx(i 0, w "SysAnimate32", w "", i ${WS_CHILD}|${WS_VISIBLE}|${ACS_CENTER}|${ACS_AUTOPLAY}, i r1, i r0, i 128, i 128, p $mui.InstFilesPage, i 0, i 0, i 0) p .r4'
    StrCpy $StreamzAnim $4
    ${If} $StreamzAnim <> 0
      ; ACS_AUTOPLAY faz o clipe começar e repetir assim que abre.
      SendMessage $StreamzAnim ${ACM_OPENW} 0 "STR:$PLUGINSDIR\instalando.avi" $3
      ${If} $3 = 0
        ; O controle recusou o AVI. Plano B: o quadro do meio, parado. Ícone
        ; quieto é melhor que retângulo vazio.
        System::Call "user32::DestroyWindow(p $StreamzAnim)"
        StrCpy $StreamzAnim 0
        System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i ${WS_CHILD}|${WS_VISIBLE}|${SS_BITMAP}|${SS_CENTERIMAGE}, i r1, i r0, i 128, i 128, p $mui.InstFilesPage, i 0, i 0, i 0) p .r4'
        StrCpy $StreamzParado $4
        ${If} $StreamzParado <> 0
          ${NSD_SetImage} $StreamzParado "$PLUGINSDIR\parado.bmp" $StreamzBitmap
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!endif
FunctionEnd


Function SairInstalacao
  ; Numa página `instfiles` o NSIS chama o callback de saída assim que a
  ; execução das seções termina — dando certo ou abortando —, e não quando a
  ; pessoa clica em algum botão. É por isso que dá para decidir aqui o que
  ; fazer com o erro.
  IfAbort StreamzAbortou

  Goto StreamzLimpar

  StreamzAbortou:
    ; A instalação abortou. A explicação (`Abort "$(webview2AbortError)"` e
    ; companhia) foi escrita no log, que está escondido — sem isto a pessoa
    ; ficaria olhando uma barra parada sem nenhum texto. Traz o log de volta,
    ; ocupando o espaço que era da animação.
    ${If} $mui.InstFilesPage.Log <> 0
      System::Call "user32::GetDpiForWindow(p $mui.InstFilesPage) i .r2"
      ${If} $2 < 48
        StrCpy $2 96
      ${EndIf}
      System::Call "*(i, i, i, i) p .r1"
      System::Call "user32::GetClientRect(p $mui.InstFilesPage, p r1)"
      System::Call "*$1(i .r3, i .r4, i .r8, i .r9)"
      System::Free $1
      ; mesmas margens da barra: x = 24, topo = 12, base = topo da barra - 12
      IntOp $3 24 * $2
      IntOp $3 $3 / 96
      IntOp $4 12 * $2
      IntOp $4 $4 / 96
      IntOp $5 70 * $2
      IntOp $5 $5 / 96
      IntOp $5 $9 - $5      ; altura disponível = altura - 58 - 12
      IntOp $5 $5 - $4
      IntOp $6 $8 - $3
      IntOp $6 $6 - $3
      ${If} $5 > 0
        System::Call "user32::SetWindowPos(p $mui.InstFilesPage.Log, p 0, i r3, i r4, i r6, i r5, i ${SWP_NOZORDER}|${SWP_NOACTIVATE})"
      ${EndIf}
      ShowWindow $mui.InstFilesPage.Log ${SW_SHOW}
    ${EndIf}

  StreamzLimpar:
  ; Para o clipe e devolve o que foi alocado. Numa instalação que dá certo o
  ; processo morre logo depois (SetAutoClose); numa que aborta a janela fica
  ; viva, e um AVI pulsando atrás de uma mensagem de erro é ruim.
  ${If} $StreamzAnim <> 0
    SendMessage $StreamzAnim ${ACM_STOP} 0 0
    System::Call "user32::DestroyWindow(p $StreamzAnim)"
    StrCpy $StreamzAnim 0
  ${EndIf}
  ${If} $StreamzParado <> 0
    System::Call "user32::DestroyWindow(p $StreamzParado)"
    StrCpy $StreamzParado 0
    ${NSD_FreeImage} $StreamzBitmap
    StrCpy $StreamzBitmap 0
  ${EndIf}
FunctionEnd
