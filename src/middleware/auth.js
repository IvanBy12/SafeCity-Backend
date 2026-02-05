// middleware/auth.js
import admin from "firebase-admin"

export function initFirebaseAdmin() {
  if (admin.apps.length) return
  admin.initializeApp({ credential: admin.credential.applicationDefault() })
  console.log("✅ Firebase Admin inicializado")
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: "Falta token Bearer" })

    const decoded = await admin.auth().verifyIdToken(token)

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      // ✅ aquí van claims (role/admin/etc)
      claims: decoded,
      role: decoded.role || null,
      isAdmin: decoded.admin === true || decoded.role === "admin",
    }

    next()
  } catch (e) {
    return res.status(401).json({ message: "Token inválido", error: e.message })
  }
}