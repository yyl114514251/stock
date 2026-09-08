/* ============================================================
 * 幻盘模拟炒股实训平台 · 主逻辑
 * 页面路由、实时推进、交易下单、持仓管理、复盘报告、历史回溯、排行榜
 * ============================================================ */

let engine = null;
let backtestEngine = null;
let currentStock = "600519";
let currentSide = "buy";
let autoPlayTimer = null;
let autoPlaySpeed = 10000;
let klineChart = null;
let equityChart = null;
let reportEquityChart = null;
let currentPage = "home";

// ========== 初始化 ==========
function init() {
  // 检查风险提示确认
  if (!localStorage.getItem("huanpan_risk_agreed")) {
    $("riskModal").style.display = "flex";
    $("riskAgree").addEventListener("change", (e) => {
      $("btnRiskConfirm").disabled = !e.target.checked;
    });
    $("btnRiskConfirm").addEventListener("click", () => {
      localStorage.setItem("huanpan_risk_agreed", "1");
      $("riskModal").style.display = "none";
      startApp();
    });
  } else {
    startApp();
  }
}

function startApp() {
  engine = new TradingEngine(1000000);
  loadData();
  bindNav();
  bindEvents();
  initCharts();
  initBacktestDates();
  updateAll();
  startAutoAdvance();
  selectStock("600519");
}

function $(id) { return document.getElementById(id); }

// ========== 页面路由 ==========
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  $("page-" + page).classList.add("active");
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add("active");
  if (page === "market") setTimeout(() => { resizeKline(); renderKline(); }, 100);
  if (page === "report") renderReport();
  if (page === "ranking") renderRanking();
  if (page === "positions") renderPositions();
  if (page === "orders") renderOrders();
  if (page === "trades") renderTrades();
  if (page === "home") renderHome();
  window.scrollTo(0, 0);
}

function bindNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => switchPage(item.dataset.page));
  });
}

// ========== 事件绑定 ==========
function bindEvents() {
  // 交易tab
  document.querySelectorAll(".trade-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".trade-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentSide = tab.dataset.side;
      $("btnSubmitOrder").textContent = currentSide === "buy" ? "买入" : "卖出";
      $("btnSubmitOrder").className = "btn btn-submit " + (currentSide === "buy" ? "btn-buy" : "btn-sell");
      updateTradeInfo();
    });
  });

  // K线周期
  document.querySelectorAll(".kp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".kp-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (klineChart) {
        klineChart.visibleCount = parseInt(btn.dataset.count);
        renderKline();
      }
    });
  });

  // 数量快捷按钮
  document.querySelectorAll(".qty-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pct = parseFloat(btn.dataset.pct);
      const price = parseFloat($("orderPrice").value) || MarketDB.getPrice(currentStock);
      if (currentSide === "buy") {
        const maxQty = Math.floor(engine.cash / price / 100) * 100;
        $("orderQty").value = Math.floor(maxQty * pct / 100) * 100;
      } else {
        const pos = engine.positions[currentStock];
        const avail = pos ? pos.availableQty : 0;
        $("orderQty").value = Math.floor(avail * pct / 100) * 100;
      }
      updateTradeInfo();
    });
  });

  // 市价单
  $("orderMarket").addEventListener("change", (e) => {
    $("orderPrice").disabled = e.target.checked;
    if (e.target.checked) $("orderPrice").value = MarketDB.getPrice(currentStock);
  });

  // 价格/数量变化
  $("orderPrice").addEventListener("input", updateTradeInfo);
  $("orderQty").addEventListener("input", updateTradeInfo);

  // 提交订单
  $("btnSubmitOrder").addEventListener("click", submitOrder);

  // 搜索
  $("stockSearch").addEventListener("keypress", (e) => { if (e.key === "Enter") searchStock(); });
  $("stockSearch").addEventListener("input", (e) => {
    if (e.target.value.length >= 1) searchStock();
  });

  // 设置
  $("btnSettings").addEventListener("click", () => {
    $("settingsModal").style.display = "flex";
    $("settingCapital").value = engine.initialCapital;
    $("settingSpeed").value = autoPlaySpeed;
  });

  // 模式切换
  $("modeRealtime").addEventListener("click", () => {
    $("modeRealtime").classList.add("active");
    $("modeBacktest").classList.remove("active");
    $("modeDesc").textContent = "跟随模拟行情实时交易，自动推进一个交易日";
  });
  $("modeBacktest").addEventListener("click", () => switchPage("backtest"));

  // 回溯
  $("btnStartBacktest").addEventListener("click", startBacktest);
  $("btnNextDay").addEventListener("click", () => advanceBacktestDay());
  $("btnAutoPlay").addEventListener("click", toggleAutoBacktest);
  $("btnExitBacktest").addEventListener("click", exitBacktest);

  // 排行榜tab
  document.querySelectorAll(".rank-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".rank-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderRanking(tab.dataset.type);
    });
  });
}

