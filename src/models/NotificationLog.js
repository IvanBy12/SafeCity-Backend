import mongoose from "mongoose"

const NotificationLogSchema = new mongoose.Schema(
  {
    incidentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Incident" },
    targetUid: { type: String, required: true, index: true },
    targetDeviceToken: { type: String, required: true },
    radiusM: { type: Number, default: 500 },
    status: { type: String, default: "sent" }, // sent/failed
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export default mongoose.model("NotificationLog", NotificationLogSchema)
