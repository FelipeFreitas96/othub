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
import { isFeatureEnabled, getClientVersion, FEATURES } from '../protocol/features'
import { Outfit } from './types'
import type { MapPosInfo, Point, Rect } from './types'
import { Position, PositionLike, ensurePosition } from './Position'
import { Thing, type DrawDest } from './Thing'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawOrder } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'
import { g_game } from './Game'
import { DrawFlags } from '../graphics/drawFlags'

const TILE_PIXELS = 32

/** OTC SpriteMask – layer for outfit color (head/body/legs/feet). */
const SpriteMaskRed = 1
const SpriteMaskGreen = 2
const SpriteMaskBlue = 3
const SpriteMaskYellow = 4

/** OTC SkullNone / ShieldNone */
export const SkullNone = 0
export const ShieldNone = 0

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
  m_footStep: number
  m_footStepDrawn: boolean
  m_walkFinishAnimEvent: ScheduledEventHandle | null
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
  m_light: { intensity: number, color: number }
  /** OTC: m_masterId – summon owner. */
  m_masterId: number
  /** OTC: skull icon above creature (SkullNone, SkullYellow, etc.) */
  m_skull: number
  /** OTC: party/party-share icon (ShieldNone, etc.) */
  m_shield: number
  /** OTC: color for name/health bar (set from setHealthPercent) */
  m_informationColor: { r: number; g: number; b: number }
  /** OTC: draw outfit color layers (head/body/legs/feet) */
  m_drawOutfitColor: boolean
  /** OTC: texture for skull icon (canvas or null = draw placeholder) */
  m_skullTexture: HTMLCanvasElement | null
  /** OTC: texture for shield icon */
  m_shieldTexture: HTMLCanvasElement | null
  m_showShieldTexture: boolean
  /** OTC: m_jumpOffset – jump animation offset (stub). */
  m_jumpOffset: { x: number; y: number }
  /** OTC: m_bounce – bounce animation (stub). */
  m_bounce: { height: number; speed: number; minHeight: number; timer: { ticksElapsed: () => number } }
  /** OTC: m_covered – creature covered by another floor. */
  m_covered: boolean
  /** OTC: m_text – extra text below name (stub). */
  m_text: { getTextSize: () => { width: number; height: number }; drawText: (center: Point, rect: Rect) => void } | null
  /** OTC: m_emblem, m_type, m_icon (stub). */
  m_emblem: number
  m_type: number
  m_icon: number
  /** OTC: m_typingIconTexture, m_emblemTexture, m_typeTexture, m_iconTexture (stub). */
  m_typingIconTexture: HTMLCanvasElement | null
  m_emblemTexture: HTMLCanvasElement | null
  m_typeTexture: HTMLCanvasElement | null
  m_iconTexture: HTMLCanvasElement | null
  /** OTC: m_icons – atlas groups + iconEntries from protocol. */
  m_icons: { atlasGroups: { texture: any; clip: { width: number; height: number }; count: number }[]; numberText: { setText: (s: string) => void; getTextSize: () => { width: number; height: number }; draw: (rect: Rect, color: { r: number; g: number; b: number }) => void }; iconEntries?: Array<{ icon: number; category: number; count: number }> } | null
  /** OTC: m_vocation – player vocation (creatureData type 11/12/13). */
  m_vocation: number
  /** OTC: m_nameShader (stub). */
  m_nameShader: string
  /** OTC: m_widgetInformation (stub). */
  m_widgetInformation: { draw: (rect: Rect, poolType: number) => void } | null

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
      restart: function () { this.m_startTime = Date.now() },
      ticksElapsed: function () { return Date.now() - this.m_startTime }
    }
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_light = { intensity: 0, color: 215 }
    this.m_walkTurnDirection = -1 // InvalidDirection
    this.m_lastStepDirection = -1
    this.m_lastStepFromPosition = null
    this.m_lastStepToPosition = null
    this.m_walkingTile = null
    this.m_footStep = 0
    this.m_footStepDrawn = false
    this.m_walkFinishAnimEvent = null
    this.m_stepCache = {
      speed: 0,
      groundSpeed: 0,
      duration: 0,
      walkDuration: 0,
      diagonalDuration: 0,
      getDuration: function (dir: number) {
        // Simple diagonal check: 4, 5, 6, 7 are diagonal directions in OTC
        const isDiagonal = dir >= 4 && dir <= 7
        return isDiagonal ? this.diagonalDuration : this.duration
      }
    }
    this.m_footTimer = {
      m_startTime: 0,
      restart: function () { this.m_startTime = Date.now() },
      ticksElapsed: function () { return Date.now() - this.m_startTime }
    }

    this.m_allowAppearWalk = false
    this.m_cameraFollowing = false
    this.m_removed = true
    this.m_oldPosition = null
    this.m_passable = false
    this.m_position = null
    this.m_walkUpdateEvent = null
    this.m_masterId = 0
    this.m_skull = 0
    this.m_shield = 0
    this.m_informationColor = { r: 96, g: 96, b: 96 }
    this.m_drawOutfitColor = true
    this.m_skullTexture = null
    this.m_shieldTexture = null
    this.m_showShieldTexture = true
    this.m_jumpOffset = { x: 0, y: 0 }
    this.m_bounce = { height: 0, speed: 0, minHeight: 0, timer: { ticksElapsed: () => 0 } }
    this.m_covered = false
    this.m_text = null
    this.m_emblem = 0
    this.m_type = 0
    this.m_icon = 0
    this.m_typingIconTexture = null
    this.m_emblemTexture = null
    this.m_typeTexture = null
    this.m_iconTexture = null
    this.m_icons = null
    this.m_vocation = 0
    this.m_nameShader = ''
    this.m_widgetInformation = null
  }

  /** OTC: isDead() – stub. */
  isDead(): boolean {
    return (this.m_healthPercent ?? 100) <= 0
  }

  /** OTC: setCovered(). */
  setCovered(covered: boolean) {
    this.m_covered = covered
  }

  /** OTC: setVocation(uint8_t) – creatureData type 11/12/13. */
  setVocation(vocationId: number) {
    this.m_vocation = vocationId & 0xff
  }

  /** OTC: getVocation(). */
  getVocation(): number {
    return this.m_vocation
  }

  /** OTC: setIcons(vector of icon, category, count) – creatureData type 14. */
  setIcons(icons: Array<{ icon: number; category: number; count: number }>) {
    if (!this.m_icons) {
      this.m_icons = {
        atlasGroups: [],
        numberText: {
          setText: () => {},
          getTextSize: () => ({ width: 0, height: 12 }),
          draw: () => {},
        },
        iconEntries: [],
      }
    }
    this.m_icons.iconEntries = icons.slice()
  }

  /** OTC: isCovered(). */
  isCovered(): boolean {
    return this.m_covered
  }

  /** OTC: getExactSize() – stub. */
  getExactSize(): number {
    return 12
  }

  /** OTC: isNpc() – stub. */
  isNpc(): boolean {
    return false
  }

  /** OTC: isFullHealth(). */
  isFullHealth(): boolean {
    return (this.m_healthPercent ?? 100) >= 100
  }

  /** OTC: isLocalPlayer() – stub. */
  isLocalPlayer(): boolean {
    return false
  }

  /** OTC: getLocalPlayer() – stub. */
  getLocalPlayer(): Creature | null {
    return null
  }

  /** OTC: isMage() – stub. */
  isMage(): boolean {
    return false
  }

  /** OTC: getMaxManaShield() – stub. */
  getMaxManaShield(): number {
    return 0
  }

  /** OTC: getManaShield() – stub. */
  getManaShield(): number {
    return 0
  }

  /** OTC: getMaxMana() – stub. */
  getMaxMana(): number {
    return 0
  }

  /** OTC: getMana() – stub. */
  getMana(): number {
    return 0
  }

  /** OTC: getHarmony() – stub. */
  getHarmony(): number {
    return 0
  }

  /** OTC: isSerene() – stub. */
  isSerene(): boolean {
    return false
  }

  /** OTC: isMonk() – stub. */
  isMonk(): boolean {
    return false
  }

  /** OTC: getTyping() – stub. */
  getTyping(): boolean {
    return false
  }

  /** OTC: isHided() – creature hidden (stub). */
  isHided(): boolean {
    return false
  }

  /** OTC: drawAttachedEffect(originalDest, dest, nullptr, onTop) – stub. */
  drawAttachedEffect(_originalDest: any, _dest: any, _lightView: any, _onTop: boolean): void {}

  /** OTC: drawAttachedParticlesEffect(originalDest) – stub. */
  drawAttachedParticlesEffect(_originalDest: any): void {}

  /** OTC: hasShader() – creature has custom shader (stub). */
  hasShader(): boolean {
    return false
  }

  /** OTC: hasMountShader() – stub. */
  hasMountShader(): boolean {
    return false
  }

  /** OTC: outfit.isCreature() – outfit is a creature lookType. */
  isOutfitCreature(): boolean {
    const o = this.m_outfit as any
    if (o?.isItem === true || o?.isEffect === true) return false
    return (this.m_outfit?.lookType ?? 0) > 0
  }

  /** OTC: outfit.isItem() / isEffect() – stub (outfit as item/effect). */
  isOutfitItem(): boolean {
    return (this.m_outfit as any)?.isItem === true
  }

  isOutfitEffect(): boolean {
    return (this.m_outfit as any)?.isEffect === true
  }

  /** OTC: getDisplacement() – from ThingType. */
  getDisplacement(): { x: number; y: number } {
    const ct = this.getThingType(undefined)
    const d = ct?.getDisplacement?.() ?? ct?.m_displacement ?? { x: 0, y: 0 }
    return { x: d.x ?? 0, y: d.y ?? 0 }
  }

  /** OTC: Color::white. */
  static readonly COLOR_WHITE = { r: 255, g: 255, b: 255 }

  /** OTC: getCurrentAnimationPhase(forMount = false) – same as calculateAnimationPhase. */
  getCurrentAnimationPhase(forMount = false): number {
    return this.calculateAnimationPhase(true)
  }

  /** OTC: m_outfit.getHeadColor() – Color from outfit head (8bit → rgb stub). */
  getOutfitHeadColor(): { r: number; g: number; b: number } {
    const v = this.m_outfit?.head ?? 255
    return { r: v, g: v, b: v }
  }
  getOutfitBodyColor(): { r: number; g: number; b: number } {
    const v = this.m_outfit?.body ?? 255
    return { r: v, g: v, b: v }
  }
  getOutfitLegsColor(): { r: number; g: number; b: number } {
    const v = this.m_outfit?.legs ?? 255
    return { r: v, g: v, b: v }
  }
  getOutfitFeetColor(): { r: number; g: number; b: number } {
    const v = this.m_outfit?.feet ?? 255
    return { r: v, g: v, b: v }
  }

  setMasterId(masterId: number) { this.m_masterId = masterId }
  getMasterId() { return this.m_masterId }

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

  /** OTC: setHealthPercent – updates m_healthPercent and m_informationColor (COLOR1..COLOR6) */
  setHealthPercent(healthPercent: number) {
    if (this.m_healthPercent === healthPercent) return
    const COLOR1 = { r: 0x00, g: 0xBC, b: 0x00 }
    const COLOR2 = { r: 0x50, g: 0xA1, b: 0x50 }
    const COLOR3 = { r: 0xA1, g: 0xA1, b: 0x00 }
    const COLOR4 = { r: 0xBF, g: 0x0A, b: 0x0A }
    const COLOR5 = { r: 0x91, g: 0x0F, b: 0x0F }
    const COLOR6 = { r: 0x85, g: 0x0C, b: 0x0C }
    if (healthPercent > 92) this.m_informationColor = COLOR1
    else if (healthPercent > 60) this.m_informationColor = COLOR2
    else if (healthPercent > 30) this.m_informationColor = COLOR3
    else if (healthPercent > 8) this.m_informationColor = COLOR4
    else if (healthPercent > 3) this.m_informationColor = COLOR5
    else this.m_informationColor = COLOR6
    this.m_healthPercent = healthPercent
  }
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

  setSkull(skull: number) { this.m_skull = skull }
  getSkull(): number { return this.m_skull ?? 0 }
  setShield(shield: number) { this.m_shield = shield }
  getShield(): number { return this.m_shield ?? 0 }
  /** OTC: setSkullTexture(filename) – we accept canvas or null; app can load image and set canvas */
  setSkullTexture(src: HTMLCanvasElement | string | null) {
    if (src instanceof HTMLCanvasElement) this.m_skullTexture = src
    else this.m_skullTexture = null
  }
  /** OTC: setShieldTexture(filename, blink) – we accept canvas or null */
  setShieldTexture(src: HTMLCanvasElement | string | null, _blink = false) {
    if (src instanceof HTMLCanvasElement) this.m_shieldTexture = src
    else this.m_shieldTexture = null
    this.m_showShieldTexture = true
  }
  setDrawOutfitColor(draw: boolean) { this.m_drawOutfitColor = draw }
  isDrawingOutfitColor() { return this.m_drawOutfitColor }
  setEmblem(emblem: number) { /* m_emblem = emblem */ }
  setLight(light: { intensity: number, color: number }) { this.m_light = { ...light } }
  getLight(): { intensity: number, color: number } {
    const light = this.m_light
    if (light.intensity === 0) return { intensity: 2, color: 215 }
    if (light.color === 0 || light.color > 215) return { ...light, color: 215 }
    return { ...light }
  }
  setPassable(passable: boolean) { this.m_passable = passable }
  isPassable(): boolean { return this.m_passable }

  /** OTC: Creature::setType(uint8_t) – creature type (CreatureType opcode 149). */
  setType(type: number) { this.m_type = type & 0xff }
  getType(): number { return this.m_type }

  /** OTC: Creature::showStaticSquare(color) – marks opcode 147 permanent. Stub. */
  showStaticSquare(_color?: number) { /* UI can draw square */ }
  /** OTC: Creature::hideStaticSquare() – marks opcode 147. Stub. */
  hideStaticSquare() { /* UI can clear square */ }
  /** OTC: Creature::addTimedSquare(markType) – marks opcode 147 timed. Stub. */
  addTimedSquare(_markType?: number) { /* UI can draw timed square */ }

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

  // OTC: void Creature::walk(const Position& oldPos, const Position& newPos) – creature.cpp L496-524
  // OTC: does NOT set m_position; map sets it via addThing when server sends parseCreatureMove. So thing->getTile() stays correct for removeThing.
  walk(oldPos: Position, newPos: Position) {
    if (oldPos.x === newPos.x && oldPos.y === newPos.y && oldPos.z === newPos.z) return;

    this.m_lastStepDirection = Creature.getDirectionFromPosition(oldPos, newPos);
    this.m_lastStepFromPosition = oldPos.clone();
    this.m_lastStepToPosition = newPos.clone();

    this.setDirection(this.m_lastStepDirection);
    // OTC: do not set m_position here; addThing(thing, newPos) in parseCreatureMove sets it

    this.m_walking = true;
    this.m_walkTimer.restart();
    this.m_walkedPixels = 0;

    this.m_walkTurnDirection = DirInvalid;
    
    if (this.m_walkFinishAnimEvent) {
      this.m_walkFinishAnimEvent.cancel();
      this.m_walkFinishAnimEvent = null;
    }

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

    // OTC creature.cpp L776: g_dispatcher.scheduleEvent([this]{ nextWalkUpdate(); }, getStepDuration(true) / Otc::TILE_PIXELS)
    const interval = Math.max(1, Math.floor(this.getStepDuration(true) / TILE_PIXELS));
    this.m_walkUpdateEvent = g_dispatcher.scheduleEvent(action, interval);
  }

  // OTC: void Creature::updateWalk() – creature.cpp L779-801
  updateWalk() {
    const stepDuration = this.getStepDuration(true);
    const totalPixelsWalked = stepDuration
      ? Math.min(Math.floor((this.m_walkTimer.ticksElapsed() * TILE_PIXELS) / stepDuration), TILE_PIXELS)
      : 0;

    this.m_walkedPixels = Math.max(this.m_walkedPixels, totalPixelsWalked);

    this.updateWalkAnimation();
    this.updateWalkOffset(this.m_walkedPixels);
    this.updateWalkingTile();

    if (this.m_walking && this.m_walkTimer.ticksElapsed() >= this.getStepDuration()) {
      this.terminateWalk();
    }
  }

  // OTC: void Creature::terminateWalk() – creature.cpp L803-831 (OTC does not cancel m_walkFinishAnimEvent here)
  terminateWalk() {
    if (this.m_walkUpdateEvent) {
      this.m_walkUpdateEvent.cancel();
      this.m_walkUpdateEvent = null;
    }

    if (this.m_walkTurnDirection !== DirInvalid) {
      this.setDirection(this.m_walkTurnDirection);
      this.m_walkTurnDirection = DirInvalid;
    }

    if (this.m_walkingTile) {
      this.m_walkingTile.removeWalkingCreature(this);
      this.m_walkingTile = null;
    }

    this.m_walking = false;
    this.m_walkedPixels = 0;
    this.m_walkOffset = { x: 0, y: 0 };
    this.m_walkAnimationPhase = 0;

    this.m_walkFinishAnimEvent = g_dispatcher.scheduleEvent(() => {
      this.m_walkAnimationPhase = 0;
      this.m_walkFinishAnimEvent = null;
    }, g_game.getServerBeat());
  }

  // OTC: void Creature::updateWalkOffset(int totalPixelsWalked) – creature.cpp L706-717
  updateWalkOffset(totalPixelsWalked: number) {
    const spriteSize = TILE_PIXELS;
    this.m_walkOffset = { x: 0, y: 0 };
    const dir = this.m_direction;

    if (dir === DirNorth || dir === DirNorthEast || dir === DirNorthWest)
      this.m_walkOffset.y = spriteSize - totalPixelsWalked;
    else if (dir === DirSouth || dir === DirSouthEast || dir === DirSouthWest)
      this.m_walkOffset.y = totalPixelsWalked - spriteSize;

    if (dir === DirEast || dir === DirNorthEast || dir === DirSouthEast)
      this.m_walkOffset.x = totalPixelsWalked - spriteSize;
    else if (dir === DirWest || dir === DirNorthWest || dir === DirSouthWest)
      this.m_walkOffset.x = spriteSize - totalPixelsWalked;
  }

  // OTC: void Creature::updateWalkingTile() – creature.cpp L720-757
  // virtualCreatureRect = Rect(TILE_PIXELS + (m_walkOffset.x - getDisplacementX()), ...); find tile containing bottomRight()
  updateWalkingTile() {
    if (!this.m_position) return;

    const T = TILE_PIXELS;
    const left = T + (this.m_walkOffset.x - this.getDisplacementX());
    const top = T + (this.m_walkOffset.y - this.getDisplacementY());
    const creatureRight = left + T;
    const creatureBottom = top + T;

    let newWalkingTile: Tile | null = null;
    for (let xi = -1; xi <= 1 && !newWalkingTile; xi++) {
      for (let yi = -1; yi <= 1 && !newWalkingTile; yi++) {
        const tileLeft = (xi + 1) * T;
        const tileTop = (yi + 1) * T;
        const tileRight = tileLeft + T;
        const tileBottom = tileTop + T;
        if (creatureRight >= tileLeft && creatureRight <= tileRight && creatureBottom >= tileTop && creatureBottom <= tileBottom) {
          const pos = new Position(this.m_position.x + xi, this.m_position.y + yi, this.m_position.z);
          newWalkingTile = g_map.getOrCreateTile(pos);
        }
      }
    }

    if (newWalkingTile === this.m_walkingTile) return;
    if (this.m_walkingTile) {
      this.m_walkingTile.removeWalkingCreature(this);
    }

    if (newWalkingTile) {
      newWalkingTile.addWalkingCreature(this);
      if (this.isCameraFollowing()) {
        g_map.notificateTileUpdate(newWalkingTile.m_position, this, 'clean');
      }
    }

    this.m_walkingTile = newWalkingTile;
  }

  /**
   * OTC: void Creature::updateWalkAnimation() – creature.cpp L665-703
   * looktype has no animations → return; diagonal walk longer than animation → m_walkAnimationPhase = 0; else advance phase by footDelay.
   */
  updateWalkAnimation() {
    if (this.m_outfit?.lookType == null && !this.m_outfit?.lookTypeEx) return

    const types = getThings()?.types
    let footAnimPhases = (this.m_outfit as any)?.mount
      ? (types?.getCreature?.((this.m_outfit as any).mount)?.getAnimationPhases?.() ?? this.getAnimationPhases())
      : this.getAnimationPhases()

    if (!isFeatureEnabled(FEATURES.GameEnhancedAnimations) && footAnimPhases > 2) {
      footAnimPhases--
    }

    if (footAnimPhases === 0) return

    // diagonal walk is taking longer than the animation, thus why don't animate continuously
    if (this.m_walkTimer.ticksElapsed() < this.getStepDuration() && this.m_walkedPixels === TILE_PIXELS) {
      this.m_walkAnimationPhase = 0
      return
    }

    let minFootDelay = 20
    const maxFootDelay = footAnimPhases > 2 ? 80 : 205
    let footAnimDelay = footAnimPhases

    if (isFeatureEnabled(FEATURES.GameEnhancedAnimations) && footAnimPhases > 2) {
      minFootDelay += 10
      if (footAnimDelay > 1) footAnimDelay /= 1.5
    }

    const walkSpeed = (this as any).m_walkingAnimationSpeed > 0
      ? (this as any).m_walkingAnimationSpeed
      : this.m_stepCache.getDuration(this.m_lastStepDirection)
    const footDelay = Math.max(minFootDelay, Math.min(maxFootDelay, Math.floor(walkSpeed / footAnimDelay)))

    if (this.m_footTimer.ticksElapsed() >= footDelay) {
      if (this.m_walkAnimationPhase === footAnimPhases) this.m_walkAnimationPhase = 1
      else this.m_walkAnimationPhase++
      this.m_footTimer.restart()
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

  // OTC: int Creature::getStepDuration(bool ignoreDiagonal, Otc::Direction dir) – creature.cpp L531-581
  getStepDuration(ignoreDiagonal = false, dir: number = DirInvalid) {
    if (this.m_speed < 1) return 0;

    const serverBeat = 50;
    let groundSpeed = 150;
    let tilePos: Position | null = dir === DirInvalid && this.m_lastStepToPosition
      ? this.m_lastStepToPosition
      : this.m_position
        ? Creature.positionTranslatedToDirection(this.m_position, dir)
        : null;
    if (!tilePos || !g_map.getTile(tilePos)) tilePos = this.m_position ?? this.m_lastStepToPosition ?? null;
    const tile = tilePos ? g_map.getTile(tilePos) : null;
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

  onWalking() { }

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
      this.m_oldPosition = null;
    } else if (this.m_oldPosition && this.m_position &&
      (this.m_oldPosition.x !== this.m_position.x || this.m_oldPosition.y !== this.m_position.y)) {
      this.stopWalk();
      this.m_oldPosition = null;
    }
  }

  allowAppearWalk() { this.m_allowAppearWalk = true; }
  /** Set before removeThing so onAppear can run walk(oldPos, newPos). OTC: set when creature is removed for move. */
  setOldPosition(pos: Position | null) { this.m_oldPosition = pos ? pos.clone() : null; }

  /** OTC: getWalkOffset() */
  getWalkOffset() {
    return this.m_walkOffset
  }

  // OTC: Point Creature::getDrawOffset() – creature.cpp L519-529
  getDrawOffset(): { x: number, y: number } {
    let drawOffsetX = 0;
    let drawOffsetY = 0;
    if (this.m_walking) {
      if (this.m_walkingTile) {
        const elev = this.m_walkingTile.getDrawElevation();
        drawOffsetX -= elev;
        drawOffsetY -= elev;
      }
      drawOffsetX += this.m_walkOffset.x;
      drawOffsetY += this.m_walkOffset.y;
    } else {
      const tile = this.getTile();
      if (tile) {
        const elev = tile.getDrawElevation();
        drawOffsetX -= elev;
        drawOffsetY -= elev;
      }
    }
    return { x: drawOffsetX, y: drawOffsetY };
  }

  getDisplacementX(): number {
    if (this.m_outfit?.lookTypeEx) return 8;
    const tt = this.getThingType() ?? getThings()?.types?.getCreature?.(this.m_outfit?.lookType ?? 0) ?? null;
    return tt?.getDisplacementX?.() ?? 0;
  }

  getDisplacementY(): number {
    if (this.m_outfit?.lookTypeEx) return 8;
    const tt = this.getThingType() ?? getThings()?.types?.getCreature?.(this.m_outfit?.lookType ?? 0) ?? null;
    return tt?.getDisplacementY?.() ?? 0;
  }

  /** OTC: getLastStepFromPosition() / getLastStepToPosition() */
  getLastStepFromPosition() {
    return this.m_lastStepFromPosition ? { ...this.m_lastStepFromPosition } : null
  }

  getLastStepToPosition() {
    return this.m_lastStepToPosition ? { ...this.m_lastStepToPosition } : null
  }

  /** OTC: equivalente ao creature type (outfit). Retorna o ThingType do lookType. */
  getThingType(): ThingType | null {
    const types = getThings()?.types
    const lookType = this.m_outfit?.lookType ?? 0
    return lookType && types ? types.getCreature(lookType) : null
  }

  /** OTC: Thing::getNumPatternY() – from ThingType (addons). */
  getNumPatternY(): number {
    const ct = this.getThingType(undefined)
    return ct?.getNumPatternY?.() ?? 1
  }

  /** OTC: number of layers for outfit color drawing (head/body/legs/feet). */
  getLayers(): number {
    const ct = this.getThingType(undefined)
    return (ct as any)?.m_layers ?? ct?.getLayers?.() ?? 1
  }

  /** OTC: outfit has mount (lookTypeEx). */
  hasMount(): boolean {
    return !!(this.m_outfit as any)?.lookTypeEx
  }

  /** OTC: getMountThingType() – ThingType for mount. */
  getMountThingType(): ThingType | null {
    const mountId = (this.m_outfit as any)?.lookTypeEx
    if (!mountId) return null
    const types = getThings()?.types
    return types?.getCreature?.(mountId) ?? null
  }

  // Override Thing methods
  override isCreature() { return true }
  /** OTC: m_walking – criatura está em passo de movimento. */
  override isWalking() { return !!this.m_walking }

  /**
   * OTC: Creature::draw(dest, drawThings, lightView) – calls internalDraw(_dest). drawFlags passed for marked/highlight.
   */
  override draw(dest: DrawDest, drawThings: boolean, lightView?: import('./LightView').LightView | null) {
    if (!g_drawPool.isValid()) return
    const ct = this.getThingType()
    if (!ct) return
    if (this.m_walking && !(dest.isWalkDraw ?? false)) return

    const TILE_PIXELS = 32
    const internalDest = {
      tileX: (dest.x ?? 0) / TILE_PIXELS,
      tileY: (dest.y ?? 0) / TILE_PIXELS,
      drawElevationPx: dest.drawElevationPx ?? 0,
      zOff: 0,
      tileZ: dest.tileZ ?? 0,
      pixelOffsetX: dest.pixelOffsetX ?? 0,
      pixelOffsetY: dest.pixelOffsetY ?? 0,
      frameGroupIndex: ct.getFrameGroupForDraw(this.m_walking),
    }

    const color = Creature.COLOR_WHITE
    this.internalDraw(internalDest, color)
    this.m_footStepDrawn = true
  }

  /**
   * OTC: void Creature::internalDraw(Point dest, const Color& color) – 1:1 structure.
   * Jump/bounce → replaceColorShader → isHided → paperdolls → outfit.isCreature (mount + drawCreature) or item/effect → resetShader / drawAttachedEffect.
   */
  internalDraw(dest: any, color: { r: number; g: number; b: number }) {
    const originalDest = { ...dest, pixelOffsetX: dest.pixelOffsetX ?? 0, pixelOffsetY: dest.pixelOffsetY ?? 0 }
    let d = { ...dest, pixelOffsetX: dest.pixelOffsetX ?? 0, pixelOffsetY: dest.pixelOffsetY ?? 0 }

    const scaleFactor = g_drawPool.getScaleFactor()
    if (this.m_jumpOffset && (this.m_jumpOffset.x !== 0 || this.m_jumpOffset.y !== 0)) {
      d.pixelOffsetX -= Math.round(this.m_jumpOffset.x * scaleFactor)
      d.pixelOffsetY -= Math.round(this.m_jumpOffset.y * scaleFactor)
    } else if (this.m_bounce.height > 0 && this.m_bounce.speed > 0) {
      const minH = this.m_bounce.minHeight * scaleFactor
      const height = this.m_bounce.height * scaleFactor
      const t = this.m_bounce.timer.ticksElapsed() / (this.m_bounce.speed / 100)
      const bounceOff = height - Math.abs(height - (t % (height * 2)))
      d.pixelOffsetY -= minH + bounceOff
    }

    const white = Creature.COLOR_WHITE
    const replaceColorShader = color.r !== white.r || color.g !== white.g || color.b !== white.b
    if (replaceColorShader) {
      g_drawPool.setShaderProgram(null)
    } else {
      this.drawAttachedEffect(originalDest, d, null, false)
    }

    if (!this.isHided()) {
      const animationPhase = this.getCurrentAnimationPhase(false)
      const ct = this.getThingType()
      if (!ct) return
      const dir = this.m_walking ? this.m_direction : (this.m_direction ?? 0)
      const px = ct.patternX ?? ct.m_numPatternX ?? 1
      const xPattern = px >= 4 ? (dir & 3) : 0
      const zPattern = this.hasMount() ? Math.min(1, ((ct as any).m_numPatternZ ?? 1) - 1) : 0
      const numY = this.getNumPatternY()

      if (this.isOutfitCreature()) {
        if (this.hasMount()) {
          const mountType = this.getMountThingType()
          if (mountType) {
            const mountDisp = mountType.getDisplacement?.() ?? mountType.m_displacement ?? { x: 0, y: 0 }
            d.pixelOffsetX -= (mountDisp.x ?? 0) * scaleFactor
            d.pixelOffsetY -= (mountDisp.y ?? 0) * scaleFactor
            if (!replaceColorShader && this.hasMountShader()) {
              g_drawPool.setShaderProgram(null)
            }
            const mountPhase = this.getCurrentAnimationPhase(true)
            mountType.draw(d, 0, xPattern, 0, 0, mountPhase, color, true, null)
            const myDisp = this.getDisplacement()
            d.pixelOffsetX += (myDisp.x ?? 0) * scaleFactor
            d.pixelOffsetY += (myDisp.y ?? 0) * scaleFactor
          }
        }

        const useFramebuffer = !replaceColorShader && this.hasShader() && false
        const drawCreature = (destPt: any) => {
          for (let yPattern = 0; yPattern < numY; yPattern++) {
            if (yPattern > 0 && !((this.m_outfit?.addons ?? 0) & (1 << (yPattern - 1)))) continue
            if (!replaceColorShader && this.hasShader()) {
              g_drawPool.setShaderProgram(null)
            }
            ct.draw(destPt, 0, xPattern, yPattern, zPattern, animationPhase, color, true, null)
            if (this.m_drawOutfitColor && !replaceColorShader && this.getLayers() > 1) {
              g_drawPool.setCompositionMode(1)
              ct.draw(destPt, SpriteMaskYellow, xPattern, yPattern, zPattern, animationPhase, this.getOutfitHeadColor(), true, null)
              ct.draw(destPt, SpriteMaskRed, xPattern, yPattern, zPattern, animationPhase, this.getOutfitBodyColor(), true, null)
              ct.draw(destPt, SpriteMaskGreen, xPattern, yPattern, zPattern, animationPhase, this.getOutfitLegsColor(), true, null)
              ct.draw(destPt, SpriteMaskBlue, xPattern, yPattern, zPattern, animationPhase, this.getOutfitFeetColor(), true, null)
              g_drawPool.resetCompositionMode()
            }
          }
        }

        if (useFramebuffer) {
          g_drawPool.bindFrameBuffer(null as any)
          drawCreature(d)
          g_drawPool.releaseFrameBuffer()
          g_drawPool.resetShaderProgram()
        } else {
          drawCreature(d)
        }
      } else {
        const thingType = this.getThingType()
        if (thingType) {
          let animationPhases = thingType.getAnimationPhases?.() ?? thingType.m_animationPhases ?? 1
          let animateTicks = 100
          if (this.isOutfitEffect()) {
            animationPhases = Math.max(1, animationPhases - 2)
            animateTicks = 100
          }
          let phase = 0
          if (animationPhases > 1) {
            const ms = typeof performance !== 'undefined' ? performance.now() : Date.now()
            phase = Math.floor((ms / animateTicks) % animationPhases)
          }
          if (this.isOutfitEffect()) phase = Math.min(phase + 1, animationPhases)
          if (!replaceColorShader && this.hasShader()) g_drawPool.setShaderProgram(null)
          const disp = this.getDisplacement()
          const itemDest = { ...d, pixelOffsetX: d.pixelOffsetX - (disp.x ?? 0) * scaleFactor, pixelOffsetY: d.pixelOffsetY - (disp.y ?? 0) * scaleFactor }
          thingType.draw(itemDest, 0, 0, 0, 0, phase, color, true, null)
        }
      }
    }

    if (replaceColorShader) {
      g_drawPool.resetShaderProgram()
    } else {
      this.drawAttachedEffect(originalDest, d, null, true)
      this.drawAttachedParticlesEffect(originalDest)
    }
  }

  /**
   * OTC: Creature::drawInformation(const MapPosInfo& mapRect, const Point& dest, const int drawFlags)
   * 1:1 port – same order, same logic; stubs where needed.
   */
  drawInformation(mapRect: MapPosInfo, dest: Point, drawFlags: number) {
    const pool = g_drawPool
    if (!pool.isValid()) return
    const DEFAULT_COLOR = { r: 96, g: 96, b: 96 }
    const NPC_COLOR = { r: 0x66, g: 0xcc, b: 0xff }

    if (this.isDead() || !this.canBeSeen() || !(drawFlags & DrawFlags.DrawCreatureInfo) || !mapRect.isInRange(this.getPosition()!)) return

    if ((g_game as any).isDrawingInformationByWidget?.() ?? false) {
      if (this.m_widgetInformation) this.m_widgetInformation.draw(mapRect.rect, 1)
      return
    }

    const displacementX = isFeatureEnabled('GameNegativeOffset') ? 0 : this.getDisplacementX()
    const displacementY = isFeatureEnabled('GameNegativeOffset') ? 0 : this.getDisplacementY()

    const parentRect = mapRect.rect
    const creatureOffset = { x: 16 - displacementX + this.getDrawOffset().x, y: -displacementY - 2 + this.getDrawOffset().y }

    let p = { x: dest.x - mapRect.drawOffset.x, y: dest.y - mapRect.drawOffset.y }
    const jump = this.m_jumpOffset ?? { x: 0, y: 0 }
    p = {
      x: p.x + (creatureOffset.x - Math.round(jump.x)) * mapRect.scaleFactor,
      y: p.y + (creatureOffset.y - Math.round(jump.y)) * mapRect.scaleFactor,
    }
    p.x *= mapRect.horizontalStretchFactor
    p.y *= mapRect.verticalStretchFactor
    p.x += parentRect.x
    p.y += parentRect.y

    let fillColor = DEFAULT_COLOR
    if (!this.isCovered()) {
      if (isFeatureEnabled('GameBlueNpcNameColor') && this.isNpc() && this.isFullHealth()) fillColor = NPC_COLOR
      else fillColor = this.m_informationColor ?? DEFAULT_COLOR
    }

    const nameSize = this._getNameTextSize()
    const cropSizeText = (g_game as any).isAdjustCreatureInformationBasedCropSize?.() ? this.getExactSize() : 12
    const cropSizeBackGround = (g_game as any).isAdjustCreatureInformationBasedCropSize?.() ? cropSizeText - nameSize.height : 0

    const DEFAULT_DISPLAY_DENSITY = 1
    const isScaled = (g_game as any).getCreatureInformationScale?.() !== DEFAULT_DISPLAY_DENSITY
    if (isScaled) {
      const scale = (g_game as any).getCreatureInformationScale?.() ?? 1
      p = { x: p.x * scale, y: p.y * scale }
    }

    let backgroundRect = { x: p.x - 15.5, y: p.y - cropSizeBackGround, width: 31, height: 4 }
    let textRect = { x: p.x - nameSize.width / 2, y: p.y - cropSizeText, width: nameSize.width, height: nameSize.height }

    const minNameBarSpacing = 2
    let currentSpacing = backgroundRect.y - (textRect.y + textRect.height)
    if (currentSpacing < minNameBarSpacing) {
      backgroundRect = { ...backgroundRect, y: textRect.y + textRect.height + minNameBarSpacing }
    }

    if (!isScaled) {
      backgroundRect = this._bindRect(backgroundRect, parentRect)
      textRect = this._bindRect(textRect, parentRect)
    }

    let offset = 12 * mapRect.scaleFactor
    if (this.isLocalPlayer()) offset *= 2 * mapRect.scaleFactor

    if (textRect.y <= parentRect.y) backgroundRect = { ...backgroundRect, y: textRect.y + offset }
    if (backgroundRect.y + backgroundRect.height >= parentRect.y + parentRect.height) textRect = { ...textRect, y: backgroundRect.y - textRect.height }

    let healthRect = { x: backgroundRect.x + 1, y: backgroundRect.y + 1, width: (this.m_healthPercent ?? 100) / 100 * 29, height: backgroundRect.height - 2 }
    let barsRect = { ...backgroundRect }

    g_drawPool.beginCreatureInfo(p, mapRect)

    if ((drawFlags & DrawFlags.DrawBars) && (getClientVersion() >= 1100 ? !this.isNpc() : true)) {
      g_drawPool.addFilledRect(backgroundRect, { r: 0, g: 0, b: 0 })
      g_drawPool.addFilledRect(healthRect, fillColor)

      if ((drawFlags & DrawFlags.DrawManaBar) && this.isLocalPlayer()) {
        const player = this.getLocalPlayer()
        if (player?.isMage?.() && (player.getMaxManaShield?.() ?? 0) > 0) {
          barsRect = { ...barsRect, y: barsRect.y + barsRect.height }
          g_drawPool.addFilledRect(barsRect, { r: 0, g: 0, b: 0 })
          const maxManaShield = player.getMaxManaShield?.() ?? 1
          const manaShieldRect = { x: barsRect.x + 1, y: barsRect.y + 1, width: (maxManaShield ? (player.getManaShield?.() ?? 0) / maxManaShield : 1) * 29, height: barsRect.height - 2 }
          g_drawPool.addFilledRect(manaShieldRect, { r: 0xFF, g: 0x69, b: 0xB4 })
        }
        barsRect = { ...barsRect, y: barsRect.y + barsRect.height }
        g_drawPool.addFilledRect(barsRect, { r: 0, g: 0, b: 0 })
        const maxMana = player?.getMaxMana?.() ?? 1
        const manaRect = { x: barsRect.x + 1, y: barsRect.y + 1, width: (maxMana ? (player?.getMana?.() ?? 0) / maxMana : 1) * 29, height: barsRect.height - 2 }
        g_drawPool.addFilledRect(manaRect, { r: 0, g: 0, b: 255 })
      }
      backgroundRect = { ...barsRect }
    }

    if ((drawFlags & DrawFlags.DrawHarmony) && this.isLocalPlayer() && isFeatureEnabled('GameVocationMonk')) {
      const player = this.getLocalPlayer()
      if (player?.isMonk?.()) {
        backgroundRect = { ...backgroundRect, y: backgroundRect.y + backgroundRect.height }
        g_drawPool.addFilledRect(backgroundRect, { r: 0, g: 0, b: 0 })

        for (let i = 0; i < 5; i++) {
          const subBarRect = { x: backgroundRect.x + 1 + i * 6, y: backgroundRect.y + 1, width: 5, height: backgroundRect.height - 2 }
          const subBarColor = i < (player.getHarmony?.() ?? 0) ? { r: 0xFF, g: 0x98, b: 0x54 } : { r: 64, g: 64, b: 64 }
          g_drawPool.addFilledRect(subBarRect, subBarColor)
        }

        backgroundRect = { ...backgroundRect, y: backgroundRect.y + backgroundRect.height }
        const sereneBackgroundRect = { x: backgroundRect.x + (backgroundRect.width / 2) - (11 / 2) - 1, y: backgroundRect.y, width: 11 + 2, height: backgroundRect.height - 2 + 2 }
        g_drawPool.addFilledRect(sereneBackgroundRect, { r: 0, g: 0, b: 0 })
        
        const sereneColor = player.isSerene?.() ? { r: 0xD4, g: 0x37, b: 0xFF } : { r: 64, g: 64, b: 64 }
        const sereneSubBarRect = { x: sereneBackgroundRect.x + 1, y: sereneBackgroundRect.y + 1, width: 11, height: backgroundRect.height - 2 }
        g_drawPool.addFilledRect(sereneSubBarRect, sereneColor)
      }
    }

    g_drawPool.setDrawOrder(DrawOrder.SECOND)

    if (drawFlags & DrawFlags.DrawNames) {
    g_drawPool.setShaderProgram?.(this.m_nameShader ? (globalThis as any).g_shaders?.getShader?.(this.m_nameShader) : null)
      this._drawName(textRect, fillColor)
      g_drawPool.resetShaderProgram?.()
      if (this.m_text) {
        const extraTextSize = this.m_text.getTextSize()
        const extraTextRect = { x: p.x - extraTextSize.width / 2, y: p.y + 15, width: extraTextSize.width, height: extraTextSize.height }
        this.m_text.drawText({ x: extraTextRect.x + extraTextRect.width / 2, y: extraTextRect.y + extraTextRect.height / 2 }, extraTextRect)
      }
    }

    if (this.m_skull !== SkullNone && this.m_skullTexture)
      g_drawPool.addTexturedPos(this.m_skullTexture as any, backgroundRect.x + 15.5 + 12, backgroundRect.y + 5)
    if (this.m_shield !== ShieldNone && this.m_shieldTexture && this.m_showShieldTexture)
      g_drawPool.addTexturedPos(this.m_shieldTexture as any, backgroundRect.x + 15.5, backgroundRect.y + 5)
    if ((this as any).m_emblem !== 0 && this.m_emblemTexture)
      g_drawPool.addTexturedPos(this.m_emblemTexture as any, backgroundRect.x + 15.5 + 12, backgroundRect.y + 16)
    if ((this as any).m_type !== 0 && this.m_typeTexture)
      g_drawPool.addTexturedPos(this.m_typeTexture as any, backgroundRect.x + 15.5 + 12 + 12, backgroundRect.y + 16)
    if ((this as any).m_icon !== 0 && this.m_iconTexture)
      g_drawPool.addTexturedPos(this.m_iconTexture as any, backgroundRect.x + 15.5 + 12, backgroundRect.y + 5)
    if ((g_game as any).drawTyping?.() && this.getTyping() && this.m_typingIconTexture)
      g_drawPool.addTexturedPos(this.m_typingIconTexture as any, p.x + (nameSize.width / 2) + 2, textRect.y - 4)
    if (getClientVersion() >= 1281 && this.m_icons?.atlasGroups?.length) {
      for (let iconOffset = 0; iconOffset < this.m_icons!.atlasGroups.length; iconOffset++) {
        const iconTex = this.m_icons!.atlasGroups[iconOffset]
        if (!iconTex.texture) continue
        const destRect = { x: backgroundRect.x + 15.5 + 12, y: backgroundRect.y + 5 + iconOffset * 14, width: iconTex.clip?.width ?? 12, height: iconTex.clip?.height ?? 12 }
        g_drawPool.addTexturedRect?.(destRect, iconTex.texture, iconTex.clip)
        if (iconTex.count > 0) {
          this.m_icons!.numberText.setText(String(iconTex.count))
          const textSize = this.m_icons!.numberText.getTextSize()
          const numberRect = { x: destRect.x + destRect.width + 2, y: destRect.y + (destRect.height - textSize.height) / 2, width: textSize.width, height: textSize.height }
          this.m_icons!.numberText.draw(numberRect, { r: 255, g: 255, b: 255 })
        }
      }
    }

    g_drawPool.endCreatureInfo()
    g_drawPool.resetDrawOrder()
  }

  private _getNameTextSize(): { width: number; height: number } {
    const name = (this.m_name || '').trim() || 'Creature'
    return { width: Math.min(200, name.length * 7), height: 12 }
  }

  private _drawName(textRect: Rect, fillColor: { r: number; g: number; b: number }) {
    g_drawPool.addCreatureInfoText((this.m_name || '').trim() || 'Creature', textRect, fillColor)
  }

  private _bindRect(rect: Rect, parentRect: Rect): Rect {
    return {
      x: Math.max(parentRect.x, Math.min(parentRect.x + parentRect.width - rect.width, rect.x)),
      y: Math.max(parentRect.y, Math.min(parentRect.y + parentRect.height - rect.height, rect.y)),
      width: rect.width,
      height: rect.height,
    }
  }

  calculateAnimationPhase(animate?: boolean) {
    const ct = this.getThingType()
    const phases = ct ? ct.getPhasesForDraw(this.m_walking) : 1
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
