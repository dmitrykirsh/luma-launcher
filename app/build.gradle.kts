import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// OAuth-клиент Google для синхронизации через Drive — общий файл вне репозиториев (D:\lift\sync-credentials.local.properties)
val syncProps = Properties().apply { val f = rootProject.file("../sync-credentials.local.properties"); if (f.exists()) f.inputStream().use { load(it) } }

android {
    namespace = "ws.luma.launcher"
    compileSdk = 34
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "ws.luma.launcher"
        minSdk = 24
        targetSdk = 34
        versionCode = 13
        versionName = "0.6.0"
        buildConfigField("String", "DRIVE_CLIENT_ID", "\"${syncProps.getProperty("driveClientId", "")}\"")
        buildConfigField("String", "DRIVE_CLIENT_SECRET", "\"${syncProps.getProperty("driveClientSecret", "")}\"")
        buildConfigField("String", "DRIVE_DESK_ID", "\"${syncProps.getProperty("driveDesktopClientId", "")}\"")
        buildConfigField("String", "DRIVE_DESK_SECRET", "\"${syncProps.getProperty("driveDesktopClientSecret", "")}\"")
    }
    buildTypes {
        release { isMinifyEnabled = false; signingConfig = signingConfigs.getByName("debug") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-dnsoverhttps:4.12.0")
}
