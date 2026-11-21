import {
  NativeModules,
  DeviceEventEmitter,
  Platform,
  EmitterSubscription,
} from 'react-native';
import Geolocation, {
  GeoPosition,
} from 'react-native-geolocation-service';
import type { LocationSample } from '../types';

const { LocationModule } = NativeModules;

type LocationCallback = (sample: LocationSample) => void;

let watchId: number | null = null;
let nativeSubscription: EmitterSubscription | null = null;
const listeners: Set<LocationCallback> = new Set();

/** Broadcast a sample to all registered listeners. */
function emit(sample: LocationSample): void {
  listeners.forEach(cb => cb(sample));
}

/** Convert a GeoPosition from react-native-geolocation-service. */
function toSample(pos: GeoPosition): LocationSample {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  };
}

/**
 * Location tracking manager for SafePath.
 *
 * On Android the native SafetyLocationService foreground service is started so
 * location keeps updating even when the app is backgrounded. A JS-side
 * watchPosition runs as a fallback / for iOS.
 */
const locationService = {
  /**
   * One-shot high-accuracy GPS fix.
   * Resolves with a single LocationSample.
   */
  getCurrentPosition(): Promise<LocationSample> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => resolve(toSample(position)),
        error => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 5_000,
        },
      );
    });
  },

  /**
   * Begin continuous location tracking for a safety session.
   *
   * On Android the native foreground service is started so the OS does not
   * kill location updates while the app is in the background.  A JS-side
   * watchPosition is set up as a universal fallback (and is the primary
   * source on iOS).
   */
  startTracking(
    sessionId: string,
    durationMinutes: number,
    nextCheckInAt: string | null | undefined,
    expiresAt: string,
  ): void {
    // Stop any previous tracking first.
    locationService.stopTracking();

    // ── Android native foreground service ──
    if (Platform.OS === 'android' && LocationModule?.startService) {
      const nextMs = nextCheckInAt ? new Date(nextCheckInAt).getTime() : 0;
      const expMs = expiresAt ? new Date(expiresAt).getTime() : 0;
      LocationModule.startService(
        durationMinutes,
        nextMs,
        expMs,
      );

      // Listen for samples pushed from the native module.
      nativeSubscription = DeviceEventEmitter.addListener(
        'onLocationUpdate',
        (event: { latitude: number; longitude: number; accuracy: number; timestamp: number }) => {
          emit({
            latitude: event.latitude,
            longitude: event.longitude,
            accuracy: event.accuracy,
            timestamp: event.timestamp,
          });
        },
      );
    }

    // ── JS-side watchPosition (fallback / iOS) ──
    watchId = Geolocation.watchPosition(
      position => emit(toSample(position)),
      _error => {
        /* Silently ignore transient errors; next fix will come. */
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 20, // metres
        interval: 30_000, // Android: desired interval
        fastestInterval: 10_000,
      },
    );
  },

  /** Stop all location tracking. */
  stopTracking(): void {
    // Stop native service on Android.
    if (Platform.OS === 'android' && LocationModule?.stopService) {
      LocationModule.stopService();
    }

    if (nativeSubscription) {
      nativeSubscription.remove();
      nativeSubscription = null;
    }

    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
      watchId = null;
    }
  },

  /**
   * Register a listener for location updates.
   * Returns an unsubscribe function.
   */
  onLocationUpdate(callback: LocationCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
};

export default locationService;
