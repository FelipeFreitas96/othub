/**
 * Creature – 1:1 port of OTClient src/client/creature.h + creature.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * OTC: walk(), stopWalk(), terminateWalk(), nextWalkUpdate(), updateWalk(), updateWalkOffset(), updateWalkingTile(), updateWalkAnimation(), onAppear(), onWalking().
 * Types: OTC usa g_things (ThingTypeManager) global; aqui importamos g_things.
 */

import { Tile } from './Tile'
import { getThings } from '../protocol/things'
import { g_map } from './ClientMap'
import { g_dispatcher, type ScheduledEventHandle } from '../framework/EventDispatcher'
import { isFeatureEnabled, getClientVersion } from '../protocol/features'
import { Outfit } from './types'
import { Position, PositionLike, ensurePosition } from './Position'
import { Thing } from './Thing'
import { DrawPool } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'

const TILE_PIXELS = 32

// OTC Otc::Direction (otclient/src/client/const.h)
export const DirInvalid = -1
export const DirNorth = 0
export const DirEast = 1
export const DirSouth = 2
export const DirWest = 3
export const DirNorthEast = 4
export const DirSouthEast = 5
export const DirSouthWest = 6
export const DirNorthWest = 7

export interface CreatureData {
  id?: number | string
  creatureId?: number | string
  name?: string
  health?: number
  direction?: number
  outfit?: Outfit
  speed?: number
  baseSpeed?: number
  light?: { intensity: number, color: number }
  skull?: number
  shield?: number
  emblem?: number
  unpass?: number
}

/** Ref set by MapView before g_dispatcher.poll() so Creature can read outfit phases during updateWalkAnimation. */
let g_creatureThingsRef: { current?: { types?: { getCreature: (id: number) => { getAnimationPhases?: () => number } | null } } } | null = null

export class Creature extends Thing {
  /** OTC: Creature::speedA, speedB, speedC – setados em parseLogin quando GameNewSpeedLaw. */
  static speedA = 0
  static speedB = 0
  static speedC = 0

  /** Set by MapView before poll() so getAnimationPhases() can use outfit ThingType (fixes walk animation flicker). */
  static setThingsRef(ref: typeof g_creatureThingsRef) {
    g_creatureThingsRef = ref ?? null
  }

  m_id: number | string
  m_name: string
  m_healthPercent: number
  m_direction: number
  m_outfit: Outfit
  m_speed: number
  m_baseSpeed: number
  m_walking: boolean
  m_walkOffsetX: number = 0
  m_walkOffsetY: number = 0
  m_walkOffset: { x: number, y: number } = { x: 0, y: 0 }
  m_walkTimer: {
    m_startTime: number,
    restart: () => void,
    ticksElapsed: () => number
  }
  m_walkedPixels: number
  m_walkAnimationPhase: number
  m_walkTurnDirection: number
  m_lastStepDirection: number
  m_lastStepFromPosition: Position | null
  m_lastStepToPosition: Position | null
  m_walkingTile: Tile | null
  m_stepCache: {
    speed: number,
    groundSpeed: number,
    duration: number,
    walkDuration: number,
    diagonalDuration: number,
    getDuration: (dir: number) => number
  }
  m_footTimer: {
    m_startTime: number,
    restart: () => void,
    ticksElapsed: () => number
  }
  m_allowAppearWalk: boolean
  m_cameraFollowing: boolean
  m_removed: boolean
  m_oldPosition: Position | null
  // m_position inherited from Thing
  m_walkUpdateEvent: ScheduledEventHandle | null
  m_passable: boolean

