plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sayemfit.app"
    compileSdk = 34

    defaultConfig {
        // Must stay com.sayemfit.app4: the original id belongs to an older
        // build signed with a key that no longer exists, and changing it would
        // break updates for the installed app.
        applicationId = "com.sayemfit.app4"
        // Health Connect's client library requires API 26.
        minSdk = 26
        targetSdk = 34
        versionCode = 52
        versionName = "5.1"
    }

    signingConfigs {
        create("release") {
            val ks = rootProject.file("sayem-key.jks")
            if (ks.exists()) {
                storeFile = ks
                storePassword = System.getenv("SAYEM_STOREPASS") ?: "sayemfit123"
                keyAlias = "sayemfit"
                keyPassword = System.getenv("SAYEM_STOREPASS") ?: "sayemfit123"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (rootProject.file("sayem-key.jks").exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            if (rootProject.file("sayem-key.jks").exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            java.srcDirs("src/main/java", "src/main/kotlin")
        }
    }

    packaging {
        resources.excludes += setOf("META-INF/*.version", "META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Reads Huawei Health data that reaches Health Connect through a bridge
    // app such as Health Sync — Huawei Health itself still has no native
    // Health Connect support.
    implementation("androidx.health.connect:connect-client:1.1.0-alpha07")
}
