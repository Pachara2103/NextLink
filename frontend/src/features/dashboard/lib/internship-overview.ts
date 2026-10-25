import rawDataset from "../data/internship-companies.json";

/**
 * Mock data for the internship overview tab (ภาพรวม).
 *
 * The legacy internship fixture holds only a handful of applications per term,
 * which leaves every chart nearly empty. This builds a larger, explicitly
 * synthetic cohort for one academic year: openings with seat counts, students
 * with up to five ranked choices, and a deterministic match. The same year
 * always produces the same numbers, so server and client renders agree.
 *
 * Replace `buildInternshipOverview` with a real importer later; the aggregate
 * helpers below only depend on the exported types.
 */

export type StudyYear = 1 | 2 | 3;
export type StudyYearFilter = "all" | `${StudyYear}`;
export const STUDY_YEARS: StudyYear[] = [1, 2, 3];
export const OVERVIEW_RANKS = [1, 2, 3, 4, 5] as const;
export type OverviewRank = typeof OVERVIEW_RANKS[number];

export type OverviewCompany = { id: string; name: string; shortName: string; industry: string };
export type OverviewOpening = { id: string; companyId: string; title: string; seats: number };
export type OverviewChoice = { rank: OverviewRank; openingId: string };
export type OverviewStudent = { id: string; studyYear: StudyYear; choices: OverviewChoice[]; placement: OverviewChoice | null };
export type InternshipOverviewData = { academicYear: number; companies: OverviewCompany[]; openings: OverviewOpening[]; students: OverviewStudent[] };

type RawCompany = { id: string; name: string; shortName: string; industry: string; positions: { name: string }[] };

/** Extra titles so each company advertises a realistic spread of roles. */
const EXTRA_TITLES = ["Software Engineer", "Data Analyst", "QA Engineer", "Business Analyst", "UX/UI Designer", "Cloud Engineer", "Mobile Developer", "AI Engineer"];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: T[], weight: (item: T) => number, random: () => number) {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let roll = random() * total;
  for (const item of items) { roll -= weight(item); if (roll <= 0) return item; }
  return items[items.length - 1];
}

const cache = new Map<number, InternshipOverviewData>();

export function buildInternshipOverview(academicYear: number): InternshipOverviewData {
  const hit = cache.get(academicYear);
  if (hit) return hit;
  const random = mulberry32(academicYear * 7919);
  const raw = rawDataset.companies as RawCompany[];

  const companies: OverviewCompany[] = raw.map(c => ({ id: c.id, name: c.name, shortName: c.shortName, industry: c.industry }));
  const openings: (OverviewOpening & { weight: number })[] = [];
  raw.forEach((company, companyIndex) => {
    // Popularity varies by company and shifts a little from year to year.
    const popularity = 0.35 + random() * 2.6 * (companyIndex % 4 === 0 ? 1.4 : 1);
    // Not every partner opens a round every year.
    if (random() < 0.14) return;
    const titles = [...company.positions.map(p => p.name)];
    const extra = Math.floor(random() * 3);
    for (let i = 0; i < extra; i++) {
      const title = EXTRA_TITLES[Math.floor(random() * EXTRA_TITLES.length)];
      if (!titles.includes(title)) titles.push(title);
    }
    titles.forEach((title, index) => {
      // Roughly one opening in eight is a niche role almost nobody picks, so
      // the "open but unfilled" view always has something to show.
      const niche = random() < 0.13;
      openings.push({ id: `${company.id}:overview:${index + 1}`, companyId: company.id, title, seats: 1 + Math.floor(random() * 5),
        weight: niche ? 0.02 : popularity * (0.5 + random()) });
    });
  });

  const studentCount = 150 + Math.floor(random() * 40) + (academicYear % 3) * 12;
  const students: OverviewStudent[] = Array.from({ length: studentCount }, (_, i) => {
    const roll = random();
    const studyYear: StudyYear = roll < 0.22 ? 1 : roll < 0.6 ? 2 : 3;
    const chosen: OverviewChoice[] = [];
    const pool = [...openings];
    for (const rank of OVERVIEW_RANKS) {
      // Some first- and second-year students stop before five choices.
      if (rank > 3 && studyYear < 3 && random() < 0.3) break;
      const pick = pickWeighted(pool, o => o.weight, random);
      pool.splice(pool.indexOf(pick), 1);
      chosen.push({ rank, openingId: pick.id });
    }
    return { id: `overview-${academicYear}-student-${String(i + 1).padStart(3, "0")}`, studyYear, choices: chosen, placement: null };
  });

  // Students are matched in a fixed shuffle (seniors get a small head start);
  // each takes the highest-ranked choice that still has a seat.
  const seatsLeft = new Map(openings.map(o => [o.id, o.seats]));
  const order = students.map(s => ({ s, key: random() - s.studyYear * 0.15 })).sort((a, b) => a.key - b.key).map(x => x.s);
  for (const student of order) {
    const choice = student.choices.find(c => (seatsLeft.get(c.openingId) ?? 0) > 0);
    if (!choice) continue;
    seatsLeft.set(choice.openingId, seatsLeft.get(choice.openingId)! - 1);
    student.placement = choice;
  }

  const open = new Set(openings.map(o => o.companyId));
  const data: InternshipOverviewData = { academicYear, companies: companies.filter(c => open.has(c.id)), openings: openings.map(o => ({ id: o.id, companyId: o.companyId, title: o.title, seats: o.seats })), students };
  cache.set(academicYear, data);
  return data;
}

