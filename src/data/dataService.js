// ─── DATA SERVICE ─────────────────────────────────────────────────────────────
// REST client for the Ninety One Internal Audit Tool.
//
// STATUS: In-memory stub active. No data is persisted.
// IT handover: set API_BASE_URL in src/config.js and uncomment the
// REST block for each function. Auth token is injected via getAccessToken().

import { config } from '../config';
import { getAccessToken } from '../auth/authService';

// ── In-memory store (interim — no persistence) ────────────────────────────────
let _store = {
  users:            [],
  audits:           [],
  signOffs:         [],
  reviewComments:   [],
  issues:           {},   // keyed by audit_id
  queries:          {},
  workingPapers:    {},
  auditMetadata:    {},
};

// ── REST helper (used once API_BASE_URL is set) ───────────────────────────────
async function api(method, path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${config.API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
  return res.json();
}

// ── USERS ─────────────────────────────────────────────────────────────────────
export async function fetchUsers() {
  // REST: return api('GET', '/users');
  return _store.users;
}

// ── AUDITS ────────────────────────────────────────────────────────────────────
export async function fetchAudits() {
  // REST: return api('GET', '/audits');
  return _store.audits;
}

export async function createAuditRecord(fields) {
  const id  = `audit-${Date.now()}`;
  const now = new Date().toISOString();
  const audit = {
    id,
    title:               fields.title || 'New Audit',
    entity:              fields.entity || '',
    audit_type:          fields.audit_type || 'Assurance',
    period_under_review: fields.period_under_review || '',
    planned_start:       fields.planned_start || null,
    planned_end:         fields.planned_end || null,
    status:              'Planning',
    year:                new Date().getFullYear(),
    lead_auditor_id:     fields.lead_auditor_id || null,
    reviewer_id:         fields.reviewer_id || null,
    created_at:          now,
  };
  const signOffs = ['Planning', 'Fieldwork', 'Reporting'].map((tab, i) => ({
    id:                 `so-${id}-${i}`,
    audit_id:           id,
    tab,
    task_ref:           `${tab.toLowerCase()}-complete`,
    auditor_id:         fields.lead_auditor_id || null,
    auditor_signed_at:  null,
    reviewer_id:        fields.reviewer_id || null,
    reviewer_signed_at: null,
    hia_id:             null,
    hia_signed_at:      null,
  }));
  const metadata = {
    audit_id:           id,
    budget:             {},
    timeline:           [],
    inherent_risk:      {},
    combined_assurance: {},
    scope_items:        {},
    tor:                {},
    racm_risks:         [],
    report:             {},
  };

  // REST:
  // await api('POST', '/audits', audit);
  // await api('POST', '/sign-offs/bulk', signOffs);
  // await api('POST', '/audit-metadata', metadata);

  _store.audits   = [..._store.audits, audit];
  _store.signOffs = [..._store.signOffs, ...signOffs];
  _store.auditMetadata[id] = metadata;
  _store.issues[id]        = [];
  _store.queries[id]       = [];
  _store.workingPapers[id] = [];
  return id;
}

export async function deleteAuditRecord(auditId) {
  // REST: await api('DELETE', `/audits/${auditId}`);
  _store.audits         = _store.audits.filter(a => a.id !== auditId);
  _store.signOffs       = _store.signOffs.filter(s => s.audit_id !== auditId);
  _store.reviewComments = _store.reviewComments.filter(c => c.audit_id !== auditId);
  delete _store.auditMetadata[auditId];
  delete _store.issues[auditId];
  delete _store.queries[auditId];
  delete _store.workingPapers[auditId];
}

export async function updateAuditField(auditId, field, value) {
  // REST: await api('PATCH', `/audits/${auditId}`, { [field]: value });
  _store.audits = _store.audits.map(a => a.id === auditId ? { ...a, [field]: value } : a);
}

// ── SIGN OFFS ─────────────────────────────────────────────────────────────────
export async function fetchSignOffs() {
  // REST: return api('GET', '/sign-offs');
  return _store.signOffs;
}

export async function signOffPhase(signOffId, role, userId) {
  const now = new Date().toISOString();
  const updates = {
    [`${role}_signed_at`]:  now,
    [`${role}_signed_by`]:  userId,
    [`${role}_revoked_by`]: null,
    [`${role}_revoked_at`]: null,
  };
  // REST: await api('PATCH', `/sign-offs/${signOffId}`, updates);
  _store.signOffs = _store.signOffs.map(s => s.id === signOffId ? { ...s, ...updates } : s);
}

export async function revokeSignOff(signOffId, role, userId) {
  const now = new Date().toISOString();
  const updates = {
    [`${role}_signed_at`]:  null,
    [`${role}_signed_by`]:  null,
    [`${role}_revoked_by`]: userId,
    [`${role}_revoked_at`]: now,
  };
  if (role === 'auditor') {
    Object.assign(updates, {
      reviewer_signed_at: null, reviewer_signed_by: null,
      reviewer_revoked_by: userId, reviewer_revoked_at: now,
      hia_signed_at: null, hia_signed_by: null,
      hia_revoked_by: userId, hia_revoked_at: now,
    });
  } else if (role === 'reviewer') {
    Object.assign(updates, {
      hia_signed_at: null, hia_signed_by: null,
      hia_revoked_by: userId, hia_revoked_at: now,
    });
  }
  // REST: await api('PATCH', `/sign-offs/${signOffId}`, updates);
  _store.signOffs = _store.signOffs.map(s => s.id === signOffId ? { ...s, ...updates } : s);
}

// ── REVIEW COMMENTS ───────────────────────────────────────────────────────────
export async function fetchReviewComments(auditId) {
  // REST: return api('GET', auditId && auditId !== 'all' ? `/review-comments?audit_id=${auditId}` : '/review-comments');
  if (!auditId || auditId === 'all') return _store.reviewComments;
  return _store.reviewComments.filter(c => c.audit_id === auditId);
}

export async function addReviewComment(comment) {
  const record = {
    id:            `rc-${Date.now()}`,
    audit_id:      comment.audit_id,
    tab:           comment.tab,
    section:       comment.sectionRef,
    section_ref:   comment.sectionRef,
    row_ref:       comment.rowRef || null,
    comment_text:  comment.comment_text,
    raised_by:     comment.raised_by,
    raised_at:     new Date().toISOString(),
    response_text: '',
    status:        'Open',
  };
  // REST: await api('POST', '/review-comments', record);
  _store.reviewComments = [..._store.reviewComments, record];
  return record;
}

export async function respondToComment(commentId, responseText, userId) {
  const updates = {
    response_text: responseText,
    responded_by:  userId,
    responded_at:  new Date().toISOString(),
    status:        'Responded',
  };
  // REST: await api('PATCH', `/review-comments/${commentId}`, updates);
  _store.reviewComments = _store.reviewComments.map(c => c.id === commentId ? { ...c, ...updates } : c);
}

export async function closeComment(commentId, userId) {
  const updates = { status: 'Closed', closed_by: userId, closed_at: new Date().toISOString() };
  // REST: await api('PATCH', `/review-comments/${commentId}`, updates);
  _store.reviewComments = _store.reviewComments.map(c => c.id === commentId ? { ...c, ...updates } : c);
}

// ── ISSUES ────────────────────────────────────────────────────────────────────
export async function fetchIssues(auditId) {
  // REST: return api('GET', `/issues?audit_id=${auditId}`);
  return _store.issues[auditId] || [];
}

export async function createIssue(issue) {
  const existing = _store.issues[issue.audit_id] || [];
  const lastNum  = existing.length > 0
    ? Math.max(...existing.map(i => parseInt(i.issue_ref.replace('ISSUE-', ''), 10) || 0))
    : 0;
  const record = {
    id:                          `issue-${Date.now()}`,
    audit_id:                    issue.audit_id,
    issue_ref:                   `ISSUE-${String(lastNum + 1).padStart(3, '0')}`,
    title:                       issue.title || '',
    condition:                   issue.condition || '',
    criteria:                    issue.criteria || '',
    cause:                       issue.cause || '',
    consequence:                 issue.consequence || '',
    risk_rating:                 issue.risk_rating || 'Moderate',
    management_action:           issue.management_action || '',
    action_owner:                issue.action_owner || '',
    due_date:                    issue.due_date || null,
    status:                      'Mgmt Response Pending',
    mgmt_response:               '',
    mgmt_respondent:             '',
    factual_accuracy_confirmed:  false,
    factual_accuracy_date:       null,
    promoted_from_query_id:      issue.promoted_from_query_id || null,
    created_at:                  new Date().toISOString(),
  };
  // REST: await api('POST', '/issues', record);
  _store.issues[issue.audit_id] = [...existing, record];
  return record;
}

export async function updateIssue(issueId, updates) {
  // REST: await api('PATCH', `/issues/${issueId}`, updates);
  Object.keys(_store.issues).forEach(auditId => {
    _store.issues[auditId] = _store.issues[auditId].map(i => i.id === issueId ? { ...i, ...updates } : i);
  });
}

// ── QUERIES ───────────────────────────────────────────────────────────────────
export async function fetchQueries(auditId) {
  // REST: return api('GET', `/queries?audit_id=${auditId}`);
  return _store.queries[auditId] || [];
}

export async function createQuery(query) {
  const existing = _store.queries[query.audit_id] || [];
  const lastNum  = existing.length > 0
    ? Math.max(...existing.map(q => parseInt(q.query_ref.replace('Q-', ''), 10) || 0))
    : 0;
  const record = {
    id:                   `q-${Date.now()}`,
    audit_id:             query.audit_id,
    query_ref:            `Q-${String(lastNum + 1).padStart(3, '0')}`,
    title:                query.title || '',
    description:          query.description || '',
    raised_by:            query.raised_by,
    raised_date:          new Date().toISOString().slice(0, 10),
    directed_to:          query.directed_to || '',
    control_ref:          query.control_ref || null,
    phase:                query.phase || 'Fieldwork',
    response:             '',
    status:               'Open',
    resolved_rationale:   null,
    promoted_to_issue_id: null,
  };
  // REST: await api('POST', '/queries', record);
  _store.queries[query.audit_id] = [...existing, record];
  return record;
}

export async function updateQuery(queryId, updates) {
  // REST: await api('PATCH', `/queries/${queryId}`, updates);
  Object.keys(_store.queries).forEach(auditId => {
    _store.queries[auditId] = _store.queries[auditId].map(q => q.id === queryId ? { ...q, ...updates } : q);
  });
}

// ── WORKING PAPERS ────────────────────────────────────────────────────────────
export async function fetchWorkingPapers(auditId) {
  // REST: return api('GET', `/working-papers?audit_id=${auditId}`);
  return _store.workingPapers[auditId] || [];
}

export async function createWorkingPaper(paper) {
  const record = {
    id:             `wp-${Date.now()}`,
    audit_id:       paper.audit_id,
    title:          paper.title || '',
    sharepoint_url: paper.sharepoint_url || '',
    status:         'Draft',
    created_by:     paper.created_by,
    created_at:     new Date().toISOString(),
  };
  // REST: await api('POST', '/working-papers', record);
  const existing = _store.workingPapers[paper.audit_id] || [];
  _store.workingPapers[paper.audit_id] = [...existing, record];
  return record;
}

export async function updateWorkingPaper(paperId, updates) {
  // REST: await api('PATCH', `/working-papers/${paperId}`, updates);
  Object.keys(_store.workingPapers).forEach(auditId => {
    _store.workingPapers[auditId] = _store.workingPapers[auditId].map(p => p.id === paperId ? { ...p, ...updates } : p);
  });
}

// ── AUDIT METADATA ────────────────────────────────────────────────────────────
export async function fetchAuditMetadata(auditId) {
  // REST: return api('GET', `/audit-metadata/${auditId}`);
  return _store.auditMetadata[auditId] || null;
}

export async function upsertAuditMetadata(auditId, key, value) {
  const META_KEY_MAP = {
    tor:               'tor',
    inherentRisk:      'inherent_risk',
    combinedAssurance: 'combined_assurance',
    scopeItems:        'scope_items',
    racmRisks:         'racm_risks',
    budget:            'budget',
    timeline:          'timeline',
    report:            'report',
  };
  const dbKey = META_KEY_MAP[key] || key;
  const existing = _store.auditMetadata[auditId] || { audit_id: auditId };
  // REST: await api('PUT', `/audit-metadata/${auditId}`, { [dbKey]: value });
  _store.auditMetadata[auditId] = { ...existing, [dbKey]: value, [key]: value };
}

// ── REALTIME (stubs — no-ops until IT provision websocket/webhook) ─────────────
export function subscribeToAudits(onchange)               { return null; }
export function subscribeToIssues(auditId, onchange)      { return null; }
export function subscribeToQueries(auditId, onchange)     { return null; }
export function subscribeToComments(auditId, onchange)    { return null; }
export function subscribeToSignOffs(onchange)             { return null; }
export function subscribeToWorkingPapers(auditId, onchange) { return null; }
export function unsubscribeAll(channels)                  { return; }
