/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/client/declarations.h – forward declarations and type aliases.
 */

import type { Position } from './Position'

/** Forward / stub types for classes (implemented in their own modules). */
export interface Map {}
export interface Game {}
export interface MapView {}
export interface LightView {}
export interface Tile {}
export interface Thing {}
export interface Item {}
export interface Container {}
export interface Creature {}
export interface Effect {}
export interface Missile {}
export interface AnimatedText {}
export interface StaticText {}
export interface Animator {}
export interface ThingType {}
export interface ItemType {}
export interface AttachedEffect {}
export interface AttachableObject {}
export interface Paperdoll {}
export interface ProtocolGame {}

/** UI stubs (no implementation – out of scope). */
export interface UIItem {}
export interface UIEffect {}
export interface UIMissile {}
export interface UICreature {}
export interface UIGraph {}
export interface UIMap {}
export interface UIMinimap {}
export interface UIProgressRect {}
export interface UIMapAnchorLayout {}
export interface UIPositionAnchor {}
export interface UISprite {}

/** Ptr types: in TS we use the type directly (no shared_ptr). */
export type MapViewPtr = MapView
export type LightViewPtr = LightView
export type TilePtr = Tile
export type ThingPtr = Thing
export type ItemPtr = Item
export type ContainerPtr = Container
export type CreaturePtr = Creature
export type EffectPtr = Effect
export type MissilePtr = Missile
export type AnimatedTextPtr = AnimatedText
export type StaticTextPtr = StaticText
export type ThingTypePtr = ThingType
export type ItemTypePtr = ItemType
export type AttachedEffectPtr = AttachedEffect
export type AttachableObjectPtr = AttachableObject
export type PaperdollPtr = Paperdoll
export type ProtocolGamePtr = ProtocolGame
export type UIItemPtr = UIItem
export type UIEffectPtr = UIEffect
export type UIMissilePtr = UIMissile
export type UICreaturePtr = UICreature
export type UIGraphPtr = UIGraph
export type UISpritePtr = UISprite
export type UIMapPtr = UIMap
export type UIMinimapPtr = UIMinimap
export type UIProgressRectPtr = UIProgressRect
export type UIMapAnchorLayoutPtr = UIMapAnchorLayout
export type UIPositionAnchorPtr = UIPositionAnchor

/** List types. */
export type ThingList = Thing[]
export type ThingTypeList = ThingType[]
export type ItemTypeList = ItemType[]
export type TileList = Tile[]
export type ItemVector = Item[]

/** React ref attach (replaces UIWidget attach). */
export interface AttachableReactRef {
  current: HTMLElement | null
}
