import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import { runMonthlyReports } from "../controllers/reports.controller.js"

const router = Router()

// Puedes protegerlo con admin si quieres.
// Por ahora: solo requiere token válido.
router.post("/monthly/run", requireAuth, runMonthlyReports)

export default router
