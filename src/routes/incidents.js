import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"

import {
  createIncident,
  addComment,
  voteIncident,
  confirmIncident,
  deleteIncident,
  listIncidents,
  listNearbyIncidents,
  getIncidentDetail,
  getStats,
} from "../controllers/incidentController.js"

const router = Router()

// ESPECÍFICAS PRIMERO ⬇️
router.get("/near", requireAuth, listNearbyIncidents)
router.get("/stats", requireAuth, getStats)
router.get("/", requireAuth, listIncidents)

// PARÁMETROS AL FINAL ⬇️
router.get("/:id", requireAuth, getIncidentDetail)
router.post("/:id/comments", requireAuth, addComment)
router.post("/:id/votes", requireAuth, voteIncident)
router.put("/:id/confirm", requireAuth, confirmIncident)
router.delete("/:id", requireAuth, deleteIncident)

router.post("/", requireAuth, createIncident)

export default router