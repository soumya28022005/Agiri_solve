const Groq = require('groq-sdk');
const pool = require('../config/database');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function calculateTransport(quantity, distanceKm) {
  let vehicleType, costPerKm, loadingCost;
  if (quantity <= 50) { vehicleType = '🛺 Auto Rickshaw'; costPerKm = 8; loadingCost = 50; }
  else if (quantity <= 150) { vehicleType = '🚐 Tempo/Mini Van'; costPerKm = 15; loadingCost = 100; }
  else if (quantity <= 500) { vehicleType = '🚛 Mini Truck (Tata Ace)'; costPerKm = 22; loadingCost = 200; }
  else if (quantity <= 1500) { vehicleType = '🚚 Medium Truck'; costPerKm = 35; loadingCost = 400; }
  else { vehicleType = '🚜 Large Truck'; costPerKm = 50; loadingCost = 600; }
  const transportCost = Math.round((distanceKm * costPerKm) + loadingCost);
  return { vehicleType, transportCost, distanceKm };
}

const getSmartSellSuggestion = async (req, res) => {
  try {
    const { crop_name, quantity, farmer_location } = req.body;
    if (!crop_name || !quantity || !farmer_location) {
      return res.status(400).json({ success: false, message: 'Crop name, quantity and location are required' });
    }
    const qty = parseFloat(quantity);

    const mandiResult = await pool.query(
      'SELECT city, state, price_per_kg, market_name FROM market_prices WHERE LOWER(crop_name) = LOWER($1) ORDER BY price_per_kg DESC',
      [crop_name]
    );
    const buyerResult = await pool.query(`
      SELECT bp.price_per_kg, bp.min_quantity, bp.max_quantity, bp.crop_name,
        b.company_name, b.city, b.district, b.state, b.phone,
        u.name as buyer_name, u.phone as buyer_phone
      FROM buyer_prices bp
      JOIN buyers b ON b.id = bp.buyer_id
      JOIN users u ON u.id = bp.user_id
      WHERE LOWER(bp.crop_name) = LOWER($1) AND bp.is_active = true
        AND bp.date_updated >= CURRENT_DATE - INTERVAL '3 days'
      ORDER BY bp.price_per_kg DESC
    `, [crop_name]);

    if (mandiResult.rows.length === 0 && buyerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: `No market data found for ${crop_name}` });
    }

    const allDestinations = [];
    mandiResult.rows.forEach(m => allDestinations.push({ name: m.market_name || `${m.city} Mandi`, city: m.city, state: m.state, price_per_kg: parseFloat(m.price_per_kg), type: 'mandi', phone: '1800-270-0224' }));
    buyerResult.rows.forEach(b => allDestinations.push({ name: b.company_name || b.buyer_name, city: b.city, state: b.state, price_per_kg: parseFloat(b.price_per_kg), type: 'buyer', phone: b.phone || b.buyer_phone }));

    const destinationList = allDestinations.map((d, i) => `${i + 1}. ${d.city} (${d.state})`).join('\n');

    const distancePrompt = `You are a geography expert for Indian cities.
Farmer is at: "${farmer_location}"
Calculate road distance in km from "${farmer_location}" to each city:
${destinationList}
Respond ONLY in this JSON format:
{"farmer_location_identified": "full name", "distances": [{"index": 1, "city": "name", "distance_km": 45}]}`;

    let distances = [];
    let farmerLocationName = farmer_location;
    try {
      const distResponse = await groq.chat.completions.create({
        messages: [{ role: 'user', content: distancePrompt }],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.1
      });
      const jsonMatch = distResponse.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        distances = parsed.distances || [];
        farmerLocationName = parsed.farmer_location_identified || farmer_location;
      }
    } catch (err) {
      console.log('Distance calc error:', err.message);
    }

    const allOptions = allDestinations.map((dest, i) => {
      const distData = distances.find(d => d.index === i + 1);
      const distanceKm = distData?.distance_km || 200;
      const transport = calculateTransport(qty, distanceKm);
      const totalRevenue = dest.price_per_kg * qty;
      const netProfit = totalRevenue - transport.transportCost;
      return { ...dest, distance_km: distanceKm, transport, total_revenue: totalRevenue, net_profit: netProfit, is_profitable: netProfit > 0, badge: dest.type === 'buyer' ? '🏪 Direct Buyer' : '🏛️ Mandi' };
    });

    allOptions.sort((a, b) => b.net_profit - a.net_profit);
    const bestOption = allOptions[0];

    const topSummary = allOptions.slice(0, 4).map(o =>
      `${o.name} (${o.city}, ${o.distance_km}km): ₹${o.price_per_kg}/kg, ${o.transport.vehicleType}, transport=₹${o.transport.transportCost}, profit=₹${o.net_profit}`
    ).join('\n');

    let aiAdvice = `Best option: Sell at ${bestOption.name} in ${bestOption.city}. Net profit: ₹${bestOption.net_profit.toLocaleString('en-IN')}.`;
    try {
      const advResponse = await groq.chat.completions.create({
        messages: [{ role: 'user', content: `Farmer from ${farmerLocationName} wants to sell ${qty}kg of ${crop_name}.\nTop options:\n${topSummary}\nGive 3 short practical tips.` }],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.3
      });
      aiAdvice = advResponse.choices[0].message.content;
    } catch (err) { console.log('Advice error:', err.message); }

    res.json({
      success: true, crop: crop_name, quantity: qty,
      farmer_location: farmerLocationName,
      best_option: bestOption, all_options: allOptions,
      profitable_count: allOptions.filter(o => o.is_profitable).length,
      ai_advice: aiAdvice,
      summary: { total_options: allOptions.length, direct_buyers: buyerResult.rows.length, mandi_options: mandiResult.rows.length, best_profit: bestOption?.net_profit || 0, best_city: bestOption?.city || 'N/A' },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Smart sell error:', err.message);
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
};

const updateBuyerPrice = async (req, res) => {
  try {
    const { crop_name, price_per_kg, min_quantity, max_quantity } = req.body;
    const userId = req.user.userId;
    if (!crop_name || !price_per_kg) {
      return res.status(400).json({ success: false, message: 'Crop name and price are required' });
    }
    let buyerResult = await pool.query('SELECT id FROM buyers WHERE user_id = $1', [userId]);
    if (buyerResult.rows.length === 0) {
      const userResult = await pool.query('SELECT name, phone FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];
      const newBuyer = await pool.query(
        `INSERT INTO buyers (user_id, company_name, city, state, phone) VALUES ($1, $2, 'Kolkata', 'West Bengal', $3) RETURNING id`,
        [userId, user.name + ' Trading', user.phone]
      );
      buyerResult = { rows: [{ id: newBuyer.rows[0].id }] };
    }
    const buyerId = buyerResult.rows[0].id;
    await pool.query(`UPDATE buyer_prices SET is_active = false WHERE buyer_id = $1 AND LOWER(crop_name) = LOWER($2)`, [buyerId, crop_name]);
    await pool.query(
      `INSERT INTO buyer_prices (buyer_id, user_id, crop_name, price_per_kg, min_quantity, max_quantity) VALUES ($1, $2, $3, $4, $5, $6)`,
      [buyerId, userId, crop_name, price_per_kg, min_quantity || 0, max_quantity || null]
    );
    res.json({ success: true, message: `Price updated: ${crop_name} at ₹${price_per_kg}/kg` });
  } catch (err) {
    console.error('Update price error:', err.message);
    res.status(500).json({ success: false, message: 'Error: ' + err.message });
  }
};

const getBuyerPrices = async (req, res) => {
  try {
    const { crop } = req.query;
    let query = `SELECT bp.crop_name, bp.price_per_kg, bp.min_quantity, bp.max_quantity, bp.date_updated, b.company_name, b.city, b.district, b.state, b.phone FROM buyer_prices bp JOIN buyers b ON b.id = bp.buyer_id WHERE bp.is_active = true AND bp.date_updated >= CURRENT_DATE - INTERVAL '3 days'`;
    const params = [];
    if (crop) { query += ` AND LOWER(bp.crop_name) = LOWER($1)`; params.push(crop); }
    query += ' ORDER BY bp.price_per_kg DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, prices: result.rows, total: result.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getBuyerProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query('SELECT * FROM buyers WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) return res.json({ success: true, buyer: null, active_prices: [] });
    const prices = await pool.query(
      `SELECT * FROM buyer_prices WHERE buyer_id = $1 AND is_active = true ORDER BY date_updated DESC`,
      [result.rows[0].id]
    );
    res.json({ success: true, buyer: result.rows[0], active_prices: prices.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateBuyerProfile = async (req, res) => {
  try {
    const { company_name, city, district, state, address, phone } = req.body;
    const userId = req.user.userId;
    const existing = await pool.query('SELECT id FROM buyers WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      await pool.query(`UPDATE buyers SET company_name=$1, city=$2, district=$3, state=$4, address=$5, phone=$6 WHERE user_id=$7`,
        [company_name, city, district, state || 'West Bengal', address, phone, userId]);
    } else {
      await pool.query(`INSERT INTO buyers (user_id, company_name, city, district, state, address, phone) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, company_name, city, district, state || 'West Bengal', address, phone]);
    }
    res.json({ success: true, message: 'Buyer profile updated!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getSmartSellSuggestion, updateBuyerPrice, getBuyerPrices, getBuyerProfile, updateBuyerProfile };