import admin from "firebase-admin"
import Device from "../models/Device.js"
import NotificationLog from "../models/NotificationLog.js"

const RADIUS_METERS = 500

function maskToken(token) {
  if (typeof token !== "string" || token.length < 12) return token || "missing"
  return `${token.slice(0, 6)}...${token.slice(-6)}`
}

function serializeError(error) {
  return {
    message: error?.message,
    code: error?.code,
    stack: error?.stack,
    errorInfo: error?.errorInfo,
  }
}

/**
 * Notifica a usuarios cercanos cuando se crea un nuevo incidente.
 * Llamado de forma fire-and-forget desde createIncident.
 */
export async function notifyNearbyUsers(incident) {
  if (!incident.location?.coordinates || incident.location.coordinates.length !== 2) {
    return
  }

  const [lng, lat] = incident.location.coordinates

  try {
    const nearbyDevices = await Device.find({
      uid: { $ne: incident.reporterUid },
      enabled: true,
      "lastLocation.type": "Point",
      lastLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: RADIUS_METERS,
        },
      },
    })
      .limit(500)
      .lean()

    const tokens = [
      ...new Set(nearbyDevices.map((d) => d.fcmToken).filter(Boolean)),
    ]

    if (tokens.length === 0) {
      console.log(`📱 FCM: sin dispositivos en ${RADIUS_METERS}m`)
      return
    }

    const categoryIcon = incident.categoryGroup?.toUpperCase() === "SEGURIDAD" ? "🚨" : "🏗️"
    const title = `${categoryIcon} Nuevo reporte cerca de ti`
    const body = (
      incident.description ||
      incident.title ||
      incident.type ||
      "Revisa el mapa"
    ).substring(0, 100)

    let totalSuccess = 0
    let totalFail = 0

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500)

      const message = {
        notification: { title, body },
        data: {
          incidentId: incident._id.toString(),
          categoryGroup: incident.categoryGroup || "",
          type: incident.type || "",
          latitude: String(lat),
          longitude: String(lng),
          address: incident.address || "",
          action: "new_incident",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "safecity_incidents",
            sound: "default",
            priority: "high",
            defaultSound: true,
          },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
        tokens: batch,
      }

      let response
      try {
        response = await admin.messaging().sendEachForMulticast(message)
      } catch (fcmError) {
        console.error("FCM_NEW_FIREBASE_ERROR", JSON.stringify({
          ...serializeError(fcmError),
          batchSize: batch.length,
          tokenPreview: batch.map(maskToken),
        }))
        throw fcmError
      }
      totalSuccess += response.successCount
      totalFail += response.failureCount

      response.responses.forEach((r, idx) => {
        if (!r.success) {
          console.warn("FCM_NEW_TOKEN_FAIL", JSON.stringify({
            token: maskToken(batch[idx]),
            code: r.error?.code,
            message: r.error?.message,
          }))
        }
        if (
          !r.success &&
          (r.error?.code === "messaging/invalid-registration-token" ||
            r.error?.code === "messaging/registration-token-not-registered")
        ) {
          Device.updateMany({ fcmToken: batch[idx] }, { $set: { enabled: false } })
            .catch(() => {})
        }
      })
    }

    console.log(
      `📱 FCM nuevo incidente: ${totalSuccess}✓ ${totalFail}✗ de ${tokens.length} dispositivos en ${RADIUS_METERS}m`
    )
  } catch (error) {
    console.error("❌ Error notificaciones FCM nuevo incidente:", JSON.stringify(serializeError(error)))
  }
}

/**
 * Notifica a usuarios cercanos cuando un incidente pasa a estado VERIFICADO.
 * Solo se ejecuta una vez por incidente gracias al registro en NotificationLog.
 * Llamado de forma fire-and-forget desde voteIncidentTrue cuando la verificación
 * acaba de alcanzar el umbral requerido.
 */
