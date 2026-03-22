'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥','♦']);

const RANK_VALUE = {
    'A':14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
    '8':8,'9':9,'10':10,'J':11,'Q':12,'K':13
};

const HAND_NAMES = [
    'Royal Flush',
    'Straight Flush',
    'Four of a Kind',
    'Full House',
    'Flush',
    'Straight',
    'Three of a Kind',
    'Two Pair',
    'Jacks or Better',
];

const DEFAULT_PAY_TABLE = {
    'Royal Flush':    250,
    'Straight Flush':  50,
    'Four of a Kind':  25,
    'Full House':       9,
    'Flush':            6,
    'Straight':         4,
    'Three of a Kind':  3,
    'Two Pair':         2,
    'Jacks or Better':  1,
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
    deck:        [],
    hand:        [],
    held:        [false,false,false,false,false],
    credits:     100,
    bet:         1,
    creditValue: 0.25,
    payTable:    { ...DEFAULT_PAY_TABLE },
    phase:       'idle',   // idle | dealing | holding | result
    lastWin:     0,
    lastHand:    null,
    // Multi-hand
    multiHand:   true,
    satCards:    [],       // [9][5] — satellite hand cards after draw
    satWins:     [],       // [9]   — payout per satellite hand
    // Statistics
    stats: { handsPlayed: 0, totalWagered: 0, totalReturned: 0, winCounts: {} },
    dollarsPerPoint: 10,
    winSound: 'arcade',
    bigWinSound: 'fanfare',
};

// ─── Audio (Web Audio API — no files needed) ──────────────────────────────────

let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTick() {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch (e) { /* audio not available */ }
}

function playBetClick() {
    try {
        const ctx = getAudioCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(560, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.09);
    } catch (e) { /* audio not available */ }
}

function playDeal() {
    try {
        const ctx = getAudioCtx();
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let s = 0; s < data.length; s++) {
            data[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / data.length, 3);
        }
        const src  = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        src.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        src.start(ctx.currentTime);
    } catch (e) { /* audio not available */ }
}

function playDraw() {
    try {
        const ctx = getAudioCtx();
        // Softer single whoosh per drawn card — caller spaces them out
        const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let s = 0; s < data.length; s++) {
            data[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / data.length, 2.5);
        }
        const src  = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        src.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        src.start(ctx.currentTime);
    } catch (e) { /* audio not available */ }
}

// ── Win sound styles ──────────────────────────────────────────
function playWinSound_classic(isRoyal) {
    const ctx = getAudioCtx();
    const notes = isRoyal ? [523,659,784,1047,1319] : [523,659,784,1047];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
    });
}

function playWinSound_bells(isRoyal) {
    const ctx = getAudioCtx();
    const notes = isRoyal ? [784,1047,1319,1568,2093] : [784,1047,1319,1568];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.18;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.55);
    });
}

function playWinSound_arcade(isRoyal) {
    const ctx = getAudioCtx();
    const steps = isRoyal ? 8 : 5;
    for (let i = 0; i < steps; i++) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(300 + i * 120, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.09);
    }
}

function playWinSound_brass(isRoyal) {
    const ctx = getAudioCtx();
    const notes = isRoyal ? [392,523,659,784,1047] : [392,523,659,784];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        const t = ctx.currentTime + i * 0.14;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.04, t + 0.1);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.24);
    });
}

function playBigWinner() {
    const ctx = getAudioCtx();
    // Rising arpeggio then a held triumphant chord
    const arpNotes = [261, 329, 392, 523, 659, 784, 1047];
    arpNotes.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        const t = ctx.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.14);
    });
    // Triumphant chord at the end
    const chordBase = ctx.currentTime + arpNotes.length * 0.07 + 0.05;
    [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, chordBase);
        gain.gain.setValueAtTime(0.14, chordBase);
        gain.gain.exponentialRampToValueAtTime(0.001, chordBase + 0.9);
        osc.start(chordBase); osc.stop(chordBase + 1.0);
    });
}

const BIG_WINNER_HANDS = new Set(['Four of a Kind', 'Straight Flush', 'Royal Flush']);

function playSound(style, big) {
    if (style === 'none')    return;
    if (style === 'fanfare') { playBigWinner(); return; }
    if (style === 'classic') { playWinSound_classic(big); return; }
    if (style === 'bells')   { playWinSound_bells(big);   return; }
    if (style === 'arcade')  { playWinSound_arcade(big);  return; }
    if (style === 'brass')   { playWinSound_brass(big);   return; }
}

function playWinFanfare(handName) {
    try {
        if (BIG_WINNER_HANDS.has(handName)) {
            playSound(state.bigWinSound, true);
        } else {
            playSound(state.winSound, false);
        }
    } catch (e) { /* audio not available */ }
}

// Preview a specific sound style (called from settings)
playWinFanfare.__preview = function(sound, big) {
    try { playSound(sound, !!big); } catch (e) {}
};

// ─── Credit Count-Up ──────────────────────────────────────────────────────────

let countUpTimer = null;

