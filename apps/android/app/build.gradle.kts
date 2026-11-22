plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase Cloud Messaging is optional: it switches on automatically when app/google-services.json exists.
val fcmEnabled = file("google-services.json").exists()
if (fcmEnabled) apply(plugin = "com.google.gms.google-services")

val debugUrl = (project.findProperty("veltraDebugUrl") as String?) ?: "http://10.0.2.2:4000"
val releaseUrl = (project.findProperty("veltraReleaseUrl") as String?) ?: "https://veltra.example.com"

android {
    namespace = "com.veltra.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.veltra.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("boolean", "FCM_ENABLED", fcmEnabled.toString())
    }

    buildTypes {
        debug {
            buildConfigField("String", "VELTRA_URL", "\"$debugUrl\"")
            applicationIdSuffix = ".debug"
            resValue("string", "app_name", "VELTRA Dev")
        }
        release {
            buildConfigField("String", "VELTRA_URL", "\"$releaseUrl\"")
            resValue("string", "app_name", "VELTRA")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signing: configure in Android Studio (Build > Generate Signed App Bundle) — never commit keystores.
        }
    }

    sourceSets {
        getByName("main") {
            if (fcmEnabled) java.srcDir("src/fcm/java")
        }
        if (fcmEnabled) {
            // Build-type manifests are merged with the main manifest, adding the FCM service only when enabled.
            getByName("debug") { manifest.srcFile("src/fcm/AndroidManifest.xml") }
            getByName("release") { manifest.srcFile("src/fcm/AndroidManifest.xml") }
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
    if (fcmEnabled) {
        implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
        implementation("com.google.firebase:firebase-messaging")
    }
}
