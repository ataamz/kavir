// Discount state
let discountEnabled = false;
let lastProducts = [];

// تعریف مقادیر پایه
const CONSTANTS = {
  DISCOUNT_FACTOR: 0.97, // 3% discount
  BASE_PRICE_FACTOR: 1.072, // Default base price multiplier
  BASE_PRICE_FACTOR_DISCOUNTED: 1.042, // Base price multiplier when discount is enabled
  PRICE_THRESHOLD: 2000000000,
  INSTALLMENT_FACTORS: {
    LOW: 0.05241,
    HIGH: 0.03844
  },
  INSTALLMENT_MONTHS: {
    LOW: 24,
    HIGH: 36
  },
  SIDE_COST_FACTORS: {
    BLOCK: 0.06061125,
    CONTRACT: 0.005158875
  },
  CONTRACT_ADDON: 1000000,
  CREDIT_ROUNDING: 100000000,
  
  // 💰 ضرایب حالت عادی
  CHEQUE_MULTIPLIERS_DEFAULT: {
    '8':  { INVOICE: 1.072, PREPAY: 0.260519 },
    '12': { INVOICE: 1.104, PREPAY: 0.255603 },
    '16': { INVOICE: 1.136, PREPAY: 0.250953 },
    '20': { INVOICE: 1.168, PREPAY: 0.246571 },
    '24': { INVOICE: 1.2,   PREPAY: 0.242396 },
    // ضرایب برای Bike=1
    'bike_8':  { INVOICE: 1.072, PREPAY: 0.214400 },
    'bike_10': { INVOICE: 1.088, PREPAY: 0.217600 }
  },

  // 💸 ضرایب حالت تخفیف‌دار (قابل ویرایش آزادانه)
  CHEQUE_MULTIPLIERS_DISCOUNTED: {
    '8':  { INVOICE: 1.042, PREPAY: 0.250000 },
    '12': { INVOICE: 1.074, PREPAY: 0.245000 },
    '16': { INVOICE: 1.106, PREPAY: 0.240000 },
    '20': { INVOICE: 1.138, PREPAY: 0.235000 },
    '24': { INVOICE: 1.17, PREPAY: 0.230000 },
    // ضرایب برای Bike=1
    'bike_8':  { INVOICE: 1.042, PREPAY: 0.214400 },
    'bike_10': { INVOICE: 1.058, PREPAY: 0.217600 }
  },

  GUARANTEE_FACTOR: 0.25,
  FIXED_CREDIT_36M: 2100000000,
  BIKE_CASH_PRICE_THRESHOLD: 100000000
};

// ✅ تابعی که همیشه ضرایب درست را برمی‌گرداند
function getChequeMultipliers() {
  return discountEnabled
    ? CONSTANTS.CHEQUE_MULTIPLIERS_DISCOUNTED
    : CONSTANTS.CHEQUE_MULTIPLIERS_DEFAULT;
}

// ✅ پراکسی داینامیک برای دسترسی مستقیم به ضرایب فعال
const CHEQUE_MULTIPLIERS = new Proxy({}, {
  get(target, prop) {
    const active = getChequeMultipliers();
    return active[prop];
  }
});

// Helper function to get base price factor based on discount state
function getBasePriceFactor() {
  return discountEnabled ? CONSTANTS.BASE_PRICE_FACTOR_DISCOUNTED : CONSTANTS.BASE_PRICE_FACTOR;
}

const grid = document.getElementById('grid');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const closeModal = document.getElementById('closeModal');

