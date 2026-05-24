/**
 * app.js — Kirana Pro Frontend Application
 * Vanilla JS, Single Page Application
 */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const State = {
  token: localStorage.getItem('kirana_token') || '',
  user: JSON.parse(localStorage.getItem('kirana_user') || 'null'),
  billItems: [],
  currentPage: 'dashboard',
  products: [],
  customers: [],
  suppliers: [],
  categories: [],
};

// ── API Helper ───────────────────────────────────────────────────────────────
async function api(method, url, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${State.token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    const data = await res.json();
    return data;
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
    return { success: false, error: err.message };
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-modal]');
  if (btn) closeModal(btn.dataset.modal);
  // Close modal on backdrop click
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-title').textContent = {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    billing: 'Billing',
    customers: 'Customers',
    credits: 'Udhaar (Credits)',
    suppliers: 'Suppliers',
    purchases: 'Purchases',
    reports: 'Reports',
  }[page] || page;
  State.currentPage = page;
  loadPage(page);
  // Close sidebar on mobile
  if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item, [data-page]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('topbar-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  if (!State.token) { showLogin(); return; }
  const res = await api('GET', '/api/me');
  if (res.success) {
    State.user = res.data;
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('shop-user').textContent = State.user?.full_name || 'User';
  navigateTo('dashboard');
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const res = await api('POST', '/api/login', { username, password });
  if (res.success) {
    State.token = res.data.token;
    State.user = res.data.user;
    localStorage.setItem('kirana_token', State.token);
    localStorage.setItem('kirana_user', JSON.stringify(State.user));
    showApp();
    toast('Welcome back, ' + State.user.full_name + '!');
  } else {
    toast(res.error || 'Login failed', 'error');
    btn.textContent = 'Sign In →';
    btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  State.token = '';
  State.user = null;
  localStorage.removeItem('kirana_token');
  localStorage.removeItem('kirana_user');
  showLogin();
  toast('Logged out successfully', 'info');
});

// ── Dark Mode ─────────────────────────────────────────────────────────────────
const darkBtn = document.getElementById('dark-mode-toggle');
if (localStorage.getItem('dark_mode') === '1') {
  document.body.classList.add('dark-mode');
  darkBtn.textContent = '☀️';
}
darkBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('dark_mode', isDark ? '1' : '0');
  darkBtn.textContent = isDark ? '☀️' : '🌙';
});

// ── Sidebar Toggle ────────────────────────────────────────────────────────────
document.getElementById('sidebar-open').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
});
document.getElementById('sidebar-close').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
});

// ═══ PAGE LOADERS ═══════════════════════════════════════════════════════════

