/* ============================================================
 * 幻盘模拟炒股实训平台 · K线图组件
 * 纯Canvas高性能绘制：K线 + 成交量 + MA均线 + 十字光标
 * ============================================================ */

class KLineChart {
  constructor(canvasId, volumeCanvasId) {
    this.canvas = document.getElementById(canvasId);
    this.volumeCanvas = document.getElementById(volumeCanvasId);
    this.ctx = this.canvas.getContext("2d");
    this.vctx = this.volumeCanvas.getContext("2d");
    this.klines = [];
    this.visibleCount = 80;
    this.startIndex = 0;
    this.crosshair = { x: -1, y: -1, show: false };
    this.ma5 = [];
    this.ma10 = [];
    this.ma20 = [];
    this.dpr = window.devicePixelRatio || 1;
    this._bindEvents();
  }

  setData(klines) {
    this.klines = klines;
    this._calcMA();
    this.startIndex = Math.max(0, klines.length - this.visibleCount);
    this.render();
  }

  _calcMA() {
    this.ma5 = []; this.ma10 = []; this.ma20 = [];
    for (let i = 0; i < this.klines.length; i++) {
      let sum5 = 0, sum10 = 0, sum20 = 0;
      for (let j = 0; j < 5 && i - j >= 0; j++) sum5 += this.klines[i - j].close;
      for (let j = 0; j < 10 && i - j >= 0; j++) sum10 += this.klines[i - j].close;
      for (let j = 0; j < 20 && i - j >= 0; j++) sum20 += this.klines[i - j].close;
      this.ma5.push(i >= 4 ? sum5 / 5 : null);
      this.ma10.push(i >= 9 ? sum10 / 10 : null);
      this.ma20.push(i >= 19 ? sum20 / 20 : null);
    }
  }

