// 骰点表达式解析：支持 d100 / 2d8 / 3d6+2 / 2+2d8 / 1d20-1 等
// 返回 { ok, expr, total, detail } ；detail 形如 "3+7" 便于展示掷出明细
const TERM = /^(\d*)d(\d+)$/i

export function rollExpression(input) {
  const expr = String(input || '').trim().replace(/\s+/g, '')
  if (!expr) return { ok: false, error: '表达式为空' }
  // 拆成带符号的项： 2+2d8 -> [+2, +2d8]
  const parts = expr.match(/[+-]?[^+-]+/g)
  if (!parts) return { ok: false, error: '无法解析表达式' }

  let total = 0
  const detailPieces = []
  for (let raw of parts) {
    let sign = 1
    if (raw[0] === '+') raw = raw.slice(1)
    else if (raw[0] === '-') { sign = -1; raw = raw.slice(1) }
    if (!raw) return { ok: false, error: '表达式格式错误' }

    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10)
      total += sign * n
      detailPieces.push((sign < 0 ? '-' : '') + n)
      continue
    }
    const m = raw.match(TERM)
    if (!m) return { ok: false, error: `无法识别的片段: ${raw}` }
    const count = m[1] ? parseInt(m[1], 10) : 1
    const faces = parseInt(m[2], 10)
    if (count < 1 || count > 100) return { ok: false, error: '骰子个数需在 1~100' }
    if (faces < 1 || faces > 1000) return { ok: false, error: '骰面需在 1~1000' }
    const rolls = []
    let sub = 0
    for (let i = 0; i < count; i++) {
      const r = 1 + Math.floor(Math.random() * faces)
      rolls.push(r)
      sub += r
    }
    total += sign * sub
    detailPieces.push((sign < 0 ? '-' : '') + (count > 1 ? `(${rolls.join('+')})` : rolls[0]))
  }
  return { ok: true, expr, total, detail: detailPieces.join('+').replace(/\+\-/g, '-') }
}
