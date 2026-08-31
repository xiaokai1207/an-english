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
    const cheer = `Woo-hoo! Amazing! You learned ${this.cards.length} new words! You are a superstar!`;
    TTS.speak(cheer, null, { excited: true });
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
          <button class="game-card" onclick="Games.memoryStart()">
            <span class="game-icon">🃏</span><span class="game-name">Memory Match</span>
            <span class="game-zh">翻牌配对</span>
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
      SFX.correct();
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

  // ---- Memory Match ----

  memoryStart() {
    const picks = this.pickPool(3);
    if (picks.length < 3) {
      this.menu();
      return;
    }
    const deck = [];
    picks.forEach((w, i) => {
      deck.push({ key: i, kind: 'emoji', item: w });
      deck.push({ key: i, kind: 'word', item: w });
    });
    this.deck = U.shuffle(deck);
    this.open = [];
    this.matched = 0;
    this.tries = 0;
    this.memoryRender();
  },

  memoryRender() {
    const cards = this.deck.map((c, i) => {
      const open = this.open.includes(i);
      const done = c.done;
      const inner = open || done
        ? (c.kind === 'emoji'
          ? `<span class="mem-face">${U.face(c.item)}</span>`
          : `<span class="mem-word">${U.esc(c.item.word)}</span>`)
        : '<span class="mem-back">🐥</span>';
      return `<button class="mem-card ${open || done ? 'flipped' : ''} ${done ? 'matched' : ''}"
        onclick="Games.memoryFlip(${i})">${inner}</button>`;
    }).join('');

    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="Games.menu()">✖️</button>
        <div class="chip">🃏 ${this.matched}/3</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen">
        <div class="memory-grid">${cards}</div>
      </main>`;
  },

  memoryFlip(i) {
    if (this.open.includes(i) || this.deck[i].done || this.open.length >= 2) return;
    this.open.push(i);
    SFX.flip();
    this.memoryRender();

    if (this.open.length === 2) {
      this.tries += 1;
      const [a, b] = this.open;
      if (this.deck[a].key === this.deck[b].key) {
        this.deck[a].done = true;
        this.deck[b].done = true;
        this.matched += 1;
        U.recordOk(this.deck[a].item.word);
        U.addStars(1);
        SFX.correct();
        TTS.speak(this.deck[a].item.word);
        this.open = [];
        setTimeout(() => {
          this.memoryRender();
          if (this.matched === 3) this.finishGame(3, 3);
        }, 650);
      } else {
        U.recordErr(this.deck[a].item.word);
        setTimeout(() => {
          this.open = [];
          this.memoryRender();
        }, 900);
      }
    }
  },

  finishGame(score, total) {
    const log = U.markActive();
    log.played = true;
    Store.save();
    SFX.win();
    confetti(60);
    const line = score === total ? 'Woo-hoo! Perfect! You are amazing!' : 'Yay! Great job! Well done!';
    TTS.speak(line, null, { excited: true });
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
