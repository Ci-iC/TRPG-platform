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

// ============ 骰点规则（属性/技能检定） ============
// 规则形如 { system:'coc'|'dnd', critMax:1|5, fumbleMin:100|96 }
export const DEFAULT_DICE_RULE = { system: 'coc', critMax: 1, fumbleMin: 100 }

// 容错归一化：脏数据/旧库 null 都收敛到合法值
export function normalizeRule(raw) {
  const r = raw || {}
  return {
    system: r.system === 'dnd' ? 'dnd' : 'coc',
    critMax: Number(r.critMax) === 5 ? 5 : 1,
    fumbleMin: Number(r.fumbleMin) === 96 ? 96 : 100,
  }
}

// COC 检定等级中文名（DND 无等级）
export const COC_LEVEL_LABEL = {
  crit: '大成功', extreme: '极难成功', hard: '困难成功',
  success: '成功', fail: '失败', fumble: '大失败',
}

// 属性/技能检定。COC：d100 越小越好，有成功分级与大成功/大失败；DND：d20+调整值，越大越好，无分级。
export function rollCheck({ system, value, critMax = 1, fumbleMin = 100 }) {
  const v = Math.max(0, Math.floor(Number(value) || 0))
  if (system === 'dnd') {
    const roll = 1 + Math.floor(Math.random() * 20)
    const mod = Math.floor((v - 10) / 2)
    const modStr = mod >= 0 ? `+${mod}` : `${mod}`
    return { ok: true, system: 'dnd', roll, total: roll + mod, value: v, level: null,
      detail: `d20(${roll})${modStr} = ${roll + mod}` }
  }
  // COC
  const roll = 1 + Math.floor(Math.random() * 100)
  const half = Math.floor(v / 2)
  const fifth = Math.floor(v / 5)
  let level
  if (roll <= critMax) level = 'crit'              // 大成功（始终判定）
  else if (roll > v) level = roll >= fumbleMin ? 'fumble' : 'fail' // 失败区间：落入大失败范围则大失败
  else if (roll <= fifth) level = 'extreme'        // 极难成功
  else if (roll <= half) level = 'hard'            // 困难成功
  else level = 'success'                           // 常规成功
  return { ok: true, system: 'coc', roll, total: roll, value: v, level, detail: `d100=${roll}` }
}
