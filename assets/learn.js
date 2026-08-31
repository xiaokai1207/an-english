// An English · Learn module: flashcard sessions and mini games

// Learn runs a daily flashcard session: new words first, then review mix.
const Learn = {
  cards: [],
  index: 0,
  readOk: {},

  // buildSession picks today's card queue for the current week.
  buildSession() {
    const st = Store.state;
    const wk = U.weekData(st.currentWeek);
    const learned = U.learnedWords();
    const pool = wk.review ? learned : wk.words;

    const fresh = pool.filter((w) => !st.words[w.word]);
    const newWords = fresh.slice(0, st.settings.newPerDay);

    const freshSet = {};
    newWords.forEach((w) => { freshSet[w.word] = true; });
    const reviewPool = learned.filter((w) => !freshSet[w.word]);
    // weakest words first: fewest correct answers win the review slots,
    // shuffle beforehand keeps equal-strength words in random order
    const reviews = U.shuffle(reviewPool)
      .sort((a, b) => {
        const ra = Store.state.words[a.word];
        const rb = Store.state.words[b.word];
        return (ra.ok - ra.seen) - (rb.ok - rb.seen);
      })
      .slice(0, st.settings.reviewPerDay);

    if (newWords.length + reviews.length === 0) {
      return U.shuffle(pool); // everything learned -> full review mode
    }
    return newWords.concat(U.shuffle(reviews));
  },

  start() {
    this.cards = this.buildSession();
    this.index = 0;
    this.readOk = {};
    if (this.cards.length === 0) {
      U.app().innerHTML = `
        <main class="screen">
          <div class="mascot" onclick="U.poke()">🐥</div>
          <div class="empty">No words yet.<br>Ask a grown-up to pick a week! 🐥</div>
        </main>` + renderNav('learn');
      return;
    }
    this.showCard();
  },

  showCard() {
    FollowRead.cancel();
    const item = this.cards[this.index];
    const isLast = this.index === this.cards.length - 1;
    const follow = FollowRead.supported();
    const readDone = !!this.readOk[item.word];
    const card = `
      <div class="flash-card" id="flash-card" onclick="TTS.speak('${U.esc(item.word)}')">
        <div class="flash-face">${U.face(item)}</div>
        <div class="flash-word">${U.esc(item.word)}</div>
        <div class="flash-zh">${U.esc(item.zh)}
          <button class="zh-btn" aria-label="speak Chinese"
            onclick="event.stopPropagation();TTS.speakZh('${U.esc(item.zh)}')">中</button>
        </div>
        <div class="flash-sound">🔊 Tap to hear</div>
      </div>`;
    const dots = this.cards.map((c, i) => (
      `<span class="dot ${i <= this.index ? 'on' : ''}"></span>`
    )).join('');

    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="nav('today')">‹</button>
        <div class="chip">${this.index + 1} / ${this.cards.length}</div>
        <div class="chip">🔊</div>
      </header>
      <main class="screen flash-screen">
        <div class="progress-dots">${dots}</div>
        ${card}
        ${follow ? '<div class="follow-area" id="follow-area"></div>' : ''}
        <div class="flash-actions">
          <button class="btn-round" onclick="Learn.prev()" aria-label="previous">⬅️</button>
          <button class="btn-round big ${follow && !readDone ? 'is-locked' : ''}" id="next-btn"
            onclick="Learn.next()" aria-label="next">${isLast ? '🏁' : '➡️'}</button>
        </div>
      </main>`;
    window.scrollTo(0, 0);
    U.recordSeen(item.word);
    if (follow) {
      FollowRead.mount('follow-area', item.word, {
        onPass: () => this.markRead(item.word),
        onDegrade: () => this.markRead(item.word),
      });
    }
  },

  // markRead unlocks the next button once the word is read correctly
  // (or follow-read had to give up, so learning is never blocked).
  markRead(word) {
    this.readOk[word] = true;
    const btn = U.el('next-btn');
    if (btn) {
      btn.classList.remove('is-locked');
      btn.classList.add('is-ready');
    }
  },

  prev() {
    if (this.index > 0) {
      this.index -= 1;
      this.showCard();
    }
  },

  next() {
    const item = this.cards[this.index];
    if (FollowRead.supported() && !this.readOk[item.word]) {
      FollowRead.nudge();
      return;
    }
    if (this.index < this.cards.length - 1) {
      this.index += 1;
      this.showCard();
    } else {
      this.finish(item);
    }
  },

  finish(lastItem) {
    const log = U.markActive();
    log.learned = true;
    Store.save();
    U.addStars(2);
    SFX.win();
    confetti(60);
    U.app().innerHTML = `
      <main class="screen done-screen">
        <div class="done-emoji">🎉</div>
        <div class="done-title">Great job!</div>
        <div class="done-sub">⭐ +2 · ${this.cards.length} words today</div>
        <div class="done-face">${U.face(lastItem)}</div>
        <button class="btn-primary" onclick="nav('play')">🎮 Play a game</button>
        <button class="btn-ghost" onclick="Learn.start()">🔁 Once more</button>
        <button class="btn-ghost" onclick="nav('today')">🏠 Home</button>
      </main>`;
  },
};

// Games hosts the two practice mini games.
const Games = {
  // pickPool gathers words for games: current week first, older words fill in.
  pickPool(need) {
    const st = Store.state;
    const wk = U.weekData(st.currentWeek);
    const learned = U.learnedWords();
    const inWeek = wk.review
      ? learned
      : wk.words.filter((w) => st.words[w.word]);
    const extra = learned.filter((w) => !inWeek.includes(w));
    return U.shuffle(inWeek).concat(U.shuffle(extra)).slice(0, need);
  },

  menu() {
    const poolSize = U.learnedWords().length;
    const locked = poolSize < 4;
    const body = locked
      ? `<div class="empty">Learn some words first! 🐥<br>
         <button class="btn-primary" onclick="nav('learn')">📖 Learn</button></div>`
      : `<div class="game-grid">
          <button class="game-card" onclick="Games.listenStart()">
            <span class="game-icon">👂</span><span class="game-name">Listen & Tap</span>
            <span class="game-zh">听音选图</span>
          </button>
          <button class="game-card" onclick="Games.matchStart()">
            <span class="game-icon">🔗</span><span class="game-name">Match Up</span>
            <span class="game-zh">连连配对</span>
          </button>
        </div>`;
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="nav('today')">‹</button>
        <div class="chip">🎮 Play</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen">${body}</main>` + renderNav('play');
  },

  // ---- Listen & Tap ----

  listenStart() {
    this.quiz = U.shuffle(this.pickPool(8)).slice(0, 5);
    this.qIndex = 0;
    this.score = 0;
    this.listenQuestion();
  },

  listenQuestion() {
    const item = this.quiz[this.qIndex];
    // distractors come from learned words first, then the full vocabulary
    const learnedOthers = U.learnedWords().filter((w) => w.word !== item.word);
    let distractors = U.shuffle(learnedOthers).slice(0, 3);
    if (distractors.length < 3) {
      const picked = {};
      distractors.forEach((w) => { picked[w.word] = true; });
      const extra = U.shuffle(
        U.allUniqueWords().filter((w) => w.word !== item.word && !picked[w.word]),
      ).slice(0, 3 - distractors.length);
      distractors = distractors.concat(extra);
    }
    const options = U.shuffle([item].concat(distractors));

    const optionHtml = options.map((w, i) => (
      `<button class="opt-card" id="opt-${i}" onclick="Games.listenTap(${i})">
        <span class="opt-face">${U.face(w)}</span>
      </button>`
    )).join('');

    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="Games.menu()">✖️</button>
        <div class="chip">${this.qIndex + 1} / ${this.quiz.length}</div>
        <div class="chip">⭐ ${this.score}</div>
      </header>
      <main class="screen">
        <button class="say-btn" onclick="TTS.speak('${U.esc(item.word)}')">
          <span class="say-icon">🔊</span><span>Tap to listen</span>
        </button>
        <div class="options-grid">${optionHtml}</div>
      </main>`;
    this.current = { item, options };
    setTimeout(() => TTS.speak(item.word), 350);
  },

  listenTap(i) {
    if (this.locked) return;
    this.locked = true;
    const { item, options } = this.current;
    const picked = options[i];
    const btn = U.el(`opt-${i}`);

    if (picked.word === item.word) {
      btn.classList.add('correct');
      this.score += 1;
      U.recordOk(item.word);
      U.addStars(1);
      SFX.readPass();
    } else {
      btn.classList.add('wrong');
      U.recordErr(item.word);
      SFX.wrong();
      const rightIdx = options.findIndex((w) => w.word === item.word);
      const right = U.el(`opt-${rightIdx}`);
      if (right) right.classList.add('correct');
    }

    setTimeout(() => {
      this.locked = false;
      if (this.qIndex < this.quiz.length - 1) {
        this.qIndex += 1;
        this.listenQuestion();
      } else {
        this.finishGame(this.score, this.quiz.length);
      }
    }, 1100);
  },

  // ---- Match Up ----
  // An open-board matching game: pictures on the left, words on the right,
  // both shuffled. The child taps a picture, then taps the word that matches.
  // Clearing every pair wins the round - nothing is hidden. Taps only toggle
  // classes on the affected cards, so the board never re-renders or reflows.

  matchStart() {
    const picks = this.pickPool(4);
    if (picks.length < 3) {
      this.menu();
      return;
    }
    this.pairs = picks;
    this.lefts = U.shuffle(picks);
    this.rights = U.shuffle(picks);
    this.pickedLeft = null;
    this.matched = {};
    this.matchedCount = 0;
    this.locked = false;
    this.matchRender();
  },

  // matchRender builds the board once. Every tap after this only toggles
  // classes on individual cards - see matchPickLeft / matchPickRight.
  // Cards are laid out row by row (picture, word) in one grid so each row's
  // two cards always share the same height.
  matchRender() {
    const total = this.pairs.length;
    let cells = '';
    for (let row = 0; row < total; row += 1) {
      const left = this.lefts[row];
      const right = this.rights[row];
      cells += `<button class="match-card" id="ml-${row}"
        onclick="Games.matchPickLeft(${row})">
        <span class="mem-face">${U.face(left)}</span></button>`;
      cells += `<button class="match-card" id="mr-${row}"
        onclick="Games.matchPickRight(${row})">
        <span class="mem-word">${U.esc(right.word)}</span></button>`;
    }

    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="Games.menu()">✖️</button>
        <div class="chip" id="match-count">🔗 ${this.matchedCount}/${total}</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen">
        <div class="match-hint">Tap a picture, then its word!<i>先点图片，再点对应的单词</i></div>
        <div class="match-board">${cells}</div>
      </main>`;
  },

  matchPickLeft(i) {
    const w = this.lefts[i];
    if (this.locked || this.matched[w.word]) return;
    // clear any previous highlight, then toggle this one
    const prev = this.lefts.findIndex((l) => l.word === this.pickedLeft);
    if (prev >= 0) this.setCardState(`ml-${prev}`, '');
    if (this.pickedLeft === w.word) {
      this.pickedLeft = null;
    } else {
      this.pickedLeft = w.word;
      this.setCardState(`ml-${i}`, 'active');
    }
    SFX.flip();
  },

  matchPickRight(i) {
    const w = this.rights[i];
    if (this.locked || this.matched[w.word]) return;
    if (!this.pickedLeft) {
      SFX.flip();
      return;
    }
    if (this.pickedLeft === w.word) {
      this.acceptMatch(w.word, i);
      return;
    }
    this.rejectMatch(i);
  },

  // acceptMatch locks the paired cards green and updates the counter only.
  acceptMatch(word, rightIdx) {
    const leftIdx = this.lefts.findIndex((l) => l.word === word);
    this.matched[word] = true;
    this.matchedCount += 1;
    this.pickedLeft = null;
    this.setCardState(`ml-${leftIdx}`, 'matched', true);
    this.setCardState(`mr-${rightIdx}`, 'matched', true);
    const count = U.el('match-count');
    if (count) count.textContent = `🔗 ${this.matchedCount}/${this.pairs.length}`;
    U.recordOk(word);
    U.addStars(1);
    SFX.readPass();
    TTS.speak(word);
    if (this.matchedCount === this.pairs.length) {
      setTimeout(() => this.finishGame(this.matchedCount, this.pairs.length), 650);
    }
  },

  // rejectMatch shakes the wrong word, then clears the left highlight.
  rejectMatch(rightIdx) {
    this.locked = true;
    U.recordErr(this.pickedLeft);
    SFX.wrong();
    this.setCardState(`mr-${rightIdx}`, 'wrong');
    setTimeout(() => {
      const leftIdx = this.lefts.findIndex((l) => l.word === this.pickedLeft);
      if (leftIdx >= 0) this.setCardState(`ml-${leftIdx}`, '');
      this.setCardState(`mr-${rightIdx}`, '');
      this.pickedLeft = null;
      this.locked = false;
    }, 700);
  },

  // setCardState swaps a card's status class in place (no re-render), and
  // optionally disables it once matched.
  setCardState(id, state, disable) {
    const btn = U.el(id);
    if (!btn) return;
    btn.classList.remove('active', 'matched', 'wrong');
    if (state) btn.classList.add(state);
    if (disable) btn.disabled = true;
  },

  finishGame(score, total) {
    const log = U.markActive();
    log.played = true;
    Store.save();
    SFX.win();
    confetti(60);
    U.app().innerHTML = `
      <main class="screen done-screen">
        <div class="done-emoji">🏆</div>
        <div class="done-title">${score === total ? 'Perfect!' : 'Great job!'}</div>
        <div class="done-sub">${score} / ${total} · ⭐ ${Store.state.stars}</div>
        <button class="btn-primary" onclick="Games.menu()">🎮 Play again</button>
        <button class="btn-ghost" onclick="nav('today')">🏠 Home</button>
      </main>`;
  },
};
