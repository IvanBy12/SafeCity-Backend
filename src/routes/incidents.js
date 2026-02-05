import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"

import {
  createIncident,
  addComment,
  voteIncident,
  listIncidents,
  listNearbyIncidents,
  getIncidentDetail,
} from "../controllers/incidentController.js"

const router = Router()

router.get("/", requireAuth, listIncidents)
router.get("/near", requireAuth, listNearbyIncidents)
router.get("/:id", requireAuth, getIncidentDetail)
router.post("/", requireAuth, createIncident)
router.post("/:id/comments", requireAuth, addComment)
router.post("/:id/votes", requireAuth, voteIncident)

export default router
