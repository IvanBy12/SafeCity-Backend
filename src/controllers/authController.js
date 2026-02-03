import { randomUUID } from "crypto"
import User from "../models/User.js"
import Device from "../models/Device.js"
import Session from "../models/Session.js"

export async function startSession(req, res) {
  const { deviceId, platform, fcmToken, displayName, photoUrl } = req.body
  const uid = req.user.uid
  const email = req.user.email

  if (!deviceId || !platform || !fcmToken) {
    return res.status(400).json({ message: "deviceId, platform y fcmToken son obligatorios" })
  }

  // 1) Upsert user
  await User.updateOne(
    { firebaseUid: uid },
    {
      $set: {
        email,
        displayName: displayName || email || "user",
        photoUrl: photoUrl ?? null,
        lastLoginAt: new Date(),
      },
      $setOnInsert: { status: "active", role: "user" },
    },
    { upsert: true }
  )

  // 2) Upsert device (uid + deviceId unique)
  await Device.updateOne(
    { uid, deviceId },
    {
      $set: {
        platform,
        fcmToken,
        enabled: true,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { notif: {}, lastLocation: null },
    },
    { upsert: true }
  )

  // 3) Create session
  const sessionId = randomUUID()
  const ip = req.headers["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket.remoteAddress
  const userAgent = req.headers["user-agent"] || null

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 días

  await Session.create({
    uid,
    deviceId,
    sessionId,
    ip,
    userAgent,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt,
    revokedAt: null,
  })

  return res.json({ ok: true, uid, sessionId, expiresAt })
}
