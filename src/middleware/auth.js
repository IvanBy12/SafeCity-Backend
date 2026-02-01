import admin from "firebase-admin"

export function initFirebaseAdmin() {
  if (admin.apps.length) return

  // OJO: debes tener GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON
  // o inicializar con credenciales explícitas
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })

  console.log("✅ Firebase Admin inicializado")
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : null

    if (!token) {
      return res.status(401).json({ message: "Falta token Bearer" })
    }

    const decoded = await admin.auth().verifyIdToken(token)
    req.user = decoded // uid, email, etc.
    next()
  } catch (e) {
    return res.status(401).json({ message: "Token inválido", error: e.message })
  }
}
