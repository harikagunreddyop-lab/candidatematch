export interface ResumeSection {
  name: string;
  text: string;
  startLine: number;
}

const SECTION_ALIASES: Record<string, string[]> = {
  summary: ['summary', 'professional summary', 'profile', 'about'],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
  ],
  education: ['education', 'education & training'],
  skills: ['skills', 'technical skills', 'key skills'],
  certifications: ['certifications', 'certification', 'licenses'],
  projects: ['projects', 'personal projects'],
  awards: ['awards', 'honors', 'honours'],
  languages: ['languages', 'language skills'],
  volunteer: ['volunteer', 'volunteer experience', 'community service'],
  publications: ['publications'],
};

function normalizeHeader(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:\-–—]+/g, ' ')
    .replace(/[^\w\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSectionName(rawLine: string): string | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.length > 60) return null;

  const norm = normalizeHeader(trimmed);
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.includes(norm)) {
      return canonical;
    }
  }
  return null;
}

export function parseResumeSections(text: string): ResumeSection[] {
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const sections: ResumeSection[] = [];

  let current: ResumeSection | null = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx];
    const headerName = detectSectionName(rawLine);
    const lineNumber = idx + 1;

    if (headerName) {
      if (current !== null) {
        sections.push({
          name: current.name,
          text: current.text.trimEnd(),
          startLine: current.startLine,
        });
      }
      current = {
        name: headerName,
        text: '',
        startLine: lineNumber,
      };
    } else if (current !== null) {
      current.text = current.text
        ? `${current.text}\n${rawLine}`
        : rawLine;
    }
  }

  if (current !== null) {
    sections.push({
      name: current.name,
      text: current.text.trimEnd(),
      startLine: current.startLine,
    });
  }

  return sections;
}

export function extractBullets(sectionText: string): string[] {
  if (!sectionText.trim()) return [];
  const bullets: string[] = [];
  const lines = sectionText.split(/\r?\n/);

  const bulletRegex = /^\s*(?:[\u2022•\-*]|\d+\.)\s*(.+)$/;

  for (const line of lines) {
    const m = bulletRegex.exec(line);
    if (m && m[1]) {
      bullets.push(m[1].trim());
    }
  }

  return bullets;
}

export function getSectionText(
  sections: ResumeSection[],
  name: string,
): string {
  const target = name.toLowerCase();
  const found = sections.find((s) => s.name.toLowerCase() === target);
  return found ? found.text : '';
}


