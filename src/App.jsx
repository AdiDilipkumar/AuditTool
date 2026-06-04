import { useState, useEffect } from 'react';
import { Badge, CommentDrawer } from './components/UI';
import PlanningTab from './tabs/PlanningTab';
import FieldworkTab from './tabs/FieldworkTab';
import ReportingTab from './tabs/ReportingTab';
import ReviewCommentsTab from './tabs/ReviewCommentsTab';
import PortfolioTab from './tabs/PortfolioTab';
import { computePlanningGates, PLANNING_GATE_KEYS } from './utils/planningGates';
import { initAuth, getCurrentUser, logout } from './auth/authService';
import {
  fetchUsers, fetchAudits, fetchSignOffs, fetchReviewComments,
  fetchIssues, fetchQueries, fetchWorkingPapers, fetchAuditMetadata,
  createAuditRecord, deleteAuditRecord,
  addReviewComment, respondToComment, closeComment,
  signOffPhase, revokeSignOff,
  createQuery, updateQuery,
  createIssue, updateIssue,
  createWorkingPaper, updateWorkingPaper,
  upsertAuditMetadata, updateAuditField,
  subscribeToAudits, subscribeToIssues, subscribeToQueries,
  subscribeToComments, subscribeToSignOffs, subscribeToWorkingPapers,
  unsubscribeAll,
} from './data/dataService';

const ENGAGEMENT_TABS = [
  { id: 'planning',  label: 'Planning'        },
  { id: 'fieldwork', label: 'Fieldwork'       },
  { id: 'reporting', label: 'Reporting'       },
  { id: 'review',    label: 'Review Comments' },
];

function getOpenCommentCount(comments, tab, auditId) {
  return comments.filter(c =>
    c.audit_id === auditId && c.tab === tab && c.status === 'Open'
  ).length;
}

function computeProgress(signOffs) {
  const result = {};
  signOffs.forEach(so => {
    if (!result[so.audit_id]) result[so.audit_id] = { planning: 0, fieldwork: 0, reporting: 0 };
    const tab = so.tab.toLowerCase();
    if (!['planning', 'fieldwork', 'reporting'].includes(tab)) return;
    let pct = 0;
    if (so.hia_signed_at)           pct = 100;
    else if (so.reviewer_signed_at) pct = 67;
    else if (so.auditor_signed_at)  pct = 33;
    result[so.audit_id][tab] = pct;
  });
  return result;
}

function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)', gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--ni-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>91</div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</p>
    </div>
  );
}

