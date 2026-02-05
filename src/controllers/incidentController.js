import mongoose from "mongoose"
import Incident from "../models/incident.js"
import IncidentComment from "../models/IncidentComment.js"
import IncidentValidation from "../models/IncidentValidation.js"

function parsePaging(query) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  return { page, limit, skip: (page - 1) * limit }
}

function safeReporter(uid, isAnonymous) {
  return isAnonymous ? null : uid
}

export async function createIncident(req, res) {
  const uid = req.user.uid
  const {
    categoryGroup,
    type,
    title,
    description,
    isAnonymous,
    locality,
    location,
    eventAt,
    photos,
  } = req.body

  if (!categoryGroup || !type || !title || !eventAt) {
    return res.status(400).json({ message: "categoryGroup, type, title y eventAt son obligatorios" })
  }

  const eventDate = new Date(eventAt)
  const editableUntil = new Date(eventDate.getTime() + 1000 * 60 * 15)

  const normalizedLocation =
    location?.type === "Point" && Array.isArray(location?.coordinates)
      ? location
      : location?.lat != null && location?.lng != null
        ? { type: "Point", coordinates: [Number(location.lng), Number(location.lat)] }
        : null


  const doc = await Incident.create({
    categoryGroup,
    type,
    title,
    description: description || "",
    status: "pending",
    reporterUid: uid,
    isAnonymous: !!isAnonymous,
    locality: locality || null,
    location: normalizedLocation,
    eventAt: eventDate,
    editableUntil,
    confirmationsCount: 0,
    commentsCount: 0,
    photos: Array.isArray(photos) ? photos : [],
  })

  return res.status(201).json({ ok: true, incident: doc })
}

export async function listIncidents(req, res) {
  const { page, limit, skip } = parsePaging(req.query)
  const { locality, categoryGroup } = req.query

  const filter = {}
  if (locality) filter.locality = locality
  if (categoryGroup) filter.categoryGroup = categoryGroup

  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ eventAt: -1 }).skip(skip).limit(limit).lean(),
    Incident.countDocuments(filter),
  ])

  return res.json({ ok: true, page, limit, total, items })
}

export async function getIncidentDetail(req, res) {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "id inválido" })

  const incidentId = new mongoose.Types.ObjectId(id)

  const [incident, comments, votes] = await Promise.all([
    Incident.findById(incidentId).lean(),
    IncidentComment.find({ incidentId }).sort({ createdAt: -1 }).lean(),
    IncidentValidation.find({ incidentId }).lean(),
  ])

  if (!incident) return res.status(404).json({ message: "Incidente no encontrado" })

  const maskedComments = comments.map((c) => ({
    ...c,
    authorUid: safeReporter(c.authorUid, c.isAnonymous),
  }))

  const maskedVotes = votes

  return res.json({
    ok: true,
    incident: { ...incident, reporterUid: safeReporter(incident.reporterUid, incident.isAnonymous) },
    comments: maskedComments,
    votes: maskedVotes,
  })
}

export async function listNearbyIncidents(req, res) {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radiusM = Number(req.query.radiusM || 1000)

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: "lat y lng son obligatorios" })
  }

  const items = await Incident.find({
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

  return res.json({ ok: true, total: items.length, items })
}


export async function addComment(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { text, isAnonymous } = req.body

  if (!text?.trim()) return res.status(400).json({ message: "text es obligatorio" })

  const incidentId = new mongoose.Types.ObjectId(id)

  await IncidentComment.create({
    incidentId,
    authorUid: uid,
    isAnonymous: !!isAnonymous,
    text: text.trim(),
  })

  // Incrementa contador en Incident
  await Incident.updateOne({ _id: incidentId }, { $inc: { commentsCount: 1 } })

  return res.json({ ok: true })
}

export async function voteIncident(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { vote, comment } = req.body

  if (typeof vote !== "boolean") return res.status(400).json({ message: "vote debe ser boolean" })

  const incidentId = new mongoose.Types.ObjectId(id)

  // Upsert voto único por (incidentId + uid)
  const result = await IncidentValidation.updateOne(
    { incidentId, uid },
    {
      $set: { vote, comment: comment || "" },
      $setOnInsert: { incidentId, uid, vote, comment: comment || "" },
    },
    { upsert: true }
  )

  // Si fue insert nuevo y vote=true => incrementa confirmationsCount
  // (si quieres recalcular exacto, lo hacemos con aggregate; esto es rápido)
  if (result.upsertedCount === 1 && vote === true) {
    await Incident.updateOne({ _id: incidentId }, { $inc: { confirmationsCount: 1 } })
  }

  return res.json({ ok: true })
}
