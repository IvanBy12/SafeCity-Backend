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
    commentsCount: { type: Number, default: 0 },
    photos: { type: Array, default: [] },
  },
  { timestamps: true }
)

IncidentSchema.index({ location: "2dsphere" })

// ========================================
// MÉTODO: Votar como verdadero
// ========================================
IncidentSchema.methods.voteTrue = async function (userId) {
  // No puede votar su propio reporte
  if (this.reporterUid === userId) {
    throw new Error("No puedes validar tu propio reporte")
  }
  // Ya votó verdadero
  if (this.votedTrue.includes(userId)) {
    throw new Error("Ya confirmaste este incidente")
  }
  // Si antes votó falso, quitar ese voto primero
  if (this.votedFalse.includes(userId)) {
    this.votedFalse = this.votedFalse.filter(uid => uid !== userId)
  }

  this.votedTrue.push(userId)
  this._recalculateScore()
  return this.save()
}

// ========================================
// MÉTODO: Votar como falso
// ========================================
IncidentSchema.methods.voteFalse = async function (userId) {
  // No puede votar su propio reporte
  if (this.reporterUid === userId) {
    throw new Error("No puedes validar tu propio reporte")
  }
  // Ya votó falso
  if (this.votedFalse.includes(userId)) {
    throw new Error("Ya reportaste este incidente como falso")
  }
  // Si antes votó verdadero, quitar ese voto primero
  if (this.votedTrue.includes(userId)) {
    this.votedTrue = this.votedTrue.filter(uid => uid !== userId)
  }

  this.votedFalse.push(userId)
  this._recalculateScore()
  return this.save()
}

// ========================================
// MÉTODO: Quitar voto (cualquier dirección)
// ========================================
IncidentSchema.methods.removeVote = async function (userId) {
  const hadVoteTrue = this.votedTrue.includes(userId)
  const hadVoteFalse = this.votedFalse.includes(userId)

  if (!hadVoteTrue && !hadVoteFalse) {
    throw new Error("No has votado en este incidente")
  }

  this.votedTrue = this.votedTrue.filter(uid => uid !== userId)
  this.votedFalse = this.votedFalse.filter(uid => uid !== userId)
  this._recalculateScore()
  return this.save()
}

// ========================================
// MÉTODO INTERNO: Recalcular score y estados
// ========================================
IncidentSchema.methods._recalculateScore = function () {
  this.validationScore = this.votedTrue.length - this.votedFalse.length

  // Verificado si score >= 3
  this.verified = this.validationScore >= 3

  // Marcado como falso si score <= -5
  this.flaggedFalse = this.validationScore <= -5

  // Si es marcado como falso, cambiar status
  if (this.flaggedFalse) {
    this.status = "false_report"
  } else if (this.verified) {
    this.status = "verified"
  } else {
    this.status = "pending"
  }

  // Compatibilidad
  this.confirmationsCount = this.votedTrue.length
  this.confirmedBy = [...this.votedTrue]
}

// Buscar cercanos
IncidentSchema.statics.findNearby = function (longitude, latitude, maxDistanceKm = 5) {
  return this.find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceKm * 1000,
      },
    },
  })
}

// Virtual: timestamp
IncidentSchema.virtual("timestamp").get(function () {
  return this.eventAt ? this.eventAt.getTime() : Date.now()
})

IncidentSchema.set("toJSON", { virtuals: true })
IncidentSchema.set("toObject", { virtuals: true })

export default mongoose.model("Incident", IncidentSchema)