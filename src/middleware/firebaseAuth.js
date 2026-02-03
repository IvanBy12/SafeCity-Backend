import admin from "firebase-admin"

export function initFirebaseAdmin() {
  if (admin.apps.length) return

  // Opción A: GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON
  // Opción B: poner variables y usar cert()
  // Aquí te dejo la A (la más simple si ya tienes el JSON)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

export async function requireFirebaseAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: "Falta token" })

    const decoded = await admin.auth().verifyIdToken(token)
    req.user = { uid: decoded.uid, email: decoded.email || null }
    next()
  } catch (e) {
    return res.status(401).json({ message: "Token inválido", error: String(e?.message || e) })
  }
}
