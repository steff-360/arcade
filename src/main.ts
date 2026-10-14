
import Phaser from 'phaser'
import './style.css'

type HudState = {
  score: number
  time: number
  shards: number
  bank: number
  best: number
  shields: number
  shieldCost: number
  dash: number
  active: boolean
  combo: number
  danger: number
}

type FallingObject = {
  node: Phaser.GameObjects.Arc
  radius: number
  speed: number
  drift: number
  phase: number
  kind: 'hazard' | 'spinner'
  spin: number
}

type Spark = {
  node: Phaser.GameObjects.Arc
  vx: number
  vy: number
  life: number
  maxLife: number
}

const STORE = {
  bank: 'pulso-cero:bank',
  best: 'pulso-cero:best',
  shields: 'pulso-cero:shields',
}

function readStore(key: string): number {
  try {
    const value = Number(window.localStorage.getItem(key) ?? 0)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeStore(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // The current run remains playable when browser storage is unavailable.
  }
}

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc
  private glow!: Phaser.GameObjects.Arc
  private hazards: FallingObject[] = []
  private pickups: FallingObject[] = []
  private stars: Array<{ node: Phaser.GameObjects.Arc; speed: number }> = []
  private sparks: Spark[] = []
  private keys!: Record<'left' | 'right' | 'leftArrow' | 'rightArrow' | 'dash', Phaser.Input.Keyboard.Key>
  private targetX = 480
  private elapsed = 0
  private runShards = 0
  private bank = 0
  private best = 0
  private shields = 0
  private active = false
  private spawnClock = 0
  private pickupClock = 0
  private hudClock = 0
  private dashCooldown = 0
  private dashTime = 0
  private graceTime = 0
  private combo = 0
  private danger = 0

  constructor() {
    super('Arena')
  }

  create(): void {
    this.bank = readStore(STORE.bank)
    this.best = readStore(STORE.best)
    this.shields = Math.min(3, readStore(STORE.shields))

    this.add.rectangle(480, 320, 960, 640, 0x111816)
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x27332e, 0.48)
    for (let x = 24; x < 960; x += 48) grid.lineBetween(x, 0, x, 640)
    for (let y = 16; y < 640; y += 48) grid.lineBetween(0, y, 960, y)
    grid.lineStyle(1, 0x34413b, 0.62)
    grid.lineBetween(480, 0, 480, 640)

    for (let index = 0; index < 52; index += 1) {
      const star = this.add.circle(
        Phaser.Math.Between(12, 948),
        Phaser.Math.Between(0, 630),
        Phaser.Math.FloatBetween(0.7, 1.7),
        index % 5 === 0 ? 0xffd17a : 0xc7d6cc,
        Phaser.Math.FloatBetween(0.2, 0.62),
      )
      this.stars.push({ node: star, speed: Phaser.Math.FloatBetween(12, 35) })
    }

    this.player = this.add.circle(480, 536, 15, 0x71f2c0, 1).setStrokeStyle(3, 0xd4ffdf)
    this.player.setDepth(3)
    this.glow = this.add.circle(480, 536, 27, 0x71f2c0, 0.14).setDepth(2)
    this.tweens.add({
      targets: this.glow,
      scale: { from: 1, to: 1.4 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.keys = this.input.keyboard!.addKeys({
      left: 'A',
      right: 'D',
      leftArrow: 'LEFT',
      rightArrow: 'RIGHT',
      dash: 'SPACE',
    }) as typeof this.keys

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.active) this.targetX = Phaser.Math.Clamp(pointer.worldX, 28, 932)
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.active && pointer.isDown) this.targetX = Phaser.Math.Clamp(pointer.worldX, 28, 932)
    })

    this.game.events.on('ui-start-run', () => this.startRun())
    this.game.events.on('ui-purchase-shield', () => this.purchaseShield())

    this.emitHud()
  }

  startRun(): void {
    this.hazards.forEach((item) => item.node.destroy())
    this.pickups.forEach((item) => item.node.destroy())
    this.sparks.forEach((spark) => spark.node.destroy())
    this.hazards = []
    this.pickups = []
    this.sparks = []
    this.elapsed = 0
    this.runShards = 0
    this.spawnClock = 0
    this.pickupClock = 0
    this.hudClock = 0
    this.dashCooldown = 0
    this.dashTime = 0
    this.graceTime = 0
    this.combo = 0
    this.danger = 0
    this.targetX = 480
    this.player.setPosition(480, 536).setAlpha(1).setScale(1)
    this.glow.setPosition(480, 536).setScale(1)
    this.active = true
    this.spawnBurst(480, 536, 0x7ef7c8, 18, 260)
    this.game.events.emit('overlay', { visible: false })
    this.game.events.emit('run-state', 'EN CURSO')
    this.emitHud()
  }

  purchaseShield(): void {
    if (this.active) {
      this.setNote('Espera al final de la ronda para reforzar el blindaje.')
      return
    }
    if (this.shields >= 3) {
      this.setNote('Blindaje al máximo. Entra al sector.')
      return
    }
    const cost = 20 + this.shields * 15
    if (this.bank < cost) {
      this.setNote(`Necesitas ${cost - this.bank} fragmentos más.`)
      return
    }
    this.bank -= cost
    this.shields += 1
    writeStore(STORE.bank, this.bank)
    writeStore(STORE.shields, this.shields)
    this.setNote('Blindaje reforzado. Aguanta un impacto más.')
    this.emitHud()
  }

  update(_time: number, delta: number): void {
    const step = Math.min(delta, 40) / 1000
    for (const star of this.stars) {
      star.node.y += star.speed * step
      if (star.node.y > 640) star.node.y = 0
    }

    this.updateSparks(step)
    this.glow.setPosition(this.player.x, this.player.y)
    this.glow.setAlpha(this.active ? 0.28 : 0.14 + Math.sin(_time * 0.004) * 0.08)

    if (!this.active) return

    this.elapsed += step
    this.dashCooldown = Math.max(0, this.dashCooldown - delta)
    this.dashTime = Math.max(0, this.dashTime - delta)
    this.graceTime = Math.max(0, this.graceTime - delta)
    this.danger = Phaser.Math.Clamp(this.danger + step * 0.12, 0, 1.6)

    const movingLeft = this.keys.left.isDown || this.keys.leftArrow.isDown
    const movingRight = this.keys.right.isDown || this.keys.rightArrow.isDown
    if (movingLeft !== movingRight) {
      this.targetX += (movingRight ? 1 : -1) * 560 * step
    }
    this.targetX = Phaser.Math.Clamp(this.targetX, 28, 932)
    this.player.x = Phaser.Math.Linear(this.player.x, this.targetX, Math.min(1, step * 12))

    if (Phaser.Input.Keyboard.JustDown(this.keys.dash) && this.dashCooldown === 0) {
      this.dashTime = 420
      this.dashCooldown = 2600
      this.player.setScale(1.42)
      this.spawnBurst(this.player.x, this.player.y, 0x7ef7c8, 12, 220)
    }

    if (this.dashTime > 0) {
      this.spawnDashTrail()
      this.player.setScale(1.38)
    } else {
      this.player.setScale(1)
    }

    this.player.setAlpha(this.graceTime > 0 && Math.floor(this.elapsed * 18) % 2 === 0 ? 0.34 : 1)

    this.spawnClock += delta
    this.pickupClock += delta
    const hazardDelay = Math.max(230, 760 - this.elapsed * 9.5)
    if (this.spawnClock >= hazardDelay) {
      this.spawnClock = 0
      this.spawnHazard()
    }
    if (this.pickupClock >= 1450) {
      this.pickupClock = 0
      this.spawnPickup()
    }

    this.moveObjects(this.hazards, step, true)
    if (!this.active) return
    this.moveObjects(this.pickups, step, false)

    this.hudClock += delta
    if (this.hudClock >= 80) {
      this.hudClock = 0
      this.emitHud()
    }
  }

  private spawnDashTrail(): void {
    const node = this.add.circle(
      this.player.x + Phaser.Math.Between(-12, 12),
      this.player.y + Phaser.Math.Between(-12, 14),
      Phaser.Math.FloatBetween(2.2, 5),
      this.dashTime > 180 ? 0x7ef7c8 : 0xa48cff,
      0.8,
    )
    this.sparks.push({
      node,
      vx: Phaser.Math.Between(-20, 20),
      vy: Phaser.Math.Between(10, 26),
      life: 0.28,
      maxLife: 0.28,
    })
  }

  private spawnBurst(x: number, y: number, color: number, amount: number, speed: number): void {
    for (let index = 0; index < amount; index += 1) {
      const node = this.add.circle(
        x,
        y,
        Phaser.Math.FloatBetween(1.6, 4.1),
        color,
        Phaser.Math.FloatBetween(0.6, 1),
      )
      this.sparks.push({
        node,
        vx: Phaser.Math.FloatBetween(-speed, speed),
        vy: Phaser.Math.FloatBetween(-speed, speed),
        life: Phaser.Math.FloatBetween(0.35, 0.7),
        maxLife: Phaser.Math.FloatBetween(0.35, 0.7),
      })
    }
  }

  private updateSparks(step: number): void {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index]
      spark.node.x += spark.vx * step
      spark.node.y += spark.vy * step
      spark.life -= step
      spark.node.setAlpha(Math.max(0, spark.life / spark.maxLife))
      if (spark.life <= 0) {
        spark.node.destroy()
        this.sparks.splice(index, 1)
      }
    }
  }

  private spawnHazard(): void {
    const isSpinner = Math.random() < 0.3
    const radius = isSpinner ? Phaser.Math.Between(18, 30) : Phaser.Math.Between(12, 24)
    const x = Phaser.Math.Between(radius + 10, 960 - radius - 10)
    const node = this.add
      .circle(x, -radius, radius, isSpinner ? 0xff7c7c : 0xff685a, 0.94)
      .setStrokeStyle(2, isSpinner ? 0xffd9c7 : 0xffb28c)
    node.setDepth(2)

    this.hazards.push({
      node,
      radius,
      speed: Phaser.Math.Between(175, 250) * (1 + this.elapsed * 0.022),
      drift: Phaser.Math.Between(12, 54),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      kind: isSpinner ? 'spinner' : 'hazard',
      spin: Phaser.Math.FloatBetween(0.8, 1.8),
    })
  }

  private spawnPickup(): void {
    const x = Phaser.Math.Between(30, 930)
    const node = this.add.circle(x, -18, 9, 0xffca54, 1).setStrokeStyle(2, 0xffedb1)
    node.setDepth(2)
    this.tweens.add({
      targets: node,
      scale: { from: 1, to: 1.35 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.pickups.push({
      node,
      radius: 12,
      speed: 175,
      drift: 24,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      kind: 'hazard',
      spin: 1,
    })
  }

  private moveObjects(items: FallingObject[], step: number, isHazard: boolean): void {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      item.node.y += item.speed * step
      item.node.x += Math.sin(this.elapsed * 1.8 + item.phase) * item.drift * step
      if (item.kind === 'spinner') item.node.rotation += item.spin * step * 1.8

      if (item.node.y > 670) {
        item.node.destroy()
        items.splice(index, 1)
        continue
      }

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.node.x, item.node.y)
      if (distance > item.radius + 18 || this.dashTime > 0 || this.graceTime > 0) continue

      if (isHazard) {
        item.node.destroy()
        items.splice(index, 1)
        if (this.shields > 0) {
          this.shields -= 1
          writeStore(STORE.shields, this.shields)
          this.graceTime = 1100
          this.danger = Phaser.Math.Clamp(this.danger + 0.45, 0, 1.6)
          this.combo = Math.max(0, this.combo - 1)
          this.cameras.main.shake(180, 0.008)
          this.tweens.add({
            targets: this.player,
            scale: { from: 1, to: 1.8 },
            duration: 140,
            yoyo: true,
            ease: 'Back.easeOut',
          })
          this.spawnBurst(this.player.x, this.player.y, 0xff7b7b, 14, 220)
          this.setNote('Impacto absorbido. La rig sigue activa.')
          this.emitHud()
        } else {
          this.finishRun()
          return
        }
      } else {
        item.node.destroy()
        items.splice(index, 1)
        this.runShards += 1
        this.combo = Math.min(12, this.combo + 1)
        this.danger = Math.max(0, this.danger - 0.12)
        this.cameras.main.flash(100, 255, 213, 132, false)
        this.spawnBurst(item.node.x, item.node.y, 0xffd86d, 12, 180)
        this.emitHud()
      }
    }
  }

  private finishRun(): void {
    if (!this.active) return
    this.active = false
    const score = this.getScore()
    this.bank += this.runShards
    this.best = Math.max(this.best, score)
    writeStore(STORE.bank, this.bank)
    writeStore(STORE.best, this.best)
    this.game.events.emit('run-state', 'RONDA FINALIZADA')
    this.game.events.emit('overlay', {
      visible: true,
      title: 'El sector te <em>venció.</em>',
      copy: `Aguantaste ${this.formatTime(this.elapsed)} con un streak de x${this.combo} y reuniste ${this.runShards} fragmentos.`,
      button: 'Volver a intentarlo',
      kicker: 'RONDA FINALIZADA',
    })
    this.cameras.main.shake(260, 0.009)
    this.emitHud()
  }

  private getScore(): number {
    return Math.floor(this.elapsed * 16 + this.runShards * 28 + this.combo * 12)
  }

  private formatTime(seconds: number): string {
    const total = Math.floor(seconds)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  private setNote(message: string): void {
    this.game.events.emit('note', message)
  }

  private emitHud(): void {
    this.game.events.emit('hud', {
      score: this.getScore(),
      time: this.elapsed,
      shards: this.runShards,
      bank: this.bank,
      best: this.best,
      shields: this.shields,
      shieldCost: 20 + this.shields * 15,
      dash: this.dashCooldown > 0 ? 1 - this.dashCooldown / 2600 : 1,
      active: this.active,
      combo: this.combo,
      danger: Phaser.Math.Clamp(this.danger, 0, 1),
    } satisfies HudState)
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'arena',
  backgroundColor: '#111816',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640,
  },
  render: { antialias: true, pixelArt: false },
  scene: [ArenaScene],
})

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const overlay = $('game-overlay')
const overlayTitle = $('overlay-title')
const overlayCopy = $('overlay-copy')
const startButton = $('start-button') as HTMLButtonElement
const bootScreen = $('boot-screen')
const gameView = $('game-view')
const bootStartButton = $('boot-start') as HTMLButtonElement
const upgradeButton = $('buy-shield') as HTMLButtonElement
const upgradeNote = $('upgrade-note')

