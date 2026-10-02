// Indicator catalogue shared by the market page and the lesson charts: what each overlay and pane draws,
// built from the pure functions in ta.mjs. build(bars, closes, levelFormat, elliottCount) → chart layers.
import { fa } from './core.mjs';
import { fmt } from './calc.mjs';
import * as T from './ta.mjs';

export const compact = (v) => {
  const a = Math.abs(v);
  return a >= 1e6 ? `${fmt(v / 1e6, 2)} م` : a >= 1e4 ? `${fmt(v / 1e3, 1)} ه` : fmt(v, a < 10 ? 2 : 0);
};
/** Renko box: the ATR rounded to 1, 2 or 5 × 10ⁿ. */
export const niceBox = (x) => {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x)), f = x / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
};

export const OVERLAYS = [
  ['sma20', 'میانگین ساده ۲۰', (b, c) => [{ kind: 'line', values: T.sma(c, 20), color: '#5aa9e6', label: 'SMA ۲۰' }]],
  ['sma50', 'میانگین ساده ۵۰', (b, c) => [{ kind: 'line', values: T.sma(c, 50), color: '#b388eb', label: 'SMA ۵۰' }]],
  ['sma200', 'میانگین ساده ۲۰۰', (b, c) => [{ kind: 'line', values: T.sma(c, 200), color: '#f29e4c', label: 'SMA ۲۰۰', width: 1.6 }]],
  ['ema21', 'میانگین نمایی ۲۱', (b, c) => [{ kind: 'line', values: T.ema(c, 21), color: '#8fd3c1', label: 'EMA ۲۱', dash: [5, 3] }]],
  ['bb', 'باند بولینگر', (b, c) => {
    const x = T.bollinger(c);
    return [{ kind: 'band', upper: x.upper, lower: x.lower, mid: x.mid, color: 'rgba(90,169,230,0.75)', label: 'بولینگر ۲۰،۲' }];
  }],
  ['ichimoku', 'ابر ایچیموکو', (b) => {
    const k = T.ichimoku(b);
    return [{ kind: 'cloud', a: k.spanA, b: k.spanB, label: 'ابر ایچیموکو' }, { kind: 'line', values: k.tenkan, color: '#5aa9e6', width: 1, label: 'تنکان' }, { kind: 'line', values: k.kijun, color: '#e0605e', width: 1, label: 'کیجون' }];
  }],
  ['supertrend', 'سوپرترند', (b) => {
    const s = T.supertrend(b);
    return [{ kind: 'line', values: s.line.map((v, i) => (s.dir[i] === 1 ? v : NaN)), color: '#3fb27f', width: 1.8, label: 'سوپرترند' }, { kind: 'line', values: s.line.map((v, i) => (s.dir[i] === -1 ? v : NaN)), color: '#e0605e', width: 1.8 }];
  }],
  ['psar', 'سار سهموی', (b) => {
    const p = T.psar(b);
    return [{ kind: 'dots', values: p.sar, colors: p.dir.map((d) => (d === 1 ? '#3fb27f' : '#e0605e')), color: '#d9d2c3', label: 'SAR' }];
  }],
  ['donchian', 'کانال دونچیان', (b) => {
    const d = T.donchian(b);
    return [{ kind: 'band', upper: d.upper, lower: d.lower, color: 'rgba(242,158,76,0.8)', fill: 'rgba(242,158,76,0.05)', label: 'دونچیان ۲۰' }];
  }],
  ['keltner', 'کانال کلتنر', (b) => {
    const k = T.keltner(b);
    return [{ kind: 'band', upper: k.upper, lower: k.lower, mid: k.mid, color: 'rgba(179,136,235,0.8)', fill: 'rgba(179,136,235,0.05)', label: 'کلتنر' }];
  }],
  ['pivots', 'نقاط پیوت', (b, c, f) => {
    const l = b.at(-1), p = T.pivots(l.h, l.l, l.c);
    return [{ kind: 'levels', items: ['R2', 'R1', 'P', 'S1', 'S2'].map((k) => ({ price: p[k], label: `${k} ${f(p[k])}`, color: k[0] === 'R' ? '#e0605e' : k[0] === 'S' ? '#3fb27f' : '#e3b862' })) }];
  }],
  ['fib', 'فیبوناچی', (b, c, f) => {
    const z = T.zigzag(b.slice(-260), T.swingPct(b)).filter((p) => p.confirmed);
    if (z.length < 2) return [];
    const [A, B] = z.slice(-2);
    return [{ kind: 'levels', items: T.fibLevels(A.price, B.price).retrace.map((r) => ({ price: r.price, label: `${fa(fmt(r.r * 100, 1))}٪ ${f(r.price)}`, color: r.r === 0.618 ? '#f29e4c' : 'rgba(227,184,98,0.8)', dash: [2, 4] })) }];
  }],
  ['zigzag', 'زیگزاگ و الیوت', (b, c, f, wave) => {
    const zz = wave?.zz ?? T.zigzag(b, T.swingPct(b));
    const out = [{ kind: 'path', points: zz.map((p) => ({ i: p.i, price: p.price })), color: 'rgba(242,158,76,0.55)', width: 1.2, label: 'زیگزاگ' }];
    if (wave) out.push({ kind: 'path', points: wave.points, color: '#f29e4c', width: 2, label: 'شمارش الیوت' });
    return out;
  }],
];
export const PANES = [
  ['rsi', 'RSI', (b, c) => ({ title: 'RSI ۱۴', range: [0, 100], guides: [30, 50, 70], format: (v) => fmt(v, 0), series: [{ kind: 'line', values: T.rsi(c), color: '#e3b862', label: 'RSI' }] })],
  ['macd', 'MACD', (b, c) => {
    const m = T.macd(c);
    return { title: 'MACD ۱۲،۲۶،۹', format: compact, series: [{ kind: 'hist', values: m.hist, label: 'هیستوگرام' }, { kind: 'line', values: m.line, color: '#5aa9e6', label: 'MACD' }, { kind: 'line', values: m.signal, color: '#f29e4c', label: 'سیگنال' }] };
  }],
  ['stoch', 'استوکاستیک', (b) => {
    const s = T.stochastic(b);
    return { title: 'استوکاستیک ۱۴،۳،۳', range: [0, 100], guides: [20, 80], format: (v) => fmt(v, 0), series: [{ kind: 'line', values: s.k, color: '#5aa9e6', label: '٪K' }, { kind: 'line', values: s.d, color: '#f29e4c', label: '٪D' }] };
  }],
  ['atr', 'ATR', (b) => ({ title: 'ATR ۱۴ (نوسان روزانه)', format: compact, series: [{ kind: 'line', values: T.atr(b), color: '#b388eb', label: 'ATR' }] })],
  ['adx', 'ADX / DMI', (b) => {
    const a = T.adx(b);
    return { title: 'ADX ۱۴ و جهت‌ها', guides: [20, 25], format: (v) => fmt(v, 0), series: [{ kind: 'line', values: a.adx, color: '#e3b862', label: 'ADX', width: 1.6 }, { kind: 'line', values: a.pdi, color: '#3fb27f', label: '+DI' }, { kind: 'line', values: a.mdi, color: '#e0605e', label: '−DI' }] };
  }],
  ['cci', 'CCI', (b) => ({ title: 'CCI ۲۰', guides: [-100, 0, 100], format: (v) => fmt(v, 0), series: [{ kind: 'line', values: T.cci(b), color: '#8fd3c1', label: 'CCI' }] })],
  ['wr', 'ویلیامز ٪R', (b) => ({ title: 'ویلیامز ٪R ۱۴', range: [-100, 0], guides: [-80, -20], format: (v) => fmt(v, 0), series: [{ kind: 'line', values: T.williamsR(b), color: '#ff7eb6', label: '٪R' }] })],
  ['roc', 'مومنتوم (ROC)', (b, c) => ({ title: 'نرخ تغییر ۱۲ روزه ٪', guides: [0], format: (v) => fmt(v, 1), series: [{ kind: 'hist', values: T.roc(c, 12), label: 'ROC' }] })],
];
