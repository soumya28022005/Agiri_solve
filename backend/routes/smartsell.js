const express = require('express');
const router = express.Router();
const {
  getSmartSellSuggestion,
  updateBuyerPrice,
  getBuyerPrices,
  getBuyerProfile,
  updateBuyerProfile
} = require('../controllers/smartSellController');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');

router.post('/suggest', authenticateToken, getSmartSellSuggestion);
router.post('/buyer/price', authenticateToken, updateBuyerPrice);
router.get('/buyer/prices', getBuyerPrices);
router.get('/buyer/profile', authenticateToken, getBuyerProfile);
router.post('/buyer/profile', authenticateToken, updateBuyerProfile);

router.put('/buyer/price/:id/deactivate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE buyer_prices SET is_active = false WHERE id = $1', [id]);
    res.json({ success: true, message: 'Price removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;