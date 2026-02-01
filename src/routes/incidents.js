import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import { getDb } from "../db.js"

const router = Router()

// POST /incidents
router.post("/", requireAuth, async (req, res) => {
  try {
    const db = getDb()
    const incident = req.body

    // opcional: amarrar el incidente al uid
    incident.userId = req.user.uid
    incident.createdAt = new Date()

    const result = await db.collection("incidents").insertOne(incident)

    res.status(201).json({ ok: true, id: result.insertedId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: "Error creando incidente", error: e.message })
  }
})

export default router
