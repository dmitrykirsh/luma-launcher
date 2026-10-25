# Luma Launcher: установка на ТВ по adb (консольный диалог)
# Запуск: двойной щелчок по Install-Luma-Launcher.bat или `powershell -ExecutionPolicy Bypass -File install.ps1`
# Параметры для автоматического запуска без вопросов: -Ip 192.168.0.50 -Port 5555 -Auto [-AdbPath C:\...\adb.exe]
[CmdletBinding()]
param([string]$Ip = '', [int]$Port = 5555, [switch]$Auto, [string]$AdbPath = '', [string]$Action = '')

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Work = Join-Path $env:TEMP 'luma-launcher-install'
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$RepoLauncher = 'dmitrykirsh/luma-launcher'
$RepoLuma = 'dmitrykirsh/luma-tv'
$PkgLauncher = 'ws.luma.launcher'
$PkgLuma = 'ws.luma.tv'
$Svc = "$PkgLauncher/$PkgLauncher.HomeKeyService"
$script:Adb = ''
$script:Serial = ''

function Say([string]$t = '', [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Head([string]$t) { Say ''; Say ('== ' + $t + ' ==') 'Cyan' }
function Ask([string]$q, [string]$def = '') {
    if ($Auto) { return $def }
    $s = if ($def) { " [$def]" } else { '' }
    $r = Read-Host ($q + $s)
    if ([string]::IsNullOrWhiteSpace($r)) { return $def }
    return $r.Trim()
}
function YesNo([string]$q, [bool]$def = $true) {
    if ($Auto) { return $def }
    $hint = if ($def) { 'Д/н' } else { 'д/Н' }
    while ($true) {
        $r = (Read-Host "$q ($hint)").Trim().ToLower()
        if ($r -eq '') { return $def }
        if ($r -in 'д', 'y', 'да', 'yes') { return $true }
        if ($r -in 'н', 'n', 'нет', 'no') { return $false }
    }
}
function Die([string]$t) { Say ''; Say $t 'Red'; if (-not $Auto) { Read-Host 'Нажмите Enter, чтобы закрыть' | Out-Null }; exit 1 }

# ---------- adb ----------
function Adb([string[]]$a) {
    $out = & $script:Adb @a 2>&1 | ForEach-Object { "$_" }
    return ($out -join "`n").Trim()
}
function Sh([string]$cmd) { return Adb @('-s', $script:Serial, 'shell', $cmd) }

function Find-Adb {
    if ($AdbPath -and (Test-Path $AdbPath)) { return $AdbPath }
    $c = Get-Command adb -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in @("$Root\platform-tools\adb.exe", "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", "$env:ANDROID_HOME\platform-tools\adb.exe", "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe", 'C:\Android\sdk\platform-tools\adb.exe')) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return ''
}
function Ensure-Adb {
    $script:Adb = Find-Adb
    if ($script:Adb) { Say "adb найден: $script:Adb" 'DarkGray'; return }
    Say 'Программа adb (Android Platform Tools) не найдена.' 'Yellow'
    if (-not (YesNo 'Скачать её с сайта Google (около 7 МБ) в папку рядом со скриптом?')) { Die 'Без adb установка невозможна. Скачайте Platform Tools: https://developer.android.com/tools/releases/platform-tools' }
    $zip = Join-Path $Work 'platform-tools.zip'
    try {
        Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip -UseBasicParsing -ErrorAction Stop
        Expand-Archive -Path $zip -DestinationPath $Root -Force
    } catch { Die "Не получилось скачать adb: $($_.Exception.Message)" }
    $script:Adb = Find-Adb
    if (-not $script:Adb) { Die 'adb не появился после распаковки.' }
    Say 'adb установлен.' 'Green'
}

# ---------- подключение к ТВ ----------
function Show-EnableHelp {
    Say ''
    Say 'Что нужно на ТВ (один раз):' 'Yellow'
    Say '  1. Режим разработчика: Настройки → Система → О системе, 7 раз нажмите OK на пункте «Сборка».'
    Say '  2. Настройки → Система → Для разработчиков → включите «Отладка по USB» (порт 5555)'
    Say '     или «Беспроводная отладка» (Android 11+; IP-адрес и порт показаны на её экране).'
    Say '  3. IP-адрес ТВ: Настройки → Сеть и Интернет → ваша сеть → «IP-адрес».'
    Say '  ТВ и компьютер должны быть в одной сети. Подробная инструкция: README.md рядом со скриптом.' 'DarkGray'
}
function Get-State { return (Adb @('-s', $script:Serial, 'get-state')) }

function Connect-Tv {
    Head 'Подключение к ТВ'
    Show-EnableHelp
    if (-not $Ip) { $Ip = Ask 'IP-адрес ТВ' '' }
    if (-not $Ip) { Die 'IP-адрес не указан.' }
    $p = Ask 'Порт отладки' "$Port"
    $script:Serial = "${Ip}:$p"
    Say "Подключаемся к $script:Serial …"
    $out = Adb @('connect', $script:Serial)
    Say $out 'DarkGray'
    $ok = ($out -match 'connected to') -and (-not ($out -match 'failed|cannot|refused|unable'))
    if (-not $ok) {
        Say ''
        Say 'Подключиться не получилось. Если на ТВ включена «Беспроводная отладка» (Android 11+), нужно сопряжение по коду.' 'Yellow'
        if (YesNo 'Выполнить сопряжение по коду?' $true) {
            Say 'На ТВ: Для разработчиков → Беспроводная отладка → «Подключить устройство с помощью кода».'
            $pp = Ask 'Порт сопряжения (показан на экране ТВ рядом с кодом)' ''
            $code = Ask 'Код сопряжения (6 цифр)' ''
            $pr = Adb @('pair', "${Ip}:$pp", $code)
            Say $pr 'DarkGray'
            if ($pr -notmatch 'Successfully paired') { Die 'Сопряжение не удалось. Проверьте порт и код и запустите скрипт ещё раз.' }
            $p2 = Ask 'Порт для подключения (на экране «Беспроводная отладка», он отличается от порта сопряжения)' "$p"
            $script:Serial = "${Ip}:$p2"
            $out = Adb @('connect', $script:Serial)
            Say $out 'DarkGray'
        } else { Die 'Проверьте IP и порт, что отладка включена, и запустите скрипт ещё раз.' }
    }
    # ТВ может ждать подтверждения на экране
    for ($i = 0; $i -lt 30; $i++) {
        $st = Get-State
        if ($st -eq 'device') { break }
        if ($i -eq 0) { Say 'На экране ТВ появится вопрос «Разрешить отладку по USB?»: отметьте «Всегда разрешать» и нажмите «Разрешить».' 'Yellow' }
        Start-Sleep -Seconds 2
    }
    if ((Get-State) -ne 'device') { Die 'ТВ не подтвердил отладку. Запустите скрипт ещё раз и разрешите подключение на экране ТВ.' }
    $model = Sh 'getprop ro.product.model'; $rel = Sh 'getprop ro.build.version.release'; $sdk = Sh 'getprop ro.build.version.sdk'
    Say "Подключено: $model, Android $rel (API $sdk)" 'Green'
    if ([int]$sdk -lt 24) { Die 'Нужен Android 7.0 (API 24) или новее.' }
    $feat = Sh 'pm list features'
    if ($feat -notmatch 'leanback|television') {
        Say 'Похоже, это не Android TV / Google TV: лаунчер рассчитан на ТВ.' 'Yellow'
        if (-not (YesNo 'Всё равно продолжить?' $false)) { exit 0 }
    }
}

# ---------- релизы GitHub ----------
function Get-Releases([string]$repo) {
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=8" -Headers @{ 'User-Agent' = 'luma-launcher-installer' } -ErrorAction Stop
        return ,@($r | Where-Object { -not $_.draft -and ($_.assets | Where-Object { $_.name -like '*.apk' }) })   # запятая: массив из одного элемента не должен превращаться в одиночный объект
    } catch { $script:LastErr = $_.Exception.Message; return ,@() }
}
function Pick-Release([string]$title, $rels) {
    Say ''
    Say $title 'White'
    for ($i = 0; $i -lt $rels.Count; $i++) {
        $d = ([datetime]$rels[$i].published_at).ToString('dd.MM.yyyy')
        $mark = if ($i -eq 0) { '  (последняя)' } else { '' }
        Say ("  {0}) {1}  от {2}{3}" -f ($i + 1), $rels[$i].tag_name, $d, $mark)
    }
    $n = Ask 'Номер версии' '1'
    $idx = 0
    if (-not [int]::TryParse($n, [ref]$idx) -or $idx -lt 1 -or $idx -gt $rels.Count) { $idx = 1 }
    return $rels[$idx - 1]
}
function Get-Apk($rel) {
    $a = $rel.assets | Where-Object { $_.name -like '*.apk' } | Select-Object -First 1
    $dest = Join-Path $Work $a.name
    Say "Скачиваем $($a.name) ($([math]::Round($a.size / 1MB, 1)) МБ) …"
    try { Invoke-WebRequest -Uri $a.browser_download_url -OutFile $dest -UseBasicParsing -ErrorAction Stop } catch { Die "Не получилось скачать: $($_.Exception.Message)" }
    return $dest
}
function Install-Apk([string]$file, [string]$name) {
    Say "Устанавливаем $name на ТВ …"
    $out = Adb @('-s', $script:Serial, 'install', '-r', '-g', $file)
    Say $out 'DarkGray'
    if ($out -notmatch 'Success') {
        if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match') { Die "На ТВ уже стоит $name с другой подписью. Удалите его на ТВ (Настройки → Приложения) и запустите скрипт ещё раз." }
        Say 'На Android 14 ТВ может показать окно защиты («Play Protect»): выберите «Всё равно установить» и запустите скрипт снова.' 'Yellow'
        Die "Не удалось установить $name."
    }
    Say "$name установлено." 'Green'
}
function Pkg-Version([string]$pkg) {
    $l = Sh "pm list packages $pkg"
    if ($l -notmatch "package:$([regex]::Escape($pkg))(\s|$)") { return '' }
    $d = Sh "dumpsys package $pkg"
    if ($d -match 'versionName=(\S+)') { return $Matches[1] }
    return '?'
}

