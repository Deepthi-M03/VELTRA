package com.veltra.app

import android.app.Application
import android.content.Context

class VeltraApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
        if (BuildConfig.FCM_ENABLED) {
            // FCM classes only exist when google-services.json is present; load them by name.
            runCatching {
                Class.forName("com.veltra.app.FcmInit")
                    .getMethod("fetchToken", Context::class.java)
                    .invoke(null, this)
            }
        }
    }
}

/** Small, app-private key/value storage. No credentials are ever stored here. */
object Prefs {
    private const val FILE = "veltra"
    private const val KEY_PUSH_TOKEN = "push_token"
    private const val KEY_SERVER_URL = "server_url"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun pushToken(ctx: Context): String? = sp(ctx).getString(KEY_PUSH_TOKEN, null)
    fun setPushToken(ctx: Context, token: String) = sp(ctx).edit().putString(KEY_PUSH_TOKEN, token).apply()

    /** Debug builds may override the server URL at runtime; release builds always use BuildConfig. */
    fun serverUrl(ctx: Context): String {
        if (!BuildConfig.DEBUG) return BuildConfig.VELTRA_URL.trimEnd('/')
        return (sp(ctx).getString(KEY_SERVER_URL, null) ?: BuildConfig.VELTRA_URL).trimEnd('/')
    }
    fun setServerUrl(ctx: Context, url: String) = sp(ctx).edit().putString(KEY_SERVER_URL, url.trim().trimEnd('/')).apply()
}
