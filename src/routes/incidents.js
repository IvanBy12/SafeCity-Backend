import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"

import {
  createIncident,
  addComment,
  voteIncident,
} from "../controllers/incidentController.js"

const router = Router()

// POST /incidents
router.post("/", requireAuth, createIncident)

// POST /incidents/:id/comments
router.post("/:id/comments", requireAuth, addComment)

// POST /incidents/:id/votes
router.post("/:id/votes", requireAuth, voteIncident)

export default router
