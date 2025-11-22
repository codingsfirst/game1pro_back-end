function generateReferralCode(username, userId) {
  const base = (username || "G1P").replace(/\s+/g, "").toUpperCase().slice(0, 4);
  const tail = String(userId).slice(-4);
  return `${base}${tail}`;
}

module.exports = generateReferralCode;
