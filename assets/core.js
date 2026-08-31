// An English · Core module: state storage, TTS, sound effects, utils

const STORAGE_KEY = 'an-english-v1';

const DEFAULT_STATE = {
  currentWeek: 1,
  stars: 0,
  streak: { last: null, days: 0 },
  words: {},
  dailyLog: {},
  settings: {
    newPerDay: 6,
    reviewPerDay: 4,
    rate: 0.85,
    sfx: true,
    // reward lets parents turn stars into a real-world treat: name + star
    // cost; start marks the star count when the current cycle began.
    reward: { name: '', cost: 50, start: 0, claimed: 0 },
  },
};

// Store persists all learning progress in localStorage.
const Store = {
  state: null,

  load() {
    let restored = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to load progress, starting fresh.', err);
    }
    this.state = Object.assign({}, DEFAULT_STATE, restored || {});
    this.state.settings = Object.assign({}, DEFAULT_STATE.settings, this.state.settings);
    // deep-merge reward so later edits never leak into DEFAULT_STATE
    this.state.settings.reward = Object.assign(
      {},
      DEFAULT_STATE.settings.reward,
      this.state.settings.reward || {},
    );
    this.state.streak = Object.assign({}, DEFAULT_STATE.streak, this.state.streak);
    this.state.words = this.state.words || {};
    this.state.dailyLog = this.state.dailyLog || {};
    return this.state;
  },

  save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Failed to save progress.', err);
    }
  },

  reset() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.save();
  },
};

// silentWavUri builds a tiny in-memory silent WAV; playing it once inside a
// user gesture unlocks <audio> playback on iOS for the TTS fallback below.
function silentWavUri() {
  const bytes = [
    0x52, 0x49, 0x46, 0x46, 0x2C, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, // RIFF....WAVE
    0x66, 0x6D, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, // fmt, PCM mono
    0x40, 0x1F, 0x00, 0x00, 0x40, 0x1F, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, // 8000Hz 8-bit
    0x64, 0x61, 0x74, 0x61, 0x08, 0x00, 0x00, 0x00, // data
    0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, // 1ms of silence
  ];
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'data:audio/wav;base64,' + window.btoa(bin);
}