function animateCountUp(from, to, onDone, step = 1) {
    if (countUpTimer) clearInterval(countUpTimer);
    if (to <= from) { onDone && onDone(); return; }

    const el = document.getElementById('creditsDisplay');
    let current = from;

    // Tick every 80ms for small wins, faster for large wins
    const total = to - from;
    const interval = Math.max(20, Math.min(80, Math.round(4000 / (total / step))));

    countUpTimer = setInterval(() => {
        current = Math.min(current + step, to);
        el.textContent = current;
        document.getElementById('creditsDollar').textContent = '$' + (current * state.creditValue).toFixed(2);

        // Pulse animation
        el.classList.remove('counting');
        void el.offsetWidth; // reflow to restart animation
        el.classList.add('counting');

        playTick();

        if (current >= to) {
            clearInterval(countUpTimer);
            countUpTimer = null;
            onDone && onDone();
        }
    }, interval);
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

function createDeck() {
    const deck = [];
    for (const suit of SUITS)
        for (const rank of RANKS)
            deck.push({ suit, rank });
    return shuffle(deck);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── Hand Evaluation ──────────────────────────────────────────────────────────

function evaluateHand(hand) {
    const ranks = hand.map(c => c.rank);
    const suits = hand.map(c => c.suit);

    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    const isFlush = suits.every(s => s === suits[0]);

    const nums = ranks.map(r => RANK_VALUE[r]).sort((a, b) => a - b);
    const isNormalStraight = counts[0] === 1 && nums[4] - nums[0] === 4;
    const isAceLow = counts[0] === 1 &&
        JSON.stringify(nums) === JSON.stringify([2,3,4,5,14]);
    const isStraight = isNormalStraight || isAceLow;
    const isRoyal = isFlush &&
        JSON.stringify(nums) === JSON.stringify([10,11,12,13,14]);

    if (isRoyal)                            return 'Royal Flush';
    if (isStraight && isFlush)              return 'Straight Flush';
    if (counts[0] === 4)                    return 'Four of a Kind';
    if (counts[0] === 3 && counts[1] === 2) return 'Full House';
    if (isFlush)                            return 'Flush';
    if (isStraight)                         return 'Straight';
    if (counts[0] === 3)                    return 'Three of a Kind';
    if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';
    if (counts[0] === 2) {
        const paired = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
        if (['J','Q','K','A'].includes(paired)) return 'Jacks or Better';
    }
    return null;
}

function calculatePayout(handName, bet) {
    if (!handName) return 0;
    if (handName === 'Royal Flush' && bet === 5) return 4000;
    return state.payTable[handName] * bet;
}

// ─── Card HTML builders ───────────────────────────────────────────────────────

function makeCardEl(card, index) {
    const colorClass = RED_SUITS.has(card.suit) ? 'red' : 'black';
    const el = document.createElement('div');
    el.className = `card ${colorClass}`;
    el.dataset.index = index;
    el.innerHTML = `
      <div class="card-corner top-left">
        <span class="rank">${card.rank}</span>
        <span class="suit">${card.suit}</span>
      </div>
      <div class="card-center">${card.suit}</div>
      <div class="card-corner bot-right">
        <span class="rank">${card.rank}</span>
        <span class="suit">${card.suit}</span>
      </div>`;
    return el;
}

function makeSlotEl(card, index, isBack) {
    const slot = document.createElement('div');
    slot.className = 'card-slot';
    slot.dataset.index = index;

    const label = document.createElement('div');
    label.className = 'held-label';
    label.textContent = 'HELD';
    slot.appendChild(label);

    if (isBack) {
        const back = document.createElement('div');
        back.className = 'card back';
        back.dataset.index = index;
        slot.appendChild(back);
    } else {
        slot.appendChild(makeCardEl(card, index));
    }
    return slot;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderCards() {
    const area = document.getElementById('cardsArea');
    area.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const isBack = state.hand.length === 0;
        area.appendChild(makeSlotEl(isBack ? null : state.hand[i], i, isBack));
    }
    if (state.phase === 'holding') {
        area.querySelectorAll('.card').forEach(c => c.classList.add('holdable'));
    }
}

function renderPayTable() {
    const tbody = document.getElementById('payTableBody');
    const handCounts = {};
    if (state.lastHand) handCounts[state.lastHand] = (handCounts[state.lastHand] || 0) + 1;
    if (state.multiHand) state.satWins.forEach(({ name }) => {
        if (name) handCounts[name] = (handCounts[name] || 0) + 1;
    });
    tbody.innerHTML = HAND_NAMES.map(name => {
        const base = state.payTable[name];
        const count = handCounts[name] || 0;
        const isWinner = count > 0;

        const cells = [1,2,3,4,5].map(b => {
            const pay = (name === 'Royal Flush' && b === 5) ? 4000 : base * b;
            const isCur = b === state.bet;
            const isCol5 = b === 5;
            const cls = [isCur ? 'cur-bet' : '', isCol5 ? 'col5' : ''].filter(Boolean).join(' ');
            return `<td class="${cls}">${pay}</td>`;
        }).join('');

        const countBadge = count > 0 ? `<span class="hand-count">x${count}</span>` : '';
        return `<tr class="${isWinner ? 'winner' : ''}">
            <td class="hand-col">${name}${countBadge}</td>${cells}
        </tr>`;
    }).join('');
}

function renderPayTableSettings() {
    const container = document.getElementById('payTableSettings');
    container.innerHTML = HAND_NAMES.map(name => {
        const id = 'pt_' + name.replace(/\s+/g,'_');
        return `
          <label for="${id}">${name}</label>
          <input type="number" id="${id}" value="${state.payTable[name]}"
                 min="1" data-hand="${name}">`;
    }).join('');

    container.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
            const val = parseInt(inp.value);
            if (val > 0) { state.payTable[inp.dataset.hand] = val; renderPayTable(); updatePresetHighlight(); }
        });
    });
}

function formatCreditBadge(val) {
    if (val < 1)  return Math.round(val * 100) + '¢';
    if (val === Math.floor(val)) return '$' + val;
    return '$' + val.toFixed(2);
}

