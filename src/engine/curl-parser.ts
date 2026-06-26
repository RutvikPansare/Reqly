export interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Tokenize a shell command string, respecting single/double quotes.
function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < cmd.length) {
    // skip whitespace
    while (i < cmd.length && /[ \t]/.test(cmd[i])) i++;
    if (i >= cmd.length) break;

    if (cmd[i] === "'") {
      // single-quoted: no escape processing
      i++;
      let tok = '';
      while (i < cmd.length && cmd[i] !== "'") tok += cmd[i++];
      if (i < cmd.length) i++;
      tokens.push(tok);
    } else if (cmd[i] === '"') {
      // double-quoted: handle \" and \\ escapes
      i++;
      let tok = '';
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === '\\' && i + 1 < cmd.length) {
          i++;
          const c = cmd[i];
          if (c === 'n') tok += '\n';
          else if (c === 't') tok += '\t';
          else tok += c;
        } else {
          tok += cmd[i];
        }
        i++;
      }
      if (i < cmd.length) i++;
      tokens.push(tok);
    } else {
      // unquoted token
      let tok = '';
      while (i < cmd.length && !/[ \t]/.test(cmd[i])) tok += cmd[i++];
      tokens.push(tok);
    }
  }

  return tokens;
}

// Split --flag=value into [--flag, value], or return [flag, null].
function splitInline(tok: string): [string, string | null] {
  if (tok.startsWith('--')) {
    const eq = tok.indexOf('=');
    if (eq > 0) return [tok.slice(0, eq), tok.slice(eq + 1)];
  }
  return [tok, null];
}

const NO_ARG_FLAGS = new Set([
  '-L', '--location', '-v', '--verbose', '-s', '--silent',
  '--compressed', '-k', '--insecure', '-i', '--include',
  '-I', '--head', '--http1.1', '--http2', '--no-keepalive',
  '-g', '--globoff', '-f', '--fail',
]);

const ONE_ARG_FLAGS = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout',
  '-A', '--user-agent', '-e', '--referer', '--cacert', '--cert',
  '--key', '--proxy', '-x',
]);

export function parseCurl(input: string): ParsedCurl {
  // Normalize line continuations (\<newline>) into a single line
  const normalized = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens = tokenize(normalized);

  let idx = 0;
  // skip leading 'curl' command name
  if (tokens[idx] === 'curl') idx++;

  let url = '';
  let method = '';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  while (idx < tokens.length) {
    const raw = tokens[idx];
    const [flag, inlineVal] = splitInline(raw);

    const consume = (): string => {
      if (inlineVal !== null) return inlineVal;
      idx++;
      return tokens[idx] ?? '';
    };

    if (flag === '-X' || flag === '--request') {
      method = consume().toUpperCase();
    } else if (flag === '-H' || flag === '--header') {
      const hdr = consume();
      const colon = hdr.indexOf(':');
      if (colon > 0) {
        headers[hdr.slice(0, colon).trim()] = hdr.slice(colon + 1).trim();
      }
    } else if (
      flag === '-d' || flag === '--data' ||
      flag === '--data-raw' || flag === '--data-binary' ||
      flag === '--data-urlencode'
    ) {
      body = consume();
    } else if (flag === '-u' || flag === '--user') {
      const creds = consume();
      headers['Authorization'] = 'Basic ' + Buffer.from(creds).toString('base64');
    } else if (flag === '-b' || flag === '--cookie') {
      headers['Cookie'] = consume();
    } else if (flag === '--url') {
      url = consume();
    } else if (NO_ARG_FLAGS.has(flag)) {
      // no-arg flags - consume nothing extra
    } else if (ONE_ARG_FLAGS.has(flag)) {
      consume(); // skip the value
    } else if (!flag.startsWith('-') && !url) {
      // positional URL argument
      url = flag;
    }

    idx++;
  }

  if (!method) method = body !== undefined ? 'POST' : 'GET';

  return { url, method, headers, body };
}
