/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/client/animator.h + animator.cpp
 */

import { Timer } from './types'

export enum AnimationPhase {
  AnimPhaseAutomatic = -1,
  AnimPhaseRandom = 254,
  AnimPhaseAsync = 255,
}

export enum AnimationDirection {
  AnimDirForward = 0,
  AnimDirBackward = 1,
}

/** Stub for FileStream (framework) */
export interface FileStreamLike {
  getU8(): number
  get32(): number
  get8(): number
  getU32(): number
  addU8(v: number): void
  add32(v: number): void
  add8(v: number): void
  addU32(v: number): void
}

/** Stub for appearances::SpriteAnimation (protobuf) */
export interface SpriteAnimationLike {
  sprite_phase_size(): number
  synchronized(): boolean
  loop_count(): number
  default_start_phase(): number
  sprite_phase(): Array<{ duration_min(): number; duration_max(): number }>
}

function clockMillis(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export class Animator {
  private m_startPhase: number = 0
  private m_loopCount: number = 0
  private m_currentLoop: number = 0
  private m_phase: number = 0
  private m_minDuration: number = 0
  private m_currentDuration: number = 0
  private m_animationPhases: number = 0
  private m_isComplete: boolean = false
  private m_async: boolean = false
  private m_phaseDurations: Array<[number, number]> = []
  private m_currentDirection: AnimationDirection = AnimationDirection.AnimDirForward
  private m_lastPhaseTicks: number = 0

  unserializeAppearance(animation: SpriteAnimationLike): void {
    this.m_animationPhases = animation.sprite_phase_size()
    this.m_async = !animation.synchronized()
    this.m_loopCount = animation.loop_count()
    this.m_startPhase = animation.default_start_phase()
    this.m_phaseDurations = []
    for (let i = 0; i < animation.sprite_phase().length; i++) {
      const phase = animation.sprite_phase()[i]
      this.m_phaseDurations.push([phase.duration_min(), phase.duration_max()])
    }
    this.m_phase = this.getStartPhase()
  }

  unserialize(animationPhases: number, fin: FileStreamLike): void {
    this.m_animationPhases = animationPhases
    this.m_async = fin.getU8() === 0
    this.m_loopCount = fin.get32()
    this.m_startPhase = fin.get8()
    this.m_phaseDurations = []
    for (let i = 0; i < this.m_animationPhases; i++) {
      const minimum = fin.getU32()
      const maximum = fin.getU32()
      this.m_phaseDurations.push([minimum, maximum])
      if (this.m_minDuration === 0) {
        this.m_minDuration = minimum
      } else {
        this.m_minDuration = Math.min(this.m_minDuration, minimum)
      }
    }
    this.m_phase = this.getStartPhase()
  }

  serialize(fin: FileStreamLike): void {
    fin.addU8(this.m_async ? 0 : 1)
    fin.add32(this.m_loopCount)
    fin.add8(this.m_startPhase)
    for (let i = 0; i < this.m_phaseDurations.length; i++) {
      const [min, max] = this.m_phaseDurations[i]
      fin.addU32(min)
      fin.addU32(max)
    }
  }

  setPhase(phase: number): void {
    if (this.m_phase === phase) {
      return
    }
    if (!this.m_async) {
      this.calculateSynchronous()
      return
    }
    if (phase === AnimationPhase.AnimPhaseAsync) {
      this.m_phase = 0
    } else if (phase === AnimationPhase.AnimPhaseRandom) {
      this.m_phase = randomRange(0, this.m_animationPhases)
    } else if (phase >= 0 && phase < this.m_animationPhases) {
      this.m_phase = phase
    } else {
      this.m_phase = this.getStartPhase()
    }
    this.m_isComplete = false
    this.m_lastPhaseTicks = clockMillis()
    this.m_currentDuration = this.getPhaseDuration(this.m_phase)
    this.m_currentLoop = 0
  }

  getPhase(): number {
    const ticks = clockMillis()
    if (ticks !== this.m_lastPhaseTicks && !this.m_isComplete) {
      const elapsedTicks = Math.floor(ticks - this.m_lastPhaseTicks)
      if (elapsedTicks >= this.m_currentDuration) {
        let phase: number
        if (this.m_loopCount < 0) {
          phase = this.getPingPongPhase()
        } else {
          phase = this.getLoopPhase()
        }
        if (this.m_phase !== phase) {
          const duration = this.getPhaseDuration(phase) - (elapsedTicks - this.m_currentDuration)
          if (duration < 0 && !this.m_async) {
            this.calculateSynchronous()
          } else {
            this.m_phase = phase
            this.m_currentDuration = Math.max(0, duration)
          }
        } else {
          this.m_isComplete = true
        }
      } else {
        this.m_currentDuration -= elapsedTicks
      }
      this.m_lastPhaseTicks = ticks
    }
    return this.m_phase
  }

  getPhaseAt(timer: Timer, durationFactor: number = 1): number {
    const time = timer.ticksElapsed()
    let index = 0
    let total = 0
    for (let i = 0; i < this.m_phaseDurations.length; i++) {
      const [min, max] = this.m_phaseDurations[i]
      total += (min + (max - min)) / durationFactor
      if (time < total) {
        return index
      }
      index++
    }
    return Math.min(index, this.m_animationPhases - 1)
  }

  getStartPhase(): number {
    if (this.m_startPhase > -1) {
      return this.m_startPhase
    }
    return randomRange(0, this.m_animationPhases)
  }

  resetAnimation(): void {
    this.m_isComplete = false
    this.m_currentDirection = AnimationDirection.AnimDirForward
    this.m_currentLoop = 0
    this.setPhase(AnimationPhase.AnimPhaseAutomatic)
  }

  private getPingPongPhase(): number {
    const count = this.m_currentDirection === AnimationDirection.AnimDirForward ? 1 : -1
    const nextPhase = this.m_phase + count
    if (nextPhase < 0 || nextPhase >= this.m_animationPhases) {
      this.m_currentDirection = this.m_currentDirection === AnimationDirection.AnimDirForward ? AnimationDirection.AnimDirBackward : AnimationDirection.AnimDirForward
      return this.m_phase + (count * -1)
    }
    return this.m_phase + count
  }

  private getLoopPhase(): number {
    const nextPhase = this.m_phase + 1
    if (nextPhase < this.m_animationPhases) {
      return nextPhase
    }
    if (this.m_loopCount === 0) {
      return 0
    }
    if (this.m_currentLoop < this.m_loopCount - 1) {
      this.m_currentLoop++
      return 0
    }
    return this.m_phase
  }

  private getPhaseDuration(phase: number): number {
    const [min, max] = this.m_phaseDurations[phase]
    if (min === max) return min
    return randomRange(min, max)
  }

  private calculateSynchronous(): void {
    let totalDuration = 0
    for (let i = 0; i < this.m_animationPhases; i++) {
      totalDuration += this.getPhaseDuration(i)
    }
    const ticks = clockMillis()
    const elapsedTicks = Math.floor(ticks % totalDuration)
    let totalTime = 0
    for (let i = 0; i < this.m_animationPhases; i++) {
      const duration = this.getPhaseDuration(i)
      if (elapsedTicks >= totalTime && elapsedTicks < totalTime + duration) {
        this.m_phase = i
        this.m_currentDuration = duration - (elapsedTicks - totalTime)
        break
      }
      totalTime += duration
    }
    this.m_lastPhaseTicks = ticks
  }

  getAnimationPhases(): number {
    return this.m_animationPhases
  }

  getAverageDuration(): number {
    return this.getTotalDuration() / this.getAnimationPhases()
  }

  getMinDuration(): number {
    return this.m_minDuration
  }

  isAsync(): boolean {
    return this.m_async
  }

  isComplete(): boolean {
    return this.m_isComplete
  }

  getTotalDuration(): number {
    let time = 0
    for (let i = 0; i < this.m_phaseDurations.length; i++) {
      const [min, max] = this.m_phaseDurations[i]
      time += min + (max - min)
    }
    return time * Math.max(this.m_loopCount, 1)
  }
}
