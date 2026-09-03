; Ganchos do instalador NSIS (bundle.windows.nsis.installerHooks).
;
; Este arquivo NÃO é copiado pelo tauri-bundler: ele resolve o caminho para
; absoluto e o `installer.nsi` faz `!include` dele onde ele está, aqui no
; repositório. É exatamente por isso que ele existe — é o único gancho do
; bundler por onde um caminho absoluto de um arquivo NOSSO entra no script.
;
; `${__FILEDIR__}` é a pasta deste arquivo, SEM o separador no fim no
; makensis do Windows (o build da 0.0.13 falhou com `src-tauri\nsisanim/...`).
; O separador vai explícito e em CONTRABARRA: com barra normal o makensis do
; Windows respondeu `no files found` para `...\nsis/anim/instalando.avi`
; mesmo com o arquivo lá (o `File` resolve o diretório pelo `\`). No teste
; de fumaça em Linux o makensis converte `\` em `/` nos caminhos do `File`.
!define STREAMZ_ARTE_AVI "${__FILEDIR__}\anim\instalando.avi"
!define STREAMZ_ARTE_PARADO "${__FILEDIR__}\anim\quadro-07.bmp"

; Nenhum NSIS_HOOK_* por enquanto. Se um dia precisar de um (PREINSTALL,
; POSTINSTALL, PREUNINSTALL, POSTUNINSTALL), o lugar é aqui:
;
;   !macro NSIS_HOOK_POSTINSTALL
;     DetailPrint "..."
;   !macroend
