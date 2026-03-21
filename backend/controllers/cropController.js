const pool = require('../config/database');

// Rule-based crop recommendation engine
const CROP_RULES = {
  rice: {
    soils: ['clay', 'loamy', 'silt'],
    seasons: ['kharif'],
    minRainfall: 'high',
    tempRange: [20, 40],
    states: ['West Bengal', 'Bihar', 'Odisha', 'Tamil Nadu', 'Andhra Pradesh', 'Assam'],
    score_factors: { clay: 10, loamy: 8, silt: 9, kharif: 10, high_water: 10 }
  },
  wheat: {
    soils: ['loamy', 'clay', 'mixed'],
    seasons: ['rabi'],
    tempRange: [5, 25],
    states: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh', 'Rajasthan'],
    score_factors: { loamy: 10, clay: 7, rabi: 10 }
  },
  potato: {
    soils: ['loamy', 'sandy', 'mixed'],
    seasons: ['rabi'],
    tempRange: [10, 20],
    states: ['West Bengal', 'Uttar Pradesh', 'Bihar', 'Gujarat', 'Punjab'],
    score_factors: { loamy: 9, sandy: 8, rabi: 10, winter: 9 }
  },
  onion: {
    soils: ['loamy', 'sandy'],
    seasons: ['rabi', 'kharif'],
    tempRange: [13, 35],
    states: ['Maharashtra', 'Karnataka', 'West Bengal', 'Madhya Pradesh'],
    score_factors: { loamy: 9, sandy: 8 }
  },
  jute: {
    soils: ['loamy', 'clay', 'silt'],
    seasons: ['kharif'],
    tempRange: [24, 38],
    states: ['West Bengal', 'Bihar', 'Assam', 'Odisha'],
    score_factors: { clay: 10, loamy: 9, silt: 9, kharif: 10, bengal: 10 }
  },
  mustard: {
    soils: ['loamy', 'clay', 'mixed'],
    seasons: ['rabi'],
    tempRange: [5, 25],
    states: ['Rajasthan', 'Uttar Pradesh', 'Haryana', 'West Bengal', 'Madhya Pradesh'],
    score_factors: { loamy: 9, clay: 8, rabi: 10, low_water: 8 }
  },
  maize: {
    soils: ['loamy', 'sandy', 'mixed'],
    seasons: ['kharif'],
    tempRange: [18, 35],
    score_factors: { loamy: 10, sandy: 7, kharif: 9 }
  },
  tomato: {
    soils: ['loamy', 'sandy', 'mixed'],
    seasons: ['kharif', 'rabi'],
    tempRange: [15, 30],
    score_factors: { loamy: 10, sandy: 7 }
  },
  cauliflower: {
    soils: ['loamy', 'sandy'],
    seasons: ['rabi'],
    tempRange: [10, 22],
    states: ['West Bengal', 'Bihar', 'Odisha', 'Haryana', 'Uttar Pradesh'],
    score_factors: { loamy: 9, sandy: 7, rabi: 10, bengal: 9 }
  },
  brinjal: {
    soils: ['loamy', 'sandy', 'mixed'],
    seasons: ['kharif'],
    tempRange: [20, 35],
    states: ['West Bengal', 'Odisha', 'Karnataka', 'Andhra Pradesh', 'Maharashtra'],
    score_factors: { loamy: 9, sandy: 7, kharif: 8, bengal: 9 }
  }
};

const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) return 'kharif';
  if (month >= 10 || month <= 2) return 'rabi';
  return 'zaid';
};

const scoreCrop = (cropName, soil_type, state, season, land_size) => {
  const rule = CROP_RULES[cropName.toLowerCase()];
  if (!rule) return 0;

  let score = 0;
  const reasons = [];

  // Soil match
  if (rule.soils.includes(soil_type)) {
    score += 30;
    reasons.push(`${soil_type} soil is ideal for ${cropName}`);
  } else {
    score -= 10;
    reasons.push(`${soil_type} soil is not optimal for ${cropName}`);
  }

  // Season match
  if (rule.seasons.includes(season)) {
    score += 25;
    reasons.push(`${season} is the right season for ${cropName}`);
  } else {
    score -= 15;
  }

  // State suitability
  if (rule.states && rule.states.includes(state)) {
    score += 20;
    reasons.push(`${state} has good agro-climatic conditions for ${cropName}`);
  }

  // Land size bonus for certain crops
  if (land_size > 2 && ['sugarcane', 'rice', 'wheat'].includes(cropName.toLowerCase())) {
    score += 10;
    reasons.push('Your land size is sufficient for bulk production');
  }
  if (land_size < 1 && ['tomato', 'brinjal', 'cauliflower', 'onion'].includes(cropName.toLowerCase())) {
    score += 10;
    reasons.push('Vegetable crops give high income on small land');
  }

  return { score: Math.max(0, score), reasons };
};

const recommend = async (req, res) => {
  try {
    const { soil_type, state, land_size, season: inputSeason, water_availability, budget } = req.body;

    if (!soil_type || !land_size) {
      return res.status(400).json({ success: false, message: 'Soil type and land size are required' });
    }

    const season = inputSeason || getCurrentSeason();
    const farmerState = state || 'West Bengal';

    // Get crop data from DB
    const cropsResult = await pool.query('SELECT * FROM crops');
    const dbCrops = cropsResult.rows;

    // Score and rank crops
    const scoredCrops = dbCrops.map(crop => {
      const { score, reasons } = scoreCrop(crop.name, soil_type, farmerState, season, parseFloat(land_size));

      const estimatedCost = crop.cost_per_acre * parseFloat(land_size);
      const estimatedYield = crop.yield_per_acre * parseFloat(land_size);

      // Get average market price
      const avgPrice = estimatedYield > 0 ? estimatedCost / estimatedYield * 1.5 : 20;
      const estimatedRevenue = estimatedYield * avgPrice;
      const estimatedProfit = estimatedRevenue - estimatedCost;

      return {
        crop_name: crop.name,
        season: crop.season,
        score,
        reasons: reasons.slice(0, 3),
        expected_yield: `${estimatedYield.toFixed(0)} kg`,
        estimated_cost: `₹${estimatedCost.toLocaleString('en-IN')}`,
        expected_revenue: `₹${estimatedRevenue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
        expected_profit: `₹${estimatedProfit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
        growth_days: crop.growth_days,
        water_requirement: crop.water_requirement,
        suitability: score >= 50 ? 'High' : score >= 30 ? 'Medium' : 'Low'
      };
    });

    // Sort by score descending
    scoredCrops.sort((a, b) => b.score - a.score);

    const topRecommendations = scoredCrops.slice(0, 5);

    // Log recommendation
    if (req.user) {
      await pool.query(
        'INSERT INTO recommendation_logs (user_id, input_data, recommendations) VALUES ($1, $2, $3)',
        [req.user.userId, JSON.stringify(req.body), JSON.stringify(topRecommendations)]
      );
    }

    res.json({
      success: true,
      season_detected: season,
      recommendations: topRecommendations,
      explanation: `Based on ${soil_type} soil, ${farmerState} region, ${land_size} acres land during ${season} season.`
    });
  } catch (err) {
    console.error('Crop recommend error:', err);
    res.status(500).json({ success: false, message: 'Error generating recommendations' });
  }
};

module.exports = { recommend };3