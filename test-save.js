const fs = require('fs');
const path = require('path');
const { dump, load } = require('js-yaml');

const dir = path.join(process.cwd(), '.reqly', 'test');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const req = {
  id: '123',
  name: 'my-grpc-req',
  method: 'POST',
  url: 'localhost:50051',
  type: 'grpc',
  grpc: {}
};

fs.writeFileSync(path.join(dir, 'my-grpc-req.yaml'), dump(req));
console.log('Saved');

const files = fs.readdirSync(dir);
for (const file of files) {
  if (file.endsWith('.yaml')) {
    const doc = load(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log(file, 'type:', doc.type);
  }
}
