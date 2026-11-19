import fs from 'node:fs';
import path from 'node:path';
import { auditContentSources } from '../src/utils/cardAudit';

const rootDir = process.cwd();
const files = [
  { name: 'src/content-fmroot.html', html: fs.readFileSync(path.join(rootDir, 'src/content-fmroot.html'), 'utf8') },
  { name: 'src/content-gen.html', html: fs.readFileSync(path.join(rootDir, 'src/content-gen.html'), 'utf8') },
  { name: 'src/content-thmroot.html', html: fs.readFileSync(path.join(rootDir, 'src/content-thmroot.html'), 'utf8') },
];

const report = auditContentSources(files);

console.log(`Scanned ${report.totalSections} sections, ${report.totalCards} cards (${report.codeCards} code cards).`);
console.log(`Total issues found: ${report.issues.length}`);
console.log('\nBy category:');
for (const [cat, count] of Object.entries(report.countsByCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
console.log('\nBy course:');
for (const [course, count] of Object.entries(report.countsByCourse).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${course}: ${count}`);
}

const byCategory = new Map<string, typeof report.issues>();
for (const issue of report.issues) {
  const list = byCategory.get(issue.category) || [];
  list.push(issue);
  byCategory.set(issue.category, list);
}

for (const [cat, list] of byCategory.entries()) {
  console.log(`\n==================== ${cat} (${list.length}) ====================`);
  for (const item of list) {
    console.log(
      `[${item.severity.toUpperCase()}] [${item.course}] ${item.sourceFile} | ${item.sectionId} #${String(item.cardIndex).padStart(2, '0')} (${item.cardId}) "${item.cardTitle}"`
    );
    console.log(`   field=${item.field} | ${item.message}`);
    console.log(`   excerpt: ${item.excerpt}`);
  }
}
