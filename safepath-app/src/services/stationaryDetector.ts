import type { LocationSample } from '../types';

export interface StationaryEvent {
  latitude: number;
  longitude: number;
  accuracy: number;
  stationaryDurationMinutes: number;
  timestamp: number;
}

type StationaryCallback = (event: StationaryEvent) => void;

/**
 * Calculates Haversine distance in meters between two geographical coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * StationaryDetector monitors incoming GPS fixes during an active safety session.
 * If the user has not moved beyond a threshold distance (default 25m) for longer
 * than the stationary window (default 4 minutes), it raises a stationary alert event.
 */
class StationaryDetector {
  private anchorLocation: LocationSample | null = null;
  private anchorTimestamp: number = 0;
  private stationaryThresholdMeters: number = 25; // 25 meters radius
  private stationaryWindowMs: number = 4 * 60 * 1000; // 4 minutes
  private isMonitoring: boolean = false;
  private hasFiredAlert: boolean = false;
  private listeners: Set<StationaryCallback> = new Set();

  /**
   * Start stationary monitoring for a safety session.
   * @param windowMinutes Time window in minutes before raising "Are you okay?" prompt (default 4 mins)
   * @param radiusMeters Maximum distance in meters to still be considered stationary (default 25m)
   */
  start(windowMinutes: number = 4, radiusMeters: number = 25): void {
    this.stationaryWindowMs = windowMinutes * 60 * 1000;
    this.stationaryThresholdMeters = radiusMeters;
    this.isMonitoring = true;
    this.hasFiredAlert = false;
    this.anchorLocation = null;
    this.anchorTimestamp = Date.now();
  }

  /**
   * Stop monitoring when session ends or is paused.
   */
  stop(): void {
    this.isMonitoring = false;
    this.anchorLocation = null;
    this.anchorTimestamp = 0;
    this.hasFiredAlert = false;
  }

  /**
   * Called when user confirms "I Am Okay" or moves to reset the stationary clock.
   */
  resetAnchor(currentLocation?: LocationSample | null): void {
    if (currentLocation) {
      this.anchorLocation = currentLocation;
    }
    this.anchorTimestamp = Date.now();
    this.hasFiredAlert = false;
  }

  /**
   * Ingest a new location fix and evaluate movement.
   */
  processLocation(sample: LocationSample): void {
    if (!this.isMonitoring) return;

    const now = Date.now();

    // First sample establishes anchor
    if (!this.anchorLocation) {
      this.anchorLocation = sample;
      this.anchorTimestamp = now;
      return;
    }

    const distance = calculateDistanceMeters(
      this.anchorLocation.latitude,
      this.anchorLocation.longitude,
      sample.latitude,
      sample.longitude,
    );

    // If moved beyond threshold, user is active -> update anchor
    if (distance > this.stationaryThresholdMeters) {
      this.anchorLocation = sample;
      this.anchorTimestamp = now;
      this.hasFiredAlert = false;
      return;
    }

    // User is within stationary threshold radius
    const elapsedMs = now - this.anchorTimestamp;
    if (elapsedMs >= this.stationaryWindowMs && !this.hasFiredAlert) {
      this.hasFiredAlert = true;
      const event: StationaryEvent = {
        latitude: sample.latitude,
        longitude: sample.longitude,
        accuracy: sample.accuracy,
        stationaryDurationMinutes: Math.round(this.stationaryWindowMs / 60000),
        timestamp: now,
      };
      this.listeners.forEach(cb => {
        try {
          cb(event);
        } catch (err) {
          console.warn('Error in stationary callback:', err);
        }
      });
    }
  }

  /**
   * Subscribe to stationary detection events.
   */
  onStationary(callback: StationaryCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export default new StationaryDetector();
