'use strict';

/* ===========================
   Constants & DOM References
=========================== */
const STORAGE_KEY = 'expense_transactions';

const form          = document.getElementById('expense-form');
const inputName     = document.getElementById('item-name');
const inputAmount   = document.getElementById('item-amount');
const inputCategory = document.getElementById('item-category');

const errorName     = document.getElementById('error-name');
const errorAmount   = document.getElementById('error-amount');
const errorCategory = document.getElementById('error-category');

const totalBalanceEl  = document.getElementById('total-balance');
const transactionList = document.getElementById('transaction-list');
const chartEmptyState = document.getElementById('chart-empty-state');
const chartCanvas     = document.getElementById('expense-chart');
const themeToggleBtn  = document.getElementById('theme-toggle');
const themeIcon       = document.getElementById('theme-icon');
const sortSelect      = document.getElementById('sort-select');

const CATEGORIES = ['Food', 'Transport', 'Fun'];

const CHART_COLORS = {
  Food:      '#f59e0b',
  Transport: '#3b82f6',
  Fun:       '#ec4899',
};

/* ===========================
   Local Storage Helpers
=========================== */

/** Ambil semua transaksi dari Local Storage. */
function getTransactions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** Simpan array transaksi ke Local Storage. */
function saveTransactions(transactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ===========================
   Validation
=========================== */

/**
 * Validasi form, tampilkan pesan error jika ada.
 * @returns {boolean} true jika semua field valid.
 */
function validateForm() {
  let valid = true;

  // Reset state
  clearFieldError(inputName, errorName);
  clearFieldError(inputAmount, errorAmount);
  clearFieldError(inputCategory, errorCategory);

  const name     = inputName.value.trim();
  const amount   = inputAmount.value.trim();
  const category = inputCategory.value;

  if (!name) {
    setFieldError(inputName, errorName, 'Nama barang wajib diisi.');
    valid = false;
  }

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    setFieldError(inputAmount, errorAmount, 'Masukkan jumlah yang valid (lebih dari 0).');
    valid = false;
  }

  if (!category) {
    setFieldError(inputCategory, errorCategory, 'Pilih salah satu kategori.');
    valid = false;
  }

  return valid;
}

function setFieldError(input, errorEl, message) {
  input.classList.add('input-error');
  errorEl.textContent = message;
}

function clearFieldError(input, errorEl) {
  input.classList.remove('input-error');
  errorEl.textContent = '';
}

/* ===========================
   Formatting
=========================== */

/** Format angka ke format Rupiah: "Rp 25.000" */
function formatRupiah(number) {
  return 'Rp ' + Number(number).toLocaleString('id-ID');
}

/** Buat ID unik sederhana dari timestamp + random. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Kembalikan CSS class badge sesuai kategori. */
function badgeClass(category) {
  const map = {
    Food:      'badge-food',
    Transport: 'badge-transport',
    Fun:       'badge-fun',
  };
  return map[category] || '';
}

/* ===========================
   Render: Transaction List
=========================== */

function renderTransactions() {
  const raw = getTransactions();

  if (raw.length === 0) {
    transactionList.innerHTML =
      '<p class="empty-state" id="empty-state">Belum ada transaksi.</p>';
    return;
  }

  // Sortir berdasarkan pilihan #sort-select
  const sortOrder = sortSelect ? sortSelect.value : 'newest';
  const transactions = [...raw].sort((a, b) => {
    if (sortOrder === 'highest') return b.amount - a.amount;
    if (sortOrder === 'lowest')  return a.amount - b.amount;
    // 'newest' — urutan insert (id berbasis timestamp, makin besar = makin baru)
    return b.id > a.id ? 1 : -1;
  });

  // innerHTML hanya di-set pada #transaction-list — tidak menyentuh elemen lain
  transactionList.innerHTML = transactions.map(tx => {
    // Highlight jika amount lebih dari Rp 200.000
    const warningClass = tx.amount > 200000 ? 'amount-warning' : '';
    return `
    <div class="transaction-item" data-id="${tx.id}">
      <div class="transaction-info">
        <span class="transaction-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</span>
        <div class="transaction-meta">
          <span class="transaction-amount ${warningClass}">${formatRupiah(tx.amount)}</span>
          <span class="category-badge ${badgeClass(tx.category)}">${escapeHtml(tx.category)}</span>
        </div>
      </div>
      <button class="btn-delete" data-id="${tx.id}" aria-label="Hapus transaksi ${escapeHtml(tx.name)}">Hapus</button>
    </div>
  `;
  }).join('');
}