function formatDollars(amount) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_000_000) {
        return sign + '$' + (abs / 1_000_000).toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3}) + 'M';
    }
    if (abs >= 100_000) {
        return sign + '$' + Math.round(abs).toLocaleString('en-US');
    }
    return sign + '$' + abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function updateDisplay() {
    document.getElementById('betDisplay').textContent     = state.bet;
    document.getElementById('betMultiplier').textContent  = state.multiHand ? 'x10' : '';
    document.getElementById('betPerHand').textContent     = state.bet === 1 ? 'credit per hand' : 'credits per hand';
    document.getElementById('winDisplay').textContent     = state.lastWin;
    document.getElementById('creditsDisplay').textContent = state.credits.toLocaleString('en-US');
    document.getElementById('creditValBadge').textContent = formatCreditBadge(state.creditValue * state.bet);
    document.getElementById('creditsDollar').textContent  = formatDollars(state.credits * state.creditValue);

    // Deal / Draw button
    const dealBtn = document.getElementById('dealBtn');
    if (state.phase === 'holding') {
        dealBtn.textContent = 'DRAW';
        dealBtn.classList.add('draw');
    } else {
        dealBtn.textContent = 'DEAL';
        dealBtn.classList.remove('draw');
    }

    // Bet buttons disabled while holding
    const inHolding = state.phase === 'holding';
    document.getElementById('betOneBtn').disabled = inHolding;
    document.getElementById('maxBetBtn').disabled = inHolding;

    // Win message
    const msg = document.getElementById('winMessage');
    if (state.phase === 'result') {
        if (state.lastWin === 0) {
            msg.textContent = 'NO WINNER';
        } else {
            msg.textContent = '\u00a0';
        }
    } else if (state.phase === 'holding') {
        msg.textContent = 'CLICK CARDS OR BUTTONS TO HOLD';
    } else if (state.phase === 'dealing') {
        msg.textContent = '\u00a0';
    } else {
        msg.textContent = state.credits === 0
            ? 'OUT OF CREDITS  —  ADD CREDITS IN MENU'
            : '\u00a0';
    }
}

