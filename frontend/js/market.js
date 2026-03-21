// ============================================
// AgriMind AI — Market Module
// ============================================

let allPrices = [];
let availableCrops = [];

async function loadMarketPrices() {
  const { data } = await MarketAPI.getPrices();
  if (!data.success) { showToast('Could not load prices', 'error'); return; }

  allPrices = data.prices;
  availableCrops = data.available_crops;

  // Populate crop filter dropdowns
  const cropFilterEl = document.getElementById('market-crop-filter');
  const profitCropEl = document.getElementById('profit-crop');

  availableCrops.forEach(crop => {
    cropFilterEl.innerHTML += `<option value="${crop}">${crop}</option>`;
    profitCropEl.innerHTML += `<option value="${crop}">${crop}</option>`;
  });

  renderPricesTable(allPrices);
  buildTransportInputs(data.available_cities);
}

function renderPricesTable(prices) {
  const tbody = document.getElementById('prices-tbody');
  if (!prices.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No prices found</td></tr>';
    return;
  }

  tbody.innerHTML = prices.map(p => `
    <tr>
      <td><strong>${p.city}</strong><br/><span style="font-size:.75rem;color:var(--text-muted)">${p.state}</span></td>
      <td>${p.crop_name}</td>
      <td class="price-cell">₹${p.price_per_kg}</td>
      <td style="font-size:.82rem;color:var(--text-muted)">${p.market_name || '—'}</td>
    </tr>
  `).join('');
}

function filterPrices() {
  const crop = document.getElementById('market-crop-filter').value;
  const state = document.getElementById('market-state-filter').value;

  let filtered = allPrices;
  if (crop) filtered = filtered.filter(p => p.crop_name === crop);
  if (state) filtered = filtered.filter(p => p.state === state);
  renderPricesTable(filtered);
}

function buildTransportInputs(cities) {
  const container = document.getElementById('transport-inputs');
  if (!cities || !cities.length) return;

  container.innerHTML = cities.slice(0, 8).map(c => `
    <div class="transport-item">
      <label>${c.city}</label>
      <input type="number" id="transport-${c.city.replace(/\s/g,'_')}"
        placeholder="₹ transport cost" min="0" value="0" />
    </div>
  `).join('');
}