const enterGameView = (): void => {
  bootScreen.classList.add('is-hidden')
  gameView.classList.remove('is-hidden')
  game.events.emit('ui-start-run')
}

bootStartButton.addEventListener('click', enterGameView)
startButton.addEventListener('click', () => game.events.emit('ui-start-run'))
upgradeButton.addEventListener('click', () => game.events.emit('ui-purchase-shield'))

game.events.on('overlay', (state: { visible: boolean; title?: string; copy?: string; button?: string; kicker?: string }) => {
  overlay.classList.toggle('is-hidden', !state.visible)
  if (state.title) overlayTitle.innerHTML = state.title
  if (state.copy) overlayCopy.textContent = state.copy
  if (state.button) startButton.innerHTML = `${state.button} <span aria-hidden="true">↗</span>`
  const kicker = $('overlay-kicker')
  if (state.kicker) kicker.textContent = state.kicker
  startButton.blur()
})

game.events.on('run-state', (label: string) => {
  $('run-label').textContent = label
  $('run-label').classList.toggle('is-live', label === 'EN CURSO')
})

game.events.on('note', (message: string) => {
  upgradeNote.textContent = message
})

game.events.on('hud', (state: HudState) => {
  $('run-score').textContent = String(state.score).padStart(5, '0')
  $('run-time').textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`
  $('run-shards').textContent = String(state.shards)
  $('run-combo').textContent = state.combo > 0 ? `x${state.combo}` : 'x1'
  $('bank-count').textContent = String(state.bank)
  $('best-score').textContent = String(state.best).padStart(5, '0')
  $('shield-stock').textContent = `${state.shields} / 3`
  $('shield-cost').textContent = `◆ ${state.shieldCost}`
  $('dash-meter-fill').style.width = `${Math.round(state.dash * 100)}%`
  $('dash-state').textContent = state.dash >= 1 ? 'LISTO' : 'CARGANDO'
  $('danger-meter-fill').style.width = `${Math.round(state.danger * 100)}%`
  $('danger-level').textContent = state.danger > 0.7 ? 'CRIT' : state.danger > 0.36 ? 'ALTA' : 'STABLE'
  upgradeButton.disabled = state.active || state.shields >= 3 || state.bank < state.shieldCost
})
