/**
 * FrameProfiler – mede tempo por etapa do frame para identificar gargalos.
 * Quando um frame excede STALL_MS, armazena o breakdown para exibição no overlay.
 */

const STALL_MS = 25
const MAX_BREAKDOWN_AGE_MS = 2000

interface StallBreakdown {
  totalMs: number
  preLoadMs: number
  mapDrawMs: number
  mapPreLoadMs: number
  mapDrawFloorMs: number
  lightMs: number
  creatureInfoMs: number
  foregroundMs: number
  drawPoolMs: number
  timestamp: number
}

let lastStall: StallBreakdown | null = null

let lastMapBreakdown = { preLoad: 0, drawFloor: 0 }

export function recordMapPhase(preLoadMs: number, drawFloorMs: number): void {
  lastMapBreakdown = { preLoad: preLoadMs, drawFloor: drawFloorMs }
}

export function recordFrameTiming(
  preLoadMs: number,
  mapDrawMs: number,
  lightMs: number,
  creatureInfoMs: number,
  foregroundMs: number,
  drawPoolMs: number
): void {
  const total = preLoadMs + mapDrawMs + lightMs + creatureInfoMs + foregroundMs + drawPoolMs
  if (total >= STALL_MS) {
    lastStall = {
      totalMs: Math.round(total),
      preLoadMs: Math.round(preLoadMs),
      mapDrawMs: Math.round(mapDrawMs),
      mapPreLoadMs: Math.round(lastMapBreakdown.preLoad),
      mapDrawFloorMs: Math.round(lastMapBreakdown.drawFloor),
      lightMs: Math.round(lightMs),
      creatureInfoMs: Math.round(creatureInfoMs),
      foregroundMs: Math.round(foregroundMs),
      drawPoolMs: Math.round(drawPoolMs),
      timestamp: performance.now(),
    }
  }
}

export function getLastStallBreakdown(): StallBreakdown | null {
  return lastStall
}
