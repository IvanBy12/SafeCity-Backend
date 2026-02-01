import { initFirebaseAdmin } from "../firebaseAdmin.js"


export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
    if (!token) return res.status(401).json({ message: "Falta Bearer token" })

    const admin = initFirebaseAdmin()
    const decoded = await admin.auth().verifyIdToken(token)

    req.user = decoded // uid, email, y claims (roles)
    next()
  } catch (e) {
    return res.status(401).json({ message: "Token inválido", error: e.message })
  }
}

