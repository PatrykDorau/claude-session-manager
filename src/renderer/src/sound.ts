export type SoundName = 'chime' | 'ping' | 'arpeggio'

export const SOUNDS: { id: SoundName; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'ping', label: 'Ping' },
  { id: 'arpeggio', label: 'Arpeggio' }
]

type Note = [freq: number, at: number, dur: number, type?: OscillatorType]

const PATTERNS: Record<SoundName, Note[]> = {
  chime: [
    [880, 0, 0.3],
    [1318.5, 0.13, 0.3]
  ],
  ping: [[1567.98, 0, 0.22]],
  arpeggio: [
    [659.25, 0, 0.18],
    [830.6, 0.08, 0.18],
    [987.77, 0.16, 0.28]
  ]
}

export function playSound(name: SoundName): void {
  const notes = PATTERNS[name] ?? PATTERNS.chime
  try {
    const ctx = new AudioContext()
    void ctx.resume()
    const t0 = ctx.currentTime
    let end = 0
    for (const [freq, at, dur, type] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type ?? 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0, t0 + at)
      gain.gain.linearRampToValueAtTime(0.18, t0 + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + at + dur)
      osc.start(t0 + at)
      osc.stop(t0 + at + dur + 0.02)
      end = Math.max(end, at + dur)
    }
    setTimeout(() => void ctx.close(), (end + 0.3) * 1000)
  } catch {
    /* ignore */
  }
}
