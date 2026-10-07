import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Play,
  BarChart2,
  FileText,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Video,
} from 'lucide-react';
import { LiveSessionStats } from '../context/conversationContextTypes';
import { fetchProgressReports, ProgressReport } from '../services/liveProgressService';

interface LeftPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  liveStats: LiveSessionStats | null;
  conversationLength: number;
  userId?: string;
  isGeneratingProgressReport?: boolean;
  isMobile?: boolean;
}

// Circular progress ring component
function CircularProgress({ pct, color, label }: { pct: number | null; color: string; label: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = pct === null ? circ : circ - (pct / 100) * circ;

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12 flex-shrink-0">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
          <circle
            cx="24" cy="24" r={r} fill="none"
            stroke={pct === null ? '#D1D5DB' : color} strokeWidth="4"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-deep-navy">
          {pct === null ? '—' : `${pct}%`}
        </span>
      </div>
      <span className="text-xs text-immigo-gray-600 leading-tight">{label}</span>
    </div>
  );
}

const STUDY_MATERIALS = [
  { id: 'civics2008', url: 'https://www.uscis.gov/sites/default/files/document/questions-and-answers/100q.pdf' },
  { id: 'civics2025', url: 'https://www.uscis.gov/citizenship/find-study-materials-and-resources' },
  { id: 'studyGuides', url: 'https://www.uscis.gov/citizenship/find-study-materials-and-resources' },
];

const USCIS_MEDIA = [
  { id: 'education', url: 'https://www.uscis.gov/citizenship/learn-about-citizenship/citizenship-education-resources' },
  { id: 'studyMaterials', url: 'https://www.uscis.gov/citizenship/find-study-materials-and-resources' },
  { id: 'resourceCenter', url: 'https://www.uscis.gov/citizenship' },
];