  constructor(data: CreatureData) {
    super()
    this.m_id = data.id ?? data.creatureId ?? 0
    this.m_name = data.name ?? ''
    this.m_healthPercent = typeof data.health === 'number' ? data.health : 101
    this.m_direction = data.direction ?? 2 // South
    this.m_outfit = data.outfit ?? { lookType: 0 }
    this.m_speed = data.speed ?? 0
    this.m_baseSpeed = data.baseSpeed ?? 0
    
    // Walk related (OTC)
    this.m_walking = false
    this.m_walkOffset = { x: 0, y: 0 }
    this.m_walkTimer = {
      m_startTime: 0,
      restart: function() { this.m_startTime = Date.now() },
      ticksElapsed: function() { return Date.now() - this.m_startTime }
    }
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_walkTurnDirection = -1 // InvalidDirection
    this.m_lastStepDirection = -1
    this.m_lastStepFromPosition = null
    this.m_lastStepToPosition = null
    this.m_walkingTile = null
    this.m_stepCache = {
      speed: 0,
      groundSpeed: 0,
      duration: 0,
      walkDuration: 0,
      diagonalDuration: 0,
      getDuration: function(dir: number) {
        // Simple diagonal check: 4, 5, 6, 7 are diagonal directions in OTC
        const isDiagonal = dir >= 4 && dir <= 7
        return isDiagonal ? this.diagonalDuration : this.duration
      }
    }
    this.m_footTimer = {
      m_startTime: 0,
      restart: function() { this.m_startTime = Date.now() },
      ticksElapsed: function() { return Date.now() - this.m_startTime }
    }

    this.m_allowAppearWalk = false
    this.m_cameraFollowing = false
    this.m_removed = true
    this.m_oldPosition = null
    this.m_passable = false
    this.m_position = null
    this.m_walkUpdateEvent = null
  }

  static hasSpeedFormula() { return Creature.speedA !== 0 && Creature.speedB !== 0 && Creature.speedC !== 0; }

  // Override Thing.getId() to return the creature's unique ID
  override getId(): number | string { return this.m_id }
  override setId(id: number | string) { this.m_id = id }

  setDirection(direction: number) {
    if (direction === -1) return;
    this.m_direction = direction;
  }
  getDirection() { return this.m_direction; }

  setSpeed(speed: number) {
    if (speed === this.m_speed) return;
    this.m_speed = speed;
    if (this.m_walking) this.nextWalkUpdate();
  }
  getSpeed() { return this.m_speed; }

  setBaseSpeed(baseSpeed: number) { this.m_baseSpeed = baseSpeed; }
  getBaseSpeed() { return this.m_baseSpeed; }

  setHealthPercent(healthPercent: number) { this.m_healthPercent = healthPercent; }
  getHealthPercent() { return this.m_healthPercent; }

  setOutfit(outfit: Outfit) { this.m_outfit = outfit; }
  getOutfit() { return this.m_outfit; }

  override getPosition() { return this.m_position }
  override setPosition(pos: Position) { this.m_position = pos }

  setCameraFollowing(v: boolean) { this.m_cameraFollowing = v; }
  isCameraFollowing() { return this.m_cameraFollowing; }

  // 1:1 creature.cpp setters
  setName(name: string) { this.m_name = name; }
  getName() { return this.m_name; }
  
  setSkull(skull: number) { /* m_skull = skull */ }
  setShield(shield: number) { /* m_shield = shield */ }
  setEmblem(emblem: number) { /* m_emblem = emblem */ }
  setLight(light: { intensity: number, color: number }) { /* m_light = light */ }
  setPassable(passable: boolean) { this.m_passable = passable }
  isPassable(): boolean { return this.m_passable }
  
  /** OTC: Creature::canBeSeen() – creature is visible */
  canBeSeen(): boolean {
    // Creature can be seen if it exists and has valid outfit
    return this.m_outfit?.lookType != null || this.m_outfit?.lookTypeEx != null
  }

  onCreate() { /* Called when creature is created */ }

  getWalkTicksElapsed() { return this.m_walkTimer.ticksElapsed(); }

  // OTC: void Creature::turn(const Otc::Direction direction)
  turn(direction: number) {
    if (this.m_walking) {
      this.m_walkTurnDirection = direction;
      return;
    }
    this.setDirection(direction);
  }

