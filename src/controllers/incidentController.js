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

// ✅ CREAR INCIDENTE (compatible con Android)
export async function createIncident(req, res) {
  const uid = req.user.uid
  const {
    categoryGroup,
    type,
    title,
    description,
    isAnonymous,
    locality,
    location,      // GeoJSON completo
    latitude,      // 🆕 O lat/lng directo
    longitude,     // 🆕
    address,       // 🆕
    imageUrl,      // 🆕
    photos,        // 🆕
    eventAt,
  } = req.body

  if (!categoryGroup || !type || !title) {
    return res.status(400).json({ 
      success: false,
      message: "categoryGroup, type y title son obligatorios" 
    })
  }

  const eventDate = eventAt ? new Date(eventAt) : new Date()
  const editableUntil = new Date(eventDate.getTime() + 1000 * 60 * 15)

  // 🆕 Normalizar location: acepta GeoJSON, lat/lng o {lat, lng}
  let normalizedLocation = null
  
  if (location?.type === "Point" && Array.isArray(location?.coordinates)) {
    // GeoJSON directo
    normalizedLocation = location
  } else if (latitude != null && longitude != null) {
    // Lat/lng desde Android
    normalizedLocation = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)]
    }
  } else if (location?.lat != null && location?.lng != null) {
    // Objeto {lat, lng}
    normalizedLocation = {
      type: "Point",
      coordinates: [Number(location.lng), Number(location.lat)]
    }
  }

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
    address: address || null,        // 🆕
    imageUrl: imageUrl || null,      // 🆕
    photos: Array.isArray(photos) ? photos : [], // 🆕
    eventAt: eventDate,
    editableUntil,
    confirmationsCount: 0,
    commentsCount: 0,
    verified: false,                 // 🆕
    confirmedBy: [],                 // 🆕
  })

  return res.status(201).json({ 
    success: true, 
    data: doc 
  })
}

// ✅ LISTAR INCIDENTES (con filtros Android)
export async function listIncidents(req, res) {
  const { page, limit, skip } = parsePaging(req.query)
  const { locality, categoryGroup, type, verified } = req.query

  const filter = {}
  if (locality) filter.locality = locality
  if (categoryGroup) filter.categoryGroup = categoryGroup
  if (type) filter.type = type
  if (verified !== undefined) filter.verified = verified === 'true'

  const [items, total] = await Promise.all([
    Incident.find(filter)
      .sort({ eventAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Incident.countDocuments(filter),
  ])

  return res.json({ 
    success: true, 
    page, 
    limit, 
    total, 
    count: items.length,
    data: items 
  })
}

// ✅ INCIDENTES CERCANOS (geoespacial)
export async function listNearbyIncidents(req, res) {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radiusKm = Number(req.query.radius || 5)
  const radiusM = Number(req.query.radiusM || radiusKm * 1000)

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ 
      success: false,
      message: "lat y lng son obligatorios" 
    })
  }

  // 🆕 Búsqueda geoespacial con $near
  const items = await Incident.find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        $maxDistance: radiusM
      }
    }
  })
    .sort({ eventAt: -1 })
    .limit(100)
    .lean()

  return res.json({ 
    success: true, 
    total: items.length, 
    count: items.length,
    data: items 
  })
}

// ✅ DETALLE DE INCIDENTE
export async function getIncidentDetail(req, res) {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      success: false,
      message: "ID inválido" 
    })
  }

  const incidentId = new mongoose.Types.ObjectId(id)

  const [incident, comments, votes] = await Promise.all([
    Incident.findById(incidentId).lean(),
    IncidentComment.find({ incidentId }).sort({ createdAt: -1 }).lean(),
    IncidentValidation.find({ incidentId }).lean(),
  ])

  if (!incident) {
    return res.status(404).json({ 
      success: false,
      message: "Incidente no encontrado" 
    })
  }

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
    }
  })
}

// ✅ AGREGAR COMENTARIO
export async function addComment(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { text, isAnonymous } = req.body

  if (!text?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: "text es obligatorio" 
    })
  }

  const incidentId = new mongoose.Types.ObjectId(id)

  await IncidentComment.create({
    incidentId,
    authorUid: uid,
    isAnonymous: !!isAnonymous,
    text: text.trim(),
  })

  await Incident.updateOne({ _id: incidentId }, { $inc: { commentsCount: 1 } })

  return res.json({ ok: true })
}

export async function voteIncident(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { vote, comment } = req.body

  if (typeof vote !== "boolean") return res.status(400).json({ message: "vote debe ser boolean" })

  const incidentId = new mongoose.Types.ObjectId(id)

  const result = await IncidentValidation.updateOne(
    { incidentId, uid },
    {
      $set: { vote, comment: comment || "" },
      $setOnInsert: { incidentId, uid, vote, comment: comment || "" },
    },
    { upsert: true }
  )

  if (result.upsertedCount === 1 && vote === true) {
    await Incident.updateOne({ _id: incidentId }, { $inc: { confirmationsCount: 1 } })
  }

  return res.json({ ok: true })
}
