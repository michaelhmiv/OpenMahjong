// Synthetic calibration harness. Run with node scripts/multiplayer-ratings.mjs.
import assert from "node:assert/strict";
import { rating, rate, predictWin } from "openskill";

let seed = 1597351;
function uniform() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed + 0.5) / 4294967296;
}
const count = 96,
  training = 4500,
  heldOut = 2000;
const strength = Array.from({ length: count }, () => 4 * uniform() - 2);
const pl = strength.map(() => rating()),
  capped = strength.map(() => rating());
const g2 = strength.map(() => ({ mu: 0, phi: 350 / 173.7178, sigma: 0.06 }));
const g = (phi) => 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);
const logistic = (x) => 1 / (1 + Math.exp(-x));
// Glickman steps 3–8. One four-seat game is one rating period.
// Each opponent contributes one third to both observed information and score.
function weightedGlicko(old, outcomes) {
  return old.map(({ mu, phi, sigma }, i) => {
    let information = 0,
      change = 0;
    old.forEach((op, j) => {
      if (j === i) return;
      const weight = g(op.phi),
        p = logistic(weight * (mu - op.mu));
      information += (weight ** 2 * p * (1 - p)) / 3;
      change +=
        (weight * ((1 + Math.sign(outcomes[i] - outcomes[j])) / 2 - p)) / 3;
    });
    const variance = 1 / information,
      delta = variance * change,
      a = Math.log(sigma ** 2),
      tau = 0.5;
    const f = (x) => {
      const exp = Math.exp(x),
        total = phi ** 2 + variance + exp;
      return (
        (exp * (delta ** 2 - total)) / (2 * total ** 2) - (x - a) / tau ** 2
      );
    };
    let A = a,
      B = a - tau;
    if (delta ** 2 > phi ** 2 + variance)
      B = Math.log(delta ** 2 - phi ** 2 - variance);
    else while (f(B) < 0) B -= tau;
    let fa = f(A),
      fb = f(B);
    while (Math.abs(B - A) > 1e-6) {
      const C = A + ((A - B) * fa) / (fb - fa),
        fc = f(C);
      if (fc * fb <= 0) {
        A = B;
        fa = fb;
      } else fa /= 2;
      B = C;
      fb = fc;
    }
    const volatility = Math.exp(A / 2);
    const updated =
      1 / Math.sqrt(1 / (phi ** 2 + volatility ** 2) + information);
    return { mu: mu + updated ** 2 * change, phi: updated, sigma: volatility };
  });
}
const losses = { uniform: 0, openSkill: 0, weightedGlicko2: 0 };
const seatResidual = [0, 0, 0, 0],
  winnerLoss = { openSkill: 0, weightedGlicko2: 0, uniform: 0 };
let pairs = 0,
  ties = 0,
  coveredGames = 0;
for (let match = 0; match < training + heldOut; match++) {
  const drawn = new Set();
  while (drawn.size < 4) drawn.add(Math.floor(uniform() * count));
  const seats = [...drawn];
  const score = seats.map((i) =>
    Math.round(4 * (strength[i] - Math.log(-Math.log(uniform())))),
  );
  const rank = score.map((s) => 1 + score.filter((other) => other > s).length);
  const teams = seats.map((i) => [pl[i]]),
    old = seats.map((i) => g2[i]);
  if (match < training) {
    const ordinary = rate(teams, { rank }),
      limited = rate(
        seats.map((i) => [capped[i]]),
        { rank },
      );
    const covered = uniform() < 0.08 ? Math.floor(uniform() * 4) : -1;
    if (covered !== -1) coveredGames++;
    seats.forEach((id, i) => {
      const next = limited[i][0];
      if (i === covered) next.mu = Math.min(capped[id].mu, next.mu);
      capped[id] = next;
      pl[id] = ordinary[i][0];
    });
    weightedGlicko(old, score).forEach((r, i) => {
      g2[seats[i]] = r;
    });
  } else {
    // Use a joint first-place probability for these diagnostics. Split the target on ties.
    const mass = rank.filter((r) => r === 1).length,
      weights = old.map((r) => Math.exp(r.mu)),
      total = weights.reduce((a, b) => a + b);
    const first = predictWin(teams);
    for (let i = 0; i < 4; i++) {
      const share = rank[i] === 1 ? 1 / mass : 0;
      seatResidual[i] += first[i] - share;
      winnerLoss.openSkill -= share * Math.log(first[i]);
      winnerLoss.weightedGlicko2 -= share * Math.log(weights[i] / total);
      winnerLoss.uniform -= share * Math.log(0.25);
    }
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const outcome = (1 + Math.sign(score[i] - score[j])) / 2;
        if (outcome === 0.5) ties++;
        const predictions = {
          uniform: 0.5,
          openSkill: predictWin([teams[i], teams[j]])[0],
          weightedGlicko2: logistic(
            g(Math.hypot(old[i].phi, old[j].phi)) * (old[i].mu - old[j].mu),
          ),
        };
        for (const [model, chance] of Object.entries(predictions)) {
          const p = Math.max(1e-9, Math.min(1 - 1e-9, chance));
          losses[model] -=
            outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p);
        }
        pairs++;
      }
  }
}
for (const key of Object.keys(losses)) losses[key] /= pairs;
assert.ok(Object.values(losses).every(Number.isFinite));
const avgDisplayed = (ratings) =>
  (60 * ratings.reduce((sum, r) => sum + r.mu, 0)) / count;
console.log(
  JSON.stringify(
    {
      training,
      heldOut,
      pairs,
      ties,
      coveredGames,
      pairwiseLogLoss: losses,
      firstPlaceLogLoss: Object.fromEntries(
        Object.entries(winnerLoss).map(([k, v]) => [k, v / heldOut]),
      ),
      meanFirstPlaceResidualBySeat: seatResidual.map((v) => v / heldOut),
      meanRatingShiftFromCappedGains: avgDisplayed(capped) - avgDisplayed(pl),
    },
    null,
    2,
  ),
);
