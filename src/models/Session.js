import mongoose from "mongoose"

const SessionSchema = new mongoose.Schema({
    uid: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true }, // UUID
    ip: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
})

// TTL opcional: borra sesiones expiradas automáticamente
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model("Session", SessionSchema)
