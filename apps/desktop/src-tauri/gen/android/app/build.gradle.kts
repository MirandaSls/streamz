import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "dev.streamz.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "dev.streamz.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    // Assinatura de release.
    //
    // O `keystore.properties` é escrito pelo `scripts/build-android-no-servidor.sh`
    // a cada build, a partir de `/root/.android/streamz.keystore` e da senha em
    // `/root/.android/streamz.keystore.senha`. Ele **nunca** é versionado (o
    // `.gitignore` que o `android init` gerou já o exclui, junto com
    // `key.properties` e `local.properties`) porque carrega a senha em texto.
    //
    // Quando o arquivo não existe — o caso do `--sem-assinar` —, o
    // `signingConfig` fica nulo e o Gradle produz um APK **não assinado**, que
    // nenhum aparelho instala. Isso é de propósito: é melhor um artefato que
    // recusa instalar do que um assinado com a chave de debug, que passaria por
    // bom até a hora de subir na Play e ser rejeitado.
    //
    // PERDER O KEYSTORE = NUNCA MAIS ATUALIZAR O APP NA PLAY. A loja só aceita
    // uma atualização assinada com a mesma chave da versão anterior; sem ela o
    // único caminho é publicar outro app, com outro applicationId, e pedir a
    // todo mundo que reinstale. É a mesma gravidade de perder
    // `/root/.tauri/streamz.key` (o updater do desktop) — ver o §5 do processo.
    val arquivoDeAssinatura = rootProject.file("keystore.properties")
    val propriedadesDeAssinatura = Properties().apply {
        if (arquivoDeAssinatura.exists()) {
            FileInputStream(arquivoDeAssinatura).use { load(it) }
        }
    }
    if (arquivoDeAssinatura.exists()) {
        signingConfigs {
            create("release") {
                keyAlias = propriedadesDeAssinatura["keyAlias"] as String
                keyPassword = propriedadesDeAssinatura["password"] as String
                storeFile = file(propriedadesDeAssinatura["storeFile"] as String)
                storePassword = propriedadesDeAssinatura["password"] as String
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (arquivoDeAssinatura.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")