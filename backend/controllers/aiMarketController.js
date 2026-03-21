const pool = require('../config/database');

function estimateTransport(fromLocation, toCity, quantity) {
  const distanceMap = {
    'Kolkata': 50, 'Howrah': 45, 'Durgapur': 150,
    'Asansol': 200, 'Siliguri': 600, 'Delhi': 1500,
    'Mumbai': 2000, 'Patna': 500, 'Bhubaneswar': 400,
  };
  const distance = distanceMap[toCity] || 300;

  // Variable transport based on quantity
  let vehicleType, baseCost, perKgCost;

  if (quantity <= 50) {
    vehicleType = 'Bicycle/Auto';
    baseCost = distance * 1;
    perKgCost = 0.5;
  } else if (quantity <= 200) {
    vehicleType = 'Small Vehicle';
    baseCost = distance * 2;
    perKgCost = 0.8;
  } else if (quantity <= 500) {
    vehicleType = 'Mini Truck';
    baseCost = distance * 3;
    perKgCost = 1.2;
  } else if (quantity <= 1000) {
    vehicleType = 'Medium Truck';
    baseCost = distance * 4;
    perKgCost = 1.5;
  } else {
    vehicleType = 'Large Truck';
    baseCost = distance * 5;
    perKgCost = 1.8;
  }

  const totalCost = Math.round(baseCost + (perKgCost * quantity));
  return { cost: totalCost, vehicle: vehicleType };
}

function generateSmartAdvice(crop, qty, location, calculations) {
  const best = calculations[0];
  const second = calculations[1];
  const cropLower = crop.toLowerCase();

  const bestTime = {
    potato: 'Early morning (6-9 AM) — highest demand before restaurants open',
    onion: 'Morning (7-10 AM) — best prices before afternoon heat',
    tomato: 'Early morning (5-8 AM) — sell fresh before spoilage',
    rice: 'Afternoon (2-5 PM) — bulk buyers active',
    wheat: 'Morning (8-11 AM) — mill agents arrive early',
    jute: 'Morning (9 AM-12 PM) — factory agents buy in bulk',
    cauliflower: 'Early morning (5-7 AM) — fresh vegetables sell fast',
    brinjal: 'Morning (6-9 AM) — daily vegetable buyers arrive early',
  };

  const negotiationTips = {
    potato: 'Show clean uniform potatoes first. 500kg+ gets 10-15% better rate.',
    onion: 'Dry onions command premium. Remove wet or damaged ones before showing.',
    tomato: 'Sell within 2 days of harvest. Grade A tomatoes separately.',
    rice: 'Dry rice (14% moisture or less) gets MSP or above.',
    wheat: 'Clean wheat without stones gets ₹2-3/kg premium at flour mills.',
    cauliflower: 'White tight heads command premium. Cover with leaves during transport.',
    brinjal: 'Shiny purple brinjals get best price. Avoid any with cuts or bruises.',
  };

  const sellDecision = {
    potato: 'Potato prices rise in summer (March-June). If before March WAIT, else sell NOW.',
    onion: 'Onion prices are volatile. Sell TODAY if price is above ₹30/kg.',
    tomato: 'Tomato spoils fast. SELL TODAY — waiting loses quality and money.',
    rice: 'Rice prices are stable. You can WAIT 1-2 weeks for better price.',
    wheat: 'Wheat prices rise after April. If before April WAIT, else sell NOW.',
    cauliflower: 'SELL TODAY — cauliflower quality drops fast after harvest.',
  };

  const timeAdvice = bestTime[cropLower] || 'Early morning (6-10 AM) — best prices and fresh quality';
  const negotiationAdvice = negotiationTips[cropLower] || 'Sort and grade your produce — graded produce gets 15-20% higher price.';
  const sellAdvice = sellDecision[cropLower] || `Current price ₹${best.price_per_kg}/kg. ${best.price_per_kg > 25 ? 'GOOD — sell TODAY' : 'Average — WAIT 1 week if storage available'}.`;

  return `
🏆 BEST MARKET: ${best.city} (${best.state})
Reason: Highest price ₹${best.price_per_kg}/kg with ${best.transport_info.vehicle} transport cost ₹${best.transport_info.cost}

💰 PROFIT CALCULATION:
- ${best.city}: ₹${best.price_per_kg} × ${qty}kg - ₹${best.transport_info.cost} (${best.transport_info.vehicle}) = ₹${best.net_profit} profit
${second ? `• ${second.city}: ₹${second.price_per_kg} × ${qty}kg - ₹${second.transport_info.cost} (${second.transport_info.vehicle}) = ₹${second.net_profit} profit` : ''}

🚛 TRANSPORT INFO FOR ${qty}kg:
Vehicle recommended: ${best.transport_info.vehicle}
${qty <= 50 ? '✅ Small quantity — use auto/bicycle to save cost' : qty <= 200 ? '✅ Medium quantity — small vehicle is ideal' : qty <= 500 ? '✅ Good quantity — hire mini truck for best rate' : '✅ Large quantity — full truck gives best per-kg transport cost'}

⏰ BEST TIME TO SELL:
${timeAdvice}

🤝 NEGOTIATION TIP:
${negotiationAdvice}

📅 SELL TODAY OR WAIT?
${sellAdvice}

📍 ALL PROFITABLE MARKETS:
${calculations.filter(c => c.is_profitable).map((c, i) => `${i + 1}. ${c.city} — ₹${c.net_profit} profit (${c.transport_info.vehicle})`).join('\n')}
  `.trim();
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

    const pricesResult = await pool.query(
      'SELECT * FROM market_prices WHERE LOWER(crop_name) = LOWER($1) ORDER BY price_per_kg DESC',
      [crop]
    );

    if (pricesResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No market data found for ${crop}. Try: Rice, Potato, Onion, Tomato, Cauliflower`
      });
    }

    const calculations = pricesResult.rows.map(row => {
      const totalRevenue = row.price_per_kg * qty;
      const transportInfo = estimateTransport(location, row.city, qty);
      const netProfit = totalRevenue - transportInfo.cost;
      return {
        city: row.city,
        state: row.state,
        market_name: row.market_name,
        price_per_kg: row.price_per_kg,
        total_revenue: totalRevenue,
        transport_info: transportInfo,
        estimated_transport: transportInfo.cost,
        net_profit: netProfit,
        is_profitable: netProfit > 0
      };
    });

    calculations.sort((a, b) => b.net_profit - a.net_profit);

    const aiAdvice = generateSmartAdvice(crop, qty, location, calculations);

    res.json({
      success: true,
      crop,
      quantity: qty,
      location: location || 'West Bengal',
      best_market: calculations[0],
      all_markets: calculations,
      ai_recommendation: aiAdvice,
      powered_by: 'AgriMind AI',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('AI Market error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Error getting recommendation: ' + err.message
    });
  }
};

module.exports = { getSmartMarketSuggestion };