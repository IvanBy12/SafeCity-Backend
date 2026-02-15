import mongoose from "mongoose"

const IncidentSchema = new mongoose.Schema(
  {
    categoryGroup: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "pending", index: true }, // pending | verified | false_report
    reporterUid: { type: String, required: true, index: true },
    isAnonymous: { type: Boolean, default: false },
    locality: { type: String, index: true },
    address: { type: String, default: null },

    // ========================================
    // NUEVO SISTEMA DE VALIDACIÓN COMUNITARIA
    // ========================================
    // Usuarios que votaron "es verdadero"
    votedTrue: { type: [String], default: [] },
    // Usuarios que votaron "es falso"
    votedFalse: { type: [String], default: [] },
    // Score neto = votedTrue.length - votedFalse.length
    validationScore: { type: Number, default: 0 },
    // verified = true cuando validationScore >= 3
    verified: { type: Boolean, default: false, index: true },
    // flagged = true cuando validationScore <= -5
    flaggedFalse: { type: Boolean, default: false, index: true },

    // Mantener para compatibilidad (ahora = votedTrue.length)
    confirmationsCount: { type: Number, default: 0 },
    // Mantener para compatibilidad
    confirmedBy: { type: [String], default: [] },

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
    address: { type: String, default: null },
    verified: { type: Boolean, default: false, index: true },
    confirmedBy: { type: [String], default: [] },
  },
  { timestamps: true }
)
IncidentSchema.index({ location: "2dsphere" })

// 🆕 MÉTODO ESTÁTICO: Buscar cercanos
IncidentSchema.statics.findNearby = function (longitude, latitude, maxDistanceKm = 5) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistanceKm * 1000
      }
    }
  })
}


IncidentSchema.methods.confirmBy = async function (userId) {
  if (this.confirmedBy.includes(userId)) {
    throw new Error('Ya confirmaste este incidente')
  }

  this.confirmedBy.push(userId)
  this.confirmationsCount = this.confirmedBy.length

  if (this.confirmationsCount >= 3) {
    this.verified = true
  }

  return this.save()
}

// 🆕 VIRTUAL: timestamp
IncidentSchema.virtual('timestamp').get(function () {
  return this.eventAt ? this.eventAt.getTime() : Date.now()
})

IncidentSchema.set('toJSON', { virtuals: true })
IncidentSchema.set('toObject', { virtuals: true })


export default mongoose.model("Incident", IncidentSchema)