  // OTC: void Creature::walk(const Position& oldPos, const Position& newPos)
  // creature.cpp L496-524
  walk(oldPos: Position, newPos: Position) {
    if (oldPos.x === newPos.x && oldPos.y === newPos.y && oldPos.z === newPos.z) return;

    // If already walking to the SAME destination, don't restart the walk
    // This prevents the server confirmation from resetting an ongoing walk
    if (this.m_walking && this.m_lastStepToPosition) {
      const sameDestination = this.m_lastStepToPosition.x === newPos.x && 
          this.m_lastStepToPosition.y === newPos.y && 
          this.m_lastStepToPosition.z === newPos.z;
      
      if (sameDestination) {
        return; // Already walking to this position, don't restart
      }
    }

    // If already walking to a DIFFERENT position, complete current walk instantly
    if (this.m_walking) {
      if (this.m_walkUpdateEvent) {
        this.m_walkUpdateEvent.cancel();
        this.m_walkUpdateEvent = null;
      }
      if (this.m_walkingTile) {
        this.m_walkingTile.removeWalkingCreature(this);
        this.m_walkingTile = null;
      }
      // Reset walk state - the new walk starts fresh from current position
      this.m_walkedPixels = 0;
      this.m_walkOffset = { x: 0, y: 0 };
      this.m_walking = false;
    }

    // Get walk direction
    this.m_lastStepDirection = Creature.getDirectionFromPosition(oldPos, newPos);
    this.m_lastStepFromPosition = oldPos.clone();
    this.m_lastStepToPosition = newPos.clone();

    // OTC: Set creature position to DESTINATION at walk start
    // The walkOffset will visually show the creature coming FROM oldPos
    // This is critical for correct animation on subsequent steps
    this.m_position = this.m_lastStepToPosition.clone();

    // Set current walking direction
    this.setDirection(this.m_lastStepDirection);

    // Starts counting walk
    this.m_walking = true;
    this.m_walkTimer.restart();
    this.m_walkedPixels = 0;
    this.m_footTimer.restart();

    // No direction need to be changed when the walk ends
    this.m_walkTurnDirection = DirInvalid;

    // OTC: m_walkFinishAnimEvent cancel
    // (handled by m_walkUpdateEvent cleanup above)

    // IMPORTANT: Calculate walkOffset immediately so first render shows correct position
    // This ensures the creature appears at the visual origin, not the destination
    this.updateWalkOffset(0);
    this.updateWalkingTile();

    // Starts updating walk - schedules continuous updates
    this.nextWalkUpdate();
  }

  // OTC: void Creature::stopWalk()
  stopWalk() {
    if (!this.m_walking) return;
    this.terminateWalk();
  }

  // OTC: void Creature::nextWalkUpdate()
  // creature.cpp L759-776
  nextWalkUpdate() {
    if (this.m_walkUpdateEvent) {
      this.m_walkUpdateEvent.cancel();
      this.m_walkUpdateEvent = null;
    }

    this.updateWalk();
    this.onWalking();

    if (!this.m_walking) return;

    const self = this;
    const action = () => {
      self.m_walkUpdateEvent = null;
      self.nextWalkUpdate();
    };

    // OTC creature.cpp L776: isCameraFollowing() ? g_dispatcher.addEvent(action) : g_dispatcher.scheduleEvent(action, walkDuration)
    if (this.isCameraFollowing()) {
      g_dispatcher.addEvent(action);
    } else {
      const interval = Math.max(this.m_stepCache.walkDuration || 16, 16);
      this.m_walkUpdateEvent = g_dispatcher.scheduleEvent(action, interval);
    }
  }

  // OTC: void Creature::updateWalk()
  // creature.cpp L779-801
  updateWalk() {
    const spriteSize = TILE_PIXELS;
    const stepDuration = this.getStepDuration(true);
    
    // Use default step duration if speed is 0 (fallback)
    const effectiveDuration = stepDuration > 0 ? stepDuration : 200;
    const walkTicksPerPixel = effectiveDuration / spriteSize;
    
    const totalPixelsWalked = Math.min(
      Math.floor(this.m_walkTimer.ticksElapsed() / walkTicksPerPixel),
      spriteSize
    );

    // Needed for paralyze effect - never decrease walked pixels
    this.m_walkedPixels = Math.max(this.m_walkedPixels, totalPixelsWalked);

    const oldWalkOffset = { ...this.m_walkOffset };

    this.updateWalkAnimation();
    this.updateWalkOffset(this.m_walkedPixels);
    this.updateWalkingTile();

    // Notify camera of walk offset change
    if (this.isCameraFollowing() && (oldWalkOffset.x !== this.m_walkOffset.x || oldWalkOffset.y !== this.m_walkOffset.y)) {
      if (g_map?.notificateCameraMove) {
        g_map.notificateCameraMove(this.m_walkOffset);
      }
    }

    // Walk complete
    if (this.m_walkedPixels === spriteSize) {
      this.terminateWalk();
    }
  }

