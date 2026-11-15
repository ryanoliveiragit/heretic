// Budget — in-memory daily usage counter.
import { getDailyUsage, setDailyUsage } from './store.js';

const DAILY_LIMIT = 1000;
const DAILY_WARN = 900;

export function checkBudget() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = getDailyUsage(today);
  const count = usage ? usage.requests : 0;
  return {
    requests: count,
    limit: DAILY_LIMIT,
    warn: count >= DAILY_WARN,
    blocked: count >= DAILY_LIMIT,
  };
}

export function incrementUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = getDailyUsage(today);
  const count = (usage ? usage.requests : 0) + 1;
  setDailyUsage(today, count);
  return checkBudget();
}
