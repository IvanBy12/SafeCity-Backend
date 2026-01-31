require("dotenv").config()
const express = require("express")
const cors = require("cors")
const { connectDB } = require("./db")

const app = express()
app.use(cors())
app.use(express.json())

app.get("/", (_, res) => res.send("SafeCity API OK ✅"))

const port = process.env.PORT || 3001
console.log("ENV CHECK:", process.env.MONGODB_URI ? "✅ OK" : "❌ NO")

connectDB()
  .then(() => app.listen(port, () => console.log(`🚀 http://localhost:${port}`)))
  .catch((e) => {
    console.error("❌ DB error:", e.message)
    process.exit(1)
  })
