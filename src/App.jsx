import { useState, useEffect } from 'react';
import { Badge, CommentDrawer } from '../components/UI';
import ProfileSelector from './components/ProfileSelector';
import PlanningTab from './PlanningTab';
import FieldworkTab from './FieldworkTab';
import ReportingTab from './ReportingTab';
import ReviewCommentsTab from './ReviewCommentsTab';
import PortfolioTab from './PortfolioTab';
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
} from '../data/dataService';

const PROFILE_KEY = 'ni_audit_tool_user_id';

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
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading audit data...</p>
    </div>
  );
}

export default function App() {
  // ── Bootstrap ──────────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [users, setUsers]             = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  // ── Global data ────────────────────────────────────────────────────────────
  const [audits, setAudits]               = useState([]);
  const [signOffs, setSignOffs]           = useState([]);
  const [reviewComments, setReviewComments] = useState([]);

  // ── Per-engagement data ────────────────────────────────────────────────────
  const [engagementData, setEngagementData] = useState(null);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [selectedAuditId, setSelectedAuditId]         = useState(null);
  const [activeEngagementTab, setActiveEngagementTab] = useState('planning');

  // ── Comment drawer ─────────────────────────────────────────────────────────
  const [drawerState, setDrawerState] = useState({ open: false, sectionRef: null, rowRef: null, title: '', contextLabel: '' });
  const openDrawer  = ({ sectionRef, rowRef, title, contextLabel }) => setDrawerState({ open: true, sectionRef, rowRef, title, contextLabel });
  const closeDrawer = () => setDrawerState(s => ({ ...s, open: false }));

  // ── Realtime channels ──────────────────────────────────────────────────────
  const [channels, setChannels] = useState([]);

  // ── Bootstrap: load users + global data ───────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const [usersData, auditsData, signOffsData, commentsData] = await Promise.all([
          fetchUsers(), fetchAudits(), fetchSignOffs(), fetchReviewComments('all'),
        ]);
        setUsers(usersData);
        setAudits(auditsData);
        setSignOffs(signOffsData);
        setReviewComments(commentsData);
        const savedId = localStorage.getItem(PROFILE_KEY);
        if (savedId) {
          const found = usersData.find(u => u.id === savedId);
          if (found) setCurrentUser(found);
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  // ── Global realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    const auditSub = subscribeToAudits(async () => {
      const fresh = await fetchAudits();
      setAudits(fresh);
    });
    const signOffSub = subscribeToSignOffs(async () => {
      const fresh = await fetchSignOffs();
      setSignOffs(fresh);
    });
    return () => unsubscribeAll([auditSub, signOffSub]);
  }, []);

  // ── Per-engagement data load + realtime ────────────────────────────────────
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
        setReviewComments(prev => {
          const others = prev.filter(c => c.audit_id !== selectedAuditId);
          return [...others, ...comments];
        });
      } catch (err) {
        console.error('Engagement load error:', err);
      }
    }

    loadEngagement();

    const issueSub   = subscribeToIssues(selectedAuditId, async () => {
      const fresh = await fetchIssues(selectedAuditId);
      setEngagementData(prev => prev ? { ...prev, issues: fresh } : prev);
    });
    const querySub   = subscribeToQueries(selectedAuditId, async () => {
      const fresh = await fetchQueries(selectedAuditId);
      setEngagementData(prev => prev ? { ...prev, queries: fresh } : prev);
    });
    const commentSub = subscribeToComments(selectedAuditId, async () => {
      const fresh = await fetchReviewComments(selectedAuditId);
      setReviewComments(prev => {
        const others = prev.filter(c => c.audit_id !== selectedAuditId);
        return [...others, ...fresh];
      });
    });
    const paperSub   = subscribeToWorkingPapers(selectedAuditId, async () => {
      const fresh = await fetchWorkingPapers(selectedAuditId);
      setEngagementData(prev => prev ? { ...prev, workingPapers: fresh } : prev);
    });

    const newChannels = [issueSub, querySub, commentSub, paperSub];
    setChannels(newChannels);
    return () => unsubscribeAll(newChannels);
  }, [selectedAuditId]);

  // ── Profile ────────────────────────────────────────────────────────────────
  function handleSelectProfile(user) {
    localStorage.setItem(PROFILE_KEY, user.id);
    setCurrentUser(user);
  }
  function handleSwitchUser() {
    localStorage.removeItem(PROFILE_KEY);
    setCurrentUser(null);
    setSelectedAuditId(null);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [planningSubTab, setPlanningSubTab] = useState(null);

  function handleSelectAudit(auditId) {
    setSelectedAuditId(auditId);
    setActiveEngagementTab('planning');
    setPlanningSubTab(null);
    closeDrawer();
  }
  function handleBackToPortfolio() {
    setSelectedAuditId(null);
    setPlanningSubTab(null);
    closeDrawer();
  }

  // handleTabChange accepts an optional subTab argument (e.g. 'racm' from Fieldwork)
  function handleTabChange(tabId, subTab) {
    setActiveEngagementTab(tabId);
    setPlanningSubTab(tabId === 'planning' ? (subTab || null) : null);
  }

  // ── Audit CRUD ─────────────────────────────────────────────────────────────
  async function handleCreateAudit(fields) {
    try {
      const newId = await createAuditRecord(fields);
      const [fresh, freshSOs] = await Promise.all([fetchAudits(), fetchSignOffs()]);
      setAudits(fresh);
      setSignOffs(freshSOs);
      setSelectedAuditId(newId);
      setActiveEngagementTab('planning');
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
      // Update local audits state so header title and other derived values reflect change immediately
      setAudits(prev => prev.map(a => a.id === auditId ? { ...a, [field]: value } : a));
    } catch (err) { console.error('Update audit field error:', err); }
  }

  // ── Audit metadata (planning tab) ──────────────────────────────────────────
  async function handleUpdateAuditData(auditId, key, value) {
    try {
      await upsertAuditMetadata(auditId, key, value);
      // Map UI key to DB key for local state update
      const dbKey = {
        tor: 'tor', inherentRisk: 'inherent_risk',
        combinedAssurance: 'combined_assurance', scopeItems: 'scope_items',
        racmRisks: 'racm_risks', budget: 'budget', timeline: 'timeline',
        report: 'report',
      }[key] || key;
      setEngagementData(prev => prev ? {
        ...prev,
        metadata: { ...prev.metadata, [dbKey]: value, [key]: value },
      } : prev);
    } catch (err) { console.error('Update audit data error:', err); }
  }

  // ── Promote query to issue ─────────────────────────────────────────────────
  const [promoteQuery, setPromoteQuery] = useState(null); // query object pending promotion

  async function handlePromoteToIssue(query) {
    // Store the query so ReportingTab/modal can open with it linked
    setPromoteQuery(query);
    // Navigate to reporting tab so the user can fill in the issue
    handleTabChange('reporting');
  }

  async function handleCreateIssueFromPromotion(issueData) {
    try {
      const created = await createIssue({ ...issueData, audit_id: selectedAuditId });
      // Mark the originating query as promoted
      if (promoteQuery?.id) {
        await updateQuery(promoteQuery.id, {
          status: 'Promoted',
          promoted_to_issue_id: created?.id || `issue-${Date.now()}`,
        });
      }
      setPromoteQuery(null);
    } catch (err) { console.error('Promote to issue error:', err); }
  }

  function handleDismissPromotion() {
    setPromoteQuery(null);
  }
  async function handleCreateQuery(queryData) {
    try { await createQuery({ ...queryData, raised_by: currentUser.id }); }
    catch (err) { console.error('Create query error:', err); }
  }
  async function handleUpdateQuery(queryId, updates) {
    try { await updateQuery(queryId, updates); }
    catch (err) { console.error('Update query error:', err); }
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async function handleCreateIssue(issueData) {
    try { await createIssue({ ...issueData, audit_id: selectedAuditId }); }
    catch (err) { console.error('Create issue error:', err); }
  }
  async function handleUpdateIssue(issueId, updates) {
    try { await updateIssue(issueId, updates); }
    catch (err) { console.error('Update issue error:', err); }
  }

  // ── Working papers ─────────────────────────────────────────────────────────
  async function handleCreateWorkingPaper(paperData) {
    try { await createWorkingPaper({ ...paperData, audit_id: selectedAuditId, created_by: currentUser.id }); }
    catch (err) { console.error('Create working paper error:', err); }
  }
  async function handleUpdateWorkingPaper(paperId, updates) {
    try { await updateWorkingPaper(paperId, updates); }
    catch (err) { console.error('Update working paper error:', err); }
  }

  // ── Sign offs ──────────────────────────────────────────────────────────────
  async function handleSignOff(signOffId, role) {
    try { await signOffPhase(signOffId, role, currentUser.id); }
    catch (err) { console.error('Sign off error:', err); }
  }
  async function handleRevokeSignOff(signOffId, role) {
    try { await revokeSignOff(signOffId, role, currentUser.id); }
    catch (err) { console.error('Revoke sign off error:', err); }
  }

  // ── Review comments ────────────────────────────────────────────────────────
  const auditComments = selectedAuditId
    ? reviewComments.filter(c => c.audit_id === selectedAuditId)
    : [];

  async function handleAddComment(comment) {
    try { await addReviewComment({ ...comment, raised_by: currentUser.id, audit_id: selectedAuditId }); }
    catch (err) { console.error('Add comment error:', err); }
  }
  async function handleRespondToComment(commentId, responseText) {
    try { await respondToComment(commentId, responseText, currentUser.id); }
    catch (err) { console.error('Respond to comment error:', err); }
  }
  async function handleCloseComment(commentId) {
    try { await closeComment(commentId, currentUser.id); }
    catch (err) { console.error('Close comment error:', err); }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const progressData  = computeProgress(signOffs);
  const inEngagement  = selectedAuditId !== null;
  const selectedAudit = inEngagement ? (audits.find(a => a.id === selectedAuditId) || null) : null;

  const openPlanningComments  = inEngagement ? getOpenCommentCount(reviewComments, 'Planning',  selectedAuditId) : 0;
  const openFieldworkComments = inEngagement ? getOpenCommentCount(reviewComments, 'Fieldwork', selectedAuditId) : 0;
  const openReportingComments = inEngagement ? getOpenCommentCount(reviewComments, 'Reporting', selectedAuditId) : 0;
  const totalOpenComments     = inEngagement ? auditComments.filter(c => c.status === 'Open').length : 0;

  // Build auditData shape from DB metadata (maps snake_case back to camelCase for tabs)
  const auditData = engagementData ? {
    audit:             selectedAudit,
    budget:            engagementData.metadata?.budget            || {},
    timeline:          engagementData.metadata?.timeline          || [],
    inherentRisk:      engagementData.metadata?.inherent_risk     || engagementData.metadata?.inherentRisk     || {},
    combinedAssurance: engagementData.metadata?.combined_assurance|| engagementData.metadata?.combinedAssurance || {},
    scopeItems:        engagementData.metadata?.scope_items       || engagementData.metadata?.scopeItems       || {},
    tor:               engagementData.metadata?.tor               || {},
    racmRisks:         engagementData.metadata?.racm_risks        || engagementData.metadata?.racmRisks        || [],
    report:            engagementData.metadata?.report            || {},
    queries:           engagementData.queries       || [],
    issues:            engagementData.issues        || [],
    workingPapers:     engagementData.workingPapers || [],
  } : null;

  // Props bundle for all engagement tabs
  const engagementProps = {
    audit: selectedAudit,
    auditData,
    currentUser,
    users,
    onUpdateAuditData: (key, value) => handleUpdateAuditData(selectedAuditId, key, value),
    onUpdateAudit:     (field, value) => handleUpdateAudit(selectedAuditId, field, value),
    onCreateQuery:     handleCreateQuery,
    onUpdateQuery:     handleUpdateQuery,
    onCreateIssue:     handleCreateIssue,
    onUpdateIssue:     handleUpdateIssue,
    onCreateWorkingPaper:  handleCreateWorkingPaper,
    onUpdateWorkingPaper:  handleUpdateWorkingPaper,
    onSignOff:         handleSignOff,
    onRevokeSignOff:   handleRevokeSignOff,
    onPromoteToIssue:  handlePromoteToIssue,
    signOffs:          signOffs.filter(so => so.audit_id === selectedAuditId),
    reviewComments:    auditComments,
    onAddComment:      handleAddComment,
    onRespondToComment: handleRespondToComment,
    onCloseComment:    handleCloseComment,
    openDrawer,
    // promotion state — passed to ReportingTab so it can open the Add Issue modal pre-linked
    promoteQuery,
    onCreateIssueFromPromotion: handleCreateIssueFromPromotion,
    onDismissPromotion: handleDismissPromotion,
  };

  // ── Render gates ───────────────────────────────────────────────────────────
  if (loading)      return <LoadingScreen />;
  if (!currentUser) return <ProfileSelector users={users} onSelectProfile={handleSelectProfile} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-0)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--ni-navy)', borderBottom: '1px solid var(--ni-navy-light)',
        padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 52, flexShrink: 0, position: 'relative', zIndex: 200,
      }}>
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
              <button onClick={handleSwitchUser} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,167,157,0.9)', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
                Switch
              </button>
            </div>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ni-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff' }}>
            {currentUser.full_name.split(' ').map(n => n[0]).join('')}
          </div>
        </div>
      </header>

      {/* ── Tab navigation ──────────────────────────────────────────────────── */}
      <nav style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'stretch', flexShrink: 0, height: 44, position: 'relative', zIndex: 200 }}>
        {inEngagement ? (
          <>
            {ENGAGEMENT_TABS.map(tab => {
              const count =
                tab.id === 'review'    ? totalOpenComments
                : tab.id === 'planning'  ? openPlanningComments
                : tab.id === 'fieldwork' ? openFieldworkComments
                :                         openReportingComments;
              const isActive = activeEngagementTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveEngagementTab(tab.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--ni-teal)' : 'var(--text-secondary)',
                  borderBottom: `2px solid ${isActive ? 'var(--ni-teal)' : 'transparent'}`,
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {tab.label}
                  {count > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--status-amber)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <Badge label={selectedAudit?.status || ''} />
            </div>
          </>
        ) : (
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', fontSize: 13, fontWeight: 600, color: 'var(--ni-teal)', borderBottom: '2px solid var(--ni-teal)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'none', cursor: 'default', whiteSpace: 'nowrap' }}>
            Portfolio
          </button>
        )}
      </nav>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', padding: 24, position: 'relative' }}>
        {!inEngagement && (
          <PortfolioTab
            audits={audits} signOffs={signOffs} reviewComments={reviewComments}
            onSelectAudit={handleSelectAudit} onCreateAudit={handleCreateAudit}
            onDeleteAudit={handleDeleteAudit} progressData={progressData}
            currentUser={currentUser} users={users}
          />
        )}
        {inEngagement && activeEngagementTab === 'planning' && (
          <PlanningTab
            {...engagementProps}
            openCommentCount={openPlanningComments}
            progressData={progressData[selectedAuditId] || { planning: 0, fieldwork: 0, reporting: 0 }}
            onTabChange={handleTabChange}
            initialSubTab={planningSubTab}
          />
        )}
        {inEngagement && activeEngagementTab === 'fieldwork' && (
          <FieldworkTab {...engagementProps} openCommentCount={openFieldworkComments} onTabChange={handleTabChange} />
        )}
        {inEngagement && activeEngagementTab === 'reporting' && (
          <ReportingTab {...engagementProps} openCommentCount={openReportingComments} />
        )}
        {inEngagement && activeEngagementTab === 'review' && (
          <ReviewCommentsTab
            comments={auditComments}
            onAddComment={handleAddComment}
            onRespondToComment={handleRespondToComment}
            onCloseComment={handleCloseComment}
            currentUser={currentUser} users={users} auditId={selectedAuditId}
          />
        )}
      </main>

      {/* ── Comment Drawer ───────────────────────────────────────────────────── */}
      {inEngagement && (
        <CommentDrawer
          isOpen={drawerState.open} onClose={closeDrawer}
          title={drawerState.title} contextLabel={drawerState.contextLabel}
          sectionRef={drawerState.sectionRef} rowRef={drawerState.rowRef}
          auditId={selectedAuditId} comments={auditComments}
          onAddComment={handleAddComment}
          onRespondToComment={handleRespondToComment}
          onCloseComment={handleCloseComment}
          currentUser={currentUser} users={users}
        />
      )}
    </div>
  );
}
