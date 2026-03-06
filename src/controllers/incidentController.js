import mongoose from "mongoose"
import Incident from "../models/incident.js"
import IncidentComment from "../models/IncidentComment.js"
import IncidentValidation from "../models/IncidentValidation.js"
import { notifyNearbyUsers } from "../services/notificationService.js"

// ==========================================
// CONFIGURACIÓN DE ESTADOS
// ==========================================

// Días tras los cuales un incidente pasa a "closed" independientemente de su estado
const CLOSE_AFTER_DAYS = Number(process.env.INCIDENT_CLOSE_DAYS ?? 30)

// Franjas horarias para estadísticas agregadas (Req 3)
const TIME_BANDS = [
  { label: "Madrugada", from: 0, to: 6 },
  { label: "Mañana", from: 6, to: 12 },
  { label: "Tarde", from: 12, to: 18 },
  { label: "Noche", from: 18, to: 24 },
]

// ==========================================
// HELPERS INTERNOS
// ==========================================

function parsePaging(query) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  return { page, limit, skip: (page - 1) * limit }
}

function safeReporter(uid, isAnonymous) {
  return isAnonymous ? null : uid
}

function normalizePhotosInput(photos, imageUrl) {
  let raw = []
  if (Array.isArray(photos)) raw = photos
  else if (typeof photos === "string" && photos.trim()) raw = [photos.trim()]
  else if (typeof imageUrl === "string" && imageUrl.trim()) raw = [imageUrl.trim()]

  return raw
    .map((p) => {
      if (typeof p === "string") return { url: p.trim() }
      if (p && typeof p === "object") {
        const url = p.url || p.downloadURL || p.uri
        return url ? { url: String(url).trim() } : null
      }
      return null
    })
    .filter((p) => p && typeof p.url === "string" && /^https?:\/\/.+/.test(p.url))
}

/**
 * Marca como "closed" todos los incidentes que superaron CLOSE_AFTER_DAYS.
 * Se llama internamente antes de ciertos listados y también desde el endpoint administrativo.
 * Retorna la cantidad de documentos cerrados.
 */
async function closeExpiredIncidents() {
  const cutoff = new Date(Date.now() - CLOSE_AFTER_DAYS * 24 * 60 * 60 * 1000)
  const result = await Incident.updateMany(
    {
      status: { $in: ["pending", "verified"] },
      createdAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closedReason: "expired",
      },
    }
  )
  return result.modifiedCount
}

// ==========================================
// CREAR INCIDENTE + NOTIFICAR CERCANOS
// ==========================================
export async function createIncident(req, res) {
  try {
    const uid = req.user.uid
    const {
      categoryGroup, type, title, description, isAnonymous,
      locality, location, latitude, longitude, address,
      imageUrl, photos, eventAt,
    } = req.body

    if (!categoryGroup || !type || !title) {
      return res.status(400).json({
        success: false,
        message: "categoryGroup, type y title son obligatorios",
      })
    }

    const eventDate = eventAt ? new Date(eventAt) : new Date()
    // El reporter tiene 15 min para editar/eliminar su reporte
    const editableUntil = new Date(eventDate.getTime() + 1000 * 60 * 15)

    let normalizedLocation = null
    if (location?.type === "Point" && Array.isArray(location?.coordinates)) {
      normalizedLocation = location
    } else if (latitude != null && longitude != null) {
      normalizedLocation = {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      }
    } else if (location?.lat != null && location?.lng != null) {
      normalizedLocation = {
        type: "Point",
        coordinates: [Number(location.lng), Number(location.lat)],
      }
    }

    const normalizedPhotos = normalizePhotosInput(photos, imageUrl)
    const normalizedImageUrl =
      typeof imageUrl === "string" && imageUrl.trim()
        ? imageUrl.trim()
        : (normalizedPhotos[0]?.url ?? null)

    const doc = await Incident.create({
      categoryGroup,
      type,
      title,
      description: description || "",
      status: "pending",
      reporterUid: uid,
      // ─── REQ 1: respetar la preferencia de anonimato enviada desde la app ───
      isAnonymous: !!isAnonymous,
      locality: locality || null,
      location: normalizedLocation,
      address: address || null,
      imageUrl: normalizedImageUrl,
      photos: normalizedPhotos,
      eventAt: eventDate,
      editableUntil,
      votedTrue: [],
      votedFalse: [],
      validationScore: 0,
      verified: false,
      flaggedFalse: false,
      confirmationsCount: 0,
      confirmedBy: [],
      commentsCount: 0,
    })

    notifyNearbyUsers(doc).catch((e) =>
      console.error("FCM fire-and-forget error:", e.message)
    )

    return res.status(201).json({ success: true, data: doc })
  } catch (err) {
    console.error("CREATE INCIDENT ERROR:", err?.message)
    return res.status(400).json({
      success: false,
      message: err?.message,
      errInfo: err?.errInfo ?? null,
    })
  }
}

