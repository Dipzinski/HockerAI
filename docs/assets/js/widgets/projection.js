// Albers equal-area conic for the lower 48. Pure math, no DOM.

const DEG = Math.PI / 180;
const PHI1 = 29.5 * DEG;
const PHI2 = 45.5 * DEG;
const PHI0 = 37.5 * DEG;
const LAMBDA0 = -96 * DEG;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

/** Returns [x, y] with y pointing up. */
export function albers(lat, lon) {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * DEG)) / N;
  const theta = N * (lon * DEG - LAMBDA0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}
