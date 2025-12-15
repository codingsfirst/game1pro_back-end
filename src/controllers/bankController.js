// GET /api/user/banks
export async function listBanks(req, res) {
  const user = req.user;
  res.json({ banks: user.addedBanks || [] });
}

// POST /api/user/banks
export async function createBank(req, res) {
  try {
    const user = req.user;
    const { bankName, accountTitle, accountNumber } = req.body;

    if (!bankName || !accountTitle || !accountNumber) {
      return res
        .status(400)
        .json({ message: "bankName, accountTitle, accountNumber required" });
    }

    if (user.addedBanks.length >= 3) {
      return res
        .status(400)
        .json({ message: "Maximum 3 payout accounts allowed" });
    }

    user.addedBanks.push({ bankName, accountTitle, accountNumber });
    await user.save();

    res.json({ banks: user.addedBanks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save bank" });
  }
}

// PUT /api/user/banks/:id
export async function updateBank(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;
    const { bankName, accountTitle, accountNumber } = req.body;

    const bank = user.addedBanks.id(id);
    if (!bank) {
      return res.status(404).json({ message: "Bank not found" });
    }

    if (bankName) bank.bankName = bankName;
    if (accountTitle) bank.accountTitle = accountTitle;
    if (accountNumber) bank.accountNumber = accountNumber;

    await user.save();
    res.json({ banks: user.addedBanks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update bank" });
  }
}

// DELETE /api/user/banks/:id
export async function deleteBank(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;

    const bank = user.addedBanks.id(id);
    if (!bank) {
      return res.status(404).json({ message: "Bank not found" });
    }

    bank.deleteOne();
    await user.save();

    res.json({ banks: user.addedBanks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete bank" });
  }
}
