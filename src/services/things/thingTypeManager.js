/**
 * ThingTypeManager – 1:1 port of OTClient src/client/thingtypemanager.h + thingtypemanager.cpp
 * Copyright (c) 2010-2020 OTClient; ported to JS for this project.
 */

import { FileStream } from './fileStream.js'
import { ThingCategory, ThingType } from './thingType.js'

export class ThingTypeManager {
  constructor() {
    this.init()
  }

  init() {
    this.m_nullThingType = new ThingType()
    this.m_datLoaded = false
    this.m_xmlLoaded = false
    this.m_otbLoaded = false
    this.m_datSignature = 0
    this.m_contentRevision = 0
    this.m_otbMinorVersion = 0
    this.m_otbMajorVersion = 0
    this.m_thingTypes = [[this.m_nullThingType], [this.m_nullThingType], [this.m_nullThingType], [this.m_nullThingType]]
  }

  terminate() {
    this.m_thingTypes = [[], [], [], []]
    this.m_nullThingType = null
    this.m_datLoaded = false
    this.m_xmlLoaded = false
    this.m_otbLoaded = false
    this.m_datSignature = 0
    this.m_contentRevision = 0
  }

  getNullThingType() { return this.m_nullThingType }
  getDatSignature() { return this.m_datSignature >>> 0 }
  getContentRevision() { return this.m_contentRevision >>> 0 }
  isDatLoaded() { return !!this.m_datLoaded }
  isXmlLoaded() { return !!this.m_xmlLoaded }
  isOtbLoaded() { return !!this.m_otbLoaded }
  isValidDatId(id, category) { return id >= 1 && id < (this.m_thingTypes[category]?.length ?? 0) }

  getThingType(id, category) {
    if (category >= 4 || id >= (this.m_thingTypes[category]?.length ?? 0)) {
      return this.m_nullThingType
    }
    return this.m_thingTypes[category][id] ?? this.m_nullThingType
  }

  getItem(clientId) { return this.getThingType(clientId, ThingCategory.Item) }
  getCreature(clientId) { return this.getThingType(clientId, ThingCategory.Creature) }
  getEffect(clientId) { return this.getThingType(clientId, ThingCategory.Effect) }
  getMissile(clientId) { return this.getThingType(clientId, ThingCategory.Missile) }

  get types() { return this }
  get datSignature() { return this.m_datSignature }
  get counts() { return this.m_thingTypes.map((v) => Math.max(0, (v?.length || 0) - 1)) }

  loadDat(arrayBuffer) {
    const fin = new FileStream(arrayBuffer)
    this.m_datLoaded = false
    this.m_datSignature = 0
    this.m_contentRevision = 0

    this.m_datSignature = fin.u32()
    this.m_contentRevision = this.m_datSignature & 0xffff

    for (let c = 0; c < 4; c++) {
      const count = fin.u16() + 1
      this.m_thingTypes[c] = Array.from({ length: count }, () => this.m_nullThingType)
    }

    for (let category = 0; category < 4; category++) {
      const firstId = category === ThingCategory.Item ? 100 : 1
      for (let id = firstId; id < this.m_thingTypes[category].length; id++) {
        const type = new ThingType()
        type.unserialize(id, category, fin)
        this.m_thingTypes[category][id] = type
      }
    }

    this.m_datLoaded = true
  }

  loadOtml() { throw new Error('ThingTypeManager.loadOtml is not implemented') }
  loadOtb() { throw new Error('ThingTypeManager.loadOtb is not implemented') }
  loadXml() { throw new Error('ThingTypeManager.loadXml is not implemented') }
  saveDat() { throw new Error('ThingTypeManager.saveDat is not implemented') }
}

export const g_things = new ThingTypeManager()
