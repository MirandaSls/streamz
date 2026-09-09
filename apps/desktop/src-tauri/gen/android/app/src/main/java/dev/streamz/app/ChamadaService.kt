package dev.streamz.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * O serviço de primeiro plano que mantém a **chamada de voz viva** quando o
 * Streamz sai da frente.
 *
 * Por que ele existe: o Android não deixa um app em segundo plano segurar o
 * microfone nem tocar áudio indefinidamente. Sem um serviço de primeiro plano,
 * apertar Home no meio de uma call derruba a captura em alguns segundos e o
 * WebView é estrangulado logo depois — o usuário some da sala sem nunca ter
 * pedido para sair. O contrato do sistema é explícito: **enquanto houver uma
 * notificação persistente de um serviço de primeiro plano, o processo é
 * intocável**. É por isso que a notificação não é enfeite; ela é o preço.
 *
 * O PR #204 já tinha declarado as permissões `FOREGROUND_SERVICE*` no
 * manifesto; o que faltava era esta classe. Ver `docs/APPS-MOBILE.md` §5.
 *
 * **Tipo do serviço.** A partir do Android 14 (API 34) não basta ser um serviço
 * de primeiro plano: cada um declara o *tipo* do que faz, e o sistema confere
 * contra a permissão correspondente. Uma call é as duas coisas ao mesmo tempo —
 * `microphone` (o que capturamos) e `mediaPlayback` (a voz dos outros que
 * tocamos) —, e é assim que o `AndroidManifest.xml` a declara. Pedir só
 * `microphone` faria o áudio remoto continuar sujeito ao corte.
 *
 * **Quem manda parar é a web.** Este serviço não sabe nada de LiveKit; ele não
 * conhece sala, participante nem token. Ele é ligado e desligado pelos dois
 * comandos do `ChamadaPlugin`, e a única coisa que ele devolve para o outro
 * lado é o toque no botão "Sair da chamada" da notificação — que vira um evento
 * no webview, e é lá que a saída de verdade acontece. Duplicar a regra de saída
 * aqui em Kotlin seria manter duas versões da mesma decisão.
 */
class ChamadaService : Service() {
    companion object {
        /**
         * Um canal de notificação só, criado uma vez (recriar é barato mas o
         * `NotificationManager` ignora mudanças depois da primeira vez — o
         * usuário é dono das preferências dele a partir daí).
         *
         * `IMPORTANCE_LOW` é deliberado: a notificação precisa ficar de pé, não
         * precisa tocar nem vibrar. A chamada já toca por conta própria.
         */
        const val CANAL = "chamada-em-andamento"

        /** Fixo: só existe uma chamada por vez, então a notificação é sempre a mesma. */
        const val ID_DA_NOTIFICACAO = 42

        const val ACAO_INICIAR = "dev.streamz.app.CHAMADA_INICIAR"
        const val ACAO_PARAR = "dev.streamz.app.CHAMADA_PARAR"
        const val ACAO_SAIR = "dev.streamz.app.CHAMADA_SAIR"

        const val EXTRA_TITULO = "titulo"
        const val EXTRA_TEXTO = "texto"

        /**
         * O caminho de volta para o webview. O `ChamadaPlugin` põe a função
         * aqui quando a web registra o ouvinte; a notificação a chama quando o
         * usuário toca em "Sair da chamada".
         *
         * `@Volatile` porque quem escreve é a thread principal (o plugin) e
         * quem lê é a thread que entrega o `Intent` do `PendingIntent`.
         */
        @Volatile
        var aoPedirSaida: (() -> Unit)? = null

        fun iniciar(contexto: Context, titulo: String, texto: String) {
            val intent = Intent(contexto, ChamadaService::class.java).apply {
                action = ACAO_INICIAR
                putExtra(EXTRA_TITULO, titulo)
                putExtra(EXTRA_TEXTO, texto)
            }
            // `startService` e não `startForegroundService`: quem chama é o
            // webview no instante em que a call conecta, ou seja, com o app na
            // frente — e aí a partida é permitida sem o contrato dos 5 segundos
            // que o `startForegroundService` impõe. Estourar aquele prazo mata o
            // app com `ForegroundServiceDidNotStartInTimeException`, que é um
            // jeito caro de aprender a diferença.
            contexto.startService(intent)
        }

        fun parar(contexto: Context) {
            val intent = Intent(contexto, ChamadaService::class.java).apply {
                action = ACAO_PARAR
            }
            contexto.startService(intent)
        }
    }

