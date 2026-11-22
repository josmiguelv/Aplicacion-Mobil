package com.integrab2g.pollosb3;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.service.notification.StatusBarNotification;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Isolated private order pushes and separately opted-in promotional notifications. */
public final class B3FirebaseMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        if (getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getBoolean("marketing_opt_in", false)) {
            FirebaseMessaging.getInstance().subscribeToTopic(MainActivity.MARKETING_TOPIC);
        }
        // Device-token registration is deliberately not sent to an unverified API.
        // Backend can address opted-in clients through the FCM topic.
    }

    private static boolean isOutOfWindow(Map<String,String> data) {
        long now=System.currentTimeMillis();
        String begin=data.get("scheduledAt"),end=data.get("expiresAt");
        try{
            SimpleDateFormat parser=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            parser.setLenient(false);
            if(begin!=null&&!begin.isEmpty()){
                Date date=parser.parse(begin);
                if(date==null||now<date.getTime())return true;
            }
            if(end!=null&&!end.isEmpty()){
                Date date=parser.parse(end);
                if(date==null||now>=date.getTime())return true;
            }
        }catch(Exception ignored){return true;}
        return false;
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        Map<String,String> data = message.getData();
        String type=data.get("type");
        // Transactional notifications are always directed to one device token.
        // They are never part of the marketing topic or its consent setting.
        if ("order_status".equals(type)||"order_reminder".equals(type)||"order_expired".equals(type)) {
            String id=data.get("interactionId");
            if(id==null||!id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))return;
            String title="order_status".equals(type)?"Tu sede respondió":"order_expired".equals(type)?"Tiempo de pago terminado":"Tu pedido está pendiente";
            String body="order_status".equals(type)?"Abre Pollos B3 para revisar tu solicitud.": "order_expired".equals(type)?"Tu solicitud venció. Puedes iniciar una nueva compra.":"Continúa con el pago o cancela tu solicitud.";
            Intent intent=new Intent(this,MainActivity.class);
            intent.setAction(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("b3_open_personal_order",true);
            intent.putExtra("interactionId",id);
            int requestId=id.hashCode();
            PendingIntent pending=PendingIntent.getActivity(this,requestId,intent,
                PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder=Build.VERSION.SDK_INT>=26?
                new Notification.Builder(this,MainActivity.PERSONAL_ORDER_CHANNEL):
                new Notification.Builder(this);
            builder.setSmallIcon(R.drawable.ic_b3_notification)
                .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pending).setAutoCancel(true);
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(manager!=null)manager.notify(requestId,builder.build());
            return;
        }
        if (!getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getBoolean("marketing_opt_in", false)) return;
        if (!"marketing".equals(type)) return;
        String id = data.get("notificationId");
        if(id==null||id.length()>128||!id.matches("[a-zA-Z0-9_-]+"))return;
        if(isOutOfWindow(data))return;
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
        intent.putExtra("notificationId",id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        int requestId = id.hashCode();
        PendingIntent pending = PendingIntent.getActivity(this,requestId,intent,flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, MainActivity.NOTIFICATION_CHANNEL)
            : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_b3_notification)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pending).setAutoCancel(true);
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            int currentCount=0;
            if (Build.VERSION.SDK_INT>=23) {
                for(StatusBarNotification active:manager.getActiveNotifications()){
                    if (active.getId()!=requestId) currentCount++;
                }
            }
            builder.setNumber(Math.min(99,currentCount+1));
            manager.notify(requestId,builder.build());
        }
    }
}
