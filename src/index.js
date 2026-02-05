import "dotenv/config"
import express from "express"
import cors from "cors"
import authBootstrapRoutes from "./routes/authBootstrap.js"
import meRoutes from "./routes/me.js"
import incidentsRoutes from "./routes/incidents.js"
import authRoutes from "./routes/auth.js"
import adminRoutes from "./routes/admin.js"

// ✅ NUEVO: reportes (monthly_reports)
import reportsRoutes from "./routes/reports.js"

import { connectDB } from "./db.js"
import { initFirebaseAdmin } from "./middleware/auth.js"

const app = express()

// (Opcional) si estás detrás de proxy/nginx y quieres IP real:
app.set("trust proxy", true)

app.use(
  cors({
    origin: "*", // ajústalo si necesitas seguridad
    credentials: true,
  })
)

// ✅ si envías imágenes/base64, sube el limit; si no, déjalo en 2mb
app.use(express.json({ limit: "2mb" }))
app.use(express.urlencoded({ extended: true }))

// Firebase Admin
initFirebaseAdmin()

// --- ROUTES ---
// Si tu meRoutes ya tiene su propio prefijo interno, lo dejas igual:
app.use(meRoutes)

// Mantienes como ya lo tienes
app.use("/incidents", incidentsRoutes)
app.use(authRoutes)
app.use("/admin", adminRoutes)

// ✅ NUEVO: reportes
app.use("/reports", reportsRoutes)

app.get("/", (_, res) => res.send("SafeCity API OK ✅"))

const port = process.env.PORT || 3001
console.log("ENV CHECK:", process.env.MONGODB_URI ? "✅ OK" : "❌ NO")

connectDB()
  .then(() => {
    app.listen(port, () => console.log(`🚀 http://localhost:${port}`))
  })
  .catch((e) => {
    console.error("❌ DB error:", e.message)
    process.exit(1)
  })