function closeModal(id) { $(id).style.display = "none"; }

// ========== 图表初始化 ==========
function initCharts() {
  klineChart = new KLineChart("klineCanvas", "volumeCanvas");
  equityChart = new SimpleChart("equityCanvas");
  reportEquityChart = new SimpleChart("reportEquityCanvas");
}

function resizeKline() {
  const container = $("klineCanvas").parentElement;
  const w = container.clientWidth - 20;
  klineChart.resize(w, 320);
}

// ========== 股票搜索 ==========
function searchStock() {
  const kw = $("stockSearch").value.trim();
  const results = kw ? MarketDB.search(kw) : MarketDB.stocks.slice(0, 10);
  const html = results.map(s => {
    const price = MarketDB.getPrice(s.code);
    const kline = MarketDB.getCurrentKline(s.code);
    const chg = kline ? ((kline.close - kline.open) / kline.open * 100).toFixed(2) : "0";
    const color = chg >= 0 ? "var(--up-color)" : "var(--down-color)";
    return `<div class="search-item" onclick="selectStock('${s.code}')">
      <span class="si-code">${s.code}</span>
      <span class="si-name">${s.name}</span>
      <span class="si-industry">${s.industry}</span>
      <span class="si-price" style="color:${color}">${price.toFixed(2)}</span>
      <span class="si-chg" style="color:${color}">${chg >= 0 ? "+" : ""}${chg}%</span>
    </div>`;
  }).join("");
  $("searchResults").innerHTML = html;
}

function selectStock(code) {
  currentStock = code;
  const stock = MarketDB.getStock(code);
  const price = MarketDB.getPrice(code);
  const kline = MarketDB.getCurrentKline(code);
  const chg = kline ? ((kline.close - kline.open) / kline.open * 100) : 0;

  $("stockName").textContent = stock.name;
  $("stockCode").textContent = stock.code;
  $("stockIndustry").textContent = stock.industry;
  $("stockConcept").textContent = stock.concept;
  $("stockPrice").textContent = price.toFixed(2);
  $("stockPrice").style.color = chg >= 0 ? "var(--up-color)" : "var(--down-color)";
  $("stockChange").textContent = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
  $("stockChange").style.color = chg >= 0 ? "var(--up-color)" : "var(--down-color)";
  $("stockLimitTag").textContent = kline?.limitUp ? "🔴 涨停" : kline?.limitDown ? "🟢 跌停" : "";
  $("stockLimitTag").className = "limit-tag " + (kline?.limitUp ? "limit-up" : kline?.limitDown ? "limit-down" : "");

  $("orderPrice").value = price.toFixed(2);
  renderKline();
  renderOrderbook();
  updateTradeInfo();
  renderPending();
  $("stockSearch").value = stock.name;
  $("searchResults").innerHTML = "";
}

function renderKline() {
  if (!klineChart) return;
  const klines = MarketDB.getKlines(currentStock, 250);
  klineChart.setData(klines);
}

function renderOrderbook() {
  const ob = MarketDB.getOrderBook(currentStock);
  let html = "";
  for (let i = 4; i >= 0; i--) {
    const a = ob.asks[i];
    html += `<div class="ob-row"><span class="ob-label">卖${5 - i}</span><span class="ob-price" style="color:var(--up-color)">${a.price.toFixed(2)}</span><span class="ob-vol">${(a.volume / 100).toFixed(0)}手</span></div>`;
  }
  html += `<div class="ob-current-row"><span class="ob-cur-price" style="color:${ob.change >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${ob.current.toFixed(2)}</span><span>${ob.change >= 0 ? "+" : ""}${ob.change.toFixed(2)}%</span></div>`;
  for (let i = 0; i < 5; i++) {
    const b = ob.bids[i];
    html += `<div class="ob-row"><span class="ob-label">买${i + 1}</span><span class="ob-price" style="color:var(--down-color)">${b.price.toFixed(2)}</span><span class="ob-vol">${(b.volume / 100).toFixed(0)}手</span></div>`;
  }
  $("orderbook").innerHTML = html;
}

