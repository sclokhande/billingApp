// Parchiwala - Website Interactivity & Thermal Printer Simulator

// 1. Mock Screen Data for Phone Showcase
const screenTemplates = {
  dashboard: `
    <div class="app-header">
      <span class="app-title">📊 Dashboard</span>
      <div class="app-profile-icon">G</div>
    </div>
    <div class="app-dash-grid">
      <div class="app-dash-card">
        <span class="app-dash-card-label">Sales Today</span>
        <div class="app-dash-card-val">₹14,250</div>
        <span class="app-status-badge app-status-paid">+12% vs yest</span>
      </div>
      <div class="app-dash-card">
        <span class="app-dash-card-label">Bills Printed</span>
        <div class="app-dash-card-val">42</div>
        <span class="app-status-badge app-status-paid">100% success</span>
      </div>
    </div>
    <div class="app-sales-bar-container">
      <span class="app-dash-card-label">Weekly Sales Trend</span>
      <div class="app-bar-chart">
        <div class="app-bar-column" style="height: 40%;" title="Mon: ₹4k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">M</div></div>
        <div class="app-bar-column" style="height: 60%;" title="Tue: ₹6k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">T</div></div>
        <div class="app-bar-column" style="height: 55%;" title="Wed: ₹5.5k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">W</div></div>
        <div class="app-bar-column" style="height: 75%;" title="Thu: ₹7.5k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">T</div></div>
        <div class="app-bar-column" style="height: 90%;" title="Fri: ₹9k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">F</div></div>
        <div class="app-bar-column" style="height: 100%;" title="Sat: ₹10k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">S</div></div>
        <div class="app-bar-column" style="height: 30%;" title="Sun: ₹3k"><div class="app-bar-label" style="position:absolute; bottom:-16px; left:0; right:0;">S</div></div>
      </div>
    </div>
    <div style="margin-top: 10px;">
      <span class="app-recent-title">Recent Invoices</span>
      <div class="app-invoice-row">
        <div class="app-invoice-meta">
          <h4>Inv #1042</h4>
          <p>Walk-in • 10:42 AM</p>
        </div>
        <span class="app-invoice-amt">₹340.00</span>
      </div>
      <div class="app-invoice-row">
        <div class="app-invoice-meta">
          <h4>Inv #1041</h4>
          <p>Ramesh Sharma • 10:15 AM</p>
        </div>
        <span class="app-invoice-amt">₹1,250.00</span>
      </div>
      <div class="app-invoice-row">
        <div class="app-invoice-meta">
          <h4>Inv #1040</h4>
          <p>Walk-in • 09:50 AM</p>
        </div>
        <span class="app-invoice-amt">₹75.00</span>
      </div>
    </div>
  `,
  builder: `
    <div class="app-header">
      <span class="app-title">➕ Bill Builder</span>
      <span style="font-size: 11px; font-weight:600; color:var(--color-secondary);">NEW BILL</span>
    </div>
    <div class="app-customer-picker">
      <span>👤 Walk-in Customer</span>
      <span>▼</span>
    </div>
    <div class="app-billing-item-list">
      <div class="app-billing-item-row">
        <div>
          <div class="app-billing-item-name">Premium Tea Powder</div>
          <div class="app-billing-item-qty">2 pc x ₹120.00</div>
        </div>
        <div class="app-billing-item-total">₹240.00</div>
      </div>
      <div class="app-billing-item-row">
        <div>
          <div class="app-billing-item-name">Fresh Milk 1L</div>
          <div class="app-billing-item-qty">3 pc x ₹60.00</div>
        </div>
        <div class="app-billing-item-total">₹180.00</div>
      </div>
      <div class="app-billing-item-row">
        <div>
          <div class="app-billing-item-name">Refined Sugar 1Kg</div>
          <div class="app-billing-item-qty">1 pc x ₹45.00</div>
        </div>
        <div class="app-billing-item-total">₹45.00</div>
      </div>
    </div>
    <div class="app-billing-summary">
      <div class="app-summary-row">
        <span>Subtotal:</span>
        <span>₹465.00</span>
      </div>
      <div class="app-summary-row">
        <span>GST (18% included):</span>
        <span>₹70.93</span>
      </div>
      <div class="app-summary-row app-summary-total">
        <span>TOTAL DUE:</span>
        <span>₹465.00</span>
      </div>
    </div>
    <div class="app-btn-action" style="background-color: var(--color-success);">
      🔌 Print Invoice (₹465)
    </div>
  `,
  preview: `
    <div class="app-header">
      <span class="app-title">📄 Print Preview</span>
      <span style="font-size: 10px; color:var(--color-outline);">58mm Width</span>
    </div>
    <div class="app-ticket-view">
      <div class="app-ticket-center">
        <strong>GUPTA GENERAL STORE</strong><br>
        Shop 12, Main Market, Mumbai<br>
        Ph: 9876543210
      </div>
      <div class="app-ticket-divider"></div>
      <div class="app-ticket-row">
        <span>Bill No: #1042</span>
        <span>Date: 27/06/2026</span>
      </div>
      <div class="app-ticket-row">
        <span>Cust: Walk-in</span>
        <span>Time: 10:42 AM</span>
      </div>
      <div class="app-ticket-double-divider"></div>
      <div class="app-ticket-row" style="font-weight:bold;">
        <span>Item Name  Qty  Rate  Total</span>
      </div>
      <div class="app-ticket-divider"></div>
      <div class="app-ticket-row">
        <span>Tea Powder  2pc  120.  240.00</span>
      </div>
      <div class="app-ticket-row">
        <span>Fresh Milk  3pc   60.  180.00</span>
      </div>
      <div class="app-ticket-row">
        <span>Sugar 1Kg   1pc   45.   45.00</span>
      </div>
      <div class="app-ticket-divider"></div>
      <div class="app-ticket-row">
        <span>Subtotal:</span>
        <span>₹465.00</span>
      </div>
      <div class="app-ticket-row">
        <span>CGST (9%):</span>
        <span>₹35.47</span>
      </div>
      <div class="app-ticket-row">
        <span>SGST (9%):</span>
        <span>₹35.46</span>
      </div>
      <div class="app-ticket-double-divider"></div>
      <div class="app-ticket-row" style="font-weight:bold; font-size:12px;">
        <span>GRAND TOTAL:</span>
        <span>₹465.00</span>
      </div>
      <div class="app-ticket-double-divider"></div>
      <div class="app-ticket-center" style="margin-top:5px;">
        Thank You Visit Again!<br>
        print by Parchiwala
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <div class="app-btn-action" style="flex:1; margin-top:0; font-size:11px;">Share PDF</div>
      <div class="app-btn-action" style="flex:1; margin-top:0; font-size:11px; background-color:var(--color-secondary);">Print Receipt</div>
    </div>
  `,
  catalog: `
    <div class="app-header">
      <span class="app-title">📦 Product Catalog</span>
      <div class="app-profile-icon" style="background-color: var(--color-primary-glow);">＋</div>
    </div>
    <div style="margin-bottom: 10px; display:flex; gap:6px;">
      <input type="text" placeholder="🔍 Search product..." style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--color-outline); font-size:11px;" value="">
    </div>
    <div class="app-catalog-grid">
      <div class="app-catalog-card">
        <div class="app-catalog-info">
          <h4>Premium Tea Powder</h4>
          <p>SKU: TEA01 • Unit: Pcs</p>
        </div>
        <span class="app-catalog-price">₹120.00</span>
      </div>
      <div class="app-catalog-card">
        <div class="app-catalog-info">
          <h4>Fresh Milk 1L</h4>
          <p>SKU: MLK02 • Unit: Pcs</p>
        </div>
        <span class="app-catalog-price">₹60.00</span>
      </div>
      <div class="app-catalog-card">
        <div class="app-catalog-info">
          <h4>Refined Sugar 1Kg</h4>
          <p>SKU: SGR09 • Unit: Pcs</p>
        </div>
        <span class="app-catalog-price">₹45.00</span>
      </div>
      <div class="app-catalog-card">
        <div class="app-catalog-info">
          <h4>Wheat Flour 5Kg</h4>
          <p>SKU: FLR04 • Unit: Pcs</p>
        </div>
        <span class="app-catalog-price">₹210.00</span>
      </div>
    </div>
  `,
  customers: `
    <div class="app-header">
      <span class="app-title">👥 Customers</span>
      <div class="app-profile-icon" style="background-color: var(--color-primary-glow);">＋</div>
    </div>
    <div class="app-customer-card">
      <div class="app-customer-name">Ramesh Sharma</div>
      <div class="app-customer-phone">📞 +91 98123 45678</div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10px; color:var(--color-primary);">
        <span>Bills: 12</span>
        <span>Balance: ₹0.00</span>
      </div>
    </div>
    <div class="app-customer-card">
      <div class="app-customer-name">Anjali Verma</div>
      <div class="app-customer-phone">📞 +91 98765 43210</div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10px; color:var(--color-primary);">
        <span>Bills: 5</span>
        <span>Balance: ₹120.00 Due</span>
      </div>
    </div>
    <div class="app-customer-card">
      <div class="app-customer-name">Karan Johar</div>
      <div class="app-customer-phone">📞 +91 99887 76655</div>
      <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10px; color:var(--color-primary);">
        <span>Bills: 21</span>
        <span>Balance: ₹0.00</span>
      </div>
    </div>
  `
};

