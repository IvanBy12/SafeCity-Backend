import mongoose from "mongoose"
import Incident from "../models/incident.js"
import IncidentComment from "../models/IncidentComment.js"
import IncidentValidation from "../models/IncidentValidation.js"

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
  const editableUntil = new Date(eventDate.getTime() + 1000 * 60 * 15) // 15 min (ajústalo)

  const doc = await Incident.create({
    categoryGroup,
    type,
    title,
    description: description || "",
    status: "pending",
    reporterUid: uid,
    isAnonymous: !!isAnonymous,
    locality: locality || null,
    location: location || null,
    eventAt: eventDate,
    editableUntil,
    confirmationsCount: 0,
    commentsCount: 0,
    photos: Array.isArray(photos) ? photos : [],
  })

  return res.status(201).json({ ok: true, incident: doc })
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
