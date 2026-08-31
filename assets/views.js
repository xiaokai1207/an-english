// An English · Views: hash router, Today screen, Words book, Parents hub

const NAV_ITEMS = [
  { id: 'today', icon: '🏠', label: 'Home' },
  { id: 'learn', icon: '📖', label: 'Learn' },
  { id: 'abc', icon: '🔤', label: 'ABC' },
  { id: 'play', icon: '🎮', label: 'Play' },
  { id: 'words', icon: '📚', label: 'Words' },
  { id: 'parents', icon: '🔒', label: 'Grown-ups' },
];

function nav(view) {
  window.location.hash = `#${view}`;
}

function renderNav(active) {
  const buttons = NAV_ITEMS.map((item) => (
    `<button class="navbtn ${item.id === active ? 'active' : ''}" onclick="nav('${item.id}')">`
    + `<span class="navbtn-icon">${item.icon}</span><span class="navbtn-label">${item.label}</span>`
    + '</button>'
  )).join('');
  return `<nav class="navbar">${buttons}</nav>`;
}

function render() {
  const hash = window.location.hash.replace('#', '') || 'today';
  const app = U.app();
  if (hash === 'learn') {
    Learn.start();
  } else if (hash === 'abc') {
    ABC.menu();
  } else if (hash === 'play') {
    Games.menu();
  } else if (hash === 'words') {
    app.innerHTML = Views.words() + renderNav('words');
    window.scrollTo(0, 0);
  } else if (hash === 'parents') {
    Views.parents();
  } else {
    app.innerHTML = Views.today() + renderNav('today');
    window.scrollTo(0, 0);
  }
}

