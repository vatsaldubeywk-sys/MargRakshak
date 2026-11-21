package com.safepath.location;

import android.app.*;
import android.content.*;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.UUID;

public class SmsResultReceiver extends BroadcastReceiver {
    public static ArrayList<PendingIntent> callbacks(Context context, int count) {
        ArrayList<PendingIntent> result = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Intent report = new Intent(context, SmsResultReceiver.class).setAction(UUID.randomUUID().toString());
            result.add(PendingIntent.getBroadcast(context, 0, report, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_ONE_SHOT));
        }
        return result;
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (getResultCode() == Activity.RESULT_OK) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        String channel = "family_sms_errors";
        if (android.os.Build.VERSION.SDK_INT >= 26)
            manager.createNotificationChannel(new NotificationChannel(channel, "SMS failures", NotificationManager.IMPORTANCE_HIGH));
        manager.notify(1012, new NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("Family SMS failed")
            .setContentText("At least one message part failed. Check signal and call your contact.")
            .setAutoCancel(true).build());
    }
}
