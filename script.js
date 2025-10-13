// --- 全域常數與變數 ---
const API_URL = 'https://script.google.com/macros/s/AKfycbzvOth_PMX1Du_R99slATA-rAbgf2Dd6BTFBxo0ecnv3zYE5yNIEtVMY8xshD85XqMCyQ/exec'; // 請確保這是你最新的部署 ID
const LIFF_ID = '2008189875-9yQXaE81'; // 👈 【✅ 重要】請貼上你在 LINE Developers 後台取得的 LIFF ID

let lineUser = {};
const pending = {};
let allCategories = [];

// --- DOM 元素集中管理 ---
const DOMElements = {
    liffApp: document.getElementById('liffApp'), // 【✅ 新增】
    loginView: document.getElementById('loginView'),
    orderView: document.getElementById('orderView'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    lineLoginBtn: document.getElementById('lineLoginBtn'),
    loginStatus: document.getElementById('loginStatus'),
    orderForm: document.getElementById('orderForm'),
    nameInput: document.getElementById('name'),
    phoneInput: document.getElementById('phone'),
    remarksInput: document.getElementById('remarks'),
    categoryContainer: document.getElementById('categoryContainer'),
    itemsContainer: document.getElementById('itemsContainer'),
    confirmModal: document.getElementById('confirmModal'),
    confirmList: document.getElementById('confirmList'),
    summaryContainer: document.getElementById('summaryContainer'),
    toastContainer: document.getElementById('toastContainer'),
};

// --- UI 元件 ---
function showToast(message, type = 'info') {
    console.log(`Toast: [${type}] ${message}`);
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    DOMElements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000); // 包含動畫時間
}

// --- API 請求 ---
function apiFetch(params) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    window[callbackName] = (data) => {
      delete window[callbackName];
      document.head.removeChild(script);
      if (data && data.success) { resolve(data); } 
      else { reject(new Error(data.error || '後端返回一個未知的錯誤')); }
    };
    if (params.payload) { params.payload = JSON.stringify(params.payload); }
    const queryString = new URLSearchParams({ ...params, callback: callbackName }).toString();
    script.src = `${API_URL}?${queryString}`;
    script.onerror = () => {
        delete window[callbackName];
        if(script.parentNode) { document.head.removeChild(script); }
        reject(new Error('網路請求失敗，請檢查 API_URL 或網路連線。'));
    };
    document.head.appendChild(script);
  });
}

// --- 畫面切換 ---
function showView(viewToShow) {
    if(viewToShow === 'order') {
        DOMElements.loginView.style.display = 'none';
        DOMElements.orderView.style.display = 'flex';
        setTimeout(() => { DOMElements.orderView.style.visibility = 'visible'; }, 50);
    } else {
        DOMElements.loginView.style.display = 'flex';
        DOMElements.orderView.style.display = 'none';
    }
    // 【✅ 新增】顯示 App 內容並隱藏載入動畫
    DOMElements.liffApp.style.display = 'block';
    setTimeout(() => { DOMElements.loadingOverlay.classList.add('hidden'); }, 300);
}

// --- 核心功能 ---
async function initializeOrderPage() {
    console.log('Initializing order page for user:', lineUser.displayName);
    DOMElements.nameInput.value = lineUser.customerName || lineUser.displayName;
    try {
        const data = await apiFetch({ action: 'getInitialData' });
        allCategories = data.categories || [];
        renderCategories();
    } catch (err) {
        showToast(`系統初始化失敗：${err.message}`, 'error');
    }
}

function renderCategories() {
    const container = DOMElements.categoryContainer;
    container.innerHTML = '';
    if (allCategories.length === 0) {
        container.innerHTML = '<p class="info-message" style="padding:0;text-align:left;">目前無商品系列</p>';
        return;
    }
    
    const sortedCategories = [...allCategories].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    
    sortedCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'category-btn';
        btn.textContent = cat.name;
        btn.dataset.index = cat.index;
        container.appendChild(btn);
    });
    const firstBtn = container.querySelector('.category-btn');
    if (firstBtn) {
        firstBtn.classList.add('active');
        loadItems(firstBtn.dataset.index);
    }
}

