import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Trash2, Download, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { AppStatus, SimulationMode } from '../context/conversationContextTypes';

interface RightPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  simulationMode: SimulationMode;
  onSimulationModeChange: (mode: SimulationMode) => void;
  onClearSession: () => void;
  onDownloadTranscript: () => void;
  conversationLength: number;
  appStatus: AppStatus;
  isMobile?: boolean;
}

const MODE_IDS: SimulationMode[] = ['standard', 'practice', 'study'];

export function RightPanel({
  isCollapsed,
  onToggleCollapse,
  simulationMode,
  onSimulationModeChange,
  onClearSession,
  onDownloadTranscript,
  conversationLength,
  appStatus,
  isMobile = false,
}: RightPanelProps) {
  const { t } = useTranslation('conversation');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isRequestInFlight = appStatus === 'processing' || appStatus === 'speaking';

  const handleClearRequest = () => {
    if (conversationLength === 0) return;
    setShowClearConfirm(true);
  };

  const handleClearConfirm = () => {
    onClearSession();
    setShowClearConfirm(false);
  };
  const handleCollapsedClear = () => {
    if (conversationLength > 0 && !isRequestInFlight
      && window.confirm(t('workspace.right.clearConfirmMessage'))) {
      onClearSession();
    }
  };

  // Collapsed rail
  if (isCollapsed) {
    return (
      <aside
        className="flex flex-col items-center gap-5 py-4 bg-star-white border-l border-immigo-gray-200 shrink-0 transition-all duration-300"
        style={{ width: '56px' }}
      >
        <button
          onClick={onToggleCollapse}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-600 transition-colors"
          aria-label={t('workspace.right.expand')}
          title={t('workspace.right.expand')}
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="flex flex-col items-center gap-4 mt-2">
          <button type="button" onClick={onToggleCollapse} title={t('workspace.right.simulationModes')} aria-label={t('workspace.right.openModes')} className="p-2 rounded-lg hover:bg-immigo-gray-100 text-art-blue-600">
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <button type="button" title={t('workspace.right.clearTitle')} onClick={handleCollapsedClear} disabled={conversationLength === 0 || isRequestInFlight} aria-label={t('workspace.right.clearTitle')} className="p-2 rounded-lg hover:bg-art-red-50 disabled:opacity-40 text-art-red-600">
            <Trash2 className="w-5 h-5" />
          </button>
          <button type="button" title={t('workspace.right.downloadTitle')} onClick={onDownloadTranscript} disabled={conversationLength === 0} aria-label={t('workspace.right.downloadTitle')} className="p-2 rounded-lg hover:bg-immigo-gray-100 disabled:opacity-40 text-immigo-gray-600">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col bg-star-white border-l border-immigo-gray-200 shrink-0 overflow-hidden transition-all duration-300"
      style={isMobile ? { width: '100%', minWidth: 0, maxWidth: 'none' } : { width: '23%', minWidth: '250px', maxWidth: '360px' }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-immigo-gray-200 bg-star-white sticky top-0 z-10">
        {!isMobile && <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-immigo-gray-100 text-immigo-gray-500 transition-colors"
          aria-label={t('workspace.right.collapse')}
          title={t('workspace.right.collapse')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-art-blue-600" />
          <span className="text-sm font-bold text-deep-navy tracking-tight">{t('workspace.right.title')}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* ── Section 1: Simulation Modes ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-4 h-4 text-art-blue-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-immigo-gray-600">{t('workspace.right.simulationModes')}</span>
          </div>

          <fieldset className="space-y-2">
            <legend className="sr-only">{t('workspace.right.modeLegend')}</legend>
            {MODE_IDS.map(modeId => {
              const isSelected = simulationMode === modeId;
              const mode = t(`workspace.right.${modeId}`, { returnObjects: true }) as { label: string; description: string };
              return (
                <label
                  key={modeId}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'border-art-blue-600 bg-art-blue-50'
                      : 'border-immigo-gray-200 hover:border-art-blue-300 hover:bg-immigo-gray-50'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-art-blue-600' : 'border-immigo-gray-400'
                    }`}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-art-blue-600" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-semibold block ${isSelected ? 'text-art-blue-700' : 'text-deep-navy'}`}>
                      {mode.label}
                    </span>
                    <span className="text-xs text-immigo-gray-500 block mt-0.5">{mode.description}</span>
                  </div>
                  <input
                    type="radio"
                    name="simulation-mode"
                    value={modeId}
                    checked={isSelected}
                    onChange={() => onSimulationModeChange(modeId)}
                    className="sr-only"
                  />
                </label>
              );
            })}
          </fieldset>
        </section>

        <div className="border-t border-immigo-gray-200" />

        {/* ── Section 2: Session Utilities ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🔧</span>
            <span className="text-xs font-bold uppercase tracking-widest text-immigo-gray-600">{t('workspace.right.utilities')}</span>
          </div>

          <div className="space-y-2">
            {/* Clear Session */}
            {showClearConfirm ? (
              <div className="p-3 rounded-xl border-2 border-art-red-300 bg-art-red-50 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-art-red-600 flex-shrink-0" />
                  <p className="text-xs font-semibold text-art-red-700">{t('workspace.right.clearConfirmTitle')}</p>
                </div>
                <p className="text-[11px] text-art-red-600">{t('workspace.right.clearConfirmMessage')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearConfirm}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-art-red-600 text-star-white hover:bg-art-red-700 transition-colors"
                  >
                    {t('workspace.right.confirmClear')}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-immigo-gray-300 text-immigo-gray-600 hover:bg-immigo-gray-100 transition-colors"
                  >
                    {t('workspace.right.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleClearRequest}
                disabled={conversationLength === 0 || isRequestInFlight}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-art-red-300 text-art-red-600 hover:bg-art-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 font-semibold text-sm"
              >
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                {t('workspace.right.clear')}
              </button>
            )}

            {/* Download Transcript */}
            <button
              onClick={onDownloadTranscript}
              disabled={conversationLength === 0}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-immigo-gray-200 text-immigo-gray-700 hover:bg-immigo-gray-50 hover:border-immigo-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 font-semibold text-sm"
            >
              <Download className="w-4 h-4 flex-shrink-0" />
              {t('workspace.right.downloadTranscript')}
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
