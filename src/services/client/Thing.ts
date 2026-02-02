/**
 * Thing – 1:1 port of OTClient src/client/thing.h + thing.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * Base class for Creature, Item, Effect, Missile.
 */

import { DrawPool } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'
import { g_map } from './ClientMap'
import { Position } from './Position'
import { Tile } from './Tile'

export abstract class Thing {
  protected m_position: Position | null = null
  protected m_clientId: number | string = 0
  protected m_stackPos: number = -1

  // Virtual methods - subclasses can override
  setId(id: number | string) { this.m_clientId = id }
  getId(): number | string { return this.m_clientId }
  
  getPosition(): Position | null { return this.m_position }
  setPosition(pos: Position, stackPos: number = 0) { 
    this.m_position = pos
    this.m_stackPos = stackPos
  }

  getStackPos(): number { return this.m_stackPos }
  setStackPos(stackPos: number) { this.m_stackPos = stackPos }

  /** OTC thing.cpp getStackPriority(): 0=ground, 1=groundBorder, 2=onBottom, 3=onTop, 4=creature, 5=common */
  getStackPriority(): number {
    if (this.isGround()) return 0
    if (this.isGroundBorder()) return 1
    if (this.isOnBottom()) return 2
    if (this.isOnTop()) return 3
    if (this.isCreature()) return 4
    return 5
  }

  getTile(): Tile | null {
    if (!this.m_position) return null;
    return g_map.getTile(this.m_position);
  }

  // Type checks - subclasses override to return true
  isItem(): boolean { return false }
  isCreature(): boolean { return false }
  isEffect(): boolean { return false }
  isMissile(): boolean { return false }
  isNpc(): boolean { return false }
  isMonster(): boolean { return false }
  isPlayer(): boolean { return false }
  isLocalPlayer(): boolean { return false }

  // ThingType access - abstract, each subclass implements
  abstract getThingType(pipeline?: DrawPool): ThingType | null

  // Methods that delegate to ThingType (1:1 thing.cpp)
  // Note: These methods check !isCreature() because creatures never have these properties
  getElevation(): number { 
    if (this.isCreature()) return 0
    const tt = this.getThingType()
    return tt?.elevation ?? tt?.getElevation?.() ?? 0 
  }
  
  hasElevation(): boolean { 
    if (this.isCreature()) return false
    return !!this.getThingType()?.hasElevation?.() 
  }

  isGround(): boolean { 
    if (this.isCreature()) return false
    const tt = this.getThingType()
    return !!(tt?.ground ?? tt?.isGround?.()) 
  }

  isGroundBorder(): boolean { 
    if (this.isCreature()) return false
    const tt = this.getThingType()
    return !!(tt?.groundBorder ?? tt?.isGroundBorder?.()) 
  }

  isOnBottom(): boolean { 
    if (this.isCreature()) return false
    const tt = this.getThingType()
    return !!(tt?.onBottom ?? tt?.isOnBottom?.()) 
  }

  isOnTop(): boolean { 
    if (this.isCreature()) return false
    const tt = this.getThingType()
    return !!(tt?.onTop ?? tt?.isOnTop?.()) 
  }

  isFullGround(): boolean { 
    if (this.isCreature()) return false
    const tt = this.getThingType()
    return !!(tt?.fullGround ?? tt?.isFullGround?.()) 
  }

  getWidth(pipeline?: DrawPool): number { 
    const tt = this.getThingType(pipeline)
    return tt?.getWidth?.() ?? tt?.width ?? 1 
  }

  getHeight(pipeline?: DrawPool): number { 
    const tt = this.getThingType(pipeline)
    return tt?.getHeight?.() ?? tt?.height ?? 1 
  }

  /** OTC ThingType::isSingleGround() – isGround() && isSingleDimension() (size.area() == 1). */
  isSingleGround(): boolean { 
    if (this.isCreature()) return false
    return this.isGround() && this.getWidth() === 1 && this.getHeight() === 1 
  }

  /** OTC ThingType::isSingleGroundBorder() – isGroundBorder() && isSingleDimension(). */
  isSingleGroundBorder(): boolean { 
    if (this.isCreature()) return false
    return this.isGroundBorder() && this.getWidth() === 1 && this.getHeight() === 1 
  }

  isWalking(): boolean { return false }

  // Drawing - abstract, each subclass implements
  abstract draw(
    pipeline: DrawPool, 
    tileX: number, 
    tileY: number, 
    drawElevationPx: number, 
    zOff: number, 
    tileZ: number, 
    pixelOffsetX?: number, 
    pixelOffsetY?: number, 
    isWalkDraw?: boolean
  ): void

  // Optional light drawing
  drawLight?(
    pipeline: DrawPool, 
    tileX: number, 
    tileY: number, 
    drawElevationPx: number, 
    zOff: number, 
    tileZ: number, 
    offset?: { x: number, y: number }
  ): void

  // Lifecycle hooks
  onAppear() {}
  onDisappear() {}
  onPositionChange(newPos: Position, oldPos: Position) {}
}