// Insert a small checkbox control near the drop area (or before grid)
(function insertDiscountControl(){
  const html = `
    <div id="discountControl" class="mb-4 mt-4 px-2 text-sm">
      <label class="inline-flex items-center cursor-pointer">
        <input id="enableDiscount" type="checkbox" class="sr-only" />
        <span id="enableDiscountSwitch" class="w-11 h-6 bg-gray-200 rounded-full relative ml-2 transition-colors" style="display:inline-block;vertical-align:middle"></span>
        فعالسازی تخفیف (3%)
      </label>
    </div>`;
  try{
    if(grid && grid.parentNode){
      grid.insertAdjacentHTML('beforebegin', html);
    } else {
      document.body.insertAdjacentHTML('afterbegin', html);
    }
    const cb = document.getElementById('enableDiscount');
    const sw = document.getElementById('enableDiscountSwitch');
    function updateSwitchAppearance(checked){
      if(!sw) return;
      if(checked){
        sw.style.backgroundColor = '#4f46e5'; // indigo-600
        sw.innerHTML = '<span style="position:absolute;right:3px;top:50%;transform:translateY(-50%);width:18px;height:18px;background:white;border-radius:50%"></span>';
      } else {
        sw.style.backgroundColor = '#cfcfcfff'; // gray-200
        sw.innerHTML = '<span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);width:18px;height:18px;background:white;border-radius:50%"></span>';
      }
    }
    if(cb){
      updateSwitchAppearance(cb.checked);
      cb.addEventListener('change', ()=>{
        discountEnabled = !!cb.checked;
        updateSwitchAppearance(cb.checked);
        renderProducts(lastProducts || []);
      });
    }
  }catch(e){ /* ignore DOM insertion failures */ }
})();

function showModal(html){
  modalContent.innerHTML = html;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}
function hideModal(){
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}
closeModal.addEventListener('click', hideModal);
modal.addEventListener('click', (e)=>{ if(e.target===modal) hideModal(); });

function parseCSV(text){
  const lines = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const nxt = text[i+1];
    if(ch==='"'){
      if(inQuotes && nxt==='"'){ cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if(ch==='\n' && !inQuotes){
      row.push(cur.replace(/\r$/, ''));
      lines.push(row);
      row = [];
      cur = '';
      continue;
    }
    if(ch===',' && !inQuotes){ row.push(cur); cur=''; continue; }
    cur += ch;
  }
  if(cur.length || row.length) { row.push(cur.replace(/\r$/, '')); lines.push(row); }
  return lines;
}

function arrayToObjects(arr){
  const [head, ...rows] = arr;
  if(!head) return [];
  return rows.map(r=>{
    const obj = {};
    for(let i=0;i<head.length;i++) obj[head[i].trim()] = (r[i]||'').trim();
    return obj;
  });
}

function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c]));
}

