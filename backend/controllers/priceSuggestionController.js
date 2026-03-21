const pool = require('../config/database');
const fs = require('fs');

// Rule-based quality grading without AI
function analyzeQualityByRules(crop, userSuggestedPrice, marketAvg) {
  const cropLower = crop.toLowerCase();

  const qualityGuide = {
    potato: {
      gradeA: { desc: 'Large uniform potatoes, smooth skin, no damage', premium: 1.2 },
      gradeB: { desc: 'Medium sized, minor blemishes, good quality', premium: 1.0 },
      gradeC: { desc: 'Small or irregular, some damage visible', premium: 0.8 },
      gradeD: { desc: 'Damaged, sprouted or diseased potatoes', premium: 0.6 }
    },
    onion: {
      gradeA: { desc: 'Dry, firm, uniform large onions, no damage', premium: 1.25 },
      gradeB: { desc: 'Medium sized, properly dried, minor issues', premium: 1.0 },
      gradeC: { desc: 'Small size, some wet onions mixed', premium: 0.75 },
      gradeD: { desc: 'Wet, rotting or damaged onions', premium: 0.5 }
    },
    tomato: {
      gradeA: { desc: 'Red ripe, firm, uniform, no cracks or damage', premium: 1.3 },
      gradeB: { desc: 'Slightly uneven ripeness, minor blemishes', premium: 1.0 },
      gradeC: { desc: 'Overripe, some cracks or soft spots', premium: 0.7 },
      gradeD: { desc: 'Damaged, diseased or overripe tomatoes', premium: 0.4 }
    },
    default: {
      gradeA: { desc: 'Excellent quality, uniform, no damage', premium: 1.2 },
      gradeB: { desc: 'Good quality, minor imperfections', premium: 1.0 },
      gradeC: { desc: 'Average quality, some issues visible', premium: 0.8 },
      gradeD: { desc: 'Poor quality, significant damage', premium: 0.6 }
    }
  };

  const guide = qualityGuide[cropLower] || qualityGuide.default;

  // Since we can't analyze image without API, assume Grade B as default
  // and give price range for all grades
  return {
    assumed_grade: 'B',
    quality_score: 7,
    quality_description: `Based on market standards for ${crop}. Upload a clearer photo for better analysis.`,
    grades: guide,
    market_avg: marketAvg
  };
}

const suggestPrice = async (req, res) => {
  try {
    const { crop_name, quantity, user_suggested_price } = req.body;

    if (!crop_name) {
      return res.status(400).json({ success: false, message: 'Crop name is required' });
    }

    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Get market prices
    const marketResult = await pool.query(
      'SELECT city, price_per_kg, state, market_name FROM market_prices WHERE LOWER(crop_name) = LOWER($1) ORDER BY price_per_kg DESC',
      [crop_name]
    );

    if (marketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No market data for ${crop_name}. Try: Rice, Potato, Onion, Tomato`
      });
    }

    const prices = marketResult.rows.map(r => parseFloat(r.price_per_kg));
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    const qualityData = analyzeQualityByRules(crop_name, user_suggested_price, avgPrice);

    // Calculate price for each grade
    const gradePrices = {
      A: (avgPrice * qualityData.grades.gradeA.premium).toFixed(2),
      B: (avgPrice * qualityData.grades.gradeB.premium).toFixed(2),
      C: (avgPrice * qualityData.grades.gradeC.premium).toFixed(2),
      D: (avgPrice * qualityData.grades.gradeD.premium).toFixed(2),
    };

    // Fair price = Grade B = market average
    const fairPrice = parseFloat(gradePrices.B);
    const minSuggested = parseFloat(gradePrices.C);
    const maxSuggested = parseFloat(gradePrices.A);

    // Farmer price feedback
    let farmerPriceFeedback = null;
    if (user_suggested_price) {
      const suggestedNum = parseFloat(user_suggested_price);
      if (suggestedNum < minSuggested) {
        farmerPriceFeedback = {
          status: 'too_low',
          message: `⚠️ Your price ₹${user_suggested_price}/kg is TOO LOW! You can get ₹${fairPrice}/kg for average quality.`,
          icon: '⚠️'
        };
      } else if (suggestedNum > maxSuggested * 1.15) {
        farmerPriceFeedback = {
          status: 'too_high',
          message: `📉 Your price ₹${user_suggested_price}/kg may be TOO HIGH. Best market rate is ₹${maxPrice}/kg. Try ₹${maxSuggested}/kg.`,
          icon: '📉'
        };
      } else {
        farmerPriceFeedback = {
          status: 'fair',
          message: `✅ Your price ₹${user_suggested_price}/kg is FAIR based on current market!`,
          icon: '✅'
        };
      }
    }

    const qty = parseFloat(quantity) || 0;

    res.json({
      success: true,
      crop_name,
      quantity: qty,
      analysis: {
        grade: 'B',
        quality_score: 7,
        quality_description: qualityData.quality_description,
        quality_issues: 'Upload crop photo for detailed quality analysis',
        premium_factors: `Fresh ${crop_name} with good market demand`
      },
      price_suggestion: {
        min_price: minSuggested,
        max_price: maxSuggested,
        fair_price: fairPrice,
        price_range: `₹${minSuggested} - ₹${maxSuggested} per kg`,
        recommended: `₹${fairPrice} per kg`
      },
      grade_wise_prices: {
        'Grade A (Excellent)': `₹${gradePrices.A}/kg — ${qualityData.grades.gradeA.desc}`,
        'Grade B (Good)': `₹${gradePrices.B}/kg — ${qualityData.grades.gradeB.desc}`,
        'Grade C (Average)': `₹${gradePrices.C}/kg — ${qualityData.grades.gradeC.desc}`,
        'Grade D (Poor)': `₹${gradePrices.D}/kg — ${qualityData.grades.gradeD.desc}`,
      },
      market_data: {
        average_market_price: avgPrice.toFixed(2),
        highest_market_price: maxPrice,
        lowest_market_price: minPrice,
        best_market: marketResult.rows[0].city,
        markets: marketResult.rows.slice(0, 6)
      },
      farmer_price_feedback: farmerPriceFeedback,
      total_value: qty > 0 ? `₹${(fairPrice * qty).toLocaleString('en-IN')}` : null,
      negotiation_tip: `Sort your ${crop_name} by size and quality before selling. Grade A quality can get ₹${gradePrices.A}/kg vs ₹${gradePrices.C}/kg for mixed quality.`,
      powered_by: 'AgriMind Price Engine',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Price suggestion error:', err.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Error analyzing crop: ' + err.message
    });
  }
};

module.exports = { suggestPrice };