/**
 * THE FIRST MORNING.
 *
 * A tutorial in a game whose whole premise is that nobody is left to explain
 * anything is a design problem, not a UI problem. There is no quest-giver here
 * and there is not going to be one, so this cannot be a person telling you what
 * to press. What it is instead is **the list you would write yourself**: a
 * surveyor waking up alone with a chip, a hoe and a short growing season, making
 * a note of what has to happen before dark.
 *
 * That framing does the work. Each step is a job rather than an instruction, the
 * keys are in the corner of the job rather than the point of it, and when the
 * list is done it is done — it does not come back on day two to teach you about
 * the shop.
 *
 * ## How it knows
 *
 * It polls `state.stats`, a tally of things you have DONE. Every step is one
 * predicate over that tally, plus how far you have walked. The alternative —
 * subscribing to nine events — has to be right about all nine, fires twice when
 * an action is undone and redone, and does not survive a reload. A counter it
 * polls cannot be missed and cannot double-fire, and it comes back with the save.
 *
 * ## What it teaches, in order
 *
 * Walk, fell, break ground, sow, water, fish, meet Rocky, sleep. Deliberately
 * the whole loop and nothing else: no building, no shipping, no pruning, no
 * geodes. Those are all things the valley will make the player care about on its
 * own, and a tutorial that covers everything is a manual with a progress bar.
 *
 * The Rocky step is the odd one out and it is here for a reason. He stands at
 * the relay on the north ridge and he never leaves it, which is correct — a
 * landmark that moves is not a landmark — but it also meant that a player who
 * farmed near the homestead could finish a whole season without ever finding out
 * there was anything else alive in the valley. One line on the list fixes that
 * without moving him.
 */

export const STEPS = [
  { id: 'walk', job: 'Welcome to your little farm', note: 'The fenced garden is just outside your door. Journal → Village → Your garden shows the way.', keys: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run', done: (s) => s.stats.walked > 4 },
  { id: 'till', job: 'Make a place for something good', note: 'Face an empty square inside the fenced garden. The outline shows the tile you will work.', keys: '<kbd>1</kbd> hoe · <kbd>F</kbd> till soil', done: (s) => s.stats.tilled > 0 },
  { id: 'sow', job: 'Plant your first seed', note: 'Sow on the dark soil you just tilled. Journal → Plant opens your seed tray.', keys: '<kbd>6</kbd> grubwort seed · <kbd>F</kbd> plant', done: (s) => s.stats.sown > 0 },
  { id: 'water', job: 'A drink before bedtime', note: 'Water your new seed AND the tall starter row. That row is only one watered night away from harvest.', keys: '<kbd>2</kbd> watering can · <kbd>F</kbd> water', done: (s) => s.stats.watered > 0 },
  { id: 'sleep', job: 'Tomorrow starts at home', note: 'Journal → Home → Sleep until dawn. Watered crops grow overnight. Your can refills and energy returns.', keys: '<kbd>Tab</kbd> Home · Sleep', done: (s) => s.stats.slept > 0 },
  { id: 'harvest', job: 'Your first basketful', note: 'The golden outline means ready. If a crop needs more time, keep watering it each day.', keys: '<kbd>E</kbd> harvest a ripe crop', done: (s) => s.stats.harvested > 0 },
  { id: 'sell', job: 'Turn your harvest into a home', note: 'Market → Sell pays instantly. Save 250 coin, 30 wood and 18 stone for your first home upgrade.', keys: '<kbd>M</kbd> Market · sell produce', done: (s) => s.stats.sold > 0 },
  { id: 'talk', job: 'You have neighbors now', note: 'Marn sells seeds. Tace builds houses. Odile knows the pond. Journal → Village → Find will point the way.', keys: '<kbd>E</kbd> talk near a neighbor', done: (s) => s.stats.talked > 0 },
]

/** What the card says once every job is crossed off. */
export const CLOSING = {
  job: 'Put down some roots',
  note: 'Grow your farm, make friends, and rebuild your home. Guide has the controls whenever you need them.',
}

export class Tutorial {
  constructor(state, { onStep, onDone } = {}) {
    this.state = state
    this.onStep = onStep
    this.onDone = onDone
    this.index = 0
    this.finished = state.flags.has('tutorial-skipped')
    this.closingFor = 0
    // Where the player was standing when the tally last ran, so `walked` is a
    // distance and not a position.
    this._last = null

    // A save that is already past a step starts past it. Nobody who has farmed
    // for six days wants to be told which key the hoe is on.
    while (this.index < STEPS.length && STEPS[this.index].done(state)) this.index++
    if (this.index >= STEPS.length) this.finished = true
  }

  get step() { return this.finished ? null : STEPS[this.index] }
  get total() { return STEPS.length }

  /** @param pos the player's world position, for the walk step. */
  update(dt, pos) {
    const s = this.state
    if (pos) {
      if (this._last) {
        const dx = pos.x - this._last.x
        const dz = pos.z - this._last.z
        s.stats.walked += Math.hypot(dx, dz)
      } else {
        this._last = { x: 0, z: 0 }
      }
      this._last.x = pos.x
      this._last.z = pos.z
    }

    if (this.finished) {
      if (this.closingFor > 0) {
        this.closingFor -= dt
        if (this.closingFor <= 0) this.onDone?.()
      }
      return
    }

    // More than one step can complete at once — chopping a tree with the axe
    // while the walk step is still up is normal, and the card should not spend
    // three frames catching up.
    let moved = false
    while (this.index < STEPS.length && STEPS[this.index].done(s)) {
      this.index++
      moved = true
    }
    if (!moved) return

    if (this.index >= STEPS.length) {
      this.finished = true
      // The closing card holds for a few seconds and then the whole thing goes
      // away for good. A tutorial that needs dismissing is one more thing to do.
      this.closingFor = 9
      this.onStep?.(null)
    } else {
      this.onStep?.(STEPS[this.index])
    }
  }

  /** Skipped from the card. Marks every job done so it never comes back. */
  skip() {
    this.state.flags.add('tutorial-skipped')
    this.finished = true
    this.index = STEPS.length
    this.closingFor = 0
    this.onDone?.()
  }
}
