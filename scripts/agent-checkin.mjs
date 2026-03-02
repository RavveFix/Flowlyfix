#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const MEMORY_PATH = 'docs/agent-memory.md';

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
    return stderr.trim();
  }
}

function toNonEmptyLines(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(content, title) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm');
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

function extractBullets(sectionText) {
  return sectionText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));
}

function extractCodeRefs(text) {
  const refs = [];
  const regex = /`([^`]+)`/g;
  let match = regex.exec(text);
  while (match) {
    refs.push(match[1]);
    match = regex.exec(text);
  }
  return refs;
}

function stripPrefix(text) {
  return text
    .replace(/^-+\s*/, '')
    .replace(/^\[[0-9]{4}-[0-9]{2}-[0-9]{2}\]\s*/i, '')
    .replace(/^\[(P[1-3])\]\s*/i, '')
    .trim();
}

function limitText(text, maxLength = 170) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function isAuthOrSupabaseFile(path) {
  return (
    path.startsWith('supabase/') ||
    path.startsWith('src/features/auth/') ||
    path.startsWith('src/shared/lib/supabase/') ||
    path.startsWith('src/features/resources/api/resourcesRepo.ts') ||
    path.startsWith('src/features/resources/state/ResourceContext.tsx')
  );
}

function looksLikeQuestion(text) {
  return text.trim().endsWith('?');
}

function asQuestion(text) {
  const normalized = text.trim();
  if (looksLikeQuestion(normalized)) return normalized;
  return `${normalized}?`;
}

function dedupe(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function parsePriority(line) {
  const match = line.match(/\[(P[1-3])\]/i);
  if (!match) return 99;
  if (match[1].toUpperCase() === 'P1') return 1;
  if (match[1].toUpperCase() === 'P2') return 2;
  if (match[1].toUpperCase() === 'P3') return 3;
  return 99;
}

function buildQuestions(params) {
  const {
    changedFiles,
    authTouched,
    memoryRiskBullets,
    memoryNextQuestionBullets,
    memoryDecisionBullets,
  } = params;

  const questions = [];
  const changedSet = new Set(changedFiles);

  if (authTouched) {
    const authAreas = changedFiles.filter((file) => isAuthOrSupabaseFile(file)).slice(0, 2);
    const authAreaText =
      authAreas.length > 0
        ? authAreas.map((file) => `\`${file}\``).join(' och ')
        : '`src/features/auth/state/AuthContext.tsx` och `supabase/functions/`';

    questions.push(
      `Vi har auth/supabase-ändringar i ${authAreaText}. Ska vi starta nästa steg med stabilitetsfokus för session, callback och org-kontekst innan ny feature byggs?`,
    );
  }

  const membershipAreas = changedFiles.filter((file) =>
    /(organization_memberships|active-organization|active_organization|AuthContext|RequireRole|router)/i.test(file),
  );
  if (membershipAreas.length > 0) {
    questions.push(
      `Vi har ändringar i multi-org-området runt \`${membershipAreas[0]}\`. Vill du att vi prioriterar ett riktat testfall för org-byte och rollskifte i samma session?`,
    );
  }

  const inviteAreas = changedFiles.filter((file) => /(invite|organization_invites|ResourcesPage|resourcesRepo)/i.test(file));
  if (inviteAreas.length > 0) {
    questions.push(
      `Invite-spåret är berört via \`${inviteAreas[0]}\`. Ska vi förbättra duplicate/resend/revoke-flödet innan vi lägger till nya adminfunktioner?`,
    );
  }

  const migrationAreas = changedFiles.filter((file) => file.startsWith('supabase/migrations/'));
  if (migrationAreas.length > 0) {
    questions.push(
      `Vi har migreringsändringar i \`${migrationAreas[0]}\`. Vill du att vi tar fram en verifieringschecklista för RLS och medlemskapsguardrails direkt efter nästa ändring?`,
    );
  }

  const e2eAreas = changedFiles.filter((file) => file.startsWith('tests/e2e/'));
  if (e2eAreas.length > 0) {
    questions.push(
      `E2E-sviten är uppdaterad i \`${e2eAreas[0]}\`. Ska vi nu lägga till ett extra auth/multi-org-scenario för att minska regressionsrisk?`,
    );
  }

  if (changedSet.size === 0) {
    const sortedRisks = [...memoryRiskBullets].sort((a, b) => parsePriority(a) - parsePriority(b));
    const topRisk = sortedRisks[0] ?? '';
    const riskRefs = extractCodeRefs(topRisk);
    if (topRisk) {
      const riskArea = riskRefs[0] ? `\`${riskRefs[0]}\`` : '`src/features/auth/state/AuthContext.tsx`';
      questions.push(`I minnet är topp-risken kopplad till ${riskArea}. Ska vi prioritera den risken som första uppgift i nästa pass?`);
    }

    const latestDecision = memoryDecisionBullets[0] ?? '';
    if (latestDecision) {
      questions.push(
        `Senaste beslutsloggen pekar på check-in-loopen via \`scripts/agent-checkin.mjs\`. Vill du att vi justerar frågelogiken eller behåller den som standard?`,
      );
    }

    const nextPrompt = memoryNextQuestionBullets[0] ?? '';
    if (nextPrompt) {
      const nextRefs = extractCodeRefs(nextPrompt);
      const nextArea = nextRefs[0] ? `\`${nextRefs[0]}\`` : '`docs/agent-memory.md`';
      questions.push(`I frågelistan för nästa pass finns fokus kring ${nextArea}. Ska den bli huvudspåret direkt?`);
    }
  }

  const sortedRisks = [...memoryRiskBullets].sort((a, b) => parsePriority(a) - parsePriority(b));
  for (const risk of sortedRisks) {
    if (questions.length >= 4) break;
    const refs = extractCodeRefs(risk);
    const area = refs[0] ? `\`${refs[0]}\`` : '`src/features/auth/state/AuthContext.tsx`';
    questions.push(`Vill du att vi tar nästa förbättring i risklistan med fokus på ${area} i nästa iteration?`);
  }

  const unique = dedupe(questions).map(asQuestion);

  if (unique.length < 2) {
    unique.push(
      'Ska vi validera authstabilitet i `src/features/auth/state/AuthContext.tsx` och `src/features/auth/pages/AuthCallbackPage.tsx` innan nästa implementation?',
    );
  }

  if (unique.length < 2) {
    unique.push('Vill du att vi prioriterar invite-kvalitet i `supabase/functions/invite-technician/index.ts` i nästa pass?');
  }

  return dedupe(unique).slice(0, 4);
}

