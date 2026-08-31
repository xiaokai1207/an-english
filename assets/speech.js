// An English · Follow-read module: microphone capture + XFYun pronunciation
// scoring. After the child hears a word, they tap "read after me", speak it,
// and the XFYun speech-evaluation service grades the pronunciation over a
// direct WebSocket (no backend of our own). A passing score plays a cheerful
// chime and unlocks the next card. Keys live in xfyun-config.js.

const ISE_HOST = 'ise-api.xfyun.cn';
const ISE_PATH = '/v2/open-ise';
const ISE_SAMPLE_RATE = 16000;
const ISE_MAX_RECORD_MS = 8000;
const ISE_RESULT_TIMEOUT_MS = 15000;
const ISE_DEFAULT_PASS_SCORE = 60;

// Voice-activity thresholds for hands-free auto-submit: once the child has
// clearly spoken (RMS above SPEAK), a run of quiet frames (below SILENCE)
// lasting HANG_MS ends the take automatically - no "I'm done" tap needed.
// A short LEAD_MS grace after the mic opens stops the very first quiet frames
// from ending the take before the child starts.
const VAD_SPEAK_RMS = 0.05;
const VAD_SILENCE_RMS = 0.025;
const VAD_HANG_MS = 900;
const VAD_LEAD_MS = 600;

// bytesToBase64 encodes a typed array without overflowing the call stack.
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return window.btoa(bin);
}

// xmlFromBase64 decodes a base64 UTF-8 payload (the graded XML result).
function xmlFromBase64(b64) {
  const bin = window.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

// xfyunWssUrl signs the gateway handshake shared by every XFYun WebSocket
// API (evaluation and synthesis): HMAC-SHA256 over host/date/request-line.
async function xfyunWssUrl(host, path) {
  const date = new Date().toUTCString();
  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(XFYUN_ISE_CONFIG.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const origin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const digest = await window.crypto.subtle.sign('HMAC', key, encoder.encode(origin));
  const signature = bytesToBase64(new Uint8Array(digest));
  const authorization = window.btoa(
    `api_key="${XFYUN_ISE_CONFIG.apiKey}", algorithm="hmac-sha256", `
      + `headers="host date request-line", signature="${signature}"`,
  );
  return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}`
    + `&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
}

// Mic captures mono 16 kHz PCM from the microphone and hands each buffer to
// onFrame as an Int16Array plus its RMS level (0..1) so callers can detect
// when the child has finished speaking. Echo cancellation keeps the app's own
// TTS voice from leaking into the recording.
const Mic = {
  ctx: null,
  stream: null,
  source: null,
  processor: null,
  mute: null,
  ratio: 1,
  pos: 0,
  prev: 0,

  async start(onFrame) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const ctx = this.makeContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    // ScriptProcessor only runs while wired to a destination; the zero-gain
    // node keeps it pumping without echoing the mic out of the speaker.
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    this.ratio = ctx.sampleRate / ISE_SAMPLE_RATE;
    this.pos = 0;
    this.prev = 0;
    const mic = this;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const samples = mic.ratio === 1 ? input : mic.resample(input);
      onFrame(mic.encodePcm(samples), mic.rms(input));
    };

    this.ctx = ctx;
    this.stream = stream;
    this.source = source;
    this.processor = processor;
    this.mute = mute;
  },

  // rms measures how loud one input buffer is (0..1) for silence detection.
  rms(input) {
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    return Math.sqrt(sum / input.length);
  },

  // makeContext prefers a native 16 kHz context so no resampling is needed.
  makeContext() {
    try {
      return new AudioContext({ sampleRate: ISE_SAMPLE_RATE });
    } catch (err) {
      return new AudioContext();
    }
  },

  // resample converts one input buffer to 16 kHz with linear interpolation,
  // carrying the fractional position across buffers.
  resample(input) {
    const out = [];
    while (this.pos < input.length - 1) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i < 0 ? this.prev : input[i];
      out.push(a + (input[i + 1] - a) * frac);
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    this.prev = input[input.length - 1];
    return out;
  },

  // encodePcm clamps float samples into a 16-bit mono PCM buffer.
  encodePcm(samples) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
    }
    return pcm;
  },

  stop() {
    if (this.processor) this.processor.onaudioprocess = null;
    try {
      if (this.source) this.source.disconnect();
      if (this.processor) this.processor.disconnect();
      if (this.mute) this.mute.disconnect();
    } catch (err) {
      console.warn('Mic teardown hiccup.', err);
    }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.mute = null;
  },
};