# ---------- Luma TV ----------
function Ensure-Luma {
    Head 'Luma TV'
    $v = Pkg-Version $PkgLuma
    if ($v) { Say "Luma TV уже установлена (версия $v)." 'Green'; return }
    Say 'Luma Launcher тесно работает с приложением Luma TV: именно из неё он берёт «Продолжить просмотр»,' 'White'
    Say 'избранное, подборки и недавние ТВ-каналы. Без Luma TV останутся приложения и каналы других приложений.' 'White'
    if (-not (YesNo 'Установить Luma TV сейчас из репозитория?' $true)) {
        if (-not (YesNo 'Продолжить установку лаунчера без Luma TV?' $true)) { exit 0 }
        return
    }
    $rels = Get-Releases $RepoLuma
    if (-not $rels -or $rels.Count -eq 0) { Say 'Не получилось получить список версий Luma TV с GitHub.' 'Yellow'; if (-not (YesNo 'Продолжить без Luma TV?' $true)) { exit 0 }; return }
    $rel = Pick-Release 'Какую версию Luma TV установить?' $rels
    $apk = Get-Apk $rel
    Install-Apk $apk "Luma TV $($rel.tag_name)"
    Sh "monkey -p $PkgLuma -c android.intent.category.LEANBACK_LAUNCHER 1" | Out-Null
    Say 'Luma TV запущена на ТВ. Откройте в ней главную страницу и начните любой фильм: так появятся данные для лаунчера.' 'Yellow'
}

