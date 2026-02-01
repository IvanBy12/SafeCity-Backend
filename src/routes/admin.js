import express from "express"
import { initFirebaseAdmin } from "../firebaseAdmin.js"
import { requireAuth } from "../middleware/requireAuth.js"



const router = express.Router()

// Solo deja usarlo si quien llama YA es admin
function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ message: "Sin permisos" })
    next()
  }
}

router.post("/admin/set-role", requireAuth, requireRole("admin"), async (req, res) => {
  const { uid, role } = req.body
  if (!uid || !role) return res.status(400).json({ message: "uid y role son requeridos" })

  const admin = initFirebaseAdmin()
  await admin.auth().setCustomUserClaims(uid, { role })

  res.json({ ok: true, uid, role })
})

export default router
