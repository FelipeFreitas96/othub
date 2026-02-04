/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from container.h + container.cpp (minimal for Thing.getParentContainer).
 */

import type { Item } from './Item'

export class Container {
  m_id: number = 0
  m_capacity: number = 0
  m_items: Item[] = []
  m_containerItem: Item | null = null
  m_name: string = ''
  m_hasParent: boolean = false
  m_closed: boolean = false
  m_unlocked: boolean = true
  m_hasPages: boolean = false
  m_size: number = 0
  m_firstIndex: number = 0

  getItem(slot: number): Item | null {
    return this.m_items[slot] ?? null
  }

  getItems(): Item[] {
    return this.m_items
  }

  getItemsCount(): number {
    return this.m_items.length
  }

  getId(): number {
    return this.m_id
  }

  getCapacity(): number {
    return this.m_capacity
  }

  getContainerItem(): Item | null {
    return this.m_containerItem
  }

  getName(): string {
    return this.m_name
  }

  hasParent(): boolean {
    return this.m_hasParent
  }

  isClosed(): boolean {
    return this.m_closed
  }

  isUnlocked(): boolean {
    return this.m_unlocked
  }

  hasPages(): boolean {
    return this.m_hasPages
  }

  getSize(): number {
    return this.m_size
  }

  getFirstIndex(): number {
    return this.m_firstIndex
  }
}
