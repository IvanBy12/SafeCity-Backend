import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"

import {
  createIncident,
  editIncident,
  getMyIncidents,
  triggerCloseExpired,
  getAggregateStats,
  listIncidents,
  listNearbyIncidents,
  getIncidentDetail,
  addComment,
  voteIncident,
  voteIncidentTrue,
  voteIncidentFalse,
  removeVote,
  confirmIncident,
  unconfirmIncident,
  deleteIncident,
  getStats,
} from "../controllers/incidentController.js"
const router = Router()

// ESPECÍFICAS PRIMERO
router.get("/near", requireAuth, listNearbyIncidents)
router.get("/stats", requireAuth, getStats)
router.get("/", requireAuth, listIncidents)

router.get("/stats", requireAuth, getStats)
router.get("/stats/aggregate", requireAuth, getAggregateStats)
router.get("/close-expired", requireAuth, triggerCloseExpired)


// PARÁMETROS
router.get("/:id", requireAuth, getIncidentDetail)
router.delete("/:id", requireAuth, deleteIncident)
router.patch("/:id", requireAuth, editIncident)
router.post("/:id/comments", requireAuth, addComment)


// ========================================
// NUEVO SISTEMA DE VALIDACIÓN
// ========================================
router.put("/:id/vote/true", requireAuth, voteIncidentTrue)     // Votar verdadero
router.put("/:id/vote/false", requireAuth, voteIncidentFalse)   // Votar falso
router.delete("/:id/vote", requireAuth, removeVote)              // Quitar voto

// ========================================
// COMPATIBILIDAD (mantener rutas antiguas)
// ========================================
router.put("/:id/confirm", requireAuth, confirmIncident)         // → voteTrue
router.delete("/:id/confirm", requireAuth, unconfirmIncident)    // → removeVote
router.post("/:id/votes", requireAuth, voteIncident)             // Legacy

router.delete("/:id", requireAuth, deleteIncident)
router.post("/", requireAuth, createIncident)

export default router