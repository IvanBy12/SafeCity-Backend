import express from "express"
import { getDb } from "../db.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

router.get("/me", requireAuth, async (req, res) => {
  const db = await getDb()

  const firebaseUid = req.user.uid
  const email = req.user.email || null

  const now = new Date()

  // 1) upsert user
  await db.collection("users").updateOne(
    { firebaseUid },
    {
      $setOnInsert: { createdAt: now, status: "active", role: "citizen" },
      $set: { email, lastLoginAt: now, updatedAt: now },
    },
    { upsert: true }
  )

  const userDoc = await db.collection("users").findOne({ firebaseUid })

  res.json({
    firebaseUid,
    role: userDoc.role,
    status: userDoc.status,
    email: userDoc.email,
  })
})

export default router
