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
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME) return false
        if (event.action == KeyEvent.ACTION_UP) {
            try {
                startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setClass(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            } catch (_: Exception) {}
        }
        return true
    }
}
