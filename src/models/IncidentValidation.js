import mongoose from "mongoose"

const IncidentValidationSchema = new mongoose.Schema(
  {
    incidentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Incident" },
    uid: { type: String, required: true, index: true },
    vote: { type: Boolean, required: true }, // true=confirmo, false=nego
    comment: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// 1 voto por usuario por incidente
IncidentValidationSchema.index({ incidentId: 1, uid: 1 }, { unique: true })

export default mongoose.model("IncidentValidation", IncidentValidationSchema)
