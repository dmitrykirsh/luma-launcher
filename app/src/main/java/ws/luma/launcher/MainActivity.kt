package ws.luma.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Luma Launcher: тонкая оболочка вокруг веб-интерфейса из assets (так же устроена Luma TV, анимации на ТВ плавные).
 * Оболочка отдаёт странице список приложений, иконки, ленту из Luma и запускает приложения.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var net: NetProxy
    private lateinit var driveSync: DriveSync
    private val iconDir by lazy { File(cacheDir, "icons").apply { mkdirs() } }
    private val loader by lazy { WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // экран на главной не удерживаем включённым: иначе ТВ не считает его простаивающим и заставка никогда не запустится
        net = NetProxy(this)
        driveSync = DriveSync(this) { code -> js(code) }
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true; isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true; domStorageEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                loadWithOverviewMode = false; useWideViewPort = false
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val host = request.url.host
                    if (host == "image.tmdb.org" && request.method == "GET") return tmdbImage(request)
                    if (net.handles(request)) return net.serve(request)   // остальное TMDB идёт через запасной DNS
                    val p = request.url.path ?: ""
                    if (host == "appassets.androidplatform.net") {
                        if (p.startsWith("/icon/")) return icon(p.removePrefix("/icon/").removeSuffix(".png"))
                        if (p.startsWith("/tvimg")) return tvImage(request.url.getQueryParameter("u") ?: "")
                        return loader.shouldInterceptRequest(request.url)
                    }
                    if (request.method == "GET" && (request.requestHeaders["Accept"] ?: "").startsWith("image")) return extImage(request)
                    return null
                }
            }
            addJavascriptInterface(Bridge(), "Native")
        }
        WebView.setWebContentsDebuggingEnabled(true)
        web.visibility = View.INVISIBLE
        web.postDelayed({ web.visibility = View.VISIBLE }, 3000)   // на случай, если страница не подаст сигнал
        setContentView(FrameLayout(this).apply { setBackgroundColor(Color.BLACK); addView(web, FrameLayout.LayoutParams(-1, -1)) })
        web.requestFocus()
        web.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    /** Нажали «Домой» уже в лаунчере: возвращаемся к началу. */
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); js("window.lumaHome && window.lumaHome()") }
    private var focusWatch: Runnable? = null
    override fun onResume() {
        super.onResume(); web.onResume(); web.requestFocus(); js("window.lumaResume && window.lumaResume()")
        // после «Домой» из тяжёлого приложения окно иногда не получает ввод и лаунчер не отвечает на кнопки: если фокуса нет, выводим лаунчер вперёд ещё раз
        focusWatch?.let { web.removeCallbacks(it) }
        val r = Runnable { if (!isFinishing && !hasWindowFocus()) try { startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)) } catch (_: Exception) {} }
        focusWatch = r; web.postDelayed(r, 800)
    }
    override fun onPause() { super.onPause(); focusWatch?.let { web.removeCallbacks(it) }; web.onPause() }

    // «Назад» в лаунчере никогда его не закрывает
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { js("window.lumaBack && window.lumaBack()") }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) { web.requestFocus(); js("window.lumaFocus && window.lumaFocus()") }
        if (hasFocus) window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    private val imgDir by lazy { File(cacheDir, "img").apply { mkdirs() } }

    /**
     * Картинки TMDB из этой сети грузятся по 8 секунд (прямой адрес не отвечает, берётся запасной прокси, а он не кэшируется),
     * а лаунчер должен открываться сразу. Поэтому каждую картинку один раз сохраняем на диск и дальше отдаём оттуда.
     */
    private fun tmdbImage(req: WebResourceRequest): WebResourceResponse? {
        val key = sha1(req.url.toString())
        diskGet(key)?.let { return it }
        val r = net.serve(req) ?: return null
        if (r.statusCode != 200) return r
        val bytes = try { r.data.readBytes() } catch (_: Exception) { return null }
        if (bytes.size < 500) return null
        diskPut(key, r.mimeType, bytes)
        return WebResourceResponse(r.mimeType, null, 200, "OK", imgHdr, java.io.ByteArrayInputStream(bytes))
    }

    private val ext = okhttp3.OkHttpClient.Builder().connectTimeout(6, java.util.concurrent.TimeUnit.SECONDS).readTimeout(8, java.util.concurrent.TimeUnit.SECONDS).build()
    private val failed = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val imgHdr = mapOf("Cache-Control" to "max-age=604800", "Access-Control-Allow-Origin" to "*")
    private fun sha1(s: String) = java.security.MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun gone(code: Int = 504) = WebResourceResponse("text/plain", "utf-8", code, "Gone", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))

    private fun diskGet(key: String): WebResourceResponse? {
        val f = File(imgDir, key)
        if (f.length() <= 0) return null
        return WebResourceResponse(try { File(imgDir, "$key.t").readText() } catch (_: Exception) { "image/jpeg" }, null, 200, "OK", imgHdr, f.inputStream())
    }
    private fun diskPut(key: String, mime: String, bytes: ByteArray) {
        try {
            val tmp = File(imgDir, "$key.tmp"); tmp.writeBytes(bytes); File(imgDir, "$key.t").writeText(mime); tmp.renameTo(File(imgDir, key))
            val files = imgDir.listFiles { x -> x.name.length == 40 }
            if (files != null && files.sumOf { it.length() } > 200L * 1024 * 1024) files.sortedBy { it.lastModified() }.take(files.size / 3).forEach { it.delete(); File(imgDir, it.name + ".t").delete() }
        } catch (_: Exception) {}
    }

    /** Картинки с других сайтов (постеры Luma, превью каналов): один раз на диск. Недоступный адрес быстро отдаёт ошибку, чтобы страница не ждала. */
    private fun extImage(req: WebResourceRequest): WebResourceResponse? {
        val url = req.url.toString(); val key = sha1(url)
        diskGet(key)?.let { return it }
        if ((failed[url] ?: 0L) > System.currentTimeMillis()) return gone()
        // YouTube и Google в этой сети открываются только через ByeByeDPI: у него локальный SOCKS5-прокси 127.0.0.1:1080, пробуем его, потом напрямую
        val clients = if (viaDpi(req.url.host)) listOf(extProxy, ext) else listOf(ext)
        for (cl in clients) {
            try {
                val res = cl.newCall(okhttp3.Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Safari/537.36").build()).execute().use { r ->
                    if (!r.isSuccessful) return@use null
                    val bytes = r.body!!.bytes(); val mime = (r.header("Content-Type") ?: "image/jpeg").substringBefore(';').trim()
                    if (bytes.size < 100) return@use null
                    diskPut(key, mime, bytes)
                    WebResourceResponse(mime, null, 200, "OK", imgHdr, java.io.ByteArrayInputStream(bytes))
                }
                if (res != null) return res
            } catch (_: Exception) {}
        }
        failed[url] = System.currentTimeMillis() + 120_000
        return gone()
    }
    private val extProxy by lazy { ext.newBuilder().proxy(java.net.Proxy(java.net.Proxy.Type.SOCKS, java.net.InetSocketAddress("127.0.0.1", 1080))).build() }
    private fun viaDpi(h: String?) = h != null && listOf("ytimg.com", "ggpht.com", "youtube.com", "googleusercontent.com").any { h.endsWith(it) }

    /** Картинки каналов, которые приложение отдаёт как content:// или android.resource://. */
    private fun tvImage(u: String): WebResourceResponse? {
        val uri = try { Uri.parse(u) } catch (_: Exception) { return null }
        if (uri.scheme != "content" && uri.scheme != "android.resource") return null
        return try {
            val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            WebResourceResponse(contentResolver.getType(uri)?.takeIf { it.startsWith("image") } ?: "image/png", null, 200, "OK", mapOf("Cache-Control" to "max-age=3600"), java.io.ByteArrayInputStream(bytes))
        } catch (_: Exception) { gone(404) }
    }

    /** Баннер приложения (320×180) для ТВ; если баннера нет, иконка на тёмной плашке. Кэшируется на диске по версии приложения. */
    private fun icon(pkg: String): WebResourceResponse? {
        if (!pkg.matches(Regex("[A-Za-z0-9._]+"))) return null
        return try {
            val pm = packageManager
            val ver = pm.getPackageInfo(pkg, 0).longVersionCode
            val f = File(iconDir, "$pkg-$ver.png")
            if (!f.exists()) {
                val bmp = Bitmap.createBitmap(320, 180, Bitmap.Config.ARGB_8888)
                val c = Canvas(bmp)
                // Баннер -> иконка на плашке -> просто плашка: у части системных приложений (например, на ТВ Philips) баннер или иконка не отрисовываются
                var done = false
                try {
                    val intent = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg)
                    val banner: Drawable? = try { intent?.let { pm.getActivityBanner(it) } } catch (_: Exception) { null } ?: pm.getApplicationInfo(pkg, 0).loadBanner(pm)
                    if (banner != null) { banner.setBounds(0, 0, 320, 180); banner.draw(c); done = true }
                } catch (_: Throwable) {}
                if (!done) {
                    c.drawColor(Color.parseColor("#26282E"))
                    try { val ic = pm.getApplicationIcon(pkg); ic.setBounds(104, 34, 216, 146); ic.draw(c); done = true } catch (_: Throwable) {}
                }
                if (!done) {
                    val label = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Throwable) { pkg }
                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#9AA0AA"); textSize = 90f; textAlign = android.graphics.Paint.Align.CENTER }
                    c.drawText(label.take(1).uppercase(), 160f, 115f, paint)
                }
                f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            }
            WebResourceResponse("image/png", null, 200, "OK", mapOf("Cache-Control" to "max-age=86400"), f.inputStream())
        } catch (_: Throwable) { null }
    }

    inner class Bridge {
        /** [{p: пакет, l: название, tv: есть вход для ТВ}] без самого лаунчера. */
        @JavascriptInterface fun apps(): String {
            val pm = packageManager
            val out = LinkedHashMap<String, JSONObject>()
            for ((cat, tv) in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER to true, Intent.CATEGORY_LAUNCHER to false)) {
                for (r in pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(cat), 0)) {
                    val p = r.activityInfo.packageName
                    if (p == packageName || out.containsKey(p)) continue
                    out[p] = JSONObject().put("p", p).put("l", r.loadLabel(pm).toString()).put("tv", tv)
                }
            }
            return JSONArray(out.values.toList()).toString()
        }

        @JavascriptInterface fun launch(pkg: String) {
            runOnUiThread {
                try {
                    val i = packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)
                    if (i != null) startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {}
            }
        }

        @JavascriptInterface fun lumaInstalled(): Boolean = try { packageManager.getPackageInfo("ws.luma.tv", 0); true } catch (_: Exception) { false }

        /** Лента Luma (история с прогрессом, избранное, подборка баннера): файл, который Luma TV публикует через ContentProvider. */
        @JavascriptInterface fun feed(): String = try {
            contentResolver.openInputStream(Uri.parse("content://ws.luma.tv.feed/home.json"))?.bufferedReader()?.use { it.readText() } ?: "{}"
        } catch (_: Exception) { "{}" }

        @JavascriptInterface fun openLuma(id: Int, play: Boolean) {
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("luma://open?id=$id&play=${if (play) 1 else 0}")).setPackage("ws.luma.tv").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }

        /**
         * Каналы других приложений на Google TV: «Продолжить просмотр» (Watch Next) и подборки (preview-каналы YouTube, Зона и др.).
         * Нужно разрешение READ_TV_LISTINGS, его выдаёт adb. Возвращает {ok, channels:[{id,p,app,name,items:[...]}], next:[...]} или {error}.
         */
        @JavascriptInterface fun channels(): String {
            val out = JSONObject()
            try {
                val pm = packageManager
                val chans = LinkedHashMap<Long, JSONObject>()
                contentResolver.query(android.media.tv.TvContract.Channels.CONTENT_URI, arrayOf("_id", "package_name", "display_name", "type", "browsable"), null, null, null)?.use { c ->
                    while (c.moveToNext()) {
                        if (c.getString(3) != "TYPE_PREVIEW") continue
                        val pkg = c.getString(1) ?: continue
                        val app = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
                        chans[c.getLong(0)] = JSONObject().put("id", c.getLong(0)).put("p", pkg).put("app", app).put("name", c.getString(2) ?: app).put("browsable", c.getInt(4) == 1).put("items", JSONArray())
                    }
                }
                val cols = arrayOf("channel_id", "title", "short_description", "poster_art_uri", "thumbnail_uri", "poster_art_aspect_ratio", "intent_uri", "weight", "duration_millis", "last_playback_position_millis", "package_name")
                fun item(c: android.database.Cursor) = JSONObject().put("t", c.getString(1) ?: "").put("d", c.getString(2) ?: "")
                    .put("img", (c.getString(3) ?: c.getString(4)) ?: "").put("ar", c.getInt(5)).put("uri", c.getString(6) ?: "")
                    .put("pct", if (c.getLong(8) > 0 && c.getLong(9) > 0) (c.getLong(9) * 100 / c.getLong(8)).toInt() else 0)
                contentResolver.query(android.media.tv.TvContract.PreviewPrograms.CONTENT_URI, cols, null, null, "weight DESC")?.use { c ->
                    while (c.moveToNext()) { val ch = chans[c.getLong(0)] ?: continue; if (ch.getJSONArray("items").length() < 30) ch.getJSONArray("items").put(item(c)) }
                }
                val next = JSONArray()
                contentResolver.query(android.media.tv.TvContract.WatchNextPrograms.CONTENT_URI, cols, null, null, null)?.use { c ->
                    while (c.moveToNext() && next.length() < 30) {
                        val pkg = c.getString(10) ?: ""
                        val app = try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
                        next.put(item(c).put("p", pkg).put("app", app))
                    }
                }
                val arr = JSONArray(); for (ch in chans.values) if (ch.getJSONArray("items").length() > 0) arr.put(ch)
                out.put("ok", true).put("channels", arr).put("next", next)
            } catch (e: SecurityException) { out.put("error", "PERMISSION") } catch (e: Exception) { out.put("error", e.toString()) }
            return out.toString()
        }

        /** Запуск по intent_uri из канала. */
        @JavascriptInterface fun openUri(uri: String) {
            runOnUiThread {
                try { startActivity(Intent.parseUri(uri, Intent.URI_INTENT_SCHEME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }

        /** GET из оболочки (без CORS): результат уходит в window[cb](текст), при ошибке пустая строка. */
        @JavascriptInterface fun fetch(url: String, cb: String) {
            if (!url.startsWith("https://") || !cb.matches(Regex("[A-Za-z0-9_]+"))) return
            Thread {
                var txt = ""
                for (cl in listOf(ext, extProxy)) {   // напрямую, а если сайт не открывается из этой сети, через прокси ByeByeDPI
                    txt = try { cl.newCall(okhttp3.Request.Builder().url(url).header("User-Agent", "LumaLauncher/1.0 github.com/dmitrykirsh/luma-tv").build()).execute().use { if (it.isSuccessful) it.body!!.string() else "" } } catch (_: Exception) { "" }
                    if (txt.isNotEmpty()) break
                }
                js("window.$cb && window.$cb(" + JSONObject.quote(txt) + ")")
            }.start()
        }

        /** Версия этого приложения и установленного пакета (пустая строка, если не установлен). */
        @JavascriptInterface fun version(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "?" } catch (_: Exception) { "?" }
        @JavascriptInterface fun pkgVersion(pkg: String): String = try { packageManager.getPackageInfo(pkg, 0).versionName ?: "" } catch (_: Exception) { "" }

        /** Скачивает APK обновления (этого лаунчера или Luma TV) и открывает установщик Android. Состояние уходит в window.updState({id,state,pct,msg}). */
        @JavascriptInterface fun installUpdate(url: String, id: String) {
            if (!url.startsWith("https://") || !id.matches(Regex("[a-z]{3,12}"))) return
            fun st(state: String, extra: String = "") = js("window.updState && window.updState(" + JSONObject.quote("{\"id\":\"$id\",\"state\":\"$state\"$extra}") + ")")
            Thread {
                try {
                    val f = File(cacheDir, "updates/$id-update.apk")
                    net.download(url, f) { p -> st("downloading", ",\"pct\":$p") }
                    if (!packageManager.canRequestPackageInstalls()) {
                        st("needperm")
                        runOnUiThread { try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } catch (_: Exception) {} }
                        return@Thread
                    }
                    val uri = androidx.core.content.FileProvider.getUriForFile(this@MainActivity, "$packageName.files", f)
                    val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    st("installing")
                    runOnUiThread { startActivity(i) }
                } catch (e: Exception) { st("error", ",\"msg\":" + JSONObject.quote(e.message ?: "error")) }
            }.start()
        }

        /** Есть ли рабочий интернет (сеть подключена и система проверила, что выход в интернет есть). */
        @JavascriptInterface fun online(): Boolean = try {
            val cm = getSystemService(android.net.ConnectivityManager::class.java)
            val c = cm.getNetworkCapabilities(cm.activeNetwork)
            c != null && c.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) && c.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (_: Exception) { true }

        /** Включить ТВ-канал в Luma по его id. */
        @JavascriptInterface fun openLumaTv(id: String) {
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("luma://tv?id=" + Uri.encode(id))).setPackage("ws.luma.tv").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }

        @JavascriptInterface fun openSystemSettings() { runOnUiThread { try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} } }

        /** Страница отрисовала первый кадр: показываем WebView (самый первый кадр WebView иногда рисуется в неверном масштабе). */
        @JavascriptInterface fun ready() { runOnUiThread { web.postDelayed({ web.visibility = View.VISIBLE }, 120) } }

        /** Лаунчер сейчас главный экран ТВ (роль HOME). */
        @JavascriptInterface fun isDefaultHome(): Boolean = try {
            if (android.os.Build.VERSION.SDK_INT >= 29) getSystemService(android.app.role.RoleManager::class.java).isRoleHeld(android.app.role.RoleManager.ROLE_HOME)
            else packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName == packageName
        } catch (_: Exception) { false }
        /** Включена ли служба кнопки «Домой» (специальные возможности). */
        @JavascriptInterface fun homeKeyOn(): Boolean = try {
            (Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: "").split(":").any { it.equals("$packageName/${HomeKeyService::class.java.name}", true) }
        } catch (_: Exception) { false }
        /** Системный экран «Главный экран по умолчанию»: там выбирается Luma Launcher. */
        @JavascriptInterface fun openHomeSettings() { runOnUiThread { try { startActivity(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} } } }
        /** Системный экран «Специальные возможности»: там включается служба кнопки «Домой». */
        @JavascriptInterface fun openAccessibility() { runOnUiThread { try { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} } } }

        @JavascriptInterface fun driveState(): String = driveSync.state()
        @JavascriptInterface fun driveConnect() { driveSync.connectAsync() }
        @JavascriptInterface fun driveConnectBrowser() { driveSync.connectBrowserAsync() }
        @JavascriptInterface fun driveDeleteRemote() { driveSync.deleteRemoteAsync() }
        @JavascriptInterface fun driveSecret(): String = driveSync.secret()
        @JavascriptInterface fun driveAdopt(v: String): Boolean = driveSync.adopt(v)
        @JavascriptInterface fun driveConnectCancel() { driveSync.cancelConnect() }
        @JavascriptInterface fun driveDisconnect() { driveSync.disconnect() }
        @JavascriptInterface fun driveFetchRemote() { driveSync.fetchRemoteAsync() }
        @JavascriptInterface fun driveUpload(json: String) { driveSync.uploadAsync(json) }
    }
}