function renderStats() {
    const { handsPlayed, totalWagered, totalReturned } = state.stats;
    const wageredDollars  = totalWagered  * state.creditValue;
    const returnedDollars = totalReturned * state.creditValue;
    const rtp = totalWagered > 0 ? (totalReturned / totalWagered * 100) : null;
    // Cost per point: net spend / (total wagered / dollarsPerPoint)
    const points = totalWagered > 0 ? wageredDollars / state.dollarsPerPoint : 0;
    const netSpend = wageredDollars - returnedDollars;
    const costPerPoint = points > 0 ? netSpend / points : null;

    const netDollars = returnedDollars - wageredDollars;

    document.getElementById('statHands').textContent    = handsPlayed.toLocaleString();
    document.getElementById('statWagered').textContent  = formatDollars(wageredDollars);
    document.getElementById('statReturned').textContent = formatDollars(returnedDollars);
    document.getElementById('statNet').textContent      = (netDollars >= 0 ? '+' : '') + formatDollars(netDollars);
    document.getElementById('statNet').style.color      = netDollars >= 0 ? '#4caf50' : '#ff4444';
    document.getElementById('statRtp').textContent      = rtp !== null ? rtp.toFixed(1) + '%' : '—';
    document.getElementById('statPoints').textContent   = points > 0 ? points.toLocaleString('en-US', {minimumFractionDigits:1, maximumFractionDigits:1}) : '—';
    document.getElementById('statCostPt').textContent   = costPerPoint !== null
        ? (costPerPoint < 0 ? '+$' + Math.abs(costPerPoint).toFixed(2) : '$' + costPerPoint.toFixed(2))
        : '—';

    // Wins by type
    const wc = state.stats.winCounts;
    const tbody = document.getElementById('statWinCountsBody');
    tbody.innerHTML = '';
    const ABBR = {
        'Royal Flush':    'Royal Flush',
        'Straight Flush': 'Str. Flush',
        'Four of a Kind': '4 of a Kind',
        'Full House':     'Full House',
        'Flush':          'Flush',
        'Straight':       'Straight',
        'Three of a Kind':'3 of a Kind',
        'Two Pair':       'Two Pair',
        'Jacks or Better':'Jacks or Better',
    };
    HAND_NAMES.forEach(name => {
        const count = wc[name] || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="wc-label">${ABBR[name]}</td><td class="wc-val">${count > 0 ? count.toLocaleString() : '—'}</td>`;
        if (count > 0) tr.classList.add('wc-hit');
        tbody.appendChild(tr);
    });
}

// ─── Satellite Hand Helpers ───────────────────────────────────────────────────

function makeSatCardEl(card) {
    const colorClass = RED_SUITS.has(card.suit) ? 'red' : 'black';
    const el = document.createElement('div');
    el.className = `sat-card ${colorClass}`;
    el.innerHTML = `
      <div class="sat-corner tl">
        <span class="sat-rank">${card.rank}</span>
        <span class="sat-suit">${card.suit}</span>
      </div>
      <div class="sat-center">${card.suit}</div>
      <div class="sat-corner br">
        <span class="sat-rank">${card.rank}</span>
        <span class="sat-suit">${card.suit}</span>
      </div>`;
    return el;
}

// Build/reset the 9-hand grid — all backs
function initSatelliteHands() {
    const section = document.getElementById('satelliteSection');
    if (!state.multiHand) { section.style.display = 'none'; return; }
    section.style.display = 'grid';
    section.innerHTML = '';
    state.satCards = [];
    state.satWins  = [];

    for (let h = 0; h < 9; h++) {
        const handEl = document.createElement('div');
        handEl.className = 'sat-hand';
        handEl.dataset.hand = h;

        const cardsEl = document.createElement('div');
        cardsEl.className = 'sat-cards';
        for (let c = 0; c < 5; c++) {
            const slot = document.createElement('div');
            slot.className = 'sat-slot';
            slot.dataset.pos = c;
            const back = document.createElement('div');
            back.className = 'sat-card back';
            slot.appendChild(back);
            cardsEl.appendChild(slot);
        }

        const winEl = document.createElement('div');
        winEl.className = 'sat-win';
        winEl.textContent = '\u00a0';

        handEl.appendChild(cardsEl);
        handEl.appendChild(winEl);
        section.appendChild(handEl);
    }
}

// Sync satellite hand displays whenever a hold is toggled — only updates the changed column
function updateSatelliteForHold(changedIndex) {
    if (!state.multiHand) return;
    const isHeld = state.held[changedIndex];
    document.querySelectorAll('.sat-hand').forEach(handEl => {
        const slot = handEl.querySelector(`.sat-slot[data-pos="${changedIndex}"]`);
        if (!slot) return;
        slot.innerHTML = '';
        if (isHeld) {
            const cardEl = makeSatCardEl(state.hand[changedIndex]);
            cardEl.style.animationDelay = '0ms';
            slot.appendChild(cardEl);
        } else {
            const back = document.createElement('div');
            back.className = 'sat-card back';
            slot.appendChild(back);
        }
    });
}

// Draw satellite cards and animate; returns total satellite payout
function drawSatelliteHands() {
    state.satCards = [];
    state.satWins  = [];
    let total = 0;

    const heldCards = state.hand.filter((_, c) => state.held[c]);

    for (let h = 0; h < 9; h++) {
        // Remove held cards from the draw deck so duplicates are impossible
        const deck = createDeck().filter(card =>
            !heldCards.some(hc => hc.suit === card.suit && hc.rank === card.rank)
        );
        const hand = state.hand.map((card, c) =>
            state.held[c] ? card : deck.splice(0, 1)[0]
        );
        state.satCards.push(hand);
        const satHandName = evaluateHand(hand);
        const satPay = calculatePayout(satHandName, state.bet);
        state.satWins.push({ name: satHandName, pay: satPay });
        total += satPay;
    }
    return total;
}

// ─── Game Actions ─────────────────────────────────────────────────────────────

function toggleHold(index) {
    if (state.phase !== 'holding') return;
    state.held[index] = !state.held[index];

    const slot = document.querySelectorAll('#cardsArea .card-slot')[index];
    if (slot) slot.classList.toggle('held', state.held[index]);

    updateSatelliteForHold(index);
}

function deal() {
    if (state.phase === 'holding') { draw(); return; }
    const totalBet = state.bet * (state.multiHand ? 10 : 1);
    if (state.credits < totalBet) {
        document.getElementById('winMessage').textContent = 'NOT ENOUGH CREDITS';
        return;
    }

    state.credits  -= totalBet;
    state.stats.handsPlayed += state.multiHand ? 10 : 1;
    state.stats.totalWagered += totalBet;
    state.lastWin   = 0;
    state.lastHand  = null;
    state.held      = [false,false,false,false,false];
    state.deck      = createDeck();
    state.hand      = state.deck.splice(0, 5);
    state.phase     = 'dealing';

    // Show five card backs immediately, then flip one at a time
    const area = document.getElementById('cardsArea');
    area.classList.remove('winner');
    area.innerHTML = '';
    const mainWinEl = document.getElementById('mainWin');
    mainWinEl.textContent = '\u00a0';
    mainWinEl.classList.remove('winner');
    for (let i = 0; i < 5; i++) area.appendChild(makeSlotEl(null, i, true));

    initSatelliteHands();
    renderPayTable();
    updateDisplay();

    // Lock buttons during deal animation
    document.getElementById('dealBtn').disabled  = true;
    document.getElementById('betOneBtn').disabled = true;
    document.getElementById('maxBetBtn').disabled = true;

    const DEAL_INTERVAL = 200;
    const slots = Array.from(area.querySelectorAll('.card-slot'));

    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const newCardEl = makeCardEl(state.hand[i], i);
            newCardEl.style.animationDelay = '0ms';
            slots[i].replaceChild(newCardEl, slots[i].querySelector('.card'));
            playDeal();
        }, i * DEAL_INTERVAL);
    }

    // After last card lands, enable holding
    setTimeout(() => {
        state.phase = 'holding';
        area.querySelectorAll('.card').forEach(c => c.classList.add('holdable'));
        document.getElementById('dealBtn').disabled = false;

        // Check for a winner in the dealt hand
        state.lastHand = evaluateHand(state.hand);

        renderPayTable();   // highlights the row if there's a winner
        updateDisplay();    // sets win message to "CLICK CARDS..."

        // Override message and play fanfare when dealt a winner
        if (state.lastHand) {
            const mw = document.getElementById('mainWin');
            mw.textContent = state.lastHand.toUpperCase();
            mw.classList.add('winner');
            playWinFanfare(state.lastHand);
        }
    }, 5 * DEAL_INTERVAL);
}

function draw() {
    // Clear the deal-time win overlay immediately when draw begins
    const mainWinEl = document.getElementById('mainWin');
    mainWinEl.textContent = '\u00a0';
    mainWinEl.classList.remove('winner');
    document.getElementById('cardsArea').classList.remove('winner');

    const toReplace = [];
    for (let i = 0; i < 5; i++) {
        if (!state.held[i]) toReplace.push(i);
    }

    // Draw main hand cards
    for (const i of toReplace) {
        state.hand[i] = state.deck.splice(0, 1)[0];
    }

    // Calculate satellite hands (before clearing held[] so drawSatelliteHands can read it)
    const satTotalPayout = state.multiHand ? drawSatelliteHands() : 0;

    const handName  = evaluateHand(state.hand);
    const mainPay   = calculatePayout(handName, state.bet);
    const totalPay  = mainPay + satTotalPayout;

    state.lastHand = handName;
    state.lastWin  = totalPay;
    state.phase    = 'result';
    state.held     = [false,false,false,false,false];

    // Tally win counts (main hand + satellite hands)
    const wc = state.stats.winCounts;
    if (handName) wc[handName] = (wc[handName] || 0) + 1;
    if (state.multiHand) {
        state.satWins.forEach(({ name }) => {
            if (name) wc[name] = (wc[name] || 0) + 1;
        });
    }

    // Remove HELD styling from kept cards
    document.querySelectorAll('#cardsArea .card-slot.held').forEach(el => {
        el.classList.remove('held');
    });

    // Disable buttons during animation
    document.getElementById('dealBtn').disabled  = true;
    document.getElementById('betOneBtn').disabled = true;
    document.getElementById('maxBetBtn').disabled = true;

    const slots = Array.from(document.querySelectorAll('#cardsArea .card-slot'));
    const INTERVAL = 220;

    toReplace.forEach((cardIndex, seq) => {
        setTimeout(() => {
            // Main hand card
            const newCardEl = makeCardEl(state.hand[cardIndex], cardIndex);
            newCardEl.style.animationDelay = '0ms';
            slots[cardIndex].replaceChild(newCardEl, slots[cardIndex].querySelector('.card'));
            playDraw();

            // Same column across all 9 satellite hands simultaneously
            if (state.multiHand) {
                document.querySelectorAll('.sat-hand').forEach((handEl, h) => {
                    const satSlot = handEl.querySelector(`.sat-slot[data-pos="${cardIndex}"]`);
                    if (!satSlot) return;
                    satSlot.innerHTML = '';
                    const satCard = makeSatCardEl(state.satCards[h][cardIndex]);
                    satCard.style.animationDelay = '0ms';
                    satSlot.appendChild(satCard);
                });
            }
        }, seq * INTERVAL);
    });

    // After cards land: show results and count up
    const cardsDone = toReplace.length * INTERVAL + 350;
    setTimeout(() => {
        // Show per-hand win labels on satellite hands
        if (state.multiHand) {
            document.querySelectorAll('.sat-hand').forEach((handEl, h) => {
                const winEl = handEl.querySelector('.sat-win');
                const { name, pay } = state.satWins[h];
                if (pay > 0) {
                    winEl.textContent = (name || '') + ' +' + pay;
                    winEl.classList.add('winner');
                    handEl.classList.add('winner');
                } else {
                    winEl.textContent = '\u00a0';
                    winEl.classList.remove('winner');
                    handEl.classList.remove('winner');
                }
            });
        }

        // Highlight main hand area and show win label if it won
        document.getElementById('cardsArea').classList.toggle('winner', mainPay > 0);
        const mainWinEl = document.getElementById('mainWin');
        if (mainPay > 0) {
            mainWinEl.textContent = (handName || '').toUpperCase() + ' +' + mainPay;
            mainWinEl.classList.add('winner');
        } else {
            mainWinEl.textContent = '\u00a0';
            mainWinEl.classList.remove('winner');
        }

        state.stats.totalReturned += totalPay;
        renderPayTable();
        updateDisplay();
        renderStats();

        if (totalPay > 0) {
            const wagered = state.bet * (state.multiHand ? 10 : 1);
            const satHasBigWin = state.multiHand && state.satWins.some(({ name }) => BIG_WINNER_HANDS.has(name));
            const isBigWin = BIG_WINNER_HANDS.has(handName) || satHasBigWin || totalPay > wagered * 4;
            isBigWin ? playSound(state.bigWinSound, true) : playSound(state.winSound, false);
            const creditsBeforeWin = state.credits;
            state.credits += totalPay;

            setTimeout(() => {
                animateCountUp(creditsBeforeWin, state.credits, () => {
                    document.getElementById('creditsDisplay').classList.remove('counting');
                    enableButtons();
                }, state.bet);
            }, 300);
        } else {
            enableButtons();
        }
    }, cardsDone);
}

function enableButtons() {
    document.getElementById('dealBtn').disabled = false;
    document.getElementById('betOneBtn').disabled = false;
    document.getElementById('maxBetBtn').disabled = false;
}

// ─── Auto-Play ────────────────────────────────────────────────────────────────

const AP_SPEEDS = [
    { label: '1/sec',   ms: 1000, batch: 1   },
    { label: '10/sec',  ms: 100,  batch: 1   },
    { label: '100/sec', ms: 10,   batch: 1   },
    { label: 'Max',     ms: 4,    batch: 100 },
];

let apTimer = null;

function getAutoPlayHolds(hand) {
    const vals = hand.map(c => RANK_VALUE[c.rank]);
    const rc = {};
    for (const c of hand) rc[c.rank] = (rc[c.rank] || 0) + 1;
    const HIGH  = new Set(['J','Q','K','A']);
    const ROYAL = new Set(['10','J','Q','K','A']);
    const hold  = (...idxs) => {
        const h = [false,false,false,false,false];
        for (const i of idxs) h[i] = true;
        return h;
    };
    const bySuit = {};
    hand.forEach((c,i) => (bySuit[c.suit] = bySuit[c.suit] || []).push(i));
    const hn = evaluateHand(hand);

    // 1. Four of a Kind / Straight Flush / Royal Flush
    if (['Four of a Kind','Straight Flush','Royal Flush'].includes(hn))
        return [true,true,true,true,true];

    // 2. 4 to a Royal Flush
    for (const idxs of Object.values(bySuit)) {
        const r = idxs.filter(i => ROYAL.has(hand[i].rank));
        if (r.length >= 4) return hold(...r.slice(0,4));
    }

    // 3. Three of a Kind / Straight / Flush / Full House
    if (['Full House','Flush','Straight'].includes(hn))
        return [true,true,true,true,true];
    if (hn === 'Three of a Kind') {
        const r = Object.keys(rc).find(r => rc[r] === 3);
        return hold(...hand.map((c,i) => c.rank === r ? i : -1).filter(i => i >= 0));
    }

    // 4. 4 to a Straight Flush (same suit, span ≤ 4, no duplicate values)
    for (const idxs of Object.values(bySuit)) {
        if (idxs.length < 4) continue;
        for (let a=0;a<idxs.length-3;a++)
        for (let b=a+1;b<idxs.length-2;b++)
        for (let c=b+1;c<idxs.length-1;c++)
        for (let d=c+1;d<idxs.length;d++) {
            const cb=[idxs[a],idxs[b],idxs[c],idxs[d]];
            const v=cb.map(i=>vals[i]).sort((a,b)=>a-b);
            if (v[3]-v[0]<=4 && new Set(v).size===4) return hold(...cb);
        }
    }

    // 5. Two Pair
    if (hn === 'Two Pair') {
        const pr = Object.keys(rc).filter(r => rc[r] === 2);
        return hold(...hand.map((c,i) => pr.includes(c.rank) ? i : -1).filter(i => i >= 0));
    }

    // 6. High Pair (J/Q/K/A)
    const hp = Object.keys(rc).find(r => rc[r] === 2 && HIGH.has(r));
    if (hp) return hold(...hand.map((c,i) => c.rank === hp ? i : -1).filter(i => i >= 0));

    // 7. 3 to a Royal Flush
    for (const idxs of Object.values(bySuit)) {
        const r = idxs.filter(i => ROYAL.has(hand[i].rank));
        if (r.length >= 3) return hold(...r.slice(0,3));
    }

    // 8. 4 to a Flush
    for (const idxs of Object.values(bySuit)) {
        if (idxs.length === 4) return hold(...idxs);
    }

    // 9. Low Pair (2-10)
    const lp = Object.keys(rc).find(r => rc[r] === 2 && !HIGH.has(r));
    if (lp) return hold(...hand.map((c,i) => c.rank === lp ? i : -1).filter(i => i >= 0));

    // 10. 4 to an Outside Straight (4 consecutive, max val < 14 = not A-high)
    for (let a=0;a<2;a++) for (let b=a+1;b<3;b++) for (let c=b+1;c<4;c++) for (let d=c+1;d<5;d++) {
        const cb=[a,b,c,d], v=cb.map(i=>vals[i]).sort((a,b)=>a-b);
        if (v[3]-v[0]===3 && new Set(v).size===4 && v[3]<14) return hold(...cb);
    }

    // 11. 2 Suited High Cards
    for (const idxs of Object.values(bySuit)) {
        const h = idxs.filter(i => HIGH.has(hand[i].rank));
        if (h.length >= 2) return hold(...h.slice(0,2));
    }

    // Pre-compute high-card indices for steps 12-15
    const hiIdxs = hand.map((c,i) => HIGH.has(c.rank) ? i : -1).filter(i => i >= 0);

    // 12. 3 to a Straight Flush (Type 1: 0 gaps always; 1 gap only when combo has a high card)
    // Double-inside draws (span=4, 2 gaps) are never held — EV too low.
    // 1-gap draws without a high card in the combo are deferred to step 15b.
    for (const idxs of Object.values(bySuit)) {
        if (idxs.length < 3) continue;
        for (let a=0;a<idxs.length-2;a++)
        for (let b=a+1;b<idxs.length-1;b++)
        for (let c=b+1;c<idxs.length;c++) {
            const cb=[idxs[a],idxs[b],idxs[c]];
            const v=cb.map(i=>vals[i]).sort((a,b)=>a-b);
            const span = v[2]-v[0];
            if (span > 3) continue;  // skip double-inside (span=4)
            const hasHighInCombo = cb.some(i => HIGH.has(hand[i].rank));
            // 1-gap + no high card in combo: skip here; prefer high cards (steps 13/15)
            if (span === 3 && !hasHighInCombo) continue;
            return hold(...cb);
        }
    }

    // 13. Unsuited High Cards (hold up to 3; prefer J/Q/K over Ace when 3+ available)
    if (hiIdxs.length >= 2) {
        if (hiIdxs.length <= 3) return hold(...hiIdxs);
        // 4 high cards: drop the Ace (hold 3 lowest = J/Q/K)
        const s = [...hiIdxs].sort((a,b) => vals[a]-vals[b]);
        return hold(...s.slice(0,3));
    }

    // 14. Suited 10/J, 10/Q, or 10/K
    for (const idxs of Object.values(bySuit)) {
        const ten  = idxs.find(i => hand[i].rank === '10');
        if (ten !== undefined) {
            const face = idxs.find(i => ['J','Q','K'].includes(hand[i].rank));
            if (face !== undefined) return hold(ten, face);
        }
    }

    // 15. One High Card (hold the highest)
    if (hiIdxs.length > 0)
        return hold(hiIdxs.reduce((a,b) => vals[a] > vals[b] ? a : b));

    // 15b. Weak 3 to a Straight Flush (1 gap, no high card — last resort before discarding)
    for (const idxs of Object.values(bySuit)) {
        if (idxs.length < 3) continue;
        for (let a=0;a<idxs.length-2;a++)
        for (let b=a+1;b<idxs.length-1;b++)
        for (let c=b+1;c<idxs.length;c++) {
            const cb=[idxs[a],idxs[b],idxs[c]];
            const v=cb.map(i=>vals[i]).sort((a,b)=>a-b);
            if (v[2]-v[0] === 3) return hold(...cb);
        }
    }

    // 16. Discard everything
    return [false,false,false,false,false];
}

function runAutoPlayHand() {
    const bet      = state.bet;
    const isMulti  = state.multiHand;
    const totalBet = bet * (isMulti ? 10 : 1);

    state.credits -= totalBet;
    state.stats.handsPlayed  += isMulti ? 10 : 1;
    state.stats.totalWagered += totalBet;

    const deck  = createDeck();
    const hand  = deck.splice(0, 5);
    const holds = getAutoPlayHolds(hand);

    for (let i = 0; i < 5; i++) {
        if (!holds[i]) hand[i] = deck.splice(0, 1)[0];
    }

    const handName = evaluateHand(hand);
    const mainPay  = calculatePayout(handName, bet);
    let   totalPay = mainPay;

    if (handName) state.stats.winCounts[handName] = (state.stats.winCounts[handName] || 0) + 1;

    if (isMulti) {
        const heldCards = hand.filter((_,i) => holds[i]);
        for (let h = 0; h < 9; h++) {
            const sd = createDeck().filter(card =>
                !heldCards.some(hc => hc.suit === card.suit && hc.rank === card.rank));
            const sh = hand.map((card,i) => holds[i] ? card : sd.splice(0,1)[0]);
            const sn = evaluateHand(sh);
            const sp = calculatePayout(sn, bet);
            totalPay += sp;
            if (sn) state.stats.winCounts[sn] = (state.stats.winCounts[sn] || 0) + 1;
        }
    }

    state.credits            += totalPay;
    state.stats.totalReturned += totalPay;
    state.lastWin  = totalPay;
    state.lastHand = handName;

    return { hand, holds, handName, totalPay };
}

function apUpdateDisplay(result) {
    const { handsPlayed, totalWagered, totalReturned } = state.stats;
    const cv  = state.creditValue;
    const rtp = totalWagered > 0 ? (totalReturned / totalWagered * 100).toFixed(1) + '%' : '—';
    const bal = state.credits * cv;

    document.getElementById('apHands').textContent    = handsPlayed.toLocaleString();
    document.getElementById('apWagered').textContent  = formatDollars(totalWagered * cv);
    document.getElementById('apReturned').textContent = formatDollars(totalReturned * cv);
    document.getElementById('apRtp').textContent      = rtp;

    const balEl = document.getElementById('apBalance');
    balEl.textContent = formatDollars(bal);
    balEl.style.color = bal >= 0 ? '#ffd700' : '#ff4444';

    if (result) {
        const redSuits = new Set(['♥','♦']);
        document.getElementById('apLastHand').innerHTML =
            result.hand.map(c => {
                const color = redSuits.has(c.suit) ? '#ff6666' : '#fff';
                return `<span style="color:${color}">${c.rank}${c.suit}</span>`;
            }).join('  ');
        document.getElementById('apLastHolds').textContent =
            result.holds.map((h,i) => h ? (i+1) : '·').join('   ');
        document.getElementById('apLastResult').textContent = result.handName || 'No win';
        document.getElementById('apLastPay').textContent    =
            result.totalPay > 0 ? '+' + result.totalPay : '';
    }
}

function apSchedule() {
    if (apTimer) { clearInterval(apTimer); apTimer = null; }
    const sp = AP_SPEEDS[parseInt(document.getElementById('apSpeedSelect').value) || 0];
    apTimer = setInterval(() => {
        let result;
        for (let i = 0; i < sp.batch; i++) result = runAutoPlayHand();
        apUpdateDisplay(result);
        updateDisplay();
    }, sp.ms);
}

function apSetupGetVal(groupId) {
    const active = document.querySelector(`#${groupId} .setup-opt-btn.active`);
    return active ? active.dataset.val : null;
}

function apOpenSetup() {
    if (state.phase === 'holding') return;

    // Pre-select bet to match current state
    document.querySelectorAll('#setupBet .setup-opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === String(state.bet));
    });

    // Pre-select speed to match current apSpeedSelect
    const curSpeed = document.getElementById('apSpeedSelect').value;
    document.querySelectorAll('#setupSpeed .setup-opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === curSpeed);
    });

    // Pre-select pay table preset if one matches
    const fh = state.payTable['Full House'], fl = state.payTable['Flush'];
    const matchPreset = fh === 9 && fl === 6 ? '96' : fh === 8 && fl === 5 ? '85' : fh === 7 && fl === 5 ? '75' : 'current';
    document.querySelectorAll('#setupPayTable .setup-opt-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === matchPreset);
    });

    document.getElementById('apSetupModal').classList.add('active');
}

