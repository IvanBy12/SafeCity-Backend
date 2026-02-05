// routes/authBootstrap.js
import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import { getDb } from "../db.js"

const router = Router()

router.post("/auth/bootstrap", requireAuth, async (req, res) => {
  const db = getDb()
  const { uid, email } = req.user
  const { displayName, photoUrl } = req.body || {}
  const now = new Date()

  await db.collection("users").updateOne(
    { firebaseUid: uid },
    {
      $set: {
        email,
        displayName: displayName || email || null,
        photoUrl: photoUrl || null,
        lastLoginAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        firebaseUid: uid,
        role: "user",
        status: "active",
        createdAt: now,
      },
    },
    { upsert: true }
  )

  const user = await db.collection("users").findOne(
    { firebaseUid: uid },
    { projection: { _id: 0, firebaseUid: 1, email: 1, displayName: 1, photoUrl: 1, role: 1, status: 1 } }
  )

  return res.json({ ok: true, user })
})

export default router