// ========== 交易 ==========
function updateTradeInfo() {
  const price = parseFloat($("orderPrice").value) || 0;
  const qty = parseInt($("orderQty").value) || 0;
  const amount = price * qty;
  const pos = engine.positions[currentStock];
  const avail = pos ? pos.availableQty : 0;
  const canBuy = price > 0 ? Math.floor(engine.cash / price / 100) * 100 : 0;

  $("tfCash").textContent = engine.cash.toFixed(2);
  $("tfCanBuy").textContent = canBuy + "股";
  $("tfCanSell").textContent = avail + "股";
  $("tfAmount").textContent = amount > 0 ? amount.toFixed(2) + "元" : "--";
}

function submitOrder() {
  const price = parseFloat($("orderPrice").value);
  const qty = parseInt($("orderQty").value);
  const isMarket = $("orderMarket").checked;

  if (!qty || qty <= 0) { showTradeMsg("请输入有效数量", "error"); return; }
  if (!isMarket && (!price || price <= 0)) { showTradeMsg("请输入有效价格", "error"); return; }

  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const result = eng.placeOrder({
    code: currentStock,
    side: currentSide,
    price: isMarket ? 0 : price,
    quantity: qty,
    orderType: isMarket ? "market" : "limit",
  });

  if (result.success) {
    showTradeMsg(`${result.msg}：${currentSide === "buy" ? "买入" : "卖出"} ${qty}股 @ ${isMarket ? "市价" : price}`, "success");
    $("orderQty").value = "";
    updateAll();
    renderPending();
  } else {
    showTradeMsg(result.msg, "error");
  }
}

function showTradeMsg(msg, type) {
  const el = $("tradeMsg");
  el.textContent = msg;
  el.className = "tf-msg " + type;
  setTimeout(() => { el.textContent = ""; el.className = "tf-msg"; }, 4000);
}

function cancelOrder(orderId) {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const result = eng.cancelOrder(orderId);
  alert(result.msg);
  updateAll();
  renderPending();
  renderOrders();
}

function renderPending() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const pending = eng.orders.filter(o => o.status === "pending" || o.status === "partial");
  if (pending.length === 0) {
    $("pendingList").innerHTML = '<div class="empty-tip-sm">暂无待成交委托</div>';
    return;
  }
  $("pendingList").innerHTML = pending.map(o => `
    <div class="pending-item">
      <span class="pi-stock">${o.name}</span>
      <span class="pi-side ${o.side}">${o.side === "buy" ? "买" : "卖"}</span>
      <span class="pi-qty">${o.filledQty}/${o.quantity}股</span>
      <span class="pi-price">@${o.price.toFixed(2)}</span>
      <button class="btn btn-danger btn-xs" onclick="cancelOrder(${o.id})">撤单</button>
    </div>
  `).join("");
}

// ========== 自动推进 ==========
function startAutoAdvance() {
  if (autoPlayTimer) clearInterval(autoPlayTimer);
  autoPlayTimer = setInterval(() => {
    if (MarketDB.mode === "realtime") {
      advanceDay();
    }
  }, autoPlaySpeed);
}

function advanceDay() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  // 每日结算
  eng.dailySettlement();
  // 推进行情
  MarketDB.nextDay();
  // 尝试撮合待成交订单
  for (const order of eng.orders) {
    if (order.status === "pending" || order.status === "partial") {
      eng.tryMatch(order);
    }
  }
  updateAll();
  if (currentPage === "market") {
    selectStock(currentStock);
  }
}