const date = new Date().toISOString().slice(0, 10);
const branch = runCommand('git rev-parse --abbrev-ref HEAD') || 'unknown';
const statusLines = toNonEmptyLines(runCommand('git status --short'));
const changedFiles = toNonEmptyLines(runCommand('git diff --name-only'));
const logLines = toNonEmptyLines(runCommand('git log -n 12 --date=short --pretty=format:%h\\ %ad\\ %s'));

const memoryExists = existsSync(MEMORY_PATH);
const memoryContent = memoryExists ? readFileSync(MEMORY_PATH, 'utf8') : '';
const memoryRiskBullets = memoryExists ? extractBullets(extractSection(memoryContent, 'Kända risker / förbättringar')) : [];
const memoryNextQuestionBullets = memoryExists ? extractBullets(extractSection(memoryContent, 'Frågor till nästa pass')) : [];
const memoryDecisionBullets = memoryExists ? extractBullets(extractSection(memoryContent, 'Beslutslogg')) : [];

const topRisk = memoryRiskBullets.length > 0 ? stripPrefix([...memoryRiskBullets].sort((a, b) => parsePriority(a) - parsePriority(b))[0]) : '';
const authTouched = changedFiles.some((file) => isAuthOrSupabaseFile(file));

const questions = buildQuestions({
  changedFiles,
  authTouched,
  memoryRiskBullets,
  memoryNextQuestionBullets,
  memoryDecisionBullets,
});

const changedPreview = changedFiles.length > 0 ? changedFiles.slice(0, 5).map((file) => `\`${file}\``).join(', ') : 'inga diff-filer';
const commitPreview = logLines.length > 0 ? logLines.slice(0, 3).join(' | ') : 'inga commits hittades';

console.log('## Lägesbild');
console.log(`- Datum: ${date}`);
console.log(`- Gren: ${branch}`);
console.log(`- Okommitterade poster (git status --short): ${statusLines.length}`);
console.log(`- Ändrade filer i diff (git diff --name-only): ${changedFiles.length} (${changedPreview})`);
console.log(`- Senaste commits (ur git log -n 12): ${limitText(commitPreview, 220)}`);
if (memoryExists) {
  console.log(`- Minnesfil: ${MEMORY_PATH} läst (${memoryRiskBullets.length} risker, ${memoryNextQuestionBullets.length} nästa-pass-frågor).`);
  if (topRisk) {
    console.log(`- Topp-risk enligt minnet: ${limitText(topRisk)}`);
  }
} else {
  console.log(`- Minnesfil: ${MEMORY_PATH} saknas.`);
}

console.log('');
console.log('## Frågor till dig');
for (const [index, question] of questions.entries()) {
  console.log(`${index + 1}. ${question}`);
}
