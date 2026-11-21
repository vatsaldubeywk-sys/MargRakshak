package com.safepath.location;

import android.app.*;
import android.content.*;
import android.location.Location;
import android.os.*;
import android.telephony.SmsManager;
import androidx.core.app.NotificationCompat;
import java.util.*;

final class FamilyMonitor {
    static final String OK = "com.safepath.STATIONARY_OK";
    private static final int PROMPT = 1010, FAILURE = 1011;
    private static final String CHANNEL = "family_safety_alerts";
    private final Context context;
    private final SharedPreferences state;
    private final NotificationManager notices;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private final PowerManager.WakeLock promptLock;
    private Location anchor;
    private long lastSample;

    FamilyMonitor(Context context) {
        this.context = context;
        state = context.getSharedPreferences("family_session", Context.MODE_PRIVATE);
        notices = context.getSystemService(NotificationManager.class);
        promptLock = context.getSystemService(PowerManager.class)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MargRakshak:checkin");
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Urgent family check-ins", NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            notices.createNotificationChannel(channel);
        }
    }

    void start(List<String> phones, long expiry) {
        if (state.getLong("expiry", 0) == expiry) { resume(); return; }
        stop();
        state.edit().putStringSet("phones", phones == null ? Collections.emptySet() : new HashSet<>(phones)).putLong("expiry", expiry).apply();
    }

    void sample(Location fix) {
        long now = System.currentTimeMillis();
        if (now >= state.getLong("expiry", 0) || Math.abs(now - fix.getTime()) > 60000) return;
        String point = fix.getLatitude() + "," + fix.getLongitude();
        String map = "https://www.openstreetmap.org/?mlat=" + fix.getLatitude() + "&mlon=" + fix.getLongitude();
        String pin = point + " at " + new Date(fix.getTime()) + " " + map;
        if (now - state.getLong("shared", 0) >= 5 * 60000L) {
            state.edit().putLong("shared", now).apply();
            send("Marg Rakshak safety session. Last location: " + pin);
        }
        state.edit().putString("pin", pin).apply();
        if (!fix.hasAccuracy() || fix.getAccuracy() > 25) { anchor = null; return; }
        if (state.getLong("deadline", 0) != 0) return;
        if (anchor == null || now - lastSample > 60000 || anchor.distanceTo(fix) > 25) {
            anchor = new Location(fix);
        } else if (fix.getTime() - anchor.getTime() >= 240000) {
            state.edit().putLong("deadline", now + 60000).apply();
            resume();
        }
        lastSample = now;
    }

    void resume() {
        long due = state.getLong("deadline", 0);
        if (due == 0) return;
        long remaining = due - System.currentTimeMillis();
        timer.removeCallbacksAndMessages(null);
        if (remaining <= 0) { escalate(); return; }
        if (!promptLock.isHeld()) promptLock.acquire(remaining + 3000);
        Intent ok = new Intent(context, SafetyLocationService.class).setAction(OK).putExtra("deadline", due);
        PendingIntent answer = PendingIntent.getService(context, 10, ok, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        notices.notify(PROMPT, new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("Are you okay?")
            .setContentText("Tap I am okay before family is alerted.").setWhen(due)
            .setUsesChronometer(true).setChronometerCountDown(true).setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL)
            .addAction(0, "I am okay", answer).build());
        timer.postDelayed(this::escalate, remaining);
    }

    void acknowledge(long due) {
        if (due != 0 && due == state.getLong("deadline", 0)) resetPrompt();
    }

    private void escalate() {
        if (state.getLong("deadline", 0) == 0) return;
        if (System.currentTimeMillis() < state.getLong("expiry", 0))
            send("Marg Rakshak: no response after remaining stationary. Call me now and decide whether to contact emergency services. Last location: " + state.getString("pin", "GPS unavailable"));
        resetPrompt();
    }

    private void send(String message) {
        for (String phone : state.getStringSet("phones", Collections.emptySet())) {
            try {
                SmsManager sms = SmsManager.getDefault();
                ArrayList<String> parts = sms.divideMessage(message);
                sms.sendMultipartTextMessage(phone, null, parts, SmsResultReceiver.callbacks(context, parts.size()), null);
            } catch (RuntimeException e) {
                notices.notify(FAILURE, new NotificationCompat.Builder(context, CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("Family SMS failed")
                    .setContentText("Check your SIM, signal and SMS permission.").build());
            }
        }
    }

    void extend(long expiry) {
        state.edit().putLong("expiry", expiry).apply();
    }

    void resetPrompt() {
        timer.removeCallbacksAndMessages(null);
        if (promptLock.isHeld()) promptLock.release();
        notices.cancel(PROMPT);
        state.edit().remove("deadline").apply();
        anchor = null;
    }

    void stop() {
        resetPrompt();
        state.edit().clear().apply();
    }
}