// ========== 更新所有页面数据 ==========
function updateAll() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const stats = eng.getStatistics();

  // 顶部
  $("headerTotalAsset").textContent = formatMoney(stats.totalAsset);
  $("headerTotalProfit").textContent = (stats.totalProfit >= 0 ? "+" : "") + formatMoney(stats.totalProfit);
  $("headerTotalProfit").style.color = stats.totalProfit >= 0 ? "var(--up-color)" : "var(--down-color)";
  $("marketStatus").textContent = `${MarketDB.mode === "realtime" ? "实时模拟模式" : "历史回溯模式"} · 当前日期：${MarketDB.getCurrentDate()}`;

  if (currentPage === "home") renderHome();
  if (currentPage === "positions") renderPositions();
  if (currentPage === "orders") renderOrders();
  if (currentPage === "trades") renderTrades();
}

function renderHome() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const stats = eng.getStatistics();

  $("homeTotalAsset").textContent = formatMoney(stats.totalAsset);
  $("homeTotalProfit").textContent = (stats.totalProfit >= 0 ? "+" : "") + formatMoney(stats.totalProfit);
  $("homeTotalProfit").style.color = stats.totalProfit >= 0 ? "var(--up-color)" : "var(--down-color)";
  $("homeTotalReturn").textContent = (stats.totalReturn * 100 >= 0 ? "+" : "") + (stats.totalReturn * 100).toFixed(2) + "%";
  $("homeTotalReturn").style.color = stats.totalReturn >= 0 ? "var(--up-color)" : "var(--down-color)";
  $("homeCash").textContent = formatMoney(stats.cash);
  $("homeFrozen").textContent = formatMoney(stats.frozenCash);
  $("homeMarketValue").textContent = formatMoney(stats.marketValue);
  $("homePosCount").textContent = stats.positionCount + "只";
  $("homeTradeCount").textContent = stats.totalTrades + "次";
  $("homeCommission").textContent = formatMoney(stats.totalCommission);

  // 净值曲线
  renderEquityChart(eng);

  // 热门股票
  const hot = MarketDB.stocks.slice(0, 8);
  $("hotList").innerHTML = hot.map(s => {
    const price = MarketDB.getPrice(s.code);
    const kline = MarketDB.getCurrentKline(s.code);
    const chg = kline ? ((kline.close - kline.open) / kline.open * 100).toFixed(2) : "0";
    return `<div class="hot-item" onclick="switchPage('market');selectStock('${s.code}')">
      <span class="hi-name">${s.name}</span>
      <span class="hi-code">${s.code}</span>
      <span class="hi-price">${price.toFixed(2)}</span>
      <span class="hi-chg" style="color:${chg >= 0 ? 'var(--up-color)' : 'var(--down-color)'}">${chg >= 0 ? "+" : ""}${chg}%</span>
    </div>`;
  }).join("");
}

