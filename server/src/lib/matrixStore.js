// File: server/src/lib/matrixStore.js
import Papa from "papaparse";

let matrix = {
  loaded: false,
  loadedAt: null,
  tabs: [],
  error: null
};

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function safeLower(value) {
  return normalizeCell(value).toLowerCase();
}

function extractSheetId(urlOrId) {
  const raw = String(urlOrId || "").trim();
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(raw)) return raw;
  return "";
}

function parseTabsJson(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return [];
  const arr = JSON.parse(txt);
  return arr
    .map((item) => ({
      tabName: String(item?.tabName || "").trim(),
      gid: Number(item?.gid)
    }))
    .filter((item) => item.tabName && Number.isFinite(item.gid));
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch matrix tab (${response.status}).`);
  }
  return response.text();
}

async function loadCsvFromGid(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const csv = await fetchText(url);
  const parsed = Papa.parse(csv, { skipEmptyLines: false });
  return (parsed.data || []).map((row) => (row || []).map(normalizeCell));
}

function tokenize(text) {
  return safeLower(text)
    .replace(/[^\p{L}\p{N}\s/#&-]+/gu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 30);
}

function expandTerms(baseTerms) {
  const set = new Set(baseTerms.map((term) => term.toLowerCase()));

  const synonymGroups = [
    ["check in", "check-in", "front desk", "arrival"],
    ["sold out", "oversold", "overbooked", "no rooms", "no room", "walked", "walk"],
    ["payment", "charged", "charge", "pay", "prepaid", "prepaid booking"],
    ["refund", "compensation", "voucher", "rebook", "relocate", "relocation"],
    ["late check out", "late checkout", "early check in", "early check-in"]
  ];

  const joined = Array.from(set).join(" ");

  for (const group of synonymGroups) {
    if (group.some((term) => joined.includes(term))) {
      for (const term of group) set.add(term);
    }
  }

  return Array.from(set);
}

function looksLikeNoiseRow(row) {
  const joined = row.map(normalizeCell).join(" ").trim();
  if (!joined) return true;

  const lowered = joined.toLowerCase();
  const veryShort = joined.length <= 4;
  const dividerLike = /^[\s|:_\-=/\\.#]+$/.test(joined);

  return veryShort || dividerLike || lowered === "n/a";
}

function isLikelyHeaderRow(row) {
  const lowered = row.map((cell) => safeLower(cell)).filter(Boolean);
  if (!lowered.length) return false;

  const knownHeaderTerms = [
    "instructions",
    "slack",
    "refund queue",
    "refund",
    "create a ticket",
    "ticket",
    "supervisor",
    "issue",
    "scenario",
    "policy",
    "agent script",
    "steps",
    "notes",
    "action"
  ];

  let hits = 0;
  for (const cell of lowered) {
    if (knownHeaderTerms.some((term) => cell.includes(term))) {
      hits += 1;
    }
  }

  return hits >= 2;
}

function findHeaderRow(rows) {
  const scanMax = Math.min(rows.length, 120);

  for (let r = 0; r < scanMax; r += 1) {
    const row = rows[r] || [];
    if (isLikelyHeaderRow(row)) return r;
  }

  return -1;
}

function findColumnIndex(headerRow, aliases) {
  const normalized = (headerRow || []).map((cell) => safeLower(cell));

  for (let i = 0; i < normalized.length; i += 1) {
    const cell = normalized[i];
    if (!cell) continue;
    if (aliases.some((alias) => cell === alias || cell.includes(alias))) {
      return i;
    }
  }

  return -1;
}

function buildHeaderMap(headerRow) {
  return {
    instructionsCol: findColumnIndex(headerRow, ["instructions", "instruction", "steps", "procedure", "process", "action"]),
    slackCol: findColumnIndex(headerRow, ["slack"]),
    refundCol: findColumnIndex(headerRow, ["refund queue", "refund"]),
    ticketCol: findColumnIndex(headerRow, ["create a ticket", "ticket", "case", "create ticket"]),
    supervisorCol: findColumnIndex(headerRow, ["supervisor", "escalation", "escalate"]),
    scriptCol: findColumnIndex(headerRow, ["agent script", "script", "verbiage"]),
    scenarioCol: findColumnIndex(headerRow, ["scenario", "issue", "question", "call reason", "topic"])
  };
}

function scorePhraseMatches(text, phrases, multiplier = 1) {
  const lowered = safeLower(text);
  let score = 0;

  for (const phrase of phrases) {
    if (!phrase) continue;
    const p = phrase.toLowerCase();

    if (p.includes(" ")) {
      if (lowered.includes(p)) score += 14 * multiplier;
    } else {
      if (lowered.includes(p)) score += 5 * multiplier;
    }
  }

  return score;
}

function penaltyForMismatch(joinedLower, expandedTerms) {
  let penalty = 0;

  const soldOutTerms = ["sold out", "oversold", "overbooked", "no rooms", "walked"];
  const earlyLateTerms = ["early check in", "early check-in", "late check out", "late checkout"];

  const askedAboutSoldOut = expandedTerms.some((term) => soldOutTerms.includes(term));
  const rowLooksEarlyLate = earlyLateTerms.some((term) => joinedLower.includes(term));

  if (askedAboutSoldOut && rowLooksEarlyLate) {
    penalty += 18;
  }

  return penalty;
}

function computeRowScore(row, query, baseTerms, expandedTerms, headerMap) {
  if (!row?.length) return 0;
  if (looksLikeNoiseRow(row)) return 0;

  const joined = row.map(normalizeCell).filter(Boolean).join(" | ");
  const joinedLower = joined.toLowerCase();
  if (!joinedLower) return 0;

  let score = 0;

  if (joinedLower.includes(query)) {
    score += 50;
  }

  score += scorePhraseMatches(joinedLower, expandedTerms, 1);

  const scenarioCell =
    headerMap?.scenarioCol >= 0 ? normalizeCell(row[headerMap.scenarioCol]) : "";
  const instructionsCell =
    headerMap?.instructionsCol >= 0 ? normalizeCell(row[headerMap.instructionsCol]) : "";

  score += scorePhraseMatches(scenarioCell, expandedTerms, 2);
  score += scorePhraseMatches(instructionsCell, expandedTerms, 1.25);

  for (const term of baseTerms) {
    if (scenarioCell.toLowerCase().includes(term)) score += 8;
    if (instructionsCell.toLowerCase().includes(term)) score += 3;
  }

  score -= penaltyForMismatch(joinedLower, expandedTerms);

  if (isLikelyHeaderRow(row)) {
    score -= 25;
  }

  return score;
}

function dedupeHits(hits) {
  const seen = new Set();
  return hits.filter((hit) => {
    const key = `${hit.tabName}|${hit.row}|${hit.col}|${hit.label}|${hit.exact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addHit(hits, { tabName, row, col, exact, label }) {
  const value = normalizeCell(exact);
  if (!value) return;
  hits.push({
    tabName,
    row,
    col,
    exact: value,
    label
  });
}

function rowWindow(rows, rowIndex, before = 1, after = 1) {
  const start = Math.max(0, rowIndex - before);
  const end = Math.min(rows.length - 1, rowIndex + after);
  const out = [];

  for (let i = start; i <= end; i += 1) {
    out.push({ rowIndex0: i, row: rows[i] || [] });
  }

  return out;
}

export function getMatrixStatus() {
  return {
    loaded: matrix.loaded,
    loadedAt: matrix.loadedAt,
    tabs: matrix.tabs.map((tab) => ({
      tabName: tab.tabName,
      gid: tab.gid,
      width: tab.width,
      height: tab.height,
      headerRowIndex: tab.headerRowIndex
    })),
    error: matrix.error
  };
}

export async function refreshMatrix() {
  const sheetId =
    extractSheetId(process.env.MATRIX_SHEET_ID) ||
    extractSheetId(process.env.MATRIX_SHEET_URL);

  if (!sheetId) {
    throw new Error("Missing MATRIX_SHEET_ID or MATRIX_SHEET_URL.");
  }

  const tabs = parseTabsJson(process.env.MATRIX_TABS_JSON || "[]");
  if (!tabs.length) {
    throw new Error("MATRIX_TABS_JSON is empty.");
  }

  const loadedTabs = [];

  for (const tab of tabs) {
    const rows = await loadCsvFromGid(sheetId, tab.gid);
    const headerRowIndex = findHeaderRow(rows);
    const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] || [] : [];
    const headerMap = headerRowIndex >= 0 ? buildHeaderMap(headerRow) : null;

    loadedTabs.push({
      tabName: tab.tabName,
      gid: tab.gid,
      rows,
      width: Math.max(0, ...rows.map((row) => row.length)),
      height: rows.length,
      headerRowIndex,
      headerMap
    });
  }

  matrix = {
    loaded: true,
    loadedAt: new Date().toISOString(),
    tabs: loadedTabs,
    error: null
  };

  return getMatrixStatus();
}

export function searchMatrix(queryText) {
  const query = normalizeCell(queryText);
  if (!matrix.loaded || !query) {
    return { found: false, hits: [], summary: { totalHits: 0 } };
  }

  const queryLower = query.toLowerCase();
  const baseTerms = tokenize(query);
  const expandedTerms = expandTerms(baseTerms);
  const rowCandidates = [];

  for (const tab of matrix.tabs) {
    for (let r = 0; r < tab.rows.length; r += 1) {
      if (tab.headerRowIndex >= 0 && r === tab.headerRowIndex) continue;

      const row = tab.rows[r] || [];
      const score = computeRowScore(
        row,
        queryLower,
        baseTerms,
        expandedTerms,
        tab.headerMap
      );

      if (score > 0) {
        rowCandidates.push({
          tab,
          rowIndex0: r,
          row,
          score
        });
      }
    }
  }

  rowCandidates.sort((a, b) => b.score - a.score);
  const topCandidates = rowCandidates.slice(0, 4);

  if (!topCandidates.length) {
    return { found: false, hits: [], summary: { totalHits: 0 } };
  }

  const hits = [];

  for (const candidate of topCandidates) {
    const { tab, rowIndex0, row } = candidate;
    const hm = tab.headerMap || {};

    const scenarioValue =
      typeof hm.scenarioCol === "number" && hm.scenarioCol >= 0
        ? row[hm.scenarioCol]
        : row.join(" | ");

    addHit(hits, {
      tabName: tab.tabName,
      row: rowIndex0 + 1,
      col: (typeof hm.scenarioCol === "number" && hm.scenarioCol >= 0 ? hm.scenarioCol : 0) + 1,
      exact: scenarioValue,
      label: "Matched Procedure Row"
    });

    const structuredCols = [
      [hm.instructionsCol, "Instructions"],
      [hm.slackCol, "Slack"],
      [hm.refundCol, "Refund Queue"],
      [hm.ticketCol, "Create a Ticket"],
      [hm.supervisorCol, "Supervisor"],
      [hm.scriptCol, "Agent Script"]
    ];

    for (const [colIndex, label] of structuredCols) {
      if (typeof colIndex !== "number" || colIndex < 0) continue;
      addHit(hits, {
        tabName: tab.tabName,
        row: rowIndex0 + 1,
        col: colIndex + 1,
        exact: row[colIndex],
        label
      });
    }

    const nearbyRows = rowWindow(tab.rows, rowIndex0, 1, 1);
    for (const nearby of nearbyRows) {
      if (nearby.rowIndex0 === rowIndex0) continue;
      if (looksLikeNoiseRow(nearby.row)) continue;
      if (isLikelyHeaderRow(nearby.row)) continue;

      addHit(hits, {
        tabName: tab.tabName,
        row: nearby.rowIndex0 + 1,
        col: 1,
        exact: nearby.row.join(" | "),
        label: nearby.rowIndex0 < rowIndex0 ? "Previous Row Context" : "Next Row Context"
      });
    }
  }

  const uniqueHits = dedupeHits(hits);
  const best = topCandidates[0];

  return {
    found: uniqueHits.length > 0,
    hits: uniqueHits,
    summary: {
      totalHits: rowCandidates.length,
      candidatesUsed: topCandidates.length,
      best: {
        tabName: best.tab.tabName,
        row: best.rowIndex0 + 1,
        score: best.score
      }
    }
  };
}