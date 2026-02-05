import admin from "firebase-admin"
import User from "../models/User.js"

export function initFirebaseAdmin() {
  if (admin.apps.length) return admin
  admin.initializeApp({ credential: admin.credential.applicationDefault() })
  console.log("✅ Firebase Admin inicializado")
    return admin
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: "Falta token Bearer" })

    const firebaseAdmin = initFirebaseAdmin()
    const decoded = await firebaseAdmin.auth().verifyIdToken(token)

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      role: decoded.role || "user",
      isAdmin: decoded.admin === true || decoded.role === "admin",
      claims: decoded
    }

    next()
  } catch (e) {
    return res.status(401).json({ message: "Token inválido", error: e.message })
  }
}

export async function requireAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ message: "No autenticado" })

    if (req.user.isAdmin || req.user.role === "admin") return next()

    const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean()
    if (dbUser?.role === "admin") {
      req.user.role = "admin"
      req.user.isAdmin = true
      return next()
    }

    return res.status(403).json({ message: "Sin permisos" })
  } catch (e) {
    return res.status(500).json({ message: "Error validando permisos", error: e.message })
  }
}