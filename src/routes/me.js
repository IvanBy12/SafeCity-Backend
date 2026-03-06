import express from "express"
import { requireAuth } from "../middleware/auth.js"
import User from "../models/User.js"
import Device from "../models/Device.js"

const router = express.Router()

// ==========================================
// GET /me — perfil del usuario autenticado
// ==========================================
router.get("/me", requireAuth, async (req, res) => {
  const firebaseUid = req.user.uid
  const email = req.user.email || null
  const now = new Date()

  const userDoc = await User.findOneAndUpdate(
    { firebaseUid },
    {
      $setOnInsert: { status: "active", role: "user" },
      $set: { email, lastLoginAt: now },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  res.json({
    firebaseUid,
    role: userDoc.role,
    status: userDoc.status,
    email: userDoc.email,
    isAdmin: userDoc.role === "admin",
  })
})

// ==========================================
// PUT /me/device
// Registra o actualiza el dispositivo del usuario.
// Body: { deviceId, platform, fcmToken, latitude?, longitude? }
//
// La app llama esto justo después del login y siempre que
// el FCM token se renueve (onNewToken).
// ==========================================
router.put("/me/device", requireAuth, async (req, res) => {
  const { deviceId, platform = "android", fcmToken, latitude, longitude } = req.body

  if (!deviceId || !fcmToken) {
    return res.status(400).json({ message: "deviceId y fcmToken son obligatorios" })
  }

  const update = {
    $set: {
      platform,
      fcmToken,
      enabled: true,
      lastSeenAt: new Date(),
    },
    $setOnInsert: { notif: {} },
  }

  // Si mandan ubicación, la guardamos también
  if (latitude != null && longitude != null) {
    update.$set.lastLocation = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)],
    }
  }

  await Device.updateOne(
    { uid: req.user.uid, deviceId },
    update,
    { upsert: true }
  )

  return res.json({ ok: true })
})

// ==========================================
// PUT /me/location
// Actualiza SOLO la ubicación del dispositivo.
// Body: { deviceId, latitude, longitude }
//
// La app llama esto cada vez que la ubicación cambia
// significativamente (ej. cada 50-100m o cada 30s).
// ==========================================
router.put("/me/location", requireAuth, async (req, res) => {
  const { deviceId, latitude, longitude } = req.body

  if (!deviceId || latitude == null || longitude == null) {
    return res.status(400).json({ message: "deviceId, latitude y longitude son obligatorios" })
  }

  const result = await Device.updateOne(
    { uid: req.user.uid, deviceId },
    {
      $set: {
        lastLocation: {
          type: "Point",
          coordinates: [Number(longitude), Number(latitude)],
        },
        lastSeenAt: new Date(),
      },
    }
  )

  if (result.matchedCount === 0) {
    // El dispositivo no existe aún, ignoramos silenciosamente
    // (el cliente debe llamar primero PUT /me/device)
    return res.json({ ok: false, message: "Dispositivo no registrado, llama primero a PUT /me/device" })
  }

  return res.json({ ok: true })
})

export default router