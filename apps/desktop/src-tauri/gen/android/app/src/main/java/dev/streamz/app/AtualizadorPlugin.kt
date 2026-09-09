package dev.streamz.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * O atualizador do app Android: baixa o `.apk` novo e abre o instalador do
 * sistema.
 *
 * ## Por que existe
 *
 * O `tauri-plugin-updater` é desktop-only, e no Android não há nada equivalente
 * pronto. Sem este plugin, "saiu versão nova" terminava num link para o site e
 * o usuário tinha de baixar tudo de novo à mão. Este é o caminho que Discord,
 * Fortnite e todo APK distribuído fora da loja usam.
 *
 * ## O limite honesto
 *
 * **O Android sempre mostra a tela de confirmação de instalação.** Não há como
 * pular sem ser a loja, ser *device owner* (aparelho gerenciado por empresa) ou
 * estar assinado com a chave da plataforma. Então o que este plugin entrega é:
 * o download acontece sozinho, em segundo plano, com o pacote já conferido — e
 * ao usuário resta um toque em "Atualizar". É isso que a UI promete, e nem uma
 * palavra a mais.
 *
 * ## As três decisões
 *
 * 1. **`HttpURLConnection`, não OkHttp nem `DownloadManager`.** O
 *    `DownloadManager` é do sistema e sobrevive ao app, o que soa ideal — mas
 *    ele escreve na pasta pública de Downloads (um `.apk` visível no gerenciador
 *    de arquivos, que o usuário pode abrir semanas depois já desatualizado) e o
 *    progresso só chega por *polling* de um cursor. OkHttp resolveria bem e
 *    custaria ~1,5 MB de dependência nova no `.apk` para fazer um `GET`. O
 *    `HttpURLConnection` da plataforma faz os dois trabalhos que importam —
 *    ler em blocos e contar bytes — e permite calcular o digest **no mesmo
 *    laço** da escrita, sem reler o arquivo do disco.
 * 2. **O digest é conferido aqui, não na web.** O arquivo nunca passa pelo
 *    webview (40 MB atravessando o IPC seriam absurdos), então quem tem os
 *    bytes é este código, e é aqui que a conferência tem de acontecer. Se não
 *    bater, **o arquivo é apagado** e o comando falha: um `.apk` que não confere
 *    não fica no disco esperando alguém tocar nele.
 * 3. **`cacheDir`, não `getExternalFilesDir`.** O armazenamento externo é legível
 *    por outros apps em versões antigas do Android, e um `.apk` que outro
 *    processo pode reescrever entre o download e a instalação anula a
 *    conferência do digest. O `cacheDir` é privado do app, e o sistema o limpa
 *    sozinho quando o disco aperta — que é o comportamento certo para um
 *    arquivo descartável. O `FileProvider` já cobre essa pasta
 *    (`res/xml/file_paths.xml`).
 *
 * O R8 não apaga esta classe mesmo com `isMinifyEnabled = true`: as regras de
 * consumo do `tauri-android` guardam `@TauriPlugin public class *` e
 * `@InvokeArg public class *`, que só são alcançadas por reflexão. Ver
 * `ChamadaPlugin` para o mesmo raciocínio.
 */
@TauriPlugin
class AtualizadorPlugin(private val activity: Activity) : Plugin(activity) {

    @InvokeArg
    class ArgumentosDeDownload {
        lateinit var url: String
        /** 64 hexadecimais, minúsculos. Vem do manifesto da nossa API. */
        lateinit var sha256: String
        /** Por onde o progresso volta ao webview, sem passar pelo Rust. */
        lateinit var progresso: Channel
    }

    @InvokeArg
    class ArgumentosDeInstalacao {
        lateinit var caminho: String
    }