// TTS speaks words aloud. It prefers the built-in speechSynthesis voice and
// falls back to an online dictionary voice once the engine proves missing
// or silent - common on Android browsers viewing local file:// pages, where
// the API exists but no speech engine is actually wired up. Chinese goes
// through its own chain (system zh voice -> XFYun synthesis -> dictionary).
const TTS = {
  voice: null,
  zhVoice: null,
  warm: false,
  current: null,
  useAudio: false,
  useAudioZh: false,
  audioEl: null,
  blobUrl: null,

  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const all = window.speechSynthesis.getVoices();
      const zhVoices = all.filter((v) => /^zh/i.test(v.lang));
      // many Android ROMs ship only a Chinese engine - perfect for glosses
      this.zhVoice = zhVoices.find((v) => /zh[-_]cn/i.test(v.lang)) || zhVoices[0] || null;
      const voices = all.filter((v) => v.lang.indexOf('en') === 0);
      if (!voices.length) return;
      const preferred = [
        /Samantha/i, /Google US English/i, /Karen/i, /Moira/i, /Sue/i,
        /Ava/i, /Zira/i, /Female/i,
      ];
      for (const re of preferred) {
        const hit = voices.find((v) => re.test(v.name));
        if (hit) { this.voice = hit; return; }
      }
      this.voice = voices.find((v) => v.lang === 'en-US') || voices[0];
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  },

  // warmUp must run inside a user gesture on iOS before any speech works.
  warmUp() {
    if (this.warm) return;
    this.warm = true;
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch (err) {
      console.warn('TTS warm-up failed.', err);
    }
    this.unlockAudio();
  },

  // unlockAudio plays a silent clip once so iOS lets the shared <audio>
  // element start playback outside of a direct tap.
  unlockAudio() {
    try {
      if (!this.audioEl) this.audioEl = new Audio(silentWavUri());
      const playing = this.audioEl.play();
      if (playing && playing.catch) playing.catch(() => {});
    } catch (err) {
      console.warn('Audio unlock failed.', err);
    }
  },

  // speak reads English aloud. Pass opts.excited for a higher-pitched,
  // slightly faster cheer - used on the victory screens so the praise sounds
  // genuinely thrilled rather than flat.
  speak(text, onEnd, opts) {
    const excited = !!(opts && opts.excited);
    if (this.useAudio || !('speechSynthesis' in window)) {
      this.speakViaAudio(text, onEnd, excited);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice ? this.voice.lang : 'en-US';
    u.rate = excited ? Math.min(1.15, Store.state.settings.rate + 0.15) : Store.state.settings.rate;
    u.pitch = excited ? 1.35 : 1.05;
    u.volume = 1;
    let started = false;
    u.onstart = () => { started = true; };
    u.onend = () => {
      if (this.current !== u) return; // superseded by a newer utterance
      // Ending without ever starting means the engine is mute.
      if (!started) {
        this.fallback(text, onEnd, excited);
        return;
      }
      if (onEnd) onEnd();
    };
    u.onerror = () => {
      if (this.current !== u) return;
      this.fallback(text, onEnd, excited);
    };
    this.current = u; // keep a reference so iOS does not GC it mid-speech
    window.speechSynthesis.speak(u);
    // Some Android engines never fire any event at all; give them a moment.
    setTimeout(() => {
      if (!started && this.current === u) this.fallback(text, onEnd, excited);
    }, 3000);
  },

  // stop silences any speech in flight; used before follow-read recording so
  // the app's own voice does not leak into the microphone.
  stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.audioEl) this.audioEl.pause();
  },

  // fallback switches to the online voice for good once the built-in
  // engine proves broken or silent.
  fallback(text, onEnd, excited) {
    this.useAudio = true;
    window.speechSynthesis.cancel();
    this.speakViaAudio(text, onEnd, excited);
  },

  // speakViaAudio plays an online dictionary voice (US English) through a
  // shared <audio> element. It needs the network but works everywhere,
  // including Android browsers whose speechSynthesis stays silent. The online
  // voice cannot change pitch, so an excited cheer only speeds up a touch.
  speakViaAudio(text, onEnd, excited) {
    this.playAudio('https://dict.youdao.com/dictvoice?type=2&audio=' + encodeURIComponent(text), onEnd);
    if (this.audioEl) {
      this.audioEl.playbackRate = excited ? 1.12 : Store.state.settings.rate;
    }
  },

  // playAudio runs one clip through the shared <audio> element at natural
  // speed; failures surface via onEnd so flows are never left hanging.
  playAudio(src, onEnd) {
    if (!this.audioEl) this.audioEl = new Audio();
    const audio = this.audioEl;
    if (this.blobUrl && this.blobUrl !== src) {
      URL.revokeObjectURL(this.blobUrl); // release the previous synthesis clip
      this.blobUrl = null;
    }
    audio.pause();
    audio.onended = onEnd || null;
    audio.onerror = onEnd || null;
    audio.playbackRate = 1;
    audio.src = src;
    const playing = audio.play();
    if (playing && playing.catch) {
      playing.catch((err) => console.warn('Audio playback failed.', err));
    }
  },

  // speakZh reads a Chinese gloss aloud. Mirrors the English chain: system
  // voices first (Android ROMs often ship a Chinese engine even when the
  // English one is mute), then XFYun synthesis, then a dictionary clip.
  // Devices without any zh voice skip straight online instead of waiting
  // out the mute-detection timeout.
  speakZh(text, onEnd) {
    const hasZhEngine = 'speechSynthesis' in window
      && (this.zhVoice || window.speechSynthesis.getVoices().some((v) => /^zh/i.test(v.lang)));
    if (this.useAudioZh || !hasZhEngine) {
      this.speakZhOnline(text, onEnd);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.zhVoice ? this.zhVoice.lang : 'zh-CN';
    if (this.zhVoice) u.voice = this.zhVoice;
    u.rate = 0.95;
    let started = false;
    u.onstart = () => { started = true; };
    u.onend = () => {
      if (this.current !== u) return;
      if (!started) {
        this.fallbackZh(text, onEnd);
        return;
      }
      if (onEnd) onEnd();
    };
    u.onerror = () => {
      if (this.current !== u) return;
      this.fallbackZh(text, onEnd);
    };
    this.current = u;
    window.speechSynthesis.speak(u);
    setTimeout(() => {
      if (!started && this.current === u) this.fallbackZh(text, onEnd);
    }, 3000);
  },

  // fallbackZh switches Chinese to the online chain for good.
  fallbackZh(text, onEnd) {
    this.useAudioZh = true;
    window.speechSynthesis.cancel();
    this.speakZhOnline(text, onEnd);
  },

  // speakZhOnline prefers XFYun synthesis (any text, natural voice); if the
  // service is unavailable it falls back to the dictionary clip, which
  // covers only part of the vocabulary.
  speakZhOnline(text, onEnd) {
    XfTts.speak(text)
      .then((url) => {
        this.blobUrl = url;
        this.playAudio(url, onEnd);
      })
      .catch(() => this.speakZhDict(text, onEnd));
  },

  // speakZhDict is the last resort - the dictionary hosts clips for only
  // about 40% of our glosses, so some words stay silent here.
  speakZhDict(text, onEnd) {
    this.playAudio('https://dict.youdao.com/dictvoice?type=2&audio=' + encodeURIComponent(text), onEnd);
  },
};

