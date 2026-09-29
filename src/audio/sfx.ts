import { reactive, watch } from 'vue'
import { loadJSON, saveJSON } from '@/utils/storage'

/*
 * 所有音效都用 Web Audio 即時合成，不載入音檔。
 * 瀏覽器規定要有使用者操作才能出聲，所以 AudioContext 等第一次點擊才建立。
 */

const SETTINGS_KEY = 'hangbah:sound'

// 持續滋滋聲的音量倍率
const SIZZLE_BED_GAIN = 0.16

export const soundSettings = reactive(loadJSON(SETTINGS_KEY, { volume: 0.7, muted: false }))

export type SfxName = 'place' | 'flip' | 'warn' | 'charred' | 'burn' | 'eat' | 'perfect' | 'join' | 'chat' | 'sauce'

class Sfx {
  ctx: AudioContext | null = null
  private master!: GainNode
  private sizzleGain!: GainNode
  private noise!: AudioBuffer
  private sizzleLevel = 0
  private crackleTimer: ReturnType<typeof setInterval> | null = null
  private fireOn = false

  constructor() {
    watch(soundSettings, (s) => {
      saveJSON(SETTINGS_KEY, s)
      this.applyVolume()
    })
  }

  /** 在使用者操作的事件裡呼叫。重複呼叫沒關係。 */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
      this.noise = this.makeNoise(2)
      this.startSizzleBed()
      this.applyVolume()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  get masterGain() {
    return this.ctx ? this.master.gain.value : 0
  }

  private applyVolume() {
    if (!this.ctx) return
    const v = soundSettings.muted ? 0 : soundSettings.volume
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03)
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  // ---------- 持續的烤肉滋滋聲 ----------

  private startSizzleBed() {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2200
    const bp = ctx.createBiquadFilter()
    bp.type = 'peaking'
    bp.frequency.value = 5500
    bp.gain.value = 6
    this.sizzleGain = ctx.createGain()
    this.sizzleGain.gain.value = 0
    src.connect(hp).connect(bp).connect(this.sizzleGain).connect(this.master)
    src.start()
    // 木炭隨機爆裂。炭火一直燒著，烤架上沒東西也會爆，平均 2–3 秒一次；食材多、火旺時爆得勤一點
    this.crackleTimer = setInterval(() => {
      if (this.fireOn && Math.random() < 0.08 + 0.12 * this.sizzleLevel) this.charcoalPop()
    }, 250)
  }

  /** 烤架畫面出現時開、離開時關，不然回到首頁還會聽到木炭爆。 */
  setFire(on: boolean) {
    this.fireOn = on
  }

  /** level 0–1：烤架上的東西越多、火越大就越大聲。 */
  setSizzle(level: number) {
    this.sizzleLevel = Math.max(0, Math.min(1, level))
    if (!this.ctx) return
    this.sizzleGain.gain.setTargetAtTime(this.sizzleLevel * SIZZLE_BED_GAIN, this.ctx.currentTime, 0.4)
  }

  private swell(amount: number, seconds: number) {
    if (!this.ctx) return
    const g = this.sizzleGain.gain
    const t = this.ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(Math.min(0.3, this.sizzleLevel * SIZZLE_BED_GAIN + amount), t, 0.02)
    g.setTargetAtTime(this.sizzleLevel * SIZZLE_BED_GAIN, t + seconds, 0.35)
  }

  // ---------- 小工具 ----------

