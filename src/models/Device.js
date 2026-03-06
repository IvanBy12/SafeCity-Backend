import mongoose from "mongoose"

const DeviceSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, index: true },
    fcmToken: { type: String, required: true, index: true },
    platform: { type: String, required: true },
    deviceId: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    notif: { type: Object, default: {} },

    // ==========================================
    // UBICACIÓN PARA NOTIFICACIONES DE PROXIMIDAD
    // GeoJSON Point: coordinates: [longitude, latitude]
    // ==========================================
    lastLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
        validate: {
          validator: (v) => !v || v.length === 2,
          message: "coordinates debe tener [lng, lat]",
        },
      },
    },
  },
  { timestamps: true }
)

// Evita duplicados: mismo usuario + mismo device
DeviceSchema.index({ uid: 1, deviceId: 1 }, { unique: true })

// 2dsphere para consultas $near — sparse: true para ignorar docs sin lastLocation
DeviceSchema.index({ lastLocation: "2dsphere" }, { sparse: true })

export default mongoose.model("Device", DeviceSchema)