// ==========================================
// EDITAR INCIDENTE (dentro del plazo)
// ─ REQ 2: edición dentro de ventana de tiempo
// ==========================================
export async function editIncident(req, res) {
  try {
    const uid = req.user.uid
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "ID inválido" })
    }

    const incident = await Incident.findById(id)
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incidente no encontrado" })
    }
    if (incident.reporterUid !== uid) {
      return res.status(403).json({ success: false, message: "Solo puedes editar tus propios reportes" })
    }
    if (incident.status === "closed") {
      return res.status(422).json({ success: false, message: "No puedes editar un reporte cerrado" })
    }
    if (new Date() > incident.editableUntil) {
      const remaining = Math.ceil(
        (incident.editableUntil - Date.now()) / 60000
      )
      return res.status(422).json({
        success: false,
        message: `El plazo de edición venció. Los reportes solo se pueden editar dentro de los 15 minutos posteriores a su creación.`,
        editableUntil: incident.editableUntil,
      })
    }

    const { description, photos, imageUrl } = req.body
    const updates = {}

    if (typeof description === "string") {
      updates.description = description.trim()
    }
    if (photos !== undefined || imageUrl !== undefined) {
      const newPhotos = normalizePhotosInput(photos, imageUrl)
      updates.photos = newPhotos
      updates.imageUrl = newPhotos[0]?.url ?? incident.imageUrl
    }

    const updated = await Incident.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    )
    return res.json({ success: true, data: updated })
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message })
  }
}

// ==========================================
// MIS REPORTES (autenticado)
// ─ REQ 2: historial + seguimiento con todos los estados
// ==========================================
export async function getMyIncidents(req, res) {
  try {
    const uid = req.user.uid
    const { page, limit, skip } = parsePaging(req.query)
    const { status } = req.query

    // Cerrar expirados del usuario antes de retornar (lazy evaluation)
    await closeExpiredIncidents()

    const filter = { reporterUid: uid }
    if (status) filter.status = status

    const [items, total] = await Promise.all([
      Incident.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Incident.countDocuments(filter),
    ])

    // Calcular tiempo restante de edición para cada reporte
    const now = new Date()
    const enriched = items.map((inc) => ({
      ...inc,
      // No ocultamos reporterUid al dueño del reporte
      isEditable: inc.status !== "closed" && now < new Date(inc.editableUntil),
      editSecondsLeft: Math.max(
        0,
        Math.floor((new Date(inc.editableUntil) - now) / 1000)
      ),
      // Días hasta cierre automático
      daysUntilClose:
        inc.status !== "closed"
          ? Math.max(
              0,
              Math.ceil(
                (new Date(inc.createdAt).getTime() +
                  CLOSE_AFTER_DAYS * 86400000 -
                  now.getTime()) /
                  86400000
              )
            )
          : 0,
    }))

    return res.json({
      success: true,
      page,
      limit,
      total,
      count: enriched.length,
      closeDays: CLOSE_AFTER_DAYS,
      data: enriched,
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message })
  }
}

// ==========================================
// CIERRE MANUAL DE EXPIRADOS (endpoint admin / cron)
// ─ REQ 2 + REQ 3: mantener datos limpios para estadísticas
// ==========================================
export async function triggerCloseExpired(req, res) {
  try {
    const closed = await closeExpiredIncidents()
    return res.json({ success: true, closed })
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message })
  }
}