// 2. Active Screen Swapping Function
function switchScreen(screenName) {
  // Update Active Tab styles
  const tabs = document.querySelectorAll('.screen-tab');
  tabs.forEach(tab => {
    tab.classList.remove('active');
    if (tab.id === `tab-${screenName}`) {
      tab.classList.add('active');
    }
  });

  // Inject content
  const screenContent = document.getElementById('phone-screen-content');
  if (screenContent && screenTemplates[screenName]) {
    screenContent.innerHTML = screenTemplates[screenName];
  }
}

// 3. Simulator Inventory Data
const simInventory = [
  { id: 'item1', name: 'Premium Tea Powder', price: 120.0, unit: 'pcs', active: true, count: 2 },
  { id: 'item2', name: 'Fresh Milk 1L', price: 60.0, unit: 'pcs', active: true, count: 3 },
  { id: 'item3', name: 'Refined Sugar 1Kg', price: 45.0, unit: 'pcs', active: true, count: 1 },
  { id: 'item4', name: 'Wheat Flour 5Kg', price: 210.0, unit: 'pcs', active: false, count: 1 },
  { id: 'item5', name: 'Basmati Rice 1Kg', price: 95.0, unit: 'pcs', active: false, count: 1 },
  { id: 'item6', name: 'Parle-G Biscuit Small', price: 10.0, unit: 'pcs', active: false, count: 1 },
  { id: 'item7', name: 'Instant Coffee 100g', price: 180.0, unit: 'pcs', active: false, count: 1 }
];

