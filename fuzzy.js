/**
 * Fuzzy matching for chore names.
 * Tries exact match first, then substring, then Levenshtein distance.
 */

export function fuzzyMatch(input, chores) {
  const normalized = input.toLowerCase().trim();

  // 1. Exact alias match
  for (const chore of chores) {
    for (const alias of chore.aliases) {
      if (normalized === alias) return chore;
    }
  }

  // 2. Input contains alias OR alias contains input
  for (const chore of chores) {
    for (const alias of chore.aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) return chore;
    }
  }

  // 3. Levenshtein distance (typo tolerance)
  let bestMatch = null;
  let bestScore = Infinity;
  const MAX_DISTANCE = 3;

  for (const chore of chores) {
    for (const alias of chore.aliases) {
      // Only compare strings of similar length
      if (Math.abs(alias.length - normalized.length) > 5) continue;
      const dist = levenshtein(normalized, alias);
      if (dist < bestScore && dist <= MAX_DISTANCE) {
        bestScore = dist;
        bestMatch = chore;
      }
    }
  }

  // 4. Word overlap (handle multi-word inputs like "i did the laundry today")
  if (!bestMatch) {
    const inputWords = normalized.split(/\s+/).filter(w => w.length > 2);
    let topChore = null;
    let topOverlap = 0;

    for (const chore of chores) {
      for (const alias of chore.aliases) {
        const aliasWords = alias.split(/\s+/);
        const overlap = inputWords.filter(w => aliasWords.includes(w)).length;
        if (overlap > topOverlap) {
          topOverlap = overlap;
          topChore = chore;
        }
      }
    }

    if (topOverlap >= 1) bestMatch = topChore;
  }

  return bestMatch;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
