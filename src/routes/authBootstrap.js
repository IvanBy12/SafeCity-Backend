import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import User from "../models/User.js"

const router = Router()

router.post("/auth/bootstrap", requireAuth, async (req, res) => {
  const { uid, email } = req.user
  const { displayName, photoUrl } = req.body || {}
  const now = new Date()

    const User = await User.findOneAndUpdate(
    { firebaseUid: uid },
    {
      $set: {
        email,
        displayName: displayName || email || null,
        photoUrl: photoUrl || null,
        lastLoginAt: now,
      },
      $setOnInsert: {
        firebaseUid: uid,
        role: "user",
        status: "active",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  return res.json({ ok: true, user })
})

export default router