export default function App() {
  const [loading, setLoading]           = useState(true);
  const [users, setUsers]               = useState([]);
  const [currentUser, setCurrentUser]   = useState(null);
  const [audits, setAudits]             = useState([]);
  const [signOffs, setSignOffs]         = useState([]);
  const [reviewComments, setReviewComments] = useState([]);
  const [engagementData, setEngagementData] = useState(null);
  const [selectedAuditId, setSelectedAuditId]         = useState(null);
  const [activeEngagementTab, setActiveEngagementTab] = useState('planning');
  const [drawerState, setDrawerState] = useState({ open: false, sectionRef: null, rowRef: null, title: '', contextLabel: '' });
  const [channels, setChannels] = useState([]);
  const [planningSubTab, setPlanningSubTab] = useState(null);
  const [promoteQuery, setPromoteQuery] = useState(null);

  const openDrawer  = ({ sectionRef, rowRef, title, contextLabel }) => setDrawerState({ open: true, sectionRef, rowRef, title, contextLabel });
  const closeDrawer = () => setDrawerState(s => ({ ...s, open: false }));

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        await initAuth();
        const [user, usersData, auditsData, signOffsData, commentsData] = await Promise.all([
          getCurrentUser(),
          fetchUsers(), fetchAudits(), fetchSignOffs(), fetchReviewComments('all'),
        ]);
        setCurrentUser(user);
        setUsers(usersData);
        setAudits(auditsData);
        setSignOffs(signOffsData);
        setReviewComments(commentsData);
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  // ── Global realtime (no-ops until IT provision) ───────────────────────────
  useEffect(() => {
    const auditSub   = subscribeToAudits(async () => { setAudits(await fetchAudits()); });
    const signOffSub = subscribeToSignOffs(async () => { setSignOffs(await fetchSignOffs()); });
    return () => unsubscribeAll([auditSub, signOffSub]);
  }, []);

  // ── Per-engagement load ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAuditId) {
      setEngagementData(null);
      unsubscribeAll(channels);
      setChannels([]);
      return;
    }
    async function loadEngagement() {
      try {
        const [issues, queries, workingPapers, metadata, comments] = await Promise.all([
          fetchIssues(selectedAuditId),
          fetchQueries(selectedAuditId),
          fetchWorkingPapers(selectedAuditId),
          fetchAuditMetadata(selectedAuditId),
          fetchReviewComments(selectedAuditId),
        ]);
        setEngagementData({ auditId: selectedAuditId, issues, queries, workingPapers, metadata });
        setReviewComments(prev => [...prev.filter(c => c.audit_id !== selectedAuditId), ...comments]);
      } catch (err) { console.error('Engagement load error:', err); }
    }
    loadEngagement();
    const issueSub   = subscribeToIssues(selectedAuditId,      async () => { const f = await fetchIssues(selectedAuditId);        setEngagementData(p => p ? { ...p, issues: f }        : p); });
    const querySub   = subscribeToQueries(selectedAuditId,     async () => { const f = await fetchQueries(selectedAuditId);       setEngagementData(p => p ? { ...p, queries: f }       : p); });
    const paperSub   = subscribeToWorkingPapers(selectedAuditId, async () => { const f = await fetchWorkingPapers(selectedAuditId); setEngagementData(p => p ? { ...p, workingPapers: f } : p); });
    const commentSub = subscribeToComments(selectedAuditId,    async () => {
      const f = await fetchReviewComments(selectedAuditId);
      setReviewComments(prev => [...prev.filter(c => c.audit_id !== selectedAuditId), ...f]);
    });
    const newChannels = [issueSub, querySub, commentSub, paperSub];
    setChannels(newChannels);
    return () => unsubscribeAll(newChannels);
  }, [selectedAuditId]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setSelectedAuditId(null);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function handleSelectAudit(auditId) { setSelectedAuditId(auditId); setActiveEngagementTab('planning'); setPlanningSubTab(null); closeDrawer(); }
  function handleBackToPortfolio()    { setSelectedAuditId(null); setPlanningSubTab(null); closeDrawer(); }
  function handleTabChange(tabId, subTab) {
    setActiveEngagementTab(tabId);
    setPlanningSubTab(tabId === 'planning' ? (subTab || null) : null);
  }

  // ── Audit CRUD ────────────────────────────────────────────────────────────
  async function handleCreateAudit(fields) {
    try {
      const newId = await createAuditRecord(fields);
      const [fresh, freshSOs] = await Promise.all([fetchAudits(), fetchSignOffs()]);
      setAudits(fresh); setSignOffs(freshSOs);
      setSelectedAuditId(newId); setActiveEngagementTab('planning');
    } catch (err) { console.error('Create audit error:', err); }
  }
  async function handleDeleteAudit(auditId) {
    try {
      await deleteAuditRecord(auditId);
      setAudits(prev => prev.filter(a => a.id !== auditId));
      if (selectedAuditId === auditId) setSelectedAuditId(null);
    } catch (err) { console.error('Delete audit error:', err); }
  }
  async function handleUpdateAudit(auditId, field, value) {
    try {
      await updateAuditField(auditId, field, value);
      setAudits(prev => prev.map(a => a.id === auditId ? { ...a, [field]: value } : a));
    } catch (err) { console.error('Update audit field error:', err); }
  }

  // ── Audit metadata ────────────────────────────────────────────────────────
  async function handleUpdateAuditData(auditId, key, value) {
    try {
      await upsertAuditMetadata(auditId, key, value);
      const dbKey = { tor: 'tor', inherentRisk: 'inherent_risk', combinedAssurance: 'combined_assurance', scopeItems: 'scope_items', racmRisks: 'racm_risks', budget: 'budget', timeline: 'timeline', report: 'report' }[key] || key;
      setEngagementData(prev => prev ? { ...prev, metadata: { ...prev.metadata, [dbKey]: value, [key]: value } } : prev);

      if (PLANNING_GATE_KEYS.has(key)) {
        const planningSignOff = signOffs.find(so => so.audit_id === auditId && so.tab === 'Planning');
        if (planningSignOff?.auditor_signed_at) {
          const mergedAuditData = { ...engagementData?.metadata, [key]: value, [dbKey]: value };
          const gates = computePlanningGates(mergedAuditData);
          if (gates.some(g => !g.passed)) {
            await revokeSignOff(planningSignOff.id, 'auditor', currentUser.id);
            setSignOffs(await fetchSignOffs());
          }
        }
      }
    } catch (err) { console.error('Update audit data error:', err); }
  }

  // ── Promotion ─────────────────────────────────────────────────────────────
  async function handlePromoteToIssue(query)  { setPromoteQuery(query); handleTabChange('reporting'); }
  function handleDismissPromotion()           { setPromoteQuery(null); }
  async function handleCreateIssueFromPromotion(issueData) {
    try {
      const created = await createIssue({ ...issueData, audit_id: selectedAuditId });
      if (promoteQuery?.id) await updateQuery(promoteQuery.id, { status: 'Promoted', promoted_to_issue_id: created?.id });
      setPromoteQuery(null);
    } catch (err) { console.error('Promote to issue error:', err); }
  }

  // ── Queries / Issues / Papers ─────────────────────────────────────────────
  async function handleCreateQuery(queryData)          { try { await createQuery({ ...queryData, raised_by: currentUser.id }); } catch (err) { console.error(err); } }
  async function handleUpdateQuery(queryId, updates)   { try { await updateQuery(queryId, updates); } catch (err) { console.error(err); } }
  async function handleCreateIssue(issueData)          { try { await createIssue({ ...issueData, audit_id: selectedAuditId }); } catch (err) { console.error(err); } }
  async function handleUpdateIssue(issueId, updates)   { try { await updateIssue(issueId, updates); } catch (err) { console.error(err); } }
  async function handleCreateWorkingPaper(paperData)   { try { await createWorkingPaper({ ...paperData, audit_id: selectedAuditId, created_by: currentUser.id }); } catch (err) { console.error(err); } }
  async function handleUpdateWorkingPaper(id, updates) { try { await updateWorkingPaper(id, updates); } catch (err) { console.error(err); } }

  // ── Sign offs ─────────────────────────────────────────────────────────────
  async function handleSignOff(signOffId, role)        { try { await signOffPhase(signOffId, role, currentUser.id); } catch (err) { console.error(err); } }
  async function handleRevokeSignOff(signOffId, role)  { try { await revokeSignOff(signOffId, role, currentUser.id); } catch (err) { console.error(err); } }

  // ── Comments ──────────────────────────────────────────────────────────────
  const auditComments = selectedAuditId ? reviewComments.filter(c => c.audit_id === selectedAuditId) : [];
  async function handleAddComment(comment)                        { try { await addReviewComment({ ...comment, raised_by: currentUser.id, audit_id: selectedAuditId }); } catch (err) { console.error(err); } }
  async function handleRespondToComment(commentId, responseText) { try { await respondToComment(commentId, responseText, currentUser.id); } catch (err) { console.error(err); } }
  async function handleCloseComment(commentId)                   { try { await closeComment(commentId, currentUser.id); } catch (err) { console.error(err); } }

  // ── Derived ───────────────────────────────────────────────────────────────
  const progressData  = computeProgress(signOffs);
  const inEngagement  = selectedAuditId !== null;
  const selectedAudit = inEngagement ? (audits.find(a => a.id === selectedAuditId) || null) : null;

  const openPlanningComments  = inEngagement ? getOpenCommentCount(reviewComments, 'Planning',  selectedAuditId) : 0;
  const openFieldworkComments = inEngagement ? getOpenCommentCount(reviewComments, 'Fieldwork', selectedAuditId) : 0;
  const openReportingComments = inEngagement ? getOpenCommentCount(reviewComments, 'Reporting', selectedAuditId) : 0;
  const totalOpenComments     = inEngagement ? auditComments.filter(c => c.status === 'Open').length : 0;

  const auditData = engagementData ? {
    audit:             selectedAudit,
    budget:            engagementData.metadata?.budget             || {},
    timeline:          engagementData.metadata?.timeline           || [],
    inherentRisk:      engagementData.metadata?.inherent_risk      || engagementData.metadata?.inherentRisk      || {},
    combinedAssurance: engagementData.metadata?.combined_assurance || engagementData.metadata?.combinedAssurance || {},
    scopeItems:        engagementData.metadata?.scope_items        || engagementData.metadata?.scopeItems        || {},
    tor:               engagementData.metadata?.tor                || {},
    racmRisks:         engagementData.metadata?.racm_risks         || engagementData.metadata?.racmRisks         || [],
    report:            engagementData.metadata?.report             || {},
    queries:           engagementData.queries       || [],
    issues:            engagementData.issues        || [],
    workingPapers:     engagementData.workingPapers || [],
  } : null;

  const engagementProps = {
    audit: selectedAudit, auditData, currentUser, users,
    onUpdateAuditData:  (key, value) => handleUpdateAuditData(selectedAuditId, key, value),
    onUpdateAudit:      (field, value) => handleUpdateAudit(selectedAuditId, field, value),
    onCreateQuery:      handleCreateQuery,
    onUpdateQuery:      handleUpdateQuery,
    onCreateIssue:      handleCreateIssue,
    onUpdateIssue:      handleUpdateIssue,
    onCreateWorkingPaper:  handleCreateWorkingPaper,
    onUpdateWorkingPaper:  handleUpdateWorkingPaper,
    onSignOff:          handleSignOff,
    onRevokeSignOff:    handleRevokeSignOff,
    onPromoteToIssue:   handlePromoteToIssue,
    signOffs:           signOffs.filter(so => so.audit_id === selectedAuditId),
    reviewComments:     auditComments,
    onAddComment:       handleAddComment,
    onRespondToComment: handleRespondToComment,
    onCloseComment:     handleCloseComment,
    openDrawer,
    promoteQuery,
    onCreateIssueFromPromotion: handleCreateIssueFromPromotion,
    onDismissPromotion: handleDismissPromotion,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading || !currentUser) return <LoadingScreen />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-0)' }}>

      <header style={{ background: 'var(--ni-navy)', borderBottom: '1px solid var(--ni-navy-light)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, flexShrink: 0, position: 'relative', zIndex: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--ni-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>91</div>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>Internal Audit</span>
          </div>
          {inEngagement && (
            <>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
              <button onClick={handleBackToPortfolio} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <span style={{ fontSize: 14 }}>&#8592;</span>Portfolio
              </button>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500, maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAudit?.title || ''}
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{currentUser.full_name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {currentUser.role}
              {' - '}
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,167,157,0.9)', fontSize: 11, padding: 0, textDecoration: 'underline' }}>Sign out</button>
            </div>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ni-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }}>
            {currentUser.full_name.split(' ').map(n => n[0]).join('')}
          </div>
        </div>
      </header>

      <nav style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'stretch', flexShrink: 0, height: 44, position: 'relative', zIndex: 200 }}>
        {inEngagement ? (
          <>
            {ENGAGEMENT_TABS.map(tab => {
              const count = tab.id === 'review' ? totalOpenComments : tab.id === 'planning' ? openPlanningComments : tab.id === 'fieldwork' ? openFieldworkComments : openReportingComments;
              const isActive = activeEngagementTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveEngagementTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--ni-teal)' : 'var(--text-secondary)', borderBottom: `2px solid ${isActive ? 'var(--ni-teal)' : 'transparent'}`, borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {tab.label}
                  {count > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--status-amber)', color: '#fff', fontSize: 10, fontWeight: 700 }}>{count}</span>}
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <Badge label={selectedAudit?.status || ''} />
            </div>
          </>
        ) : (
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', fontSize: 13, fontWeight: 600, color: 'var(--ni-teal)', borderBottom: '2px solid var(--ni-teal)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'none', cursor: 'default', whiteSpace: 'nowrap' }}>Portfolio</button>
        )}
      </nav>

      <main style={{ flex: 1, overflow: 'auto', padding: 24, position: 'relative' }}>
        {!inEngagement && (
          <PortfolioTab audits={audits} signOffs={signOffs} reviewComments={reviewComments} onSelectAudit={handleSelectAudit} onCreateAudit={handleCreateAudit} onDeleteAudit={handleDeleteAudit} progressData={progressData} currentUser={currentUser} users={users} />
        )}
        {inEngagement && activeEngagementTab === 'planning' && (
          <PlanningTab {...engagementProps} openCommentCount={openPlanningComments} progressData={progressData[selectedAuditId] || { planning: 0, fieldwork: 0, reporting: 0 }} onTabChange={handleTabChange} initialSubTab={planningSubTab} />
        )}
        {inEngagement && activeEngagementTab === 'fieldwork' && (
          <FieldworkTab {...engagementProps} openCommentCount={openFieldworkComments} onTabChange={handleTabChange} />
        )}
        {inEngagement && activeEngagementTab === 'reporting' && (
          <ReportingTab {...engagementProps} openCommentCount={openReportingComments} />
        )}
        {inEngagement && activeEngagementTab === 'review' && (
          <ReviewCommentsTab comments={auditComments} onAddComment={handleAddComment} onRespondToComment={handleRespondToComment} onCloseComment={handleCloseComment} currentUser={currentUser} users={users} auditId={selectedAuditId} />
        )}
      </main>

      {inEngagement && (
        <CommentDrawer isOpen={drawerState.open} onClose={closeDrawer} title={drawerState.title} contextLabel={drawerState.contextLabel} sectionRef={drawerState.sectionRef} rowRef={drawerState.rowRef} auditId={selectedAuditId} comments={auditComments} onAddComment={handleAddComment} onRespondToComment={handleRespondToComment} onCloseComment={handleCloseComment} currentUser={currentUser} users={users} />
      )}
    </div>
  );
}
