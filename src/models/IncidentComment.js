import mongoose from "mongoose"

const IncidentCommentSchema = new mongoose.Schema(
  {
    incidentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Incident" },
    authorUid: { type: String, required: true, index: true },
    isAnonymous: { type: Boolean, default: false },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export default mongoose.model("IncidentComment", IncidentCommentSchema)
