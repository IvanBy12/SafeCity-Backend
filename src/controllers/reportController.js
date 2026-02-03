import Incident from "../models/incident.js"
import AnalyticsMonthly from "../models/AnalyticsMonthly.js"
import MonthlyReport from "../models/MonthlyReport.js"

function getMonthRange(monthStr, timezone = "America/Bogota") {
  // monthStr = "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0))
  return { start, end, timezone }
}

function hourRangeKey(h) {
  if (h >= 0 && h <= 5) return "00-05"
  if (h >= 6 && h <= 11) return "06-11"
  if (h >= 12 && h <= 17) return "12-17"
  return "18-23"
}

export async function runMonthlyReports(req, res) {
  const month = req.query.month || new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const { start, end, timezone } = getMonthRange(month)

  // 1) Agrega por (month, locality, categoryGroup, hour)
  const rows = await Incident.aggregate([
    { $match: { eventAt: { $gte: start, $lt: end } } },
    {
      $addFields: {
        month: { $dateToString: { format: "%Y-%m", date: "$eventAt", timezone } },
        hour: { $hour: { date: "$eventAt", timezone } },
      },
    },
    {
      $group: {
        _id: {
          month: "$month",
          locality: "$locality",
          categoryGroup: "$categoryGroup",
          hour: "$hour",
        },
        incidents: { $sum: 1 },
        confirmations: { $sum: "$confirmationsCount" },
        comments: { $sum: "$commentsCount" },
      },
    },
    {
      $group: {
        _id: {
          month: "$_id.month",
          locality: "$_id.locality",
          categoryGroup: "$_id.categoryGroup",
        },
        incidents: { $sum: "$incidents" },
        confirmations: { $sum: "$confirmations" },
        comments: { $sum: "$comments" },
        byHour: { $push: { hour: "$_id.hour", count: "$incidents" } },
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        locality: "$_id.locality",
        categoryGroup: "$_id.categoryGroup",
        incidents: 1,
        confirmations: 1,
        comments: 1,
        byHour: 1,
      },
    },
  ])

  // 2) Upsert analytics_monthly
  for (const r of rows) {
    const byHourRange = { "00-05": 0, "06-11": 0, "12-17": 0, "18-23": 0 }
    for (const it of r.byHour) {
      const key = hourRangeKey(it.hour)
      byHourRange[key] += it.count
    }

    await AnalyticsMonthly.updateOne(
      { month: r.month, locality: r.locality, categoryGroup: r.categoryGroup },
      {
        $set: {
          totals: {
            incidents: r.incidents,
            confirmations: r.confirmations,
            comments: r.comments,
          },
          byHourRange,
          generatedAt: new Date(),
        },
      },
      { upsert: true }
    )
  }

  // 3) Construye monthly_reports (tabla final)
  const analytics = await AnalyticsMonthly.find({ month }).lean()

  const totals = { incidents: 0, confirmations: 0, comments: 0 }
  const byLocalityMap = new Map()

  for (const a of analytics) {
    totals.incidents += a.totals?.incidents || 0
    totals.confirmations += a.totals?.confirmations || 0
    totals.comments += a.totals?.comments || 0

    if (!byLocalityMap.has(a.locality)) byLocalityMap.set(a.locality, [])
    byLocalityMap.get(a.locality).push({
      categoryGroup: a.categoryGroup,
      totals: a.totals,
      byHourRange: a.byHourRange,
    })
  }

  const byLocality = Array.from(byLocalityMap.entries()).map(([locality, groups]) => ({
    locality,
    groups,
  }))

  await MonthlyReport.updateOne(
    { month },
    { $set: { month, generatedAt: new Date(), totals, byLocality } },
    { upsert: true }
  )

  return res.json({ ok: true, month, analyticsInserted: rows.length, reportTotals: totals })
}
