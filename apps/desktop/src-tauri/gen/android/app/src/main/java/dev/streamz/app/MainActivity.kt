package dev.streamz.app

import android.media.AudioManager
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // **O botão de volume tem de mexer no volume que os sons do app usam.**
    //
    // Tudo o que o WebView toca — o toque de chamada recebida, mudo/desmudo,
    // alguém entrou/saiu — sai como `USAGE_MEDIA`, ou seja, na régua de
    // `STREAM_MUSIC`. Sem esta linha, o botão de volume com nada tocando mexe
    // na régua de **toque** (`USE_DEFAULT_STREAM_TYPE`), e quem tenta "aumentar
    // o volume" porque não ouviu o telefone tocar aumenta a régua errada: o
    // toque continua no mesmo nível e nada explica por quê.
    //
    // Não atrapalha a chamada: em `MODE_IN_COMMUNICATION` o próprio
    // `AudioService` passa o botão para `STREAM_VOICE_CALL`, que é onde a voz
    // do outro anda. Ver `AudioDaChamada.kt` e `docs/APPS-MOBILE.md` §13.
    volumeControlStream = AudioManager.STREAM_MUSIC
  }
}
