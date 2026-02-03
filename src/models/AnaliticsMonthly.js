import mongoose from "mongoose"

const AnalyticsMonthlySchema = new mongoose.Schema(
  {
    month: { type: String, required: true, index: true },        // "YYYY-MM"
    locality: { type: String, required: true, index: true },
    categoryGroup: { type: String, required: true, index: true },
    totals: { type: Object, default: {} },
    byHourRange: { type: Object, default: {} },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
)

AnalyticsMonthlySchema.index({ month: 1, locality: 1, categoryGroup: 1 }, { unique: true })

export default mongoose.model("AnalyticsMonthly", AnalyticsMonthlySchema)
