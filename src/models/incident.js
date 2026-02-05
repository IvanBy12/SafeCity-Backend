import mongoose from "mongoose"

const IncidentSchema = new mongoose.Schema(
  {
    categoryGroup: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "pending", index: true },
    reporterUid: { type: String, required: true, index: true },
    isAnonymous: { type: Boolean, default: false },
    locality: { type: String, index: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: (v) => !v || v.length === 2,
          message: "coordinates debe tener [lng, lat]",
        },
      },
    },
    eventAt: { type: Date, required: true, index: true },
    editableUntil: { type: Date, default: null },
    confirmationsCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    photos: { type: Array, default: [] },
  },
  { timestamps: true }
)
IncidentSchema.index({ location: "2dsphere" })


export default mongoose.model("Incident", IncidentSchema)
