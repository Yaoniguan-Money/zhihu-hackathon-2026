import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundledZip = path.join(skillRoot, 'assets', 'zhihu-cli-skill.zip');
const expectedSha256 = '7408ea4cb339c27294c3d664ac2f8c14b21b30c24b2bfb82dc0bd86d78443fb2';

function execFileResult(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { ...options, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        exitCode: error?.code ?? 0,
        stdout: stdout?.toString().trim() || '',
        stderr: stderr?.toString().trim() || '',
      });
    });
  });
}

function archiveTool() {
  return process.platform === 'win32' ? 'tar' : '/usr/bin/unzip';
}

function listArchiveArgs() {
  return process.platform === 'win32' ? ['-tf', bundledZip] : ['-Z1', bundledZip];
}

function extractArchiveArgs(dest) {
  return process.platform === 'win32'
    ? ['-xf', bundledZip, '-C', dest]
    : ['-q', bundledZip, '-d', dest];
}

async function validateArchive() {
  const bytes = await readFile(bundledZip);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256) throw new Error('Bundled official Skill checksum mismatch.');

  const listing = await execFileResult(archiveTool(), listArchiveArgs());
  if (!listing.ok) throw new Error('Unable to inspect bundled official Skill archive.');
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (!entries.includes('zhihu/SKILL.md')) throw new Error('Official Skill archive is missing zhihu/SKILL.md.');
  if (
    entries.some(
      (entry) =>
        !entry.startsWith('zhihu/') ||
        entry.startsWith('/') ||
        entry.split('/').some((part) => part === '..'),
    )
  ) {
    throw new Error('Official Skill archive contains an unsafe path.');
  }
  return { sha256, entries: entries.length };
}

export async function installOfficialSkill(projectDir) {
  const archive = await validateArchive();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'zhihu-hackathon-skill-'));
  const targetSkillsDir = path.join(projectDir, '.codex', 'skills');
  const target = path.join(targetSkillsDir, 'zhihu');

  try {
    const unzip = await execFileResult(archiveTool(), extractArchiveArgs(tempDir));
    if (!unzip.ok) throw new Error('Unable to extract bundled official Skill.');
    const extracted = path.join(tempDir, 'zhihu');
    const files = await readdir(extracted);
    if (!files.includes('SKILL.md')) throw new Error('Extracted official Skill is incomplete.');
    await mkdir(targetSkillsDir, { recursive: true });
    await rm(target, { recursive: true, force: true });
    await cp(extracted, target, { recursive: true, errorOnExist: false });
    return { target, ...archive };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!projectDir) {
    process.stderr.write('Usage: node install_official_skill.mjs <project-dir>\n');
    process.exit(2);
  }
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...(await installOfficialSkill(projectDir)) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(1);
  }
}