// Initialize simulator items checklist
function initSimulatorItems() {
  const container = document.getElementById('sim-items-container');
  if (!container) return;
  
  container.innerHTML = '';
  simInventory.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = `sim-item-row ${item.active ? 'selected' : ''}`;
    row.id = `sim-row-${item.id}`;
    
    row.innerHTML = `
      <div class="sim-item-info">
        <input type="checkbox" class="sim-item-checkbox" id="check-${item.id}" ${item.active ? 'checked' : ''} onchange="toggleSimItem('${item.id}')">
        <label for="check-${item.id}" class="sim-item-name">${item.name}</label>
        <span class="sim-item-price">₹${item.price.toFixed(2)}</span>
      </div>
      <div class="sim-item-counter" id="counter-${item.id}">
        <button class="counter-btn" onclick="updateItemCount('${item.id}', -1)">-</button>
        <span class="counter-val" id="val-${item.id}">${item.count}</span>
        <button class="counter-btn" onclick="updateItemCount('${item.id}', 1)">+</button>
      </div>
    `;
    
    container.appendChild(row);
  });
}

// Toggle active state of simulator item
function toggleSimItem(itemId) {
  const item = simInventory.find(i => i.id === itemId);
  if (!item) return;
  
  item.active = !item.active;
  
  const row = document.getElementById(`sim-row-${itemId}`);
  const checkbox = document.getElementById(`check-${itemId}`);
  
  if (item.active) {
    row.classList.add('selected');
    checkbox.checked = true;
  } else {
    row.classList.remove('selected');
    checkbox.checked = false;
  }
}

