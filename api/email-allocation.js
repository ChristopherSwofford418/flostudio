// Allocation is capped by each app's requested maximum. Unused shares are not
// automatically transferred to another app, preventing an early app monopolizing Gmail.
export function allocateEmailBudget(campaigns, budget) {
  const sorted=[...campaigns].sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  const usable=Math.max(0,Math.min(2000,Math.floor(Number(budget) || 0)))
  if(!sorted.length) return new Map()
  const base=Math.floor(usable / sorted.length),remainder=usable % sorted.length
  return new Map(sorted.map((c,i)=>[c.id,Math.min(100,Math.max(1,Number(c.daily_limit)||100),base+(i<remainder ? 1 : 0))]))
}