  // OTC: void Creature::terminateWalk()
  // creature.cpp L803-831
  terminateWalk() {
    // Remove any scheduled walk update
    if (this.m_walkUpdateEvent) {
      this.m_walkUpdateEvent.cancel();
      this.m_walkUpdateEvent = null;
    }

    // Now the walk has ended, do any scheduled turn
    if (this.m_walkTurnDirection !== DirInvalid) {
      this.setDirection(this.m_walkTurnDirection);
      this.m_walkTurnDirection = DirInvalid;
    }

    if (this.m_walkingTile) {
      this.m_walkingTile.removeWalkingCreature(this);
      this.m_walkingTile = null;
    }

    this.m_walkedPixels = 0;
    this.m_walkOffset = { x: 0, y: 0 };
    this.m_walking = false;

    // OTC: m_walkFinishAnimEvent = g_dispatcher.scheduleEvent - reset animation after server beat
    g_dispatcher.scheduleEvent(() => {
      this.m_walkAnimationPhase = 0;
    }, 50); // Server beat delay
    
    // Notify map that walk terminated
    if (g_map.notificateWalkTerminated) {
      g_map.notificateWalkTerminated(this);
    }
  }

  // OTC: void Creature::updateWalkOffset(const uint8_t totalPixelsWalked)
  // creature.cpp L706-717
  updateWalkOffset(totalPixelsWalked: number) {
    const spriteSize = TILE_PIXELS;
    this.m_walkOffset = { x: 0, y: 0 };
    const dir = this.m_direction;

    // North, NorthEast, NorthWest -> y offset positive (creature coming from south)
    if (dir === DirNorth || dir === DirNorthEast || dir === DirNorthWest)
      this.m_walkOffset.y = spriteSize - totalPixelsWalked;
    // South, SouthEast, SouthWest -> y offset negative (creature coming from north)
    else if (dir === DirSouth || dir === DirSouthEast || dir === DirSouthWest)
      this.m_walkOffset.y = totalPixelsWalked - spriteSize;

    // East, NorthEast, SouthEast -> x offset negative (creature coming from west)
    if (dir === DirEast || dir === DirNorthEast || dir === DirSouthEast)
      this.m_walkOffset.x = totalPixelsWalked - spriteSize;
    // West, NorthWest, SouthWest -> x offset positive (creature coming from east)
    else if (dir === DirWest || dir === DirNorthWest || dir === DirSouthWest)
      this.m_walkOffset.x = spriteSize - totalPixelsWalked;
  }

  // OTC: void Creature::updateWalkingTile()
  // creature.cpp L720-757
  // Determines which tile the creature should be drawn on based on walk offset
  // The creature is added to the tile where it is VISUALLY located during the walk
  updateWalkingTile() {
    if (!this.m_position) return;
    
    const spriteSize = TILE_PIXELS;
    
    // Calculate which tile the creature is visually on based on walkOffset
    // walkOffset is in Tibia pixels, positive X = creature is to the right of destination
    // positive Y = creature is below destination (Tibia Y increases down)
    let offsetTileX = 0;
    let offsetTileY = 0;
    
    // If walkOffset.x > 0, creature is visually to the right (coming from east)
    // If walkOffset.x < 0, creature is visually to the left (coming from west)
    if (this.m_walkOffset.x > spriteSize / 2) offsetTileX = 1;
    else if (this.m_walkOffset.x < -spriteSize / 2) offsetTileX = -1;
    
    // If walkOffset.y > 0, creature is visually below (coming from south in Tibia coords)
    // If walkOffset.y < 0, creature is visually above (coming from north in Tibia coords)
    if (this.m_walkOffset.y > spriteSize / 2) offsetTileY = 1;
    else if (this.m_walkOffset.y < -spriteSize / 2) offsetTileY = -1;
    
    const visualPos = new Position(
      this.m_position.x + offsetTileX,
      this.m_position.y + offsetTileY,
      this.m_position.z
    );
    
    const newWalkingTile = g_map.getOrCreateTile(visualPos);

    if (newWalkingTile === this.m_walkingTile) return;

    if (this.m_walkingTile) {
      this.m_walkingTile.removeWalkingCreature(this);
    }

    if (newWalkingTile) {
      newWalkingTile.addWalkingCreature(this);
    }

    this.m_walkingTile = newWalkingTile;
  }

