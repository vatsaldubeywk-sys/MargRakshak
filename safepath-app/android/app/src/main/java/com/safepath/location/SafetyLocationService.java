package com.safepath.location;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.safepath.MainActivity;

/**
 * Foreground service providing continuous location tracking and check-in reminder
 * notifications during an active safety session in Marg Rakshak.
 */
public class SafetyLocationService extends Service implements LocationListener {

    private static final String TAG = "SafetyLocationService";

    public static final String ACTION_START = "com.safepath.action.START_LOCATION";
    public static final String ACTION_STOP = "com.safepath.action.STOP_LOCATION";

    public static final String EXTRA_DURATION_MINUTES = "duration_minutes";
    public static final String EXTRA_NEXT_CHECK_IN_AT_MS = "next_check_in_at_ms";
    public static final String EXTRA_EXPIRES_AT_MS = "expires_at_ms";

    public static final String CHANNEL_SESSION_ID = "safety_session";
    public static final String CHANNEL_REMINDERS_ID = "safety_checkin_reminders";

    private static final int NOTIFICATION_SESSION_ID = 1001;
    private static final int NOTIFICATION_REMINDER_ID = 1002;

    private static final String PREFS_NAME = "marg_rakshak_safety_service";
    private static final String PREF_KEY_EXPIRES_AT = "expires_at_ms";
    private static final String PREF_KEY_NEXT_CHECKIN_AT = "next_check_in_at_ms";
    private static final String PREF_KEY_IS_ACTIVE = "is_active";

    public static volatile boolean isRunning = false;
    private static ReactContext sReactContext = null;

    private FusedLocationProviderClient mFusedLocationClient;
    private LocationCallback mLocationCallback;
    private LocationManager mLocationManager;
    private NotificationManager mNotificationManager;
    private Handler mHandler;
    private FamilyMonitor monitor;

    private Runnable mExpiryRunnable;
    private Runnable mCheckInReminderRunnable;

    public static void setReactContext(ReactContext reactContext) {
        sReactContext = reactContext;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mHandler = new Handler(Looper.getMainLooper());
        mNotificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        mLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        mFusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

        createNotificationChannels();
        monitor = new FamilyMonitor(this);
        initLocationCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            recoverFromRestart();
            return START_STICKY;
        }

        String action = intent.getAction();
        if (FamilyMonitor.OK.equals(action)) {
            if (!isRunning) recoverFromRestart();
            if (isRunning) monitor.acknowledge(intent.getLongExtra("deadline", 0));
            return START_STICKY;
        }
        if ("update".equals(action) && isRunning) {
            if (intent.getBooleanExtra("checkIn", false)) monitor.resetPrompt();
            long expiry = intent.getLongExtra("expiry", 0);
            if (expiry > System.currentTimeMillis()) {
                monitor.extend(expiry);
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putLong(PREF_KEY_EXPIRES_AT, expiry).apply();
                scheduleExpiry(expiry);
            }
            return START_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            Log.d(TAG, "Received ACTION_STOP");
            stopTrackingAndSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            Log.d(TAG, "Received ACTION_START");
            int durationMinutes = intent.getIntExtra(EXTRA_DURATION_MINUTES, 60);
            long nextCheckInAtMs = (long) intent.getDoubleExtra(EXTRA_NEXT_CHECK_IN_AT_MS, 0);
            long expiresAtMs = (long) intent.getDoubleExtra(EXTRA_EXPIRES_AT_MS, 0);

            // Intent extras may also be provided as long values
            if (nextCheckInAtMs == 0) {
                nextCheckInAtMs = intent.getLongExtra(EXTRA_NEXT_CHECK_IN_AT_MS, 0);
            }
            if (expiresAtMs == 0) {
                expiresAtMs = intent.getLongExtra(EXTRA_EXPIRES_AT_MS, 0);
            }

            long now = System.currentTimeMillis();
            if (expiresAtMs <= now && durationMinutes > 0) {
                expiresAtMs = now + (durationMinutes * 60L * 1000L);
            }
            if (nextCheckInAtMs <= now) {
                nextCheckInAtMs = now + (15L * 60L * 1000L); // default 15 min check-in
            }

            startForegroundWithNotification();
            monitor.start(intent.getStringArrayListExtra("phones"), expiresAtMs);
            saveSessionState(nextCheckInAtMs, expiresAtMs);
            scheduleExpiry(expiresAtMs);
            scheduleCheckInReminder(nextCheckInAtMs);
            requestLocationUpdates();

            isRunning = true;
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Channel 1: Ongoing session notification (LOW importance, no alert noise)
            NotificationChannel sessionChannel = new NotificationChannel(
                    CHANNEL_SESSION_ID,
                    "Marg Rakshak Safety Session",
                    NotificationManager.IMPORTANCE_LOW
            );
            sessionChannel.setDescription("Shows active tracking status during your safety session");
            mNotificationManager.createNotificationChannel(sessionChannel);

            // Channel 2: Check-in reminders (DEFAULT importance with vibration)
            NotificationChannel reminderChannel = new NotificationChannel(
                    CHANNEL_REMINDERS_ID,
                    "Safety Check-in Reminders",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            reminderChannel.setDescription("Alerts you when periodic safety check-ins are due");
            reminderChannel.enableVibration(true);
            reminderChannel.setVibrationPattern(new long[]{0, 500, 250, 500});
            mNotificationManager.createNotificationChannel(reminderChannel);
        }
    }