async function loadItems(catIndex) {
    const container = DOMElements.itemsContainer;
    container.innerHTML = '<div class="info-message">品項載入中…</div>';
    try {
        const data = await apiFetch({ action: 'getItemsByCategory', cat: catIndex });
        const items = data.items || [];
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<div class="info-message">此系列下目前沒有品項</div>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        items.forEach(o => {
            const itemElement = createItemElement(o);
            fragment.appendChild(itemElement);
        });
        container.appendChild(fragment);

    } catch (err) {
        container.innerHTML = `<div class="info-message">載入品項失敗: ${err.message}</div>`;
    }
}

function createItemElement(itemData) {
    const div = document.createElement('div');
    div.className = 'item-option';
    const qty = pending[itemData.item]?.qty || 0;

    div.innerHTML = `
        <div class="item-image-container"><img src="${itemData.imageUrl || 'https://via.placeholder.com/300?text=No+Image'}" alt="${itemData.item}" class="item-image" loading="lazy"></div>
        <div class="item-details">
            <div class="item-info">
                <div class="item-label">${itemData.item}${itemData.unit ? ` / ${itemData.unit}` : ''}</div>
                <span class="item-price">NT$ ${itemData.price}</span>
            </div>
            <div class="qty-control">
                <button type="button" class="qty-minus">−</button>
                <input type="number" value="${qty}" readonly>
                <button type="button" class="qty-plus">＋</button>
            </div>
        </div>`;

    const qtyInput = div.querySelector('input');
    const updateQty = (newQty) => {
        newQty = Math.max(0, parseInt(newQty, 10) || 0);
        qtyInput.value = newQty;
        if (newQty > 0) { pending[itemData.item] = { ...itemData, qty: newQty }; } 
        else { delete pending[itemData.item]; }
    };

    div.querySelector('.qty-plus').addEventListener('click', () => updateQty(Number(qtyInput.value) + 1));
    div.querySelector('.qty-minus').addEventListener('click', () => updateQty(Number(qtyInput.value) - 1));
    
    return div;
}

function showConfirmModal() {
    const orders = Object.values(pending);
    const listContainer = DOMElements.confirmList;
    const summaryContainer = DOMElements.summaryContainer;
    listContainer.innerHTML = '';
    summaryContainer.innerHTML = '';

    if (orders.length > 0) {
        let total = 0;
        const fragment = document.createDocumentFragment();
        orders.forEach(o => {
            total += (o.price || 0) * o.qty;
            const itemElement = createConfirmItemElement(o);
            fragment.appendChild(itemElement);
        });
        listContainer.appendChild(fragment);
        summaryContainer.innerHTML = `<div class="summary-row total"><span>訂單總金額</span><span>NT$ ${total}</span></div>`;
    } else {
        listContainer.innerHTML = '<div>您的訂單是空的。</div>';
    }
    DOMElements.confirmModal.classList.add('active');
}

function createConfirmItemElement(orderData) {
    const div = document.createElement('div');
    div.className = 'confirm-item';
    div.innerHTML = `
        <img src="${orderData.imageUrl || 'https://via.placeholder.com/150?text=No+Image'}" alt="${orderData.item}" class="confirm-item__img">
        <div class="confirm-item__info">
            <span class="confirm-item__name">${orderData.item}</span>
            <span class="confirm-item__price">NT$ ${orderData.price}</span>
        </div>
        <span class="confirm-item__qty">x ${orderData.qty}</span>
        <button type="button" class="remove-btn" data-item-name="${orderData.item}">🗑️</button>`;
    return div;
}

async function submitOrder(btn) {
    const btnCancel = DOMElements.confirmModal.querySelector('.btn-cancel');
    btn.disabled = true;
    btnCancel.disabled = true;
    btn.classList.add('btn--loading');
    
    try {
        const payload = {
            name: DOMElements.nameInput.value.trim(),
            phone: DOMElements.phoneInput.value.trim(),
            remarks: DOMElements.remarksInput.value.trim(),
            orders: Object.values(pending),
            lineUserId: lineUser.userId
        };
        console.log('Submitting order with payload:', payload);
        await apiFetch({ action: 'submitOrder', payload: payload });
        
        btn.classList.remove('btn--loading');
        btn.classList.add('btn--success');
        
        setTimeout(() => {
            DOMElements.confirmModal.classList.remove('active');
            DOMElements.orderForm.reset();
            DOMElements.nameInput.value = lineUser.customerName || lineUser.displayName;
            Object.keys(pending).forEach(key => delete pending[key]);
            
            const activeCategoryBtn = DOMElements.categoryContainer.querySelector('.category-btn.active');
            if (activeCategoryBtn) loadItems(activeCategoryBtn.dataset.index);
            else DOMElements.itemsContainer.innerHTML = '<div class="info-message">請選擇商品系列</div>';
            
            setTimeout(() => {
                btn.classList.remove('btn--success');
                btn.disabled = false;
                btnCancel.disabled = false;
            }, 500);
        }, 2000);

    } catch (err) {
        console.error('Order submission failed:', err);
        showToast(`送出失敗：${err.message}`, 'error');
        btn.classList.remove('btn--loading');
        btn.disabled = false;
        btnCancel.disabled = false;
    }
}