  // OTC: void Creature::updateWalkAnimation()
  // creature.cpp L665-703 – use outfit phases and 0-based cycle to avoid flicker
  updateWalkAnimation() {
    const footAnimPhases = this.getAnimationPhases();
    if (footAnimPhases <= 0) return;

    // Diagonal walk is taking longer than the animation
    if (this.m_walkTimer.ticksElapsed() < this.getStepDuration() && this.m_walkedPixels === TILE_PIXELS) {
      this.m_walkAnimationPhase = 0;
      return;
    }

    const minFootDelay = 20;
    const maxFootDelay = footAnimPhases > 2 ? 80 : 205;
    let footAnimDelay = footAnimPhases;
    if (footAnimDelay > 1) footAnimDelay = Math.floor(footAnimDelay / 1.5);

    const walkSpeed = this.m_stepCache.getDuration(this.m_lastStepDirection);
    const footDelay = Math.max(minFootDelay, Math.min(walkSpeed / footAnimDelay, maxFootDelay));

    if (this.m_footTimer.ticksElapsed() >= footDelay) {
      this.m_walkAnimationPhase = (this.m_walkAnimationPhase + 1) % footAnimPhases;
      this.m_footTimer.restart();
    }
  }
  
  /** Get animation phases for current outfit (OTC: from g_things / ThingType when available). */
  getAnimationPhases(): number {
    const lookType = this.m_outfit?.lookType ?? 0
    if (!lookType) return 4
    const types = getThings().types
    const ct = types.getCreature(lookType)
    const phases = ct?.getAnimationPhases?.()
    return typeof phases === 'number' && phases > 0 ? phases : 4
  }

  // OTC: uint16_t Creature::getStepDuration(const bool ignoreDiagonal, const Otc::Direction dir)
  getStepDuration(ignoreDiagonal = false) {
    if (this.m_speed < 1) return 0;

    const serverBeat = 50; // Default
    let groundSpeed = 150;
    const tile = g_map.getTile(this.m_position!);
    if (tile) groundSpeed = tile.getGroundSpeed();

    if (groundSpeed !== this.m_stepCache.groundSpeed || this.m_speed !== this.m_stepCache.speed) {
      this.m_stepCache.speed = this.m_speed;
      this.m_stepCache.groundSpeed = groundSpeed;

      let stepDuration = 1000 * groundSpeed;
      if (Creature.hasSpeedFormula()) {
        const speed = this.m_speed * 2;
        let calculatedStepSpeed = 1;
        if (speed > -Creature.speedB) {
          calculatedStepSpeed = Math.max(1, Math.floor((Creature.speedA * Math.log((speed / 2) + Creature.speedB) + Creature.speedC) + 0.5));
        }
        stepDuration /= calculatedStepSpeed;
      } else {
        stepDuration /= this.m_speed;
      }

      // OTC: stepDuration = ((stepDuration + serverBeat - 1) / serverBeat) * serverBeat;
      stepDuration = Math.floor((stepDuration + serverBeat - 1) / serverBeat) * serverBeat;

      this.m_stepCache.duration = stepDuration;
      this.m_stepCache.walkDuration = Math.min(Math.floor(stepDuration / 32), 16); // 32 = spriteSize, 16 = FPS60
      
      // Diagonal walk speed factor
      const diagonalFactor = 3; // Default for newer clients
      this.m_stepCache.diagonalDuration = stepDuration * diagonalFactor;
    }

    let duration = ignoreDiagonal ? this.m_stepCache.duration : this.m_stepCache.getDuration(this.m_lastStepDirection);
    return duration;
  }

  // OTC: static Otc::Direction Position::getDirectionFromPosition(const Position& toPos)
  static getDirectionFromPosition(fromPos: Position, toPos: Position) {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;

    if (dx === 0 && dy < 0) return DirNorth;
    if (dx === 0 && dy > 0) return DirSouth;
    if (dx > 0 && dy === 0) return DirEast;
    if (dx < 0 && dy === 0) return DirWest;
    if (dx > 0 && dy < 0) return DirNorthEast;
    if (dx < 0 && dy < 0) return DirNorthWest;
    if (dx > 0 && dy > 0) return DirSouthEast;
    if (dx < 0 && dy > 0) return DirSouthWest;
    return DirSouth; // Default
  }

  // OTC: Position Position::translatedToDirection(Otc::Direction direction)
  static positionTranslatedToDirection(pos: Position, direction: number): Position {
    const newPos = pos.clone();
    switch (direction) {
      case DirNorth: newPos.y--; break;
      case DirEast: newPos.x++; break;
      case DirSouth: newPos.y++; break;
      case DirWest: newPos.x--; break;
      case DirNorthEast: newPos.x++; newPos.y--; break;
      case DirSouthEast: newPos.x++; newPos.y++; break;
      case DirSouthWest: newPos.x--; newPos.y++; break;
      case DirNorthWest: newPos.x--; newPos.y--; break;
    }
    return newPos;
  }