// ==========================================
// ESTADÍSTICAS AGREGADAS (sin datos personales)
// ─ REQ 3: para compartir con entidades distritales
// ==========================================
export async function getAggregateStats(req, res) {
  try {
    const { year, month } = req.query

    // Filtro de rango: si viene year+month filtra ese mes, si no usa últimos 12 meses
    let dateFilter = {}
    if (year && month) {
      const from = new Date(Number(year), Number(month) - 1, 1)
      const to = new Date(Number(year), Number(month), 1)
      dateFilter = { createdAt: { $gte: from, $lt: to } }
    } else {
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
      dateFilter = { createdAt: { $gte: twelveMonthsAgo } }
    }

    // Pipeline base (nunca expone reporterUid ni datos personales)
    const baseMatch = { flaggedFalse: { $ne: true }, ...dateFilter }

    const [
      byTypeAndStatus,
      byTimeBand,
      byLocality,
      byMonth,
      summary,
    ] = await Promise.all([
      // ─── Por tipo de incidente y estado ───
      Incident.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { categoryGroup: "$categoryGroup", type: "$type", status: "$status" },
            count: { $sum: 1 },
            avgScore: { $avg: "$validationScore" },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // ─── Por franja horaria (usa eventAt) ───
      Incident.aggregate([
        { $match: { ...baseMatch, eventAt: { $exists: true, $ne: null } } },
        {
          $addFields: {
            hour: { $hour: "$eventAt" },
          },
        },
        {
          $addFields: {
            timeBand: {
              $switch: {
                branches: [
                  { case: { $lt: ["$hour", 6] }, then: "Madrugada (0-6)" },
                  { case: { $lt: ["$hour", 12] }, then: "Mañana (6-12)" },
                  { case: { $lt: ["$hour", 18] }, then: "Tarde (12-18)" },
                ],
                default: "Noche (18-24)",
              },
            },
          },
        },
        {
          $group: {
            _id: { timeBand: "$timeBand", categoryGroup: "$categoryGroup" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.timeBand": 1, count: -1 } },
      ]),

      // ─── Por localidad / zona ───
      Incident.aggregate([
        { $match: { ...baseMatch, locality: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: { locality: "$locality", categoryGroup: "$categoryGroup" },
            count: { $sum: 1 },
            verified: {
              $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),

      // ─── Evolución mensual (últimos 12 meses) ───
      Incident.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              categoryGroup: "$categoryGroup",
            },
            count: { $sum: 1 },
            verified: {
              $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] },
            },
            closed: {
              $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] },
            },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // ─── Resumen general ───
      Incident.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            verified: { $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
            avgScore: { $avg: "$validationScore" },
          },
        },
      ]),
    ])

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      period: year && month
        ? { type: "month", year: Number(year), month: Number(month) }
        : { type: "last12months" },
      // ─── Ningún campo de estos contiene datos personales ───
      data: {
        summary: summary[0] ?? { total: 0, pending: 0, verified: 0, closed: 0, avgScore: 0 },
        byTypeAndStatus,
        byTimeBand,
        byLocality,
        byMonth,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message })
  }
}

// ==========================================
// VOTAR VERDADERO
// ==========================================
export async function voteIncidentTrue(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid
    const incident = await Incident.findById(id)
    if (!incident) return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    await incident.voteTrue(userId)
    res.json({
      success: true,
      message: "Voto registrado: verdadero",
      data: {
        validationScore: incident.validationScore,
        votedTrue: incident.votedTrue.length,
        votedFalse: incident.votedFalse.length,
        verified: incident.verified,
        flaggedFalse: incident.flaggedFalse,
        status: incident.status,
      },
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// ==========================================
// VOTAR FALSO
// ==========================================
export async function voteIncidentFalse(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid
    const incident = await Incident.findById(id)
    if (!incident) return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    await incident.voteFalse(userId)
    res.json({
      success: true,
      message: "Voto registrado: falso",
      data: {
        validationScore: incident.validationScore,
        votedTrue: incident.votedTrue.length,
        votedFalse: incident.votedFalse.length,
        verified: incident.verified,
        flaggedFalse: incident.flaggedFalse,
        status: incident.status,
      },
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

// ==========================================
// QUITAR VOTO
// ==========================================
export async function removeVote(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid
    const incident = await Incident.findById(id)
    if (!incident) return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    await incident.removeVote(userId)
    res.json({
      success: true,
      message: "Voto removido",
      data: {
        validationScore: incident.validationScore,
        votedTrue: incident.votedTrue.length,
        votedFalse: incident.votedFalse.length,
        verified: incident.verified,
        flaggedFalse: incident.flaggedFalse,
        status: incident.status,
      },
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
}

export async function confirmIncident(req, res) { return voteIncidentTrue(req, res) }
export async function unconfirmIncident(req, res) { return removeVote(req, res) }

// ==========================================
// LISTAR INCIDENTES (público)
// ==========================================
export async function listIncidents(req, res) {
  const { page, limit, skip } = parsePaging(req.query)
  const { locality, categoryGroup, type, verified, showFlagged } = req.query
  const filter = {}
  if (locality) filter.locality = locality
  if (categoryGroup) filter.categoryGroup = categoryGroup
  if (type) filter.type = type
  if (verified !== undefined) filter.verified = verified === "true"
  if (showFlagged !== "true") filter.flaggedFalse = { $ne: true }
  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ eventAt: -1 }).skip(skip).limit(limit).lean(),
    Incident.countDocuments(filter),
  ])
  return res.json({ success: true, page, limit, total, count: items.length, data: items })
}

// ==========================================
// INCIDENTES CERCANOS
// ==========================================
export async function listNearbyIncidents(req, res) {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radiusKm = Number(req.query.radius || 5)
  const radiusM = Number(req.query.radiusM || radiusKm * 1000)
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ success: false, message: "lat y lng son obligatorios" })
  }
  const items = await Incident.find({
    flaggedFalse: { $ne: true },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusM,
      },
    },
  })
    .sort({ eventAt: -1 })
    .limit(100)
    .lean()
  return res.json({ success: true, total: items.length, count: items.length, data: items })
}

