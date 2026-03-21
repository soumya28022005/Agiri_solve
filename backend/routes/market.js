const express = require('express');
const router = express.Router();
const { getPrices, calculateProfit, updatePrice } = require('../controllers/marketController');
const { authenticateToken } = require('../middleware/auth');

router.get('/prices', getPrices);
router.post('/calculate-profit', calculateProfit);
router.post('/prices', authenticateToken, updatePrice);

module.exports = router;