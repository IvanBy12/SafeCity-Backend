const mongoose = require("mongoose")

async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("Falta MONGODB_URI en .env")

  mongoose.set("strictQuery", true)
  await mongoose.connect(uri)
  console.log("✅ MongoDB Atlas conectado")
}

module.exports = { connectDB }
