/** Cephes ndtr/erf/erfc, ported from scipy/xsf include/xsf/cephes/ndtr.h.
 * Copyright 1984, 1987, 1988, 1992 Stephen L. Moshier; SciPy translation 2024.
 * See THIRD_PARTY_NOTICES.md for attribution/license. Coefficients are numerical
 * algorithm constants, not strategy configuration. IEEE double precision throughout.
 */
const P = [2.46196981473530512524e-10,5.64189564831068821977e-1,7.46321056442269912687,4.86371970985681366614e1,1.96520832956077098242e2,5.26445194995477358631e2,9.34528527171957607540e2,1.02755188689515710272e3,5.57535335369399327526e2];
const Q = [1.32281951154744992508e1,8.67072140885989742329e1,3.54937778887819891062e2,9.75708501743205489753e2,1.82390916687909736289e3,2.24633760818710981792e3,1.65666309194161350182e3,5.57535340817727675546e2];
const R = [5.64189583547755073984e-1,1.27536670759978104416,5.01905042251180477414,6.16021097993053585195,7.40974269950448939160,2.97886665372100240670];
const S = [2.26052863220117276590,9.39603524938001434673,1.20489539808096656605e1,1.70814450747565897222e1,9.60896809063285878198,3.36907645100081516050];
const T = [9.60497373987051638749,9.00260197203842689217e1,2.23200534594684319226e3,7.00332514112805075473e3,5.55923013010394962768e4];
const U = [3.35617141647503099647e1,5.21357949780152679795e2,4.59432382970980127987e3,2.26290000613890934246e4,4.92673942608635921086e4];
function polevl(x: number, coefficients: readonly number[]) { return coefficients.slice(1).reduce((v, c) => v * x + c, coefficients[0]!); }
function p1evl(x: number, coefficients: readonly number[]) { return coefficients.slice(1).reduce((v, c) => v * x + c, x + coefficients[0]!); }
function erf(x: number): number {
  if (x < 0) return -erf(-x);
  if (Math.abs(x) > 1) return 1 - erfc(x);
  return x * polevl(x * x, T) / p1evl(x * x, U);
}
function erfc(a: number): number {
  const x = Math.abs(a);
  if (x < 1) return 1 - erf(a);
  const z = -a * a;
  if (z < -709.782712893383973096) return a < 0 ? 2 : 0;
  const p = polevl(x, x < 8 ? P : R), q = p1evl(x, x < 8 ? Q : S);
  const y = Math.exp(z) * p / q;
  return a < 0 ? 2 - y : y;
}
export function normalCdf(a: number): number {
  const x = a * Math.SQRT1_2, z = Math.abs(x);
  if (z < 1) return 0.5 + 0.5 * erf(x);
  const y = 0.5 * erfc(z); return x > 0 ? 1 - y : y;
}