// IseSession runs one scored read-aloud round: it opens an authenticated
// WebSocket to XFYun, streams raw PCM while the child speaks, then resolves
// with { score, passed, reason } once the graded XML comes back.
//
// Protocol notes (verified against the official demo + live service):
// - The ssb frame declares aus=1; audio frames only ever use aus=2/aus=4.
// - The final frame must carry the last audio chunk, so the newest PCM
//   buffer is held back until the round finishes.
// - Everything is evaluated with category read_sentence: the read_word
//   engine rejects our audio frames with error 48195 (iSEInputAppend).
class IseSession {
  constructor(text) {
    this.text = text;
    this.ws = null;
    this.queue = [];
    this.pending = null;
    this.opened = false;
    this.ended = false;
    this.finishWanted = false;
    this.resolve = null;
    this.reject = null;
    this.watchdog = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.buildUrl()
        .then((url) => this.open(url))
        .catch((err) => this.fail(err));
    });
  }

  // buildUrl signs the handshake with the shared XFYun gateway scheme.
  async buildUrl() {
    return xfyunWssUrl(ISE_HOST, ISE_PATH);
  }

  open(url) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => this.sendFirstFrame();
    ws.onmessage = (event) => this.onMessage(event);
    ws.onerror = () => this.fail(new Error('connection-failed'));
    ws.onclose = () => this.fail(new Error('connection-closed'));
  }

  sendFirstFrame() {
    this.opened = true;
    this.ws.send(JSON.stringify({
      common: { app_id: XFYUN_ISE_CONFIG.appId },
      business: {
        sub: 'ise',
        ent: 'en_vip',
        category: 'read_sentence',
        cmd: 'ssb',
        aue: 'raw',
        auf: 'audio/L16;rate=16000',
        aus: 1,
        tte: 'utf-8',
        rstcd: 'utf8',
        group: 'pupil',
        text: '\uFEFF' + this.text,
      },
      data: { status: 0 },
    }));
    while (this.queue.length > 1) this.sendAudio(this.queue.shift(), false);
    if (this.queue.length === 1) this.pending = this.queue.shift();
    if (this.finishWanted) this.finish();
  }

  // push feeds one PCM buffer. Before the socket opens buffers are queued;
  // afterwards the newest buffer is held back so it can ride the final frame.
  push(pcm) {
    if (this.ended) return;
    if (!this.opened) {
      this.queue.push(pcm);
      return;
    }
    if (this.pending) this.sendAudio(this.pending, false);
    this.pending = pcm;
  }

  // finish marks the end of audio; the service replies with the final score.
  finish() {
    if (this.ended) return;
    this.finishWanted = true;
    if (!this.opened) return; // the final frame goes out once the socket opens
    const last = this.pending || new Int16Array(640); // 20ms silence if nothing said
    this.pending = null;
    this.sendAudio(last, true);
    this.watchdog = setTimeout(() => {
      this.fail(new Error('result-timeout'));
    }, ISE_RESULT_TIMEOUT_MS);
  }

  // sendAudio wraps one PCM buffer in an auw frame; aus only ever holds 2
  // (middle) or 4 (final) here because aus=1 is declared on the ssb frame.
  sendAudio(pcm, isLast) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ended = isLast;
    this.ws.send(JSON.stringify({
      business: { cmd: 'auw', aue: 'raw', aus: isLast ? 4 : 2 },
      data: {
        status: isLast ? 2 : 1,
        data: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
        data_type: 1,
      },
    }));
  }

  onMessage(event) {
    let msg = null;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (msg.code !== 0) {
      this.fail(new Error(`ise-${msg.code}:${msg.message || 'service error'}`));
      return;
    }
    if (msg.data && msg.data.status === 2 && msg.data.data) {
      this.succeed(xmlFromBase64(msg.data.data));
    }
  }

  succeed(xml) {
    const resolve = this.resolve;
    if (!resolve) return;
    const result = IseSession.parseScore(xml);
    this.settle();
    resolve(result);
  }

  fail(err) {
    const reject = this.reject;
    if (!reject) return;
    this.settle();
    reject(err);
  }

  // abort drops the round on purpose (user left the card mid-recording).
  abort() {
    this.fail(new Error('aborted'));
  }

  // settle clears callbacks and closes the socket for good.
  settle() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.resolve = null;
    this.reject = null;
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch (err) {
        console.warn('Ise socket already closed.', err);
      }
      this.ws = null;
    }
  }

  // parseScore pulls the overall score out of the graded XML. English scores
  // arrive on a 0-5 scale; normalise to 0-100. except_info and is_rejected
  // are attributes on the paper element (28673 = no voice, 28676 = gibberish).
  static parseScore(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const rejectEl = doc.querySelector('[is_rejected]');
    const rejected = !!rejectEl && rejectEl.getAttribute('is_rejected') === 'true';
    const exceptEl = doc.querySelector('[except_info]');
    const exceptInfo = exceptEl ? Number(exceptEl.getAttribute('except_info')) || 0 : 0;
    const scoreEl = doc.querySelector('[total_score]');
    const raw = scoreEl ? parseFloat(scoreEl.getAttribute('total_score')) : 0;
    const score = raw > 0 && raw <= 5 ? Math.round(raw * 20) : Math.round(raw);
    const passScore = XFYUN_ISE_CONFIG.passScore || ISE_DEFAULT_PASS_SCORE;
    let reason = '';
    if (!scoreEl || exceptInfo === 28673) {
      reason = 'no-voice';
    } else if (rejected || exceptInfo !== 0) {
      reason = 'rejected';
    } else if (score < passScore) {
      reason = 'low-score';
    }
    return { score, passed: !reason, reason };
  }
}

