// The green-screen terminal: lines typed out one character at a time, and a choice of commands
// that are always real buttons (so phones never need the keyboard) and can also be typed.
// Screen readers get each finished line once, through an aria-live region.

const CHAR_MS = 18;
const MAX_SPOKEN = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A login name: 3 to 12 letters, upper case. Anything else gives null.
export function cleanName(text) {
  const name = String(text).trim().toUpperCase();
  return /^[A-Z]{3,12}$/.test(name) ? name : null;
}

// Which choice a typed command means: its number (1, 2...), its whole label, or the start of
// exactly one label. -1 if none.
export function matchChoice(text, labels) {
  const typed = String(text).trim().toUpperCase().replace(/\s+/g, ' ');
  if (!typed) return -1;
  if (/^\d+$/.test(typed)) {
    const n = Number(typed);
    return n >= 1 && n <= labels.length ? n - 1 : -1;
  }
  const upper = labels.map((label) => label.toUpperCase());
  const exact = upper.indexOf(typed);
  if (exact >= 0) return exact;
  const starts = upper.flatMap((label, i) => (label.startsWith(typed) ? [i] : []));
  return starts.length === 1 ? starts[0] : -1;
}

export class Terminal {
  // els: { screen, out, spoken, choices, prompt, input, label }
  // reduced(): true when effects are reduced (no typing animation).
  // onChar(): called as characters appear, for key clicks.
  constructor(els, { reduced = () => false, onChar = () => {} } = {}) {
    Object.assign(this, els);
    this.reduced = reduced;
    this.onChar = onChar;
    this.skipping = false;
  }

  // Finish whatever is being typed right away.
  skip() {
    this.skipping = true;
  }

  clear() {
    this.out.replaceChildren();
  }

  // Print lines. A line is a string, or { text, href } for a link.
  async print(...lines) {
    for (const line of lines) {
      const { text, href } = typeof line === 'string' ? { text: line } : line;
      const el = document.createElement('div');
      el.className = 'line';
      this.out.append(el);
      if (!this.reduced() && !this.skipping) {
        el.classList.add('typing');
        for (let i = 1; i <= text.length && !this.skipping; i++) {
          el.textContent = text.slice(0, i);
          if (i % 3 === 0) this.onChar();
          this.scroll();
          await sleep(CHAR_MS);
        }
        el.classList.remove('typing');
      }
      if (href) {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        a.rel = 'noopener';
        a.target = '_blank';
        el.replaceChildren(a);
      } else {
        el.textContent = text;
      }
      this.speak(text);
      this.scroll();
    }
    this.skipping = false;
  }

  // A pause between lines, cut short by a tap or key.
  async pause(ms) {
    if (this.reduced()) return;
    for (let t = 0; t < ms && !this.skipping; t += 50) await sleep(50);
  }

  speak(text) {
    if (!text.trim()) return;
    const p = document.createElement('p');
    p.textContent = text;
    this.spoken.append(p);
    while (this.spoken.childElementCount > MAX_SPOKEN) this.spoken.firstElementChild.remove();
  }

  scroll() {
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  // Show choices and wait for one. options: [{ label, value }].
  // ask: optional free text, { label, check(text) => value or null, error }, for the login name.
  // Resolves with the chosen value.
  choose(options, { ask = null } = {}) {
    return new Promise((resolve) => {
      const labels = options.map((o) => o.label);
      const buttons = options.map((option) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = option.label;
        b.addEventListener('click', () => done(option));
        return b;
      });
      this.choices.replaceChildren(...buttons);
      this.label.textContent = ask ? `${ask.label}` : '>';
      this.input.setAttribute('aria-label', ask ? ask.label : 'Type a command');
      this.input.value = '';
      // Touch screens only need the typed line for free text (the login name); buttons do the rest.
      const finePointer = globalThis.matchMedia?.('(pointer: fine)').matches;
      this.prompt.hidden = !ask && !finePointer;

      const onKey = (event) => {
        const i = buttons.indexOf(document.activeElement);
        if (i < 0 || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const next = (i + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
        buttons[next].focus();
      };
      const onSubmit = (event) => {
        event.preventDefault();
        const text = this.input.value;
        this.input.value = '';
        if (ask) {
          const value = ask.check(text);
          if (value != null) return done({ label: value, value });
        }
        const i = matchChoice(text, labels);
        if (i >= 0) return done(options[i]);
        if (text.trim()) {
          this.onError?.();
          this.print(ask?.error ?? `UNKNOWN COMMAND: ${text.trim().toUpperCase()}`);
        }
      };
      const done = (option) => {
        this.choices.removeEventListener('keydown', onKey);
        this.prompt.removeEventListener('submit', onSubmit);
        this.choices.replaceChildren();
        this.prompt.hidden = true;
        this.onSelect?.();
        this.print(`> ${option.label}`).then(() => resolve(option.value));
      };
      this.choices.addEventListener('keydown', onKey);
      this.prompt.addEventListener('submit', onSubmit);

      // Keyboard players start typing or arrowing at once. On touch screens, focusing the
      // input would pop up the keyboard, so the buttons are enough.
      if (ask && finePointer) this.input.focus({ preventScroll: true });
      else if (finePointer) buttons[0]?.focus({ preventScroll: true });
      this.scroll();
    });
  }
}