// SFX synthesizes tiny game sounds with Web Audio; no audio files needed.
//
// Every effect is described as a list of "voices" (a tone, a bell, or a
// sustained fanfare note) and rendered through a single play() call. This is
// the key fix for Android: the whole effect shares ONE base start time that
// is only computed after the context has actually resumed, so notes with a
// delay keep their exact relative spacing. The old code called a fresh
// scheduleBase() per note, and because Android resumes the context
// asynchronously the base drifted between notes - the first note (the "ding")
// landed inside the wake-up gap and got swallowed, leaving only the second.
const SFX = {
  ctx: null,

  ensure() {
    if (!Store.state.settings.sfx) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  },

  // play renders a whole effect. It resumes the context first, then anchors
  // every voice to one shared base time so an effect always sounds as one
  // continuous phrase - never a note dropped mid-way. A generous lead keeps
  // the opening note clear of the Android wake-up gap.
  play(voices) {
    const ctx = this.ensure();
    if (!ctx) return;
    const render = () => {
      const lead = ctx.state === 'suspended' ? 0.18 : 0.06;
      const base = ctx.currentTime + lead;
      voices.forEach((voice) => this.renderVoice(ctx, base, voice));
    };
    if (ctx.state === 'suspended') {
      const resumed = ctx.resume();
      if (resumed && resumed.then) {
        resumed.then(render).catch(render);
        return;
      }
    }
    render();
  },

  // renderVoice draws one voice of an effect at base + its own delay.
  renderVoice(ctx, base, voice) {
    if (voice.kind === 'bell') {
      this.renderBell(ctx, base, voice);
      return;
    }
    if (voice.kind === 'fanfare') {
      this.renderFanfare(ctx, base, voice);
      return;
    }
    this.renderTone(ctx, base, voice);
  },

  // renderTone draws a plain oscillator note.
  renderTone(ctx, base, voice) {
    const startAt = base + (voice.delay || 0);
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = voice.type || 'sine';
    osc.frequency.value = voice.freq;
    vol.gain.setValueAtTime(0.0001, startAt);
    vol.gain.exponentialRampToValueAtTime(voice.gain || 0.12, startAt + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, startAt + voice.duration);
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + voice.duration + 0.05);
  },

  // renderBell rings a bell-like ding: a fundamental plus inharmonic
  // partials, each fading at its own speed.
  renderBell(ctx, base, voice) {
    const startAt = base + (voice.delay || 0);
    const partials = [
      [voice.freq, 1, 1],
      [voice.freq * 2, 0.4, 0.55],
      [voice.freq * 2.76, 0.22, 0.35],
    ];
    partials.forEach(([f, g, decay]) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      vol.gain.setValueAtTime(0.0001, startAt);
      vol.gain.exponentialRampToValueAtTime((voice.gain || 0.14) * g, startAt + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + decay + 0.05);
    });
  },

  // renderFanfare holds one brassy sawtooth note with vibrato - the
  // triumphant long note at the end of a fanfare.
  renderFanfare(ctx, base, voice) {
    const startAt = base + (voice.delay || 0);
    const dur = voice.duration;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = voice.freq;
    lfo.frequency.value = 6.5;
    lfoGain.gain.value = voice.freq * 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const peak = voice.gain || 0.12;
    vol.gain.setValueAtTime(0.0001, startAt);
    vol.gain.exponentialRampToValueAtTime(peak, startAt + 0.03);
    vol.gain.setValueAtTime(peak, startAt + dur - 0.1);
    vol.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
    lfo.start(startAt);
    lfo.stop(startAt + dur + 0.05);
  },

  // correct is an exciting little victory fanfare: a bright rising run of
  // notes that bursts into a triumphant sustained chord topped with a
  // sparkling bell - a big, thrilling "you did it!" that gets kids pumped.
  correct() {
    this.play([
      // rising run - quick, bright, building anticipation
      { freq: 784, duration: 0.1, delay: 0, gain: 0.1, type: 'square' },
      { freq: 988, duration: 0.1, delay: 0.09, gain: 0.1, type: 'square' },
      { freq: 1175, duration: 0.1, delay: 0.18, gain: 0.1, type: 'square' },
      // triumphant sustained major chord - the big payoff
      { kind: 'fanfare', freq: 1568, duration: 0.6, delay: 0.28, gain: 0.09 },
      { kind: 'fanfare', freq: 1976, duration: 0.6, delay: 0.28, gain: 0.07 },
      { kind: 'fanfare', freq: 2349, duration: 0.6, delay: 0.28, gain: 0.05 },
      // sparkling bell on top for that celebratory shimmer
      { kind: 'bell', freq: 3136, delay: 0.28, gain: 0.08 },
    ]);
  },

  wrong() {
    this.play([{ freq: 196, duration: 0.22, delay: 0, gain: 0.07 }]);
  },

  // readPass is a punchy ta-da: a small chord answered by a big sustained
  // chord with a bell on top - an instant "you got it!" moment. It doubles
  // as the correct-answer sound for Listen & Tap.
  readPass() {
    const voices = [
      { freq: 523, duration: 0.14, delay: 0, gain: 0.09, type: 'square' },
      { freq: 659, duration: 0.14, delay: 0, gain: 0.09, type: 'square' },
      { freq: 784, duration: 0.14, delay: 0, gain: 0.09, type: 'square' },
      { freq: 1046, duration: 1, delay: 0.16, gain: 0.055, type: 'square' },
      { freq: 1319, duration: 1, delay: 0.16, gain: 0.055, type: 'square' },
      { freq: 1568, duration: 1, delay: 0.16, gain: 0.055, type: 'square' },
      { kind: 'bell', freq: 2093, delay: 0.16, gain: 0.07 },
    ];
    this.play(voices);
  },

  // readFail is an urgent two-tone alarm, strong like a little warning siren
  // but short enough that it never scares anyone.
  readFail() {
    this.play([
      { freq: 784, duration: 0.12, delay: 0, gain: 0.09, type: 'square' },
      { freq: 523, duration: 0.12, delay: 0.15, gain: 0.09, type: 'square' },
      { freq: 784, duration: 0.12, delay: 0.3, gain: 0.09, type: 'square' },
      { freq: 523, duration: 0.16, delay: 0.45, gain: 0.09, type: 'square' },
    ]);
  },

  star() {
    this.play([
      { freq: 880, duration: 0.1, delay: 0 },
      { freq: 1109, duration: 0.1, delay: 0.1 },
      { freq: 1319, duration: 0.22, delay: 0.2 },
    ]);
  },

  // win is a big, rousing victory fanfare: a rising bugle run, a triumphant
  // major chord stab, then two long brassy notes climbing to a high hold,
  // sparkling bells on top - the kind of blast that makes a kid cheer.
  win() {
    this.play([
      { freq: 523, duration: 0.12, delay: 0, gain: 0.11, type: 'square' },
      { freq: 659, duration: 0.12, delay: 0.12, gain: 0.11, type: 'square' },
      { freq: 784, duration: 0.12, delay: 0.24, gain: 0.11, type: 'square' },
      { freq: 1046, duration: 0.16, delay: 0.36, gain: 0.12, type: 'square' },
      { freq: 523, duration: 0.24, delay: 0.52, gain: 0.09, type: 'square' },
      { freq: 659, duration: 0.24, delay: 0.52, gain: 0.09, type: 'square' },
      { freq: 784, duration: 0.24, delay: 0.52, gain: 0.09, type: 'square' },
      { kind: 'fanfare', freq: 784, duration: 0.5, delay: 0.78, gain: 0.12 },
      { kind: 'fanfare', freq: 1046, duration: 1.1, delay: 1.24, gain: 0.13 },
      { kind: 'bell', freq: 1568, delay: 0.78, gain: 0.07 },
      { kind: 'bell', freq: 2093, delay: 1.24, gain: 0.08 },
    ]);
  },

  flip() {
    this.play([{ freq: 520, duration: 0.06, delay: 0, gain: 0.06 }]);
  },
};

