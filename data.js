/* ============================================================
 * 幻盘模拟炒股实训平台 · 行情数据库
 * 30只代表性A股 + 5年模拟日线数据生成器
 * 数据基于几何布朗运动+趋势+波动聚集，模拟真实走势特征
 * 后续可无缝替换为Tushare-Pro真实行情API
 * ============================================================ */

// ========== 股票基础信息（30只代表性A股） ==========
const STOCK_LIST = [
  { code: "600519", name: "贵州茅台", industry: "白酒", concept: "消费/白马", basePrice: 1680, volatility: 0.018, trend: 0.0003, lot: 100 },
  { code: "000858", name: "五粮液", industry: "白酒", concept: "消费/白马", basePrice: 148, volatility: 0.022, trend: 0.0002, lot: 100 },
  { code: "300750", name: "宁德时代", industry: "新能源", concept: "锂电池/成长", basePrice: 185, volatility: 0.028, trend: 0.0004, lot: 100 },
  { code: "002594", name: "比亚迪", industry: "新能源汽车", concept: "新能源车/成长", basePrice: 245, volatility: 0.026, trend: 0.0003, lot: 100 },
  { code: "601318", name: "中国平安", industry: "保险", concept: "金融/蓝筹", basePrice: 48, volatility: 0.020, trend: 0.0001, lot: 100 },
  { code: "600036", name: "招商银行", industry: "银行", concept: "金融/蓝筹", basePrice: 35, volatility: 0.015, trend: 0.0001, lot: 100 },
  { code: "000333", name: "美的集团", industry: "家电", concept: "消费/白马", basePrice: 62, volatility: 0.018, trend: 0.0002, lot: 100 },
  { code: "600276", name: "恒瑞医药", industry: "医药", concept: "创新药/白马", basePrice: 45, volatility: 0.022, trend: 0.0001, lot: 100 },
  { code: "000651", name: "格力电器", industry: "家电", concept: "消费/蓝筹", basePrice: 38, volatility: 0.018, trend: 0.0001, lot: 100 },
  { code: "601012", name: "隆基绿能", industry: "光伏", concept: "新能源/成长", basePrice: 22, volatility: 0.030, trend: 0.0002, lot: 100 },
  { code: "002475", name: "立讯精密", industry: "电子", concept: "消费电子/成长", basePrice: 32, volatility: 0.024, trend: 0.0002, lot: 100 },
  { code: "600030", name: "中信证券", industry: "证券", concept: "金融/券商", basePrice: 22, volatility: 0.024, trend: 0.0002, lot: 100 },
  { code: "601899", name: "紫金矿业", industry: "有色金属", concept: "资源/周期", basePrice: 15, volatility: 0.024, trend: 0.0003, lot: 100 },
  { code: "000001", name: "平安银行", industry: "银行", concept: "金融/蓝筹", basePrice: 12, volatility: 0.016, trend: 0.0001, lot: 100 },
  { code: "600887", name: "伊利股份", industry: "食品饮料", concept: "消费/白马", basePrice: 28, volatility: 0.017, trend: 0.0001, lot: 100 },
  { code: "002415", name: "海康威视", industry: "电子", concept: "安防/科技", basePrice: 32, volatility: 0.022, trend: 0.0001, lot: 100 },
  { code: "300059", name: "东方财富", industry: "证券", concept: "互联网券商/成长", basePrice: 15, volatility: 0.028, trend: 0.0002, lot: 100 },
  { code: "601888", name: "中国中免", industry: "零售", concept: "免税/消费", basePrice: 78, volatility: 0.026, trend: 0.0001, lot: 100 },
  { code: "000568", name: "泸州老窖", industry: "白酒", concept: "消费/白马", basePrice: 168, volatility: 0.024, trend: 0.0002, lot: 100 },
  { code: "600309", name: "万华化学", industry: "化工", concept: "化工/蓝筹", basePrice: 85, volatility: 0.022, trend: 0.0002, lot: 100 },
  { code: "002714", name: "牧原股份", industry: "农林牧渔", concept: "养猪/周期", basePrice: 42, volatility: 0.028, trend: 0.0001, lot: 100 },
  { code: "601668", name: "中国建筑", industry: "建筑", concept: "基建/蓝筹", basePrice: 5.8, volatility: 0.014, trend: 0.0001, lot: 100 },
  { code: "600585", name: "海螺水泥", industry: "建材", concept: "水泥/蓝筹", basePrice: 24, volatility: 0.018, trend: 0.0001, lot: 100 },
  { code: "002352", name: "顺丰控股", industry: "物流", concept: "快递/成长", basePrice: 42, volatility: 0.022, trend: 0.0001, lot: 100 },
  { code: "300760", name: "迈瑞医疗", industry: "医疗器械", concept: "医疗/白马", basePrice: 285, volatility: 0.020, trend: 0.0002, lot: 100 },
  { code: "688981", name: "中芯国际", industry: "半导体", concept: "芯片/科技", basePrice: 52, volatility: 0.030, trend: 0.0002, lot: 100 },
  { code: "002230", name: "科大讯飞", industry: "计算机", concept: "AI/科技", basePrice: 48, volatility: 0.030, trend: 0.0003, lot: 100 },
  { code: "300015", name: "爱尔眼科", industry: "医疗服务", concept: "眼科/成长", basePrice: 15, volatility: 0.024, trend: 0.0001, lot: 100 },
  { code: "601919", name: "中远海控", industry: "航运", concept: "海运/周期", basePrice: 12, volatility: 0.028, trend: 0.0001, lot: 100 },
  { code: "000725", name: "京东方A", industry: "电子", concept: "面板/科技", basePrice: 4.2, volatility: 0.022, trend: 0.0001, lot: 100 },
];

