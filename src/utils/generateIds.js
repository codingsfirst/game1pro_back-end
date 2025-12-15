export function generateUserId(seq = null) {
  // e.g. G1P-102938
  const random = seq || Math.floor(100000 + Math.random() * 900000);
  return `G1P-${random}`;
}

export function generateReferralCode() {
  // e.g. G1REF-AB12CD
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "G1";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