// ==========================================
// DETALLE DE INCIDENTE
// ==========================================
export async function getIncidentDetail(req, res) {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "ID inválido" })
  }
  const incidentId = new mongoose.Types.ObjectId(id)
  const [incident, comments, votes] = await Promise.all([
    Incident.findById(incidentId).lean(),
    IncidentComment.find({ incidentId }).sort({ createdAt: 1 }).lean(),
    IncidentValidation.find({ incidentId }).lean(),
  ])
  if (!incident) return res.status(404).json({ success: false, message: "Incidente no encontrado" })
  const maskedComments = comments.map((c) => ({
    ...c,
    authorUid: safeReporter(c.authorUid, c.isAnonymous),
  }))
  return res.json({
    success: true,
    data: {
      ...incident,
      reporterUid: safeReporter(incident.reporterUid, incident.isAnonymous),
      comments: maskedComments,
      votes,
    },
  })
}

// ==========================================
// AGREGAR COMENTARIO
// ==========================================
export async function addComment(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { text, isAnonymous } = req.body
  if (!text?.trim()) return res.status(400).json({ success: false, message: "text es obligatorio" })
  const incidentId = new mongoose.Types.ObjectId(id)
  await IncidentComment.create({ incidentId, authorUid: uid, isAnonymous: !!isAnonymous, text: text.trim() })
  await Incident.updateOne({ _id: incidentId }, { $inc: { commentsCount: 1 } })
  return res.json({ success: true })
}

// ==========================================
// VOTAR (legacy endpoint)
// ==========================================
export async function voteIncident(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { vote, comment } = req.body
  if (typeof vote !== "boolean") return res.status(400).json({ success: false, message: "vote debe ser boolean" })
  const incidentId = new mongoose.Types.ObjectId(id)
  await IncidentValidation.updateOne(
    { incidentId, uid },
    { $set: { vote, comment: comment || "" }, $setOnInsert: { incidentId, uid, vote, comment: comment || "" } },
    { upsert: true }
  )
  return res.json({ success: true })
}

// ==========================================
// ELIMINAR INCIDENTE
// ==========================================
export async function deleteIncident(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "ID inválido" })
  const incident = await Incident.findById(id)
  if (!incident) return res.status(404).json({ success: false, message: "Incidente no encontrado" })
  if (incident.reporterUid !== uid) return res.status(403).json({ success: false, message: "Solo puedes eliminar tus propios reportes" })
  await incident.deleteOne()
  return res.json({ success: true, message: "Incidente eliminado exitosamente" })
}

// ==========================================
// ESTADÍSTICAS BÁSICAS (dashboard interno)
// ==========================================
export async function getStats(req, res) {
  try {
    const totalIncidents = await Incident.countDocuments({ flaggedFalse: { $ne: true } })
    const verifiedIncidents = await Incident.countDocuments({ verified: true })
    const flaggedIncidents = await Incident.countDocuments({ flaggedFalse: true })
    const byType = await Incident.aggregate([
      { $match: { flaggedFalse: { $ne: true } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ])
    return res.json({
      success: true,
      data: {
        total: totalIncidents,
        verified: verifiedIncidents,
        flagged: flaggedIncidents,
        byType: Object.fromEntries(byType.map((t) => [t._id, t.count])),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}