    /**
     * Baixa o `.apk` de `url`, confere o `sha256` e resolve com o caminho no
     * disco.
     *
     * Roda numa thread própria porque um `GET` de dezenas de megabytes na
     * thread principal congelaria a interface — e o comando é `async` do outro
     * lado, então quem chamou já está esperando.
     *
     * O progresso vai pelo `Channel` como `{ baixados, total }`, em bytes.
     * `total` é `-1` quando o servidor não manda `Content-Length` (a barra vira
     * indeterminada do lado da web em vez de mentir uma porcentagem).
     */
    @Command
    fun baixar(invoke: Invoke) {
        val args = invoke.parseArgs(ArgumentosDeDownload::class.java)
        val esperado = args.sha256.lowercase()

        // A mesma trava que a web e a API já fazem, pela terceira vez e de
        // propósito: este é o último ponto antes de o arquivo existir no disco,
        // e é barato. Um digest torto aqui vira download de 40 MB que nunca
        // instala.
        if (!Regex("^[0-9a-f]{64}$").matches(esperado)) {
            invoke.reject("sha256 inválido no manifesto")
            return
        }

        thread(name = "streamz-atualizador") {
            var destino: File? = null
            try {
                // Uma pasta só, limpa a cada tentativa: o `.apk` da tentativa
                // anterior (interrompida, ou de uma versão que já foi
                // instalada) não tem por que ocupar disco nem confundir.
                val pasta = File(activity.cacheDir, "atualizacao").apply {
                    deleteRecursively()
                    mkdirs()
                }
                val arquivo = File(pasta, "streamz.apk")
                destino = arquivo

                val conexao = (URL(args.url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000
                    readTimeout = 60_000
                    requestMethod = "GET"
                }
                try {
                    val codigo = conexao.responseCode
                    if (codigo !in 200..299) throw IllegalStateException("HTTP $codigo")
                    val total = conexao.contentLengthLong

                    val digest = MessageDigest.getInstance("SHA-256")
                    var baixados = 0L
                    var ultimoAviso = 0L
                    conexao.inputStream.use { entrada ->
                        arquivo.outputStream().use { saida ->
                            val bloco = ByteArray(64 * 1024)
                            while (true) {
                                val lidos = entrada.read(bloco)
                                if (lidos < 0) break
                                saida.write(bloco, 0, lidos)
                                digest.update(bloco, 0, lidos)
                                baixados += lidos
                                // Um evento a cada ~256 KB, não a cada bloco: a
                                // barra não fica mais precisa com 600 mensagens
                                // por segundo atravessando o IPC, só mais cara.
                                if (baixados - ultimoAviso >= 256 * 1024) {
                                    ultimoAviso = baixados
                                    args.progresso.send(
                                        JSObject().put("baixados", baixados).put("total", total),
                                    )
                                }
                            }
                        }
                    }
                    args.progresso.send(JSObject().put("baixados", baixados).put("total", total))

                    val obtido = digest.digest().joinToString("") { "%02x".format(it) }
                    if (obtido != esperado) {
                        // O ponto do plugin inteiro. Não bateu: o arquivo some.
                        arquivo.delete()
                        invoke.reject("o pacote baixado não confere com o sha256 publicado")
                        return@thread
                    }

                    invoke.resolve(JSObject().put("caminho", arquivo.absolutePath))
                } finally {
                    conexao.disconnect()
                }
            } catch (e: Exception) {
                destino?.delete()
                invoke.reject(e.message ?: "falha ao baixar a atualização")
            }
        }
    }

    /**
     * Abre o instalador do sistema para o `.apk` baixado.
     *
     * Dois passos, e o primeiro é o que as pessoas esquecem:
     *
     * 1. **Permissão de "origens desconhecidas".** Desde o Android 8 ela é por
     *    app (`canRequestPackageInstalls`), não uma chave global do aparelho, e
     *    não existe diálogo para pedi-la: o único caminho é mandar o usuário
     *    para a tela de Ajustes daquele app. Se chamarmos o `ACTION_VIEW` sem
     *    ela, o sistema mostra um aviso genérico e a atualização morre ali.
     *    Então: sem a permissão, abrimos a tela certa e devolvemos
     *    `permissaoNecessaria`, para a web explicar o que fazer em vez de
     *    parecer quebrada. O usuário volta, toca de novo, e aí instala.
     * 2. **`FileProvider`.** Passar um `file://` para outro app lança
     *    `FileUriExposedException` desde o Android 7. O `content://` do
     *    provider já declarado no `AndroidManifest.xml` mais o
     *    `FLAG_GRANT_READ_URI_PERMISSION` é o caminho suportado.
     */
    @Command
    fun instalar(invoke: Invoke) {
        val args = invoke.parseArgs(ArgumentosDeInstalacao::class.java)
        val arquivo = File(args.caminho)
        if (!arquivo.isFile) {
            invoke.reject("o pacote baixado não está mais no disco")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            abrirAjustesDeOrigens()
            invoke.resolve(JSObject().put("permissaoNecessaria", true))
            return
        }

        val uri = FileProvider.getUriForFile(
            activity,
            "${activity.packageName}.fileprovider",
            arquivo,
        )
        val intencao = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // O instalador não é uma tela do nosso app; sem a NEW_TASK ele
            // entraria na nossa pilha e "voltar" cairia num lugar estranho.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            activity.startActivity(intencao)
            invoke.resolve(JSObject().put("permissaoNecessaria", false))
        } catch (e: Exception) {
            invoke.reject(e.message ?: "não foi possível abrir o instalador")
        }
    }

    /**
     * A tela de Ajustes → "Instalar apps desconhecidos" **deste** app.
     *
     * O `Uri` do pacote é o que faz o Android abrir a página do Streamz em vez
     * da lista de todos os apps; sem ele o usuário cai numa lista e tem de nos
     * procurar. Em aparelho sem essa tela (raro, mas acontece em ROM enxuta) o
     * `startActivity` lança, e aí não há mais nada a fazer — a web já vai
     * explicar o passo à mão.
     */
    private fun abrirAjustesDeOrigens() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
            // sem a tela, resta a explicação na interface
        }
    }
}
