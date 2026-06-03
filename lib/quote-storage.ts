/**
 * PMZ Pricing Assistant — Quote & Job localStorage layer (data foundation only)
 * Safe JSON handling, consistent sorting (newest first by updatedAt/createdAt).
 * Do not use these keys anywhere else: 'pmz_saved_quotes', 'pmz_jobs'
 */

import type { SavedQuote, Job } from './quote-job-types';

const QUOTES_KEY = 'pmz_saved_quotes';
const JOBS_KEY = 'pmz_jobs';

// --- Internal safe loaders ---

function loadQuotes(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(QUOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadJobs(): Job[] {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQuotes(quotes: SavedQuote[]): void {
  try {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
  } catch {
    // storage full / private mode / quota — fail silently (consistent with other PMZ storage)
  }
}

function persistJobs(jobs: Job[]): void {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {
    // storage full / private mode / quota — fail silently
  }
}

// --- Quote helpers ---

export function saveQuote(quote: SavedQuote): void {
  const quotes = loadQuotes();
  const now = new Date().toISOString();

  const toSave: SavedQuote = {
    ...quote,
    createdAt: quote.createdAt || now,
    updatedAt: now,
  };

  const idx = quotes.findIndex((q) => q.id === toSave.id);
  if (idx >= 0) {
    quotes[idx] = toSave;
  } else {
    quotes.push(toSave);
  }

  persistQuotes(quotes);
}

export function getAllQuotes(): SavedQuote[] {
  const quotes = loadQuotes();
  return [...quotes].sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt;
    const bTime = b.updatedAt || b.createdAt;
    return bTime.localeCompare(aTime); // descending (newest first)
  });
}

export function getQuoteById(id: string): SavedQuote | null {
  const quotes = loadQuotes();
  return quotes.find((q) => q.id === id) ?? null;
}

export function deleteQuote(id: string): void {
  const quotes = loadQuotes().filter((q) => q.id !== id);
  persistQuotes(quotes);
}

export function updateQuote(quote: SavedQuote): void {
  const quotes = loadQuotes();
  const now = new Date().toISOString();

  const toSave: SavedQuote = {
    ...quote,
    updatedAt: now,
  };

  const idx = quotes.findIndex((q) => q.id === toSave.id);
  if (idx >= 0) {
    quotes[idx] = toSave;
  } else {
    // If not found, treat as insert (with createdAt)
    toSave.createdAt = toSave.createdAt || now;
    quotes.push(toSave);
  }

  persistQuotes(quotes);
}

// --- Job helpers ---

export function saveJob(job: Job): void {
  const jobs = loadJobs();
  const toSave: Job = { ...job }; // acceptedDate expected to be set by caller

  const idx = jobs.findIndex((j) => j.id === toSave.id);
  if (idx >= 0) {
    jobs[idx] = toSave;
  } else {
    jobs.push(toSave);
  }

  persistJobs(jobs);
}

export function getAllJobs(): Job[] {
  const jobs = loadJobs();
  return [...jobs].sort((a, b) => {
    const aTime = a.acceptedDate;
    const bTime = b.acceptedDate;
    return bTime.localeCompare(aTime); // descending (newest first)
  });
}

export function getJobById(id: string): Job | null {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === id) ?? null;
}

export function updateJob(job: Job): void {
  const jobs = loadJobs();

  const toSave: Job = { ...job };

  const idx = jobs.findIndex((j) => j.id === toSave.id);
  if (idx >= 0) {
    jobs[idx] = toSave;
  } else {
    jobs.push(toSave);
  }

  persistJobs(jobs);
}
