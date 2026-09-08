/* ============================================================
 * 幻盘模拟炒股实训平台 · 虚拟撮合引擎
 * 完整实现A股交易规则：T+1、1手起买、涨跌停、停牌、限价/市价单、撤单
 * 账户管理、持仓管理、委托管理、成交记录、每日结算、统计指标
 * ============================================================ */

const ORDER_STATUS = {
  PENDING: "pending",       // 待撮合
  PARTIAL: "partial",       // 部分成交
  FILLED: "filled",         // 全部成交
  CANCELLED: "cancelled",   // 已撤单
  REJECTED: "rejected",     // 已拒绝
};

const ORDER_SIDE = {
  BUY: "buy",
  SELL: "sell",
};

class TradingEngine {
  constructor(initialCapital = 1000000) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;       // 可用资金
    this.frozenCash = 0;               // 冻结资金（买入委托）
    this.positions = {};               // 持仓 code -> {code, name, totalQty, availableQty, costPrice, todayBuyQty}
    this.orders = [];                  // 委托单
    this.trades = [];                  // 成交记录
    this.dailySnapshots = [];          // 每日资产快照
    this.orderIdCounter = 1;
    this.tradeIdCounter = 1;
    this.commissionRate = 0.00025;    // 佣金万2.5
    this.minCommission = 5;            // 最低佣金5元
    this.stampTaxRate = 0.0005;        // 印花税千0.5（卖出）
    this.transferFeeRate = 0.00001;   // 过户费万0.1
  }

  // ========== 资产计算 ==========
  getTotalAsset() {
    let marketValue = 0;
    for (const code in this.positions) {
      const pos = this.positions[code];
      const price = MarketDB.getPrice(code);
      marketValue += price * pos.totalQty;
    }
    return this.cash + this.frozenCash + marketValue;
  }

  getMarketValue() {
    let mv = 0;
    for (const code in this.positions) {
      mv += MarketDB.getPrice(code) * this.positions[code].totalQty;
    }
    return mv;
  }

  getTotalProfit() {
    return this.getTotalAsset() - this.initialCapital;
  }

  getTotalReturn() {
    return (this.getTotalAsset() - this.initialCapital) / this.initialCapital;
  }

  // ========== 下单 ==========
  placeOrder(params) {
    const { code, side, price, quantity, orderType = "limit" } = params;
    const stock = MarketDB.getStock(code);
    if (!stock) return { success: false, msg: "股票不存在" };

    const kline = MarketDB.getCurrentKline(code);
    if (!kline) return { success: false, msg: "无行情数据" };
    if (kline.suspended) return { success: false, msg: "该股票停牌中，无法交易" };

    const currentPrice = kline.close;
    const isGem = code.startsWith("300") || code.startsWith("688");
    const limitRate = isGem ? 0.20 : 0.10;
    const limitUpPrice = Math.round(kline.open * (1 + limitRate) * 100) / 100;
    const limitDownPrice = Math.round(kline.open * (1 - limitRate) * 100) / 100;

    // 数量校验
    if (quantity <= 0) return { success: false, msg: "数量必须大于0" };
    if (side === ORDER_SIDE.BUY && quantity % 100 !== 0) {
      return { success: false, msg: "买入必须为100股整数倍（1手）" };
    }

    // 价格校验
    let execPrice = price;
    if (orderType === "market") execPrice = currentPrice;

    if (side === ORDER_SIDE.BUY) {
      if (kline.limitUp) return { success: false, msg: "涨停板无法买入" };
      if (execPrice > limitUpPrice + 0.01) return { success: false, msg: `买入价格超过涨停价 ${limitUpPrice}` };
      if (execPrice < limitDownPrice - 0.01) return { success: false, msg: `买入价格低于跌停价 ${limitDownPrice}` };
    } else {
      if (kline.limitDown) return { success: false, msg: "跌停板无法卖出" };
      if (execPrice < limitDownPrice - 0.01) return { success: false, msg: `卖出价格低于跌停价 ${limitDownPrice}` };
      if (execPrice > limitUpPrice + 0.01) return { success: false, msg: `卖出价格超过涨停价 ${limitUpPrice}` };
    }

    // 买入：资金校验
    if (side === ORDER_SIDE.BUY) {
      const orderAmount = execPrice * quantity;
      const commission = this.calcCommission(orderAmount);
      const totalCost = orderAmount + commission;
      if (totalCost > this.cash) return { success: false, msg: `可用资金不足，需要 ${totalCost.toFixed(2)} 元，可用 ${this.cash.toFixed(2)} 元` };
      // 冻结资金
      this.cash -= totalCost;
      this.frozenCash += totalCost;
    } else {
      // 卖出：持仓校验（T+1）
      const pos = this.positions[code];
      if (!pos || pos.availableQty < quantity) {
        return { success: false, msg: `可卖数量不足，可卖 ${pos ? pos.availableQty : 0} 股（T+1制度：当日买入不可卖出）` };
      }
      // 冻结持仓
      pos.availableQty -= quantity;
    }

    // 创建委托单
    const order = {
      id: this.orderIdCounter++,
      code,
      name: stock.name,
      side,
      orderType,
      price: execPrice,
      quantity,
      filledQty: 0,
      status: ORDER_STATUS.PENDING,
      createTime: MarketDB.getCurrentDate() + " " + new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      frozenAmount: side === ORDER_SIDE.BUY ? execPrice * quantity + this.calcCommission(execPrice * quantity) : 0,
    };
    this.orders.unshift(order);

    // 立即尝试撮合
    this.tryMatch(order);

    return { success: true, order, msg: "委托已提交" };
  }

  // ========== 撮合逻辑 ==========
  tryMatch(order) {
    if (order.status !== ORDER_STATUS.PENDING && order.status !== ORDER_STATUS.PARTIAL) return;
    const kline = MarketDB.getCurrentKline(order.code);
    if (!kline || kline.suspended) return;

    const currentPrice = kline.close;
    let canMatch = false;
    let matchPrice = currentPrice;

    if (order.side === ORDER_SIDE.BUY) {
      // 限价买入：当前价 <= 委托价 成交
      // 市价买入：直接成交
      if (order.orderType === "market" || currentPrice <= order.price) {
        canMatch = true;
        matchPrice = order.orderType === "market" ? currentPrice : Math.min(currentPrice, order.price);
      }
    } else {
      // 限价卖出：当前价 >= 委托价 成交
      if (order.orderType === "market" || currentPrice >= order.price) {
        canMatch = true;
        matchPrice = order.orderType === "market" ? currentPrice : Math.max(currentPrice, order.price);
      }
    }

    if (!canMatch) return;

    // 成交（模拟全部成交，简化处理）
    const fillQty = order.quantity - order.filledQty;
    const fillAmount = matchPrice * fillQty;
    const commission = this.calcCommission(fillAmount);
    const stampTax = order.side === ORDER_SIDE.SELL ? fillAmount * this.stampTaxRate : 0;
    const transferFee = fillAmount * this.transferFeeRate;

    // 创建成交记录
    const trade = {
      id: this.tradeIdCounter++,
      orderId: order.id,
      code: order.code,
      name: order.name,
      side: order.side,
      price: matchPrice,
      quantity: fillQty,
      amount: fillAmount,
      commission,
      stampTax,
      transferFee,
      time: MarketDB.getCurrentDate() + " " + new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    };
    this.trades.unshift(trade);

    // 更新委托
    order.filledQty += fillQty;
    order.status = ORDER_STATUS.FILLED;

    // 更新账户
    if (order.side === ORDER_SIDE.BUY) {
      // 释放冻结资金，多退少补
      const actualCost = fillAmount + commission + transferFee;
      const frozen = order.frozenAmount;
      this.frozenCash -= frozen;
      this.cash += (frozen - actualCost); // 退还多余冻结

      // 更新持仓
      if (!this.positions[order.code]) {
        this.positions[order.code] = {
          code: order.code,
          name: order.name,
          totalQty: 0,
          availableQty: 0,
          costPrice: 0,
          todayBuyQty: 0,
          totalCost: 0,
        };
      }
      const pos = this.positions[order.code];
      const newTotalCost = pos.totalCost + fillAmount + commission + transferFee;
      pos.totalQty += fillQty;
      pos.todayBuyQty += fillQty; // T+1冻结
      pos.totalCost = newTotalCost;
      pos.costPrice = newTotalCost / pos.totalQty;
      // availableQty 不变（当日买入不可卖）
    } else {
      // 卖出：资金到账
      const netProceeds = fillAmount - commission - stampTax - transferFee;
      this.cash += netProceeds;

      // 更新持仓
      const pos = this.positions[order.code];
      if (pos) {
        pos.totalQty -= fillQty;
        pos.totalCost -= pos.costPrice * fillQty;
        if (pos.totalQty <= 0) {
          delete this.positions[order.code];
        } else {
          pos.costPrice = pos.totalCost / pos.totalQty;
        }
      }
    }
  }

  // ========== 撤单 ==========
  cancelOrder(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return { success: false, msg: "委托单不存在" };
    if (order.status !== ORDER_STATUS.PENDING && order.status !== ORDER_STATUS.PARTIAL) {
      return { success: false, msg: "当前状态无法撤单" };
    }

    // 释放冻结
    if (order.side === ORDER_SIDE.BUY) {
      const remaining = order.quantity - order.filledQty;
      const remainingAmount = order.price * remaining + this.calcCommission(order.price * remaining);
      this.frozenCash -= remainingAmount;
      this.cash += remainingAmount;
    } else {
      const pos = this.positions[order.code];
      if (pos) pos.availableQty += (order.quantity - order.filledQty);
    }

    order.status = ORDER_STATUS.CANCELLED;
    return { success: true, msg: "撤单成功" };
  }

  // ========== 每日结算（T+1解冻、生成快照） ==========
  dailySettlement() {
    // T+1解冻：今日买入的股票变为可卖
    for (const code in this.positions) {
      const pos = this.positions[code];
      pos.availableQty += pos.todayBuyQty;
      pos.todayBuyQty = 0;
    }

    // 生成资产快照
    const snapshot = {
      date: MarketDB.getCurrentDate(),
      totalAsset: this.getTotalAsset(),
      cash: this.cash,
      frozenCash: this.frozenCash,
      marketValue: this.getMarketValue(),
      totalProfit: this.getTotalProfit(),
      totalReturn: this.getTotalReturn(),
    };
    this.dailySnapshots.push(snapshot);
    return snapshot;
  }

  // ========== 费用计算 ==========
  calcCommission(amount) {
    return Math.max(this.minCommission, amount * this.commissionRate);
  }

  // ========== 统计指标 ==========
  getStatistics() {
    const totalAsset = this.getTotalAsset();
    const totalProfit = totalAsset - this.initialCapital;
    const totalReturn = totalProfit / this.initialCapital;

    // 交易统计
    const buyTrades = this.trades.filter(t => t.side === ORDER_SIDE.BUY);
    const sellTrades = this.trades.filter(t => t.side === ORDER_SIDE.SELL);
    const totalTrades = this.trades.length;
    const totalCommission = this.trades.reduce((s, t) => s + t.commission + t.stampTax + t.transferFee, 0);
    const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
    const totalSellAmount = sellTrades.reduce((s, t) => s + t.amount, 0);

    // 胜率（已平仓交易）
    let winCount = 0, loseCount = 0, totalWin = 0, totalLose = 0;
    // 简化：按股票维度计算已实现盈亏
    const realizedByStock = {};
    for (const t of sellTrades) {
      if (!realizedByStock[t.code]) realizedByStock[t.code] = { buyCost: 0, buyQty: 0, sellAmount: 0, sellQty: 0 };
      realizedByStock[t.code].sellAmount += t.amount;
      realizedByStock[t.code].sellQty += t.quantity;
    }
    for (const t of buyTrades) {
      if (!realizedByStock[t.code]) realizedByStock[t.code] = { buyCost: 0, buyQty: 0, sellAmount: 0, sellQty: 0 };
      realizedByStock[t.code].buyCost += t.amount + t.commission;
      realizedByStock[t.code].buyQty += t.quantity;
    }
    for (const code in realizedByStock) {
      const r = realizedByStock[code];
      if (r.sellQty > 0 && r.buyQty > 0) {
        const avgCost = r.buyCost / r.buyQty;
        const profit = r.sellAmount - avgCost * r.sellQty;
        if (profit > 0) { winCount++; totalWin += profit; }
        else if (profit < 0) { loseCount++; totalLose += Math.abs(profit); }
      }
    }
    const closedTrades = winCount + loseCount;
    const winRate = closedTrades > 0 ? winCount / closedTrades : 0;
    const profitLossRatio = totalLose > 0 ? totalWin / totalLose : (totalWin > 0 ? 99 : 0);

    // 最大回撤
    let maxDrawdown = 0;
    if (this.dailySnapshots.length > 1) {
      let peak = this.dailySnapshots[0].totalAsset;
      for (const snap of this.dailySnapshots) {
        if (snap.totalAsset > peak) peak = snap.totalAsset;
        const dd = (peak - snap.totalAsset) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
    }

    // 持仓盈亏
    let positionProfit = 0, positionCost = 0;
    for (const code in this.positions) {
      const pos = this.positions[code];
      const price = MarketDB.getPrice(code);
      positionProfit += (price - pos.costPrice) * pos.totalQty;
      positionCost += pos.costPrice * pos.totalQty;
    }

    // 行业仓位分布
    const industryDistribution = {};
    for (const code in this.positions) {
      const pos = this.positions[code];
      const stock = MarketDB.getStock(code);
      const mv = MarketDB.getPrice(code) * pos.totalQty;
      if (stock) {
        industryDistribution[stock.industry] = (industryDistribution[stock.industry] || 0) + mv;
      }
    }

    return {
      totalAsset,
      initialCapital: this.initialCapital,
      totalProfit,
      totalReturn,
      maxDrawdown,
      winRate,
      profitLossRatio,
      totalTrades,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      totalCommission,
      totalBuyAmount,
      totalSellAmount,
      positionCount: Object.keys(this.positions).length,
      positionProfit,
      positionCost,
      positionReturn: positionCost > 0 ? positionProfit / positionCost : 0,
      industryDistribution,
      cash: this.cash,
      frozenCash: this.frozenCash,
      marketValue: this.getMarketValue(),
      avgHoldDays: totalTrades > 0 ? Math.round(this.dailySnapshots.length / Math.max(1, totalTrades / 2)) : 0,
    };
  }

  // ========== 序列化/反序列化（localStorage持久化） ==========
  serialize() {
    return {
      initialCapital: this.initialCapital,
      cash: this.cash,
      frozenCash: this.frozenCash,
      positions: this.positions,
      orders: this.orders,
      trades: this.trades,
      dailySnapshots: this.dailySnapshots,
      orderIdCounter: this.orderIdCounter,
      tradeIdCounter: this.tradeIdCounter,
    };
  }

  deserialize(data) {
    this.initialCapital = data.initialCapital;
    this.cash = data.cash;
    this.frozenCash = data.frozenCash;
    this.positions = data.positions || {};
    this.orders = data.orders || [];
    this.trades = data.trades || [];
    this.dailySnapshots = data.dailySnapshots || [];
    this.orderIdCounter = data.orderIdCounter || 1;
    this.tradeIdCounter = data.tradeIdCounter || 1;
  }

  reset(initialCapital = 1000000) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.frozenCash = 0;
    this.positions = {};
    this.orders = [];
    this.trades = [];
    this.dailySnapshots = [];
    this.orderIdCounter = 1;
    this.tradeIdCounter = 1;
  }
}
