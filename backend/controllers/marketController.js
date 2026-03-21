const pool = require('../config/database');

const getPrices = async (req, res) => {
  try {
    const { crop, state, city } = req.query;
    let query = 'SELECT * FROM market_prices WHERE 1=1';
    const params = [];
    let paramIdx = 1;
    if (crop) { query += ` AND LOWER(crop_name) = LOWER($${paramIdx++})`; params.push(crop); }
    if (state) { query += ` AND LOWER(state) = LOWER($${paramIdx++})`; params.push(state); }
    if (city) { query += ` AND LOWER(city) = LOWER($${paramIdx++})`; params.push(city); }
    query += ' ORDER BY state, city, crop_name';
    const result = await pool.query(query, params);
    const cropsResult = await pool.query('SELECT DISTINCT crop_name FROM market_prices ORDER BY crop_name');
    const citiesResult = await pool.query('SELECT DISTINCT city, state FROM market_prices ORDER BY state, city');
    res.json({
      success: true,
      prices: result.rows,
      available_crops: cropsResult.rows.map(r => r.crop_name),
      available_cities: citiesResult.rows
    });
  } catch (err) {
    console.error('Get prices error:', err);
    res.status(500).json({ success: false, message: 'Error fetching market prices' });
  }
};

const calculateProfit = async (req, res) => {
  try {
    const { crop, quantity, transport_costs } = req.body;
    if (!crop || !quantity) {
      return res.status(400).json({ success: false, message: 'Crop and quantity are required' });
    }
    const qty = parseFloat(quantity);
    const result = await pool.query(
      'SELECT * FROM market_prices WHERE LOWER(crop_name) = LOWER($1) ORDER BY price_per_kg DESC',
      [crop]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `No market prices found for ${crop}` });
    }
    const calculations = result.rows.map(row => {
      const totalRevenue = row.price_per_kg * qty;
      let transportCost = 0;
      if (transport_costs && transport_costs[row.city] !== undefined) {
        transportCost = parseFloat(transport_costs[row.city]);
      }
      const profit = totalRevenue - transportCost;
      return {
        city: row.city,
        state: row.state,
        market_name: row.market_name,
        price_per_kg: row.price_per_kg,
        total_revenue: totalRevenue,
        transport_cost: transportCost,
        net_profit: profit,
        profit_per_kg: (profit / qty).toFixed(2),
        formula: `${row.price_per_kg} × ${qty} - ${transportCost} = ${profit}`,
        is_profitable: profit > 0
      };
    });
    calculations.sort((a, b) => b.net_profit - a.net_profit);
    const bestOption = calculations[0];
    let recommendation = '';
    if (bestOption.net_profit > 0) {
      recommendation = `Best market: Sell in ${bestOption.city} at ₹${bestOption.price_per_kg}/kg. Net profit: ₹${bestOption.net_profit.toFixed(0)}`;
    } else {
      recommendation = `All options show loss. Try reducing transport cost or selling locally.`;
    }
    res.json({
      success: true,
      crop,
      quantity: qty,
      calculations,
      best_market: bestOption,
      recommendation,
      summary: {
        best_profit_city: bestOption.city,
        max_profit: bestOption.net_profit,
        highest_price_city: calculations.reduce((a, b) => a.price_per_kg > b.price_per_kg ? a : b).city
      }
    });
  } catch (err) {
    console.error('Calculate profit error:', err);
    res.status(500).json({ success: false, message: 'Error calculating profit' });
  }
};

const updatePrice = async (req, res) => {
  try {
    const { city, state, crop_name, price_per_kg, market_name } = req.body;
    const existing = await pool.query(
      'SELECT id FROM market_prices WHERE LOWER(city)=LOWER($1) AND LOWER(crop_name)=LOWER($2)',
      [city, crop_name]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE market_prices SET price_per_kg=$1, date_recorded=CURRENT_DATE WHERE LOWER(city)=LOWER($2) AND LOWER(crop_name)=LOWER($3)',
        [price_per_kg, city, crop_name]
      );
    } else {
      await pool.query(
        'INSERT INTO market_prices (city, state, crop_name, price_per_kg, market_name) VALUES ($1, $2, $3, $4, $5)',
        [city, state, crop_name, price_per_kg, market_name]
      );
    }
    res.json({ success: true, message: 'Price updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating price' });
  }
};

module.exports = { getPrices, calculateProfit, updatePrice };