'use strict';

// Shared, dependency-free calculator engine for both browser UI and Node tests.
class CalcError extends Error {}

const FUNCS = new Map(Object.entries({
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x) => Math.sign(x) * Math.round(Math.abs(x)),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
}));
const TRIG = new Map(Object.entries({ sin: Math.sin, cos: Math.cos, tan: Math.tan }));
const INVTRIG = new Map(Object.entries({ asin: Math.asin, acos: Math.acos, atan: Math.atan }));
const CONSTS = new Map(Object.entries({ pi: Math.PI, e: Math.E, tau: 2 * Math.PI }));
const MAX_PRECISE_CENTS = 4e13;

function tokenize(src) {
  const s = String(src).replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = s.slice(i);
    let m;
    if ((m = rest.match(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?/)) && (m[0].includes(',') || m[0].split('.').length > 2)) {
      tokens.push({ t: 'num', v: Number(m[0].replace(/\./g, '').replace(',', '.')) });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^\d{1,3}(?:,\d{3})+\.\d+/))) {
      tokens.push({ t: 'num', v: Number(m[0].replace(/,/g, '')) });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?/))) {
      tokens.push({ t: 'num', v: Number(m[0].replace(/[   ]/g, '').replace(',', '.')) });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?/))) {
      tokens.push({ t: 'num', v: Number(m[0].replace(',', '.')) });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^[a-zA-Z]+/))) {
      tokens.push({ t: 'name', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (rest.startsWith('**')) { tokens.push({ t: '^' }); i += 2; continue; }
    if ('+-*/^()!%²³√'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new CalcError(`Ungültiges Zeichen: ${c}`);
  }
  return tokens;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError('Fakultät braucht eine ganze Zahl von 0 bis 170');
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

function parse(tokens, opts) {
  const deg = opts?.angle === 'deg';
  let p = 0;
  const peek = () => tokens[p];
  const take = (type) => {
    if (!tokens[p] || (type && tokens[p].t !== type)) {
      throw new CalcError(type === ')' ? 'Klammer fehlt' : 'Unvollständiger Ausdruck');
    }
    return tokens[p++];
  };
  const finite = (value) => {
    if (!Number.isFinite(value)) throw new CalcError('Ergebnis ist nicht definiert');
    return value;
  };
  const snap = (value) => Math.abs(value) < 1e-15 ? 0 : value;

  function additive() {
    let left = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = take().t;
      const right = term();
      const rv = right.pct ? left.v * right.v : right.v;
      left = { v: op === '+' ? left.v + rv : left.v - rv, pct: false };
    }
    return left;
  }
  function term() {
    let left = unary();
    for (;;) {
      const token = peek();
      if (!token) break;
      if (token.t === '*' || token.t === '/') {
        take();
        const right = unary();
        if (token.t === '/') {
          if (right.v === 0) throw new CalcError('Division durch null');
          left = { v: left.v / right.v, pct: false };
        } else left = { v: left.v * right.v, pct: false };
        continue;
      }
      const prev = tokens[p - 1];
      const implicit = token.t === 'name' || token.t === '(' || token.t === '√' ||
        (token.t === 'num' && prev && [')', '!', '²', '³'].includes(prev.t));
      if (implicit) { const right = unary(); left = { v: left.v * right.v, pct: false }; continue; }
      break;
    }
    return left;
  }
  function unary() {
    const token = peek();
    if (token?.t === '-') { take(); return { v: -unary().v, pct: false }; }
    if (token?.t === '+') { take(); return { v: unary().v, pct: false }; }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek()?.t === '^') {
      take();
      const exponent = unary();
      return { v: finite(Math.pow(base.v, exponent.v)), pct: false };
    }
    return base;
  }
  function postfix() {
    let node = primary();
    for (;;) {
      const token = peek();
      if (token?.t === '!') { take(); node = { v: factorial(node.v), pct: false }; }
      else if (token?.t === '²') { take(); node = { v: node.v * node.v, pct: false }; }
      else if (token?.t === '³') { take(); node = { v: node.v * node.v * node.v, pct: false }; }
      else if (token?.t === '%') { take(); node = { v: node.v / 100, pct: true }; }
      else break;
    }
    return node;
  }
  function primary() {
    const token = peek();
    if (!token) throw new CalcError('Ausdruck ist leer');
    if (token.t === 'num') { take(); return { v: token.v, pct: false }; }
    if (token.t === '(') { take(); const value = additive(); take(')'); return { v: value.v, pct: false }; }
    if (token.t === '√') { take(); const value = postfixNoSqrt(); return { v: finite(Math.sqrt(value.v)), pct: false }; }
    if (token.t === 'name') {
      take();
      const name = token.v;
      if (CONSTS.has(name) && !(peek()?.t === '(' && (FUNCS.has(name) || TRIG.has(name) || INVTRIG.has(name)))) {
        return { v: CONSTS.get(name), pct: false };
      }
      const isFunction = FUNCS.has(name) || TRIG.has(name) || INVTRIG.has(name);
      if (!isFunction) throw new CalcError(`Unbekannte Funktion: ${name}`);
      if (peek()?.t !== '(') throw new CalcError(`${name} braucht Klammern, z. B. ${name}(2)`);
      take('(');
      const arg = additive().v;
      take(')');
      let value;
      if (TRIG.has(name)) value = snap(TRIG.get(name)(deg ? arg * Math.PI / 180 : arg));
      else if (INVTRIG.has(name)) {
        value = INVTRIG.get(name)(arg);
        if (deg) value *= 180 / Math.PI;
      } else value = FUNCS.get(name)(arg);
      return { v: finite(value), pct: false };
    }
    throw new CalcError('Unerwarteter Ausdruck');
  }
  function postfixNoSqrt() { return primary(); }

  if (!tokens.length) throw new CalcError('Ausdruck ist leer');
  const result = additive();
  if (p !== tokens.length) throw new CalcError('Ausdruck konnte nicht vollständig gelesen werden');
  return result.v;
}

function format(value) {
  if (!Number.isFinite(value)) throw new CalcError('Ergebnis ist nicht endlich');
  if (Object.is(value, -0)) value = 0;
  const magnitude = Math.abs(value);
  const roundedTo15Digits = Number(value.toPrecision(15));
  const approximate = Number.isInteger(value) && magnitude > Number.MAX_SAFE_INTEGER ||
    magnitude >= 1e10 || roundedTo15Digits !== value;
  const text = Number.isInteger(value) && Math.abs(value) < 1e21
    ? BigInt(value).toString()
    : magnitude >= MAX_PRECISE_CENTS ? String(roundedTo15Digits)
      : magnitude >= 1e10 ? String(value) : String(roundedTo15Digits);
  return { text, approximate };
}

function calculate(expression, opts) {
  try {
    const value = parse(tokenize(expression), opts || {});
    return { value, ...format(value) };
  } catch (error) {
    if (error instanceof RangeError) throw new CalcError('Ausdruck ist zu tief verschachtelt');
    throw error;
  }
}

const OrbitronCalculatorEngine = { calculate, tokenize, parse, format, CalcError };
if (typeof module !== 'undefined' && module.exports) module.exports = OrbitronCalculatorEngine;
if (typeof window !== 'undefined') window.OrbitronCalculatorEngine = OrbitronCalculatorEngine;
