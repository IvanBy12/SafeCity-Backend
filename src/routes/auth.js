import { Router } from "express"
import { initFirebaseAdmin } from "../middleware/auth.js"
import User from "../models/User.js"

const router = Router()

router.post("/auth/register", async (req, res) => {
  try {
    const secret = req.headers["x-dev-secret"]
    if (!process.env.DEV_ADMIN_SECRET || secret !== process.env.DEV_ADMIN_SECRET) {
      return res.status(401).json({ message: "No autorizado (DEV)" })
    }

  const { email, password, displayName = "Usuario SafeCity", role = "user" } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: "email y password son obligatorios" })
    }
    const admin = initFirebaseAdmin()
    const normalizedRole = role === "admin" ? "admin" : "user"

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    })

   await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: normalizedRole,
      admin: normalizedRole === "admin",
    })

   await User.findOneAndUpdate(
      { firebaseUid: userRecord.uid },
      {
        $setOnInsert: {
          firebaseUid: userRecord.uid,
          email: userRecord.email,
          displayName,
          role: normalizedRole,
          status: "active",
        },
      },
      { upsert: true , setDefaultsOnInsert: true }
    )

    return res.status(201).json({
      ok: true,
      uid: userRecord.uid,
      email: userRecord.email,
      displayName,
      role: normalizedRole,
    })
  } catch (e) {
    console.error("REGISTER error:", e)
    return res.status(500).json({ message: e.message })
  }
})

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ message: "email y password requeridos" })

  const apiKey = process.env.FIREBASE_WEB_API_KEY
  if (!apiKey) return res.status(500).json({ message: "FIREBASE_WEB_API_KEY no está en .env" })

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  const data = await r.json()
  if (!r.ok) return res.status(401).json({ message: "Login inválido", data })

  return res.json({
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    localId: data.localId,
    expiresIn: data.expiresIn,
  })
})

export default router