function renderEquityChart(eng) {
  const canvas = $("equityCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 20;
  const H = 180;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const snaps = eng.dailySnapshots;
  if (snaps.length < 2) {
    ctx.fillStyle = "#6b7280"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("暂无净值数据，开始交易后自动生成", W / 2, H / 2);
    return;
  }

  const padL = 50, padR = 10, padT = 10, padB = 20;
  const minV = Math.min(...snaps.map(s => s.totalAsset), eng.initialCapital);
  const maxV = Math.max(...snaps.map(s => s.totalAsset), eng.initialCapital);
  const range = maxV - minV || 1;

  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7280"; ctx.font = "10px monospace";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (H - padT - padB) * i / 4;
    const v = maxV - range * i / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText((v / 10000).toFixed(0) + "万", 4, y + 3);
  }

  // 初始本金线
  const initY = padT + (maxV - eng.initialCapital) / range * (H - padT - padB);
  ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, initY); ctx.lineTo(W - padR, initY); ctx.stroke();
  ctx.setLineDash([]);

  // 净值曲线
  const xOf = (i) => padL + i / (snaps.length - 1) * (W - padL - padR);
  const yOf = (v) => padT + (maxV - v) / range * (H - padT - padB);
  const isUp = snaps[snaps.length - 1].totalAsset >= eng.initialCapital;
  const color = isUp ? "#ef4444" : "#22c55e";

  // 填充
  const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
  grad.addColorStop(0, isUp ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath(); ctx.moveTo(xOf(0), H - padB);
  for (let i = 0; i < snaps.length; i++) ctx.lineTo(xOf(i), yOf(snaps[i].totalAsset));
  ctx.lineTo(xOf(snaps.length - 1), H - padB); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < snaps.length; i++) {
    const x = xOf(i), y = yOf(snaps[i].totalAsset);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ========== 持仓/委托/成交 ==========
function renderPositions() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const tbody = $("positionsTable").querySelector("tbody");
  const positions = Object.values(eng.positions);
  if (positions.length === 0) {
    tbody.innerHTML = "";
    $("positionsEmpty").style.display = "block";
    return;
  }
  $("positionsEmpty").style.display = "none";
  tbody.innerHTML = positions.map(pos => {
    const price = MarketDB.getPrice(pos.code);
    const mv = price * pos.totalQty;
    const profit = (price - pos.costPrice) * pos.totalQty;
    const profitPct = pos.costPrice > 0 ? (price - pos.costPrice) / pos.costPrice * 100 : 0;
    const color = profit >= 0 ? "var(--up-color)" : "var(--down-color)";
    return `<tr>
      <td>${pos.code}</td><td>${pos.name}</td>
      <td>${pos.totalQty}</td><td>${pos.availableQty}</td>
      <td>${pos.costPrice.toFixed(2)}</td><td>${price.toFixed(2)}</td>
      <td>${formatMoney(mv)}</td>
      <td style="color:${color}">${profit >= 0 ? "+" : ""}${formatMoney(profit)}</td>
      <td style="color:${color}">${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}%</td>
      <td><button class="btn btn-primary btn-xs" onclick="switchPage('market');selectStock('${pos.code}')">交易</button></td>
    </tr>`;
  }).join("");
}

function renderOrders() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const tbody = $("ordersTable").querySelector("tbody");
  if (eng.orders.length === 0) { tbody.innerHTML = ""; $("ordersEmpty").style.display = "block"; return; }
  $("ordersEmpty").style.display = "none";
  const statusMap = { pending: "待撮合", partial: "部分成交", filled: "全部成交", cancelled: "已撤单", rejected: "已拒绝" };
  const statusColor = { pending: "status-pending", partial: "status-partial", filled: "status-filled", cancelled: "status-cancelled", rejected: "status-rejected" };
  tbody.innerHTML = eng.orders.map(o => `<tr>
    <td>#${o.id}</td><td>${o.createTime}</td>
    <td>${o.name}(${o.code})</td>
    <td class="${o.side}">${o.side === "buy" ? "买入" : "卖出"}</td>
    <td>${o.orderType === "market" ? "市价" : "限价"}</td>
    <td>${o.price.toFixed(2)}</td><td>${o.quantity}</td><td>${o.filledQty}</td>
    <td><span class="status-tag ${statusColor[o.status]}">${statusMap[o.status]}</span></td>
    <td>${(o.status === "pending" || o.status === "partial") ? `<button class="btn btn-danger btn-xs" onclick="cancelOrder(${o.id})">撤单</button>` : "--"}</td>
  </tr>`).join("");
}

function renderTrades() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const tbody = $("tradesTable").querySelector("tbody");
  if (eng.trades.length === 0) { tbody.innerHTML = ""; $("tradesEmpty").style.display = "block"; return; }
  $("tradesEmpty").style.display = "none";
  tbody.innerHTML = eng.trades.map(t => `<tr>
    <td>#${t.id}</td><td>${t.time}</td>
    <td>${t.name}(${t.code})</td>
    <td class="${t.side}">${t.side === "buy" ? "买入" : "卖出"}</td>
    <td>${t.price.toFixed(2)}</td><td>${t.quantity}</td>
    <td>${formatMoney(t.amount)}</td>
    <td>${t.commission.toFixed(2)}</td>
    <td>${t.stampTax.toFixed(2)}</td>
    <td>${t.transferFee.toFixed(2)}</td>
  </tr>`).join("");
}

