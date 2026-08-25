/**
 * The story, and the rules for delivering it.
 *
 * From the bible, and they are not suggestions — they are the difference
 * between this and a lore dump:
 *
 *   1. **Never more than four lines on screen at once.** The soil-tags are
 *      twelve seconds because Marit's recorder was twelve seconds.
 *   2. **Found, not given.** No quest-giver explains the setting. The player
 *      hoes a square of dirt and a piece of fired clay comes up.
 *   3. **Out of order, always.** Odenne's logs are numbered. The player will
 *      find log 31 before log 6 and that is correct.
 *   4. **The mundane before the cosmic.** The first six tags are complaints
 *      about drainage. The scale is earned by starting at ankle height.
 *   5. **Nobody monologues.** The turn is assembled by the player out of an
 *      inventory manifest, a scheduling note, and one recording that is mostly
 *      silence.
 *
 * So: `TAGS` is ordered, and the game hands them out in order regardless of
 * where they were dug up — that is what enforces rule 4. `LOGS` is shuffled by
 * the world seed, because rule 3 says it should be.
 */

/**
 * Soil-tags. Marit Flavyn used them as a lab notebook because she hated
 * writing. She never came here; she died on the transit station sixty-one years
 * before you woke up.
 */
export const TAGS = [
  { id: 1, at: 'Row four', lines: ['The clay is too heavy here, I keep saying it,', 'and somebody keeps planting row four anyway.'] },
  { id: 2, at: 'North terrace', lines: ['Drainage. Again. If the sowers had cut the', 'terrace half a metre lower we would not be', 'having this conversation for the fourth year.'] },
  { id: 3, at: 'Plot 11', lines: ['Substrate holding. Nothing to report.', 'I am recording this so there is a gap in the', 'series and not because there is news.'] },
  { id: 4, at: 'Plot 11, later', lines: ['It is holding better than it should.', 'I will take it and I will not look at it too hard.'] },
  { id: 5, at: 'The ash flat', lines: ['Nothing takes out here and nothing is going to.', 'Stop sending me out to check.'] },
  { id: 6, at: 'Row four, again', lines: ['Somebody planted row four.'] },
  { id: 7, at: 'Seed line B', lines: ['B is out-competing everything in the tray.', 'That is what I wanted. I want to say that', 'clearly before I say anything else.'] },
  { id: 8, at: 'Seed line B', lines: ['B is out-competing things it was not', 'supposed to be in the tray with.'] },
  { id: 9, at: 'Under the west ridge', lines: ['Took a core down to two metres.', 'The bacteria count under B is wrong.', 'I am going to run it again before I put', 'anything in writing.'] },
  { id: 10, at: 'Under the west ridge', lines: ['Ran it again.'] },
  { id: 11, at: 'Transit station', lines: ['They will not let me on a lander.', 'Sixty-one years of soil work and I have never', 'stood on the ground I made.'] },
  { id: 12, at: 'Transit station', lines: ['If anyone digs this up: it was the B line.', 'It was always going to be the B line.', 'I am sorry. Plant something else in row four.'] },
]

/**
 * Odenne Var's logs, recovered out of order from the relay. Early ones are
 * administrative and dull; later ones are not. She was your supervisor.
 */
export const LOGS = [
  { id: 3, lines: ['Inventory return, quarter two. Vault holdings', 'unchanged at four hundred and six species.', 'Nobody has requested anything since Thaw.'] },
  { id: 6, lines: ['The apprentice files faster than I do and I am', 'not going to mention it.'] },
  { id: 12, lines: ['Requested the Loom maintenance manual from', 'the station archive. Told it does not exist', 'in a form anyone kept.'] },
  { id: 17, lines: ['It does exist. It was filed under plumbing.'] },
  { id: 24, lines: ['Soil bacteria counts, north valley, seven cores.', 'I have checked the instrument twice.', 'Nine years. Eleven if the west terrace holds.'] },
  { id: 29, lines: ['Presented the cores to the council.', 'They asked what the remediation budget would be.', 'There is no remediation. It is the substrate.'] },
  { id: 31, lines: ['The Loom keeps checkpoints. It has always kept', 'checkpoints. Nobody read the manual.'] },
  { id: 34, lines: ['A rollback would take the colony with it.', 'I have written that sentence four times and', 'deleted it three.'] },
  { id: 38, lines: ['09:14. Fewest people in the fields.', 'I have checked the roster for the whole season', 'and it is 09:14 on a Longlight morning.'] },
  { id: 40, lines: ['I am not going to explain this to anyone,', 'because there is nobody I could explain it to', 'who would not try to stop me, and they would', 'be right to.'] },
  { id: 41, lines: ['[eleven seconds of room tone]'] },
]

/**
 * The Manifest. Four hundred and six species were in the Vault; the Vault holds
 * none of them, because they are in the valley now, mixed into the soil in
 * pieces small enough that the Loom did not consider them worth deleting.
 *
 * Every species you carry through to a harvest writes one line back onto the
 * chip. That is the progress bar, and it is also the whole point: farming here
 * is not commerce, it is recovery.
 */
export const MANIFEST_TOTAL = 406

/** What the chip says about how far you have got. Deliberately unimpressed. */
export function manifestLine(n) {
  if (n === 0) return 'Four hundred and six species. None of them recovered.'
  if (n === 1) return 'One species back on the chip. Four hundred and five to go.'
  if (n < 6) return `${n} recovered. The chip does not consider this progress.`
  if (n < 12) return `${n} recovered. It has started listing them alphabetically again.`
  return `${n} of ${MANIFEST_TOTAL}. Somebody could farm here.`
}
