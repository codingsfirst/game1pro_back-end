// Total add fund amount -> level mapping
// 1: 0–199, 2: 200–299, 3: 300–499, 4: 500–799, 5: 800–1199,
// 6: 1200–1699, 7: 1700–2499, 8: 2500–3999, 9+: 4000+ ...
const LEVEL_BANDS = [
  { min: 0, max: 199, level: 1 },
  { min: 200, max: 299, level: 2 },
  { min: 300, max: 499, level: 3 },
  { min: 500, max: 799, level: 4 },
  { min: 800, max: 1199, level: 5 },
  { min: 1200, max: 1699, level: 6 },
  { min: 1700, max: 2499, level: 7 },
  { min: 2500, max: 3999, level: 8 }
];

export function calculateLevel(totalAddFund) {
  const amount = Number(totalAddFund || 0);

  for (const band of LEVEL_BANDS) {
    if (amount >= band.min && amount <= band.max) {
      return band.level;
    }
  }

  // 4000 se upar: har extra 2000 pe level +1
  if (amount >= 4000) {
    const extra = amount - 4000;
    const extraLevels = Math.floor(extra / 2000); // adjust if you want
    return 9 + extraLevels;
  }

  return 1;
}