// FollowRead drives the follow-read card UI through
// idle → recording → evaluating → passed / failed / error, and reports the
// outcome back to the flashcard flow via the onPass / onDegrade callbacks.
const FollowRead = {
  state: 'idle',
  text: '',
  areaId: null,
  session: null,
  onPass: null,
  onDegrade: null,
  micBroken: false,
  lastScore: 0,
  lastReason: '',
  timer: null,

  // VAD bookkeeping for hands-free auto-submit.
  heardVoice: false,
  startedAt: 0,
  silenceMs: 0,
  lastFrameAt: 0,

  configured() {
    return typeof XFYUN_ISE_CONFIG !== 'undefined'
      && !!XFYUN_ISE_CONFIG.appId
      && !!XFYUN_ISE_CONFIG.apiKey
      && !!XFYUN_ISE_CONFIG.apiSecret;
  },

  supported() {
    return this.configured()
      && !this.micBroken
      && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  // mount attaches the follow-read area to a fresh card.
  mount(areaId, text, handlers) {
    this.areaId = areaId;
    this.text = text;
    this.onPass = handlers.onPass || null;
    this.onDegrade = handlers.onDegrade || null;
    this.state = 'idle';
    this.render();
  },

  startRead() {
    if (this.state === 'recording' || this.state === 'evaluating') return;
    TTS.stop();
    this.cleanup();
    const session = new IseSession(this.text);
    this.session = session;
    this.state = 'recording';
    this.heardVoice = false;
    this.silenceMs = 0;
    this.startedAt = Date.now();
    this.lastFrameAt = this.startedAt;
    this.render();
    session.start()
      .then((result) => { if (this.session === session) this.handleResult(result); })
      .catch((err) => { if (this.session === session) this.handleError(err); });
    Mic.start((pcm, level) => {
      if (this.session !== session) return;
      session.push(pcm);
      this.watchVoice(level);
    })
      .then(() => {
        if (this.session !== session || this.state !== 'recording') {
          Mic.stop();
          return;
        }
        // A hard ceiling still ends the take if the child never stops talking.
        this.timer = setTimeout(() => this.done(), ISE_MAX_RECORD_MS);
      })
      .catch((err) => {
        if (this.session === session) this.handleMicError(err);
      });
  },

  // watchVoice ends the take automatically once the child has spoken and then
  // gone quiet for a moment - so no manual "I'm done" tap is ever needed.
  watchVoice(level) {
    if (this.state !== 'recording') return;
    const now = Date.now();
    const gap = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (now - this.startedAt < VAD_LEAD_MS) return;
    if (level >= VAD_SPEAK_RMS) {
      this.heardVoice = true;
      this.silenceMs = 0;
      return;
    }
    if (!this.heardVoice) return;
    if (level < VAD_SILENCE_RMS) {
      this.silenceMs += gap;
      if (this.silenceMs >= VAD_HANG_MS) this.done();
    } else {
      this.silenceMs = 0;
    }
  },

  // done stops the mic and asks the service for the score.
  done() {
    if (this.state !== 'recording' || !this.session) return;
    clearTimeout(this.timer);
    this.state = 'evaluating';
    this.render();
    Mic.stop();
    this.session.finish();
  },

  handleResult(result) {
    if (this.state !== 'evaluating') return;
    Mic.stop();
    this.lastScore = result.score;
    this.lastReason = result.reason;
    if (result.passed) {
      this.state = 'passed';
      this.render();
      SFX.correct();
      confetti();
      if (this.onPass) this.onPass();
    } else {
      this.state = 'failed';
      this.render();
      SFX.readFail();
    }
  },

  handleError(err) {
    if (this.state !== 'recording' && this.state !== 'evaluating') return;
    this.cleanup();
    this.state = 'error';
    this.lastReason = String((err && err.message) || err);
    this.render();
    // A service hiccup must never block the child from moving on.
    if (this.onDegrade) this.onDegrade();
  },

  handleMicError(err) {
    this.cleanup();
    this.micBroken = true;
    this.state = 'error';
    this.lastReason = err && err.name === 'NotAllowedError' ? 'mic-denied' : 'mic-failed';
    this.render();
    if (this.onDegrade) this.onDegrade();
  },

  cleanup() {
    clearTimeout(this.timer);
    Mic.stop();
    if (this.session) {
      const stale = this.session;
      this.session = null;
      stale.abort();
    }
  },

  // cancel leaves recording mode without judging (card switch / tab hidden).
  cancel() {
    if (this.state === 'idle') return;
    this.cleanup();
    this.state = 'idle';
  },

  // nudge bounces the follow button when the locked next button is tapped.
  nudge() {
    const btn = document.querySelector('.follow-btn');
    if (!btn) return;
    btn.classList.remove('nudge');
    void btn.offsetWidth;
    btn.classList.add('nudge');
  },

  errorText() {
    const map = {
      'mic-denied': '🎤 麦克风权限被拒绝',
      'mic-failed': '🎤 无法打开麦克风',
      'connection-failed': '📡 连接失败，请检查网络',
      'connection-closed': '📡 连接中断，请重试',
      'result-timeout': '⏳ 评分超时了，再试一次',
    };
    if (map[this.lastReason]) return map[this.lastReason];
    if (this.lastReason.indexOf('ise-') === 0) return '🔑 评测服务出错（请检查讯飞密钥）';
    return '😅 出了点小问题，稍后再试';
  },

  failText() {
    if (this.lastReason === 'no-voice') return '没有听到你的声音，凑近一点再读一次吧';
    if (this.lastReason === 'rejected') return '听起来不太像这个词，先听一遍再读吧';
    return `发音得分 ${this.lastScore} 分，再试一次会更棒`;
  },

  render() {
    const area = U.el(this.areaId);
    if (!area) return;
    let html = '';
    if (this.state === 'idle') {
      html = `
        <button class="follow-btn" id="follow-btn" onclick="FollowRead.startRead()">
          <span class="follow-mic">🎤</span>
          <span class="follow-text">Read after me!<i>点击跟读</i></span>
        </button>`;
    } else if (this.state === 'recording') {
      html = `
        <div class="follow-live">
          <div class="follow-wave">🎤</div>
          <div class="follow-text">I'm listening…<i>大声读出来，读完自动检测</i></div>
        </div>`;
    } else if (this.state === 'evaluating') {
      html = `
        <div class="follow-live">
          <div class="follow-wave checking">🧐</div>
          <div class="follow-text">Checking…<i>评分中…</i></div>
        </div>`;
    } else if (this.state === 'passed') {
      html = `
        <div class="follow-pass">
          <div class="follow-pass-face">🌟</div>
          <div class="follow-pass-text">Perfect!<i>发音得分 ${this.lastScore} · 读得真棒！</i></div>
        </div>`;
    } else if (this.state === 'failed') {
      html = `
        <div class="follow-fail">
          <div class="follow-fail-face">💪</div>
          <div class="follow-fail-text">Almost! Try again!<i>${this.failText()}</i></div>
        </div>
        <button class="follow-btn" id="follow-btn" onclick="FollowRead.startRead()">
          <span class="follow-mic">🎤</span>
          <span class="follow-text">Try again!<i>再读一次</i></span>
        </button>`;
    } else if (this.state === 'error') {
      const retry = this.micBroken ? '' : `
        <button class="follow-btn" id="follow-btn" onclick="FollowRead.startRead()">
          <span class="follow-mic">🎤</span>
          <span class="follow-text">Try again!<i>再试一次</i></span>
        </button>`;
      html = `
        <div class="follow-error">
          <div class="follow-error-text">${this.errorText()}<i>跟读暂不可用，可以直接学下一个词</i></div>
          ${retry}
        </div>`;
    }
    area.innerHTML = html;
  },
};

// XfTts speaks Chinese through XFYun's streaming synthesis WebSocket and
// resolves with a data: URI of the whole mp3 clip. It shares the evaluation
// keys, so the "online speech synthesis (streaming)" service must be enabled
// on the same app; otherwise every call rejects and callers fall through to
// their backup channels.
const XfTts = {
  host: 'tts-api.xfyun.cn',
  path: '/v2/tts',

  // speak sends the whole text in one frame and collects the streamed mp3
  // chunks. Slices are decoded and joined as raw bytes - base64 strings
  // cannot be concatenated because chunk boundaries are not 3-byte aligned.
  speak(text) {
    return new Promise((resolve, reject) => {
      if (typeof XFYUN_ISE_CONFIG === 'undefined' || !XFYUN_ISE_CONFIG.appId) {
        reject(new Error('tts-not-configured'));
        return;
      }
      let ws = null;
      let chunks = [];
      let settled = false;
      const watchdog = setTimeout(() => settle(reject, new Error('tts-timeout')), 10000);
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        try {
          if (ws && ws.readyState === 1) ws.close();
        } catch (err) { /* already closing */ }
        fn(value);
      };
      xfyunWssUrl(this.host, this.path)
        .then((url) => {
          ws = new WebSocket(url);
          ws.onopen = () => {
            ws.send(JSON.stringify({
              common: { app_id: XFYUN_ISE_CONFIG.appId },
              business: {
                aue: 'lame',
                sfl: 1,
                auf: 'audio/L16;rate=16000',
                vcn: 'xiaoyan',
                tte: 'utf8',
                speed: 50,
                volume: 50,
                pitch: 50,
              },
              data: {
                status: 2,
                text: bytesToBase64(new TextEncoder().encode(text)),
              },
            }));
          };
          ws.onmessage = (event) => {
            let msg;
            try {
              msg = JSON.parse(event.data);
            } catch (err) {
              return;
            }
            if (msg.code !== 0) {
              settle(reject, new Error('tts-' + msg.code));
              return;
            }
            if (msg.data && msg.data.audio) chunks.push(msg.data.audio);
            if (msg.data && msg.data.status === 2) {
              if (!chunks.length) {
                settle(reject, new Error('tts-empty'));
                return;
              }
              // Blob URL instead of a data: URI - some Android browsers
              // silently refuse to play base64 data-URI audio.
              let bin = '';
              chunks.forEach((part) => { bin += window.atob(part); });
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
              settle(resolve, URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })));
            }
          };
          ws.onerror = () => settle(reject, new Error('tts-connection'));
          ws.onclose = () => settle(reject, new Error('tts-closed'));
        })
        .catch((err) => settle(reject, err));
    });
  },
};
