import { Terminal } from '@xterm/xterm';

const term = new Terminal();
if (term.parser) {
  console.log("term.parser exists");
}