// ========== 复盘报告 ==========
function renderReport() {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const stats = eng.getStatistics();

  const statItems = [
    { label: "总资产", value: formatMoney(stats.totalAsset), color: "" },
    { label: "总盈亏", value: (stats.totalProfit >= 0 ? "+" : "") + formatMoney(stats.totalProfit), color: stats.totalProfit >= 0 ? "up" : "down" },
    { label: "收益率", value: (stats.totalReturn * 100 >= 0 ? "+" : "") + stats.totalReturn * 100 + "%", color: stats.totalReturn >= 0 ? "up" : "down" },
    { label: "最大回撤", value: (stats.maxDrawdown * 100).toFixed(2) + "%", color: "down" },
    { label: "胜率", value: (stats.winRate * 100).toFixed(1) + "%", color: "" },
    { label: "盈亏比", value: stats.profitLossRatio >= 99 ? "∞" : stats.profitLossRatio.toFixed(2), color: "" },
    { label: "交易次数", value: stats.totalTrades + "次", color: "" },
    { label: "累计手续费", value: formatMoney(stats.totalCommission), color: "" },
    { label: "持仓数量", value: stats.positionCount + "只", color: "" },
    { label: "持仓盈亏", value: (stats.positionProfit >= 0 ? "+" : "") + formatMoney(stats.positionProfit), color: stats.positionProfit >= 0 ? "up" : "down" },
    { label: "可用资金", value: formatMoney(stats.cash), color: "" },
    { label: "持仓市值", value: formatMoney(stats.marketValue), color: "" },
  ];
  $("reportStats").innerHTML = statItems.map(s => `
    <div class="stat-item ${s.color}">
      <span class="stat-label">${s.label}</span>
      <span class="stat-value">${s.value}</span>
    </div>
  `).join("");

  // 净值曲线
  renderReportEquity(eng);
  // 回撤
  renderDrawdown(eng);
  // 行业分布
  const industries = Object.entries(stats.industryDistribution).sort((a, b) => b[1] - a[1]);
  const totalMV = industries.reduce((s, [, v]) => s + v, 0) || 1;
  $("industryList").innerHTML = industries.length > 0 ? industries.map(([ind, mv]) => {
    const pct = mv / totalMV * 100;
    return `<div class="industry-item">
      <span class="ind-name">${ind}</span>
      <div class="ind-bar"><div class="ind-fill" style="width:${pct}%"></div></div>
      <span class="ind-pct">${pct.toFixed(1)}%</span>
    </div>`;
  }).join("") : '<div class="empty-tip-sm">暂无持仓</div>';

  // 交易行为分析
  $("behaviorAnalysis").innerHTML = `
    <div class="ba-grid">
      <div class="ba-item"><span class="ba-label">买入次数</span><span class="ba-value">${stats.buyTrades}次</span></div>
      <div class="ba-item"><span class="ba-label">卖出次数</span><span class="ba-value">${stats.sellTrades}次</span></div>
      <div class="ba-item"><span class="ba-label">买入总金额</span><span class="ba-value">${formatMoney(stats.totalBuyAmount)}</span></div>
      <div class="ba-item"><span class="ba-label">卖出总金额</span><span class="ba-value">${formatMoney(stats.totalSellAmount)}</span></div>
      <div class="ba-item"><span class="ba-label">仓位比例</span><span class="ba-value">${stats.totalAsset > 0 ? (stats.marketValue / stats.totalAsset * 100).toFixed(1) : 0}%</span></div>
      <div class="ba-item"><span class="ba-label">现金比例</span><span class="ba-value">${stats.totalAsset > 0 ? (stats.cash / stats.totalAsset * 100).toFixed(1) : 0}%</span></div>
    </div>
    <div class="ba-tips">
      <h4>📋 交易行为建议</h4>
      <ul>
        ${stats.winRate < 0.4 ? "<li>胜率偏低，建议减少交易频率，提高选股质量，避免频繁操作</li>" : ""}
        ${stats.maxDrawdown > 0.2 ? "<li>最大回撤较大，建议控制仓位、设置止损，避免单只股票仓位过重</li>" : ""}
        ${stats.totalTrades > 100 ? "<li>交易过于频繁，手续费侵蚀收益，建议降低换手率</li>" : ""}
        ${stats.positionCount > 8 ? "<li>持仓过于分散，建议聚焦5-8只核心标的，提高研究深度</li>" : ""}
        ${stats.positionCount === 0 && stats.totalTrades === 0 ? "<li>尚未开始交易，去行情页选择股票开始模拟交易吧</li>" : ""}
        ${stats.winRate >= 0.5 && stats.maxDrawdown < 0.15 ? "<li>交易表现稳健，继续保持当前策略，可尝试扩大仓位</li>" : ""}
      </ul>
    </div>
  `;
}

