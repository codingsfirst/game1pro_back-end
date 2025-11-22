const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getBanks,
  createBank,
  updateBank,
  deleteBank,
} = require("../controllers/bankController");

router.use(protect);

router.get("/", getBanks);
router.post("/", createBank);
router.put("/:id", updateBank);
router.delete("/:id", deleteBank);

module.exports = router;
