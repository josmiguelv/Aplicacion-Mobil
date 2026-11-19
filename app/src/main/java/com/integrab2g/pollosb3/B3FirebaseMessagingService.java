package com.integrab2g.pollosb3;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Promotional push for Pollos B3 only. Never handles order or private notifications. */
public final class B3FirebaseMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        if (getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getBoolean("marketing_opt_in", false)) {
            FirebaseMessaging.getInstance().subscribeToTopic(MainActivity.MARKETING_TOPIC);
        }
        // Device-token registration is deliberately not sent to an unverified API.
        // Backend can address opted-in clients through the FCM topic.
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (!getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getBoolean("marketing_opt_in", false)) return;
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        Map<String,String> data = message.getData();
        if (!"marketing".equals(data.get("type"))) return;
        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.trim().isEmpty()) {
            title = message.getNotification() != null ? message.getNotification().getTitle() : "Pollos B3";
        }
        if (body == null || body.trim().isEmpty()) {
            body = message.getNotification() != null ? message.getNotification().getBody() : "";
        }
        if (title == null || title.trim().isEmpty() || title.length()>150 || body == null || body.length()>1500) return;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("b3_open_notifications", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        String id = data.get("notificationId");
        int requestId = id != null ? id.hashCode() : (int)(System.currentTimeMillis() & 0x7fffffff);
        PendingIntent pending = PendingIntent.getActivity(this,requestId,intent,flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, MainActivity.NOTIFICATION_CHANNEL)
            : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pending).setAutoCancel(true);
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(requestId,builder.build());
    }
}
