package ws.luma.launcher

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.service.dreams.DreamService
import android.view.KeyEvent
import android.view.SurfaceView
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout

/** Заставка ТВ: камин со звуком. Выбирается в настройках лаунчера (Настройки → Заставка ТВ) или в системных настройках ТВ. */
class LumaDream : DreamService() {
    private var fire: FirePlayer? = null
    private var surface: SurfaceView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false      // любая кнопка пульта закрывает заставку
        isFullscreen = true
        isScreenBright = true
        val sv = SurfaceView(this); surface = sv
        setContentView(FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(sv, FrameLayout.LayoutParams(-1, -1)) })
    }

    override fun onDreamingStarted() {
        super.onDreamingStarted()
        surface?.let { fire = FirePlayer(this, it) { finish() }.also { f -> f.start() } }
    }

    override fun onDreamingStopped() {
        fire?.release(); fire = null
        super.onDreamingStopped()
    }
}

/** Просмотр заставки из настроек лаунчера: то же самое на весь экран, любая кнопка (кроме громкости) закрывает. */
class DreamPreviewActivity : Activity() {
    private var fire: FirePlayer? = null
    private lateinit var surface: SurfaceView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        surface = SurfaceView(this)
        setContentView(FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(surface, FrameLayout.LayoutParams(-1, -1)) })
    }

    override fun onResume() {
        super.onResume()
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        fire = FirePlayer(this, surface) { finish() }.also { it.start() }
    }

    override fun onPause() { fire?.release(); fire = null; super.onPause() }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        if (e.keyCode == KeyEvent.KEYCODE_VOLUME_UP || e.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || e.keyCode == KeyEvent.KEYCODE_VOLUME_MUTE) return super.dispatchKeyEvent(e)
        if (e.action == KeyEvent.ACTION_UP) finish()
        return true
    }
}
