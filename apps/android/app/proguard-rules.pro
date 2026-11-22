# Keep the JavaScript bridge methods (called by name from the web app).
-keepclassmembers class com.veltra.app.VeltraBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep class com.veltra.app.FcmInit { *; }
