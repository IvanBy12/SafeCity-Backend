import express from "express"
import { initFirebaseAdmin, requireAuth, requireAdmin } from "../middleware/auth.js"
import User from "../models/User.js"
import Device from "../models/Device.js"

const router = express.Router()

// ==========================================
// GET /admin/fcm-diagnostics
// Endpoint temporal para diagnosticar FCM.
// Requiere auth + admin. Eliminar después de validar.
// ==========================================
router.get("/fcm-diagnostics", requireAuth, requireAdmin, async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    steps: [],
  }

  try {
    // 1. Verificar credenciales Firebase Admin
    const admin = initFirebaseAdmin()
    const hasEnvVarCreds = !!(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    )
    diagnostics.steps.push({
      step: "1_firebase_credentials",
      status: "ok",
      method: hasEnvVarCreds ? "env_vars" : "application_default",
      projectId: process.env.FIREBASE_PROJECT_ID || "NOT_SET",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        ? process.env.FIREBASE_CLIENT_EMAIL.substring(0, 20) + "..."
        : "NOT_SET",
      privateKeyPresent: !!process.env.FIREBASE_PRIVATE_KEY,
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
      privateKeyStartsWith: process.env.FIREBASE_PRIVATE_KEY?.substring(0, 30) || "N/A",
      googleAppCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS || "NOT_SET",
    })

    // 2. Contar dispositivos totales
    const totalDevices = await Device.countDocuments({})
    const enabledDevices = await Device.countDocuments({ enabled: true })
    const devicesWithLocation = await Device.countDocuments({
      enabled: true,
      "lastLocation.type": "Point",
    })
    const devicesWithToken = await Device.countDocuments({
      enabled: true,
      fcmToken: { $exists: true, $ne: "" },
    })

    diagnostics.steps.push({
      step: "2_device_counts",
      status: "ok",
      totalDevices,
      enabledDevices,
      devicesWithLocation,
      devicesWithToken,
    })

    // 3. Mostrar los dispositivos con ubicación (sin datos sensibles)
    const sampleDevices = await Device.find({
      enabled: true,
      "lastLocation.type": "Point",
    })
      .select("uid deviceId platform enabled lastLocation lastSeenAt fcmToken")
      .limit(10)
      .lean()

    diagnostics.steps.push({
      step: "3_sample_devices",
      status: "ok",
      count: sampleDevices.length,
      devices: sampleDevices.map((d) => ({
        uid: d.uid,
        deviceId: d.deviceId,
        platform: d.platform,
        enabled: d.enabled,
        lastLocation: d.lastLocation,
        lastSeenAt: d.lastSeenAt,
        fcmTokenPreview: d.fcmToken
          ? `${d.fcmToken.substring(0, 10)}...${d.fcmToken.substring(d.fcmToken.length - 6)}`
          : "MISSING",
      })),
    })

    // 4. Probar envío FCM real (dry-run) con un token del primer dispositivo
    if (sampleDevices.length > 0 && sampleDevices[0].fcmToken) {
      const testToken = sampleDevices[0].fcmToken
      try {
        // sendEachForMulticast con dryRun: true NO envía la notificación real
        // pero SÍ valida el token y las credenciales con Firebase
        const testMessage = {
          notification: {
            title: "FCM Diagnostics Test",
            body: "Este mensaje es una prueba de diagnóstico.",
          },
          tokens: [testToken],
          android: {
            priority: "high",
            notification: {
              channelId: "safecity_incidents",
            },
          },
        }

        const dryRunResult = await admin.messaging().sendEachForMulticast(testMessage, true)

        diagnostics.steps.push({
          step: "4_fcm_dry_run",
          status: dryRunResult.successCount > 0 ? "ok" : "fail",
          successCount: dryRunResult.successCount,
          failureCount: dryRunResult.failureCount,
          responses: dryRunResult.responses.map((r) => ({
            success: r.success,
            messageId: r.messageId || null,
            errorCode: r.error?.code || null,
            errorMessage: r.error?.message || null,
          })),
        })
      } catch (fcmError) {
        diagnostics.steps.push({
          step: "4_fcm_dry_run",
          status: "error",
          errorCode: fcmError.code || null,
          errorMessage: fcmError.message,
          errorStack: fcmError.stack?.split("\n").slice(0, 3).join("\n"),
        })
      }
    } else {
      diagnostics.steps.push({
        step: "4_fcm_dry_run",
        status: "skipped",
        reason: "No hay dispositivos con token FCM para probar",
      })
    }

    // 5. Verificar índice geoespacial
    try {
      const indexes = await Device.collection.indexes()
      const geoIndex = indexes.find(
        (idx) => idx.key?.lastLocation === "2dsphere"
      )
      diagnostics.steps.push({
        step: "5_geo_index",
        status: geoIndex ? "ok" : "missing",
        indexes: indexes.map((i) => ({ name: i.name, key: i.key })),
      })
    } catch (idxErr) {
      diagnostics.steps.push({
        step: "5_geo_index",
        status: "error",
        errorMessage: idxErr.message,
      })
    }

    diagnostics.overall = diagnostics.steps.every(
      (s) => s.status === "ok" || s.status === "skipped"
    )
      ? "ALL_OK"
      : "ISSUES_FOUND"

    res.json(diagnostics)
  } catch (err) {
    diagnostics.steps.push({
      step: "fatal_error",
      status: "error",
      errorMessage: err.message,
      errorStack: err.stack?.split("\n").slice(0, 5).join("\n"),
    })
    res.status(500).json(diagnostics)
  }
})



router.post("/set-role", requireAuth, requireAdmin, async (req, res) => {
  const { uid, role } = req.body
  if (!uid || !role) return res.status(400).json({ message: "uid y role son requeridos" })
  const normalizedRole = role === "admin" ? "admin" : "user"

  await User.findOneAndUpdate(
    { firebaseUid: uid },
    {
      $set: {
        role: normalizedRole,
        status: "active",
      },
      $setOnInsert: {
        firebaseUid: uid,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const admin = initFirebaseAdmin()
  await admin.auth().setCustomUserClaims(uid, {
    role: normalizedRole,
    admin: normalizedRole === "admin",
  })

  res.json({ ok: true, data: { uid, role: normalizedRole } })
})

export default router