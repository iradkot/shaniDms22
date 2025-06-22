# Android Build & Configuration Files

This file aggregates all relevant Android build and configuration files for debugging the VisionCamera prefab/CMake error.

## 1. Root Gradle Properties
File: `android/gradle.properties`
```properties
# Use this property to enable support to the new architecture.
# Disabling it restores the classic bridge and lets DevSupport logs appear.
newArchEnabled=false

# Use this property to enable or disable the Hermes JS engine.
# Disabling Hermes forces JSC, which can help surface console logs in the classic bridge.
hermesEnabled=false
JS_ENGINE=hermes
```

## 2. App Gradle Properties
File: `android/app/gradle.properties`
```properties
# AndroidX settings (automatically provided)
android.useAndroidX=true
android.enableJetifier=true

# Flipper
FLIPPER_VERSION=0.125.0

# React Native architectures
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# New architecture flag
newArchEnabled=false

# Hermes engine flag
hermesEnabled=false
```

## 3. Root Build Gradle
File: `android/build.gradle`
```groovy
buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 35
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.0.21"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
        classpath 'com.google.gms:google-services:4.4.2'
    }
}
apply plugin: "com.facebook.react.rootproject"
``` 

## 4. App Build Gradle
File: `android/app/build.gradle`
```groovy
apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"
apply plugin: 'com.google.gms.google-services'

// React plugin flags
project.ext.react = [
    enableHermes: rootProject.ext.hermesEnabled.toBoolean(),
    newArchEnabled: rootProject.ext.newArchEnabled.toBoolean()
]

react {
    autolinkLibrariesWithApp()
}

def enableProguardInReleaseBuilds = false

def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    compileSdk rootProject.ext.compileSdkVersion
    namespace "com.shanidms22"
    defaultConfig {
        applicationId "com.shanidms22"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    if (project.ext.react.enableHermes) {
        implementation("com.facebook.react:hermes-android")
    } else {
        implementation jscFlavor
    }
}
```

## 5. Settings Gradle
File: `android/settings.gradle`
```groovy
pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = 'shaniDms22'
include ':app'
includeBuild('../node_modules/@react-native/gradle-plugin')
```

## 6. Main Application
File: `android/app/src/main/java/com/shanidms22/MainApplication.kt`
```kotlin
class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      load()
    }
  }
  override fun getUseDeveloperSupport() = BuildConfig.DEBUG
  override fun createReactActivityDelegate() = ReactActivityDelegate(...)
}
```

## 7. Main Activity
File: `android/app/src/main/java/com/shanidms22/MainActivity.kt`
```kotlin
class MainActivity : ReactActivity() {
  override fun getMainComponentName() = "shaniDms22"
}
```

## 8. Android Manifest
File: `android/app/src/main/AndroidManifest.xml`
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:name=".MainApplication" ...>
    <activity android:name=".MainActivity" ...>
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
```

---
**Next Steps:**
1. Ensure `react-native-worklets-core` is properly installed: `yarn add react-native-worklets-core@<matching-version>`.
2. Clean CMake caches in VisionCamera module:
   ```powershell
   Remove-Item -Recurse -Force node_modules\react-native-vision-camera\android\.cxx
   Remove-Item -Recurse -Force node_modules\react-native-worklets-core\android\.cxx
   ```
3. Rebuild: `cd android; .\gradlew clean assembleDebug`.
4. If errors persist, disable frame processors by adding in `android/app/build.gradle` under `project.ext.react`: 
   ```groovy
   project.ext.react = [ ..., visionCamera: [enableFrameProcessors: false] ]
   ```
