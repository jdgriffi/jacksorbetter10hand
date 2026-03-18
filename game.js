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
    'Royal Flush':    250,  // special: 4000 total for 5-credit bet
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
    hand:        [],                          // array of {rank, suit}
    held:        [false,false,false,false,false],
    credits:     100,
    bet:         1,
    creditValue: 0.25,
    payTable:    { ...DEFAULT_PAY_TABLE },
    phase:       'idle',                      // idle | holding | result
    lastWin:     0,
    lastHand:    null,
};

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

    // Count rank occurrences
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    const isFlush = suits.every(s => s === suits[0]);

    const nums = ranks.map(r => RANK_VALUE[r]).sort((a, b) => a - b);
    const isNormalStraight = counts[0] === 1 && nums[4] - nums[0] === 4;
    // Ace-low straight: A-2-3-4-5
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
        if (['J','Q','K','A'].includes(paired))  return 'Jacks or Better';
    }

    return null;
}

function calculatePayout(handName, bet) {
    if (!handName) return 0;
    // Royal Flush bonus for max bet
    if (handName === 'Royal Flush' && bet === 5) return 4000;
    return state.payTable[handName] * bet;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function cardHTML(card, index) {
    const colorClass = RED_SUITS.has(card.suit) ? 'red' : 'black';
    const heldClass  = state.held[index] ? 'held' : '';
    const holdable   = state.phase === 'holding' ? 'holdable' : '';
    return `
      <div class="card ${colorClass} ${heldClass} ${holdable}" data-index="${index}">
        <div class="card-corner top-left">
          <span class="rank">${card.rank}</span>
          <span class="suit">${card.suit}</span>
        </div>
        <div class="card-center">${card.suit}</div>
        <div class="card-corner bot-right">
          <span class="rank">${card.rank}</span>
          <span class="suit">${card.suit}</span>
        </div>
      </div>`;
}

function backCardHTML(index) {
    return `<div class="card back" data-index="${index}"></div>`;
}

function renderCards() {
    const area = document.getElementById('cardsArea');
    if (state.hand.length === 0) {
        area.innerHTML = [0,1,2,3,4].map(backCardHTML).join('');
        return;
    }
    area.innerHTML = state.hand.map((c, i) => cardHTML(c, i)).join('');

    if (state.phase === 'holding') {
        area.querySelectorAll('.card').forEach(el => {
            el.addEventListener('click', () => {
                toggleHold(parseInt(el.dataset.index));
            });
        });
    }
}

function renderPayTable() {
    const tbody = document.getElementById('payTableBody');
    tbody.innerHTML = HAND_NAMES.map(name => {
        const base = state.payTable[name];
        const isWinner = name === state.lastHand;

        const cells = [1,2,3,4,5].map(b => {
            const pay = (name === 'Royal Flush' && b === 5) ? 4000 : base * b;
            const cls = b === state.bet ? 'cur-bet' : '';
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
            if (val > 0) {
                state.payTable[inp.dataset.hand] = val;
                renderPayTable();
            }
        });
    });
}

function fmt(val) {
    return '$' + val.toFixed(2);
}

function updateDisplay() {
    document.getElementById('creditsDisplay').textContent = state.credits;
    document.getElementById('creditsDollar').textContent  = fmt(state.credits * state.creditValue);

    document.getElementById('betDisplay').textContent = state.bet;
    document.getElementById('betDollar').textContent  = fmt(state.bet * state.creditValue);

    document.getElementById('winDisplay').textContent = state.lastWin;
    document.getElementById('winDollar').textContent  = fmt(state.lastWin * state.creditValue);

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

    // Hold buttons
    document.querySelectorAll('.hold-btn').forEach((btn, i) => {
        btn.disabled = state.phase !== 'holding';
        btn.classList.toggle('active', state.held[i]);
    });

    // Win message
    const msg = document.getElementById('winMessage');
    if (state.phase === 'result') {
        if (state.lastHand) {
            msg.textContent = `\u2728 ${state.lastHand.toUpperCase()}!  +${state.lastWin} credits`;
            msg.style.color = '#ffd700';
        } else {
            msg.textContent = 'No winner \u2014 deal again!';
            msg.style.color = '#ff8888';
        }
    } else if (state.phase === 'holding') {
        msg.textContent = 'Select cards to HOLD, then DRAW';
        msg.style.color = '#ffd700';
    } else {
        if (state.credits === 0) {
            msg.textContent = 'Out of credits! Reset in Settings.';
            msg.style.color = '#ff5555';
        } else {
            msg.textContent = 'Place your bet and deal!';
            msg.style.color = '#ffd700';
        }
    }
}

// ─── Game Actions ─────────────────────────────────────────────────────────────

function toggleHold(index) {
    if (state.phase !== 'holding') return;
    state.held[index] = !state.held[index];
    renderCards();
    updateDisplay();
}

function deal() {
    if (state.phase === 'holding') {
        draw();
        return;
    }
    if (state.credits < state.bet) {
        document.getElementById('winMessage').textContent = 'Not enough credits!';
        return;
    }

    state.credits  -= state.bet;
    state.lastWin   = 0;
    state.lastHand  = null;
    state.held      = [false,false,false,false,false];
    state.deck      = createDeck();
    state.hand      = state.deck.splice(0, 5);
    state.phase     = 'holding';

    renderCards();
    renderPayTable();
    updateDisplay();
}

function draw() {
    // Replace non-held cards
    for (let i = 0; i < 5; i++) {
        if (!state.held[i]) {
            state.hand[i] = state.deck.splice(0, 1)[0];
        }
    }

    const handName = evaluateHand(state.hand);
    const payout   = calculatePayout(handName, state.bet);

    state.lastHand = handName;
    state.lastWin  = payout;
    state.credits += payout;
    state.phase    = 'result';
    state.held     = [false,false,false,false,false];

    renderCards();
    renderPayTable();
    updateDisplay();
}

function betOne() {
    if (state.phase === 'holding') return;
    state.bet = state.bet >= 5 ? 1 : state.bet + 1;
    renderPayTable();
    updateDisplay();
}

function betMax() {
    if (state.phase === 'holding') return;
    state.bet = 5;
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
    // Sync active button state
    document.querySelectorAll('.cv-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.value) === val);
    });
    updateDisplay();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
    // Render empty card backs on load
    renderCards();
    renderPayTable();
    updateDisplay();

    // Action bar
    document.getElementById('dealBtn').addEventListener('click', deal);
    document.getElementById('betOneBtn').addEventListener('click', betOne);
    document.getElementById('maxBetBtn').addEventListener('click', betMax);

    // Hold buttons (also handled per-card via renderCards)
    document.querySelectorAll('.hold-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleHold(parseInt(btn.dataset.index)));
    });

    // Settings open / close
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('settingsModal').addEventListener('click', e => {
        if (e.target === document.getElementById('settingsModal')) closeSettings();
    });

    // Credit value preset buttons
    document.querySelectorAll('.cv-btn').forEach(btn => {
        btn.addEventListener('click', () => setCreditValue(parseFloat(btn.dataset.value)));
    });

    // Custom credit value
    document.getElementById('setCreditValueBtn').addEventListener('click', () => {
        const val = parseFloat(document.getElementById('customCreditValue').value);
        if (val > 0) setCreditValue(val);
    });

    // Reset credits
    document.getElementById('resetCreditsBtn').addEventListener('click', () => {
        const val = parseInt(document.getElementById('startingCredits').value);
        if (val > 0) {
            state.credits = val;
            state.phase   = 'idle';
            state.hand    = [];
            state.held    = [false,false,false,false,false];
            state.lastWin  = 0;
            state.lastHand = null;
            renderCards();
            renderPayTable();
            updateDisplay();
            closeSettings();
        }
    });

    // Reset pay table
    document.getElementById('resetPayTableBtn').addEventListener('click', () => {
        state.payTable = { ...DEFAULT_PAY_TABLE };
        renderPayTableSettings();
        renderPayTable();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        switch (e.key) {
            case ' ':  e.preventDefault(); deal(); break;
            case '1':  if (state.phase === 'holding') toggleHold(0); break;
            case '2':  if (state.phase === 'holding') toggleHold(1); break;
            case '3':  if (state.phase === 'holding') toggleHold(2); break;
            case '4':  if (state.phase === 'holding') toggleHold(3); break;
            case '5':  if (state.phase === 'holding') toggleHold(4); break;
            case 'b':  betOne(); break;
            case 'm':  betMax(); break;
        }
    });
}

window.addEventListener('load', init);
