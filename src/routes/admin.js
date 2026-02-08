import express from "express"
import { initFirebaseAdmin, requireAuth, requireAdmin } from "../middleware/auth.js"
import User from "../models/User.js"

const router = express.Router()



router.post("/set-role", requireAuth, requireAdmin, async (req, res) => {
  const { uid, role } = req.body
  if (!uid || !role) return res.status(400).json({ message: "uid y role son requeridos" })
  const normalizedRole = role === "admin" ? "admin" : "user"

  await User.findOneAndUpdate(
    { firebaseUid: uid },
    {
      $set: {
        role: normalizedRole,
        status: "active",
      },
      $setOnInsert: {
        firebaseUid: uid,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  const admin = initFirebaseAdmin()
  await admin.auth().setCustomUserClaims(uid, {
    role: normalizedRole,
    admin: normalizedRole === "admin",
  })

  res.json({ ok: true, data: { uid, role: normalizedRole } })
})

export default router