const Views = {
  // today renders the home screen for the child.
  today() {
    const st = Store.state;
    const wk = U.weekData(st.currentWeek);
    const learned = U.learnedCountInWeek(st.currentWeek);
    const total = wk.words.length;
    const done = total > 0 && learned >= total;
    const log = U.todayLog();
    const newLeft = wk.words.filter((w) => !st.words[w.word]).length;

    let weekAction;
    if (wk.review && U.learnedWords().length === 0) {
      weekAction = '<div class="hint">Learn some words first! 🐥</div>';
    } else if (done && st.currentWeek < 24) {
      weekAction = `<button class="btn-next" onclick="Views.nextWeek()">`
        + `🎉 Week ${st.currentWeek} done! Start Week ${st.currentWeek + 1} ›</button>`;
    } else if (done && st.currentWeek === 24) {
      weekAction = '<div class="hint">🎉 Phase 1 complete! Amazing!</div>';
    } else {
      weekAction = `<button class="btn-next" onclick="nav('learn')">`
        + `📖 Learn today's words${newLeft ? ` (${newLeft} new)` : ''} ›</button>`;
    }

    return `
      <header class="topbar">
        <div class="chip">⭐ ${st.stars}</div>
        <div class="chip">🔥 ${st.streak.days}</div>
        <div class="chip">Today ⭐ ${log.stars}</div>
      </header>
      <main class="screen">
        <div class="mascot" onclick="U.poke()">🐥</div>
        <section class="week-card" onclick="TTS.speak('${U.esc(wk.theme)}')">
          <div class="week-no">Week ${wk.week}</div>
          <div class="week-emoji">${wk.emoji}</div>
          <div class="week-theme">${wk.theme}</div>
          <div class="week-zh">${U.esc(wk.themeZh)} · ${learned}/${total || '–'} words</div>
        </section>
        ${weekAction}
        ${this.rewardCard()}
        <div class="task-grid">
          <button class="task ${log.learned ? 'done' : ''}" onclick="nav('learn')">
            <span class="task-icon">📖</span><span class="task-label">Learn</span>
            <span class="task-mark">${log.learned ? '✅' : ''}</span>
          </button>
          <button class="task ${log.played ? 'done' : ''}" onclick="nav('play')">
            <span class="task-icon">🎮</span><span class="task-label">Play</span>
            <span class="task-mark">${log.played ? '✅' : ''}</span>
          </button>
          <button class="task" onclick="nav('words')">
            <span class="task-icon">📚</span><span class="task-label">My Words</span>
            <span class="task-mark"></span>
          </button>
          <button class="task" onclick="nav('abc')">
            <span class="task-icon">🔤</span><span class="task-label">ABC</span>
            <span class="task-mark"></span>
          </button>
        </div>
      </main>`;
  },

  nextWeek() {
    const st = Store.state;
    if (st.currentWeek < 24) {
      st.currentWeek += 1;
      Store.save();
      SFX.win();
      confetti();
      TTS.speak('Great job! New week, new words!');
    }
    render();
  },

  // rewardCard shows the kid's progress toward the parent-defined star
  // reward on the home screen; hidden until a reward name is configured.
  rewardCard() {
    const r = Store.state.settings.reward;
    if (!r || !r.name) return '';
    const progress = Math.max(0, Math.min(Store.state.stars - r.start, r.cost));
    if (Store.state.stars - r.start >= r.cost) {
      return `
        <section class="reward-card ready" onclick="SFX.win();confetti()">
          <div class="reward-emoji">🎁</div>
          <div class="reward-text">You made it!
            <i>去找爸爸妈妈兑换「${U.esc(r.name)}」吧！</i>
          </div>
        </section>`;
    }
    const pct = Math.round((progress / r.cost) * 100);
    return `
      <section class="reward-card">
        <div class="reward-emoji">🎁</div>
        <div class="reward-text">
          ${progress} / ${r.cost} ⭐ → ${U.esc(r.name)}
          <div class="bar"><div class="bar-in" style="width:${pct}%"></div></div>
        </div>
      </section>`;
  },

  // words renders the word book grouped by week.
  words() {
    const st = Store.state;
    const groups = U.allWeeks().map((wk) => {
      const items = wk.words.map((w) => {
        const m = U.mastery(w.word);
        const stars = '⭐'.repeat(m) || '<span class="dim">·</span>';
        return `<button class="word-chip" onclick="Views.preview('${U.esc(w.word)}')">`
          + `<span class="word-chip-face">${U.face(w)}</span>`
          + `<span class="word-chip-text">${U.esc(w.word)}</span>`
          + `<span class="word-chip-stars">${stars}</span></button>`;
      }).join('');
      const learned = U.learnedCountInWeek(wk.week);
      const head = `<div class="group-head">`
        + `<span class="group-emoji">${wk.emoji}</span>`
        + `<span class="group-title">Week ${wk.week} · ${wk.theme}</span>`
        + `<span class="group-zh">${U.esc(wk.themeZh)} ${learned}/${wk.words.length}</span></div>`;
      const body = wk.words.length
        ? `<div class="word-grid">${items}</div>`
        : '<div class="hint">Review week · play games to practice! 🎮</div>';
      const locked = learned === 0 && wk.week > st.currentWeek
        ? '<span class="group-lock">🔒</span>' : '';
      return `<section class="word-group">${head}${locked}${body}</section>`;
    }).join('');

    const total = U.learnedWords().length;
    const goal = U.allUniqueWords().length;
    const pct = Math.round((total / goal) * 100);

    return `
      <header class="topbar">
        <div class="chip">📚 My Words</div>
        <div class="chip">${total} / ${goal}</div>
      </header>
      <main class="screen">
        <div class="progress-outer"><div class="progress-inner" style="width:${pct}%"></div></div>
        <div class="progress-zh">已学 ${total} 词 · 目标 ${goal} 词 · ${pct}%</div>
        ${groups}
      </main>`;
  },

  preview(word) {
    const item = U.wordItem(word);
    if (!item) return;
    TTS.speak(item.word);
    const stars = '⭐'.repeat(U.mastery(word));
    U.el('modal').innerHTML = `
      <div class="modal-mask" onclick="Views.closeModal()">
        <div class="modal-card" onclick="event.stopPropagation()">
          <div class="modal-face">${U.face(item)}</div>
          <div class="modal-word">${U.esc(item.word)}</div>
          <div class="modal-zh">${U.esc(item.zh)}</div>
          <div class="modal-stars">${stars || '·'}</div>
          <button class="btn-primary" onclick="TTS.speak('${U.esc(item.word)}')">🔊 Listen</button>
          <button class="btn-ghost" onclick="TTS.speakZh('${U.esc(item.zh)}')">🔊 中文</button>
        </div>
      </div>`;
    U.el('modal').style.display = 'block';
  },

  closeModal() {
    U.el('modal').style.display = 'none';
    U.el('modal').innerHTML = '';
  },

  // parents renders the grown-ups hub behind an arithmetic gate.
  parents(tab) {
    if (!window.sessionStorage.getItem('an-english-gate')) {
      U.app().innerHTML = Views.gate() + renderNav('parents');
      return;
    }
    const active = tab || 'progress';
    const tabs = ['progress', 'week', 'settings', 'data'];
    const tabbar = tabs.map((t) => (
      `<button class="ptab ${t === active ? 'active' : ''}" onclick="Views.parents('${t}')">`
      + `${{ progress: '📊 Progress', week: '📅 This Week', settings: '⚙️ Settings', data: '💾 Data' }[t]}`
      + '</button>'
    )).join('');
    const body = this[`p_${active}`]();
    U.app().innerHTML = `
      <header class="topbar"><div class="chip">👨‍👩‍👧 Grown-ups</div></header>
      <main class="screen">
        <div class="tabbar">${tabbar}</div>
        ${body}
      </main>` + renderNav('parents');
    window.scrollTo(0, 0);
  },

  gate() {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 3 + Math.floor(Math.random() * 7);
    return `
      <main class="screen gate-screen">
        <div class="gate-card">
          <div class="gate-title">🔒 Grown-ups only</div>
          <div class="gate-q">请回答：${a} + ${b} = ?</div>
          <input id="gate-input" class="gate-input" type="number" inputmode="numeric" placeholder="答案">
          <button class="btn-primary" onclick="Views.gateCheck(${a + b})">OK</button>
          <button class="btn-ghost" onclick="nav('today')">← Back</button>
        </div>
      </main>`;
  },

  gateCheck(answer) {
    const input = U.el('gate-input');
    if (input && Number(input.value) === answer) {
      window.sessionStorage.setItem('an-english-gate', '1');
      this.parents('progress');
    } else {
      SFX.wrong();
      const card = document.querySelector('.gate-card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      input.value = '';
      input.focus();
    }
  },

  p_progress() {
    const st = Store.state;
    const total = U.learnedWords().length;
    const goal = U.allUniqueWords().length;
    const mastered = U.allUniqueWords().filter((w) => U.mastery(w.word) === 3).length;
    const pct = Math.round((total / goal) * 100);
    const abc = ABC.counts();
    const rows = U.allWeeks().map((wk) => {
      const learned = U.learnedCountInWeek(wk.week);
      const pctW = wk.words.length ? Math.round((learned / wk.words.length) * 100) : 0;
      return `<tr class="${wk.week === st.currentWeek ? 'cur' : ''}">
        <td>W${wk.week}</td><td>${wk.emoji} ${U.esc(wk.themeZh)}</td>
        <td>${learned}/${wk.words.length}</td>
        <td><div class="bar"><div class="bar-in" style="width:${pctW}%"></div></div></td>
      </tr>`;
    }).join('');

    return `
      <div class="pcard">
        <div class="pcard-title">第一阶段进度 · Phase 1</div>
        <div class="stat-row">
          <div class="stat"><div class="stat-num">${total}</div><div class="stat-zh">已学单词</div></div>
          <div class="stat"><div class="stat-num">${mastered}</div><div class="stat-zh">熟练掌握 ⭐⭐⭐</div></div>
          <div class="stat"><div class="stat-num">${st.stars}</div><div class="stat-zh">累计星星</div></div>
          <div class="stat"><div class="stat-num">🔥 ${st.streak.days}</div><div class="stat-zh">连续天数</div></div>
        </div>
        <div class="progress-outer"><div class="progress-inner" style="width:${pct}%"></div></div>
        <div class="progress-zh">词汇目标 ${goal} 词 · 已完成 ${pct}%（阶段目标 300-400）</div>
      </div>
      <div class="pcard">
        <div class="pcard-title">ABC 基础能力 · 字母 / 拼读 / 高频词</div>
        <div class="stat-row">
          <div class="stat"><div class="stat-num">${abc.letters}/26</div><div class="stat-zh">字母认读</div></div>
          <div class="stat"><div class="stat-num">${abc.phonics}/${ABC_DATA.phonics.length}</div><div class="stat-zh">自然拼读</div></div>
          <div class="stat"><div class="stat-num">${abc.sight}/${ABC_DATA.sightWords.length}</div><div class="stat-zh">高频词组</div></div>
        </div>
      </div>
      <div class="pcard">
        <div class="pcard-title">每周完成度</div>
        <table class="week-table"><tbody>${rows}</tbody></table>
      </div>`;
  },

  p_week() {
    const st = Store.state;
    const wk = U.weekData(st.currentWeek);
    const options = U.allWeeks().map((w) => (
      `<option value="${w.week}" ${w.week === st.currentWeek ? 'selected' : ''}>`
      + `Week ${w.week} · ${w.themeZh}</option>`
    )).join('');
    const wordRows = wk.words.length
      ? `<div class="word-grid">${wk.words.map((w) => (
        `<button class="word-chip" onclick="Views.preview('${U.esc(w.word)}')">`
        + `<span class="word-chip-face">${U.face(w)}</span>`
        + `<span class="word-chip-text">${U.esc(w.word)}<i>${U.esc(w.zh)}</i></span></button>`
      )).join('')}</div>`
      : '<div class="hint">总复习周：用游戏模式巩固所有已学单词 🎮</div>';
    const sents = wk.sentences.map((s, i) => (
      `<li><b>${U.esc(s)}</b><br><span class="dim">${U.esc(wk.sentencesZh[i] || '')}</span></li>`
    )).join('');
    const acts = (wk.activitiesZh || []).map((a) => `<li>${U.esc(a)}</li>`).join('');

    return `
      <div class="pcard">
        <div class="pcard-title">当前周（可切换）</div>
        <select class="select" onchange="Views.setWeek(this.value)">${options}</select>
      </div>
      <div class="pcard">
        <div class="pcard-title">Week ${wk.week} · ${wk.emoji} ${U.esc(wk.themeZh)}</div>
        <div class="psection">🔤 新单词</div>
        ${wordRows}
        <div class="psection">💬 本周句型</div>
        <ul class="plist">${sents}</ul>
        <div class="psection">🎯 亲子活动</div>
        <ul class="plist">${acts}</ul>
        <div class="psection">🎵 推荐儿歌</div>
        <div>${wk.song ? U.esc(wk.song) : '—'}</div>
        <div class="psection">📖 推荐绘本</div>
        <div>${wk.book ? U.esc(wk.book) : '—'}</div>
      </div>`;
  },

  setWeek(value) {
    Store.state.currentWeek = Number(value);
    Store.save();
    this.parents('week');
  },

  p_settings() {
    const st = Store.state;
    const s = st.settings;
    const r = s.reward;
    const followOk = FollowRead.configured();
    const followState = followOk
      ? '<span class="dim">已启用 ✓</span>'
      : '<span class="dim">未配置 · 见 assets/xfyun-config.js</span>';
    const rewardProgress = Math.max(0, Math.min(st.stars - r.start, r.cost));
    const rewardReady = st.stars - r.start >= r.cost;
    return `
      <div class="pcard">
        <div class="pcard-title">每日学习量</div>
        <div class="setting-row">
          <span>每天新词数量</span>
          <div class="seg">
            ${[4, 6, 8].map((n) => (
              `<button class="${s.newPerDay === n ? 'on' : ''}" onclick="Views.setSetting('newPerDay',${n})">${n}</button>`
            )).join('')}
          </div>
        </div>
        <div class="setting-row">
          <span>每天复习词数量</span>
          <div class="seg">
            ${[2, 4, 6].map((n) => (
              `<button class="${s.reviewPerDay === n ? 'on' : ''}" onclick="Views.setSetting('reviewPerDay',${n})">${n}</button>`
            )).join('')}
          </div>
        </div>
      </div>
      <div class="pcard">
        <div class="pcard-title">🎁 星星奖励</div>
        <p class="pnote">给星星一个去处：设置一份小奖励，孩子攒够星星后在首页看到进度条，攒满即可找你兑换。保存或修改目标后，从当前星星数重新开始计数。</p>
        <div class="setting-row">
          <span>奖励名称</span>
          <input id="reward-input" class="select reward-input" type="text"
            placeholder="如：冰淇淋 / 小玩具 / 游乐场" value="${U.esc(r.name)}">
        </div>
        <div class="setting-row">
          <span>需要星星</span>
          <div class="seg">
            ${[30, 50, 100].map((n) => (
              `<button class="${r.cost === n ? 'on' : ''}" onclick="Views.setRewardCost(${n})">${n}⭐</button>`
            )).join('')}
          </div>
        </div>
        <div class="setting-row">
          <span>当前进度</span>
          <span class="dim">${rewardProgress} / ${r.cost} ⭐ · 已兑换 ${r.claimed} 次</span>
        </div>
        <button class="btn-primary" onclick="Views.setRewardName()">💾 保存奖励</button>
        ${rewardReady ? '<button class="btn-ghost" onclick="Views.claimReward()">✅ 已兑换，开始下一轮</button>' : ''}
      </div>
      <div class="pcard">
        <div class="pcard-title">语音与音效</div>
        <div class="setting-row">
          <span>跟读评分（讯飞）</span>
          ${followState}
        </div>
        <div class="setting-row">
          <span>中文朗读</span>
          ${followOk
            ? '<span class="dim">系统语音 + 讯飞合成 ✓</span>'
            : '<span class="dim">仅系统语音</span>'}
        </div>
        <div class="setting-row">
          <span>朗读语速</span>
          <div class="seg">
            ${[[0.75, '慢'], [0.85, '标准'], [1, '快']].map(([v, l]) => (
              `<button class="${s.rate === v ? 'on' : ''}" onclick="Views.setSetting('rate',${v})">${l}</button>`
            )).join('')}
          </div>
        </div>
        <div class="setting-row">
          <span>游戏音效</span>
          <div class="seg">
            <button class="${s.sfx ? 'on' : ''}" onclick="Views.setSetting('sfx',true)">开</button>
            <button class="${!s.sfx ? 'on' : ''}" onclick="Views.setSetting('sfx',false)">关</button>
          </div>
        </div>
      </div>`;
  },

  // setRewardName saves the reward name and restarts counting from the
  // current star total.
  setRewardName() {
    const input = U.el('reward-input');
    const r = Store.state.settings.reward;
    r.name = (input && input.value.trim()) || '';
    r.start = Store.state.stars;
    Store.save();
    SFX.correct();
    this.parents('settings');
  },

  // setRewardCost changes the star goal and restarts the cycle.
  setRewardCost(cost) {
    const r = Store.state.settings.reward;
    r.cost = cost;
    r.start = Store.state.stars;
    Store.save();
    this.parents('settings');
  },

  // claimReward records a redemption and starts the next reward cycle.
  claimReward() {
    const r = Store.state.settings.reward;
    r.claimed += 1;
    r.start = Store.state.stars;
    Store.save();
    SFX.win();
    confetti();
    this.parents('settings');
  },

  setSetting(key, value) {
    Store.state.settings[key] = value;
    Store.save();
    SFX.correct();
    this.parents('settings');
  },

  p_data() {
    return `
      <div class="pcard">
        <div class="pcard-title">备份与恢复</div>
        <p class="pnote">进度保存在本机浏览器（localStorage）。换设备或清理浏览器前，请先导出备份。</p>
        <button class="btn-primary" onclick="Views.exportData()">⬇️ 导出进度备份（JSON）</button>
        <label class="btn-ghost file-btn">
          ⬆️ 导入备份
          <input type="file" accept=".json,application/json" onchange="Views.importData(this)">
        </label>
      </div>
      <div class="pcard">
        <div class="pcard-title">重新开始</div>
        <p class="pnote">清空所有学习进度、星星与设置，不可恢复。</p>
        <button class="btn-danger" onclick="Views.resetData()">🗑 重置全部数据</button>
      </div>`;
  },

  exportData() {
    const stamp = U.todayStr().replace(/-/g, '');
    const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `an-english-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },

  importData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !data.settings || !data.words) {
          throw new Error('bad format');
        }
        Store.state = Object.assign({}, DEFAULT_STATE, data);
        Store.save();
        SFX.win();
        alert('导入成功！');
        this.parents('data');
      } catch (err) {
        alert('导入失败：不是有效的备份文件');
      }
    };
    reader.readAsText(file);
  },

  resetData() {
    const first = window.confirm('确定要清空所有学习进度吗？');
    if (!first) return;
    const second = window.confirm('再次确认：星星和已学单词将全部清零，无法恢复。');
    if (!second) return;
    Store.reset();
    this.parents('progress');
  },
};