    /** Serviço iniciado, não vinculado: ninguém conversa com ele por `Binder`. */
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACAO_INICIAR -> {
                val titulo = intent.getStringExtra(EXTRA_TITULO) ?: "Streamz"
                val texto = intent.getStringExtra(EXTRA_TEXTO) ?: "Chamada em andamento"
                subirParaPrimeiroPlano(titulo, texto)
            }

            ACAO_SAIR -> {
                // Avisa a web primeiro e só então some da tela. Na ordem
                // inversa o usuário veria a notificação sumir enquanto ainda
                // está na sala, que é pior do que ver a notificação por mais
                // meio segundo.
                aoPedirSaida?.invoke()
                descer()
            }

            ACAO_PARAR -> descer()

            // Sem ação (o sistema recriando o serviço, por exemplo): não há
            // chamada para segurar, então não há nada a fazer aqui.
            else -> descer()
        }
        // `START_NOT_STICKY`: se o processo morrer, a chamada morreu junto — o
        // LiveKit não sobrevive à morte do WebView. Ressuscitar o serviço
        // deixaria só a notificação de pé, prometendo uma call que não existe.
        return START_NOT_STICKY
    }

    private fun subirParaPrimeiroPlano(titulo: String, texto: String) {
        criarCanalUmaVez()

        // O tipo tem de casar com o `foregroundServiceType` do manifesto. No
        // Android 13 e antes o parâmetro é ignorado, e é por isso que a
        // constante pode ser referenciada sem `if` de versão: `ServiceInfo`
        // resolve em tempo de compilação (compileSdk 36) e vira um `int`.
        val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        } else {
            0
        }

        ServiceCompat.startForeground(this, ID_DA_NOTIFICACAO, notificacao(titulo, texto), tipo)
    }

    private fun descer() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * O canal existe uma vez por instalação. Chamar de novo com o mesmo id é
     * barato e sem efeito — e é mais simples do que guardar um booleano que o
     * primeiro `clear data` do usuário invalidaria.
     */
    private fun criarCanalUmaVez() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val gerente = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (gerente.getNotificationChannel(CANAL) != null) return
        val canal = NotificationChannel(
            CANAL,
            getString(R.string.chamada_canal_nome),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.chamada_canal_descricao)
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
        }
        gerente.createNotificationChannel(canal)
    }

    private fun notificacao(titulo: String, texto: String): Notification {
        // Tocar na notificação traz o app de volta. `singleTask` no manifesto
        // já garante que é a mesma instância, com a call inteira de pé.
        val abrir = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        // "Sair da chamada": volta para este mesmo serviço, que avisa o webview.
        val sair = PendingIntent.getService(
            this,
            1,
            Intent(this, ChamadaService::class.java).apply { action = ACAO_SAIR },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        return NotificationCompat.Builder(this, CANAL)
            // Ícone pequeno: o Android o pinta como silhueta monocromática,
            // então ele é o logotipo vazado, não o PNG colorido do launcher
            // (que viraria um borrão branco). Ver o próprio arquivo.
            .setSmallIcon(R.drawable.ic_notificacao_chamada)
            .setColor(0xFF9BE31F.toInt()) // Volt Lime, o `accent` do tailwind.config.ts
            .setContentTitle(titulo)
            .setContentText(texto)
            .setContentIntent(abrir)
            .addAction(0, getString(R.string.chamada_sair), sair)
            // `ongoing`: o usuário não consegue deslizar para dispensar. É o
            // certo aqui — dispensar não encerraria a call, só esconderia a
            // única pista de que ela existe.
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            // Sem isto o Android 12+ pode segurar a notificação por 10 s antes
            // de mostrá-la, e o usuário que apertou Home logo depois de entrar
            // na call não veria nada.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }
}