# ---------- лаунчер ----------
function Install-Launcher {
    Head 'Luma Launcher'
    $cur = Pkg-Version $PkgLauncher
    if ($cur) { Say "На ТВ уже стоит Luma Launcher ${cur}: будет обновлён, настройки сохранятся." 'DarkGray' }
    $rels = Get-Releases $RepoLauncher
    $apk = ''
    $label = 'Luma Launcher'
    if ($rels -and $rels.Count -gt 0) {
        $rel = Pick-Release 'Какую версию лаунчера установить?' $rels
        $apk = Get-Apk $rel; $label = "Luma Launcher $($rel.tag_name)"
    } else {
        Say "Не получилось получить версии с GitHub: $script:LastErr" 'Yellow'
        $apk = Ask 'Укажите путь к файлу APK лаунчера на компьютере' ''
        if (-not $apk -or -not (Test-Path $apk)) { Die 'Файл APK не найден.' }
    }
    Install-Apk $apk $label
    Sh "pm grant $PkgLauncher android.permission.READ_TV_LISTINGS" | Out-Null
    Say 'Разрешение на чтение каналов приложений выдано.' 'DarkGray'
}

function Set-Default {
    Head 'Домашний экран по умолчанию'
    Say 'Лаунчер станет домашним экраном, а кнопка «Домой» на пульте будет открывать его.' 'White'
    Say 'Для этого включается служба доступности лаунчера (на современных ТВ иначе кнопку «Домой» перехватывает система). Остальные службы доступности остаются включёнными.' 'DarkGray'
    if (-not (YesNo 'Сделать Luma Launcher домашним экраном?' $true)) { Say 'Хорошо, лаунчер установлен, но домашним не назначен.' 'Yellow'; return }
    Sh "cmd package set-home-activity $PkgLauncher/.MainActivity" | Out-Null
    $cur = (Sh 'settings get secure enabled_accessibility_services').Trim()
    if ($cur -notmatch [regex]::Escape($Svc)) {
        $new = if ($cur -eq '' -or $cur -eq 'null') { $Svc } else { "${cur}:$Svc" }
        Sh "settings put secure enabled_accessibility_services '$new'" | Out-Null
    }
    Sh 'settings put secure accessibility_enabled 1' | Out-Null
    $role = Sh 'cmd role get-role-holders android.app.role.HOME'
    if ($role -match [regex]::Escape($PkgLauncher)) { Say 'Готово: Luma Launcher назначен домашним экраном.' 'Green' }
    else { Say "Не удалось подтвердить назначение (сейчас домашний: $role). Попробуйте нажать «Домой» на пульте или назначить лаунчер вручную в настройках ТВ." 'Yellow' }
    Sh "am start -n $PkgLauncher/.MainActivity" | Out-Null
}

