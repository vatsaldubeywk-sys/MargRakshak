# Marg Rakshak (मार्ग रक्षक) — SIM-First Personal Safety Ecosystem

**Marg Rakshak** is a production-ready personal safety mobile platform built specifically around **offline SIM-network cellular transmission** and **automated stationary inactivity detection**. It empowers users feeling unsafe to broadcast their live GPS location directly to family members via cellular SMS—completely independent of internet connectivity—and protects them with automated non-movement escalation.

---

## 🎯 The Core Concept & How It Works

```
                        User feels unsafe in an area
                                    │
                                    ▼
                     1-Tap Start Safety Session
              (No internet, login, or cloud tokens required)
                                    │
                                    ▼
                      Real-time GPS Tracking Active
             (Android foreground service with sticky notification)
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │   Stationary Inactivity Detector (stationaryDetector)  │
       │   Monitors movement radius (25m) over a 4-minute window│
       └────────────────────────────┬───────────────────────────┘
                                    │
                   Has user stopped moving for 4+ mins?
                                    │
                     ┌──────────────┴──────────────┐
                     │ NO                          │ YES
                     ▼                             ▼
              Keep Tracking                Loud Urgent Prompt:
                                          "⚠️ ARE YOU OKAY?"
                                      (60-second countdown clock)
                                                   │
                                ┌──────────────────┴──────────────────┐
                                │                                     │
                        User taps "I AM OKAY"               No response in 60s
                                │                               (or User in danger)
                                ▼                                     │
                     Reset stationary anchor                          ▼
                       and resume session               Direct SIM SMS to Family
                                                    (Via phone SIM card, no internet)
                                                                      │
                                                                      ▼
                                                       Family receives alert with:
                                                       • Exact GPS fix + Live OSM map
                                                       • Advice to CALL user immediately
                                                       • Empowerment to decide when to
                                                         dispatch Police (112) / Amb (108)
```

---

## 🌟 Key Architecture Pillars

### 1. 📡 SIM Network Transmission (No Internet Needed)
- **Problem Solved**: Danger zones, alleys, basements, and transit dead-zones in India often suffer from zero mobile data / dead internet connections.
- **Solution**: Marg Rakshak communicates directly through the device SIM card using Android's native `SmsManager` (`DirectSmsModule.java`).
- **Offline Family Contacts**: Store trusted family members (*Mom, Dad, Spouse, Sibling, Friend*) with their mobile phone numbers locally in hardware storage without requiring cloud sign-in.
- **1-Tap Inclusion**: Easily toggle which family members receive SMS alerts with a single switch.

### 2. ⏱️ Automated Stationary Inactivity Detection
- **Haversine Distance Tracking**: Calculates real-time displacement between consecutive GPS fixes.
- **4-Minute No-Movement Threshold**: If the user remains within a 25-meter radius for 4 minutes, the app flags a potential hazard (e.g. attacked, cornered, or incapacitated).

### 3. ⚠️ "Are You Okay?" Prompt & Escalation Timeout
- Full-screen high-priority alert with urgent audio/vibration attention cadence.
- 60-second countdown clock giving the user time to confirm safety.
- **✓ I AM OKAY**: Immediately cancels alert and resets the stationary clock.
- **🚨 I NEED HELP NOW**: Bypasses countdown and fires instant SOS.
- **Timeout Escalation**: If the user fails to answer before the countdown reaches 00:00, the app automatically dispatches an emergency SMS over the SIM network to all active family contacts.

### 4. 👨‍👩‍👧 Family-First Decision Protocol (Preventing Police Spam)
- Rather than spamming emergency 112 on every false alarm (such as a forgotten phone or unexpected traffic stop), the app alerts the **family members** directly.
- The SMS provides:
  1. The user's exact latitude and longitude with an OpenStreetMap live navigation pin.
  2. Notice that the user has stopped moving and failed to answer the check-in prompt.
  3. Direct instruction for family to call the user, and decide when to contact Police (112) or Ambulance (108) if unreachable.

### 5. 🚨 1-Tap Immediate Emergency SOS
- Instant SOS button fires direct SIM SMS alerts to all family contacts with live coordinates in under 2 seconds.
- Provides immediate 1-tap ERSS 112 dialer fallback.

---

## 📁 Core Module Structure

| Module | Location | Purpose |
| :--- | :--- | :--- |
| **DirectSmsModule** | `android/.../sms/DirectSmsModule.java` | Native Android Java bridge using `SmsManager` for direct background SIM SMS dispatch |
| **SmsService** | `safepath-app/src/services/smsService.ts` | SMS permission handler, message formatting, batch SIM dispatch, and intent fallbacks |
| **FamilyContactsService** | `safepath-app/src/services/familyContactsService.ts` | Offline-first local storage for family phone numbers and alert preferences |
| **StationaryDetector** | `safepath-app/src/services/stationaryDetector.ts` | Inactivity detection engine evaluating displacement (<25m) over a 4-minute window |
| **AreYouOkayModal** | `safepath-app/src/components/AreYouOkayModal.tsx` | 60-second countdown safety prompt with tactical vibration and non-response escalation |
| **HomeScreen** | `safepath-app/src/screens/HomeScreen.tsx` | Central safety dashboard coordinating GPS updates, stationary monitoring, and SOS |
| **ContactsScreen** | `safepath-app/src/screens/ContactsScreen.tsx` | Intuitive UI to manage family contacts, phone numbers, and test SIM delivery |

---

## 🚀 Development & Build

```bash
cd safepath-app
npm install

# Start Metro
npm start

# Run Android
npm run android
```