function fmtNumber(n, decimals=0){
  const num = parseFloat(n);
  if(!isFinite(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function roundUpToMillion(n){
  if(!isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 1000000) * 1000000;
}

function getInstallmentDetails(price){
  const months = (price > CONSTANTS.PRICE_THRESHOLD) ? CONSTANTS.INSTALLMENT_MONTHS.HIGH : CONSTANTS.INSTALLMENT_MONTHS.LOW;
  const factor = (price > CONSTANTS.PRICE_THRESHOLD) ? CONSTANTS.INSTALLMENT_FACTORS.HIGH : CONSTANTS.INSTALLMENT_FACTORS.LOW;
  const raw = price * factor;
  const rounded = roundUpToMillion(raw);
  return { months, factor, raw, rounded };
}

function buildModalHtml(title, price, showPrice = true, forceTabs = false, code = null, rawPrice = null, originalPrice = null, isBike = false){
  const details = getInstallmentDetails(price);
  const months = details.months;
  const factor = details.factor;
  const installmentRounded = details.rounded;

  const creditPrice = Math.ceil(price / CONSTANTS.CREDIT_ROUNDING) * CONSTANTS.CREDIT_ROUNDING;
  const creditRow = `<div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">میزان اعتبار</div><div class="font-medium text-gray-800">${fmtNumber(creditPrice,0)} ریال</div></div>`;

  const sideRaw = creditPrice * (CONSTANTS.SIDE_COST_FACTORS.BLOCK + CONSTANTS.SIDE_COST_FACTORS.CONTRACT);
  const sideWithAdd = sideRaw + CONSTANTS.CONTRACT_ADDON;
  const sideRounded = roundUpToMillion(sideWithAdd);

  const sideRow = `<div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">بلوکه + قرارداد</div><div class="font-medium text-gray-800">${fmtNumber(sideRounded,0)} ریال</div></div>`;

  let cashPriceRow = '';
  let originalPriceRow = '';
  if(showPrice){
    cashPriceRow = `<div class="flex justify-between py-2"><div class="text-sm text-gray-600">قیمت نقدی محصول</div><div class="font-semibold text-gray-800 text-lg">${fmtNumber(price,0)} ریال</div></div>`;
  }
  if(discountEnabled && originalPrice !== null && originalPrice !== undefined && originalPrice !== price){
    originalPriceRow = `<div class="flex justify-between py-2 border-t"><div class="text-sm text-gray-600">قیمت بدون تخفیف</div><div class="font-medium text-gray-800">${fmtNumber(originalPrice,0)} ریال</div></div>`;
  } else {
    originalPriceRow = ''; // Explicitly set to empty when discount is not enabled
  }

  if(isBike){
    // فقط خرید چکی برای محصولات Bike=1، بدون مبلغ چک ضمانت و قیمت نقدی
    const show10Months = price >= CONSTANTS.BIKE_CASH_PRICE_THRESHOLD;
    const chequeContentHtml = `
      <div id="tabChequeContent" class="mt-4">
        <div class="mb-3">
          <label class="text-sm text-gray-700 block mb-1">نحوه خرید</label>
          <select id="chequeMode" class="w-full border px-2 py-1 rounded">
            <option value="bike_8" selected>8 ماهه</option>
            ${show10Months ? '<option value="bike_10">10 ماهه</option>' : ''}
          </select>
        </div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ فاکتور</div><div id="chequeInvoice" class="font-medium text-gray-800">-</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">پیش پرداخت</div><div id="chequePrepay" class="font-medium text-gray-800">-</div></div>
        <div class="flex justify-between py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div id="chequeInstallment" class="font-medium text-gray-800">-</div></div>
        ${discountEnabled ? `<div class="flex justify-between py-2 border-t"><div class="text-sm text-gray-600">قیمت بدون تخفیف</div><div id="chequeOriginalPrice" class="font-medium text-gray-800">-</div></div>` : ''}
      </div>
    `;
    const codeUnderTitle = code ? `<div class="text-sm text-gray-600 mb-2">${escapeHtml(code)}</div>` : '';
    return `<div class="text-2xl font-semibold mb-1 text-gray-900">${escapeHtml(title)}</div>${codeUnderTitle}${chequeContentHtml}`;
  }

  const mainRows = `
    <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">تعداد اقساط</div><div class="font-medium text-gray-800">${months} ماه</div></div>
    <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div class="font-medium text-gray-800">${fmtNumber(installmentRounded,0)} ریال</div></div>
  ${creditRow}
  ${sideRow}
  ${cashPriceRow}
  ${originalPriceRow}`;

  if(forceTabs && price <= CONSTANTS.PRICE_THRESHOLD){
    const inst24 = roundUpToMillion(price * CONSTANTS.INSTALLMENT_FACTORS.LOW);
    const credit24 = Math.ceil(price / CONSTANTS.CREDIT_ROUNDING) * CONSTANTS.CREDIT_ROUNDING;
    const side24 = roundUpToMillion((credit24 * (CONSTANTS.SIDE_COST_FACTORS.BLOCK + CONSTANTS.SIDE_COST_FACTORS.CONTRACT)) + CONSTANTS.CONTRACT_ADDON);
    const inst36 = roundUpToMillion(price * CONSTANTS.INSTALLMENT_FACTORS.HIGH);
    const credit36 = CONSTANTS.FIXED_CREDIT_36M;
    const side36 = roundUpToMillion((credit36 * (CONSTANTS.SIDE_COST_FACTORS.BLOCK + CONSTANTS.SIDE_COST_FACTORS.CONTRACT)) + CONSTANTS.CONTRACT_ADDON);

    const tabHtml = `
      <div class="flex gap-2 mb-4">
        <button id="tab24" class="px-3 py-2 bg-indigo-600 text-white rounded">24 ماه</button>
        <button id="tab36" class="px-3 py-2 bg-white text-gray-700 rounded border">36 ماه</button>
        <button id="tabCheque" class="px-3 py-2 bg-white text-gray-700 rounded border">خرید چکی</button>
      </div>
      <div id="tab24Content">
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div class="font-medium text-gray-800">${fmtNumber(inst24,0)} ریال</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">میزان اعتبار</div><div class="font-medium text-gray-800">${fmtNumber(credit24,0)} ریال</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">بلوکه + قرارداد</div><div class="font-medium text-gray-800">${fmtNumber(side24,0)} ریال</div></div>
        ${cashPriceRow}
        ${discountEnabled ? originalPriceRow : ''}
      </div>
      <div id="tab36Content" class="hidden">
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div class="font-medium text-gray-800">${fmtNumber(inst36,0)} ریال</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">میزان اعتبار</div><div class="font-medium text-gray-800">${fmtNumber(credit36,0)} ریال</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">بلوکه + قرارداد</div><div class="font-medium text-gray-800">${fmtNumber(side36,0)} ریال</div></div>
        ${cashPriceRow}
        ${discountEnabled ? originalPriceRow : ''}
      </div>
      <div id="tabChequeContent" class="hidden mt-4">
        <div class="mb-3">
          <label class="text-sm text-gray-700 block mb-1">نحوه خرید</label>
          <select id="chequeMode" class="w-full border px-2 py-1 rounded">
            <option value="8" selected>8 ماهه</option>
            <option value="12">12 ماهه</option>
            <option value="16">16 ماهه</option>
            <option value="20">20 ماهه</option>
            <option value="24">24 ماهه</option>
          </select>
        </div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ فاکتور</div><div id="chequeInvoice" class="font-semibold text-gray-800">-</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">پیش پرداخت</div><div id="chequePrepay" class="font-medium text-gray-800">-</div></div>
        <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div id="chequeInstallment" class="font-medium text-gray-800">-</div></div>
        <div class="flex justify-between py-2"><div class="text-sm text-gray-600">مبلغ چک ضمانت</div><div id="chequeGuarantee" class="font-medium text-gray-800">-</div></div>
        ${discountEnabled ? `<div class="flex justify-between py-2 border-t"><div class="text-sm text-gray-600">قیمت بدون تخفیف</div><div id="chequeOriginalPrice" class="font-medium text-gray-800">-</div></div>` : ''}
      </div>
    `;

    const codeUnderTitle = code ? `<div class="text-sm text-gray-600 mb-2">${escapeHtml(code)}</div>` : '';
    return `<div class="text-2xl font-semibold mb-1 text-gray-900">${escapeHtml(title)}</div>${codeUnderTitle}${tabHtml}`;
  }

  let extraRows = '';
  if(price <= CONSTANTS.PRICE_THRESHOLD){
    const v36 = roundUpToMillion(price * CONSTANTS.INSTALLMENT_FACTORS.HIGH);
    extraRows = `<div class="flex justify-between py-2"><div class="text-base font-semibold text-sm text-gray-600">اقساط 36 ماهه</div><div class="text-base font-semibold text-gray-800 ">${fmtNumber(v36,0)} ریال</div></div>`;
  }

  const separator = extraRows ? `` : '';

  const codeUnderTitle = code ? `<div class="text-sm text-gray-600 mb-2">${escapeHtml(code)}</div>` : '';
  const chequeButtonHtml = rawPrice ? `<div class="flex gap-2 mb-4"><button id="tab36Single" class="px-3 py-2 bg-indigo-600 text-white rounded border">36 ماه</button><button id="tabCheque" class="px-3 py-2 bg-white text-gray-700 rounded border">خرید چکی</button></div>` : '';
  const chequeContentHtml = rawPrice ? `
    <div id="tabChequeContent" class="hidden mt-4">
      <div class="mb-3">
        <label class="text-sm text-gray-700 block mb-1">نحوه خرید</label>
        <select id="chequeMode" class="w-full border px-2 py-1 rounded">
          <option value="8" selected>8 ماهه</option>
          <option value="12">12 ماهه</option>
          <option value="16">16 ماهه</option>
          <option value="20">20 ماهه</option>
          <option value="24">24 ماهه</option>
        </select>
      </div>
      <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">مبلغ فاکتور</div><div id="chequeInvoice" class="font-medium text-gray-800">-</div></div>
      <div class="flex justify-between border-b py-2"><div class="text-sm text-gray-600">پیش پرداخت</div><div id="chequePrepay" class="font-medium text-gray-800">-</div></div>
      <div class="flex justify-between py-2"><div class="text-sm text-gray-600">مبلغ هر قسط</div><div id="chequeInstallment" class="font-medium text-gray-800">-</div></div>
      <div class="flex justify-between py-2"><div class="text-sm text-gray-600">مبلغ چک ضمانت</div><div id="chequeGuarantee" class="font-medium text-gray-800">-</div></div>
      ${discountEnabled ? `<div class="flex justify-between py-2 border-t"><div class="text-sm text-gray-600">قیمت بدون تخفیف</div><div id="chequeOriginalPrice" class="font-medium text-gray-800">-</div></div>` : ''}
    </div>
  ` : '';

  const mainWrapper = `<div id="mainRowsContent">${mainRows}${separator}${extraRows}</div>`;
  return `<div class="text-2xl font-semibold mb-1 text-gray-900">${escapeHtml(title)}</div>${codeUnderTitle}${chequeButtonHtml}${chequeContentHtml}${mainWrapper}`;
}

function renderProducts(products){
  grid.innerHTML = '';
  lastProducts = products;
  if(!products.length){ 
    grid.innerHTML = '<p class="text-center text-gray-400 py-12">هیچ محصولی موجود نیست.</p>';
    return; }
  const existingCodes = new Set();
  products.forEach(row=>{
    const ev = (row.Exist || row.exist || row['Exist'] || row['exist'] || row['EXIST'] || '').toString().trim();
    if(!ev) return;
    const toks = ev.split(/[,;|\s]+/).map(t=>t.trim()).filter(Boolean);
    toks.forEach(t=>{
      const low = t.toString().trim();
      if(!low) return;
      const ll = low.toLowerCase();
      if(['1','0','true','false','yes','no'].includes(ll)) return;
      existingCodes.add(low);
      existingCodes.add(ll);
    });
  });

  products.forEach((p, idx)=>{
    const name = p.Name || p.name || p.Title || p.title || p['نام'] || Object.values(p)[0] || 'نام نامشخص';
    const card = document.createElement('button');
    const codeInRow = (p.Code || p.code || p['Code'] || p['code'] || '').toString().trim();
    let isExist = false;
    if(codeInRow){
      const low = codeInRow.toString().trim();
      isExist = existingCodes.has(low) || existingCodes.has(low.toLowerCase()) || existingCodes.has(low.toUpperCase());
    }
    if(!isExist){
      const existVal = (p.Exist || p.exist || p['Exist'] || p['exist'] || p['EXIST'] || '').toString().trim().toLowerCase();
      if(['1','true','yes','y'].includes(existVal)) isExist = true;
    }
    card.className = isExist
      ? 'text-left py-6 rounded-2xl shadow-md bg-green-100 hover:scale-105 transition transform border border-gray-200'
      : 'text-left py-6 rounded-2xl shadow-md bg-gradient-to-br from-white to-gray-50 hover:scale-105 transition transform border border-gray-200';
    try{ card.dataset.name = (name||'').toString().toLowerCase(); }catch(e){}
    card.innerHTML = `
      <div class="text-center">
        <div class="text-base text-gray-900">${escapeHtml(name)}</div>
      </div>`;
    card.addEventListener('click', ()=>{
      const rawPrice = (p.Price || p.price || '').toString();
      const cleaned = (rawPrice || '').replace(/[,\s]/g, '').replace(/[^0-9.\-]/g, '');
      const numericPrice = parseFloat(cleaned) || 0;
      const priceToUse = numericPrice;
      const basePrice = priceToUse * getBasePriceFactor();
      const originalBasePrice = discountEnabled ? numericPrice * CONSTANTS.BASE_PRICE_FACTOR : null; // Only set if discount is enabled
      const codeVal = (p.Code || p.code || p['Code'] || p['code'] || '').toString().trim();
      const rawPriceVal = numericPrice;
      const isBike = (p.Bike || p.bike || p['Bike'] || p['bike'] || '').toString().trim() === '1';
      const useTabs = !isBike && basePrice <= CONSTANTS.PRICE_THRESHOLD;
      showModal(buildModalHtml(name, basePrice, true, useTabs, codeVal, rawPriceVal, originalBasePrice, isBike));

      setTimeout(()=>{
        const chequeMode = document.getElementById('chequeMode');
        const invoiceEl = document.getElementById('chequeInvoice');
        const prepayEl = document.getElementById('chequePrepay');
        const instEl = document.getElementById('chequeInstallment');
        const guaranteeEl = document.getElementById('chequeGuarantee');
        const chequeOriginalEl = document.getElementById('chequeOriginalPrice');

        if(chequeMode && invoiceEl && prepayEl && instEl){
          function computeCheque(){
            const mode = chequeMode.value;
            const invoiceMultiplier = CHEQUE_MULTIPLIERS[mode]?.INVOICE || getBasePriceFactor();
            const prepayMultiplier = CHEQUE_MULTIPLIERS[mode]?.PREPAY || CHEQUE_MULTIPLIERS.PREPAY;
            const srcRaw = rawPriceVal;
            const invoice = srcRaw * invoiceMultiplier;
            const prepayBase = invoice * prepayMultiplier;
            const months = parseInt(mode.replace('bike_', ''),10);
            let installmentRaw = (invoice - prepayBase) / months;

            function roundSpecial(n){
              const abs = Math.abs(Math.floor(n));
              const s = abs.toString();
              const len = s.length;
              if(len === 7){
                const prefix = s.slice(0,2);
                const rounded = parseInt(prefix + '0'.repeat(5), 10);
                return Math.sign(n) * rounded;
              }
              if(len === 8){
                const prefix = s.slice(0,2);
                const rounded = parseInt(prefix + '0'.repeat(6), 10);
                return Math.sign(n) * rounded;
              }
              if(len === 9){
                const prefix = s.slice(0,3);
                const rounded = parseInt(prefix + '0'.repeat(6), 10);
                return Math.sign(n) * rounded;
              }
              if(len === 10){
                const prefix = s.slice(0,3);
                const rounded = parseInt(prefix + '0'.repeat(7), 10);
                return Math.sign(n) * rounded;
              }
              return Math.round(n);
            }

            const installmentRounded = roundSpecial(installmentRaw);
            const totalRounded = installmentRounded * months;
            const diff = invoice - (prepayBase + totalRounded);
            const prepayAdjusted = prepayBase + diff;

            let guaranteeRaw = installmentRounded * months;
            guaranteeRaw = guaranteeRaw + (guaranteeRaw * CONSTANTS.GUARANTEE_FACTOR);
            const guaranteeRounded = Math.ceil(guaranteeRaw);

            invoiceEl.textContent = fmtNumber(invoice,0) + ' ریال';
            prepayEl.textContent = fmtNumber(prepayAdjusted,0) + ' ریال';
            instEl.textContent = fmtNumber(installmentRounded,0) + ' ریال';
            if(guaranteeEl){
              guaranteeEl.textContent = fmtNumber(guaranteeRounded,0) + ' ریال';
            }
            if(chequeOriginalEl){
              const originalRaw = (rawPriceVal || 0) * (CONSTANTS.CHEQUE_MULTIPLIERS_DEFAULT[mode.replace('bike_', '')]?.INVOICE || CONSTANTS.CHEQUE_MULTIPLIERS_DEFAULT[mode]?.INVOICE || CONSTANTS.BASE_PRICE_FACTOR);
              chequeOriginalEl.textContent = fmtNumber(originalRaw,0) + ' ریال';
            }
          }

          chequeMode.addEventListener('change', computeCheque);
          computeCheque(); // محاسبه اولیه مقادیر

          if(!isBike){
            const tab24 = document.getElementById('tab24');
            const tab36 = document.getElementById('tab36');
            const t24c = document.getElementById('tab24Content');
            const t36c = document.getElementById('tab36Content');
            const tabCheque = document.getElementById('tabCheque');
            const tab36Single = document.getElementById('tab36Single');
            const mainRowsContent = document.getElementById('mainRowsContent');

            if(tab24 && tab36 && t24c && t36c){
              tab24.addEventListener('click', ()=>{
                tabCheque.classList.add('border');
                tab24.classList.add('bg-indigo-600','text-white'); tab24.classList.remove('bg-white','text-gray-700','border');
                tab36.classList.remove('bg-indigo-600','text-white'); tab36.classList.add('bg-white','text-gray-700','border');
                tabCheque && tabCheque.classList.remove('bg-indigo-600','text-white');
                t24c.classList.remove('hidden'); t36c.classList.add('hidden');
                const tCheque = document.getElementById('tabChequeContent'); if(tCheque) tCheque.classList.add('hidden');
              });
              tab36.addEventListener('click', ()=>{
                tabCheque.classList.add('border');
                tab36.classList.add('bg-indigo-600','text-white'); tab36.classList.remove('bg-white','text-gray-700','border');
                tab24.classList.remove('bg-indigo-600','text-white'); tab24.classList.add('bg-white','text-gray-700','border');
                tabCheque && tabCheque.classList.remove('bg-indigo-600','text-white');
                t36c.classList.remove('hidden'); t24c.classList.add('hidden');
                const tCheque = document.getElementById('tabChequeContent'); if(tCheque) tCheque.classList.add('hidden');
              });
              if(tabCheque){
                tabCheque.addEventListener('click', ()=>{
                  tabCheque.classList.add('bg-indigo-600','text-white'); tabCheque.classList.remove('bg-white','text-gray-700','border');
                  tab24.classList.remove('bg-indigo-600','text-white'); tab24.classList.add('bg-white','text-gray-700','border');
                  tab36.classList.remove('bg-indigo-600','text-white'); tab36.classList.add('bg-white','text-gray-700','border');
                  t24c.classList.add('hidden'); t36c.classList.add('hidden');
                  const tCheque = document.getElementById('tabChequeContent'); if(tCheque) tCheque.classList.remove('hidden');
                });
              }
            }
            if(tab36Single){
              tab36Single.addEventListener('click', ()=>{
                if(mainRowsContent) mainRowsContent.classList.remove('hidden');
                const tCheque = document.getElementById('tabChequeContent'); if(tCheque) tCheque.classList.add('hidden');
                tab36Single.classList.add('bg-indigo-600','text-white'); tab36Single.classList.remove('bg-white','text-gray-700','border');
                tabCheque && tabCheque.classList.remove('bg-indigo-600','text-white'); tabCheque && tabCheque.classList.add('bg-white','text-gray-700','border');
              });
            }
            if(tabCheque){
              tabCheque.addEventListener('click', ()=>{
                const tCheque = document.getElementById('tabChequeContent'); if(tCheque) tCheque.classList.remove('hidden');
                if(mainRowsContent) mainRowsContent.classList.add('hidden');
                tabCheque.classList.add('bg-indigo-600','text-white'); tabCheque.classList.remove('bg-white','text-gray-700','border');
                tab36Single && tab36Single.classList.remove('bg-indigo-600','text-white'); tab36Single && tab36Single.classList.add('bg-white','text-gray-700','border');
              });
            }
          }
        }
      }, 60);
    });
    grid.appendChild(card);
  });
}

function applySearchFilter(){
  if(!searchInput) return;
  const q = (searchInput.value || '').toString().trim().toLowerCase();
  const cards = Array.from(grid.children || []);
  if(!q){
    cards.forEach(c=> c.classList.remove('hidden'));
    return;
  }
  cards.forEach(c=>{
    const nm = (c.dataset && c.dataset.name) ? c.dataset.name : '';
    const keep = nm.indexOf(q) !== -1;
    c.classList.toggle('hidden', !keep);
  });
}

if(searchInput){
  searchInput.addEventListener('input', ()=> applySearchFilter());
}

const customBtn = document.getElementById('customPrice');
if(customBtn){
  customBtn.addEventListener('click', ()=>{
    showModal(`<div class="mb-4 text-lg font-medium">محاسبه با قیمت دلخواه</div>
      <div class="mb-4"><input id="customPriceInput" type="text" placeholder="مبلغ را وارد کنید" class="w-full px-3 py-2 border rounded" onclick="this.select()"/></div>
      <div id="customPriceResult"></div>`);

    const inp = document.getElementById('customPriceInput');
    const out = document.getElementById('customPriceResult');

    function addThousandsSeparators(s){
      if(!s) return '';
      const parts = s.split('.');
      const intPart = parts[0].replace(/^0+(?=\d)|[^0-9\-]/g, '');
      const sign = intPart.startsWith('-') ? '-' : '';
      const abs = sign ? intPart.slice(1) : intPart;
      const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return sign + withCommas + (parts[1] ? ('.' + parts[1]) : '');
    }

    function formatInputWithCaret(el){
      const start = el.selectionStart;
      const oldVal = el.value;
      const cleanedForFormat = oldVal.replace(/[^0-9.\-]/g, '');
      const newVal = addThousandsSeparators(cleanedForFormat);
      el.value = newVal;
      const diff = newVal.length - oldVal.length;
      const newPos = Math.max(0, start + diff);
      try{ el.setSelectionRange(newPos, newPos); }catch(e){}
    }

    function renderCustom(){
      const rawInput = (inp.value||'').toString();
      const cleaned = rawInput.replace(/[,\s]/g,'').replace(/[^0-9.\-]/g,'');
      if(!cleaned){
        out.innerHTML = '<div class="text-center text-gray-500 py-6"></div>';
        return;
      }
      const num = parseFloat(cleaned) || 0;
      out.innerHTML = buildModalHtml('', num, false);
    }

    inp.addEventListener('input', (e)=>{
      formatInputWithCaret(inp);
      renderCustom();
    });
    inp.addEventListener('blur', ()=>{ inp.value = addThousandsSeparators((inp.value||'').replace(/[^0-9.\-]/g,'')); });
    inp.addEventListener('focus', ()=>{ inp.value = (inp.value||'').replace(/,/g,''); });
    inp.focus();
    renderCustom();
  });
}

let sheetJsLoaded = false;
function loadSheetJS(){
  return new Promise((resolve, reject)=>{
    if(sheetJsLoaded && window.XLSX) return resolve();
    const trySrc = async (src)=>{
      return new Promise((res, rej)=>{
        const s = document.createElement('script');
        s.src = src;
        s.onload = ()=>res();
        s.onerror = ()=>rej(new Error('failed'));
        document.head.appendChild(s);
      });
    };
    (async ()=>{
      try{
        await trySrc('./vendor/xlsx.full.min.js');
        sheetJsLoaded = true;
        return resolve();
      }catch(_){
        try{
          await trySrc('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
          sheetJsLoaded = true;
          return resolve();
        }catch(err){
          return reject(new Error('Failed to load SheetJS from local and CDN'));
        }
      }
    })();
  });
}

// Only use embedded data (no upload, no fetch)
const tryLoadEmbedded = async () => {
  if(typeof EMBEDDED_CSV === 'undefined' && typeof EMBEDDED_XLSX_BASE64 === 'undefined'){
    // try to dynamically load scripts/embedded_list.js (non-fatal if missing)
    const tryLoadScript = (src) => new Promise((res)=>{
      try{
        const s = document.createElement('script');
        s.src = src;
        s.onload = ()=>res(true);
        s.onerror = ()=>res(false);
        document.head.appendChild(s);
      }catch(_){ res(false); }
    });
    await tryLoadScript('./scripts/embedded_list.js');
  }
  if(typeof EMBEDDED_CSV !== 'undefined' && EMBEDDED_CSV){
    const arr = parseCSV(EMBEDDED_CSV);
    const objs = arrayToObjects(arr);
    renderProducts(objs);
    return;
  }
  if(typeof EMBEDDED_XLSX_BASE64 !== 'undefined' && EMBEDDED_XLSX_BASE64){
    const b64 = EMBEDDED_XLSX_BASE64.replace(/\s+/g,'');
    const binaryString = atob(b64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for(let i=0;i<len;i++) bytes[i] = binaryString.charCodeAt(i);
    await loadSheetJS();
    const workbook = XLSX.read(bytes.buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
    const arr = parseCSV(csv);
    const objs = arrayToObjects(arr);
    renderProducts(objs);
    return;
  }
  // If nothing found, show empty
  renderProducts([]);
};

tryLoadEmbedded();

renderProducts([]);

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') hideModal();
});

document.addEventListener('keydown', (event) => {
    if(event.target.matches('#customPriceInput') && event.key === 'Enter') {
        event.preventDefault();
        let value = event.target.value.trim();
        if(value && !isNaN(value)) {
            event.target.value = value + '0000000';
            event.target.dispatchEvent(new Event('input', { bubbles: true }));
            event.target.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
});