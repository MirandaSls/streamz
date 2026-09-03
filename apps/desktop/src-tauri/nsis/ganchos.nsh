; Ganchos do instalador NSIS (bundle.windows.nsis.installerHooks).
;
; Este arquivo NÃO é copiado pelo tauri-bundler: ele resolve o caminho para
; absoluto e o `installer.nsi` faz `!include` dele onde ele está, aqui no
; repositório. É exatamente por isso que ele existe — é o único gancho do
; bundler por onde um caminho absoluto de um arquivo NOSSO entra no script.
;
; `${__FILEDIR__}` é a pasta deste arquivo, com o separador no fim (foi
; conferido: o makensis 3.11 devolve `.../nsis/`). Barra normal e não
; contrabarra porque o makensis aceita as duas no Windows, e assim o mesmo
; caminho compila também no teste de fumaça em Linux.
!define STREAMZ_ARTE_AVI "${__FILEDIR__}anim/instalando.avi"
!define STREAMZ_ARTE_PARADO "${__FILEDIR__}anim/quadro-07.bmp"

; Nenhum NSIS_HOOK_* por enquanto. Se um dia precisar de um (PREINSTALL,
; POSTINSTALL, PREUNINSTALL, POSTUNINSTALL), o lugar é aqui:
;
;   !macro NSIS_HOOK_POSTINSTALL
;     DetailPrint "..."
;   !macroend
