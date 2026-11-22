package com.veltra.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifications {
    const val CHANNEL_ALERTS = "veltra_alerts"
    const val CHANNEL_ACCOUNT = "veltra_account"
    const val EXTRA_PATH = "veltra_path"

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERTS, ctx.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH)
                .apply { description = ctx.getString(R.string.channel_alerts_desc) }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ACCOUNT, ctx.getString(R.string.channel_account), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = ctx.getString(R.string.channel_account_desc) }
        )
    }

    fun canPost(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Permission is checked by canPost() and SecurityException is caught below. */
    @SuppressLint("MissingPermission")
    /** Shows a notification that opens [path] (a same-origin path such as /app/studio/12) when tapped. */
    fun show(ctx: Context, title: String, body: String, path: String?, type: String?) {
        if (!canPost(ctx)) return
        val channel = if (type == "payment" || type == "subscription_expiry") CHANNEL_ACCOUNT else CHANNEL_ALERTS
        val intent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (path != null && path.startsWith("/") && !path.startsWith("//")) putExtra(EXTRA_PATH, path)
        }
        val pi = PendingIntent.getActivity(
            ctx, (System.currentTimeMillis() and 0xFFFFFF).toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(ctx, R.color.crimson))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n)
        } catch (_: SecurityException) { /* permission revoked */ }
    }
}
