import { Router } from "express"
import { requireAuth, requireAdmin } from "../middleware/auth.js"
import { runMonthlyReports, getMonthlyReport } from "../controllers/reports.controller.js"

const router = Router()

router.post("/monthly/run", requireAuth, requireAdmin, runMonthlyReports)
router.get("/monthly", requireAuth, requireAdmin, getMonthlyReport)

export default router