function renderReportEquity(eng) {
  const canvas = $("reportEquityCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 20;
  const H = 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const snaps = eng.dailySnapshots;
  if (snaps.length < 2) { ctx.fillStyle = "#6b7280"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("暂无数据", W / 2, H / 2); return; }
  const padL = 50, padR = 10, padT = 10, padB = 20;
  const minV = Math.min(...snaps.map(s => s.totalAsset));
  const maxV = Math.max(...snaps.map(s => s.totalAsset));
  const range = maxV - minV || 1;
  const xOf = (i) => padL + i / (snaps.length - 1) * (W - padL - padR);
  const yOf = (v) => padT + (maxV - v) / range * (H - padT - padB);
  const isUp = snaps[snaps.length - 1].totalAsset >= eng.initialCapital;
  const color = isUp ? "#ef4444" : "#22c55e";
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < snaps.length; i++) { const x = xOf(i), y = yOf(snaps[i].totalAsset); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}

function renderDrawdown(eng) {
  const canvas = $("drawdownCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 20;
  const H = 150;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const snaps = eng.dailySnapshots;
  if (snaps.length < 2) return;
  const padL = 50, padR = 10, padT = 10, padB = 20;
  let peak = snaps[0].totalAsset;
  const dds = snaps.map(s => { if (s.totalAsset > peak) peak = s.totalAsset; return (peak - s.totalAsset) / peak; });
  const maxDD = Math.max(...dds) || 0.01;
  const xOf = (i) => padL + i / (dds.length - 1) * (W - padL - padR);
  const yOf = (v) => padT + v / maxDD * (H - padT - padB);
  ctx.fillStyle = "rgba(239,68,68,0.3)"; ctx.beginPath(); ctx.moveTo(padL, padT);
  for (let i = 0; i < dds.length; i++) ctx.lineTo(xOf(i), yOf(dds[i]));
  ctx.lineTo(xOf(dds.length - 1), padT); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < dds.length; i++) { const x = xOf(i), y = yOf(dds[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}

// ========== 历史回溯 ==========
function initBacktestDates() {
  const dates = MarketDB.getBacktestDates();
  $("backtestDate").innerHTML = dates.map(d => `<option value="${d.value}">${d.label}</option>`).join("");
}

function startBacktest() {
  const date = $("backtestDate").value;
  const capital = parseInt($("backtestCapital").value);
  MarketDB.setBacktestStart(date);
  backtestEngine = new TradingEngine(capital);
  $("backtestStatus").style.display = "block";
  $("btDate").textContent = MarketDB.getCurrentDate();
  $("btDays").textContent = "0";
  $("btAsset").textContent = formatMoney(backtestEngine.getTotalAsset());
  alert(`已进入历史回溯模式！\n起始日期：${date}\n初始本金：${formatMoney(capital)}\n\n前往「行情交易」页面开始交易，严格禁止未来函数。`);
}

function advanceBacktestDay() {
  if (!backtestEngine) return;
  backtestEngine.dailySettlement();
  MarketDB.nextDay();
  for (const order of backtestEngine.orders) {
    if (order.status === "pending" || order.status === "partial") backtestEngine.tryMatch(order);
  }
  $("btDate").textContent = MarketDB.getCurrentDate();
  $("btDays").textContent = parseInt($("btDays").textContent) + 1;
  $("btAsset").textContent = formatMoney(backtestEngine.getTotalAsset());
  updateAll();
}

let btAutoTimer = null;
function toggleAutoBacktest() {
  if (btAutoTimer) {
    clearInterval(btAutoTimer); btAutoTimer = null;
    $("btnAutoPlay").textContent = "▶ 自动推进";
  } else {
    btAutoTimer = setInterval(advanceBacktestDay, 2000);
    $("btnAutoPlay").textContent = "⏸ 暂停";
  }
}

function exitBacktest() {
  if (btAutoTimer) { clearInterval(btAutoTimer); btAutoTimer = null; }
  if (confirm("确定退出回溯模式？回溯沙盘数据将被清除。")) {
    backtestEngine = null;
    MarketDB.resetRealtime();
    $("backtestStatus").style.display = "none";
    updateAll();
    alert("已退出回溯模式，回到实时模拟账户。");
  }
}

// ========== 排行榜 ==========
function renderRanking(type = "total") {
  const eng = backtestEngine && MarketDB.mode === "backtest" ? backtestEngine : engine;
  const myStats = eng.getStatistics();
  // 生成模拟用户数据
  const bots = [
    { name: "股神巴菲特", capital: 1000000, return: 0.35, win: 0.62, dd: 0.12, trades: 45 },
    { name: "量化小能手", capital: 1000000, return: 0.28, win: 0.58, dd: 0.15, trades: 120 },
    { name: "稳健投资者", capital: 1000000, return: 0.15, win: 0.55, dd: 0.08, trades: 30 },
    { name: "短线交易员", capital: 1000000, return: 0.08, win: 0.48, dd: 0.22, trades: 200 },
    { name: "新手小白", capital: 1000000, return: -0.12, win: 0.42, dd: 0.30, trades: 80 },
    { name: "价值投资者", capital: 1000000, return: 0.22, win: 0.60, dd: 0.10, trades: 25 },
    { name: "技术派高手", capital: 1000000, return: 0.18, win: 0.56, dd: 0.18, trades: 95 },
  ];
  const me = { name: "我（当前账户）", capital: myStats.initialCapital, return: myStats.totalReturn, win: myStats.winRate, dd: myStats.maxDrawdown, trades: myStats.totalTrades, isMe: true };
  let list = [...bots, me];
  if (type === "month") list = list.map((u, i) => ({ ...u, return: u.return * 0.3 * (0.5 + Math.random()) }));
  list.sort((a, b) => b.return - a.return);

  const tbody = $("rankingTable").querySelector("tbody");
  tbody.innerHTML = list.map((u, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
    const color = u.return >= 0 ? "var(--up-color)" : "var(--down-color)";
    return `<tr class="${u.isMe ? "rank-me" : ""}">
      <td class="rank-num">${medal}</td>
      <td>${u.name}${u.isMe ? " 👈" : ""}</td>
      <td>${formatMoney(u.capital * (1 + u.return))}</td>
      <td style="color:${color}">${u.return >= 0 ? "+" : ""}${formatMoney(u.capital * u.return)}</td>
      <td style="color:${color}">${u.return >= 0 ? "+" : ""}${(u.return * 100).toFixed(2)}%</td>
      <td>${(u.win * 100).toFixed(1)}%</td>
      <td>${(u.dd * 100).toFixed(2)}%</td>
      <td>${u.trades}次</td>
    </tr>`;
  }).join("");
}

// ========== 数据持久化 ==========
function saveData() {
  try {
    localStorage.setItem("huanpan_engine", JSON.stringify(engine.serialize()));
    localStorage.setItem("huanpan_dateIndex", MarketDB.currentDateIndex);
    alert("数据已保存！");
  } catch (e) { alert("保存失败：" + e.message); }
}

function loadData() {
  try {
    const data = localStorage.getItem("huanpan_engine");
    if (data) {
      engine.deserialize(JSON.parse(data));
    }
    const idx = localStorage.getItem("huanpan_dateIndex");
    if (idx) MarketDB.currentDateIndex = parseInt(idx);
  } catch (e) { console.warn("加载数据失败", e); }
}

function resetAccount() {
  if (!confirm("确定重置账户？所有持仓、委托、成交和历史记录将被清空，不可恢复！")) return;
  const capital = parseInt($("settingCapital").value);
  autoPlaySpeed = parseInt($("settingSpeed").value);
  engine.reset(capital);
  MarketDB.resetRealtime();
  localStorage.removeItem("huanpan_engine");
  localStorage.removeItem("huanpan_dateIndex");
  startAutoAdvance();
  updateAll();
  closeModal("settingsModal");
  alert("账户已重置！");
}

// ========== 工具函数 ==========
function formatMoney(n) {
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + "亿";
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + "万";
  return n.toFixed(2);
}

// 简易图表类（备用）
class SimpleChart {
  constructor(canvasId) { this.canvas = document.getElementById(canvasId); }
}

// 启动
init();
