#!/usr/bin/env node
/**
 * Agent-document and CI drift check.
 *
 * Keeps one canonical contract (AGENTS.md), thin tool adapters, discoverable
 * skills, and honest required workflows.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (message) => errors.push(message);

const requiredFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules/000-immigo.mdc',
  '.agents/CLAUDE.md',
  '.agents/GEMINI.md',
  '.agents/skills/README.md',
  'docs/CONSTITUTION.md',
  'docs/ARCHITECTURE.md',
  'docs/FEATURES.md',
  'docs/features.json',
  'docs/TESTING.md',
  'docs/CHANGE_POLICY.md',
  'docs/REVIEW_CHECKLIST.md',
  'docs/MIGRATIONS.md',
  'docs/archive/README.md',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) fail(`Missing required governance file: ${file}`);
}

const adapters = [
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules/000-immigo.mdc',
  '.agents/CLAUDE.md',
  '.agents/GEMINI.md',
];
for (const adapter of adapters) {
  const path = resolve(root, adapter);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, 'utf8');
  if (!content.includes('AGENTS.md')) fail(`${adapter} must point to AGENTS.md`);
  if (content.length > 8000) fail(`${adapter} is too large to be a thin adapter; move rules to AGENTS.md`);
}

const agentsPath = resolve(root, 'AGENTS.md');
if (existsSync(agentsPath)) {
  const agents = readFileSync(agentsPath, 'utf8');
  for (const reference of ['docs/CONSTITUTION.md', 'docs/features.json', 'docs/TESTING.md', 'npm run verify']) {
    if (!agents.includes(reference)) fail(`AGENTS.md must reference ${reference}`);
  }
}

const adrDirectory = resolve(root, 'docs/adr');
const adrCount = existsSync(adrDirectory)
  ? readdirSync(adrDirectory).filter((file) => file.endsWith('.md')).length
  : 0;
if (adrCount < 4) fail(`Expected at least 4 ADRs in docs/adr, found ${adrCount}`);

const skillsDirectory = resolve(root, '.agents/skills');
if (existsSync(skillsDirectory)) {
  const skillDirectories = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (skillDirectories.length === 0) fail('No skills found under .agents/skills');
  for (const skill of skillDirectories) {
    const skillPath = join(skillsDirectory, skill, 'SKILL.md');
    if (!existsSync(skillPath) || !statSync(skillPath).isFile()) {
      fail(`Skill "${skill}" is missing SKILL.md`);
      continue;
    }
    const content = readFileSync(skillPath, 'utf8');
    if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
      fail(`Skill "${skill}" must start with YAML frontmatter`);
    }
    if (!/^name:\s*\S+/m.test(content)) fail(`Skill "${skill}" is missing a frontmatter name`);
    if (!/^description:\s*\S+/m.test(content)) fail(`Skill "${skill}" is missing a frontmatter description`);
    if (!content.includes('AGENTS.md')) fail(`Skill "${skill}" must point to AGENTS.md`);
    if (!/## Done when/.test(content)) fail(`Skill "${skill}" must include a "## Done when" section`);
  }
}

const workflowDirectory = resolve(root, '.github/workflows');
if (existsSync(workflowDirectory)) {
  for (const file of readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name))) {
    const content = readFileSync(join(workflowDirectory, file), 'utf8');
    if (content.includes('|| true')) fail(`Workflow ${file} contains "|| true"`);
    if (/continue-on-error:\s*true/.test(content)) fail(`Workflow ${file} contains continue-on-error: true`);
  }
}

const packagePath = resolve(root, 'package.json');
if (existsSync(packagePath)) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  for (const script of ['verify', 'verify:governance', 'test:coverage']) {
    if (!pkg.scripts?.[script]) fail(`package.json is missing the "${script}" script`);
  }
}

const gitignorePath = resolve(root, '.gitignore');
if (existsSync(gitignorePath)) {
  const gitignore = readFileSync(gitignorePath, 'utf8');
  for (const ignored of ['/.agents', '.github/copilot-instructions.md', 'REMEDIATION_PLAN.md', 'REMEDIATION_AUDIT.md']) {
    if (gitignore.includes(ignored)) fail(`.gitignore must not ignore governance file: ${ignored}`);
  }
}

const readmePath = resolve(root, 'README.md');
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8');
  if (/AWS Amplify Auth/.test(readme)) fail('README.md still claims AWS Amplify Auth is the auth provider');
}

if (errors.length > 0) {
  console.error('Agent-document check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Agent-document and workflow check OK.');
