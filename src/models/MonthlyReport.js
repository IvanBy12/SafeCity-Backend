import mongoose from "mongoose"

const MonthlyReportSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, index: true }, // "YYYY-MM"
    generatedAt: { type: Date, default: Date.now },
    totals: { type: Object, default: {} },       // totales del mes (global)
    byLocality: { type: Array, default: [] },    // breakdown por localidad
    notes: { type: String, default: "" },
  },
  { timestamps: false }
)

export default mongoose.model("MonthlyReport", MonthlyReportSchema)
