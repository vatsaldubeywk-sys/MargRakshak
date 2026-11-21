package com.safepath.sms;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.util.ArrayList;

/**
 * Native Android module to dispatch SMS messages directly through the cellular SIM card network
 * without requiring an active Internet / Wi-Fi connection.
 * Essential for Marg Rakshak's offline emergency safety features.
 */
public class DirectSmsModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "DirectSmsModule";
    private static final String TAG = "DirectSmsModule";

    public DirectSmsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Checks if the device has telephony hardware capable of sending SMS.
     */
    @ReactMethod
    public void isTelephonyAvailable(Promise promise) {
        try {
            boolean available = getReactApplicationContext()
                    .getPackageManager()
                    .hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
            promise.resolve(available);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Sends an SMS directly via cellular SIM network to a single phone number.
     * Does NOT open the system SMS app; dispatches in background via SmsManager.
     */
    @ReactMethod
    public void sendDirectSms(String phoneNumber, String message, Promise promise) {
        ReactApplicationContext context = getReactApplicationContext();

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "SMS send permission (SEND_SMS) is not granted.");
            return;
        }

        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            promise.reject("INVALID_PHONE", "Destination phone number cannot be empty.");
            return;
        }

        try {
            SmsManager smsManager;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                smsManager = context.getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            if (smsManager == null) {
                promise.reject("SMS_MANAGER_UNAVAILABLE", "SmsManager is not accessible on this device.");
                return;
            }

            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, com.safepath.location.SmsResultReceiver.callbacks(getReactApplicationContext(), parts.size()), null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, com.safepath.location.SmsResultReceiver.callbacks(getReactApplicationContext(), 1).get(0), null);
            }

            Log.i(TAG, "Direct SIM SMS dispatched to " + phoneNumber + " (" + parts.size() + " part(s))");
            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Failed to send direct SIM SMS to " + phoneNumber, e);
            promise.reject("SMS_SEND_FAILED", e.getMessage());
        }
    }

    /**
     * Sends an SMS directly to multiple selected family phone numbers.
     * Returns a summary of successful and failed dispatches.
     */
    @ReactMethod
    public void sendSmsToMultiple(ReadableArray phoneNumbers, String message, Promise promise) {
        ReactApplicationContext context = getReactApplicationContext();

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "SMS send permission (SEND_SMS) is not granted.");
            return;
        }

        try {
            SmsManager smsManager;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                smsManager = context.getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            if (smsManager == null) {
                promise.reject("SMS_MANAGER_UNAVAILABLE", "SmsManager is not accessible on this device.");
                return;
            }

            ArrayList<String> parts = smsManager.divideMessage(message);
            int sentCount = 0;
            int failedCount = 0;

            for (int i = 0; i < phoneNumbers.size(); i++) {
                String phone = phoneNumbers.getString(i);
                if (phone == null || phone.trim().isEmpty()) continue;

                try {
                    if (parts.size() > 1) {
                        smsManager.sendMultipartTextMessage(phone, null, parts, com.safepath.location.SmsResultReceiver.callbacks(getReactApplicationContext(), parts.size()), null);
                    } else {
                        smsManager.sendTextMessage(phone, null, message, com.safepath.location.SmsResultReceiver.callbacks(getReactApplicationContext(), 1).get(0), null);
                    }
                    sentCount++;
                    Log.i(TAG, "SIM SMS successfully sent to " + phone);
                } catch (Exception ex) {
                    Log.w(TAG, "Failed dispatching to " + phone + ": " + ex.getMessage());
                    failedCount++;
                }
            }

            WritableMap result = Arguments.createMap();
            result.putInt("sentCount", sentCount);
            result.putInt("failedCount", failedCount);
            result.putInt("totalAttempted", phoneNumbers.size());
            promise.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "Batch direct SMS dispatch failed", e);
            promise.reject("BATCH_SMS_FAILED", e.getMessage());
        }
    }
}