function apLaunch() {
    const reset    = apSetupGetVal('setupReset');
    const payPreset = apSetupGetVal('setupPayTable');
    const betVal   = apSetupGetVal('setupBet');
    const speedVal = apSetupGetVal('setupSpeed');

    document.getElementById('apSetupModal').classList.remove('active');

    // Apply reset
    if (reset === 'yes') {
        state.credits = 100;
        state.stats = { handsPlayed: 0, totalWagered: 0, totalReturned: 0, winCounts: {} };
    }

    // Apply pay table
    if (payPreset === '96') state.payTable = { ...DEFAULT_PAY_TABLE };
    else if (payPreset === '85') state.payTable = { ...DEFAULT_PAY_TABLE, 'Full House': 8, 'Flush': 5 };
    else if (payPreset === '75') state.payTable = { ...DEFAULT_PAY_TABLE, 'Full House': 7, 'Flush': 5 };
    updatePresetHighlight();

    // Apply bet
    if (betVal) state.bet = parseInt(betVal);

    // Apply speed
    if (speedVal) document.getElementById('apSpeedSelect').value = speedVal;

    // Launch
    state.phase = 'autoplay';
    document.getElementById('autoPlayModal').classList.add('active');
    document.getElementById('autoPlayBtn').disabled = true;
    document.getElementById('dealBtn').disabled = true;
    renderPayTable();
    updateDisplay();
    apUpdateDisplay(null);
    apSchedule();
}

