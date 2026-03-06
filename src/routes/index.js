import { Router } from "express"
import { requireFirebaseAuth } from "../middleware/firebaseAuth.js"
import { startSession } from "../controllers/authController.js"
import { runMonthlyReports } from "../controllers/reportController.js"
import {
  createIncident,
  addComment,
  voteIncident,
  listIncidents,
  getIncidentDetail,
} from "../controllers/incidentController.js";


const router = Router()

router.post("/auth/session/start", requireFirebaseAuth, startSession)

// LISTAR
router.get("/", requireFirebaseAuth, listIncidents);

// DETALLE (incluye comments)
router.get("/:id", requireFirebaseAuth, getIncidentDetail);

// VOTAR
router.post("/:id/votes", requireFirebaseAuth, voteIncident);

// COMENTAR
router.post("/:id/comments", requireFirebaseAuth, addComment);

// BORRAR
router.delete("/:id", requireFirebaseAuth, deleteIncident);


router.post("/incidents", requireFirebaseAuth, createIncident)
router.post("/incidents/:id/comments", requireFirebaseAuth, addComment)
router.post("/incidents/:id/votes", requireFirebaseAuth, voteIncident)
router.get("/incidents", requireFirebaseAuth, listIncidents)
router.get("/incidents/:id", requireFirebaseAuth, getIncidentDetail)

// Generación de reportes (admin si quieres)
router.post("/reports/monthly/run", runMonthlyReports)

export default router