// --- 事件處理器 ---
function handleCategoryClick(e) {
    if (e.target.matches('.category-btn')) {
        DOMElements.categoryContainer.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        loadItems(e.target.dataset.index);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    if (!DOMElements.nameInput.value.trim()) {
        showToast('請填寫訂購人/店家名稱！', 'error');
        DOMElements.nameInput.focus();
        return;
    }
    if (Object.keys(pending).length === 0) {
        showToast('請至少選擇一個品項！', 'error');
        return;
    }
    showConfirmModal();
}

function handleModalClick(e) {
    const btnConfirm = e.target.closest('.btn-confirm');
    const btnCancel = e.target.closest('.btn-cancel');
    const btnRemove = e.target.closest('.remove-btn');

    if (btnCancel) {
        DOMElements.confirmModal.classList.remove('active');
    } else if (btnRemove) {
        const itemName = btnRemove.dataset.itemName;
        delete pending[itemName];
        const activeCategory = DOMElements.categoryContainer.querySelector('.category-btn.active')?.dataset.index;
        if (activeCategory) loadItems(activeCategory);
        showConfirmModal();
    } else if (btnConfirm && !btnConfirm.classList.contains('btn--loading')) {
        submitOrder(btnConfirm);
    }
}

// --- 【✅ 全新】LIFF 登入處理 ---

/**
 * 主初始化函式，整個 App 的進入點
 */
async function main() {
  try {
    // 1. 初始化 LIFF，帶上你的 LIFF ID
    await liff.init({ liffId: LIFF_ID });

    // 2. 判斷使用者是否在 LINE App 外部瀏覽
    if (!liff.isInClient()) {
      // 3. 如果在外部，再檢查是否已登入
      if (liff.isLoggedIn()) {
        // 已登入，正常執行
        await proceedToOrderPage();
      } else {
        // 未登入，顯示登入按鈕
        showView('login');
        DOMElements.lineLoginBtn.addEventListener('click', () => {
          // 點擊後，導向 LINE 登入頁，完成後會再回來這個頁面
          liff.login(); 
        });
      }
    } else {
      // 在 LINE App 內部，直接執行
      await proceedToOrderPage();
    }
  } catch (err) {
    console.error('LIFF Initialization failed', err);
    showToast(`與 LINE 連線失敗，請稍後再試。`, 'error');
    DOMElements.loadingOverlay.innerHTML = `<p style="color:red;padding:2rem;">與 LINE 連線失敗，請重新整理頁面。</p>`;
  }
}

/**
 * 處理獲取個人資料並跳轉到訂單頁的邏輯
 */
async function proceedToOrderPage() {
  const profile = await liff.getProfile();
  lineUser = {
    userId: profile.userId,
    displayName: profile.displayName,
    // 預設 customerName 等於 LINE 名稱，讓後續邏輯一致
    customerName: profile.displayName 
  };
  
  // 將使用者資訊存入 sessionStorage，方便重整頁面時快速載入
  sessionStorage.setItem('lineUser', JSON.stringify(lineUser));

  await initializeOrderPage();
  showView('order');
}

// --- 初始化 ---
// 綁定全域事件
DOMElements.categoryContainer.addEventListener('click', handleCategoryClick);
DOMElements.orderForm.addEventListener('submit', handleFormSubmit);
DOMElements.confirmModal.addEventListener('click', handleModalClick);
// 當頁面載入完成後，執行 LIFF 的主函式
document.addEventListener('DOMContentLoaded', main);