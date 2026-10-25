package ws.luma.launcher

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * Кнопка «Домой» на этом ТВ уходит в Google TV, даже если лаунчером по умолчанию выбран другой (так же обходит это Monet).
 * Служба получает нажатие раньше системы и сама открывает лаунчер.
 */
class HomeKeyService : AccessibilityService() {
    private var last = 0L

    /** Google TV сам открывает свой главный экран по имени компонента (при включении и пробуждении ТВ), минуя выбор лаунчера: тогда возвращаем наш. */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        if (event.packageName?.toString() != "com.google.android.apps.tv.launcherx" || event.className?.toString()?.endsWith(".home.HomeActivity") != true) return
        val now = System.currentTimeMillis()
        if (now - last < 1500) return
        last = now
        openLauncher()
    }
    override fun onInterrupt() {}

    private fun openLauncher() {
        try {
            startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setClass(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        } catch (_: Exception) {}
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME) return false
        if (event.action == KeyEvent.ACTION_UP) openLauncher()
        return true
    }
}