/** Escape karakter HTML untuk mencegah XSS. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ===========================
   Render: Total Balance
=========================== */

function renderBalance() {
  const transactions = getTransactions();
  const total = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  totalBalanceEl.textContent = formatRupiah(total);
}

/* ===========================
   Chart.js — Pie Chart
=========================== */

let expenseChart = null;

function getChartData() {
  const transactions = getTransactions();

  const totals = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = 0;
    return acc;
  }, {});

  transactions.forEach(tx => {
    if (totals[tx.category] !== undefined) {
      totals[tx.category] += Number(tx.amount);
    }
  });

  // Hanya tampilkan kategori yang memiliki nilai > 0
  const activeCategories = CATEGORIES.filter(cat => totals[cat] > 0);
  const data   = activeCategories.map(cat => totals[cat]);
  const colors = activeCategories.map(cat => CHART_COLORS[cat]);

  return { labels: activeCategories, data, colors };
}

function renderChart() {
  const { labels, data, colors } = getChartData();
  const hasData = data.length > 0;

  // Tampilkan/sembunyikan empty state chart
  chartEmptyState.style.display = hasData ? 'none' : 'block';
  chartCanvas.style.display     = hasData ? 'block' : 'none';

  if (!hasData) {
    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }
    return;
  }

  if (expenseChart) {
    // Update data yang sudah ada tanpa re-inisialisasi
    expenseChart.data.labels          = labels;
    expenseChart.data.datasets[0].data            = data;
    expenseChart.data.datasets[0].backgroundColor = colors;
    expenseChart.update();
    return;
  }

  // Inisialisasi chart baru
  expenseChart = new Chart(chartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 3,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      // Hanya aktifkan interaksi saat ada event mouse/touch yang nyata —
      // mencegah tooltip muncul secara otomatis saat halaman pertama dimuat.
      interaction: {
        mode: 'nearest',
        intersect: true,
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 13, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          // Nonaktifkan animasi tooltip agar tidak "stuck" di posisi awal
          animation: false,
          callbacks: {
            label(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((value / total) * 100).toFixed(1);
              return ` ${formatRupiah(value)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ===========================
   Full Re-render (1 fungsi untuk sinkronisasi semua bagian UI)
=========================== */

function renderAll() {
  renderBalance();
  renderTransactions();
  renderChart();
}

/* ===========================
   Event: Tambah Transaksi
=========================== */

form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!validateForm()) return;

  const newTransaction = {
    id:       generateId(),
    name:     inputName.value.trim(),
    amount:   Number(inputAmount.value.trim()),
    category: inputCategory.value,
  };

  const transactions = getTransactions();
  transactions.push(newTransaction);
  saveTransactions(transactions);

  // Reset form
  form.reset();
  clearFieldError(inputName, errorName);
  clearFieldError(inputAmount, errorAmount);
  clearFieldError(inputCategory, errorCategory);

  renderAll();
});

/* ===========================
   Event: Hapus Transaksi (Event Delegation)
=========================== */

transactionList.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;

  const id = btn.dataset.id;
  const transactions = getTransactions().filter(tx => tx.id !== id);
  saveTransactions(transactions);

  renderAll();
});

/* ===========================
   Event: Clear error saat user mulai mengetik
=========================== */

inputName.addEventListener('input', () => clearFieldError(inputName, errorName));
inputAmount.addEventListener('input', () => clearFieldError(inputAmount, errorAmount));
inputCategory.addEventListener('change', () => clearFieldError(inputCategory, errorCategory));

/* ===========================
   Dark / Light Mode
=========================== */

const THEME_KEY = 'expense_theme';

function applyTheme(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  themeIcon.textContent = isDark ? '☀️' : '🌙';
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = !document.body.classList.contains('dark-mode');
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
});

/* ===========================
   Sort Select
=========================== */

sortSelect.addEventListener('change', () => renderTransactions());

/* ===========================
   Init — Render saat halaman pertama kali dibuka
=========================== */

// Pulihkan preferensi tema dari localStorage
applyTheme(localStorage.getItem(THEME_KEY) === 'dark');

renderAll();
