import mongoose from "mongoose"

const IncidentSchema = new mongoose.Schema(
  {
    categoryGroup: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "pending", index: true }, // pending/verified/resolved/etc
    reporterUid: { type: String, required: true, index: true },
    isAnonymous: { type: Boolean, default: false },
    locality: { type: String, index: true },
    location: { type: Object, default: null }, // guarda {lat,lng} u objeto GeoJSON
    eventAt: { type: Date, required: true, index: true },
    editableUntil: { type: Date, default: null },
    confirmationsCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    photos: { type: Array, default: [] },
  },
  { timestamps: true }
)

export default mongoose.model("Incident", IncidentSchema)