async function loadPage(page) {
  switch (page) {
    case 'dashboard':  loadDashboard(); break;
    case 'inventory':  loadInventory(); break;
    case 'billing':    loadBilling(); break;
    case 'customers':  loadCustomers(); break;
    case 'credits':    loadCredits(); break;
    case 'suppliers':  loadSuppliers(); break;
    case 'purchases':  loadPurchases(); break;
    case 'reports':    loadReports(); break;
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const res = await api('GET', '/api/dashboard');
  if (!res.success) return;
  const d = res.data;

  document.getElementById('stat-sales').textContent = fmt(d.today_sales);
  document.getElementById('stat-udhaar').textContent = fmt(d.pending_udhaar);
  document.getElementById('stat-products').textContent = d.total_products;
  document.getElementById('stat-lowstock').textContent = d.low_stock_count;

  // Low stock badge in nav
  const badge = document.getElementById('low-stock-badge');
  badge.style.display = d.low_stock_count > 0 ? 'inline' : 'none';

  // Recent transactions
  const tbody = document.getElementById('recent-tx-body');
  tbody.innerHTML = d.recent_transactions.map(tx => `
    <tr>
      <td class="mono">${tx.invoice_number}</td>
      <td>${tx.customer_name}</td>
      <td class="mono">${fmt(tx.total)}</td>
      <td><span class="status-badge status-${tx.status}">${tx.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="empty-msg">No transactions today</td></tr>';

  // Low stock
  const lsList = document.getElementById('low-stock-list');
  if (d.low_stock_items.length === 0) {
    lsList.innerHTML = '<p class="empty-msg">✅ All products have sufficient stock</p>';
  } else {
    lsList.innerHTML = d.low_stock_items.map(p => {
      const pct = Math.min(100, Math.round((p.stock_qty / (p.low_stock_alert * 2)) * 100));
      return `
        <div class="low-stock-item">
          <span style="flex:1;font-size:13px;font-weight:500">${p.name}</span>
          <div class="stock-bar-wrap"><div class="stock-bar" style="width:${pct}%"></div></div>
          <span class="stock-qty">${p.stock_qty}</span>
        </div>`;
    }).join('');
  }
}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
async function loadInventory() {
  await loadCategories();
  await fetchProducts();
}

async function loadCategories() {
  const res = await api('GET', '/api/categories');
  if (res.success) {
    State.categories = res.data;
    const filter = document.getElementById('category-filter');
    const modalSel = document.getElementById('product-category');
    const opts = res.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    filter.innerHTML = '<option value="">All Categories</option>' + opts;
    if (modalSel) modalSel.innerHTML = '<option value="">Select category</option>' + opts;
  }
}

async function fetchProducts(search = '', category = '', lowStock = false) {
  let url = `/api/products?search=${encodeURIComponent(search)}&category=${category}`;
  if (lowStock) url += '&low_stock=1';
  const res = await api('GET', url);
  if (!res.success) return;
  State.products = res.data;
  renderProductTable(res.data);
}

function renderProductTable(products) {
  const tbody = document.getElementById('product-tbody');
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No products found</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    const isLow = p.stock_qty <= p.low_stock_alert;
    return `<tr>
      <td><strong>${p.name}</strong>${p.barcode ? `<br><small class="mono text-muted">${p.barcode}</small>` : ''}</td>
      <td>${p.category_name || '—'}</td>
      <td class="mono">${p.barcode || '—'}</td>
      <td class="mono">${fmt(p.purchase_price)}</td>
      <td class="mono">${fmt(p.selling_price)}</td>
      <td><span class="${isLow ? 'text-red' : 'text-green'}" style="font-weight:700;font-family:var(--mono)">${p.stock_qty} ${p.unit}</span>${isLow ? ' ⚠️' : ''}</td>
      <td class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="editProduct(${p.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteProduct(${p.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// Product search
let productSearchTimer;
document.getElementById('product-search').addEventListener('input', e => {
  clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(() => {
    fetchProducts(
      e.target.value,
      document.getElementById('category-filter').value,
      document.getElementById('low-stock-filter').checked
    );
  }, 300);
});
document.getElementById('category-filter').addEventListener('change', e => {
  fetchProducts(document.getElementById('product-search').value, e.target.value,
    document.getElementById('low-stock-filter').checked);
});
document.getElementById('low-stock-filter').addEventListener('change', e => {
  fetchProducts(document.getElementById('product-search').value,
    document.getElementById('category-filter').value, e.target.checked);
});

// Add Product
document.getElementById('add-product-btn').addEventListener('click', () => {
  document.getElementById('product-modal-title').textContent = 'Add Product';
  document.getElementById('product-id').value = '';
  ['product-name','product-barcode','product-buy-price','product-sell-price'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('product-stock').value = '0';
  document.getElementById('product-low-alert').value = '10';
  document.getElementById('product-unit').value = 'pcs';
  document.getElementById('product-category').value = '';
  openModal('product-modal');
});

async function editProduct(id) {
  const p = State.products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  document.getElementById('product-id').value = p.id;
  document.getElementById('product-name').value = p.name;
  document.getElementById('product-category').value = p.category_id || '';
  document.getElementById('product-barcode').value = p.barcode || '';
  document.getElementById('product-buy-price').value = p.purchase_price;
  document.getElementById('product-sell-price').value = p.selling_price;
  document.getElementById('product-stock').value = p.stock_qty;
  document.getElementById('product-low-alert').value = p.low_stock_alert;
  document.getElementById('product-unit').value = p.unit;
  openModal('product-modal');
}

document.getElementById('save-product-btn').addEventListener('click', async () => {
  const id = document.getElementById('product-id').value;
  const body = {
    name: document.getElementById('product-name').value.trim(),
    category_id: document.getElementById('product-category').value || null,
    barcode: document.getElementById('product-barcode').value.trim(),
    purchase_price: document.getElementById('product-buy-price').value,
    selling_price: document.getElementById('product-sell-price').value,
    stock_qty: document.getElementById('product-stock').value,
    low_stock_alert: document.getElementById('product-low-alert').value,
    unit: document.getElementById('product-unit').value,
  };
  if (!body.name || !body.selling_price) { toast('Name and selling price required', 'error'); return; }
  const res = id
    ? await api('PUT', `/api/products/${id}`, body)
    : await api('POST', '/api/products', body);
  if (res.success) {
    toast(id ? 'Product updated!' : 'Product added!');
    closeModal('product-modal');
    fetchProducts();
  } else {
    toast(res.error, 'error');
  }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  const res = await api('DELETE', `/api/products/${id}`);
  if (res.success) { toast('Product deleted'); fetchProducts(); }
  else toast(res.error, 'error');
}

// ── BILLING ───────────────────────────────────────────────────────────────────
async function loadBilling() {
  // Load customers for dropdown
  const res = await api('GET', '/api/customers');
  if (res.success) {
    State.customers = res.data;
    const sel = document.getElementById('bill-customer');
    sel.innerHTML = '<option value="">Walk-in Customer</option>' +
      res.data.map(c => `<option value="${c.id}">${c.name} (${c.phone || 'No phone'})</option>`).join('');
  }
  loadRecentInvoices();
  renderBillItems();
}

async function loadRecentInvoices() {
  const res = await api('GET', '/api/invoices?limit=8');
  if (!res.success) return;
  const tbody = document.getElementById('recent-invoices-body');
  tbody.innerHTML = res.data.map(inv => `
    <tr>
      <td class="mono">${inv.invoice_number}</td>
      <td class="mono">${fmt(inv.total)}</td>
      <td><span class="status-badge status-${inv.status}">${inv.status}</span></td>
      <td><button class="btn btn-outline btn-xs" onclick="viewInvoice(${inv.id})">👁️</button></td>
    </tr>
  `).join('');
}

// Bill product search
let billSearchTimer;
document.getElementById('bill-product-search').addEventListener('input', async e => {
  clearTimeout(billSearchTimer);
  const q = e.target.value.trim();
  if (!q) { document.getElementById('bill-product-results').innerHTML = ''; return; }
  billSearchTimer = setTimeout(async () => {
    const res = await api('GET', `/api/products?search=${encodeURIComponent(q)}`);
    const container = document.getElementById('bill-product-results');
    if (!res.success || res.data.length === 0) {
      container.innerHTML = '<p class="empty-msg">No products found</p>';
      return;
    }
    container.innerHTML = res.data.map(p => `
      <div class="product-result-item" onclick="addToBill(${p.id},'${escapeHtml(p.name)}',${p.selling_price},${p.stock_qty},'${p.unit}')">
        <div>
          <div class="result-name">${p.name}</div>
          <div class="result-stock">${p.stock_qty} ${p.unit} in stock</div>
        </div>
        <span class="result-price">${fmt(p.selling_price)}</span>
      </div>
    `).join('');
  }, 200);
});

function addToBill(id, name, price, stock, unit) {
  const existing = State.billItems.find(i => i.product_id === id);
  if (existing) {
    if (existing.qty < stock) existing.qty++;
    else { toast('Insufficient stock', 'error'); return; }
  } else {
    State.billItems.push({ product_id: id, product_name: name, price, qty: 1, stock, unit });
  }
  document.getElementById('bill-product-search').value = '';
  document.getElementById('bill-product-results').innerHTML = '';
  renderBillItems();
  toast(`${name} added`, 'info');
}

function renderBillItems() {
  const container = document.getElementById('bill-items');
  if (State.billItems.length === 0) {
    container.innerHTML = '<p class="empty-msg">Add products from the left panel</p>';
    updateBillTotals();
    return;
  }
  container.innerHTML = State.billItems.map((item, i) => `
    <div class="bill-item">
      <div class="bill-item-name">${item.product_name}<br><small class="text-muted mono">${fmt(item.price)} × ${item.qty}</small></div>
      <div class="bill-qty-ctrl">
        <button class="qty-btn" onclick="changeBillQty(${i}, -1)">−</button>
        <input class="qty-input" type="number" value="${item.qty}" min="1" max="${item.stock}"
          onchange="setBillQty(${i}, this.value)">
        <button class="qty-btn" onclick="changeBillQty(${i}, 1)">+</button>
      </div>
      <span class="bill-item-price">${fmt(item.price * item.qty)}</span>
      <button class="remove-item" onclick="removeBillItem(${i})">✕</button>
    </div>
  `).join('');
  updateBillTotals();
}

function changeBillQty(i, delta) {
  const item = State.billItems[i];
  const newQty = item.qty + delta;
  if (newQty < 1) { removeBillItem(i); return; }
  if (newQty > item.stock) { toast('Insufficient stock', 'error'); return; }
  item.qty = newQty;
  renderBillItems();
}
function setBillQty(i, val) {
  const qty = parseInt(val);
  if (isNaN(qty) || qty < 1) return;
  if (qty > State.billItems[i].stock) { toast('Insufficient stock', 'error'); return; }
  State.billItems[i].qty = qty;
  renderBillItems();
}
function removeBillItem(i) {
  State.billItems.splice(i, 1);
  renderBillItems();
}

function updateBillTotals() {
  const subtotal = State.billItems.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
  const tax      = parseFloat(document.getElementById('bill-tax').value) || 0;
  const total    = Math.max(0, subtotal - discount + tax);
  const paid     = parseFloat(document.getElementById('bill-paid').value);
  const balance  = isNaN(paid) ? 0 : Math.max(0, total - paid);

  document.getElementById('bill-subtotal').textContent = fmt(subtotal);
  document.getElementById('bill-total').textContent    = fmt(total);
  document.getElementById('bill-balance').textContent  = fmt(balance);

  if (!document.activeElement?.matches('#bill-paid')) {
    document.getElementById('bill-paid').placeholder = fmt(total, false);
  }
}

['bill-discount','bill-tax','bill-paid'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateBillTotals);
});

document.getElementById('clear-bill-btn').addEventListener('click', () => {
  State.billItems = [];
  document.getElementById('bill-discount').value = '0';
  document.getElementById('bill-tax').value = '0';
  document.getElementById('bill-paid').value = '';
  document.getElementById('bill-customer').value = '';
  renderBillItems();
});

document.getElementById('save-bill-btn').addEventListener('click', async () => {
  if (State.billItems.length === 0) { toast('Add at least one item', 'error'); return; }
  const subtotal = State.billItems.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
  const tax      = parseFloat(document.getElementById('bill-tax').value) || 0;
  const total    = Math.max(0, subtotal - discount + tax);
  const paidVal  = document.getElementById('bill-paid').value;
  const paid     = paidVal ? parseFloat(paidVal) : total;
  const customer_id = document.getElementById('bill-customer').value || null;

  const body = {
    items: State.billItems.map(i => ({
      product_id: i.product_id, product_name: i.product_name,
      qty: i.qty, price: i.price,
    })),
    customer_id,
    discount, tax, paid_amount: paid,
    payment_mode: document.getElementById('bill-payment-mode').value,
  };

  const res = await api('POST', '/api/invoices', body);
  if (res.success) {
    toast('Bill saved! Invoice: ' + res.data.invoice_number);
    viewInvoice(res.data.id);
    State.billItems = [];
    document.getElementById('bill-discount').value = '0';
    document.getElementById('bill-tax').value = '0';
    document.getElementById('bill-paid').value = '';
    renderBillItems();
    loadRecentInvoices();
  } else {
    toast(res.error || 'Failed to save bill', 'error');
  }
});

async function viewInvoice(id) {
  const res = await api('GET', `/api/invoices/${id}`);
  if (!res.success) return;
  const inv = res.data;
  const area = document.getElementById('invoice-print-area');
  const now = new Date(inv.created_at);
  area.innerHTML = `
    <div class="invoice-print">
      <div class="invoice-header">
        <h2>🛒 Kirana Pro</h2>
        <p>Tax Invoice</p>
      </div>
      <div class="invoice-info">
        <div><strong>Invoice No:</strong> ${inv.invoice_number}</div>
        <div><strong>Date:</strong> ${now.toLocaleDateString('en-IN')}</div>
        <div><strong>Customer:</strong> ${inv.customer_name}</div>
        <div><strong>Payment:</strong> ${inv.payment_mode?.toUpperCase()}</div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${(inv.items || []).map((item, i) => `
            <tr>
              <td>${i+1}</td>
              <td>${item.product_name}</td>
              <td>${item.qty}</td>
              <td>${fmt(item.price)}</td>
              <td>${fmt(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="invoice-total">
        <div>Subtotal: ${fmt(inv.subtotal)}</div>
        ${inv.discount ? `<div>Discount: -${fmt(inv.discount)}</div>` : ''}
        ${inv.tax ? `<div>Tax: +${fmt(inv.tax)}</div>` : ''}
        <div style="font-size:20px;color:var(--saffron);margin-top:8px">Total: ${fmt(inv.total)}</div>
        <div style="color:var(--green)">Paid: ${fmt(inv.paid_amount)}</div>
        ${inv.total - inv.paid_amount > 0 ? `<div style="color:var(--red)">Balance: ${fmt(inv.total - inv.paid_amount)}</div>` : ''}
      </div>
      <div class="invoice-footer">Thank you for your purchase! • Kirana Pro</div>
    </div>
  `;
  openModal('invoice-modal');
}

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
async function loadCustomers(search = '') {
  const res = await api('GET', `/api/customers?search=${encodeURIComponent(search)}`);
  if (!res.success) return;
  State.customers = res.data;
  const tbody = document.getElementById('customer-tbody');
  if (res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No customers found</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || '—'}</td>
      <td>${c.address || '—'}</td>
      <td class="mono">${fmt(c.credit_limit)}</td>
      <td class="mono ${c.balance > 0 ? 'text-red' : 'text-green'}" style="font-weight:700">
        ${c.balance > 0 ? fmt(c.balance) : '✅ Cleared'}
      </td>
      <td class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="viewLedger(${c.id})">📋 Ledger</button>
        <button class="btn btn-outline btn-xs" onclick="editCustomer(${c.id})">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="deleteCustomer(${c.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

let custSearchTimer;
document.getElementById('customer-search').addEventListener('input', e => {
  clearTimeout(custSearchTimer);
  custSearchTimer = setTimeout(() => loadCustomers(e.target.value), 300);
});

document.getElementById('add-customer-btn').addEventListener('click', () => {
  document.getElementById('customer-modal-title').textContent = 'Add Customer';
  document.getElementById('customer-id').value = '';
  ['customer-name','customer-phone','customer-address'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('customer-credit-limit').value = '5000';
  openModal('customer-modal');
});

function editCustomer(id) {
  const c = State.customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('customer-modal-title').textContent = 'Edit Customer';
  document.getElementById('customer-id').value = c.id;
  document.getElementById('customer-name').value = c.name;
  document.getElementById('customer-phone').value = c.phone || '';
  document.getElementById('customer-address').value = c.address || '';
  document.getElementById('customer-credit-limit').value = c.credit_limit;
  openModal('customer-modal');
}

document.getElementById('save-customer-btn').addEventListener('click', async () => {
  const id = document.getElementById('customer-id').value;
  const body = {
    name: document.getElementById('customer-name').value.trim(),
    phone: document.getElementById('customer-phone').value.trim(),
    address: document.getElementById('customer-address').value.trim(),
    credit_limit: document.getElementById('customer-credit-limit').value,
  };
  if (!body.name) { toast('Name required', 'error'); return; }
  const res = id
    ? await api('PUT', `/api/customers/${id}`, body)
    : await api('POST', '/api/customers', body);
  if (res.success) {
    toast(id ? 'Customer updated!' : 'Customer added!');
    closeModal('customer-modal');
    loadCustomers();
  } else toast(res.error, 'error');
});

async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;
  const res = await api('DELETE', `/api/customers/${id}`);
  if (res.success) { toast('Customer deleted'); loadCustomers(); }
  else toast(res.error, 'error');
}

async function viewLedger(id) {
  const res = await api('GET', `/api/customers/${id}`);
  if (!res.success) return;
  const c = res.data;
  document.getElementById('ledger-modal-title').textContent = `Ledger — ${c.name}`;
  const content = document.getElementById('ledger-content');
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <strong>${c.name}</strong> ${c.phone ? `• ${c.phone}` : ''}
        ${c.address ? `<br><small class="text-muted">${c.address}</small>` : ''}
      </div>
      <div class="balance-display ${c.balance > 0 ? 'text-red' : 'text-green'}">
        ${c.balance > 0 ? `Owes ${fmt(c.balance)}` : '✅ No dues'}
      </div>
    </div>
    <table class="table">
      <thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th>Amount</th><th>Balance</th><th>Notes</th></tr></thead>
      <tbody>
        ${(c.ledger || []).map(entry => `
          <tr>
            <td>${new Date(entry.created_at).toLocaleDateString('en-IN')}</td>
            <td class="mono">${entry.invoice_number || '—'}</td>
            <td><span class="status-badge ${entry.type === 'debit' ? 'status-credit' : 'status-paid'}">${entry.type}</span></td>
            <td class="mono ${entry.type === 'debit' ? 'ledger-debit' : 'ledger-credit'}">${fmt(entry.amount)}</td>
            <td class="mono">${fmt(entry.balance)}</td>
            <td>${entry.notes || '—'}</td>
          </tr>
        `).join('') || '<tr><td colspan="6" class="empty-msg">No transactions</td></tr>'}
      </tbody>
    </table>
    <div style="margin-top:12px;text-align:right">
      <button class="btn btn-success" onclick="quickPayment(${c.id},'${escapeHtml(c.name)}',${c.balance})">
        + Record Payment
      </button>
    </div>
  `;
  openModal('ledger-modal');
}

// ── CREDITS ───────────────────────────────────────────────────────────────────
async function loadCredits() {
  const res = await api('GET', '/api/credits');
  if (!res.success) return;
  const tbody = document.getElementById('credit-tbody');
  if (res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">🎉 No pending dues!</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || '—'}</td>
      <td class="mono text-red" style="font-weight:800;font-size:16px">${fmt(c.balance)}</td>
      <td class="action-btns">
        <button class="btn btn-success btn-xs" onclick="quickPayment(${c.id},'${escapeHtml(c.name)}',${c.balance})">💰 Pay</button>
        <button class="btn btn-outline btn-xs" onclick="viewLedger(${c.id})">📋</button>
      </td>
    </tr>
  `).join('');
}

function quickPayment(customerId, customerName, balance) {
  document.getElementById('payment-modal-title').textContent = `Payment — ${customerName}`;
  document.getElementById('payment-customer-id').value = customerId;
  document.getElementById('payment-current-balance').textContent = fmt(balance);
  document.getElementById('payment-amount').value = '';
  document.getElementById('payment-notes').value = '';

  // Populate dropdown
  const sel = document.getElementById('payment-customer');
  sel.innerHTML = State.customers.map(c =>
    `<option value="${c.id}" ${c.id == customerId ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  openModal('payment-modal');
}

document.getElementById('add-payment-btn').addEventListener('click', async () => {
  // Load customers first
  const res = await api('GET', '/api/customers');
  if (res.success) State.customers = res.data;
  document.getElementById('payment-modal-title').textContent = 'Record Payment';
  document.getElementById('payment-customer-id').value = '';
  document.getElementById('payment-current-balance').textContent = '—';
  document.getElementById('payment-amount').value = '';
  document.getElementById('payment-notes').value = '';
  const sel = document.getElementById('payment-customer');
  sel.innerHTML = '<option value="">Select customer</option>' +
    State.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  openModal('payment-modal');
});

document.getElementById('payment-customer').addEventListener('change', async e => {
  const id = e.target.value;
  if (!id) return;
  const res = await api('GET', `/api/customers/${id}`);
  if (res.success) {
    document.getElementById('payment-current-balance').textContent = fmt(res.data.balance);
  }
});

document.getElementById('save-payment-btn').addEventListener('click', async () => {
  const customerId = document.getElementById('payment-customer-id').value ||
                     document.getElementById('payment-customer').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);
  const notes  = document.getElementById('payment-notes').value;
  if (!customerId || !amount || amount <= 0) { toast('Customer and valid amount required', 'error'); return; }
  const res = await api('POST', '/api/credits', { customer_id: customerId, amount, type: 'credit', notes });
  if (res.success) {
    toast(`Payment of ${fmt(amount)} recorded!`);
    closeModal('payment-modal');
    closeModal('ledger-modal');
    loadCredits();
  } else toast(res.error, 'error');
});

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────
async function loadSuppliers(search = '') {
  const res = await api('GET', '/api/suppliers');
  if (!res.success) return;
  State.suppliers = res.data;
  const filtered = search
    ? res.data.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : res.data;
  const tbody = document.getElementById('supplier-tbody');
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${s.phone || '—'}</td>
      <td>${s.email || '—'}</td>
      <td class="mono">${s.gstin || '—'}</td>
      <td class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="editSupplier(${s.id})">✏️</button>
        <button class="btn btn-danger btn-xs" onclick="deleteSupplier(${s.id})">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-msg">No suppliers found</td></tr>';
}

let suppSearchTimer;
document.getElementById('supplier-search').addEventListener('input', e => {
  clearTimeout(suppSearchTimer);
  suppSearchTimer = setTimeout(() => loadSuppliers(e.target.value), 300);
});

document.getElementById('add-supplier-btn').addEventListener('click', () => {
  document.getElementById('supplier-modal-title').textContent = 'Add Supplier';
  document.getElementById('supplier-id').value = '';
  ['supplier-name','supplier-phone','supplier-email','supplier-gstin','supplier-address'].forEach(id => document.getElementById(id).value = '');
  openModal('supplier-modal');
});

function editSupplier(id) {
  const s = State.suppliers.find(x => x.id === id);
  if (!s) return;
  document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
  document.getElementById('supplier-id').value = s.id;
  document.getElementById('supplier-name').value = s.name;
  document.getElementById('supplier-phone').value = s.phone || '';
  document.getElementById('supplier-email').value = s.email || '';
  document.getElementById('supplier-gstin').value = s.gstin || '';
  document.getElementById('supplier-address').value = s.address || '';
  openModal('supplier-modal');
}

document.getElementById('save-supplier-btn').addEventListener('click', async () => {
  const id = document.getElementById('supplier-id').value;
  const body = {
    name: document.getElementById('supplier-name').value.trim(),
    phone: document.getElementById('supplier-phone').value.trim(),
    email: document.getElementById('supplier-email').value.trim(),
    gstin: document.getElementById('supplier-gstin').value.trim(),
    address: document.getElementById('supplier-address').value.trim(),
  };
  if (!body.name) { toast('Supplier name required', 'error'); return; }
  const res = id
    ? await api('PUT', `/api/suppliers/${id}`, body)
    : await api('POST', '/api/suppliers', body);
  if (res.success) {
    toast(id ? 'Supplier updated!' : 'Supplier added!');
    closeModal('supplier-modal');
    loadSuppliers();
  } else toast(res.error, 'error');
});

async function deleteSupplier(id) {
  if (!confirm('Delete this supplier?')) return;
  const res = await api('DELETE', `/api/suppliers/${id}`);
  if (res.success) { toast('Supplier deleted'); loadSuppliers(); }
  else toast(res.error, 'error');
}

// ── PURCHASES ─────────────────────────────────────────────────────────────────
async function loadPurchases() {
  const res = await api('GET', '/api/purchases');
  if (!res.success) return;
  const tbody = document.getElementById('purchase-tbody');
  tbody.innerHTML = res.data.map(p => `
    <tr>
      <td>${new Date(p.created_at).toLocaleDateString('en-IN')}</td>
      <td><strong>${p.product_name || '—'}</strong></td>
      <td>${p.supplier_name || '—'}</td>
      <td class="mono">${p.qty}</td>
      <td class="mono">${fmt(p.purchase_price)}</td>
      <td class="mono">${fmt(p.total)}</td>
      <td class="mono ${p.paid >= p.total ? 'text-green' : 'text-red'}">${fmt(p.paid)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty-msg">No purchases recorded</td></tr>';
}

document.getElementById('add-purchase-btn').addEventListener('click', async () => {
  // Load products & suppliers
  const [pr, sr] = await Promise.all([
    api('GET', '/api/products'),
    api('GET', '/api/suppliers'),
  ]);
  const prodSel = document.getElementById('purchase-product');
  const suppSel = document.getElementById('purchase-supplier');
  prodSel.innerHTML = '<option value="">Select product</option>' +
    (pr.data || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  suppSel.innerHTML = '<option value="">Select supplier</option>' +
    (sr.data || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  ['purchase-qty','purchase-price','purchase-paid','purchase-notes'].forEach(id => document.getElementById(id).value = '');
  openModal('purchase-modal');
});

document.getElementById('save-purchase-btn').addEventListener('click', async () => {
  const body = {
    product_id: document.getElementById('purchase-product').value,
    supplier_id: document.getElementById('purchase-supplier').value || null,
    qty: document.getElementById('purchase-qty').value,
    purchase_price: document.getElementById('purchase-price').value,
    paid: document.getElementById('purchase-paid').value || 0,
    notes: document.getElementById('purchase-notes').value,
  };
  if (!body.product_id || !body.qty) { toast('Product and quantity required', 'error'); return; }
  const res = await api('POST', '/api/purchases', body);
  if (res.success) {
    toast('Purchase recorded, stock updated!');
    closeModal('purchase-modal');
    loadPurchases();
  } else toast(res.error, 'error');
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
let currentReport = 'daily';

function loadReports() {
  renderReport(currentReport);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentReport = btn.dataset.report;
    renderReport(currentReport);
  });
});

async function renderReport(type) {
  const controls = document.getElementById('report-controls');
  const content  = document.getElementById('report-content');
  content.innerHTML = '<p class="empty-msg">Loading...</p>';

  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  if (type === 'daily') {
    controls.innerHTML = `
      <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Date</label>
      <input type="date" id="report-date" value="${today}" style="width:auto">
      <button class="btn btn-primary btn-sm" onclick="fetchDailyReport()">Load</button>
    `;
    fetchDailyReport();
  } else if (type === 'monthly') {
    controls.innerHTML = `
      <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Month</label>
      <input type="month" id="report-month" value="${month}" style="width:auto">
      <button class="btn btn-primary btn-sm" onclick="fetchMonthlyReport()">Load</button>
    `;
    fetchMonthlyReport();
  } else if (type === 'profit') {
    controls.innerHTML = `
      <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Month</label>
      <input type="month" id="report-profit-month" value="${month}" style="width:auto">
      <button class="btn btn-primary btn-sm" onclick="fetchProfitReport()">Load</button>
    `;
    fetchProfitReport();
  } else if (type === 'credit') {
    controls.innerHTML = '';
    fetchCreditReport();
  }
}

async function fetchDailyReport() {
  const date = document.getElementById('report-date')?.value || new Date().toISOString().slice(0,10);
  const res = await api('GET', `/api/reports/daily?date=${date}`);
  if (!res.success) return;
  const { summary: s, top_products: products } = res.data;
  document.getElementById('report-content').innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><div class="rs-label">Invoices</div><div class="rs-value">${s?.invoices || 0}</div></div>
      <div class="report-stat"><div class="rs-label">Revenue</div><div class="rs-value">${fmt(s?.revenue)}</div></div>
      <div class="report-stat"><div class="rs-label">Collected</div><div class="rs-value text-green">${fmt(s?.collected)}</div></div>
      <div class="report-stat"><div class="rs-label">Pending</div><div class="rs-value text-red">${fmt(s?.pending)}</div></div>
    </div>
    <h4 style="margin-bottom:12px">Top Products Today</h4>
    <table class="table">
      <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
      <tbody>${(products || []).map(p => `
        <tr><td>${p.product_name}</td><td class="mono">${p.qty_sold}</td><td class="mono">${fmt(p.revenue)}</td></tr>
      `).join('') || '<tr><td colspan="3" class="empty-msg">No sales today</td></tr>'}</tbody>
    </table>
  `;
}

async function fetchMonthlyReport() {
  const month = document.getElementById('report-month')?.value;
  const res = await api('GET', `/api/reports/monthly?month=${month}`);
  if (!res.success) return;
  const { summary: s, daily_breakdown: daily } = res.data;
  document.getElementById('report-content').innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><div class="rs-label">Total Invoices</div><div class="rs-value">${s?.total_invoices || 0}</div></div>
      <div class="report-stat"><div class="rs-label">Total Revenue</div><div class="rs-value">${fmt(s?.total_revenue)}</div></div>
      <div class="report-stat"><div class="rs-label">Collected</div><div class="rs-value text-green">${fmt(s?.total_collected)}</div></div>
      <div class="report-stat"><div class="rs-label">Pending</div><div class="rs-value text-red">${fmt(s?.total_pending)}</div></div>
    </div>
    <h4 style="margin-bottom:12px">Daily Breakdown</h4>
    <table class="table">
      <thead><tr><th>Date</th><th>Invoices</th><th>Revenue</th><th>Collected</th></tr></thead>
      <tbody>${(daily || []).map(d => `
        <tr>
          <td>${new Date(d.date+'T00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
          <td class="mono">${d.invoices}</td>
          <td class="mono">${fmt(d.revenue)}</td>
          <td class="mono text-green">${fmt(d.collected)}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-msg">No data</td></tr>'}</tbody>
    </table>
  `;
}

async function fetchProfitReport() {
  const month = document.getElementById('report-profit-month')?.value;
  const res = await api('GET', `/api/reports/profit?month=${month}`);
  if (!res.success) return;
  const d = res.data;
  document.getElementById('report-content').innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><div class="rs-label">Revenue</div><div class="rs-value">${fmt(d.total_revenue)}</div></div>
      <div class="report-stat"><div class="rs-label">Cost</div><div class="rs-value text-red">${fmt(d.total_cost)}</div></div>
      <div class="report-stat" style="border-left-color:var(--green)"><div class="rs-label">Profit</div><div class="rs-value text-green">${fmt(d.total_profit)}</div></div>
      <div class="report-stat"><div class="rs-label">Margin</div><div class="rs-value">${d.total_revenue ? Math.round((d.total_profit/d.total_revenue)*100) : 0}%</div></div>
    </div>
    <h4 style="margin-bottom:12px">Product-wise Profit</h4>
    <table class="table">
      <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead>
      <tbody>${(d.products || []).map(p => `
        <tr>
          <td>${p.product_name}</td>
          <td class="mono">${p.qty_sold}</td>
          <td class="mono">${fmt(p.revenue)}</td>
          <td class="mono text-red">${fmt(p.cost)}</td>
          <td class="mono ${(p.profit||0) >= 0 ? 'text-green' : 'text-red'}" style="font-weight:700">${fmt(p.profit)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-msg">No sales data</td></tr>'}</tbody>
    </table>
  `;
}

async function fetchCreditReport() {
  const res = await api('GET', '/api/reports/credit');
  if (!res.success) return;
  const d = res.data;
  document.getElementById('report-content').innerHTML = `
    <div class="report-summary">
      <div class="report-stat" style="border-left-color:var(--red)">
        <div class="rs-label">Total Pending</div>
        <div class="rs-value text-red">${fmt(d.total_pending)}</div>
      </div>
      <div class="report-stat">
        <div class="rs-label">Customers with Due</div>
        <div class="rs-value">${d.customers.filter(c=>c.balance>0).length}</div>
      </div>
    </div>
    <table class="table">
      <thead><tr><th>Customer</th><th>Phone</th><th>Pending Amount</th><th>Action</th></tr></thead>
      <tbody>${d.customers.map(c => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.phone || '—'}</td>
          <td class="mono ${c.balance > 0 ? 'text-red' : 'text-green'}" style="font-weight:700">
            ${c.balance > 0 ? fmt(c.balance) : '✅ Cleared'}
          </td>
          <td>
            ${c.balance > 0 ? `<button class="btn btn-success btn-xs" onclick="quickPayment(${c.id},'${escapeHtml(c.name)}',${c.balance})">💰 Pay</button>` : ''}
          </td>
        </tr>
      `).join('')}
      </tbody>
    </table>
  `;
}

// ── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.altKey) {
    const shortcuts = {
      'd': 'dashboard', 'i': 'inventory', 'b': 'billing',
      'c': 'customers', 'u': 'credits', 's': 'suppliers',
      'r': 'reports',
    };
    if (shortcuts[e.key.toLowerCase()]) {
      e.preventDefault();
      navigateTo(shortcuts[e.key.toLowerCase()]);
    }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
});

// ── Utility ──────────────────────────────────────────────────────────────────
function fmt(amount, withSymbol = true) {
  const n = parseFloat(amount) || 0;
  const formatted = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `₹${formatted}` : formatted;
}

function escapeHtml(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ── INIT ─────────────────────────────────────────────────────────────────────
checkAuth();
