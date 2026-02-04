/**
 * Client – port of OTClient src/client/client.h (draw-related state).
 * getEffectAlpha/setEffectAlpha and getMissileAlpha/setMissileAlpha come from here, not from DrawPool.
 */

class Client {
  /** OTC: m_effectAlpha – used in Effect::draw via g_client.getEffectAlpha() */
  private m_effectAlpha = 1
  /** OTC: m_missileAlpha */
  private m_missileAlpha = 1

  getEffectAlpha(): number {
    return this.m_effectAlpha
  }

  setEffectAlpha(v: number): void {
    this.m_effectAlpha = v
  }

  getMissileAlpha(): number {
    return this.m_missileAlpha
  }

  setMissileAlpha(v: number): void {
    this.m_missileAlpha = v
  }
}

export const g_client = new Client()
