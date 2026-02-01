import "dotenv/config"
import express from "express"
import cors from "cors"

import meRoutes from "./routes/me.js"
import incidentsRoutes from "./routes/incidents.js"
import { connectDB } from "./db.js"
import { initFirebaseAdmin } from "./middleware/auth.js"
import authregister from "./routes/auth.js"
import adminRoutes from "./routes/admin.js"



const app = express()
app.use(cors())
app.use(express.json())

initFirebaseAdmin()

app.use(meRoutes)
app.use("/incidents", incidentsRoutes)
app.use( authregister)
app.use("/admin", adminRoutes)


app.get("/", (_, res) => res.send("SafeCity API OK ✅"))

const port = process.env.PORT || 3001
console.log("ENV CHECK:", process.env.MONGODB_URI ? "✅ OK" : "❌ NO")

connectDB()
  .then(() => app.listen(port, () => console.log(`🚀 http://localhost:${port}`)))
  .catch((e) => {
    console.error("❌ DB error:", e.message)
    process.exit(1)
  })
