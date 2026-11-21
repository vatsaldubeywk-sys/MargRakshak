package com.safepath.location;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * React Native native module bridging the JavaScript layer to the Android
 * native SafetyLocationService foreground service.
 */
public class LocationModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "LocationModule";
    private static final String TAG = "LocationModule";

    public LocationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        SafetyLocationService.setReactContext(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @Override
    public void initialize() {
        super.initialize();
        SafetyLocationService.setReactContext(getReactApplicationContext());
    }

    /**
     * Start the native Android foreground location tracking service.
     *
     * @param durationMinutes Expected session duration in minutes
     * @param nextCheckInAtMs Timestamp (UTC ms) when the next safety check-in is required
     * @param expiresAtMs Timestamp (UTC ms) when the safety session expires
     */
    @ReactMethod
    public void startService(int durationMinutes, double nextCheckInAtMs, double expiresAtMs) {
        ReactApplicationContext context = getReactApplicationContext();
        try {
            Intent intent = new Intent(context, SafetyLocationService.class);
            intent.setAction(SafetyLocationService.ACTION_START);
            intent.putExtra(SafetyLocationService.EXTRA_DURATION_MINUTES, durationMinutes);
            intent.putExtra(SafetyLocationService.EXTRA_NEXT_CHECK_IN_AT_MS, nextCheckInAtMs);
            intent.putExtra(SafetyLocationService.EXTRA_EXPIRES_AT_MS, expiresAtMs);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            Log.i(TAG, "SafetyLocationService started via startForegroundService/startService");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start SafetyLocationService: " + e.getMessage(), e);
        }
    }

    /**
     * Stop the native Android foreground location tracking service.
     */
    @ReactMethod
    public void stopService() {
        ReactApplicationContext context = getReactApplicationContext();
        try {
            Intent intent = new Intent(context, SafetyLocationService.class);
            intent.setAction(SafetyLocationService.ACTION_STOP);
            context.startService(intent);
            Log.i(TAG, "SafetyLocationService stop requested");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop SafetyLocationService: " + e.getMessage(), e);
        }
    }

    /**
     * Check whether the foreground location service is currently active.
     *
     * @param promise Resolves with boolean indicating whether service is running
     */
    @ReactMethod
    public void isServiceRunning(Promise promise) {
        try {
            if (SafetyLocationService.isRunning) {
                promise.resolve(true);
                return;
            }

            // Fallback: Query system ActivityManager to verify if service is running
            ReactApplicationContext context = getReactApplicationContext();
            ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (activityManager != null) {
                for (ActivityManager.RunningServiceInfo service : activityManager.getRunningServices(Integer.MAX_VALUE)) {
                    if (SafetyLocationService.class.getName().equals(service.service.getClassName())) {
                        promise.resolve(true);
                        return;
                    }
                }
            }
            promise.resolve(false);
        } catch (Exception e) {
            promise.reject("SERVICE_CHECK_ERROR", e.getMessage(), e);
        }
    }
}
