import admin from "firebase-admin"
import Device from "../models/Device.js"

const RADIUS_METERS = 500 // radio de proximidad configurable

/**
 * Envía notificaciones FCM a los usuarios que se encuentren
 * dentro de RADIUS_METERS del incidente reportado.
 *
 * Se llama de forma asíncrona (fire-and-forget) desde createIncident
 * para no bloquear la respuesta al cliente.
 */
export async function notifyNearbyUsers(incident) {
  // Si el incidente no tiene ubicación, nada que hacer
  if (
    !incident.location?.coordinates ||
    incident.location.coordinates.length !== 2
  ) {
    return
  }

  const [lng, lat] = incident.location.coordinates

  try {
    // ================================================
    // 1) Buscar dispositivos con ubicación dentro del radio
    //    Excluir al propio reportero
    // ================================================
    const nearbyDevices = await Device.find({
      uid: { $ne: incident.reporterUid },
      enabled: true,
      // Solo documentos que YA tienen lastLocation con coordenadas
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

    // ================================================
    // 2) Construir el mensaje
    // ================================================
    const categoryIcon =
      incident.categoryGroup?.toUpperCase() === "SEGURIDAD" ? "🚨" : "🏗️"
    const title = `${categoryIcon} Nuevo reporte cerca de ti`
    const body = (
      incident.description ||
      incident.title ||
      incident.type ||
      "Revisa el mapa"
    ).substring(0, 100)

    // ================================================
    // 3) Enviar en lotes de 500 (límite FCM)
    // ================================================
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

      const response = await admin.messaging().sendEachForMulticast(message)
      totalSuccess += response.successCount
      totalFail += response.failureCount

      // Limpiar tokens inválidos
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
    }

    console.log(
      `📱 FCM proximidad: ${totalSuccess}✓ ${totalFail}✗ de ${tokens.length} dispositivos en ${RADIUS_METERS}m`
    )
  } catch (error) {
    // No-blocking: no interrumpe la creación del incidente
    console.error("❌ Error notificaciones FCM:", error.message)
  }
}