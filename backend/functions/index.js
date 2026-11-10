const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

initializeApp();
const db = getFirestore();
const region = "asia-south1";
const requireUid = (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  return request.auth.uid;
};
const str = (value, name, max = 160) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  return value.trim();
};
const ownedSession = async (uid, sessionId, transaction) => {
  const ref = db.collection("sessions").doc(str(sessionId, "sessionId", 128));
  const snap = await transaction.get(ref);
  if (!snap.exists || snap.get("ownerUid") !== uid) throw new HttpsError("not-found", "Session not found.");
  return { ref, data: snap.data() };
};

exports.createSession = onCall({ region, enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const durationMinutes = Number(request.data?.durationMinutes);
  if (![30, 60, 120].includes(durationMinutes)) throw new HttpsError("invalid-argument", "Choose a supported duration.");
  const contacts = Array.isArray(request.data?.contactIds) ? [...new Set(request.data.contactIds)].slice(0, 10) : [];
  const contactSnaps = await Promise.all(contacts.map((id) => db.doc(`users/${uid}/contacts/${str(id, "contactId", 128)}`).get()));
  if (contactSnaps.some((snap) => !snap.exists || snap.get("status") !== "accepted")) throw new HttpsError("failed-precondition", "Every selected contact must have accepted the invitation.");
  const now = Timestamp.now();
  const ref = db.collection("sessions").doc();
  await ref.create({ ownerUid: uid, contactIds: contacts, status: "active", createdAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + durationMinutes * 60000), lastLocation: null, lastHeartbeatAt: now, endedAt: null });
  return { sessionId: ref.id, status: "active", expiresAt: now.toMillis() + durationMinutes * 60000 };
});

exports.updateLocation = onCall({ region, enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const sessionId = str(request.data?.sessionId, "sessionId", 128);
  const sampleId = str(request.data?.sampleId, "sampleId", 128);
  const latitude = Number(request.data?.latitude), longitude = Number(request.data?.longitude), accuracy = Number(request.data?.accuracy);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000) throw new HttpsError("invalid-argument", "Location sample is invalid.");
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sampleRef = sessionRef.collection("locationSamples").doc(sampleId);
  await db.runTransaction(async (tx) => {
    const [session, duplicate] = await Promise.all([tx.get(sessionRef), tx.get(sampleRef)]);
    if (!session.exists || session.get("ownerUid") !== uid || session.get("status") !== "active") throw new HttpsError("failed-precondition", "Session is not active.");
    if (duplicate.exists) return;
    const point = { latitude, longitude, accuracy, observedAt: Timestamp.now() };
    tx.create(sampleRef, point);
    tx.update(sessionRef, { lastLocation: point, lastHeartbeatAt: FieldValue.serverTimestamp() });
  });
  return { accepted: true };
});

exports.createSos = onCall({ region, enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const sessionId = str(request.data?.sessionId, "sessionId", 128);
  const eventId = str(request.data?.eventId, "eventId", 128);
  const eventRef = db.collection("sessions").doc(sessionId).collection("events").doc(eventId);
  await db.runTransaction(async (tx) => {
    const { ref, data } = await ownedSession(uid, sessionId, tx);
    const existing = await tx.get(eventRef);
    if (existing.exists) return;
    if (data.status !== "active") throw new HttpsError("failed-precondition", "Session is not active.");
    tx.create(eventRef, { type: "manual_sos", actorUid: uid, createdAt: FieldValue.serverTimestamp(), status: "open", acknowledgedBy: [] });
    tx.update(ref, { alertState: "open" });
  });
  return { eventId, status: "recorded" };
});

exports.endSession = onCall({ region, enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const sessionId = str(request.data?.sessionId, "sessionId", 128);
  const ref = db.collection("sessions").doc(sessionId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("ownerUid") !== uid) throw new HttpsError("not-found", "Session not found.");
    if (snap.get("status") === "active") tx.update(ref, { status: "ended", endedAt: FieldValue.serverTimestamp(), contactIds: [] });
  });
  return { status: "ended" };
});

exports.expireSessions = onSchedule({ schedule: "every 1 minutes", region, timeZone: "Asia/Kolkata" }, async () => {
  const now = Timestamp.now();
  const due = await db.collection("sessions").where("status", "==", "active").where("expiresAt", "<=", now).limit(300).get();
  const batch = db.batch();
  for (const doc of due.docs) batch.update(doc.ref, { status: "expired", endedAt: FieldValue.serverTimestamp(), contactIds: [] });
  await batch.commit();
});