// ========== 模拟K线数据生成器 ==========
// 使用带种子的伪随机数，保证每次生成数据一致
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// 标准正态分布（Box-Muller）
function normalRandom(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 生成单只股票的5年日线数据（约1215个交易日）
function generateDailyKline(stock, seedOffset = 0) {
  const rng = seededRandom(parseInt(stock.code) + seedOffset);
  const days = 1215; // 约5年交易日
  const klines = [];
  let price = stock.basePrice * (0.7 + rng() * 0.3); // 起始价格在基准价70%-100%之间
  let volCluster = 1; // 波动聚集因子

  // 生成几个趋势阶段（模拟牛熊周期）
  const phases = [
    { start: 0, end: 200, trendMul: 0.5 + rng() },     // 震荡
    { start: 200, end: 400, trendMul: 1.5 + rng() },   // 上涨
    { start: 400, end: 550, trendMul: -1.5 - rng() },  // 下跌
    { start: 550, end: 750, trendMul: 0.8 + rng() },   // 震荡上行
    { start: 750, end: 900, trendMul: 2 + rng() },      // 牛市
    { start: 900, end: 1050, trendMul: -2 - rng() },    // 熊市
    { start: 1050, end: 1215, trendMul: 0.5 + rng() },  // 恢复
  ];

  const startDate = new Date(2020, 0, 2); // 2020-01-02
  let tradingDay = 0;

  for (let d = 0; d < days * 1.5 && tradingDay < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // 跳过周末

    // 确定当前阶段趋势
    let trendMul = 0.5;
    for (const p of phases) {
      if (tradingDay >= p.start && tradingDay < p.end) { trendMul = p.trendMul; break; }
    }

    // 波动聚集（GARCH效应简化）
    volCluster = 0.85 * volCluster + 0.15 * (0.5 + rng());
    const dailyVol = stock.volatility * volCluster * (0.7 + rng() * 0.6);

    // 几何布朗运动 + 趋势
    const drift = stock.trend * trendMul;
    const shock = normalRandom(rng) * dailyVol;
    const ret = drift + shock;

    const open = price;
    let close = price * (1 + ret);
    // 涨跌停限制（A股±10%，创业板/科创板±20%）
    const isGem = stock.code.startsWith("300") || stock.code.startsWith("688");
    const limit = isGem ? 0.20 : 0.10;
    const maxUp = price * (1 + limit);
    const maxDown = price * (1 - limit);
    let limitUp = false, limitDown = false;
    if (close > maxUp) { close = maxUp; limitUp = true; }
    if (close < maxDown) { close = maxDown; limitDown = true; }

    // 日内波动（high/low）
    const intradayRange = Math.abs(shock) * 0.8 + dailyVol * 0.3;
    let high = Math.max(open, close) * (1 + Math.abs(normalRandom(rng)) * intradayRange * 0.5);
    let low = Math.min(open, close) * (1 - Math.abs(normalRandom(rng)) * intradayRange * 0.5);
    high = Math.min(high, maxUp);
    low = Math.max(low, maxDown);
    if (high < Math.max(open, close)) high = Math.max(open, close);
    if (low > Math.min(open, close)) low = Math.min(open, close);

    // 成交量（与波动率正相关，涨跌停放量）
    const baseVolume = 5000000 + rng() * 15000000;
    let volume = baseVolume * (0.5 + Math.abs(ret) / dailyVol * 0.8);
    if (limitUp || limitDown) volume *= 1.8;
    volume = Math.round(volume / 100) * 100;

    const amount = Math.round(volume * (open + close) / 2);

    klines.push({
      date: date.toISOString().slice(0, 10),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      amount,
      limitUp,
      limitDown,
      suspended: false,
    });

    price = close;
    tradingDay++;
  }

  return klines;
}

// ========== 行情数据库（内存缓存） ==========
const MarketDB = {
  stocks: STOCK_LIST,
  klines: {}, // code -> daily kline array
  currentDateIndex: 0, // 当前模拟日期索引
  mode: "realtime", // realtime / backtest
  backtestStartIndex: 0,

  // 初始化所有股票K线数据
  init() {
    for (const stock of STOCK_LIST) {
      this.klines[stock.code] = generateDailyKline(stock);
    }
    // 实时模式从最后一天开始
    this.currentDateIndex = this.klines[STOCK_LIST[0].code].length - 1;
  },

  // 获取股票信息
  getStock(code) {
    return STOCK_LIST.find(s => s.code === code);
  },

  // 搜索股票
  search(keyword) {
    const kw = keyword.toLowerCase();
    return STOCK_LIST.filter(s =>
      s.code.includes(kw) || s.name.toLowerCase().includes(kw) ||
      s.industry.includes(kw) || s.concept.includes(kw)
    );
  },

  // 获取某只股票到当前日期为止的K线（禁止未来函数）
  getKlines(code, count = 120) {
    const all = this.klines[code];
    if (!all) return [];
    const end = this.currentDateIndex + 1;
    const start = Math.max(0, end - count);
    return all.slice(start, end);
  },

  // 获取当前日期
  getCurrentDate() {
    const all = this.klines[STOCK_LIST[0].code];
    return all[this.currentDateIndex]?.date || "2024-12-31";
  },

  // 获取当前价格（最新收盘价）
  getPrice(code) {
    const all = this.klines[code];
    if (!all) return 0;
    return all[this.currentDateIndex]?.close || 0;
  },

  // 获取当前K线
  getCurrentKline(code) {
    const all = this.klines[code];
    if (!all) return null;
    return all[this.currentDateIndex] || null;
  },

  // 推进一步（模拟下一个交易日）
  nextDay() {
    const all = this.klines[STOCK_LIST[0].code];
    if (this.currentDateIndex < all.length - 1) {
      this.currentDateIndex++;
      return true;
    }
    return false;
  },

  // 设置回溯模式起始日期
  setBacktestStart(dateStr) {
    const all = this.klines[STOCK_LIST[0].code];
    const idx = all.findIndex(k => k.date >= dateStr);
    if (idx >= 0) {
      this.backtestStartIndex = idx;
      this.currentDateIndex = idx;
      this.mode = "backtest";
      return true;
    }
    return false;
  },

  // 重置为实时模式
  resetRealtime() {
    const all = this.klines[STOCK_LIST[0].code];
    this.currentDateIndex = all.length - 1;
    this.mode = "realtime";
  },

  // 获取可用的回溯起始日期列表（每月第一个交易日）
  getBacktestDates() {
    const all = this.klines[STOCK_LIST[0].code];
    const dates = [];
    let lastMonth = "";
    for (const k of all) {
      const month = k.date.slice(0, 7);
      if (month !== lastMonth) {
        dates.push({ value: k.date, label: k.date });
        lastMonth = month;
      }
    }
    return dates;
  },

  // 模拟盘口五档（基于当前价格±档位生成）
  getOrderBook(code) {
    const price = this.getPrice(code);
    const kline = this.getCurrentKline(code);
    const isGem = code.startsWith("300") || code.startsWith("688");
    const tickSize = price >= 100 ? 0.01 : 0.01;
    const asks = [], bids = [];
    for (let i = 1; i <= 5; i++) {
      asks.push({ price: Math.round((price + tickSize * i) * 100) / 100, volume: Math.round((1000 + Math.random() * 5000) * i) });
      bids.push({ price: Math.round((price - tickSize * i) * 100) / 100, volume: Math.round((1000 + Math.random() * 5000) * i) });
    }
    return {
      asks: asks.reverse(), // 卖5到卖1
      bids, // 买1到买5
      current: price,
      change: kline ? ((kline.close - kline.open) / kline.open * 100) : 0,
      limitUp: kline?.limitUp || false,
      limitDown: kline?.limitDown || false,
    };
  },
};

// 初始化
MarketDB.init();
