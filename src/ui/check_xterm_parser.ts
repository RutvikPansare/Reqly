import pkg from '@xterm/xterm';
const { Terminal } = pkg;
const term = new Terminal();
const ignoreAltScreen = (params: (number | number[])[]) => {
  const p = params[0];
  if (p === 1049 || p === 1047 || p === 47) return true;
  return false;
};
term.parser?.registerCsiHandler({ prefix: '?', final: 'h' }, ignoreAltScreen);
console.log("Registered");