  _bindEvents() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.crosshair.x = (e.clientX - rect.left) * (this.canvas.width / this.dpr) / rect.width;
      this.crosshair.y = (e.clientY - rect.top) * (this.canvas.height / this.dpr) / rect.height;
      this.crosshair.show = true;
      this.render();
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.crosshair.show = false;
      this.render();
    });
  }

  resize(width, height) {
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    this.ctx.scale(this.dpr, this.dpr);
    this.volumeCanvas.width = width * this.dpr;
    this.volumeCanvas.height = 80 * this.dpr;
    this.volumeCanvas.style.width = width + "px";
    this.volumeCanvas.style.height = "80px";
    this.vctx.scale(this.dpr, this.dpr);
    this.width = width;
    this.height = height;
  }

  render() {
    if (!this.klines.length) return;
    const ctx = this.ctx, vctx = this.vctx;
    const W = this.width, H = this.height;
    const padL = 8, padR = 60, padT = 10, padB = 20;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const volH = 60;

    ctx.clearRect(0, 0, W, H);
    vctx.clearRect(0, 0, W, 80);

    // 可见范围
    const end = Math.min(this.startIndex + this.visibleCount, this.klines.length);
    const visible = this.klines.slice(this.startIndex, end);
    const candleW = chartW / visible.length;
    const bodyW = Math.max(1, candleW * 0.7);

    // 价格范围
    let minP = Infinity, maxP = -Infinity, maxV = 0;
    for (let i = this.startIndex; i < end; i++) {
      const k = this.klines[i];
      minP = Math.min(minP, k.low);
      maxP = Math.max(maxP, k.high);
      maxV = Math.max(maxV, k.volume);
      if (this.ma5[i] !== null) { minP = Math.min(minP, this.ma5[i]); maxP = Math.max(maxP, this.ma5[i]); }
      if (this.ma10[i] !== null) { minP = Math.min(minP, this.ma10[i]); maxP = Math.max(maxP, this.ma10[i]); }
      if (this.ma20[i] !== null) { minP = Math.min(minP, this.ma20[i]); maxP = Math.max(maxP, this.ma20[i]); }
    }
    const pRange = maxP - minP || 1;
    const pPad = pRange * 0.05;
    minP -= pPad; maxP += pPad;

    const yOf = (p) => padT + (maxP - p) / (maxP - minP) * chartH;
    const xOf = (i) => padL + (i - this.startIndex) * candleW + candleW / 2;

    // 网格线
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = "#6b7280";
    for (let i = 0; i <= 4; i++) {
      const y = padT + chartH * i / 4;
      const price = maxP - (maxP - minP) * i / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(price.toFixed(2), W - padR + 4, y + 3);
    }

    // K线
    for (let i = this.startIndex; i < end; i++) {
      const k = this.klines[i];
      const x = xOf(i);
      const isUp = k.close >= k.open;
      const color = isUp ? "#ef4444" : "#22c55e"; // A股红涨绿跌
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      // 影线
      ctx.beginPath(); ctx.moveTo(x, yOf(k.high)); ctx.lineTo(x, yOf(k.low)); ctx.stroke();
      // 实体
      const yOpen = yOf(k.open), yClose = yOf(k.close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1, Math.abs(yClose - yOpen));
      if (isUp) {
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      } else {
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      }
      // 涨跌停标记
      if (k.limitUp || k.limitDown) {
        ctx.fillStyle = k.limitUp ? "#ef4444" : "#22c55e";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(k.limitUp ? "涨" : "跌", x - 5, yOf(k.high) - 4);
      }
    }

    // 均线
    const drawMA = (data, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      let started = false;
      for (let i = this.startIndex; i < end; i++) {
        if (data[i] === null) continue;
        const x = xOf(i), y = yOf(data[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawMA(this.ma5, "#fbbf24");
    drawMA(this.ma10, "#818cf8");
    drawMA(this.ma20, "#f97316");

    // MA图例
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#fbbf24"; ctx.fillText("MA5", padL + 4, padT + 12);
    ctx.fillStyle = "#818cf8"; ctx.fillText("MA10", padL + 40, padT + 12);
    ctx.fillStyle = "#f97316"; ctx.fillText("MA20", padL + 80, padT + 12);

    // 成交量
    vctx.strokeStyle = "rgba(255,255,255,0.06)";
    vctx.beginPath(); vctx.moveTo(padL, 0); vctx.lineTo(W - padR, 0); vctx.stroke();
    for (let i = this.startIndex; i < end; i++) {
      const k = this.klines[i];
      const x = xOf(i);
      const isUp = k.close >= k.open;
      vctx.fillStyle = isUp ? "#ef4444" : "#22c55e";
      const h = (k.volume / maxV) * (volH - 10);
      vctx.fillRect(x - bodyW / 2, volH - h, bodyW, h);
    }
    vctx.font = "10px monospace"; vctx.fillStyle = "#6b7280";
    vctx.fillText("成交量", padL + 4, 12);
    if (maxV > 0) vctx.fillText((maxV / 10000).toFixed(0) + "万", W - padR + 4, 12);

    // 十字光标
    if (this.crosshair.show && this.crosshair.x >= padL && this.crosshair.x <= W - padR) {
      const idx = Math.floor((this.crosshair.x - padL) / candleW) + this.startIndex;
      if (idx >= this.startIndex && idx < end) {
        const k = this.klines[idx];
        const x = xOf(idx);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(padL, this.crosshair.y); ctx.lineTo(W - padR, this.crosshair.y); ctx.stroke();
        ctx.setLineDash([]);
        // 价格标签
        const hoverPrice = maxP - (this.crosshair.y - padT) / chartH * (maxP - minP);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(W - padR, this.crosshair.y - 8, padR - 4, 16);
        ctx.fillStyle = "#fff"; ctx.font = "10px monospace";
        ctx.fillText(hoverPrice.toFixed(2), W - padR + 4, this.crosshair.y + 3);
        // 日期标签
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x - 35, H - padB + 2, 70, 14);
        ctx.fillStyle = "#fff"; ctx.fillText(k.date, x - 30, H - padB + 12);
        // K线信息
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(padL + 4, padT + 20, 180, 70);
        ctx.fillStyle = "#e5e7eb"; ctx.font = "11px monospace";
        const chg = ((k.close - k.open) / k.open * 100).toFixed(2);
        ctx.fillText(`开:${k.open.toFixed(2)}  高:${k.high.toFixed(2)}`, padL + 10, padT + 36);
        ctx.fillText(`低:${k.low.toFixed(2)}  收:${k.close.toFixed(2)}`, padL + 10, padT + 52);
        ctx.fillStyle = k.close >= k.open ? "#ef4444" : "#22c55e";
        ctx.fillText(`涨跌:${chg}%  量:${(k.volume/10000).toFixed(0)}万`, padL + 10, padT + 68);
      }
    }
  }
}