function apStop() {
    if (apTimer) { clearInterval(apTimer); apTimer = null; }
    state.phase = 'idle';
    document.getElementById('autoPlayModal').classList.remove('active');
    document.getElementById('autoPlayBtn').disabled = false;
    document.getElementById('dealBtn').disabled = false;
    renderStats();
    renderPayTable();
    updateDisplay();
}

function betOne() {
    if (state.phase === 'holding') return;
    state.bet = state.bet >= 5 ? 1 : state.bet + 1;
    playBetClick();
    renderPayTable();
    updateDisplay();
}

function betMax() {
    if (state.phase === 'holding') return;
    state.bet = 5;
    playBetClick();
    renderPayTable();
    updateDisplay();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function openSettings() {
    renderPayTableSettings();
    document.getElementById('winSoundSelect').value = state.winSound;
    document.getElementById('bigWinSoundSelect').value = state.bigWinSound;
    document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function setCreditValue(val) {
    state.creditValue = val;
    document.querySelectorAll('.cv-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.value) === val);
    });
    updateDisplay();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

const PRESETS = {
    '96': { 'Full House': 9, 'Flush': 6 },
    '85': { 'Full House': 8, 'Flush': 5 },
    '75': { 'Full House': 7, 'Flush': 5 },
};

function updatePresetHighlight() {
    const fh = state.payTable['Full House'];
    const fl = state.payTable['Flush'];
    const active = fh === 9 && fl === 6 ? '96' : fh === 8 && fl === 5 ? '85' : fh === 7 && fl === 5 ? '75' : null;
    document.getElementById('preset96Btn').classList.toggle('active', active === '96');
    document.getElementById('preset85Btn').classList.toggle('active', active === '85');
    document.getElementById('preset75Btn').classList.toggle('active', active === '75');
}

function init() {
    renderCards();
    renderPayTable();
    updateDisplay();
    renderStats();
    updatePresetHighlight();
    initSatelliteHands(); // show initial layout matching current mode

    // Card click — event delegation on cards-area
    document.getElementById('cardsArea').addEventListener('click', e => {
        const card = e.target.closest('.card');
        if (!card || !card.classList.contains('holdable')) return;
        toggleHold(parseInt(card.dataset.index));
    });

    // Action buttons
    document.getElementById('dealBtn').addEventListener('click', deal);
    document.getElementById('betOneBtn').addEventListener('click', betOne);
    document.getElementById('maxBetBtn').addEventListener('click', betMax);
    document.getElementById('menuBtn').addEventListener('click', openSettings);
    document.getElementById('autoPlayBtn').addEventListener('click', apOpenSetup);

    // Auto-play setup modal
    document.getElementById('apSetupCancelBtn').addEventListener('click', () => {
        document.getElementById('apSetupModal').classList.remove('active');
    });
    document.getElementById('apSetupStartBtn').addEventListener('click', apLaunch);
    document.querySelectorAll('.setup-options').forEach(group => {
        group.addEventListener('click', e => {
            const btn = e.target.closest('.setup-opt-btn');
            if (!btn) return;
            group.querySelectorAll('.setup-opt-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Auto-play run modal
    document.getElementById('stopAutoPlayBtn').addEventListener('click', apStop);
    document.getElementById('closeAutoPlay').addEventListener('click', apStop);
    document.getElementById('apSpeedSelect').addEventListener('change', () => {
        if (apTimer) apSchedule();
    });

    // Settings modal
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('settingsModal').addEventListener('click', e => {
        if (e.target === document.getElementById('settingsModal')) closeSettings();
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        const btn = document.getElementById('saveSettingsBtn');
        btn.textContent = '\u2713 Saved!';
        btn.classList.add('saved');
        setTimeout(() => {
            btn.textContent = '\u2713 Save \u0026 Return to Game';
            btn.classList.remove('saved');
            closeSettings();
        }, 700);
    });

    // Game mode toggle (1-hand / 10-hand)
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const hands = parseInt(btn.dataset.hands);
            state.multiHand = hands === 10;
            document.querySelectorAll('.mode-btn').forEach(b =>
                b.classList.toggle('active', b === btn));
            initSatelliteHands(); // update satellite display immediately
        });
    });

    // Credit value buttons
    document.querySelectorAll('.cv-btn').forEach(btn => {
        btn.addEventListener('click', () => setCreditValue(parseFloat(btn.dataset.value)));
    });

    document.getElementById('setCreditValueBtn').addEventListener('click', () => {
        const val = parseFloat(document.getElementById('customCreditValue').value);
        if (val > 0) setCreditValue(val);
    });

    // Add credits
    document.getElementById('resetCreditsBtn').addEventListener('click', () => {
        const val = parseInt(document.getElementById('startingCredits').value);
        if (val > 0) { state.credits += val; updateDisplay(); }
    });

    // Win sound dropdown
    document.getElementById('winSoundSelect').addEventListener('change', e => {
        state.winSound = e.target.value;
    });
    document.getElementById('winSoundPreview').addEventListener('click', () => {
        try { playWinFanfare.__preview(state.winSound, false); } catch(e) {}
    });

    // Big winner sound dropdown
    document.getElementById('bigWinSoundSelect').addEventListener('change', e => {
        state.bigWinSound = e.target.value;
    });
    document.getElementById('bigWinSoundPreview').addEventListener('click', () => {
        try { playWinFanfare.__preview(state.bigWinSound, true); } catch(e) {}
    });

    // Dollars per point
    document.getElementById('setDollarsPerPointBtn').addEventListener('click', () => {
        const val = parseFloat(document.getElementById('dollarsPerPointInput').value);
        if (val > 0) { state.dollarsPerPoint = val; renderStats(); }
    });

    // Reset statistics
    document.getElementById('resetStatsBtn').addEventListener('click', () => {
        state.stats = { handsPlayed: 0, totalWagered: 0, totalReturned: 0, winCounts: {} };
        renderStats();
    });

    // Pay table presets (main page)
    document.getElementById('preset96Btn').addEventListener('click', () => {
        state.payTable = { ...DEFAULT_PAY_TABLE };
        renderPayTableSettings(); renderPayTable(); updatePresetHighlight();
    });
    document.getElementById('preset85Btn').addEventListener('click', () => {
        state.payTable = { ...DEFAULT_PAY_TABLE, 'Full House': 8, 'Flush': 5 };
        renderPayTableSettings(); renderPayTable(); updatePresetHighlight();
    });
    document.getElementById('preset75Btn').addEventListener('click', () => {
        state.payTable = { ...DEFAULT_PAY_TABLE, 'Full House': 7, 'Flush': 5 };
        renderPayTableSettings(); renderPayTable(); updatePresetHighlight();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (document.getElementById('settingsModal').classList.contains('active')) return;
        if (state.phase === 'autoplay') return;
        switch (e.key) {
            case ' ':  e.preventDefault(); deal(); break;
            case '1':  toggleHold(0); break;
            case '2':  toggleHold(1); break;
            case '3':  toggleHold(2); break;
            case '4':  toggleHold(3); break;
            case '5':  toggleHold(4); break;
            case 'b':  betOne(); break;
            case 'm':  betMax(); break;
        }
    });
}

window.addEventListener('load', init);
