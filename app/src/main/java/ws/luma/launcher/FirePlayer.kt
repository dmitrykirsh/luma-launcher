package ws.luma.launcher

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.SurfaceView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Настройки заставки: видео, громкость, таймер сна. Лежат в SharedPreferences, меняются из настроек лаунчера. */
object DreamCfg {
    const val DEFAULT_SOURCE = "rutube:965c1c098297287b54c4fba406bd8288"   // «Вечерний камин 4К», 10,7 часа
    private fun prefs(c: Context) = c.getSharedPreferences("dream", Context.MODE_PRIVATE)
    fun source(c: Context) = prefs(c).getString("source", DEFAULT_SOURCE) ?: DEFAULT_SOURCE
    fun volume(c: Context) = prefs(c).getInt("volume", 70).coerceIn(0, 100)
    fun sleepMin(c: Context) = prefs(c).getInt("sleepMin", 120).coerceAtLeast(0)   // по умолчанию 2 часа: камин не должен играть всю ночь
    fun json(c: Context) = JSONObject().put("source", source(c)).put("volume", volume(c)).put("sleepMin", sleepMin(c)).toString()
    fun write(c: Context, j: JSONObject) {
        prefs(c).edit().putString("source", j.optString("source", source(c)).take(300)).putInt("volume", j.optInt("volume", volume(c)).coerceIn(0, 100)).putInt("sleepMin", j.optInt("sleepMin", sleepMin(c)).coerceIn(0, 1440)).apply()
    }
    fun savedSaver(c: Context): String? = prefs(c).getString("prevSaver", null)
    fun saveSaver(c: Context, v: String?) { prefs(c).edit().putString("prevSaver", v ?: "").apply() }
}

/**
 * Проигрыватель заставки на ExoPlayer: берёт поток HLS (Rutube по id или любая ссылка), крутит по кругу, плавно включает звук
 * и по таймеру сна плавно гасит звук и закрывает заставку. Потоки Rutube подписаны на неделю, поэтому ссылка запрашивается заново при каждом запуске.
 */
class FirePlayer(private val ctx: Context, private val surface: SurfaceView, private val onFinish: () -> Unit) {
    private val ui = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var released = false
    private var retry = 0
    private var target = 0.7f
    private val http = OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(12, TimeUnit.SECONDS).build()
    private val ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Safari/537.36"

    fun start() {
        val source = DreamCfg.source(ctx)
        target = DreamCfg.volume(ctx) / 100f
        // Качество: поток Rutube начинается с 144p и поднимается медленно, поэтому стартовая оценка скорости высокая, а ниже 720p плеер не опускается
        val meter = DefaultBandwidthMeter.Builder(ctx).setInitialBitrateEstimate(40_000_000L).build()
        val p = ExoPlayer.Builder(ctx).setBandwidthMeter(meter).build().also { player = it }
        p.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
        p.repeatMode = Player.REPEAT_MODE_ALL
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setMinVideoSize(1280, 720).setMaxVideoSize(1920, 1080).build()
        p.setVideoSurfaceView(surface)
        p.volume = 0f
        p.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) { scheduleRetry(source) }
            override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_READY) { retry = 0; fadeTo(target, 6000) } }
            override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) { Log.i("LumaDream", "video ${videoSize.width}x${videoSize.height} bitrate=${player?.videoFormat?.bitrate}") }
        })
        open(source)
        val sleep = DreamCfg.sleepMin(ctx)
        if (sleep > 0) ui.postDelayed({ fadeTo(0f, 20000) { onFinish() } }, sleep * 60_000L)
    }

    private fun open(source: String) {
        Thread {
            val url = try { resolve(source) } catch (_: Exception) { null }
            ui.post { if (!released) { if (url == null) scheduleRetry(source) else play(url) } }
        }.start()
    }

    /** rutube:<id> -> ссылка HLS из play options; любая другая строка считается готовой ссылкой. */
    private fun resolve(source: String): String? {
        if (!source.startsWith("rutube:")) return source
        val id = source.removePrefix("rutube:").takeIf { it.matches(Regex("[0-9a-f]{32}")) } ?: return null
        val req = Request.Builder().url("https://rutube.ru/api/play/options/$id/?no_404=true&referer=https%3A%2F%2Frutube.ru").header("User-Agent", ua).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return null
            val b = JSONObject(r.body!!.string()).optJSONObject("video_balancer") ?: return null
            return b.optString("m3u8").ifEmpty { b.optString("default") }.ifEmpty { null }
        }
    }

    private fun play(url: String) {
        val p = player ?: return
        val ds = DefaultHttpDataSource.Factory().setUserAgent(ua).setDefaultRequestProperties(mapOf("Referer" to "https://rutube.ru/", "Origin" to "https://rutube.ru"))
        p.setMediaSource(HlsMediaSource.Factory(ds).createMediaSource(MediaItem.fromUri(Uri.parse(url))))
        p.prepare(); p.playWhenReady = true
    }

    private fun scheduleRetry(source: String) {
        if (released) return
        retry++
        ui.postDelayed({ if (!released) open(source) }, (5000L * retry).coerceAtMost(60000L))   // сеть могла пропасть: пробуем снова, всё реже
    }

    private var fade: Runnable? = null
    private fun fadeTo(v: Float, ms: Long, done: (() -> Unit)? = null) {
        val p = player ?: return
        fade?.let { ui.removeCallbacks(it) }
        val from = p.volume; val steps = 30; var i = 0
        val r = object : Runnable { override fun run() {
            if (released) return
            i++; p.volume = from + (v - from) * i / steps
            if (i < steps) ui.postDelayed(this, ms / steps) else done?.invoke()
        } }
        fade = r; ui.post(r)
    }

    fun release() {
        released = true
        ui.removeCallbacksAndMessages(null)
        try { player?.release() } catch (_: Exception) {}
        player = null
    }
}