    private void startForegroundWithNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                pendingIntentFlags
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_SESSION_ID)
                .setContentTitle("Marg Rakshak session active")
                .setContentText("Location is being sampled")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_SESSION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_SESSION_ID, notification);
        }
    }

    private void initLocationCallback() {
        mLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) {
                    return;
                }
                for (Location location : locationResult.getLocations()) {
                    if (location != null) {
                        broadcastLocation(location);
                    }
                }
            }
        };
    }

    @SuppressLint("MissingPermission")
    private void requestLocationUpdates() {
        try {
            LocationRequest locationRequest = new LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    15_000L // 15 seconds desired interval
            )
                    .setMinUpdateIntervalMillis(5_000L) // 5 seconds fastest interval
                    .setMinUpdateDistanceMeters(0.0f)  // 10 meters min distance
                    .build();

            mFusedLocationClient.requestLocationUpdates(
                    locationRequest,
                    mLocationCallback,
                    Looper.getMainLooper()
            ).addOnFailureListener(e -> {
                Log.w(TAG, "FusedLocationProviderClient failed, falling back to LocationManager: " + e.getMessage());
                fallbackToLocationManager();
            });
        } catch (SecurityException se) {
            Log.e(TAG, "Location permission missing for FusedLocationClient: " + se.getMessage());
            fallbackToLocationManager();
        } catch (Exception ex) {
            Log.e(TAG, "Error starting FusedLocationProviderClient: " + ex.getMessage());
            fallbackToLocationManager();
        }
    }

    @SuppressLint("MissingPermission")
    private void fallbackToLocationManager() {
        if (mLocationManager == null) {
            return;
        }

        try {
            if (mLocationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                mLocationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        15_000L,
                        0.0f,
                        this,
                        Looper.getMainLooper()
                );
            } else if (mLocationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                mLocationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        15_000L,
                        0.0f,
                        this,
                        Looper.getMainLooper()
                );
            }
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException while requesting LocationManager fallback: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Exception while requesting LocationManager fallback: " + e.getMessage());
        }
    }

    private void broadcastLocation(Location location) {
        monitor.sample(location);
        ReactContext reactContext = getEffectiveReactContext();
        if (reactContext == null) {
            Log.d(TAG, "ReactContext not ready yet to receive location update");
            return;
        }

        try {
            WritableMap params = Arguments.createMap();
            params.putDouble("latitude", location.getLatitude());
            params.putDouble("longitude", location.getLongitude());
            params.putDouble("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0.0);
            params.putDouble("timestamp", location.getTime() > 0 ? (double) location.getTime() : (double) System.currentTimeMillis());

            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onLocationUpdate", params);
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit onLocationUpdate event: " + e.getMessage());
        }
    }

    private ReactContext getEffectiveReactContext() {
        if (sReactContext != null && sReactContext.hasActiveReactInstance()) {
            return sReactContext;
        }

        try {
            ReactApplication app = (ReactApplication) getApplication();
            ReactNativeHost host = app.getReactNativeHost();
            if (host != null && host.getReactInstanceManager() != null) {
                ReactContext currentContext = host.getReactInstanceManager().getCurrentReactContext();
                if (currentContext != null && currentContext.hasActiveReactInstance()) {
                    return currentContext;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not resolve ReactContext via ReactApplication: " + e.getMessage());
        }

        return sReactContext;
    }

    private void scheduleExpiry(long expiresAtMs) {
        if (mExpiryRunnable != null) {
            mHandler.removeCallbacks(mExpiryRunnable);
        }

        long delay = expiresAtMs - System.currentTimeMillis();
        if (delay <= 0) {
            delay = 1000L;
        }

        mExpiryRunnable = () -> {
            Log.i(TAG, "Safety session expired. Stopping SafetyLocationService.");
            stopTrackingAndSelf();
        };

        mHandler.postDelayed(mExpiryRunnable, delay);
    }

    private void scheduleCheckInReminder(long nextCheckInAtMs) {
        if (mCheckInReminderRunnable != null) {
            mHandler.removeCallbacks(mCheckInReminderRunnable);
        }

        long delay = nextCheckInAtMs - System.currentTimeMillis();
        if (delay <= 0) {
            delay = 1000L;
        }

        mCheckInReminderRunnable = () -> {
            Log.i(TAG, "Check-in reminder triggered.");
            showCheckInReminderNotification();
        };

        mHandler.postDelayed(mCheckInReminderRunnable, delay);
    }

    private void showCheckInReminderNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                1,
                openAppIntent,
                pendingIntentFlags
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_REMINDERS_ID)
                .setContentTitle("Safety check-in due")
                .setContentText("Please tap to open Marg Rakshak and confirm your safety status.")
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .build();

        if (mNotificationManager != null) {
            mNotificationManager.notify(NOTIFICATION_REMINDER_ID, notification);
        }
    }

    private void saveSessionState(long nextCheckInAtMs, long expiresAtMs) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean(PREF_KEY_IS_ACTIVE, true)
                .putLong(PREF_KEY_NEXT_CHECKIN_AT, nextCheckInAtMs)
                .putLong(PREF_KEY_EXPIRES_AT, expiresAtMs)
                .apply();
    }

    private void clearSessionState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
    }

    private void recoverFromRestart() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean isActive = prefs.getBoolean(PREF_KEY_IS_ACTIVE, false);
        if (!isActive) {
            stopSelf();
            return;
        }

        long expiresAtMs = prefs.getLong(PREF_KEY_EXPIRES_AT, 0);
        long nextCheckInAtMs = prefs.getLong(PREF_KEY_NEXT_CHECKIN_AT, 0);
        long now = System.currentTimeMillis();

        if (expiresAtMs <= now) {
            clearSessionState();
            stopSelf();
            return;
        }

        startForegroundWithNotification();
        monitor.resume();
        scheduleExpiry(expiresAtMs);
        if (nextCheckInAtMs > now) {
            scheduleCheckInReminder(nextCheckInAtMs);
        }
        requestLocationUpdates();
        isRunning = true;
    }

    private void stopTrackingAndSelf() {
        isRunning = false;
        monitor.stop();
        clearSessionState();

        if (mExpiryRunnable != null) {
            mHandler.removeCallbacks(mExpiryRunnable);
            mExpiryRunnable = null;
        }
        if (mCheckInReminderRunnable != null) {
            mHandler.removeCallbacks(mCheckInReminderRunnable);
            mCheckInReminderRunnable = null;
        }

        if (mFusedLocationClient != null && mLocationCallback != null) {
            mFusedLocationClient.removeLocationUpdates(mLocationCallback);
        }

        if (mLocationManager != null) {
            mLocationManager.removeUpdates(this);
        }

        stopForeground(true);
        if (mNotificationManager != null) {
            mNotificationManager.cancel(NOTIFICATION_SESSION_ID);
            mNotificationManager.cancel(NOTIFICATION_REMINDER_ID);
        }

        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopTrackingAndSelf();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // --- android.location.LocationListener callbacks for fallback ---
    @Override
    public void onLocationChanged(Location location) {
        if (location != null) {
            broadcastLocation(location);
        }
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
