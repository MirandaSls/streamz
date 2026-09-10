package dev.streamz.app

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log

/**
 * A **rota de saída** do áudio enquanto a chamada está de pé.
 *
 * Por que existe: num app de chamada o Android espera que **o app** diga em que
 * modo o aparelho está e por onde o som sai. O WebView não faz isso por nós —
 * ele toca o áudio remoto e deixa a rota como estiver. E o modo que uma call
 * pede (`MODE_IN_COMMUNICATION`, o que liga cancelamento de eco e o sensor de
 * proximidade) é justamente o que, sem ninguém escolher o dispositivo, manda o
 * som para o **alto-falante de conversa** — o furinho de encostar no ouvido. Com
 * o telefone na mão isso é indistinguível de "não tem áudio". É o relato que o
 * `AndroidManifest.xml` já previa ao declarar `MODIFY_AUDIO_SETTINGS`.
 *
 * O que fazemos, então, é o que qualquer cliente de WebRTC no Android faz:
 * enquanto a call dura, `MODE_IN_COMMUNICATION` e a saída no **viva-voz**, a
 * menos que exista um caminho de voz melhor — fone com fio, USB ou Bluetooth
 * SCO —, e aí ele ganha, que é o que o usuário pediu ao plugar/parear.
 *
 * **Por que a lista vem de `availableCommunicationDevices` (API 31+) e não de
 * `getDevices`.** Um alto-falante Bluetooth pareado aparece em `getDevices` como
 * `TYPE_BLUETOOTH_A2DP`, mas A2DP **não é rota de voz**: em
 * `MODE_IN_COMMUNICATION` o sistema não o usa, e um app que visse "tem fone,
 * não mexo" deixaria o som no ouvido justamente para quem tem uma caixinha
 * pareada. `availableCommunicationDevices` só lista o que serve para conversa,
 * e por isso é dela que a escolha sai.
 *
 * **É reversível de propósito.** Modo e dispositivo anteriores são guardados e
 * devolvidos no [desligar]: o `AudioManager` é um recurso do aparelho inteiro, e
 * sair da chamada deixando o telefone em modo de conversa estragaria o som do
 * próximo app a tocar qualquer coisa.
 */
object AudioDaChamada {
    private const val TAG = "Streamz/Audio"

    /**
     * Se já ligamos. Sem isto o [desligar] mexeria no aparelho mesmo quando
     * nunca ligamos nada — e ele é chamado de graça: a store manda
     * `pararServicoDeChamada` na carga da web, com `channelId` nulo ("parar o
     * que já parou não é erro"). Um `clearCommunicationDevice()` ali apagaria a
     * escolha de **outro** app.
     */
    private var ligado = false
    private var modoAnterior: Int? = null
    private var vivaVozAnterior: Boolean? = null

    private fun gerente(contexto: Context) =
        contexto.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    /**
     * Ordem de preferência entre rotas de **voz**. Menor vem primeiro; o
     * alto-falante é o último, que é o padrão que queremos quando não há fone.
     */
    private fun prioridade(tipo: Int): Int = when (tipo) {
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 0
        AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> 1
        AudioDeviceInfo.TYPE_USB_HEADSET -> 2
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> 3
        else -> 4
    }

    /**
     * Fone **com fio ou USB** no caminho antigo (abaixo da API 31). Bluetooth
     * fica de fora de propósito: sem `availableCommunicationDevices` não dá para
     * saber se o aparelho pareado fala SCO, e chutar que fala é o erro que deixa
     * a call no ouvido.
     */
    @Suppress("DEPRECATION")
    private fun temFoneComFio(am: AudioManager): Boolean =
        am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any {
            it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                it.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                it.type == AudioDeviceInfo.TYPE_USB_DEVICE
        }

    fun ligar(contexto: Context) {
        val am = gerente(contexto)
        try {
            if (!ligado) modoAnterior = am.mode
            ligado = true
            am.mode = AudioManager.MODE_IN_COMMUNICATION

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val escolhido = am.availableCommunicationDevices.minByOrNull { prioridade(it.type) }
                if (escolhido != null) {
                    val ok = am.setCommunicationDevice(escolhido)
                    Log.i(TAG, "rota de voz: tipo=${escolhido.type} aceita=$ok")
                } else {
                    Log.w(TAG, "nenhuma rota de voz disponivel")
                }
                return
            }

            @Suppress("DEPRECATION")
            run {
                if (vivaVozAnterior == null) vivaVozAnterior = am.isSpeakerphoneOn
                val comFone = temFoneComFio(am)
                am.isSpeakerphoneOn = !comFone
                Log.i(TAG, "caminho antigo: viva-voz=${!comFone}")
            }
        } catch (e: Exception) {
            // Ficar sem a rota certa é ruim; derrubar a chamada por causa dela
            // seria pior. O `AudioManager` de alguns fabricantes recusa o modo
            // com `SecurityException` e não há o que fazer além de seguir.
            Log.w(TAG, "nao foi possivel ajustar a rota de audio", e)
        }
    }

    fun desligar(contexto: Context) {
        if (!ligado) return
        val am = gerente(contexto)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice()
            }
            vivaVozAnterior?.let {
                @Suppress("DEPRECATION")
                run { am.isSpeakerphoneOn = it }
            }
            modoAnterior?.let { am.mode = it }
            Log.i(TAG, "rota de audio devolvida ao que era")
        } catch (e: Exception) {
            Log.w(TAG, "nao foi possivel devolver a rota de audio", e)
        } finally {
            ligado = false
            modoAnterior = null
            vivaVozAnterior = null
        }
    }
}
