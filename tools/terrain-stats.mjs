/**
 * How terraced is the terrain, actually?
 *
 * "Corduroy" is the failure mode this project keeps coming back to: quantise a
 * gradient and you get a stack of one-cell ribbons, which reads as a maze rather
 * than as landscape and which you cannot plant a field on. It has been fixed by
 * eye three times and come back twice, because "it looks better" is not a thing
 * a check can hold on to.
 *
 * So it gets measured instead. Two numbers, both cheap:
 *
 *   MEAN RUN     the average length of a horizontal stretch of constant height,
 *                scanned along both axes. This IS the terrace width. It was 2.9
 *                cells when the outer ring rose twenty-four levels; it is over
 *                five now that the ring rises seven.
 *   RIBBON SHARE the fraction of cells with three or more of their four
 *                neighbours at a different height. A cell like that is on a
 *                one-cell shelf, which is the artefact itself rather than a
 *                proxy for it. It was one cell in five; it is under one in ten.
 *
 * Neither is a matter of taste and both move the moment somebody changes the
 * relief, the terrace step or the filter passes.
 */

export function terrainStats(grid, N) {
  const runs = []
  for (let z = 0; z < N; z++) {
    let run = 1
    for (let x = 1; x < N; x++) {
      if (grid.h(x, z) === grid.h(x - 1, z)) run++
      else { runs.push(run); run = 1 }
    }
    runs.push(run)
  }
  for (let x = 0; x < N; x++) {
    let run = 1
    for (let z = 1; z < N; z++) {
      if (grid.h(x, z) === grid.h(x, z - 1)) run++
      else { runs.push(run); run = 1 }
    }
    runs.push(run)
  }

  let ribbons = 0
  let cells = 0
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const h = grid.h(x, z)
      cells++
      let differ = 0
      if (grid.h(x - 1, z) !== h) differ++
      if (grid.h(x + 1, z) !== h) differ++
      if (grid.h(x, z - 1) !== h) differ++
      if (grid.h(x, z + 1) !== h) differ++
      if (differ >= 3) ribbons++
    }
  }

  let hi = 0
  let lo = Infinity
  for (let i = 0; i < N * N; i++) {
    const h = grid.height[i]
    if (h > hi) hi = h
    if (h < lo) lo = h
  }

  return {
    meanRun: runs.reduce((a, b) => a + b, 0) / runs.length,
    ribbonShare: ribbons / cells,
    relief: hi - lo,
  }
}
