package dev.streamz.app

import android.Manifest
import android.app.Activity
import android.os.Build
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * A ponte entre o webview e o [ChamadaService].
 *
 * É um plugin do Tauri 2 mobile no formato da doc oficial
 * (<https://v2.tauri.app/develop/plugins/develop-mobile/>): uma classe anotada
 * com `@TauriPlugin`, métodos anotados com `@Command`, argumentos tipados com
 * `@InvokeArg`. O lado Rust (`src/chamada.rs`) a instancia por reflexão com
 * `register_android_plugin("dev.streamz.app", "ChamadaPlugin")` — daí a classe
 * poder morar no módulo do app em vez de num crate separado.
 *
 * **Por que o plugin não vive dentro do serviço.** Um `Service` não tem
 * webview, não tem `Activity` e não sabe pedir permissão. Quem faz essas três
 * coisas é a `Plugin`, que já nasce com a `Activity` na mão. O serviço fica só
 * com o que é dele: a notificação e o `startForeground`.
 *
 * O R8 não apaga esta classe mesmo com `isMinifyEnabled = true`: as regras de
 * consumo do `tauri-android` guardam `@TauriPlugin public class *` e
 * `@InvokeArg public class *` justamente porque as duas só são alcançadas por
 * reflexão.
 */
@TauriPlugin(
    permissions = [
        // Android 13+ (API 33): mostrar **qualquer** notificação virou permissão
        // de tempo de execução. O serviço de primeiro plano sobe do mesmo jeito
        // sem ela — o que não sobe é a notificação, e aí o usuário fica com uma
        // call segurando o microfone sem nenhuma pista na tela. É por isso que
        // se pede, e é por isso que negar não é motivo para desistir da call.
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = ALIAS_NOTIFICACAO),
    ],
)
class ChamadaPlugin(private val activity: Activity) : Plugin(activity) {

    /**
     * Os argumentos de `iniciarServicoDeChamada`. Os dois são obrigatórios
     * (`lateinit`): uma notificação persistente sem título nem texto seria
     * exatamente o tipo de notificação que o usuário aprende a ignorar.
     */
    @InvokeArg
    class ArgumentosDeInicio {
        lateinit var titulo: String
        lateinit var texto: String
    }

    /** O canal por onde o "Sair da chamada" volta para o webview. */
    @InvokeArg
    class ArgumentosDeOuvinte {
        lateinit var canal: Channel
    }

    /**
     * Guardado entre a chamada que pede a permissão e o callback que a recebe.
     * O `Invoke` original tem de sobreviver ao diálogo do sistema, senão o
     * `await` do lado JS nunca resolve.
     */
    private var inicioPendente: ArgumentosDeInicio? = null

    @Command
    fun iniciarServicoDeChamada(invoke: Invoke) {
        val args = invoke.parseArgs(ArgumentosDeInicio::class.java)

        // Antes do Android 13 não existe POST_NOTIFICATIONS: a notificação de
        // um serviço de primeiro plano é mostrada sem pedir nada.
        val precisaPedir = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState(ALIAS_NOTIFICACAO) != PermissionState.GRANTED

        if (precisaPedir) {
            inicioPendente = args
            requestPermissionForAlias(ALIAS_NOTIFICACAO, invoke, "aoResponderPermissao")
            return
        }

        subir(args)
        invoke.resolve()
    }

    /**
     * Resposta do diálogo de permissão. **Sobe o serviço nos dois casos.**
     *
     * Recusar a notificação não pode virar "a call cai quando você minimiza":
     * a permissão governa o aviso na tela, não o direito de continuar
     * capturando o microfone. Sem ela o serviço roda e a notificação fica
     * invisível — degradado, e melhor do que quebrado.
     */
    @PermissionCallback
    fun aoResponderPermissao(invoke: Invoke) {
        inicioPendente?.let { subir(it) }
        inicioPendente = null
        invoke.resolve()
    }

    @Command
    fun pararServicoDeChamada(invoke: Invoke) {
        ChamadaService.parar(activity)
        invoke.resolve()
    }

    /**
     * A web registra aqui um `Channel` do Tauri; o toque em "Sair da chamada"
     * escreve nele direto, sem passar pelo Rust de volta (o `Channel` do Kotlin
     * fala com o IPC do webview por conta própria).
     *
     * Registrar de novo substitui o canal anterior — é o que se quer depois de
     * um reload da web, que deixa o canal velho pendurado num webview morto.
     */
    @Command
    fun registrarOuvinteDeSaida(invoke: Invoke) {
        val canal = invoke.parseArgs(ArgumentosDeOuvinte::class.java).canal
        ChamadaService.aoPedirSaida = { canal.send(JSObject()) }
        invoke.resolve()
    }

    private fun subir(args: ArgumentosDeInicio) {
        ChamadaService.iniciar(activity, args.titulo, args.texto)
    }
}

/**
 * Fora da classe porque `@Permission(alias = ...)` exige uma constante de
 * tempo de compilação, e uma `const val` de companion object não serve para
 * uma anotação da própria classe que a declara.
 */
const val ALIAS_NOTIFICACAO = "notificacao"
