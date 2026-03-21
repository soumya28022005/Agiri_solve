const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { getPrices, calculateProfit, updatePrice } = require('../controllers/marketController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

router.get('/prices', getPrices);
router.post('/calculate-profit', calculateProfit);
router.post('/prices', authenticateToken, updatePrice);
router.post('/estimate-profit', marketController.calculateSmartProfit);

module.exports = router;