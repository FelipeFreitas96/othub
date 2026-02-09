/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/client/outfit.h + outfit.cpp
 */

import { ThingCategory } from '../things/thingType'
import { Color } from './types'

const HSI_SI_VALUES = 7
const HSI_H_STEPS = 19

export class Outfit {
  private m_category: ThingCategory = ThingCategory.Invalid
  private m_temp: boolean = false
  private m_id: number = 0
  private m_auxId: number = 0
  private m_mount: number = 0
  private m_familiar: number = 0
  private m_wing: number = 0
  private m_aura: number = 0
  private m_effect: number = 0
  private m_shader: string = ''
  private m_head: number = 0
  private m_body: number = 0
  private m_legs: number = 0
  private m_feet: number = 0
  private m_addons: number = 0
  private m_headColor: number = Color.white
  private m_bodyColor: number = Color.white
  private m_legsColor: number = Color.white
  private m_feetColor: number = Color.white

  static getColor(color: number): number {
    if (color >= HSI_H_STEPS * HSI_SI_VALUES) {
      color = 0
    }
    let loc1 = 0
    let loc2 = 0
    let loc3 = 0
    if (color % HSI_H_STEPS !== 0) {
      loc1 = (color % HSI_H_STEPS) * 1.0 / 18.0
      loc2 = 1
      loc3 = 1
      switch (Math.floor(color / HSI_H_STEPS)) {
        case 0:
          loc2 = 0.25
          loc3 = 1.00
          break
        case 1:
          loc2 = 0.25
          loc3 = 0.75
          break
        case 2:
          loc2 = 0.50
          loc3 = 0.75
          break
        case 3:
          loc2 = 0.667
          loc3 = 0.75
          break
        case 4:
          loc2 = 1.00
          loc3 = 1.00
          break
        case 5:
          loc2 = 1.00
          loc3 = 0.75
          break
        case 6:
          loc2 = 1.00
          loc3 = 0.50
          break
        default:
          break
      }
    } else {
      loc1 = 0
      loc2 = 0
      loc3 = 1 - color / HSI_H_STEPS / HSI_SI_VALUES
    }
    if (loc3 === 0) {
      return Color.alpha
    }
    if (loc2 === 0) {
      const loc7 = Math.floor(loc3 * 255)
      return (loc7 << 16) | (loc7 << 8) | loc7
    }
    let red = 0
    let green = 0
    let blue = 0
    if (loc1 < 1.0 / 6.0) {
      red = loc3
      blue = loc3 * (1 - loc2)
      green = blue + (loc3 - blue) * 6 * loc1
    } else if (loc1 < 2.0 / 6.0) {
      green = loc3
      blue = loc3 * (1 - loc2)
      red = green - (loc3 - blue) * (6 * loc1 - 1)
    } else if (loc1 < 3.0 / 6.0) {
      green = loc3
      red = loc3 * (1 - loc2)
      blue = red + (loc3 - red) * (6 * loc1 - 2)
    } else if (loc1 < 4.0 / 6.0) {
      blue = loc3
      red = loc3 * (1 - loc2)
      green = blue - (loc3 - red) * (6 * loc1 - 3)
    } else if (loc1 < 5.0 / 6.0) {
      blue = loc3
      green = loc3 * (1 - loc2)
      red = green + (loc3 - green) * (6 * loc1 - 4)
    } else {
      red = loc3
      green = loc3 * (1 - loc2)
      blue = red - (loc3 - green) * (6 * loc1 - 5)
    }
    const r = Math.floor(red * 255)
    const g = Math.floor(green * 255)
    const b = Math.floor(blue * 255)
    return (r << 16) | (g << 8) | b
  }

  setId(id: number): void { this.m_id = id }
  setAuxId(id: number): void { this.m_auxId = id }
  setMount(mount: number): void { this.m_mount = mount }
  setFamiliar(familiar: number): void { this.m_familiar = familiar }
  setWing(wing: number): void { this.m_wing = wing }
  setAura(aura: number): void { this.m_aura = aura }
  setEffect(effect: number): void { this.m_effect = effect }
  setShader(shader: string): void { this.m_shader = shader }
  setAddons(addons: number): void { this.m_addons = addons }
  setTemp(temp: boolean): void { this.m_temp = temp }
  setCategory(category: ThingCategory): void { this.m_category = category }

  setHead(head: number): void {
    if (this.m_head === head) return
    this.m_head = head
    this.m_headColor = Outfit.getColor(head)
  }
  setBody(body: number): void {
    if (this.m_body === body) return
    this.m_body = body
    this.m_bodyColor = Outfit.getColor(body)
  }
  setLegs(legs: number): void {
    if (this.m_legs === legs) return
    this.m_legs = legs
    this.m_legsColor = Outfit.getColor(legs)
  }
  setFeet(feet: number): void {
    if (this.m_feet === feet) return
    this.m_feet = feet
    this.m_feetColor = Outfit.getColor(feet)
  }

  resetClothes(): void {
    this.setHead(0)
    this.setBody(0)
    this.setLegs(0)
    this.setFeet(0)
    this.m_mount = 0
    this.m_familiar = 0
    this.m_wing = 0
    this.m_aura = 0
    this.m_effect = 0
    this.m_shader = 'Outfit - Default'
  }

  getId(): number { return this.m_id }
  getAuxId(): number { return this.m_auxId }
  getMount(): number { return this.m_mount }
  getFamiliar(): number { return this.m_familiar }
  getWing(): number { return this.m_wing }
  getAura(): number { return this.m_aura }
  getEffect(): number { return this.m_effect }
  getShader(): string { return this.m_shader }
  getHead(): number { return this.m_head }
  getBody(): number { return this.m_body }
  getLegs(): number { return this.m_legs }
  getFeet(): number { return this.m_feet }
  getAddons(): number { return this.m_addons }
  hasMount(): boolean { return this.m_mount > 0 }
  getCategory(): ThingCategory { return this.m_category }
  isCreature(): boolean { return this.m_category === ThingCategory.Creature }
  isInvalid(): boolean { return this.m_category === ThingCategory.Invalid }
  isEffect(): boolean { return this.m_category === ThingCategory.Effect }
  isItem(): boolean { return this.m_category === ThingCategory.Item }
  isTemp(): boolean { return this.m_temp }
  getHeadColor(): number { return this.m_headColor }
  getBodyColor(): number { return this.m_bodyColor }
  getLegsColor(): number { return this.m_legsColor }
  getFeetColor(): number { return this.m_feetColor }

  equals(other: Outfit): boolean {
    return this.m_category === other.m_category &&
      this.m_id === other.m_id &&
      this.m_auxId === other.m_auxId &&
      this.m_head === other.m_head &&
      this.m_body === other.m_body &&
      this.m_legs === other.m_legs &&
      this.m_feet === other.m_feet &&
      this.m_addons === other.m_addons &&
      this.m_mount === other.m_mount &&
      this.m_familiar === other.m_familiar &&
      this.m_wing === other.m_wing &&
      this.m_aura === other.m_aura &&
      this.m_effect === other.m_effect &&
      this.m_shader === other.m_shader
  }

  notEquals(other: Outfit): boolean {
    return !this.equals(other)
  }
}