  private noiseBurst(opts: {
    at?: number
    duration: number
    gain: number
    type: BiquadFilterType
    freq: number
    freqEnd?: number
    q?: number
    attack?: number
  }) {
    const ctx = this.ctx!
    const t = opts.at ?? ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const f = ctx.createBiquadFilter()
    f.type = opts.type
    f.frequency.setValueAtTime(opts.freq, t)
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.duration)
    f.Q.value = opts.q ?? 0.8
    const g = ctx.createGain()
    const attack = opts.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 1.5)
    src.stop(t + opts.duration + 0.05)
  }

  private tone(opts: {
    at?: number
    duration: number
    gain: number
    freq: number
    freqEnd?: number
    type?: OscillatorType
    attack?: number
  }) {
    const ctx = this.ctx!
    const t = opts.at ?? ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(opts.freq, t)
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.duration)
    const g = ctx.createGain()
    const attack = opts.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + opts.duration + 0.05)
  }

  private crackle(gain: number, at?: number) {
    this.noiseBurst({ at, duration: 0.012 + Math.random() * 0.02, gain, type: 'bandpass', freq: 2000 + Math.random() * 3000, q: 2 })
  }

  /** 木炭裂開：低頻的「砰」疊一聲很短的高頻「啪」，有時候後面再細碎地劈啪幾下。音量調到跟放食材差不多，太小聲會被忽略 */
  private charcoalPop() {
    if (!this.ctx || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const g = 0.6 + Math.random() * 0.5
    this.noiseBurst({ at: t, duration: 0.07 + Math.random() * 0.05, gain: 0.6 * g, type: 'bandpass', freq: 500 + Math.random() * 400, freqEnd: 250, q: 1.2, attack: 0.002 })
    this.noiseBurst({ at: t, duration: 0.015, gain: 0.5 * g, type: 'highpass', freq: 3000, attack: 0.001 })
    if (Math.random() < 0.35) {
      const n = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) this.crackle(0.2 * g, t + 0.05 + Math.random() * 0.2)
    }
  }

  // ---------- 音效 ----------

  /** gain 用來讓別人的動作比自己的小聲一點。 */
  play(name: SfxName, gain = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    switch (name) {
      case 'place':
        this.noiseBurst({ duration: 0.45, gain: 0.35 * gain, type: 'highpass', freq: 2500, attack: 0.01 })
        this.swell(0.08 * gain, 0.4)
        break
      case 'flip':
        this.tone({ duration: 0.08, gain: 0.35 * gain, freq: 190, freqEnd: 80 })
        this.noiseBurst({ duration: 0.05, gain: 0.3 * gain, type: 'lowpass', freq: 1400 })
        this.noiseBurst({ at: t + 0.04, duration: 0.5, gain: 0.25 * gain, type: 'highpass', freq: 2800, attack: 0.02 })
        this.swell(0.1 * gain, 0.6)
        break
      case 'sauce':
        this.noiseBurst({ duration: 0.3, gain: 0.18 * gain, type: 'bandpass', freq: 900, freqEnd: 2200, q: 1.2, attack: 0.05 })
        this.noiseBurst({ at: t + 0.1, duration: 0.6, gain: 0.22 * gain, type: 'highpass', freq: 3000, attack: 0.03 })
        break
      case 'warn':
        this.tone({ duration: 0.09, gain: 0.12 * gain, freq: 880, type: 'triangle' })
        this.tone({ at: t + 0.14, duration: 0.09, gain: 0.12 * gain, freq: 880, type: 'triangle' })
        break
      case 'charred':
        this.tone({ duration: 0.28, gain: 0.3 * gain, freq: 120, freqEnd: 55 })
        this.noiseBurst({ duration: 0.3, gain: 0.2 * gain, type: 'lowpass', freq: 600, freqEnd: 200 })
        break
      case 'burn':
        this.noiseBurst({ duration: 1.1, gain: 0.55 * gain, type: 'lowpass', freq: 250, freqEnd: 1800, attack: 0.08 })
        this.tone({ duration: 0.5, gain: 0.25 * gain, freq: 70, freqEnd: 40 })
        for (let i = 0; i < 14; i++) this.crackle((0.2 + Math.random() * 0.2) * gain, t + 0.15 + Math.random() * 1.6)
        break
      case 'eat':
        this.noiseBurst({ duration: 0.035, gain: 0.35 * gain, type: 'bandpass', freq: 1300, q: 1.5 })
        this.noiseBurst({ at: t + 0.09, duration: 0.05, gain: 0.3 * gain, type: 'bandpass', freq: 1000, q: 1.5 })
        this.tone({ at: t + 0.18, duration: 0.12, gain: 0.08 * gain, freq: 300, freqEnd: 420, type: 'triangle' })
        break
      case 'perfect':
        this.tone({ at: t + 0.12, duration: 0.7, gain: 0.16 * gain, freq: 1318.5 })
        this.tone({ at: t + 0.12, duration: 0.5, gain: 0.08 * gain, freq: 1975.5 })
        break
      case 'join':
        this.tone({ duration: 0.25, gain: 0.1 * gain, freq: 659.3, type: 'triangle' })
        this.tone({ at: t + 0.12, duration: 0.35, gain: 0.1 * gain, freq: 987.8, type: 'triangle' })
        break
      case 'chat':
        this.tone({ duration: 0.08, gain: 0.08 * gain, freq: 520, freqEnd: 780 })
        break
    }
  }

  dispose() {
    if (this.crackleTimer) clearInterval(this.crackleTimer)
  }
}

export const sfx = new Sfx()
