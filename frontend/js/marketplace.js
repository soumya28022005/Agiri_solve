// ============================================
// AgriMind AI — Marketplace Module
// ============================================

let currentProductId = null;

function switchMarketTab(tab) {
  document.querySelectorAll('.market-tab').forEach((t, i) => {
    const tabs = ['browse', 'sell', 'myorders'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.market-tab-content').forEach(c => {
    c.classList.remove('active-tab');
    c.classList.add('hidden');
  });
  const target = document.getElementById(`mt-${tab}`);
  if (target) { target.classList.remove('hidden'); target.classList.add('active-tab'); }

  if (tab === 'sell') { loadMyListings(); }
  if (tab === 'myorders') { loadMyOrders(); }
}

async function loadProducts(params = {}) {
  const search = document.getElementById('mp-search')?.value;
  const district = document.getElementById('mp-district')?.value;
  if (search) params.crop = search;
  if (district) params.district = district;

  const { data } = await MarketplaceAPI.getProducts(params);
  const grid = document.getElementById('products-grid');

  if (!data.success) { grid.innerHTML = '<div class="loading-msg">Could not load products</div>'; return; }

  if (!data.products.length) {
    grid.innerHTML = `
      <div class="empty-msg" style="grid-column:1/-1">
        <div class="empty-icon">🌾</div>
        <h3>No crops listed yet</h3>
        <p>Be the first to list your crop for sale!</p>
        <button onclick="switchMarketTab('sell')" class="btn-primary" style="margin-top:1rem">+ List Your Crop</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = data.products.map(p => `
    <div class="product-card">
      <div class="product-header">
        <div class="product-crop">${p.crop_name}</div>
        <div class="product-price">₹${p.price_per_unit}/kg</div>
      </div>
      <div class="product-meta">
        <span>⚖️ ${p.quantity} ${p.quantity_unit} available</span>
        <span>📍 ${p.district || p.location || 'Location not set'}, ${p.state || ''}</span>
        ${p.description ? `<span>📝 ${p.description.substring(0, 60)}...</span>` : ''}
      </div>
      <div class="product-farmer">
        👨‍🌾 ${p.farmer_name} • 📱 ${p.farmer_phone}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="status-available">✅ Available</span>
        <button onclick="openOrderModal(${p.id}, '${p.crop_name}', ${p.price_per_unit}, ${p.quantity})"
          class="btn-primary" style="font-size:.85rem;padding:.45rem .9rem">
          🛒 Buy Now
        </button>
      </div>
    </div>
  `).join('');
}

function searchProducts() {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(() => loadProducts(), 400);
}

async function listProduct(e) {
  e.preventDefault();

  const token = localStorage.getItem('agrimind_token');
  if (!token) {
    showToast('Please login first', 'error');
    return;
  }

  const body = {
    crop_name: document.getElementById('sell-crop').value,
    quantity: document.getElementById('sell-qty').value,
    price_per_unit: document.getElementById('sell-price').value,
    district: document.getElementById('sell-district').value,
    state: 'West Bengal',
    description: document.getElementById('sell-desc').value,
  };

  if (!body.crop_name || !body.quantity || !body.price_per_unit) {
    showToast('Please fill crop name, quantity and price', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '⏳ Listing...';

  const res = await fetch('http://localhost:3000/api/marketplace/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  btn.disabled = false;
  btn.textContent = '📢 List for Sale';

  if (!res.ok || !data.success) {
    showToast(data.message || 'Error listing product', 'error');
    return;
  }

  showToast('✅ Crop listed successfully!', 'success');
  e.target.reset();
  loadMyListings();
  loadProducts();
}

async function loadMyOrders() {
  const { data } = await MarketplaceAPI.getMyOrders();
  const grid = document.getElementById('my-orders-grid');
  if (!data.success || !data.orders.length) {
    grid.innerHTML = '<div class="empty-msg"><div class="empty-icon">📦</div><h3>No orders yet</h3><p>Browse marketplace and place your first order!</p></div>';
    return;
  }
  grid.innerHTML = data.orders.map(o => `
    <div class="card" style="margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${o.crop_name || 'Product'}</strong> • ${o.quantity} kg
        </div>
        <span style="font-family:var(--font-display);font-weight:800;color:var(--orange)">₹${Number(o.total_price).toLocaleString('en-IN')}</span>
      </div>
      <div style="font-size:.82rem;color:var(--text-muted);margin-top:.35rem">
        Farmer: ${o.farmer_name || '—'} • Status: <strong>${o.status}</strong>
      </div>
      <div style="font-size:.78rem;color:var(--text-light);margin-top:.25rem">
        Ordered on ${formatDate(o.created_at)}
      </div>
    </div>
  `).join('');
}

function openOrderModal(productId, cropName, price, quantity) {
  currentProductId = productId;
  document.getElementById('order-product-id').value = productId;
  document.getElementById('order-product-info').innerHTML = `
    <strong>🌾 ${cropName}</strong> at ₹${price}/kg<br/>
    <span style="font-size:.85rem;color:var(--text-muted)">Available: ${quantity} kg</span>
  `;
  document.getElementById('order-qty').max = quantity;

  const user = getUser();
  if (user) {
    document.getElementById('order-buyer-name').value = user.name || '';
    document.getElementById('order-phone').value = user.phone || '';
  }

  const modal = document.getElementById('order-modal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

async function submitOrder(e) {
  e.preventDefault();
  const body = {
    product_id: document.getElementById('order-product-id').value,
    quantity: document.getElementById('order-qty').value,
    buyer_name: document.getElementById('order-buyer-name').value,
    buyer_phone: document.getElementById('order-phone').value,
    delivery_address: document.getElementById('order-address').value,
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = '⏳ Placing order...';

  const { ok, data } = await MarketplaceAPI.placeOrder(body);
  btn.disabled = false; btn.textContent = '✅ Confirm Order';

  if (!ok || !data.success) { showToast(data.message || 'Order failed', 'error'); return; }

  showToast('🎉 Order placed successfully!', 'success');
  closeModal('order-modal');
  e.target.reset();
  loadProducts();
}
function previewPriceImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('price-preview-img').src = ev.target.result;
    document.getElementById('price-upload-zone').style.display = 'none';
    document.getElementById('price-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function clearPriceImage() {
  document.getElementById('price-image').value = '';
  document.getElementById('price-upload-zone').style.display = 'block';
  document.getElementById('price-preview').style.display = 'none';
  document.getElementById('price-result').style.display = 'none';
}

async function analyzeCropPrice() {
  const fileInput = document.getElementById('price-image');
  const crop = document.getElementById('price-crop').value;
  const qty = document.getElementById('price-qty').value;
  const suggested = document.getElementById('price-suggested').value;

  if (!fileInput.files[0]) { showToast('Please upload a crop photo', 'error'); return; }
  if (!crop) { showToast('Please enter crop name', 'error'); return; }

  const btn = document.getElementById('price-analyze-btn');
  btn.disabled = true;
  btn.textContent = '🤖 AI is analyzing quality...';

  const formData = new FormData();
  formData.append('image', fileInput.files[0]);
  formData.append('crop_name', crop);
  if (qty) formData.append('quantity', qty);
  if (suggested) formData.append('user_suggested_price', suggested);

  const token = localStorage.getItem('agrimind_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch('http://localhost:3000/api/price/analyze', {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json();

    btn.disabled = false;
    btn.textContent = '🤖 Analyze & Get Price Suggestion';

    if (!data.success) { showToast(data.message || 'Error analyzing', 'error'); return; }

    const gradeColors = { A: '#2d6a2d', B: '#e67e22', C: '#e74c3c', D: '#c0392b' };
    const gradeColor = gradeColors[data.analysis.grade] || '#2d6a2d';

    const resultDiv = document.getElementById('price-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <!-- Grade Badge -->
      <div style="display:flex;align-items:center;gap:1rem;background:linear-gradient(135deg,#1a4d1a,#2d6a2d);color:#fff;border-radius:14px;padding:1.25rem;margin-bottom:1rem">
        <div style="width:70px;height:70px;background:${gradeColor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:900;border:3px solid #fff">
          ${data.analysis.grade}
        </div>
        <div>
          <div style="font-size:1.1rem;font-weight:800">Quality Grade: ${data.analysis.grade}</div>
          <div style="font-size:.9rem;opacity:.9">Score: ${data.analysis.quality_score}/10</div>
          <div style="font-size:.85rem;opacity:.8;margin-top:.25rem">${data.analysis.quality_description || ''}</div>
        </div>
      </div>

      <!-- Price Suggestion -->
      <div style="background:#fff;border:2px solid #c8e6c9;border-radius:14px;padding:1.25rem;margin-bottom:1rem">
        <h4 style="color:#1a4d1a;margin-bottom:.75rem">💰 AI Price Suggestion</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;text-align:center">
          <div style="background:#f0f7f0;border-radius:10px;padding:.75rem">
            <div style="font-size:.75rem;color:#6c8c6c;font-weight:600">MIN PRICE</div>
            <div style="font-size:1.3rem;font-weight:800;color:#2d6a2d">₹${data.price_suggestion.min_price}/kg</div>
          </div>
          <div style="background:#1a4d1a;border-radius:10px;padding:.75rem">
            <div style="font-size:.75rem;color:rgba(255,255,255,.8);font-weight:600">FAIR PRICE</div>
            <div style="font-size:1.3rem;font-weight:800;color:#ffd700">₹${data.price_suggestion.fair_price}/kg</div>
          </div>
          <div style="background:#f0f7f0;border-radius:10px;padding:.75rem">
            <div style="font-size:.75rem;color:#6c8c6c;font-weight:600">MAX PRICE</div>
            <div style="font-size:1.3rem;font-weight:800;color:#2d6a2d">₹${data.price_suggestion.max_price}/kg</div>
          </div>
        </div>
        ${qty ? `<div style="margin-top:.75rem;background:#fff3e0;border-radius:8px;padding:.6rem;text-align:center;font-weight:700;color:#e67e22">
          Total Value: ₹${(data.price_suggestion.fair_price * qty).toLocaleString('en-IN')} for ${qty} kg
        </div>` : ''}
      </div>

      <!-- Farmer Price Feedback -->
      ${data.farmer_price_feedback ? `
      <div style="background:${data.farmer_price_feedback.status === 'fair' ? '#e8f5e9' : data.farmer_price_feedback.status === 'too_low' ? '#fff3e0' : '#fdecea'};
        border-radius:10px;padding:1rem;margin-bottom:1rem;border-left:4px solid ${data.farmer_price_feedback.status === 'fair' ? '#2d6a2d' : data.farmer_price_feedback.status === 'too_low' ? '#e67e22' : '#c0392b'}">
        <strong>${data.farmer_price_feedback.icon} ${data.farmer_price_feedback.message}</strong>
      </div>` : ''}

      <!-- Market Comparison -->
      <div style="background:#fff;border-radius:14px;padding:1rem;border:1px solid #e8f5e9;margin-bottom:1rem">
        <h4 style="color:#1a4d1a;margin-bottom:.5rem">📊 Current Market Prices</h4>
        ${data.market_data.markets.map((m, i) => `
          <div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid #f0f7f0">
            <span style="font-size:.88rem">${i === 0 ? '🏆 ' : ''}${m.city}</span>
            <span style="font-weight:700;color:#e67e22">₹${m.price_per_kg}/kg</span>
          </div>
        `).join('')}
        ${data.market_data.best_market ? `<div style="margin-top:.5rem;font-size:.85rem;color:#2d6a2d;font-weight:600">
          ⭐ Best market for your quality: ${data.market_data.best_market}
        </div>` : ''}
      </div>

      <!-- Quality Details -->
      <div style="background:#fff;border-radius:14px;padding:1rem;border:1px solid #e8f5e9;margin-bottom:1rem">
        <h4 style="color:#1a4d1a;margin-bottom:.5rem">🔍 Quality Analysis</h4>
        ${data.analysis.premium_factors ? `<div style="font-size:.85rem;color:#2d6a2d;margin-bottom:.35rem">✅ <strong>Premium factors:</strong> ${data.analysis.premium_factors}</div>` : ''}
        ${data.analysis.quality_issues ? `<div style="font-size:.85rem;color:#c0392b;margin-bottom:.35rem">⚠️ <strong>Issues found:</strong> ${data.analysis.quality_issues}</div>` : ''}
        ${data.negotiation_tip ? `<div style="font-size:.85rem;color:#1a4d1a;background:#f0f7f0;border-radius:6px;padding:.5rem;margin-top:.35rem">
          💡 <strong>Negotiation tip:</strong> ${data.negotiation_tip}
        </div>` : ''}
      </div>

      <div style="font-size:.72rem;color:#95b895;text-align:center">
        Powered by ${data.powered_by} • ${new Date(data.timestamp).toLocaleString('en-IN')}
      </div>
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    btn.disabled = false;
    btn.textContent = '🤖 Analyze & Get Price Suggestion';
    showToast('Network error. Is backend running?', 'error');
  }
}