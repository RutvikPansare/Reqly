const { spawn } = require('child_process');

const p = spawn('reqly', ['start', '--project-dir', '${workspaceFolder}']);

p.stdout.on('data', (d) => process.stdout.write(`STDOUT: ${d.toString()}`));
p.stderr.on('data', (d) => process.stdout.write(`STDERR: ${d.toString()}`));
p.on('close', (code) => console.log(`Exited with code ${code}`));