// U holds small shared helpers.
const U = {
  el(id) {
    return document.getElementById(id);
  },

  app() {
    return document.getElementById('app');
  },

  esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  todayStr() {
    return new Date().toISOString().slice(0, 10);
  },

  yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  },

  allWeeks() {
    return LEARNING_DATA.phases[0].weeks;
  },

  weekData(weekNo) {
    return this.allWeeks().find((w) => w.week === weekNo);
  },

  // wordItem prefers the current week's meaning for words that recur
  // across themes (e.g. orange the fruit vs orange the color).
  wordItem(word) {
    const current = this.weekData(Store.state.currentWeek);
    if (current) {
      const hit = current.words.find((w) => w.word === word);
      if (hit) return hit;
    }
    for (const wk of this.allWeeks()) {
      const hit = wk.words.find((w) => w.word === word);
      if (hit) return hit;
    }
    return null;
  },

  // allUniqueWords returns de-duplicated word items of the whole phase.
  allUniqueWords() {
    const seen = {};
    const list = [];
    for (const wk of this.allWeeks()) {
      for (const w of wk.words) {
        if (!seen[w.word]) {
          seen[w.word] = true;
          list.push(w);
        }
      }
    }
    return list;
  },

  learnedWords() {
    return this.allUniqueWords().filter((w) => Store.state.words[w.word]);
  },

  learnedCountInWeek(weekNo) {
    const wk = this.weekData(weekNo);
    if (!wk) return 0;
    return wk.words.filter((w) => Store.state.words[w.word]).length;
  },

  isWeekComplete(weekNo) {
    const wk = this.weekData(weekNo);
    return !!wk && wk.words.length > 0 && wk.words.every((w) => Store.state.words[w.word]);
  },

  mastery(word) {
    const r = Store.state.words[word];
    if (!r) return 0;
    if (r.ok >= 2 && r.seen >= 4) return 3;
    if (r.ok >= 1) return 2;
    return 1;
  },

  recordSeen(word) {
    const r = Store.state.words[word] || (Store.state.words[word] = { seen: 0, ok: 0, err: 0 });
    r.seen += 1;
    Store.save();
  },

  recordOk(word) {
    const r = Store.state.words[word] || (Store.state.words[word] = { seen: 0, ok: 0, err: 0 });
    r.ok += 1;
    Store.save();
  },

  recordErr(word) {
    const r = Store.state.words[word] || (Store.state.words[word] = { seen: 0, ok: 0, err: 0 });
    r.err += 1;
    Store.save();
  },

  // markActive refreshes the daily streak and returns today's log entry.
  markActive() {
    const t = this.todayStr();
    if (Store.state.streak.last !== t) {
      Store.state.streak.days = Store.state.streak.last === this.yesterdayStr()
        ? Store.state.streak.days + 1
        : 1;
      Store.state.streak.last = t;
    }
    if (!Store.state.dailyLog[t]) Store.state.dailyLog[t] = { stars: 0, learned: false, played: false };
    Store.save();
    return Store.state.dailyLog[t];
  },

  addStars(count) {
    Store.state.stars += count;
    const log = this.markActive();
    log.stars += count;
    Store.save();
    SFX.star();
  },

  todayLog() {
    return Store.state.dailyLog[this.todayStr()] || { stars: 0, learned: false, played: false };
  },

  // emojiFace returns the display face of a word item:
  // emoji itself, a position scene, a hand-drawn art, or a letter-card fallback.
  face(item, sizeClass) {
    if (item.scene) return this.sceneSVG(item.scene, sizeClass);
    if (item.art) return this.artSVG(item.art, sizeClass);
    if (item.emoji) return `<span class="face-emoji">${item.emoji}</span>`;
    const letter = item.word.charAt(0).toUpperCase();
    const hues = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7', '#B197FC', '#F783AC'];
    const hue = hues[item.word.charCodeAt(0) % hues.length];
    return `<span class="face-letter" style="background:${hue}">${letter}</span>`;
  },

  // sceneSVG draws a cat + box scene to teach position words.
  sceneSVG(kind, sizeClass) {
    const box = '<rect x="60" y="70" width="80" height="60" rx="8" fill="#C99A5B"/>'
      + '<rect x="60" y="70" width="80" height="14" rx="7" fill="#A87B43"/>';
    const pos = {
      in: '<text x="100" y="112" font-size="34">🐱</text>',
      on: '<text x="100" y="66" font-size="34">🐱</text>',
      under: '<text x="100" y="150" font-size="34">🐱</text>',
      next: '<text x="28" y="112" font-size="34">🐱</text>',
      behind: '<text x="100" y="86" font-size="30" opacity="0.55">🐱</text>',
      front: '<text x="100" y="140" font-size="38">🐱</text>',
    }[kind] || '';
    const order = kind === 'behind' ? pos + box : box + pos;
    return `<span class="face-scene ${sizeClass || ''}">`
      + `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">${order}</svg>`
      + '</span>';
  },

  // artSVG wraps a hand-drawn illustration for words without a fitting emoji.
  artSVG(kind, sizeClass) {
    const art = ART[kind];
    if (!art) return `<span class="face-emoji">${kind}</span>`;
    return `<span class="face-scene ${sizeClass || ''}">`
      + `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">${art}</svg>`
      + '</span>';
  },

  poke() {
    SFX.flip();
    const cheers = ['Great job!', 'You can do it!', 'Let us learn!', 'Super!', 'Well done!'];
    const line = cheers[Math.floor(Math.random() * cheers.length)];
    TTS.speak(line);
    const m = document.querySelector('.mascot');
    if (m) {
      m.classList.remove('wiggle');
      void m.offsetWidth;
      m.classList.add('wiggle');
    }
  },
};

