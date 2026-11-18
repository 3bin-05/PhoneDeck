# Phone Deck Android ProGuard & R8 Optimization Rules
-keep class org.phonedeck.android.** { *; }
-keepclassmembers class org.phonedeck.android.** {
    @app.tauri.annotation.Command <methods>;
}
