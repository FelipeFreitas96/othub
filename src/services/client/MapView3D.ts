/**
 * MapView3D – Tibia-like top-down oblique 3D scene: ground planes + player OBJ model.
 * Orthographic camera, ~70–80° tilt, no perspective. Middle-mouse rotates camera (yaw).
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { g_map } from './ClientMap'
import { g_player } from './LocalPlayer'
import { getThings } from '../protocol/things'
import type { Position } from './Position'
import type { Tile } from './Tile'
import type { Item } from './Item'
import type { Creature } from './Creature'

const TILE_SIZE = 1
const TILE_PIXELS = 32
const FLOOR_HEIGHT = 1
const CAMERA_DISTANCE = 18
const ORTHO_SIZE_X = 20
const ORTHO_SIZE_Z = 20
const PITCH_MIN = 0.2
const PITCH_MAX = 1.35

export interface MapView3DState {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  cameraPivot: THREE.Group
  groundGroup: THREE.Group
  blocksGroup: THREE.Group
  infoGroup: THREE.Group
  playerModel: THREE.Group | null
  cameraRotationY: number
  cameraPitch: number
  cameraZoom: number
  cameraPanOffset: { x: number; z: number }
  tileMeshCache: Map<string, THREE.Mesh>
  blocksCache: Map<string, THREE.Mesh>
  textureCache: Map<string, THREE.CanvasTexture>
}

let sharedPlayerModel: THREE.Group | null = null
let sharedPlayerModelPromise: Promise<THREE.Group | null> | null = null

function loadOutfitModel(): Promise<THREE.Group | null> {
  if (sharedPlayerModel) return Promise.resolve(sharedPlayerModel)
  if (sharedPlayerModelPromise) return sharedPlayerModelPromise
  sharedPlayerModelPromise = new Promise((resolve) => {
    const loader = new OBJLoader()
    loader.load(
      '/models/outfit.obj',
      (group) => {
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            mesh.material = new THREE.MeshLambertMaterial({
              color: 0xcccccc,
              side: THREE.DoubleSide,
            })
          }
        })
        const box = new THREE.Box3().setFromObject(group)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        group.position.sub(center)
        const scale = 1 / Math.max(size.x, size.y, size.z, 0.001)
        group.scale.setScalar(scale * 0.9)
        sharedPlayerModel = group
        resolve(group)
      },
      undefined,
      () => resolve(null)
    )
  })
  return sharedPlayerModelPromise
}

function tileKey(tx: number, ty: number, z: number): string {
  return `${tx},${ty},${z}`
}

function getGroundTextureCanvas(tile: Tile): HTMLCanvasElement | null {
  const ground = tile.getGround() as Item | null
  if (!ground) return null
  const tt = ground.getThingType?.()
  if (!tt) return null
  const things = getThings()
  if (!things?.sprites?.getCanvas) return null
  return tt.getTexture(0, things.sprites, 0, 0, 0, 0) ?? null
}

export function createMapView3D(): MapView3DState {
  const scene = new THREE.Scene()
  scene.background = null

  const camera = new THREE.OrthographicCamera(
    -ORTHO_SIZE_X / 2,
    ORTHO_SIZE_X / 2,
    ORTHO_SIZE_Z / 2,
    -ORTHO_SIZE_Z / 2,
    0.1,
    100
  )
  camera.up.set(0, 1, 0)

  const cameraPivot = new THREE.Group()
  scene.add(cameraPivot)
  camera.position.set(0, 0, CAMERA_DISTANCE)
  camera.lookAt(0, 0, 0)
  cameraPivot.add(camera)

  const groundGroup = new THREE.Group()
  scene.add(groundGroup)
  const blocksGroup = new THREE.Group()
  scene.add(blocksGroup)
  const infoGroup = new THREE.Group()
  scene.add(infoGroup)

  const ambient = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(5, 15, 10)
  scene.add(dir)

  return {
    scene,
    camera,
    cameraPivot,
    groundGroup,
    blocksGroup,
    infoGroup,
    playerModel: null,
    cameraRotationY: 0,
    cameraPitch: 0.9,
    cameraZoom: 1,
    cameraPanOffset: { x: 0, z: 0 },
    tileMeshCache: new Map(),
    blocksCache: new Map(),
    textureCache: new Map(),
  }
}

export function updateCameraFromPosition(
  state: MapView3DState,
  center: Position,
  viewportWidth: number,
  viewportHeight: number
): void {
  const cx = center.x + 0.5
  const cz = center.y + 0.5
  const cy = center.z * FLOOR_HEIGHT + 0.5
  const pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.cameraPitch))

  const pan = state.cameraPanOffset
  state.cameraPivot.position.set(cx, cy, cz)
  state.cameraPivot.rotation.y = state.cameraRotationY
  state.camera.position.set(pan.x, CAMERA_DISTANCE * Math.sin(pitch), CAMERA_DISTANCE * Math.cos(pitch) + pan.z)
  state.camera.lookAt(cx, cy, cz)

  const aspect = viewportWidth / viewportHeight
  const zoom = Math.max(0.3, Math.min(3, state.cameraZoom))
  const halfX = (ORTHO_SIZE_X / 2) / zoom
  const halfZ = (ORTHO_SIZE_Z / 2) / zoom
  if (aspect > 1) {
    state.camera.left = -halfX * aspect
    state.camera.right = halfX * aspect
    state.camera.top = halfZ
    state.camera.bottom = -halfZ
  } else {
    state.camera.left = -halfX
    state.camera.right = halfX
    state.camera.top = halfZ / aspect
    state.camera.bottom = -halfZ / aspect
  }
  state.camera.updateProjectionMatrix()
}

export function update3DGround(
  state: MapView3DState,
  visibleTiles: Array<{ z: number; tile: Tile; x: number; y: number }>,
  cameraPos: Position
): void {
  const things = getThings()
  if (!things?.sprites?.getCanvas) return

  const toRemove = new Set(state.tileMeshCache.keys())
  const planeGeom = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE)

  for (const entry of visibleTiles) {
    const { tile, z } = entry
    const pos = tile.getPosition()
    const tx = pos.x
    const ty = pos.y
    const key = tileKey(tx, ty, z)
    toRemove.delete(key)

    let mesh = state.tileMeshCache.get(key)
    const ground = tile.getGround() as Item | null
    if (!ground) continue

    const tt = ground.getThingType?.()
    if (!tt) continue
    const canvas = tt.getTexture(0, things.sprites, 0, 0, 0, 0) ?? null
    if (!canvas) continue

    const texKey = `g_${tx}_${ty}_${z}`
    let tex = state.textureCache.get(texKey)
    if (!tex) {
      tex = new THREE.CanvasTexture(canvas)
      tex.format = THREE.RGBAFormat
      tex.premultiplyAlpha = false
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      state.textureCache.set(texKey, tex)
    }

    if (!mesh) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
        alphaTest: 0.02,
      })
      mesh = new THREE.Mesh(planeGeom.clone(), mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 0
      state.groundGroup.add(mesh)
      state.tileMeshCache.set(key, mesh)
    } else {
      ;(mesh.material as THREE.MeshBasicMaterial).map = tex
    }

    const wx = tx + 0.5
    const wy = z * FLOOR_HEIGHT
    const wz = ty + 0.5
    mesh.position.set(wx, wy, wz)
  }

  for (const key of toRemove) {
    const mesh = state.tileMeshCache.get(key)
    if (mesh) {
      state.groundGroup.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      ;(mesh.geometry as THREE.BufferGeometry).dispose()
      state.tileMeshCache.delete(key)
    }
  }
}

export function update3DBlocks(
  state: MapView3DState,
  visibleTiles: Array<{ z: number; tile: Tile; x: number; y: number }>
): void {
  const things = getThings()
  if (!things?.sprites?.getCanvas) return

  const seen = new Set<string>()
  const planeGeom = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE)

  for (const entry of visibleTiles) {
    const { tile, z } = entry
    const pos = tile.getPosition()
    const tx = pos.x
    const ty = pos.y
    const thingsList = tile.getThings?.() ?? tile.m_things ?? []
    for (let stackPos = 0; stackPos < thingsList.length; stackPos++) {
      const thing = thingsList[stackPos]
      if (thing?.isCreature?.()) continue
      if (thing?.isGround?.()) continue
      const item = thing as Item
      const tt = item.getThingType?.()
      if (!tt || !tt.isNotWalkable?.()) continue

      const key = `${tx}_${ty}_${z}_${stackPos}`
      seen.add(key)

      const itemW = tt.getWidth?.() ?? 1
      const itemH = tt.getHeight?.() ?? 1

      let mesh = state.blocksCache.get(key)
      if (!mesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x6a6a6a,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        mesh = new THREE.Mesh(planeGeom.clone(), mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.renderOrder = 1
        state.blocksGroup.add(mesh)
        state.blocksCache.set(key, mesh)
      }

      mesh.scale.set(itemW, itemH, 1)
      const dispX = (tt.getDisplacementX?.() ?? tt.displacement?.x ?? 0) / TILE_PIXELS
      const dispY = (tt.getDisplacementY?.() ?? tt.displacement?.y ?? 0) / TILE_PIXELS
      const wx = tx + itemW / 2 - dispX
      const wy = z * FLOOR_HEIGHT + 0.01
      const wz = ty + itemH / 2 - dispY
      mesh.position.set(wx, wy, wz)
    }
  }

  for (const key of state.blocksCache.keys()) {
    if (seen.has(key)) continue
    const mesh = state.blocksCache.get(key)
    if (mesh) {
      state.blocksGroup.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      if (mesh.geometry?.dispose) mesh.geometry.dispose()
      state.blocksCache.delete(key)
    }
  }
}

export function update3DPlayer(state: MapView3DState): void {
  if (!g_player) return
  const pos = g_player.getPosition?.()
  if (!pos) return

  const wx = pos.x + 0.5
  const wy = pos.z * FLOOR_HEIGHT
  const wz = pos.y + 0.5

  if (state.playerModel) {
    state.playerModel.position.set(wx, wy + 0.5, wz)
    const dir = g_player.getDirection?.() ?? 2
    state.playerModel.rotation.y = directionToAngleY(dir)
  }
}

function directionToAngleY(dir: number): number {
  const d = ((dir % 4) + 4) % 4
  return (2 - d) * (Math.PI / 2)
}

export function ensurePlayerModel(state: MapView3DState): void {
  if (state.playerModel) return
  loadOutfitModel().then((group) => {
    if (!group) return
    state.playerModel = group.clone()
    state.scene.add(state.playerModel)
    update3DPlayer(state)
  })
}

const INFO_WIDTH = 64
const INFO_HEIGHT = 28
const INFO_SCALE = 0.032

function drawCreatureInfoCanvas(creature: Creature): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = INFO_WIDTH
  c.height = INFO_HEIGHT
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const name = (creature.m_name || '').trim() || 'Creature'
  const hp = Math.max(0, Math.min(100, creature.m_healthPercent ?? 100)) / 100
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, INFO_WIDTH, INFO_HEIGHT)
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = creature.m_covered ? '#606060' : (creature.m_informationColor ? `rgb(${creature.m_informationColor.r},${creature.m_informationColor.g},${creature.m_informationColor.b})` : '#fff')
  ctx.fillText(name.length > 10 ? name.slice(0, 10) + '...' : name, INFO_WIDTH / 2, 10)
  ctx.fillStyle = '#000'
  ctx.fillRect(4, 14, 56, 8)
  ctx.fillStyle = hp > 0.5 ? '#00aa00' : hp > 0.25 ? '#aa8800' : '#aa0000'
  ctx.fillRect(5, 15, 54 * hp, 6)
  return c
}

export function update3DCreatureInfo(
  state: MapView3DState,
  camera: THREE.Camera,
  center: Position,
  creatures: Iterable<Creature>
): void {
  const range = 10
  const cx = center.x
  const cy = center.y
  const cz = center.z
  const toRemove: THREE.Object3D[] = []
  state.infoGroup.children.forEach((ch) => toRemove.push(ch))
  toRemove.forEach((ch) => {
    state.infoGroup.remove(ch)
    if ((ch as THREE.Mesh).isMesh) {
      const m = ch as THREE.Mesh
      ;(m.material as THREE.Material).dispose()
      if (m.geometry?.dispose) m.geometry.dispose()
    }
  })
  const planeGeom = new THREE.PlaneGeometry(INFO_WIDTH * INFO_SCALE, INFO_HEIGHT * INFO_SCALE)
  for (const creature of creatures) {
    const pos = creature.getPosition?.()
    if (!pos || creature.isDead?.() || !creature.canBeSeen?.()) continue
    const dx = Math.abs(pos.x - cx)
    const dy = Math.abs(pos.y - cy)
    if (dx > range || dy > range) continue
    const wx = pos.x + 0.5
    const wy = pos.z * FLOOR_HEIGHT + 2
    const wz = pos.y + 0.5
    const canvas = drawCreatureInfoCanvas(creature)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(planeGeom.clone(), mat)
    mesh.position.set(wx, wy, wz)
    mesh.renderOrder = 100
    state.infoGroup.add(mesh)
    const camPos = camera.getWorldPosition(new THREE.Vector3())
    mesh.lookAt(camPos)
  }
}


export function render3DToTarget(
  state: MapView3DState,
  renderer: THREE.WebGLRenderer,
  renderTarget: THREE.WebGLRenderTarget,
  center: Position,
  visibleTiles: Array<{ z: number; tile: Tile; x: number; y: number }>,
  viewportWidth: number,
  viewportHeight: number
): void {
  updateCameraFromPosition(state, center, viewportWidth, viewportHeight)
  update3DGround(state, visibleTiles, center)
  update3DBlocks(state, visibleTiles)
  ensurePlayerModel(state)
  update3DPlayer(state)
  update3DCreatureInfo(state, state.camera, center, g_map.creatures.values())

  const prevTarget = renderer.getRenderTarget()
  const prevClear = renderer.autoClear
  const prevClearColor = renderer.getClearColor(new THREE.Color())
  const prevClearAlpha = renderer.getClearAlpha()
  renderer.autoClear = true
  renderer.setClearColor(0x000000, 0)
  renderer.setRenderTarget(renderTarget)
  renderer.clear(true, true, false)
  renderer.render(state.scene, state.camera)
  renderer.setRenderTarget(prevTarget)
  renderer.setClearColor(prevClearColor, prevClearAlpha)
  renderer.autoClear = prevClear
}
