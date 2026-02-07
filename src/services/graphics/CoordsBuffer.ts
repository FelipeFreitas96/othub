/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/coordsbuffer.h + coordsbuffer.cpp + vertexarray.h
 */

import type { Rect, Point, RectF, Size } from './declarations'
import { rectLeft, rectTop, rectRight, rectBottom, rectValid } from './declarations'

/**
 * OTC: VertexArray – float buffer of x,y pairs.
 * FIX: removed pre-allocated zeros (they poisoned every CoordsBuffer with 64 degenerate vertices at origin).
 * FIX: removed +1 on right/bottom – rectRight/rectBottom already return EXCLUSIVE end (x+width, y+height).
 *      OTC's Rect::right() is INCLUSIVE (x+width-1), hence OTC adds +1; our helpers already return exclusive.
 */
class VertexArray {
  private m_buffer: number[] = []

  constructor(_size = 64) {
    // Do NOT pre-allocate with zeros; push() appends after existing data.
    this.m_buffer = []
  }

  addTriangle(a: Point, b: Point, c: Point): void {
    this.m_buffer.push(a.x, a.y, b.x, b.y, c.x, c.y)
  }

  addRect(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      left, top,
      right, top,
      left, bottom,
      left, bottom,
      right, top,
      right, bottom
    )
  }

  addRectF(rect: RectF): void {
    const left = rect.x
    const top = rect.y
    const right = rect.x + rect.width
    const bottom = rect.y + rect.height
    this.m_buffer.push(
      left, top,
      right, top,
      left, bottom,
      left, bottom,
      right, top,
      right, bottom
    )
  }

  addQuad(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      left, top,
      right, top,
      left, bottom,
      left, bottom,
      right, top,
      right, bottom
    )
  }

  addHorizontallyFlippedQuad(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      right, top,
      left, top,
      right, bottom,
      right, bottom,
      left, top,
      left, bottom
    )
  }

  addVerticallyFlippedQuad(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      left, bottom,
      right, bottom,
      left, top,
      left, top,
      right, bottom,
      right, top
    )
  }

  addUpsideDownQuad(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      left, bottom,
      right, bottom,
      left, top,
      right, top
    )
  }

  addUpsideDownRect(rect: Rect): void {
    const left = rectLeft(rect)
    const top = rectTop(rect)
    const right = rectRight(rect)
    const bottom = rectBottom(rect)
    this.m_buffer.push(
      left, bottom,
      right, bottom,
      left, bottom,
      left, top,
      right, bottom,
      right, top
    )
  }

  append(other: VertexArray): void {
    const src = other.m_buffer
    const len = src.length
    for (let i = 0; i < len; i++) this.m_buffer.push(src[i])
  }

  clear(): void {
    this.m_buffer.length = 0
  }

  vertices(): Float32Array {
    return new Float32Array(this.m_buffer)
  }

  vertexCount(): number {
    return this.m_buffer.length / 2
  }

  size(): number {
    return this.m_buffer.length
  }
}

/**
 * OTC: CoordsBuffer – vertex array + texture coord array for drawCoords.
 */
export class CoordsBuffer {
  private m_vertexArray: VertexArray
  private m_textureCoordArray: VertexArray

  constructor(size = 64) {
    this.m_vertexArray = new VertexArray(size)
    this.m_textureCoordArray = new VertexArray(size)
  }

  clear(): void {
    this.m_textureCoordArray.clear()
    this.m_vertexArray.clear()
  }

  addRect(dest: Rect): void {
    this.m_vertexArray.addRect(dest)
  }

  addRectWithSrc(dest: Rect, src: Rect): void {
    this.m_vertexArray.addRect(dest)
    if (rectValid(src)) this.m_textureCoordArray.addRect(src)
  }

  addRectF(dest: RectF, src: RectF): void {
    this.m_vertexArray.addRectF(dest)
    this.m_textureCoordArray.addRectF(src)
  }

  addQuad(dest: Rect, src: Rect): void {
    this.m_vertexArray.addQuad(dest)
    this.m_textureCoordArray.addQuad(src)
  }

  addUpsideDownQuad(dest: Rect, src: Rect): void {
    this.m_vertexArray.addUpsideDownQuad(dest)
    this.m_textureCoordArray.addQuad(src)
  }

  addHorizontallyFlippedQuad(dest: Rect, src: Rect): void {
    this.m_vertexArray.addQuad(dest)
    this.m_textureCoordArray.addHorizontallyFlippedQuad(src)
  }

  addVerticallyFlippedQuad(dest: Rect, src: Rect): void {
    this.m_vertexArray.addQuad(dest)
    this.m_textureCoordArray.addVerticallyFlippedQuad(src)
  }

  addUpsideDownRect(dest: Rect, src: Rect): void {
    this.m_vertexArray.addUpsideDownRect(dest)
    this.m_textureCoordArray.addRect(src)
  }

  addTriangle(a: Point, b: Point, c: Point): void {
    this.m_vertexArray.addTriangle(a, b, c)
  }

  /** OTC: addBoudingRect (typo preserved) */
  addBoudingRect(dest: Rect, innerLineWidth: number): void {
    const left = rectLeft(dest)
    const top = rectTop(dest)
    const right = rectRight(dest)
    const bottom = rectBottom(dest)
    const width = dest.width ?? 0
    const height = dest.height ?? 0
    const w = innerLineWidth
    this.addRect({ x: left, y: top, width: width - w, height: w })
    this.addRect({ x: right - w, y: top, width: w, height: height - w })
    this.addRect({ x: left + w, y: bottom - w, width: width - w, height: w })
    this.addRect({ x: left, y: top + w, width: w, height: height - w })
  }

  addRepeatedRects(dest: Rect, src: Rect): void {
    if (!rectValid(dest) || !rectValid(src)) return
    const destW = dest.width ?? 0
    const destH = dest.height ?? 0
    const srcW = src.width ?? 0
    const srcH = src.height ?? 0
    const destX = rectLeft(dest)
    const destY = rectTop(dest)
    for (let y = 0; y <= destH; y += srcH) {
      for (let x = 0; x <= destW; x += srcW) {
        let partialDest: Rect = { x, y, width: srcW, height: srcH }
        let partialSrc: Rect = { ...src }
        if (y + partialDest.height! > destH) {
          partialSrc.height = (partialSrc.height ?? 0) + (destH - (y + (partialDest.height ?? 0)))
          partialDest.height = destH - y
        }
        if (x + (partialDest.width ?? 0) > destW) {
          partialSrc.width = (partialSrc.width ?? 0) + (destW - (x + (partialDest.width ?? 0)))
          partialDest.width = destW - x
        }
        partialDest = { x: destX + partialDest.x!, y: destY + partialDest.y!, width: partialDest.width, height: partialDest.height }
        this.m_vertexArray.addRect(partialDest)
        this.m_textureCoordArray.addRect(partialSrc)
      }
    }
  }

  append(buffer: CoordsBuffer): void {
    this.m_vertexArray.append(buffer.m_vertexArray)
    this.m_textureCoordArray.append(buffer.m_textureCoordArray)
  }

  getVertexArray(): Float32Array {
    return this.m_vertexArray.vertices()
  }

  getTextureCoordArray(): Float32Array {
    return this.m_textureCoordArray.vertices()
  }

  getVertexCount(): number {
    return this.m_vertexArray.vertexCount()
  }

  getTextureCoordCount(): number {
    return this.m_textureCoordArray.vertexCount()
  }

  size(): number {
    return Math.max(this.m_vertexArray.size(), this.m_textureCoordArray.size())
  }
}
