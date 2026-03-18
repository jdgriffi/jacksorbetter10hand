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
    phase:       'idle',   // idle | holding | result
    lastWin:     0,
    lastHand:    null,
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

function playWinFanfare(handName) {
    try {
        const ctx = getAudioCtx();
        const isRoyal = handName === 'Royal Flush';
        // Ascending notes for a win jingle
        const notes = isRoyal
            ? [523, 659, 784, 1047, 1319]
            : [523, 659, 784, 1047];

        notes.forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            const t = ctx.currentTime + i * 0.12;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    } catch (e) { /* audio not available */ }
}

// ─── Credit Count-Up ──────────────────────────────────────────────────────────

let countUpTimer = null;

function animateCountUp(from, to, onDone) {
    if (countUpTimer) clearInterval(countUpTimer);
    if (to <= from) { onDone && onDone(); return; }

    const el = document.getElementById('creditsDisplay');
    const winEl = document.getElementById('winDisplay');
    let current = from;
    let remaining = to - from;

    // Tick every 80ms for small wins, faster for large wins
    const interval = Math.max(20, Math.min(80, Math.round(4000 / remaining)));

    countUpTimer = setInterval(() => {
        current++;
        remaining--;
        el.textContent = current;

        // Pulse animation
        el.classList.remove('counting');
        void el.offsetWidth; // reflow to restart animation
        el.classList.add('counting');

        playTick();

        if (remaining <= 0) {
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
    tbody.innerHTML = HAND_NAMES.map(name => {
        const base = state.payTable[name];
        const isWinner = name === state.lastHand;

        const cells = [1,2,3,4,5].map(b => {
            const pay = (name === 'Royal Flush' && b === 5) ? 4000 : base * b;
            const isCur = b === state.bet;
            const isCol5 = b === 5;
            const cls = [isCur ? 'cur-bet' : '', isCol5 ? 'col5' : ''].filter(Boolean).join(' ');
            return `<td class="${cls}">${pay}</td>`;
        }).join('');

        return `<tr class="${isWinner ? 'winner' : ''}">
            <td class="hand-col">${name}</td>${cells}
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
            if (val > 0) { state.payTable[inp.dataset.hand] = val; renderPayTable(); }
        });
    });
}

function formatCreditBadge(val) {
    if (val < 1)  return Math.round(val * 100) + '¢';
    if (val === Math.floor(val)) return '$' + val;
    return '$' + val.toFixed(2);
}

function updateDisplay() {
    document.getElementById('betDisplay').textContent     = state.bet;
    document.getElementById('winDisplay').textContent     = state.lastWin;
    document.getElementById('creditsDisplay').textContent = state.credits;
    document.getElementById('creditValBadge').textContent = formatCreditBadge(state.creditValue * state.bet);

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
        if (state.lastHand) {
            msg.textContent = state.lastHand.toUpperCase();
        } else {
            msg.textContent = 'NO WINNER';
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

// ─── Game Actions ─────────────────────────────────────────────────────────────

function toggleHold(index) {
    if (state.phase !== 'holding') return;
    state.held[index] = !state.held[index];

    const slot = document.querySelectorAll('#cardsArea .card-slot')[index];
    if (slot) slot.classList.toggle('held', state.held[index]);
}

function deal() {
    if (state.phase === 'holding') { draw(); return; }
    if (state.credits < state.bet) {
        document.getElementById('winMessage').textContent = 'NOT ENOUGH CREDITS';
        return;
    }

    state.credits  -= state.bet;
    state.lastWin   = 0;
    state.lastHand  = null;
    state.held      = [false,false,false,false,false];
    state.deck      = createDeck();
    state.hand      = state.deck.splice(0, 5);
    state.phase     = 'dealing';

    // Show five card backs immediately, then flip one at a time
    const area = document.getElementById('cardsArea');
    area.innerHTML = '';
    for (let i = 0; i < 5; i++) area.appendChild(makeSlotEl(null, i, true));

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
            document.getElementById('winMessage').textContent =
                state.lastHand.toUpperCase();
            playWinFanfare(state.lastHand);
        }
    }, 5 * DEAL_INTERVAL);
}

function draw() {
    const toReplace = [];
    for (let i = 0; i < 5; i++) {
        if (!state.held[i]) toReplace.push(i);
    }

    for (const i of toReplace) {
        state.hand[i] = state.deck.splice(0, 1)[0];
    }

    const handName = evaluateHand(state.hand);
    const payout   = calculatePayout(handName, state.bet);

    state.lastHand = handName;
    state.lastWin  = payout;
    state.phase    = 'result';
    state.held     = [false,false,false,false,false];

    // Remove HELD styling from kept cards
    document.querySelectorAll('#cardsArea .card-slot.held').forEach(el => {
        el.classList.remove('held');
    });

    // Disable deal button during animation
    document.getElementById('dealBtn').disabled = true;
    document.getElementById('betOneBtn').disabled = true;
    document.getElementById('maxBetBtn').disabled = true;

    const slots = Array.from(document.querySelectorAll('#cardsArea .card-slot'));
    const INTERVAL = 220;

    toReplace.forEach((cardIndex, seq) => {
        setTimeout(() => {
            const card = state.hand[cardIndex];
            const newCardEl = makeCardEl(card, cardIndex);
            newCardEl.style.animationDelay = '0ms';

            const slot = slots[cardIndex];
            const oldCard = slot.querySelector('.card');
            slot.replaceChild(newCardEl, oldCard);
            playDraw();
        }, seq * INTERVAL);
    });

    // After cards land: play fanfare then count up credits
    const cardsDone = toReplace.length * INTERVAL + 350;
    setTimeout(() => {
        renderPayTable();
        updateDisplay();  // shows hand name, resets win display

        if (payout > 0) {
            playWinFanfare(handName);
            const creditsBeforeWin = state.credits;
            state.credits += payout;

            setTimeout(() => {
                animateCountUp(creditsBeforeWin, state.credits, () => {
                    document.getElementById('creditsDisplay').classList.remove('counting');
                    enableButtons();
                });
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

function init() {
    renderCards();
    renderPayTable();
    updateDisplay();

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

    // Reset pay table
    document.getElementById('resetPayTableBtn').addEventListener('click', () => {
        state.payTable = { ...DEFAULT_PAY_TABLE };
        renderPayTableSettings();
        renderPayTable();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (document.getElementById('settingsModal').classList.contains('active')) return;
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
