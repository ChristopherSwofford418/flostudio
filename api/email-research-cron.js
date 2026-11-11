import { safeEmailSecretEqual } from './email-core.js'
import { runEmailResearchBatch } from './email-research-runtime.js'

export const config = { maxDuration:180 }

// Test dependencies can be supplied by server code only, never by query/body.
export function createEmailResearchCronHandler(dependencies = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ code:'METHOD_NOT_ALLOWED' })
    }
    if (!process.env.CRON_SECRET || typeof req.headers?.authorization !== 'string' || !safeEmailSecretEqual(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) {
      return res.status(401).json({ code:'AUTH_REQUIRED' })
    }
    try {
      const result = await runEmailResearchBatch(dependencies)
      return res.status(result.statusCode).json(result.body)
    } catch {
      return res.status(503).json({ code:'EMAIL_RESEARCH_ERROR' })
    }
  }
}

export default createEmailResearchCronHandler()
