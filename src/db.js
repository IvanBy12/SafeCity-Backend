import { MongoClient } from "mongodb"
import "dotenv/config"

const uri = process.env.MONGODB_URI
if (!uri) throw new Error("Falta MONGODB_URI en .env")

const dbName = process.env.MONGODB_DB || "myapp"

let client
let db

export async function connectDB() {
  if (db) return db // ✅ evita reconectar en cada restart

  client = new MongoClient(uri)
  await client.connect()

  db = client.db(dbName)
  console.log("✅ MongoDB conectado a:", dbName)

  return db
}

export function getDb() {
  if (!db) throw new Error("DB no inicializada. Llama connectDB() primero.")
  return db
}