// ART holds hand-drawn SVG illustrations for words that have no fitting emoji
// (body parts without a symbol, verbs, and concepts like open/close).
const SKIN = '#FFD9B3';
const HAIR = '#8B5A2B';
const MOUTH = '#C77B4A';
const GROUND = '<line x1="24" y1="146" x2="176" y2="146" stroke="#B8AE9C" '
  + 'stroke-width="5" stroke-linecap="round"/>';

const ART = {
  // head: a smiling boy face
  head: '<circle cx="100" cy="88" r="50" fill="' + SKIN + '"/>'
    + '<path d="M50 84 Q54 30 100 28 Q146 30 150 84 Q136 56 100 52 Q64 56 50 84Z" fill="' + HAIR + '"/>'
    + '<circle cx="83" cy="88" r="5" fill="#333333"/>'
    + '<circle cx="117" cy="88" r="5" fill="#333333"/>'
    + '<path d="M86 110 Q100 121 114 110" stroke="' + MOUTH + '" stroke-width="4" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<circle cx="70" cy="100" r="6" fill="#FFB3B3" opacity="0.7"/>'
    + '<circle cx="130" cy="100" r="6" fill="#FFB3B3" opacity="0.7"/>',

  // hair: a small face under big fluffy hair
  hair: '<path d="M42 92 Q28 26 100 20 Q172 26 158 92 Q150 58 132 66 Q142 40 112 52 '
    + 'Q118 30 96 46 Q92 26 76 50 Q58 38 68 66 Q50 58 42 92Z" fill="#E8A33D"/>'
    + '<circle cx="100" cy="102" r="38" fill="' + SKIN + '"/>'
    + '<circle cx="88" cy="100" r="4" fill="#333333"/>'
    + '<circle cx="112" cy="100" r="4" fill="#333333"/>'
    + '<path d="M91 116 Q100 123 109 116" stroke="' + MOUTH + '" stroke-width="3.5" '
    + 'fill="none" stroke-linecap="round"/>',

  // eyebrows: a face with thick highlighted eyebrows
  eyebrows: '<circle cx="100" cy="92" r="50" fill="' + SKIN + '"/>'
    + '<path d="M52 60 Q100 30 148 60 Q100 42 52 60Z" fill="' + HAIR + '"/>'
    + '<path d="M62 84 Q76 70 92 80" stroke="#4A2F17" stroke-width="10" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M108 80 Q124 70 138 84" stroke="#4A2F17" stroke-width="10" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<circle cx="83" cy="102" r="5" fill="#333333"/>'
    + '<circle cx="117" cy="102" r="5" fill="#333333"/>'
    + '<path d="M86 122 Q100 132 114 122" stroke="' + MOUTH + '" stroke-width="4" '
    + 'fill="none" stroke-linecap="round"/>',

  // back: a kid seen from behind - the whole head is hair (no face), the
  // ears stick out and a spine crease runs down the shirt.
  back: '<circle cx="74" cy="48" r="6" fill="' + SKIN + '"/>'
    + '<circle cx="126" cy="48" r="6" fill="' + SKIN + '"/>'
    + '<circle cx="100" cy="44" r="23" fill="' + HAIR + '"/>'
    + '<path d="M90 30 Q100 24 110 30 M84 42 Q100 36 116 42" stroke="#A9763B" '
    + 'stroke-width="3" fill="none" stroke-linecap="round"/>'
    + '<rect x="93" y="62" width="14" height="24" fill="' + SKIN + '"/>'
    + '<path d="M60 100 Q100 80 140 100 L146 150 L54 150Z" fill="#4CC9F0"/>'
    + '<path d="M60 100 Q100 80 140 100 L141 114 L59 114Z" fill="#3AA8CC"/>'
    + '<path d="M100 108 L100 142" stroke="#2FA8CC" stroke-width="3.5" stroke-linecap="round"/>'
    + '<path d="M62 104 Q50 126 58 148" stroke="' + SKIN + '" stroke-width="9" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M138 104 Q150 126 142 148" stroke="' + SKIN + '" stroke-width="9" '
    + 'fill="none" stroke-linecap="round"/>',

  // shoulders: a kid with hands on hips - the posture spreads the shoulders
  // wide and red rings highlight both shoulder tips.
  shoulders: '<circle cx="100" cy="42" r="19" fill="' + SKIN + '"/>'
    + '<path d="M81 36 Q100 22 119 36 Q100 28 81 36Z" fill="' + HAIR + '"/>'
    + '<circle cx="93" cy="44" r="3" fill="#333333"/>'
    + '<circle cx="107" cy="44" r="3" fill="#333333"/>'
    + '<path d="M93 52 Q100 57 107 52" stroke="' + MOUTH + '" stroke-width="3" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<rect x="94" y="58" width="12" height="42" fill="' + SKIN + '"/>'
    + '<path d="M58 96 Q100 78 142 96 L146 150 L54 150Z" fill="#69DB7C"/>'
    + '<path d="M58 96 Q100 78 142 96 L142 108 L58 108Z" fill="#4DABF7"/>'
    + '<path d="M60 102 Q46 118 84 130" stroke="' + SKIN + '" stroke-width="9" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M140 102 Q154 118 116 130" stroke="' + SKIN + '" stroke-width="9" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<circle cx="60" cy="97" r="9" fill="none" stroke="#FF6B6B" stroke-width="3.5"/>'
    + '<circle cx="140" cy="97" r="9" fill="none" stroke="#FF6B6B" stroke-width="3.5"/>',

  // jump: a stick child mid-air with arms up
  jump: GROUND
    + '<ellipse cx="100" cy="146" rx="28" ry="5" fill="#3A3226" opacity="0.12"/>'
    + '<path d="M55 34 Q64 14 78 8" stroke="#B197FC" stroke-width="3" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M145 34 Q136 14 122 8" stroke="#B197FC" stroke-width="3" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<circle cx="100" cy="42" r="17" fill="' + SKIN + '"/>'
    + '<path d="M100 59 L100 98" stroke="#FF6B6B" stroke-width="11" stroke-linecap="round"/>'
    + '<path d="M100 70 L72 50" stroke="#FF6B6B" stroke-width="8" stroke-linecap="round"/>'
    + '<path d="M100 70 L128 50" stroke="#FF6B6B" stroke-width="8" stroke-linecap="round"/>'
    + '<path d="M100 98 L80 122" stroke="#4CC9F0" stroke-width="9" stroke-linecap="round"/>'
    + '<path d="M100 98 L120 122" stroke="#4CC9F0" stroke-width="9" stroke-linecap="round"/>',

  // sit: a stick child sitting on a stool
  sit: GROUND
    + '<rect x="108" y="96" width="58" height="14" rx="5" fill="#C99A5B"/>'
    + '<rect x="116" y="110" width="9" height="36" fill="#A87B43"/>'
    + '<rect x="149" y="110" width="9" height="36" fill="#A87B43"/>'
    + '<circle cx="96" cy="54" r="17" fill="' + SKIN + '"/>'
    + '<path d="M72 38 Q80 28 96 28 Q108 32 112 42 Q96 32 76 44Z" fill="' + HAIR + '"/>'
    + '<path d="M96 71 L96 106" stroke="#69DB7C" stroke-width="11" stroke-linecap="round"/>'
    + '<path d="M96 106 L124 100" stroke="#4CC9F0" stroke-width="9" stroke-linecap="round"/>'
    + '<path d="M124 100 L124 144" stroke="#4CC9F0" stroke-width="8" stroke-linecap="round"/>'
    + '<path d="M96 80 L76 96" stroke="#69DB7C" stroke-width="8" stroke-linecap="round"/>',

  // squat: a stick child in a deep squat, arms forward
  squat: GROUND
    + '<circle cx="92" cy="66" r="16" fill="' + SKIN + '"/>'
    + '<path d="M92 82 Q102 98 96 112" stroke="#FF922B" stroke-width="11" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M96 112 L126 112 L126 144" stroke="#4CC9F0" stroke-width="9" '
    + 'fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M96 112 L72 130" stroke="#4CC9F0" stroke-width="8" stroke-linecap="round"/>'
    + '<path d="M100 92 L128 98" stroke="#FF922B" stroke-width="8" stroke-linecap="round"/>',

  // open: a door swung open with light behind it
  open: '<rect x="62" y="34" width="86" height="112" rx="4" fill="#EFE6D2" '
    + 'stroke="#C9BCA4" stroke-width="4"/>'
    + '<path d="M70 138 L70 42 L140 30 L140 138Z" fill="#FFF6D8"/>'
    + '<path d="M74 134 Q86 116 88 98" stroke="#FFE58A" stroke-width="4" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M70 140 L70 46 L24 60 L24 154Z" fill="#C99A5B" stroke="#A87B43" '
    + 'stroke-width="3" stroke-linejoin="round"/>'
    + '<circle cx="32" cy="104" r="5" fill="#5B3A1E"/>',

  // close: the same door shut
  close: '<rect x="62" y="34" width="86" height="112" rx="4" fill="#EFE6D2" '
    + 'stroke="#C9BCA4" stroke-width="4"/>'
    + '<rect x="70" y="42" width="70" height="96" rx="3" fill="#C99A5B" '
    + 'stroke="#A87B43" stroke-width="3"/>'
    + '<rect x="82" y="54" width="46" height="36" rx="3" fill="#B8874D"/>'
    + '<path d="M82 72 L128 72" stroke="#A87B43" stroke-width="3"/>'
    + '<circle cx="130" cy="94" r="5" fill="#5B3A1E"/>',

  // table: a wooden table with an apple and a cup on it
  table: GROUND
    + '<rect x="34" y="78" width="132" height="15" rx="6" fill="#C99A5B"/>'
    + '<rect x="48" y="93" width="11" height="53" fill="#A87B43"/>'
    + '<rect x="141" y="93" width="11" height="53" fill="#A87B43"/>'
    + '<circle cx="82" cy="66" r="13" fill="#FF6B6B"/>'
    + '<path d="M82 54 Q86 46 93 46" stroke="#69DB7C" stroke-width="3.5" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M110 78 L124 78 L122 62 L112 62Z" fill="#E3F5FC" stroke="#7FC4DC" '
    + 'stroke-width="3" stroke-linejoin="round"/>',

  // thirsty: a thirsty face with sweat drops wishing for a glass of water
  thirsty: '<circle cx="66" cy="74" r="30" fill="' + SKIN + '"/>'
    + '<path d="M38 60 Q42 36 66 34 Q90 36 94 60 Q82 46 66 48 Q50 46 38 60Z" '
    + 'fill="' + HAIR + '"/>'
    + '<path d="M54 76 L78 76" stroke="#333333" stroke-width="4" stroke-linecap="round"/>'
    + '<path d="M58 92 Q66 88 74 92" stroke="' + MOUTH + '" stroke-width="4" '
    + 'fill="none" stroke-linecap="round"/>'
    + '<path d="M100 52 Q95 62 100 67 Q105 62 100 52Z" fill="#4CC9F0"/>'
    + '<path d="M92 72 Q88 80 92 84 Q96 80 92 72Z" fill="#4CC9F0"/>'
    + '<circle cx="104" cy="94" r="4" fill="#FFFFFF" stroke="#D8CDB8" stroke-width="2"/>'
    + '<circle cx="114" cy="82" r="6" fill="#FFFFFF" stroke="#D8CDB8" stroke-width="2"/>'
    + '<path d="M136 62 L162 62 L157 120 Q156 127 149 127 Q142 127 141 120Z" '
    + 'fill="#E3F5FC" stroke="#7FC4DC" stroke-width="3" stroke-linejoin="round"/>'
    + '<path d="M142 78 L156 78 L153 116 Q152 120 149 120 Q146 120 145 116Z" fill="#4CC9F0"/>',
};

// confetti drops a short burst of colorful pieces over the screen.
function confetti(count) {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const colors = ['#FF6B6B', '#FFD43B', '#69DB7C', '#4DABF7', '#B197FC', '#FF922B'];
  const total = count || 26;
  for (let i = 0; i < total; i += 1) {
    const p = document.createElement('i');
    p.className = 'confetti-piece';
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}