  onWalking() {}

  override onAppear() {
    if (this.m_removed) {
      this.stopWalk();
      this.m_removed = false;
    } else if (this.m_oldPosition && this.m_position && 
               Math.abs(this.m_oldPosition.x - this.m_position.x) <= 1 && 
               Math.abs(this.m_oldPosition.y - this.m_position.y) <= 1 && 
               this.m_allowAppearWalk) {
      this.m_allowAppearWalk = false;
      this.walk(this.m_oldPosition, this.m_position);
    } else if (this.m_oldPosition && this.m_position && 
               (this.m_oldPosition.x !== this.m_position.x || this.m_oldPosition.y !== this.m_position.y)) {
      this.stopWalk();
    }
  }

  allowAppearWalk() { this.m_allowAppearWalk = true; }

  /** OTC: getWalkOffset() */
  getWalkOffset() {
    return this.m_walkOffset
  }

  /** OTC: getLastStepFromPosition() / getLastStepToPosition() */
  getLastStepFromPosition() {
    return this.m_lastStepFromPosition ? { ...this.m_lastStepFromPosition } : null
  }

  getLastStepToPosition() {
    return this.m_lastStepToPosition ? { ...this.m_lastStepToPosition } : null
  }

  /** OTC: equivalente ao creature type (outfit). Retorna o ThingType do lookType. */
  getThingType(pipeline?: DrawPool): ThingType | null {
    const types = pipeline?.thingsRef?.current?.types
    const lookType = this.m_outfit?.lookType ?? 0
    return lookType && types ? types.getCreature(lookType) : null
  }

  // Override Thing methods
  override isCreature() { return true }
  /** OTC: m_walking – criatura está em passo de movimento. */
  override isWalking() { return !!this.m_walking }

  /**
   * OTC: Creature::draw(dest, scaleFactor, animate, lightView) → getThingType()->draw(dest, 0, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView).
   * pixelOffsetX/Y: offset de walk em pixels (OTC: dest + animationOffset).
   * isWalkDraw: indica se esta chamada vem da lista de walkingCreatures (true) ou dos m_things estáticos (false/undefined)
   */
  override draw(pipeline: DrawPool, tileX: number, tileY: number, drawElevationPx: number, zOff: number, tileZ: number, pixelOffsetX = 0, pixelOffsetY = 0, isWalkDraw = false) {
    const ct = this.getThingType(pipeline)
    if (!ct) return
    const things = pipeline.thingsRef?.current
    if (!things?.types) return
    
    // Se a criatura está andando e NÃO estamos sendo chamados da lista de walkingCreatures,
    // não desenha (ela será desenhada pelo código de walking).
    // OTClient: criaturas em walk são desenhadas apenas via m_walkingCreatures, não via m_things.
    if (this.m_walking && !isWalkDraw) return

    const dest = { 
      tileX, 
      tileY, 
      drawElevationPx, 
      zOff, 
      tileZ, 
      pixelOffsetX, 
      pixelOffsetY 
    }
    const dir = this.m_walking ? this.m_direction : (this.m_direction ?? 0)
    const px = ct.patternX ?? ct.m_numPatternX ?? 1
    const xPattern = px >= 4 ? (dir & 3) : 0
    const yPattern = 0
    const zPattern = 0
    const animationPhase = this.calculateAnimationPhase(pipeline, true)
    ct.draw(pipeline, dest, 0, xPattern, yPattern, zPattern, animationPhase, null, true, null)
  }

  calculateAnimationPhase(pipeline: DrawPool, animate: boolean) {
    const ct = this.getThingType(pipeline)
    const phases = ct?.getAnimationPhases?.() ?? ct?.phases ?? 1
    if (phases <= 1) return 0
    if (this.m_walking) {
      return Math.min(this.m_walkAnimationPhase, phases - 1)
    }
    if (!animate) return 0
    if (!ct?.isAnimateAlways?.()) return 0
    const ms = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const cycleMs = 1000
    const ticksPerPhase = cycleMs / phases
    return Math.floor((ms % cycleMs) / ticksPerPhase) % phases
  }
}
