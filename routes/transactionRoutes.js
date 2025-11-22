const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");
const {
  createDeposit,
  createWithdraw,
  getMyTransactions,
  approveTransaction,
  rejectTransaction,
} = require("../controllers/transactionController");

// user routes
router.use(protect);
router.post("/deposit", createDeposit);
router.post("/withdraw", createWithdraw);
router.get("/my", getMyTransactions);

// admin routes
router.patch("/:id/approve", adminOnly, approveTransaction);
router.patch("/:id/reject", adminOnly, rejectTransaction);

module.exports = router;
