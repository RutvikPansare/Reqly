/**
 * T-237: generate JSON schemas for .reqly YAML files from the TypeScript
 * types in src/types/ (the single source of truth for the collection
 * format). Never hand-edit the files in schemas/ - rerun this script.
 *
 * Usage: node scripts/generate-schemas.mjs   (also runs as part of `npm run build`)
 */
import { createGenerator } from 'ts-json-schema-generator';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(here, '..');
const typesDir = path.join(pkgDir, '..', '..', 'src', 'types');
const outDir = path.join(pkgDir, 'schemas');

const generator = createGenerator({
  path: path.join(typesDir, 'index.ts'),
  tsconfig: path.join(here, 'tsconfig.schema.json'),
  type: '*',
  skipTypeCheck: true,
  additionalProperties: false,
  topRef: true,
});

/**
 * Request files on disk are CollectionRequest minus the runtime-assigned
 * `id`. Drop it from `required` (keep it allowed - exported collections
 * may carry ids).
 */
function makeRequestFileSchema(schema) {
  const def = schema.definitions?.CollectionRequest;
  if (!def) throw new Error('CollectionRequest definition not found');
  if (Array.isArray(def.required)) {
    def.required = def.required.filter((k) => k !== 'id');
  }
  return schema;
}

function emit(fileName, rootType, title, description, postProcess) {
  let schema = generator.createSchema(rootType);
  if (postProcess) schema = postProcess(schema);
  schema.title = title;
  schema.description = description;
  fs.writeFileSync(
    path.join(outDir, fileName),
    JSON.stringify(schema, null, 2) + '\n'
  );
  console.log(`wrote schemas/${fileName}`);
}

fs.mkdirSync(outDir, { recursive: true });

emit(
  'reqly-request.schema.json',
  'CollectionRequest',
  'Reqly request',
  'A saved Reqly request (.reqly/<collection>/<name>.yaml)',
  makeRequestFileSchema
);
emit(
  'reqly-collection-meta.schema.json',
  'CollectionMeta',
  'Reqly collection metadata',
  'Collection-level metadata (.reqly/<collection>/collection.yaml)'
);
emit(
  'reqly-environments.schema.json',
  'EnvironmentStore',
  'Reqly environments',
  'Environment store (.reqly/environments.yaml)'
);
emit(
  'reqly-flow.schema.json',
  'FlowConfig',
  'Reqly flow',
  'A Reqly test flow (.reqly/flows/<name>.yaml)'
);