# ---------- откат и удаление ----------
function Restore-Stock {
    $q = Sh 'cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME'
    $cands = @([regex]::Matches($q, '(\S+/\S+)') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notlike "$PkgLauncher/*" -and $_ -notmatch 'setupwraith|FallbackHome|RecoveryActivity' } | Select-Object -Unique)
    $stock = $cands | Where-Object { $_ -like 'com.google.android.apps.tv.launcherx*' } | Select-Object -First 1
    if (-not $stock) { $stock = $cands | Select-Object -First 1 }
    if (-not $stock) { Say 'Стандартный домашний экран не найден: выберите его вручную в настройках ТВ (Приложения → Домашний экран).' 'Yellow'; return $false }
    Sh "cmd package set-home-activity $stock" | Out-Null
    $role = Sh 'cmd role get-role-holders android.app.role.HOME'
    $pkg = ($stock -split '/')[0]
    if ($role -match [regex]::Escape($pkg)) { Say "Домашний экран возвращён: $pkg" 'Green' } else { Say "Назначили $stock, но система сообщает домашним: $role. Если кнопка «Домой» открывает не то, выберите домашний экран в настройках ТВ." 'Yellow' }
    return $true
}
function Disable-HomeService {
    $cur = (Sh 'settings get secure enabled_accessibility_services').Trim()
    if ($cur -match [regex]::Escape($Svc)) {
        $new = ($cur -split ':' | Where-Object { $_ -and $_ -ne $Svc }) -join ':'
        if (-not $new) { $new = 'null' }
        Sh "settings put secure enabled_accessibility_services '$new'" | Out-Null
        Say 'Служба кнопки «Домой» лаунчера отключена.' 'DarkGray'
    }
}
function Rollback([bool]$remove) {
    Head $(if ($remove) { 'Удаление Luma Launcher' } else { 'Возврат стандартного домашнего экрана' })
    if ($remove -and -not (YesNo 'Вернуть Google-лаунчер и удалить Luma Launcher с ТВ?' $true)) { return }
    Restore-Stock | Out-Null
    Disable-HomeService
    if ($remove) {
        $o = Adb @('-s', $script:Serial, 'uninstall', $PkgLauncher)
        if ($o -match 'Success') { Say 'Luma Launcher удалён с ТВ. Luma TV осталась на месте.' 'Green' } else { Say "Не удалось удалить: $o" 'Yellow' }
    } else { Say 'Luma Launcher остаётся на ТВ, его можно снова назначить домашним, запустив этот скрипт (пункт 1).' 'DarkGray' }
}

# ---------- запуск ----------
Say ''
Say '  Luma Launcher: установка на ТВ' 'Magenta'
Say '  Домашний экран в оформлении Luma для Google TV и Android TV' 'DarkGray'
Ensure-Adb

if (-not $Action) {
    if ($Auto) { $Action = '1' } else {
        Say ''
        Say '  1) Установить или обновить Luma Launcher'
        Say '  2) Вернуть Google-лаунчер по умолчанию (Luma Launcher останется на ТВ)'
        Say '  3) Удалить Luma Launcher и вернуть Google-лаунчер'
        $Action = Ask 'Что делаем' '1'
    }
}
Connect-Tv
if ($Action -eq '2' -or $Action -eq '3') { Rollback ($Action -eq '3'); Say ''; Say 'Готово.' 'Green'; if (-not $Auto) { Read-Host 'Нажмите Enter, чтобы закрыть' | Out-Null }; exit 0 }
Ensure-Luma
Install-Launcher
Set-Default
Say ''
Say 'Всё готово. Если что-то пошло не так, запустите скрипт ещё раз и выберите пункт 2 (вернуть Google-лаунчер) или 3 (удалить лаунчер).' 'Green'
if (-not $Auto) { Read-Host 'Нажмите Enter, чтобы закрыть' | Out-Null }
