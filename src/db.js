import mongoose from "mongoose"
import "dotenv/config"

const uri = process.env.MONGODB_URI
if (!uri) throw new Error("Falta MONGODB_URI en .env")

let connectionPromise

export async function connectDB() {
 if (mongoose.connection.readyState === 1) return mongoose.connection
if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || "myapp",
    })
  }

  await connectionPromise
  console.log("✅ MongoDB conectado con Mongoose")
  return mongoose.connection

}
