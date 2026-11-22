package com.veltra.app

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Compiled only when app/google-services.json exists (see app/build.gradle.kts). */
class VeltraMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Prefs.setPushToken(this, token)
        // The web app registers the token with the server on its next load (window.VeltraAndroid.pushToken()).
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "VELTRA"
        val body = message.notification?.body ?: message.data["body"] ?: return
        Notifications.show(this, title, body, message.data["path"], message.data["type"])
    }
}

object FcmInit {
    @JvmStatic
    fun fetchToken(ctx: Context) {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { t -> Prefs.setPushToken(ctx, t) }
    }
}
