const express = require('express');
const router = express.Router();
const { getSmartMarketSuggestion } = require('../controllers/aiMarketController');
const { optionalAuth } = require('../middleware/auth');

router.post('/suggest', optionalAuth, getSmartMarketSuggestion);

module.exports = router;