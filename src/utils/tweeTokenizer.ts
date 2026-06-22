/**
 * Tokenizer for SugarCube passage bodies.
 *
 * Walks the source character-by-character and emits a stream of tokens that
 * the block builder can map to Purl blocks. Macros may nest — paired macros
 * (those that need `<</name>>`) contain a `body` of child tokens.
 *
 * `<<if>>` is special-cased: its branches are split into `MacroBranch[]`
 * with their own bodies.
 *
 * Anything we don't recognise (unknown HTML, garbage) just stays as text or
 * gets eaten by the surrounding context. The downstream block builder
 * decides what to do with each token.
 */

interface MacroBranch {
  type: 'if' | 'elseif' | 'else';
  condition: string;   // empty for 'else'
  body: Token[];
}

export type Token =
  | { kind: 'text'; content: string }
  | { kind: 'link'; label: string; target: string; raw: string }
  | { kind: 'macro'; name: string; args: string; body?: Token[]; branches?: MacroBranch[] }
  | { kind: 'html'; tag: string; attrs: Record<string, string>; selfClosing: boolean; raw: string };

/** Macros that require a closing `<</name>>` tag. */
const PAIRED_MACROS = new Set([
  'if', 'link', 'nobr', 'silently', 'script', 'widget',
  'type', 'timed', 'append', 'prepend', 'replace',
  'capture', 'button',
  'for', 'switch', 'repeat',
]);

/** Self-closing HTML tags we surface as `html` tokens (everything else stays inline as text). */
const RECOGNIZED_HTML_TAGS = new Set(['img', 'video', 'audio', 'hr', 'br']);

/** Entry point. */
export function tokenize(src: string): Token[] {
  return new Tokenizer(src).parseBody(null);
}

class Tokenizer {
  pos = 0;
  src: string;

  constructor(src: string) {
    this.src = src;
  }

  /**
   * Parse tokens until we hit a close tag matching `closeName` or EOF.
   *
   * Special closeName values:
   *   - null         — top-level, only EOF stops us
   *   - 'if-branch'  — inside if/elseif/else; <<elseif>>/<<else>>/<</if>> stop us (without consuming)
   *   - any other    — stop when we see <</closeName>> (consumed)
   */
  parseBody(closeName: string | null): Token[] {
    const tokens: Token[] = [];
    let textBuf = '';
    const flush = () => {
      if (textBuf) tokens.push({ kind: 'text', content: textBuf });
      textBuf = '';
    };

    while (this.pos < this.src.length) {
      // ── Inside an if-branch: stop (without consuming) on branch keywords ──
      if (closeName === 'if-branch') {
        const sub = this.src.slice(this.pos);
        if (
          /^<<elseif\b/.test(sub) ||
          sub.startsWith('<<else>>') ||
          sub.startsWith('<</if>>')
        ) {
          flush();
          return tokens;
        }
      }

      // ── Closing tag of a paired macro (handled by parent) ────────────────
      if (this.src.startsWith('<</', this.pos)) {
        const m = /^<<\/([A-Za-z_$][\w$-]*)>>/.exec(this.src.slice(this.pos));
        if (m) {
          if (closeName === m[1]) {
            this.pos += m[0].length;
            flush();
            return tokens;
          }
          // Unmatched close — eat as literal text so we don't lose content
          textBuf += m[0];
          this.pos += m[0].length;
          continue;
        }
      }

      // ── Macro opener (quote-aware: `>` inside args is fine) ───────────────
      if (this.src.startsWith('<<', this.pos) && this.src[this.pos + 2] !== '/') {
        const opener = readMacroOpen(this.src, this.pos);
        if (opener) {
          flush();
          const { name, args, end } = opener;
          this.pos = end;

          if (name === 'if') {
            tokens.push(this.parseIf(args));
          } else if (PAIRED_MACROS.has(name)) {
            const body = this.parseBody(name);
            tokens.push({ kind: 'macro', name, args, body });
          } else {
            tokens.push({ kind: 'macro', name, args });
          }
          continue;
        }
      }

      // ── Twine link [[...]] ──────────────────────────────────────────────
      if (this.src.startsWith('[[', this.pos)) {
        const m = /^\[\[([^\]\n]+)\]\]/.exec(this.src.slice(this.pos));
        if (m) {
          flush();
          tokens.push(parseLinkInner(m[1], m[0]));
          this.pos += m[0].length;
          continue;
        }
      }

      // ── Self-closing HTML element ────────────────────────────────────────
      if (this.src.startsWith('<', this.pos) && !this.src.startsWith('<<', this.pos)) {
        const m = /^<([A-Za-z][\w-]*)\b([^>]*?)\/?>/i.exec(this.src.slice(this.pos));
        if (m) {
          const tag = m[1].toLowerCase();
          if (RECOGNIZED_HTML_TAGS.has(tag)) {
            flush();
            const attrs = parseAttrs(m[2]);
            tokens.push({ kind: 'html', tag, attrs, selfClosing: true, raw: m[0] });
            this.pos += m[0].length;
            continue;
          }
        }
      }

      // ── Default: eat one character into the text buffer ─────────────────
      textBuf += this.src[this.pos];
      this.pos++;
    }