async function calculateProfit() {
  const crop = document.getElementById('profit-crop').value;
  const qty = document.getElementById('profit-qty').value;

  if (!crop) { showToast('Please select a crop', 'error'); return; }
  if (!qty || qty <= 0) { showToast('Please enter quantity', 'error'); return; }

  // Collect transport costs
  const transport_costs = {};
  document.querySelectorAll('.transport-item').forEach(item => {
    const input = item.querySelector('input');
    const label = item.querySelector('label').textContent;
    if (input) transport_costs[label] = parseFloat(input.value) || 0;
  });

  const { ok, data } = await MarketAPI.calculateProfit({ crop, quantity: qty, transport_costs });

  if (!ok || !data.success) {
    showToast(data.message || 'Calculation failed', 'error');
    return;
  }

  const resultDiv = document.getElementById('profit-result');
  const contentDiv = document.getElementById('profit-result-content');

  contentDiv.innerHTML = `
    <div class="recommendation-box">
      ${data.recommendation}
    </div>
    <div class="profit-result-grid">
      ${data.calculations.map((calc, i) => `
        <div class="profit-row ${i === 0 && calc.net_profit > 0 ? 'best' : ''} ${calc.net_profit < 0 ? 'loss' : ''}">
          <div>
            <div class="profit-city">
              ${i === 0 && calc.net_profit > 0 ? '🏆 ' : ''}${calc.city}
              ${i === 0 && calc.net_profit > 0 ? '<span class="best-badge">BEST</span>' : ''}
            </div>
            <div class="profit-formula">₹${calc.price_per_kg}/kg × ${qty}kg - ₹${calc.transport_cost} transport = </div>
          </div>
          <div class="profit-amount ${calc.net_profit >= 0 ? 'profit-pos' : 'profit-neg'}">
            ${calc.net_profit >= 0 ? '+' : ''}₹${Math.abs(calc.net_profit).toLocaleString('en-IN')}
          </div>
        </div>
      `).join('')}
    </div>
    <div style="background:var(--card-bg);border-radius:var(--radius-sm);padding:.75rem;margin-top:.75rem;font-size:.85rem;border:1px solid var(--border-light)">
      <strong>Summary for ${crop} (${qty} kg):</strong><br/>
      📈 Best market: ${data.summary.best_profit_city} | Max profit: ₹${data.summary.max_profit.toLocaleString('en-IN')}<br/>
      📊 Highest price: ${data.summary.highest_price_city}
    </div>
  `;

  resultDiv.classList.remove('hidden');
  resultDiv.scrollIntoView({ behavior: 'smooth' });
}
async function getAISuggestion() {
  const crop = document.getElementById('ai-crop').value;
  const quantity = document.getElementById('ai-qty').value;
  const location = document.getElementById('ai-location').value;
  const budget = document.getElementById('ai-budget').value;

  if (!crop || !quantity) {
    showToast('Please enter crop and quantity', 'error');
    return;
  }

  const btn = document.getElementById('ai-suggest-btn');
  btn.disabled = true;
  btn.textContent = '🤖 Gemini AI thinking...';

  const { ok, data } = await apiRequest('/aimarket/suggest', {
    method: 'POST',
    body: JSON.stringify({ crop, quantity, location, transport_budget: budget })
  });

  btn.disabled = false;
  btn.textContent = '🤖 Get AI Suggestion';

  if (!ok || !data.success) {
    showToast(data.message || 'Error getting suggestion', 'error');
    return;
  }

  const resultDiv = document.getElementById('ai-result');
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a4d1a,#2d6a2d);color:#fff;border-radius:14px;padding:1.25rem;margin-bottom:1rem">
      <h3 style="margin-bottom:.5rem">🏆 Best Market: ${data.best_market.city}</h3>
      <div style="font-size:1.1rem;font-weight:700">
        ₹${data.best_market.price_per_kg}/kg × ${data.quantity}kg =
        <span style="color:#ffd700">₹${data.best_market.total_revenue.toLocaleString('en-IN')}</span>
      </div>
      <div style="font-size:.85rem;opacity:.8;margin-top:.25rem">
        Transport: ~₹${data.best_market.estimated_transport} |
        Net Profit: <strong>₹${data.best_market.net_profit.toLocaleString('en-IN')}</strong>
      </div>
    </div>

    <div style="background:#fff;border:2px solid #c8e6c9;border-radius:14px;padding:1.25rem;margin-bottom:1rem">
      <h4 style="color:#1a4d1a;margin-bottom:.75rem">🤖 Gemini AI Advice:</h4>
      <div style="font-size:.9rem;line-height:1.7;color:#2c3e2c;white-space:pre-wrap">${data.ai_recommendation}</div>
    </div>

    <div style="background:#fff;border-radius:14px;padding:1rem;border:1px solid #e8f5e9">
      <h4 style="color:#1a4d1a;margin-bottom:.75rem">📊 All Markets:</h4>
      ${data.all_markets.map((m, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem;border-bottom:1px solid #f0f7f0;${i===0 ? 'background:#f0f7f0;border-radius:8px;' : ''}">
          <div>
            <strong>${i === 0 ? '🏆 ' : ''}${m.city}</strong>
            <div style="font-size:.75rem;color:#6c8c6c">${m.market_name || m.state}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700;color:#e67e22">₹${m.price_per_kg}/kg</div>
            <div style="font-size:.78rem;color:${m.net_profit >= 0 ? '#2d6a2d' : '#c0392b'}">
              Profit: ₹${m.net_profit.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  resultDiv.scrollIntoView({ behavior: 'smooth' });
}