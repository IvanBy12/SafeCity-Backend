import admin from "firebase-admin"
import User from "../models/User.js"

export function initFirebaseAdmin() {
  if (admin.apps.length) return admin

  // ─── Estrategia dual de credenciales ────────────────────────────────────
  // 1) Producción / Vercel: las tres variables de entorno individuales.
  // 2) Desarrollo local: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
  //    (applicationDefault() las lee automáticamente).
  // Esto evita que FCM falle silenciosamente cuando las vars individuales
  // no están definidas y el SDK inicializa con projectId/clientEmail undefined.
  // ─────────────────────────────────────────────────────────────────────────
  const hasEnvVarCreds =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY

  const credential = hasEnvVarCreds
    ? admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel escapa los \n como \\n en las env vars, hay que revertirlo
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      })
    : admin.credential.applicationDefault()

  admin.initializeApp({ credential })

  // ─── Diagnóstico de credenciales FCM ─────────────────────────────────
  console.log("FIREBASE_ADMIN_INIT", JSON.stringify({
    method: hasEnvVarCreds ? "env_vars" : "application_default",
    projectId: process.env.FIREBASE_PROJECT_ID || "NOT_SET",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
      ? process.env.FIREBASE_CLIENT_EMAIL.substring(0, 15) + "..."
      : "NOT_SET",
    privateKeyPresent: !!process.env.FIREBASE_PRIVATE_KEY,
    privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
    googleAppCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS || "NOT_SET",
  }))
  console.log(
    hasEnvVarCreds
      ? "✅ Firebase Admin inicializado con credenciales individuales de env vars"
      : "⚠️ Firebase Admin inicializado via GOOGLE_APPLICATION_CREDENTIALS (NO funciona en Vercel si el archivo no existe)"
  )
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