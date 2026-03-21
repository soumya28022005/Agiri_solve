const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../config/database');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function estimateTransport(fromLocation, toCity, quantity) {
  const distanceMap = {
    'Kolkata': 50, 'Howrah': 45, 'Durgapur': 150,
    'Asansol': 200, 'Siliguri': 600, 'Delhi': 1500,
    'Mumbai': 2000, 'Patna': 500, 'Bhubaneswar': 400,
  };
  const distance = distanceMap[toCity] || 300;
  const baseCost = distance * 2;
  const weightCost = quantity > 500 ? quantity * 0.5 : 0;
  return Math.round(baseCost + weightCost);
}

const getSmartMarketSuggestion = async (req, res) => {
  try {
    const { crop, quantity, location, transport_budget } = req.body;

    if (!crop || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Crop name and quantity are required'
      });
    }

    const qty = parseFloat(quantity);

    // Get market prices from database
    const pricesResult = await pool.query(
      'SELECT * FROM market_prices WHERE LOWER(crop_name) = LOWER($1) ORDER BY price_per_kg DESC',
      [crop]
    );

    if (pricesResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No market data found for ${crop}. Try: Rice, Potato, Onion, Tomato`
      });
    }

    // Calculate profit for each city
    const calculations = pricesResult.rows.map(row => {
      const totalRevenue = row.price_per_kg * qty;
      const estimatedTransport = estimateTransport(location, row.city, qty);
      const netProfit = totalRevenue - estimatedTransport;
      return {
        city: row.city,
        state: row.state,
        market_name: row.market_name,
        price_per_kg: row.price_per_kg,
        total_revenue: totalRevenue,
        estimated_transport: estimatedTransport,
        net_profit: netProfit,
        is_profitable: netProfit > 0
      };
    });

    calculations.sort((a, b) => b.net_profit - a.net_profit);

    // Ask Gemini AI for smart advice
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const marketSummary = calculations.slice(0, 5).map(m =>
      `${m.city} (${m.state}): ₹${m.price_per_kg}/kg, Revenue=₹${m.total_revenue}, Transport=₹${m.estimated_transport}, Profit=₹${m.net_profit}`
    ).join('\n');

    const prompt = `
You are an expert agricultural advisor for Indian farmers. Give practical advice in simple English.

Farmer Details:
- Crop: ${crop}
- Quantity: ${qty} kg
- Location: ${location || 'West Bengal, India'}
- Transport Budget: ₹${transport_budget || 'flexible'}

Top 5 Markets:
${marketSummary}

Please give:
1. BEST MARKET to sell and exact reason why
2. PROFIT CALCULATION for top 2 markets
3. BEST TIME OF DAY to sell (morning/evening)
4. ONE negotiation tip for this specific crop
5. Should farmer sell TODAY or WAIT? (Give specific reason)

Keep response short, practical and farmer-friendly. Use ₹ symbol for prices.
`;

    const result = await model.generateContent(prompt);
    const aiAdvice = result.response.text();

    res.json({
      success: true,
      crop,
      quantity: qty,
      location: location || 'West Bengal',
      best_market: calculations[0],
      all_markets: calculations,
      ai_recommendation: aiAdvice,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('AI Market error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Error getting AI recommendation: ' + err.message
    });
  }
};

module.exports = { getSmartMarketSuggestion };