// Increment / Decrement simulator item count
function updateItemCount(itemId, delta) {
  const item = simInventory.find(i => i.id === itemId);
  if (!item || !item.active) return;
  
  item.count += delta;
  if (item.count < 1) item.count = 1;
  
  const counterVal = document.getElementById(`val-${itemId}`);
  if (counterVal) {
    counterVal.innerText = item.count;
  }
}

// 4. Web Audio API synthesized printing sounds
// This function creates realistic buzzy thermal print line sweeps
function playPrintSound() {
  try {
    // Standard audio context setup
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playLineBeep = (time, duration, frequency, type = 'square') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, time);
      
      // Fast pitch sweep down to simulate motor steps
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.4, time + duration);
      
      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + duration);
    };

    // Print block timeline
    const startTime = ctx.currentTime;
    let timeOffset = 0;
    
    // Simulate lines printing. Each line is a series of motor clicks + head buzz
    for (let i = 0; i < 28; i++) {
      // Line feed noise
      const lineDuration = 0.08;
      const spacing = 0.1;
      const playTime = startTime + timeOffset;
      
      // Step click
      playLineBeep(playTime, 0.01, 80, 'sine');
      // Thermal heating dot buzz
      playLineBeep(playTime + 0.01, lineDuration - 0.02, Math.random() * 200 + 400, 'square');
      
      timeOffset += spacing;
    }
  } catch (e) {
    console.log("Audio not supported or blocked by permissions", e);
  }
}

// 5. Thermal Receipt Formatting Helpers (Aligning with printService.ts)
function centerText(text, width) {
  if (text.length >= width) return text.substring(0, width);
  const padding = Math.floor((width - text.length) / 2);
  return ' '.repeat(padding) + text + ' '.repeat(width - text.length - padding);
}

function formatRow(leftText, rightText, width) {
  const spaceCount = width - (leftText.length + rightText.length);
  if (spaceCount <= 0) {
    const truncatedLeft = leftText.substring(0, width - rightText.length - 2) + '..';
    const spaces = width - (truncatedLeft.length + rightText.length);
    return truncatedLeft + ' '.repeat(spaces > 0 ? spaces : 1) + rightText;
  }
  return leftText + ' '.repeat(spaceCount) + rightText;
}

function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + word).length >= width) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  return lines;
}

function formatTabularRow(name, qty, rate, total, width) {
  let nameWidth = 12;
  let qtyWidth = 5;
  let rateWidth = 7;
  let totalWidth = 8;
  
  if (width === 48) {
    nameWidth = 24;
    qtyWidth = 6;
    rateWidth = 8;
    totalWidth = 10;
  }
  
  const namePart = name.padEnd(nameWidth, ' ').substring(0, nameWidth);
  const qtyPart = qty.padStart(qtyWidth, ' ').substring(0, qtyWidth);
  const ratePart = rate.padStart(rateWidth, ' ').substring(0, rateWidth);
  const totalPart = total.padStart(totalWidth, ' ').substring(0, totalWidth);
  
  return namePart + qtyPart + ratePart + totalPart;
}