export async function notifyNearbyUsersOnVerification(incident) {
  console.log("FCM_VERIFY_ENTER", JSON.stringify({
    incidentId: incident?._id?.toString?.() ?? String(incident?._id ?? ""),
    validationScore: incident?.validationScore ?? null,
    verified: incident?.verified ?? null,
    status: incident?.status ?? null,
  }))
  if (!incident.location?.coordinates || incident.location.coordinates.length !== 2) {
    console.log("FCM_VERIFY_SKIP_NO_COORDS", JSON.stringify({ incidentId: incident?._id?.toString?.() ?? String(incident?._id ?? "") }))
    console.log(`📱 FCM verificación: incidente ${incident._id} sin coordenadas, omitiendo`)
    return
  }

  const [lng, lat] = incident.location.coordinates

  // Validar coordenadas
  const hasInvalidCoords =
    typeof lng !== "number" || typeof lat !== "number" ||
    isNaN(lng) || isNaN(lat) ||
    lng < -180 || lng > 180 ||
    lat < -90 || lat > 90
  if (hasInvalidCoords) {
    console.warn("FCM_VERIFY_SKIP_INVALID_COORDS", JSON.stringify({
      incidentId: incident._id.toString(),
      latitude: lat,
      longitude: lng,
    }))
  }
  if (
    typeof lng !== "number" || typeof lat !== "number" ||
    isNaN(lng) || isNaN(lat) ||
    lng < -180 || lng > 180 ||
    lat < -90 || lat > 90
  ) {
    console.warn(`📱 FCM verificación: coordenadas inválidas en incidente ${incident._id}`)
    return
  }

  try {
    // Verificar que no se haya enviado ya la notificación de verificación para este incidente
    const yaEnviada = await NotificationLog.findOne({
      incidentId: incident._id,
      status: "verified_sent",
    }).lean()

    if (yaEnviada) {
      console.log(`📱 FCM verificación: notificación ya enviada para incidente ${incident._id}, omitiendo duplicado`)
      return
    }

    // Buscar dispositivos activos dentro del radio (excluye al reportero)
    const nearbyDevices = await Device.find({
      uid: { $ne: incident.reporterUid },
      enabled: true,
      "lastLocation.type": "Point",
      lastLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: RADIUS_METERS,
        },
      },
    })
      .limit(500)
      .lean()

    const rawTokens = nearbyDevices.map((d) => d.fcmToken)
    const validTokens = rawTokens
      .filter((token) => typeof token === "string")
      .map((token) => token.trim())
      .filter(Boolean)

    // Deduplicar tokens (un usuario puede tener varios dispositivos)
    const tokens = [
      ...new Set(validTokens),
    ]

    console.log("FCM_VERIFY_AUDIENCE", JSON.stringify({
      incidentId: incident._id.toString(),
      radiusM: RADIUS_METERS,
      nearbyDevicesCount: nearbyDevices.length,
      rawTokenCount: rawTokens.length,
      validTokenCount: validTokens.length,
      invalidTokenCount: rawTokens.length - validTokens.length,
      uniqueTokenCount: tokens.length,
      duplicateTokenCount: validTokens.length - tokens.length,
    }))

    if (tokens.length === 0) {
      console.log(`📱 FCM verificación: sin dispositivos en ${RADIUS_METERS}m para incidente ${incident._id}`)
      // Registrar igualmente para evitar futuros intentos redundantes
      await NotificationLog.create({
        incidentId: incident._id,
        targetUid: "bulk_verified_none",
        targetDeviceToken: "none",
        radiusM: RADIUS_METERS,
        status: "verified_sent",
      }).catch(() => {})
      return
    }

    // Construir contenido de la notificación
    const typeLabel = incident.type || incident.categoryGroup || "Incidente"
    const shortDesc = (incident.description || incident.title || "").substring(0, 80).trim()
    const title = "🔔 Reporte verificado cerca de ti"
    const body = shortDesc
      ? `Se verificó un reporte de ${typeLabel} a menos de 500 m de tu ubicación. ${shortDesc}`
      : `Se verificó un reporte de ${typeLabel} a menos de 500 m de tu ubicación.`

    const verifiedAt = new Date().toISOString()

    let totalSuccess = 0
    let totalFail = 0

    // Enviar en lotes de hasta 500 tokens (límite de FCM multicast)
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500)
      console.log("FCM_VERIFY_SEND_ATTEMPT", JSON.stringify({
        incidentId: incident._id.toString(),
        batchStart: i,
        batchSize: batch.length,
        tokenPreview: batch.map(maskToken),
      }))

      let response
      const message = {
        notification: { title, body },
        data: {
          // reportId e incidentId incluidos para compatibilidad con distintas versiones del cliente
          reportId: incident._id.toString(),
          incidentId: incident._id.toString(),
          type: incident.type || "",
          categoryGroup: incident.categoryGroup || "",
          title: incident.title || "",
          body: body,
          latitude: String(lat),
          longitude: String(lng),
          address: incident.address || "",
          verifiedAt,
          severity: incident.validationScore != null ? String(incident.validationScore) : "0",
          action: "verified",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "safecity_incidents",
            sound: "default",
            priority: "high",
            defaultSound: true,
          },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
        tokens: batch,
      }

      try {
        response = await admin.messaging().sendEachForMulticast(message)
      } catch (error) {
        console.error("FCM_VERIFY_FIREBASE_ERROR", JSON.stringify({
          incidentId: incident._id.toString(),
          batchStart: i,
          batchSize: batch.length,
          tokenPreview: batch.map(maskToken),
          ...serializeError(error),
        }))
        throw error
      }
      totalSuccess += response.successCount
      totalFail += response.failureCount

      // Limpiar tokens inválidos o expirados
      response.responses.forEach((r, idx) => {
        if (
          !r.success &&
          (r.error?.code === "messaging/invalid-registration-token" ||
            r.error?.code === "messaging/registration-token-not-registered")
        ) {
          Device.updateMany({ fcmToken: batch[idx] }, { $set: { enabled: false } })
            .catch(() => {})
        }
      })
      const failedResponses = response.responses
        .map((r, idx) => ({ response: r, token: batch[idx] }))
        .filter(({ response }) => !response.success)
        .map(({ response, token }) => ({
          token: maskToken(token),
          code: response.error?.code ?? null,
          message: response.error?.message ?? null,
          stack: response.error?.stack ?? null,
          errorInfo: response.error?.errorInfo ?? null,
        }))
      console.log("FCM_VERIFY_SEND_RESULT", JSON.stringify({
        incidentId: incident._id.toString(),
        batchStart: i,
        batchSize: batch.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        failures: failedResponses,
      }))
    }

    // Registrar en log para evitar envíos duplicados si el reporte se re-evalúa
    console.log("FCM_VERIFY_COMPLETE", JSON.stringify({
      incidentId: incident._id.toString(),
      totalSuccess,
      totalFail,
      uniqueTokenCount: tokens.length,
      radiusM: RADIUS_METERS,
    }))
    await NotificationLog.create({
      incidentId: incident._id,
      targetUid: "bulk_verified",
      targetDeviceToken: "batch",
      radiusM: RADIUS_METERS,
      status: "verified_sent",
    }).catch((e) => console.warn("⚠️ No se pudo registrar log de verificación:", e.message))

    console.log(
      `📱 FCM verificación: ${totalSuccess}✓ ${totalFail}✗ de ${tokens.length} dispositivos en ${RADIUS_METERS}m para incidente ${incident._id}`
    )
  } catch (error) {
    console.error("❌ Error notificaciones FCM verificación:", error.message)
  }
}
