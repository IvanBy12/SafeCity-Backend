import express from "express"
import { requireAuth } from "../middleware/auth.js"
import User from "../models/User.js"

const router = express.Router()

router.get("/me", requireAuth, async (req, res) => {
  const firebaseUid = req.user.uid
  const email = req.user.email || null
  const now = new Date()

  // 1) upsert user
  const userDoc = await User.findOneAndUpdate(
    { firebaseUid },
    {
      $setOnInsert: { status: "active", role: "user" },
      $set: { email, lastLoginAt: now },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  res.json({
    firebaseUid,
    role: userDoc.role,
    status: userDoc.status,
    email: userDoc.email,
    isAdmin: userDoc.role === "admin",
  })
})

export default router
