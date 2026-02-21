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

function normalizePhotosInput(photos, imageUrl) {
  let raw = [];

  // 1) Si viene photos como array, úsalo
  if (Array.isArray(photos)) raw = photos;
  // 2) Si viene photos como string, lo convierto a array
  else if (typeof photos === "string" && photos.trim()) raw = [photos.trim()];
  // 3) Fallback: si no viene photos, uso imageUrl
  else if (typeof imageUrl === "string" && imageUrl.trim()) raw = [imageUrl.trim()];

  // Normalizar a [{ url: "https://..." }]
  const normalized = raw
    .map((p) => {
      // Si ya viene como string -> {url}
      if (typeof p === "string") return { url: p.trim() };

      // Si viene como objeto -> toma url/downloadURL/uri
      if (p && typeof p === "object") {
        const url = p.url || p.downloadURL || p.uri;
        return url ? { url: String(url).trim() } : null;
      }

      return null;
    })
    // deja solo URLs http/https válidas
    .filter((p) => p && typeof p.url === "string" && /^https?:\/\/.+/.test(p.url));

  return normalized;
}

export async function createIncident(req, res) {
  try {
    const uid = req.user.uid;
    const {
      categoryGroup, type, title, description, isAnonymous,
      locality, location, latitude, longitude, address,
      imageUrl, photos, eventAt,
    } = req.body;

    if (!categoryGroup || !type || !title) {
      return res.status(400).json({
        success: false,
        message: "categoryGroup, type y title son obligatorios",
      });
    }

    const eventDate = eventAt ? new Date(eventAt) : new Date();
    const editableUntil = new Date(eventDate.getTime() + 1000 * 60 * 15);

    let normalizedLocation = null;
    if (location?.type === "Point" && Array.isArray(location?.coordinates)) {
      normalizedLocation = location;
    } else if (latitude != null && longitude != null) {
      normalizedLocation = {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      };
    } else if (location?.lat != null && location?.lng != null) {
      normalizedLocation = {
        type: "Point",
        coordinates: [Number(location.lng), Number(location.lat)],
      };
    }

    // ✅ IMPORTANTE: ahora photos será [{url: "..."}] para cumplir Mongo validator
    const normalizedPhotos = normalizePhotosInput(photos, imageUrl);

    // ✅ Compatibilidad: imageUrl como string (si lo usas en front)
    const normalizedImageUrl =
      (typeof imageUrl === "string" && imageUrl.trim())
        ? imageUrl.trim()
        : (normalizedPhotos[0]?.url ?? null);

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
      address: address || null,

      // ✅ ambos guardados
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
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("CREATE INCIDENT ERROR:", err?.message);
    console.error("DETAILS:", JSON.stringify(err?.errInfo ?? err, null, 2));
    return res.status(400).json({
      success: false,
      message: err?.message,
      errInfo: err?.errInfo ?? null,
    });
  }
}


// ========================================
// VOTAR COMO VERDADERO (confirmar)
// ========================================
export async function voteIncidentTrue(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid

    const incident = await Incident.findById(id)
    if (!incident) {
      return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    }

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
      }
    })
  } catch (error) {
    console.error("Error votando verdadero:", error.message)
    res.status(400).json({ success: false, error: error.message })
  }
}

// ========================================
// VOTAR COMO FALSO (reportar)
// ========================================
export async function voteIncidentFalse(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid

    const incident = await Incident.findById(id)
    if (!incident) {
      return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    }

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
      }
    })
  } catch (error) {
    console.error("Error votando falso:", error.message)
    res.status(400).json({ success: false, error: error.message })
  }
}

// ========================================
// QUITAR VOTO
// ========================================
export async function removeVote(req, res) {
  try {
    const { id } = req.params
    const userId = req.user.uid

    const incident = await Incident.findById(id)
    if (!incident) {
      return res.status(404).json({ success: false, error: "Incidente no encontrado" })
    }

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
      }
    })
  } catch (error) {
    console.error("Error removiendo voto:", error.message)
    res.status(400).json({ success: false, error: error.message })
  }
}

// ========================================
// COMPATIBILIDAD: confirmIncident → voteTrue
// ========================================
export async function confirmIncident(req, res) {
  return voteIncidentTrue(req, res)
}