// 6. Compile and Print Simulated Receipt
function handleSimulatePrint() {
  const printWidthVal = document.getElementById('sim-print-width').value;
  const isGstVal = document.getElementById('sim-gst-enabled').value === 'yes';
  const shopNameVal = document.getElementById('sim-shop-name').value || 'MY BILLING STORE';
  const addressVal = document.getElementById('sim-shop-address').value || 'SHOP ADDRESS';
  const phoneVal = document.getElementById('sim-shop-phone').value || '0000000000';
  const sloganVal = document.getElementById('sim-slogan').value || 'Thank You Visit Again!';
  
  // Set width constraints matching 58mm (32 chars) / 80mm (48 chars)
  const width = printWidthVal === '80mm' ? 48 : 32;
  
  // Collect active items
  const billedItems = simInventory.filter(item => item.active);
  
  if (billedItems.length === 0) {
    alert("Please select at least one item to bill.");
    return;
  }
  
  // Prevent double prints or interferences
  const printButton = document.getElementById('btn-simulate-print');
  const printerBody = document.querySelector('.printer-visual-body');
  const ledStatus = document.getElementById('led-status');
  const receiptContainer = document.getElementById('printed-receipt-container');
  
  printButton.disabled = true;
  printButton.innerHTML = `<span class="icon">⌛</span> Printing Receipt...`;
  
  // Play printing audio
  playPrintSound();
  
  // Start printer jiggle animation
  printerBody.classList.add('printing');
  
  // Blinking orange light showing printing is in progress
  ledStatus.className = 'led led-status blinking-orange';
  
  // Reset receipt container
  receiptContainer.classList.remove('printed');
  receiptContainer.classList.remove('torn');
  receiptContainer.style.maxHeight = '0px';
  receiptContainer.innerHTML = `<div class="receipt-loading-line">Formatting paper...</div>`;
  
  // Render invoice layout
  const billLines = [];
  
  // 1. Organization Header
  billLines.push(centerText(shopNameVal.toUpperCase(), width));
  const wrappedAddress = wrapText(addressVal, width);
  wrappedAddress.forEach(addrLine => billLines.push(centerText(addrLine, width)));
  billLines.push(centerText(`Ph: ${phoneVal}`, width));
  
  if (isGstVal) {
    billLines.push(centerText(`GSTIN: 27AAPCP1024F1Z0`, width));
  }
  
  billLines.push('-'.repeat(width));
  
  // 2. Invoice Meta Info
  const randomInv = Math.floor(Math.random() * 9000) + 1000;
  billLines.push(`Bill No: P-${randomInv}`);
  
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  billLines.push(`Date: ${dateStr} ${timeStr}`);
  billLines.push(`Cust: Walk-in Customer`);
  billLines.push('='.repeat(width));
  
  // 3. Item List Header
  billLines.push(formatTabularRow('Item Name', 'Qty', 'Rate', 'Total', width));
  billLines.push('-'.repeat(width));
  
  // 4. Item List
  let subtotal = 0;
  billedItems.forEach(item => {
    const itemTotal = item.price * item.count;
    subtotal += itemTotal;
    
    // Format tabular columns
    const qtyStr = `${item.count} pc`;
    const rateStr = item.price.toFixed(2);
    const totalStr = itemTotal.toFixed(2);
    
    billLines.push(formatTabularRow(item.name, qtyStr, rateStr, totalStr, width));
  });
  
  billLines.push('-'.repeat(width));
  
  // 5. Totals
  let grandTotal = subtotal;
  let cgst = 0;
  let sgst = 0;
  
  if (isGstVal) {
    // 18% inclusive GST
    const baseAmount = subtotal / 1.18;
    const gstTotal = subtotal - baseAmount;
    cgst = gstTotal / 2;
    sgst = gstTotal / 2;
    
    billLines.push(formatRow('Base Amount:', baseAmount.toFixed(2), width));
    billLines.push(formatRow('CGST (9%):', cgst.toFixed(2), width));
    billLines.push(formatRow('SGST (9%):', sgst.toFixed(2), width));
  } else {
    billLines.push(formatRow('Subtotal:', subtotal.toFixed(2), width));
  }
  
  billLines.push('='.repeat(width));
  billLines.push(formatRow('GRAND TOTAL:', `Rs ${grandTotal.toFixed(2)}`, width));
  billLines.push('='.repeat(width));
  
  billLines.push(`Pay Mode: Cash`);
  billLines.push(`Status:   PAID`);
  billLines.push('-'.repeat(width));
  
  // 6. Bottom Slogan / Footer
  const wrappedSlogan = wrapText(sloganVal, width);
  wrappedSlogan.forEach(slogLine => billLines.push(centerText(slogLine, width)));
  
  billLines.push('');
  billLines.push(centerText('print by Parchiwala', width));
  billLines.push('');
  billLines.push(''); // Feed margin lines
  billLines.push('');
  
  // Compile final print template HTML
  const finalReceiptHTML = `
    <pre style="margin: 0; white-space: pre-wrap; font-family: inherit; font-size: inherit; text-align: left;">${billLines.join('\n')}</pre>
    <div style="text-align: center; font-size: 8px; margin-top: 10px; color: #888; border-top: 1px dotted #ccc; padding-top: 5px;">
      ✂️ CLICK RECEIPT TO TEAR OFF
    </div>
  `;
  
  // Animate process
  setTimeout(() => {
    // Stop printer vibration
    printerBody.classList.remove('printing');
    
    // Set status LED back to solid green (idle)
    ledStatus.className = 'led led-status active-blue';
    
    // Insert text and feed paper
    receiptContainer.innerHTML = finalReceiptHTML;
    receiptContainer.classList.add('printed');
    receiptContainer.style.maxHeight = '900px';
    
    // Reset Print Button
    printButton.disabled = false;
    printButton.innerHTML = `<span class="icon">🔌</span> Print Bill Now`;
  }, 2800); // Wait 2.8s (matching audio time)
}

