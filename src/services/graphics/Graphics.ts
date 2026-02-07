/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/graphics.h + graphics.cpp
 * OTC: viewport / window size lives here; setViewport is called by the platform.
 */

export interface Size {
  width: number
  height: number
}

/** OTC: Graphics – viewport (window) size. setViewport is NOT on Painter. */
class Graphics {
  private m_viewport: Size = { width: 0, height: 0 }

  /** OTC: setViewport(width, height) */
  setViewport(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.m_viewport = { width, height }
  }

  /** OTC: getViewport() – used by DrawPoolManager.draw() */
  getViewport(): Size {
    return { ...this.m_viewport }
  }
}

export const g_graphics = new Graphics()