export function LeftPanel({ isCollapsed, onToggleCollapse, liveStats, conversationLength, userId, isGeneratingProgressReport = false, isMobile = false }: LeftPanelProps) {
  const { t, i18n } = useTranslation('conversation');
  const [knowledgeBankOpen, setKnowledgeBankOpen] = useState(true);
  const [performanceOpen, setPerformanceOpen] = useState(true);
  const [studyBankOpen, setStudyBankOpen] = useState(true);
  const [mediaOpen, setMediaOpen] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(Boolean(userId));
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ProgressReport | null>(null);

  const loadReports = useCallback(async () => {
    if (!userId) return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      setReports(await fetchProgressReports(userId));
    } catch {
      setReportsError(t('workspace.left.reportsLoadError'));
    } finally {
      setReportsLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    if (!userId || isGeneratingProgressReport) return;
    let isMounted = true;
    void fetchProgressReports(userId).then(data => {
      if (isMounted) setReports(data);
    }).catch(() => {
      if (isMounted) setReportsError(t('workspace.left.reportsLoadError'));
    }).finally(() => {
      if (isMounted) setReportsLoading(false);
    });
    return () => { isMounted = false; };
  }, [userId, isGeneratingProgressReport, t]);

  const printReport = (report: ProgressReport) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setReportsError(t('workspace.left.printBlocked'));
      return;
    }
    printWindow.opener = null;
    const safeContent = report.report_markdown.replace(/[&<>]/g, character => (
      character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'
    ));
    const safeDate = report.date.replace(/[&<>]/g, character => (
      character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;'
    ));
    const reportTitle = t('workspace.left.reportTitle');
    printWindow.document.write(`<!doctype html><html lang="${i18n.language}" dir="${i18n.dir()}"><head><meta charset="utf-8"><title>ImmiGO - ${reportTitle} - ${safeDate}</title><style>body{font-family:Arial,sans-serif;color:#172b4d;margin:40px;line-height:1.6}h1{font-size:22px}pre{font:14px/1.6 Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>ImmiGO - ${reportTitle}</h1><p>${safeDate}</p><pre>${safeContent}</pre></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const accuracy = liveStats ? Math.round(liveStats.accuracyPct) : 0;
  const questionsAnswered = liveStats ? liveStats.answered : 0;
  const progressWithinTen = questionsAnswered === 0 ? 0 : ((questionsAnswered - 1) % 10) + 1;

  // Collapsed rail
  if (isCollapsed) {
    return (
      <aside
        className="flex flex-col items-center gap-5 py-4 bg-star-white border-r border-immigo-gray-200 shrink-0 transition-all duration-300"
        style={{ width: '56px' }}
      >
        <button
          onClick={onToggleCollapse}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-600 transition-colors"
          aria-label={t('workspace.left.expand')}
          title={t('workspace.left.expand')}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center gap-4 mt-2">
          <button type="button" onClick={() => { setKnowledgeBankOpen(true); setStudyBankOpen(true); onToggleCollapse(); }} title={t('workspace.left.knowledgeBank')} aria-label={t('workspace.left.openKnowledgeBank')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <BookOpen className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => { setKnowledgeBankOpen(true); setMediaOpen(true); onToggleCollapse(); }} title={t('workspace.left.officialMedia')} aria-label={t('workspace.left.openMedia')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <Video className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => { setPerformanceOpen(true); setAnalyticsOpen(true); onToggleCollapse(); }} title={t('workspace.left.analytics')} aria-label={t('workspace.left.openAnalytics')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <BarChart2 className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => { setPerformanceOpen(true); setReportsOpen(true); onToggleCollapse(); }} title={t('workspace.left.previousReports')} aria-label={t('workspace.left.openReports')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col bg-star-white border-r border-immigo-gray-200 shrink-0 overflow-hidden transition-all duration-300"
      style={isMobile ? { width: '100%', minWidth: 0, maxWidth: 'none' } : { width: '23%', minWidth: '250px', maxWidth: '360px' }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-immigo-gray-200 bg-star-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-art-blue-600" />
          <span className="text-sm font-bold text-deep-navy tracking-tight">{t('workspace.left.title')}</span>
        </div>
        {!isMobile && <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-500 transition-colors"
          aria-label={t('workspace.left.collapse')}
          title={t('workspace.left.collapse')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Section 1: USCIS Knowledge Bank ── */}
        <section>
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-immigo-gray-600 hover:bg-immigo-gray-50 transition-colors"
            onClick={() => setKnowledgeBankOpen(p => !p)}
            aria-expanded={knowledgeBankOpen}
          >
            <span>{t('workspace.left.knowledgeBank')}</span>
            {knowledgeBankOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {knowledgeBankOpen && (
            <div className="px-3 pb-3">
              {/* Study Bank */}
              <div className="mb-3">
                <button type="button" onClick={() => setStudyBankOpen(p => !p)} aria-expanded={studyBankOpen} className="w-full flex items-center justify-between px-1 mb-2 text-left">
                  <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-art-blue-600" />
                  <span className="text-xs font-semibold text-deep-navy">{t('workspace.left.studyBank')}</span>
                  </span>
                  {studyBankOpen ? <ChevronUp className="w-3 h-3 text-immigo-gray-500" /> : <ChevronDown className="w-3 h-3 text-immigo-gray-500" />}
                </button>
                {studyBankOpen && (
                <ul className="space-y-1.5">
                  {STUDY_MATERIALS.map(item => {
                    const material = t(`workspace.left.materials.${item.id}`, { returnObjects: true }) as { title: string; subtitle: string; badge: string };
                    return (
                    <li key={item.id}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${material.title} — ${material.subtitle}`} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-art-blue-50 border border-transparent hover:border-art-blue-100 transition-all group text-left">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-deep-navy truncate group-hover:text-art-blue-700">{material.title}</p>
                          <p className="text-[10px] text-immigo-gray-500 truncate">{material.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <span className="text-[9px] font-bold text-art-blue-600 bg-art-blue-50 border border-art-blue-200 rounded px-1 py-0.5">{material.badge}</span>
                          <Download aria-hidden="true" className="w-3 h-3 text-immigo-gray-400 group-hover:text-art-blue-600" />
                        </div>
                      </a>
                    </li>
                    );
                  })}
                </ul>
                )}
              </div>

              {/* Official USCIS Media */}
              <div>
                <button type="button" onClick={() => setMediaOpen(p => !p)} aria-expanded={mediaOpen} className="w-full flex items-center justify-between px-1 mb-2 text-left">
                  <span className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-art-blue-600" />
                  <span className="text-xs font-semibold text-deep-navy">{t('workspace.left.officialMedia')}</span>
                  </span>
                  {mediaOpen ? <ChevronUp className="w-3 h-3 text-immigo-gray-500" /> : <ChevronDown className="w-3 h-3 text-immigo-gray-500" />}
                </button>
                {mediaOpen && (
                <ul className="space-y-1.5">
                  {USCIS_MEDIA.map(item => (
                    <li key={item.id}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-art-blue-50 border border-transparent hover:border-art-blue-100 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-deep-navy truncate group-hover:text-art-blue-700">{t(`workspace.left.media.${item.id}.title`)}</p>
                          <span className="text-[10px] text-immigo-gray-500">{t(`workspace.left.media.${item.id}.type`)}</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-immigo-gray-400 group-hover:text-art-blue-600 flex-shrink-0 ml-2" />
                      </a>
                    </li>
                  ))}
                </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="border-t border-immigo-gray-200 mx-3" />

        {/* ── Section 2: Performance and Exports ── */}
        <section>
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-immigo-gray-600 hover:bg-immigo-gray-50 transition-colors"
            onClick={() => setPerformanceOpen(p => !p)}
            aria-expanded={performanceOpen}
          >
            <span>{t('workspace.left.performance')}</span>
            {performanceOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {performanceOpen && (
            <div className="px-3 pb-4">
              {/* Session Analytics */}
              <div className="mb-4">
                <button type="button" onClick={() => setAnalyticsOpen(p => !p)} aria-expanded={analyticsOpen} className="w-full flex items-center justify-between px-1 mb-3 text-left">
                  <span className="flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-art-blue-600" />
                  <span className="text-xs font-semibold text-deep-navy">{t('workspace.left.analytics')}</span>
                  </span>
                  {analyticsOpen ? <ChevronUp className="w-3 h-3 text-immigo-gray-500" /> : <ChevronDown className="w-3 h-3 text-immigo-gray-500" />}
                </button>

                {analyticsOpen && <>
                {conversationLength === 0 || !liveStats ? (
                  <p className="text-[11px] text-immigo-gray-400 italic px-1 py-2">{t('workspace.left.metricsStart')}</p>
                ) : (
                  <div className="space-y-3">
                    <CircularProgress pct={accuracy} color="#2563EB" label={t('workspace.left.answerAccuracy')} />
                    <CircularProgress pct={null} color="#16a34a" label={t('workspace.left.englishClarity')} />
                    <CircularProgress pct={null} color="#d97706" label={t('workspace.left.responseCompleteness')} />

                    {/* Questions progress bar */}
                    <div className="mt-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-immigo-gray-600">{t('workspace.left.questions')}</span>
                        <span className="text-[10px] font-bold text-deep-navy">{t('workspace.left.questionsAnswered', { count: questionsAnswered })}</span>
                      </div>
                      <div className="h-2 bg-immigo-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-art-blue-600 rounded-full transition-all duration-500"
                          style={{ width: `${(progressWithinTen / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                </>}
              </div>

              {/* Previous Progress Reports */}
              <div>
                <button type="button" onClick={() => setReportsOpen(p => !p)} aria-expanded={reportsOpen} className="w-full flex items-center justify-between px-1 mb-2 text-left">
                  <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-art-blue-600" />
                  <span className="text-xs font-semibold text-deep-navy">{t('workspace.left.previousReports')}</span>
                  </span>
                  {reportsOpen ? <ChevronUp className="w-3 h-3 text-immigo-gray-500" /> : <ChevronDown className="w-3 h-3 text-immigo-gray-500" />}
                </button>
                {reportsOpen && (
                  <div>
                    {reportsLoading && <p className="text-[11px] text-immigo-gray-500 px-1 py-2" role="status">{t('workspace.left.reportsLoading')}</p>}
                    {reportsError && (
                      <div className="px-1 py-2" role="alert">
                        <p className="text-[11px] text-art-red-600">{reportsError}</p>
                        <button type="button" onClick={() => void loadReports()} className="mt-1 text-[11px] font-semibold text-art-blue-700 underline">{t('workspace.left.tryAgain')}</button>
                      </div>
                    )}
                    {!reportsLoading && !reportsError && reports.length === 0 && (
                      <p className="text-[11px] text-immigo-gray-500 px-1 py-2">{t('workspace.left.reportsEmpty')}</p>
                    )}
                    <ul className="space-y-1.5">
                      {reports.map(report => (
                        <li key={report.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-immigo-gray-200">
                          <button type="button" onClick={() => setSelectedReport(report)} className="min-w-0 text-left hover:text-art-blue-700">
                            <span className="block text-xs font-semibold">{new Date(`${report.date}T00:00:00`).toLocaleDateString(i18n.language)}</span>
                            <span className="block text-[10px] text-immigo-gray-500">{t('workspace.left.reportItem')}</span>
                          </button>
                          <button type="button" onClick={() => printReport(report)} aria-label={t('workspace.left.downloadReport', { date: new Date(`${report.date}T00:00:00`).toLocaleDateString(i18n.language) })} title={t('workspace.left.printSavePdf')} className="p-1 rounded hover:bg-immigo-gray-100 text-immigo-gray-500 hover:text-art-blue-600">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-navy/50 p-4" role="presentation" onClick={() => setSelectedReport(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="progress-report-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-star-white shadow-xl" onClick={event => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-immigo-gray-200 px-5 py-4">
              <div>
                <h2 id="progress-report-title" className="font-bold text-deep-navy">{t('workspace.left.reportTitle')}</h2>
                <p className="text-xs text-immigo-gray-500">{new Date(`${selectedReport.date}T00:00:00`).toLocaleDateString(i18n.language)}</p>
              </div>
              <button type="button" onClick={() => setSelectedReport(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-immigo-gray-600 hover:bg-immigo-gray-100">{t('workspace.left.close')}</button>
            </header>
            <pre className="flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed text-immigo-gray-700">{selectedReport.report_markdown}</pre>
            <footer className="flex justify-end border-t border-immigo-gray-200 px-5 py-3">
              <button type="button" onClick={() => printReport(selectedReport)} className="flex items-center gap-2 rounded-lg bg-art-blue-600 px-4 py-2 text-sm font-semibold text-star-white hover:bg-art-blue-700">
                <Download className="w-4 h-4" />
                {t('workspace.left.printSavePdf')}
              </button>
            </footer>
          </section>
        </div>
      )}
    </aside>
  );
}
