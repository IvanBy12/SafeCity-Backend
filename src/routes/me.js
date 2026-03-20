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
  const uid = req.user.uid

  console.log("DEVICE_UPSERT_INICIO")
  console.log(`DEVICE_UPSERT_UID ${uid}`)
  console.log(`DEVICE_UPSERT_TOKEN ${fcmToken || "missing"}`)

  if (!deviceId || !fcmToken) {
    return res.status(400).json({ message: "deviceId y fcmToken son obligatorios" })
  }

  try {
    const update = {
      $set: {
        uid,
        deviceId,
        platform,
        fcmToken,
        enabled: true,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { notif: {} },
    }

    if (latitude != null && longitude != null) {
      update.$set.lastLocation = {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      }
    }

    const result = await Device.updateOne(
      { uid, deviceId },
      update,
      { upsert: true }
    )

    console.log(
      `DEVICE_UPSERT_OK uid=${uid} deviceId=${deviceId} matched=${result.matchedCount} modified=${result.modifiedCount} upserted=${result.upsertedCount}`
    )
    return res.json({ ok: true })
  } catch (error) {
    console.error(`DEVICE_UPSERT_ERROR uid=${uid} deviceId=${deviceId} error=${error.message}`)
    return res.status(500).json({ ok: false, message: "Error registrando dispositivo" })
  }
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
  const uid = req.user.uid

  if (!deviceId || latitude == null || longitude == null) {
    return res.status(400).json({ message: "deviceId, latitude y longitude son obligatorios" })
  }

  try {
    const result = await Device.updateOne(
      { uid, deviceId },
      {
        $set: {
          lastLocation: {
            type: "Point",
            coordinates: [Number(longitude), Number(latitude)],
          },
          enabled: true,
          lastSeenAt: new Date(),
        },
      }
    )

    if (result.matchedCount === 0) {
      return res.json({ ok: false, message: "Dispositivo no registrado, llama primero a PUT /me/device" })
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error(`DEVICE_LOCATION_ERROR uid=${uid} deviceId=${deviceId} error=${error.message}`)
    return res.status(500).json({ ok: false, message: "Error actualizando ubicación" })
  }
})

export default router