// 7. Tear paper mechanism
function setupTearMechanism() {
  const receiptContainer = document.getElementById('printed-receipt-container');
  if (!receiptContainer) return;
  
  receiptContainer.addEventListener('click', () => {
    if (!receiptContainer.classList.contains('printed')) return;
    
    // Play short tear noise
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch (e) {}
    
    // Add fly-away animation class
    receiptContainer.classList.add('torn');
    
    setTimeout(() => {
      // Clear contents and reset height
      receiptContainer.classList.remove('printed');
      receiptContainer.classList.remove('torn');
      receiptContainer.style.maxHeight = '0px';
      receiptContainer.innerHTML = '';
      
      const ledStatus = document.getElementById('led-status');
      ledStatus.className = 'led led-status'; // Turn off status light (idle empty)
    }, 600);
  });
}

// 8. Launch Waitlist Signup Handling
function setupWaitlistForm() {
  const form = document.getElementById('waitlist-signup-form');
  const feedback = document.getElementById('waitlist-feedback');
  
  if (!form || !feedback) return;
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('waitlist-email').value;
    const phone = document.getElementById('waitlist-phone').value;
    
    feedback.className = 'form-feedback-message';
    feedback.innerText = 'Registering your shop...';
    
    // Save locally to mimic DB registration
    const signups = JSON.parse(localStorage.getItem('parchiwala_waitlist') || '[]');
    signups.push({ email, phone, timestamp: new Date().toISOString() });
    localStorage.setItem('parchiwala_waitlist', JSON.stringify(signups));
    
    setTimeout(() => {
      feedback.className = 'form-feedback-message form-feedback-success';
      feedback.innerText = `Success! Registered. Free shipping reserved for ${phone}!`;
      form.reset();
    }, 1000);
  });
}

// 9. Mobile Navbar Toggle Setup
function setupNavbarToggle() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu-bar');
  
  if (!toggle || !navMenu) return;
  
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    
    // Simple inline display switch for responsive menu
    if (navMenu.style.display === 'flex') {
      navMenu.style.display = 'none';
    } else {
      navMenu.style.display = 'flex';
      navMenu.style.flexDirection = 'column';
      navMenu.style.position = 'absolute';
      navMenu.style.top = '80px';
      navMenu.style.left = '0';
      navMenu.style.width = '100%';
      navMenu.style.backgroundColor = 'rgba(249, 252, 252, 0.98)';
      navMenu.style.padding = '20px';
      navMenu.style.gap = '16px';
      navMenu.style.boxShadow = '0 10px 15px rgba(0,0,0,0.05)';
    }
  });

  // Close menu if a nav link is clicked (in mobile view)
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        navMenu.style.display = 'none';
        toggle.classList.remove('active');
      }
    });
  });
}

// Global page initialization
window.addEventListener('DOMContentLoaded', () => {
  // Initialize screens showcase frame
  switchScreen('dashboard');
  
  // Initialize simulator items
  initSimulatorItems();
  
  // Set up print sound / printing handler
  const printBtn = document.getElementById('btn-simulate-print');
  if (printBtn) {
    printBtn.addEventListener('click', handleSimulatePrint);
  }
  
  // Set up tear/remove paper interaction
  setupTearMechanism();
  
  // Set up waitlist signup submission
  setupWaitlistForm();
  
  // Set up mobile menu toggle
  setupNavbarToggle();
});
