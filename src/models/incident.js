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
    address: { type: String, default: null },

    // ========================================
    // FOTO DEL INCIDENTE
    // ========================================
    imageUrl: { type: String, default: null },

    // ========================================
    // SISTEMA DE VALIDACIÓN
    // ========================================
    votedTrue: { type: [String], default: [] },
    votedFalse: { type: [String], default: [] },
    validationScore: { type: Number, default: 0 },
    verified: { type: Boolean, default: false, index: true },
    flaggedFalse: { type: Boolean, default: false, index: true },
    confirmedBy: { type: [String], default: [] },
    confirmationsCount: { type: Number, default: 0 },

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
    photos: {
      type: [{ url: { type: String, required: true } }],
      default: [],
    },
  },
  { timestamps: true }
)

IncidentSchema.index({ location: "2dsphere" })

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

// Votar verdadero
IncidentSchema.methods.voteTrue = async function (userId) {
  if (this.reporterUid === userId) throw new Error("No puedes validar tu propio reporte")
  if (this.votedTrue.includes(userId)) throw new Error("Ya confirmaste este incidente")
  if (this.votedFalse.includes(userId)) {
    this.votedFalse = this.votedFalse.filter(uid => uid !== userId)
  }
  this.votedTrue.push(userId)
  this._recalculateScore()
  return this.save()
}

// Votar falso
IncidentSchema.methods.voteFalse = async function (userId) {
  if (this.reporterUid === userId) throw new Error("No puedes validar tu propio reporte")
  if (this.votedFalse.includes(userId)) throw new Error("Ya reportaste este incidente como falso")
  if (this.votedTrue.includes(userId)) {
    this.votedTrue = this.votedTrue.filter(uid => uid !== userId)
  }
  this.votedFalse.push(userId)
  this._recalculateScore()
  return this.save()
}

// Quitar voto
IncidentSchema.methods.removeVote = async function (userId) {
  const hadTrue = this.votedTrue.includes(userId)
  const hadFalse = this.votedFalse.includes(userId)
  if (!hadTrue && !hadFalse) throw new Error("No has votado en este incidente")
  this.votedTrue = this.votedTrue.filter(uid => uid !== userId)
  this.votedFalse = this.votedFalse.filter(uid => uid !== userId)
  this._recalculateScore()
  return this.save()
}

// Recalcular
IncidentSchema.methods._recalculateScore = function () {
  this.validationScore = this.votedTrue.length - this.votedFalse.length
  this.verified = this.validationScore >= 3
  this.flaggedFalse = this.validationScore <= -5
  if (this.flaggedFalse) this.status = "false_report"
  else if (this.verified) this.status = "verified"
  else this.status = "pending"
  this.confirmationsCount = this.votedTrue.length
  this.confirmedBy = [...this.votedTrue]
}

// Compatibilidad
IncidentSchema.methods.confirmBy = async function (userId) {
  return this.voteTrue(userId)
}

// Virtual: timestamp
IncidentSchema.virtual("timestamp").get(function () {
  return this.eventAt ? this.eventAt.getTime() : Date.now()
})

IncidentSchema.set("toJSON", { virtuals: true })
IncidentSchema.set("toObject", { virtuals: true })

export default mongoose.model("Incident", IncidentSchema)