// ========================================
// COMPATIBILIDAD: unconfirmIncident → removeVote
// ========================================
export async function unconfirmIncident(req, res) {
  return removeVote(req, res)
}

// ========================================
// LISTAR INCIDENTES (excluir flaggedFalse por defecto)
// ========================================
export async function listIncidents(req, res) {
  const { page, limit, skip } = parsePaging(req.query)
  const { locality, categoryGroup, type, verified, showFlagged } = req.query

  const filter = {}
  if (locality) filter.locality = locality
  if (categoryGroup) filter.categoryGroup = categoryGroup
  if (type) filter.type = type
  if (verified !== undefined) filter.verified = verified === "true"

  // Por defecto, NO mostrar reportes marcados como falsos
  if (showFlagged !== "true") {
    filter.flaggedFalse = { $ne: true }
  }

  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ eventAt: -1 }).skip(skip).limit(limit).lean(),
    Incident.countDocuments(filter),
  ])

  return res.json({ success: true, page, limit, total, count: items.length, data: items })
}

// ========================================
// INCIDENTES CERCANOS
// ========================================
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
  }).sort({ eventAt: -1 }).limit(100).lean()

  return res.json({ success: true, total: items.length, count: items.length, data: items })
}

// ========================================
// DETALLE DE INCIDENTE
// ========================================
export async function getIncidentDetail(req, res) {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "ID inválido" })
  }

  const incidentId = new mongoose.Types.ObjectId(id)

  const [incident, comments, votes] = await Promise.all([
    Incident.findById(incidentId).lean(),
    IncidentComment.find({ incidentId }).sort({ createdAt: -1 }).lean(),
    IncidentValidation.find({ incidentId }).lean(),
  ])

  if (!incident) {
    return res.status(404).json({ success: false, message: "Incidente no encontrado" })
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
    },
  })
}

// ========================================
// AGREGAR COMENTARIO
// ========================================
export async function addComment(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { text, isAnonymous } = req.body

  if (!text?.trim()) {
    return res.status(400).json({ success: false, message: "text es obligatorio" })
  }

  const incidentId = new mongoose.Types.ObjectId(id)

  await IncidentComment.create({
    incidentId,
    authorUid: uid,
    isAnonymous: !!isAnonymous,
    text: text.trim(),
  })

  await Incident.updateOne({ _id: incidentId }, { $inc: { commentsCount: 1 } })

  return res.json({ success: true })
}

// ========================================
// VOTAR (legacy - mantener compatibilidad)
// ========================================
export async function voteIncident(req, res) {
  const uid = req.user.uid
  const { id } = req.params
  const { vote, comment } = req.body

  if (typeof vote !== "boolean") {
    return res.status(400).json({ success: false, message: "vote debe ser boolean" })
  }

  const incidentId = new mongoose.Types.ObjectId(id)

  await IncidentValidation.updateOne(
    { incidentId, uid },
    {
      $set: { vote, comment: comment || "" },
      $setOnInsert: { incidentId, uid, vote, comment: comment || "" },
    },
    { upsert: true }
  )

  return res.json({ success: true })
}

// ========================================
// ELIMINAR INCIDENTE
// ========================================
export async function deleteIncident(req, res) {
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
    return res.status(403).json({ success: false, message: "Solo puedes eliminar tus propios reportes" })
  }

  await incident.deleteOne()
  return res.json({ success: true, message: "Incidente eliminado exitosamente" })
}

// ========================================
// ESTADÍSTICAS
// ========================================
export async function getStats(req, res) {
  try {
    const totalIncidents = await Incident.countDocuments({ flaggedFalse: { $ne: true } })
    const verifiedIncidents = await Incident.countDocuments({ verified: true })
    const flaggedIncidents = await Incident.countDocuments({ flaggedFalse: true })
    const byType = await Incident.aggregate([
      { $match: { flaggedFalse: { $ne: true } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ])

    const stats = {
      total: totalIncidents,
      verified: verifiedIncidents,
      flagged: flaggedIncidents,
      byType: Object.fromEntries(byType.map((t) => [t._id, t.count])),
    }

    return res.json({ success: true, data: stats })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}