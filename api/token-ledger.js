import { authenticatedProviderUser, parseProviderBody, privilegedProviderRpc, providerKeyError } from './provider-key-vault.js'

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not update the render token ledger.', code:error?.code || 'TOKEN_LEDGER_ERROR' })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error:'Method not allowed' })
  }
  try {
    const { user } = await authenticatedProviderUser(req)
    const body = parseProviderBody(req)
    const action = String(body.action || '').trim()

    if (action === 'charge') {
      const cost = Number(body.cost)
      const label = String(body.label || 'AI render').trim().slice(0, 120)
      const rows = await privilegedProviderRpc('begin_render_token_charge', {
        target_user_id:user.id,
        target_cost:cost,
        target_action:label,
      })
      const result = Array.isArray(rows) ? rows[0] : null
      if (!result) throw providerKeyError('TOKEN_LEDGER_ERROR', 'FloStudio could not record the render charge.', 500)
      return res.status(200).json({ balance:result.balance, unlimited:Boolean(result.unlimited), transactionId:result.transaction_id || null })
    }

    if (action === 'refund') {
      const transactionId = String(body.transactionId || '').trim()
      const amount = Number(body.amount)
      const reason = String(body.reason || '').trim().slice(0, 240)
      if (!transactionId || !Number.isInteger(amount) || amount <= 0) throw providerKeyError('REFUND_REQUEST_INVALID', 'A valid render charge and refund amount are required.', 400)
      const rows = await privilegedProviderRpc('refund_render_token_charge', {
        target_user_id:user.id,
        target_transaction_id:transactionId,
        target_amount:amount,
        target_reason:reason,
      })
      const result = Array.isArray(rows) ? rows[0] : null
      if (!result) throw providerKeyError('TOKEN_LEDGER_ERROR', 'FloStudio could not settle the render refund.', 500)
      return res.status(200).json({ balance:result.balance, unlimited:Boolean(result.unlimited), transactionId })
    }

    throw providerKeyError('TOKEN_ACTION_INVALID', 'FloStudio did not recognize this token action.', 400)
  } catch (error) {
    return sendError(res, error)
  }
}
