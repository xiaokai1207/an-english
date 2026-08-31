// An English · ABC module: letters, phonics, sight words, and sentence
// practice. These four skills round out the plan beyond themed vocabulary.
// Progress lives in Store.state.abc, kept apart from the themed word book.

// ---- shared helpers ----

// jsStr escapes text going into an inline onclick="fn('...')" so single
// quotes and backslashes in a sentence (e.g. Let's ___!) never break the
// attribute or inject code.
function jsStr(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// pronounceLetter speaks a single capital letter clearly. Spelling it out as
// "letter A" stops engines from reading "A" as the article "uh".
function pronounceLetter(letter) {
  TTS.speak(`Letter ${letter}`);
}

// cheer plays the win chime with a short excited spoken line, reused by every
// ABC round so a correct answer always feels like a celebration.
function abcCheer() {
  SFX.readPass();
  const lines = [
    'Yes! Awesome!',
    'Great job!',
    'You got it!',
    'Fantastic!',
    'Well done!',
  ];
  TTS.speak(lines[Math.floor(Math.random() * lines.length)], null, { excited: true });
}

// ABC hosts the letters / phonics / sight-word / sentence sub-screens.
const ABC = {
  // menu lists the four ABC activities with their progress badges.
  menu() {
    const done = this.counts();
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="nav('today')">‹</button>
        <div class="chip">🔤 ABC</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen">
        <div class="abc-grid">
          <button class="abc-card" onclick="ABC.lettersStart()">
            <span class="abc-icon">🔠</span>
            <span class="abc-name">Letters</span>
            <span class="abc-zh">认字母 · ${done.letters}/26</span>
          </button>
          <button class="abc-card" onclick="ABC.phonicsMenu()">
            <span class="abc-icon">🗣️</span>
            <span class="abc-name">Phonics</span>
            <span class="abc-zh">自然拼读 · ${done.phonics}/${ABC_DATA.phonics.length}</span>
          </button>
          <button class="abc-card" onclick="ABC.sightMenu()">
            <span class="abc-icon">👀</span>
            <span class="abc-name">Sight Words</span>
            <span class="abc-zh">高频词 · ${done.sight}/${ABC_DATA.sightWords.length}</span>
          </button>
          <button class="abc-card" onclick="ABC.sentenceStart()">
            <span class="abc-icon">💬</span>
            <span class="abc-name">Say It!</span>
            <span class="abc-zh">句型跟读</span>
          </button>
        </div>
      </main>` + renderNav('abc');
    window.scrollTo(0, 0);
  },

  // counts summarises how much of each ABC activity is done for the badges.
  counts() {
    const abc = Store.state.abc;
    const phonicsDone = ABC_DATA.phonics.filter((g) => abc.phonics[g.id]).length;
    const sightDone = ABC_DATA.sightWords.filter((b) => abc.sight[b.id]).length;
    return {
      letters: Object.keys(abc.letters).length,
      phonics: phonicsDone,
      sight: sightDone,
    };
  },

  // ---- Letters: recognition cards + "which letter?" game ----

  lettersStart() {
    this.letterIndex = 0;
    this.letterCard();
  },

  letterCard() {
    const item = ABC_DATA.letters[this.letterIndex];
    const isLast = this.letterIndex === ABC_DATA.letters.length - 1;
    const total = ABC_DATA.letters.length;
    Store.state.abc.letters[item.letter] = true;
    Store.save();
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.menu()">‹</button>
        <div class="chip">${this.letterIndex + 1} / ${total}</div>
        <div class="chip">🔠</div>
      </header>
      <main class="screen flash-screen">
        <div class="letter-card" onclick="pronounceLetter('${item.letter}')">
          <div class="letter-big">${item.letter}<small>${item.letter.toLowerCase()}</small></div>
          <div class="letter-word">
            <span class="face-emoji">${item.emoji}</span>
            <span>${U.esc(item.letter)} · ${U.esc(item.word)}</span>
          </div>
          <div class="flash-sound">🔊 Tap to hear</div>
        </div>
        <div class="flash-actions">
          <button class="btn-round" onclick="ABC.letterPrev()" aria-label="previous">⬅️</button>
          <button class="btn-round" onclick="TTS.speak('${U.esc(item.word)}')"
            aria-label="say word">🔊</button>
          <button class="btn-round big" onclick="ABC.letterNext()"
            aria-label="next">${isLast ? '🎮' : '➡️'}</button>
        </div>
      </main>`;
    window.scrollTo(0, 0);
    pronounceLetter(item.letter);
  },

  letterPrev() {
    if (this.letterIndex > 0) {
      this.letterIndex -= 1;
      this.letterCard();
    }
  },

  letterNext() {
    if (this.letterIndex < ABC_DATA.letters.length - 1) {
      this.letterIndex += 1;
      this.letterCard();
      return;
    }
    this.letterQuizStart();
  },

  // letterQuizStart runs a short "listen, tap the letter" game over 5 rounds.
  letterQuizStart() {
    this.quiz = U.shuffle(ABC_DATA.letters).slice(0, 5);
    this.qIndex = 0;
    this.score = 0;
    this.locked = false;
    this.letterQuestion();
  },

  letterQuestion() {
    const target = this.quiz[this.qIndex];
    const others = U.shuffle(ABC_DATA.letters.filter((l) => l.letter !== target.letter))
      .slice(0, 3);
    const options = U.shuffle(others.concat(target));
    const optionHtml = options.map((opt, i) => (
      `<button class="letter-opt" id="lopt-${i}"
        onclick="ABC.letterTap(${i}, '${opt.letter}', '${target.letter}')">${opt.letter}</button>`
    )).join('');
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.menu()">✖️</button>
        <div class="chip">${this.qIndex + 1} / ${this.quiz.length}</div>
        <div class="chip">⭐ ${this.score}</div>
      </header>
      <main class="screen">
        <div class="quiz-ask">Which letter?<i>点一点你听到的字母</i></div>
        <button class="say-btn" onclick="pronounceLetter('${target.letter}')">
          <span class="say-icon">🔊</span><span>Tap to listen</span>
        </button>
        <div class="letter-opts">${optionHtml}</div>
      </main>`;
    window.scrollTo(0, 0);
    setTimeout(() => pronounceLetter(target.letter), 350);
  },

  letterTap(i, picked, target) {
    if (this.locked) return;
    this.locked = true;
    const btn = U.el(`lopt-${i}`);
    if (picked === target) {
      btn.classList.add('correct');
      this.score += 1;
      U.addStars(1);
      abcCheer();
    } else {
      btn.classList.add('wrong');
      SFX.wrong();
    }
    setTimeout(() => {
      this.locked = false;
      if (this.qIndex < this.quiz.length - 1) {
        this.qIndex += 1;
        this.letterQuestion();
      } else {
        this.finish(this.score, this.quiz.length, 'Letters');
      }
    }, 1100);
  },

  // ---- Phonics: sound out CVC / digraph word families ----

  phonicsMenu() {
    const cards = ABC_DATA.phonics.map((g) => {
      const done = Store.state.abc.phonics[g.id];
      return `<button class="abc-card" onclick="ABC.phonicsStart('${g.id}')">
        <span class="abc-icon">${g.emoji}</span>
        <span class="abc-name">${U.esc(g.title)}</span>
        <span class="abc-zh">${U.esc(g.titleZh)}${done ? ' ✅' : ''}</span>
      </button>`;
    }).join('');
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.menu()">‹</button>
        <div class="chip">🗣️ Phonics</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen"><div class="abc-grid">${cards}</div></main>` + renderNav('abc');
    window.scrollTo(0, 0);
  },

  phonicsStart(groupId) {
    this.group = ABC_DATA.phonics.find((g) => g.id === groupId);
    this.pIndex = 0;
    this.phonicsCard();
  },

  phonicsCard() {
    const item = this.group.words[this.pIndex];
    const isLast = this.pIndex === this.group.words.length - 1;
    const chips = item.parts.map((part) => (
      `<button class="sound-chip" onclick="TTS.speak('${U.esc(part)}')">${U.esc(part)}</button>`
    )).join('<span class="sound-plus">+</span>');
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.phonicsMenu()">‹</button>
        <div class="chip">${this.pIndex + 1} / ${this.group.words.length}</div>
        <div class="chip">${this.group.emoji}</div>
      </header>
      <main class="screen flash-screen">
        <div class="phonics-title">${U.esc(this.group.title)} · ${U.esc(this.group.titleZh)}</div>
        <div class="flash-face">${item.emoji ? `<span class="face-emoji">${item.emoji}</span>` : ''}</div>
        <div class="sound-chips">${chips}</div>
        <button class="blend-btn" onclick="ABC.blend()">🔊 ${U.esc(item.word)}<i>${U.esc(item.zh)}</i></button>
        <div class="flash-actions">
          <button class="btn-round" onclick="ABC.phonicsPrev()" aria-label="previous">⬅️</button>
          <button class="btn-round big" onclick="ABC.phonicsNext()"
            aria-label="next">${isLast ? '🏁' : '➡️'}</button>
        </div>
      </main>`;
    window.scrollTo(0, 0);
    this.blend();
  },

  // blend sounds out each part in turn, then says the whole word, so the
  // child hears the parts snap together into the word.
  blend() {
    const item = this.group.words[this.pIndex];
    let step = 0;
    const next = () => {
      if (step < item.parts.length) {
        TTS.speak(item.parts[step], next);
        step += 1;
      } else {
        TTS.speak(item.word);
      }
    };
    next();
  },

  phonicsPrev() {
    if (this.pIndex > 0) {
      this.pIndex -= 1;
      this.phonicsCard();
    }
  },

  phonicsNext() {
    if (this.pIndex < this.group.words.length - 1) {
      this.pIndex += 1;
      this.phonicsCard();
      return;
    }
    Store.state.abc.phonics[this.group.id] = true;
    Store.save();
    this.finish(this.group.words.length, this.group.words.length, this.group.title);
  },

  // ---- Sight Words: flashcards over a small batch ----

  sightMenu() {
    const cards = ABC_DATA.sightWords.map((b) => {
      const done = Store.state.abc.sight[b.id];
      return `<button class="abc-card" onclick="ABC.sightStart('${b.id}')">
        <span class="abc-icon">👀</span>
        <span class="abc-name">${U.esc(b.title)}</span>
        <span class="abc-zh">${U.esc(b.titleZh)}${done ? ' ✅' : ''}</span>
      </button>`;
    }).join('');
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.menu()">‹</button>
        <div class="chip">👀 Sight Words</div>
        <div class="chip">⭐ ${Store.state.stars}</div>
      </header>
      <main class="screen"><div class="abc-grid">${cards}</div></main>` + renderNav('abc');
    window.scrollTo(0, 0);
  },

  sightStart(batchId) {
    this.batch = ABC_DATA.sightWords.find((b) => b.id === batchId);
    this.sIndex = 0;
    this.sightCard();
  },

  sightCard() {
    const word = this.batch.words[this.sIndex];
    const isLast = this.sIndex === this.batch.words.length - 1;
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.sightMenu()">‹</button>
        <div class="chip">${this.sIndex + 1} / ${this.batch.words.length}</div>
        <div class="chip">👀</div>
      </header>
      <main class="screen flash-screen">
        <div class="sight-card" onclick="TTS.speak('${U.esc(word)}')">
          <div class="sight-word">${U.esc(word)}</div>
          <div class="flash-sound">🔊 Tap to hear</div>
        </div>
        <div class="flash-actions">
          <button class="btn-round" onclick="ABC.sightPrev()" aria-label="previous">⬅️</button>
          <button class="btn-round big" onclick="ABC.sightNext()"
            aria-label="next">${isLast ? '🏁' : '➡️'}</button>
        </div>
      </main>`;
    window.scrollTo(0, 0);
    TTS.speak(word);
  },

  sightPrev() {
    if (this.sIndex > 0) {
      this.sIndex -= 1;
      this.sightCard();
    }
  },

  sightNext() {
    if (this.sIndex < this.batch.words.length - 1) {
      this.sIndex += 1;
      this.sightCard();
      return;
    }
    Store.state.abc.sight[this.batch.id] = true;
    Store.save();
    this.finish(this.batch.words.length, this.batch.words.length, this.batch.title);
  },

  // ---- Say It!: read the current week's sentence patterns aloud ----

  sentenceStart() {
    const lines = this.collectSentences();
    if (lines.length === 0) {
      this.menu();
      return;
    }
    this.lines = lines;
    this.senIndex = 0;
    this.sentenceCard();
  },

  // collectSentences gathers sentence patterns from the current week plus a
  // few earlier ones so there is always something to practise. Placeholders
  // (___) are filled with a real word from that week so the whole sentence
  // reads naturally when spoken and followed.
  collectSentences() {
    const lines = [];
    const seen = {};
    const weeks = U.allWeeks().filter((wk) => wk.week <= Store.state.currentWeek);
    weeks.reverse().forEach((wk) => {
      const sample = (wk.words && wk.words[0]) || null;
      (wk.sentences || []).forEach((raw, i) => {
        const text = this.fill(raw, sample ? sample.word : 'this');
        if (seen[text]) return;
        seen[text] = true;
        const zhRaw = (wk.sentencesZh || [])[i] || '';
        const zh = this.fill(zhRaw, sample ? sample.zh : '这个');
        lines.push({ text, zh });
      });
    });
    return lines.slice(0, 12);
  },

  // fill swaps every ___ placeholder for a concrete word.
  fill(text, word) {
    return text.replace(/_+/g, word);
  },

  sentenceCard() {
    const line = this.lines[this.senIndex];
    const isLast = this.senIndex === this.lines.length - 1;
    const follow = FollowRead.supported();
    U.app().innerHTML = `
      <header class="topbar">
        <button class="chip btn-back" onclick="ABC.menu()">‹</button>
        <div class="chip">${this.senIndex + 1} / ${this.lines.length}</div>
        <div class="chip">💬</div>
      </header>
      <main class="screen flash-screen">
        <div class="sentence-card" onclick="TTS.speak('${jsStr(line.text)}')">
          <div class="sentence-text">${U.esc(line.text)}</div>
          <div class="sentence-zh">${U.esc(line.zh)}</div>
          <div class="flash-sound">🔊 Tap to hear</div>
        </div>
        ${follow ? '<div class="follow-area" id="follow-area"></div>' : ''}
        <div class="flash-actions">
          <button class="btn-round" onclick="ABC.sentencePrev()" aria-label="previous">⬅️</button>
          <button class="btn-round" onclick="TTS.speak('${jsStr(line.text)}')"
            aria-label="say it">🔊</button>
          <button class="btn-round big" onclick="ABC.sentenceNext()"
            aria-label="next">${isLast ? '🏁' : '➡️'}</button>
        </div>
      </main>`;
    window.scrollTo(0, 0);
    TTS.speak(line.text);
    if (follow) {
      FollowRead.mount('follow-area', line.text, { onPass: null, onDegrade: null });
    }
  },

  sentencePrev() {
    if (this.senIndex > 0) {
      FollowRead.cancel();
      this.senIndex -= 1;
      this.sentenceCard();
    }
  },

  sentenceNext() {
    FollowRead.cancel();
    if (this.senIndex < this.lines.length - 1) {
      this.senIndex += 1;
      this.sentenceCard();
      return;
    }
    this.finish(this.lines.length, this.lines.length, 'Say It!');
  },

  // ---- shared finish screen ----

  finish(score, total, label) {
    const log = U.markActive();
    log.played = true;
    Store.save();
    U.addStars(2);
    SFX.win();
    confetti(60);
    U.app().innerHTML = `
      <main class="screen done-screen">
        <div class="done-emoji">🎉</div>
        <div class="done-title">${U.esc(label)} done!</div>
        <div class="done-sub">${score} / ${total} · ⭐ ${Store.state.stars}</div>
        <button class="btn-primary" onclick="ABC.menu()">🔤 More ABC</button>
        <button class="btn-ghost" onclick="nav('today')">🏠 Home</button>
      </main>`;
  },
};
