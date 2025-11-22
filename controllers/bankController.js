const BankAccount = require("../models/BankAccount");

// GET /api/banks
exports.getBanks = async (req, res, next) => {
  try {
    const accounts = await BankAccount.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

// POST /api/banks
exports.createBank = async (req, res, next) => {
  try {
    const { bankName, holderName, accountNumber, isDefault } = req.body;

    const count = await BankAccount.countDocuments({ user: req.user._id });
    if (count >= 3) {
      return res
        .status(400)
        .json({ message: "You can save maximum 3 payout accounts" });
    }

    let bank = new BankAccount({
      user: req.user._id,
      bankName,
      holderName,
      accountNumber,
      isDefault: !!isDefault,
    });

    // If set default, unset others
    if (isDefault) {
      await BankAccount.updateMany(
        { user: req.user._id, _id: { $ne: bank._id } },
        { $set: { isDefault: false } }
      );
    }

    await bank.save();
    res.status(201).json(bank);
  } catch (err) {
    next(err);
  }
};

// PUT /api/banks/:id
exports.updateBank = async (req, res, next) => {
  try {
    const { bankName, holderName, accountNumber, isDefault } = req.body;

    const bank = await BankAccount.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!bank) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (bankName) bank.bankName = bankName;
    if (holderName) bank.holderName = holderName;
    if (accountNumber) bank.accountNumber = accountNumber;

    if (typeof isDefault === "boolean") {
      bank.isDefault = isDefault;
      if (isDefault) {
        await BankAccount.updateMany(
          { user: req.user._id, _id: { $ne: bank._id } },
          { $set: { isDefault: false } }
        );
      }
    }

    await bank.save();
    res.json(bank);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/banks/:id
exports.deleteBank = async (req, res, next) => {
  try {
    const bank = await BankAccount.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!bank) {
      return res.status(404).json({ message: "Account not found" });
    }

    res.json({ message: "Account deleted" });
  } catch (err) {
    next(err);
  }
};
