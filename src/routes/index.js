import { Router } from "express"
import { requireFirebaseAuth } from "../middleware/firebaseAuth.js"
import { startSession } from "../controllers/authController.js"
import { createIncident, addComment, voteIncident } from "../controllers/incidentController.js"
import { runMonthlyReports } from "../controllers/reportController.js"

const router = Router()

router.post("/auth/session/start", requireFirebaseAuth, startSession)

router.post("/incidents", requireFirebaseAuth, createIncident)
router.post("/incidents/:id/comments", requireFirebaseAuth, addComment)
router.post("/incidents/:id/votes", requireFirebaseAuth, voteIncident)

// Generación de reportes (admin si quieres)
router.post("/reports/monthly/run", runMonthlyReports)

export default router
