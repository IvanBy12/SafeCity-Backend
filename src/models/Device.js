import mongoose from "mongoose"

const DeviceSchema = new mongoose.Schema(
    {
        uid: { type: String, required: true, index: true }, // Firebase UID
        fcmToken: { type: String, required: true, index: true },
        platform: { type: String, required: true }, // android/ios
        deviceId: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        lastLocation: { type: Object, default: null },
        lastSeenAt: { type: Date, default: null },
        notif: { type: Object, default: {} },
    },
    { timestamps: true }
)

// Evita duplicados: mismo usuario + mismo device
DeviceSchema.index({ uid: 1, deviceId: 1 }, { unique: true })

export default mongoose.model("Device", DeviceSchema)
