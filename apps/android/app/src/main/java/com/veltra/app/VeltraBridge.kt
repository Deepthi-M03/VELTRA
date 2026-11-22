package com.veltra.app

import android.webkit.JavascriptInterface

/**
 * Minimal, read-mostly bridge exposed to the VELTRA web app as `window.VeltraAndroid`.
 * It is only attached for pages served from the configured VELTRA origin (see MainActivity),
 * and it never exposes credentials or file access.
 */
class VeltraBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun pushEnabled(): Boolean = BuildConfig.FCM_ENABLED

    /** FCM registration token, or empty string if push is not configured / not yet available. */
    @JavascriptInterface
    fun pushToken(): String = Prefs.pushToken(activity) ?: ""

    @JavascriptInterface
    fun notificationsAllowed(): Boolean = Notifications.canPost(activity)

    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread { activity.requestNotificationPermission() }
    }
}