const inYear = (filter: StudyYearFilter) => (student: OverviewStudent) => filter === "all" || String(student.studyYear) === filter;

export function overviewKpis(data: InternshipOverviewData) {
  const companiesWithOpenings = new Set(data.openings.map(o => o.companyId));
  const matched = data.students.filter(s => s.placement).length;
  return {
    students: data.students.length,
    companies: companiesWithOpenings.size,
    openings: data.openings.length,
    seats: data.openings.reduce((sum, o) => sum + o.seats, 0),
    matched,
    matchRate: data.students.length ? Math.round(matched / data.students.length * 100) : 0,
  };
}

export type CompanyRankRow = { company: OverviewCompany; byRank: Record<OverviewRank, number>; total: number };
/** Picks per company split by rank, counted from each student's choices. */
export function companyRankCounts(data: InternshipOverviewData, year: StudyYearFilter): CompanyRankRow[] {
  const openingCompany = new Map(data.openings.map(o => [o.id, o.companyId]));
  const rows = new Map(data.companies.map(company => [company.id, { company, byRank: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0 } as CompanyRankRow]));
  for (const student of data.students.filter(inYear(year))) {
    // A student who lists two roles at one company counts once per rank they used.
    for (const choice of student.choices) {
      const row = rows.get(openingCompany.get(choice.openingId) ?? "");
      if (!row) continue;
      row.byRank[choice.rank]++; row.total++;
    }
  }
  return [...rows.values()];
}

export type PositionPickRow = { opening: OverviewOpening; company: OverviewCompany; picks: number; first: number };
export function positionPicks(data: InternshipOverviewData, year: StudyYearFilter): PositionPickRow[] {
  const companyById = new Map(data.companies.map(c => [c.id, c]));
  const rows = new Map(data.openings.map(opening => [opening.id, { opening, company: companyById.get(opening.companyId)!, picks: 0, first: 0 }]));
  for (const student of data.students.filter(inYear(year))) for (const choice of student.choices) {
    const row = rows.get(choice.openingId);
    if (!row) continue;
    row.picks++; if (choice.rank === 1) row.first++;
  }
  return [...rows.values()];
}

export type CompanyPlacementRow = { company: OverviewCompany; byYear: Record<StudyYear, number>; total: number };
export function placementsByCompany(data: InternshipOverviewData): CompanyPlacementRow[] {
  const openingCompany = new Map(data.openings.map(o => [o.id, o.companyId]));
  const rows = new Map(data.companies.map(company => [company.id, { company, byYear: { 1: 0, 2: 0, 3: 0 }, total: 0 } as CompanyPlacementRow]));
  for (const student of data.students) {
    if (!student.placement) continue;
    const row = rows.get(openingCompany.get(student.placement.openingId) ?? "");
    if (!row) continue;
    row.byYear[student.studyYear]++; row.total++;
  }
  return [...rows.values()];
}

export type OpeningFillRow = { opening: OverviewOpening; filled: number; picks: number };
export type CompanySeatRow = { company: OverviewCompany; seats: number; filled: number; openings: OpeningFillRow[]; emptyOpenings: number };
export function seatsByCompany(data: InternshipOverviewData): CompanySeatRow[] {
  const filled = new Map<string, number>(), picks = new Map<string, number>();
  for (const student of data.students) {
    for (const choice of student.choices) picks.set(choice.openingId, (picks.get(choice.openingId) ?? 0) + 1);
    if (student.placement) filled.set(student.placement.openingId, (filled.get(student.placement.openingId) ?? 0) + 1);
  }
  return data.companies.map(company => {
    const openings = data.openings.filter(o => o.companyId === company.id)
      .map(opening => ({ opening, filled: filled.get(opening.id) ?? 0, picks: picks.get(opening.id) ?? 0 }));
    return { company, openings, seats: openings.reduce((n, o) => n + o.opening.seats, 0), filled: openings.reduce((n, o) => n + o.filled, 0),
      emptyOpenings: openings.filter(o => o.opening.seats > 0 && o.filled === 0).length };
  });
}

/** A round axis maximum with 4 even steps (e.g. 37 → 40, steps of 10). */
export function niceScale(max: number, steps = 4) {
  const raw = Math.max(max, 1) / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= raw) ?? raw;
  const top = Math.max(step * steps, Math.ceil(max / step) * step);
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100) };
}