    flush();
    return tokens;
  }

  /**
   * Parse an `<<if>>` macro after its opener has been consumed.
   * Returns a single macro token with `branches` populated and no `body`.
   */
  parseIf(initialCondition: string): Token {
    const branches: MacroBranch[] = [];
    let curType: 'if' | 'elseif' | 'else' = 'if';
    let curCond = initialCondition.trim();

    while (this.pos < this.src.length) {
      const body = this.parseBody('if-branch');
      branches.push({ type: curType, condition: curCond, body });

      const sub = this.src.slice(this.pos);
      if (/^<<elseif\b/.test(sub)) {
        // Reuse the quote-aware scanner so `>` inside `<<elseif $x > 5>>` works.
        const opener = readMacroOpen(this.src, this.pos);
        if (!opener || opener.name !== 'elseif') break;
        this.pos = opener.end;
        curType = 'elseif';
        curCond = opener.args.trim();
      } else if (sub.startsWith('<<else>>')) {
        this.pos += '<<else>>'.length;
        curType = 'else';
        curCond = '';
      } else if (sub.startsWith('<</if>>')) {
        this.pos += '<</if>>'.length;
        break;
      } else {
        break;
      }
    }

    return { kind: 'macro', name: 'if', args: '', branches };
  }
}

/** Parse the inner of `[[...]]` into a link token. */
function parseLinkInner(inner: string, raw: string): Token {
  // Twee supports three variants:
  //   [[Target]]
  //   [[Label|Target]]
  //   [[Label->Target]]
  //   [[Target<-Label]]  (less common; reverse arrow)
  let label = inner;
  let target = inner;

  if (inner.includes('->')) {
    const idx = inner.indexOf('->');
    label = inner.slice(0, idx);
    target = inner.slice(idx + 2);
  } else if (inner.includes('<-')) {
    const idx = inner.indexOf('<-');
    target = inner.slice(0, idx);
    label = inner.slice(idx + 2);
  } else if (inner.includes('|')) {
    const idx = inner.indexOf('|');
    label = inner.slice(0, idx);
    target = inner.slice(idx + 1);
  }

  return { kind: 'link', label: label.trim(), target: target.trim(), raw };
}

/**
 * Find the end of a macro opener starting at `start`. Walks forward from
 * after the macro name, tracking `"`/`'`/`` ` `` quote state so a single `>`
 * inside args (e.g. `<<if $x > 5>>`) doesn't close the macro early.
 *
 * Returns `{ name, args, end }` where `end` is the index AFTER the closing `>>`,
 * or `null` if the input doesn't start with a valid macro opener.
 */
function readMacroOpen(src: string, start: number): { name: string; args: string; end: number } | null {
  if (!src.startsWith('<<', start)) return null;
  if (src[start + 2] === '/') return null;
  const nameMatch = /^[A-Za-z_$][\w$-]*/.exec(src.slice(start + 2));
  if (!nameMatch) return null;
  const name = nameMatch[0];
  const argsStart = start + 2 + name.length;

  let i = argsStart;
  let quote: string | null = null;
  while (i < src.length - 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
    if (c === '>' && src[i + 1] === '>') {
      return { name, args: src.slice(argsStart, i).trim(), end: i + 2 };
    }
    i++;
  }
  return null;
}

/** Parse `key="value"` attribute pairs out of an HTML attribute string. */
function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  // Boolean attributes (e.g. `autoplay` without `="..."`)
  const boolRe = /(?<![\w-=])([A-Za-z_:][\w:.-]*)(?=[\s/>])/g;
  let bm: RegExpExecArray | null;
  while ((bm = boolRe.exec(s)) !== null) {
    const k = bm[1].toLowerCase();
    if (!(k in attrs)) attrs[k] = '';
  }
  return attrs;
}

// ─── Stringification helpers (for round-tripping unrecognized chunks) ────────

export function stringifyToken(tok: Token): string {
  switch (tok.kind) {
    case 'text': return tok.content;
    case 'link': return tok.raw;
    case 'html': return tok.raw;
    case 'macro': {
      if (tok.branches) {
        let s = '';
        for (const b of tok.branches) {
          if (b.type === 'if')          s += `<<if ${b.condition}>>`;
          else if (b.type === 'elseif') s += `<<elseif ${b.condition}>>`;
          else                          s += `<<else>>`;
          s += stringifyTokens(b.body);
        }
        s += '<</if>>';
        return s;
      }
      const argPart = tok.args ? ' ' + tok.args : '';
      if (tok.body !== undefined) {
        return `<<${tok.name}${argPart}>>${stringifyTokens(tok.body)}<</${tok.name}>>`;
      }
      return `<<${tok.name}${argPart}>>`;
    }
  }
}

function stringifyTokens(tokens: Token[]): string {
  return tokens.map(stringifyToken).join('');
}
