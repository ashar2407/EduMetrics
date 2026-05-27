// ImportFlow.jsx
// Save this as ImportFlow.jsx next to your App.jsx
// Usage in App.jsx:
//   1. Add at top:  import ImportFlow from './ImportFlow';
//   2. Add state:   const [showImport, setShowImport] = useState(false);
//   3. Replace the existing file upload button with:
//      <button onClick={() => setShowImport(true)} ...>Select Excel / CSV</button>
//   4. Add before closing </div> of the logged-in view:
//      {showImport && <ImportFlow user={user} onClose={() => setShowImport(false)} onImportComplete={loadDataFromServer} />}

import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud, X, CheckCircle2, AlertTriangle, ChevronDown,
  FileSpreadsheet, Sparkles, Wand2, ArrowRight, RotateCcw, Loader2
} from 'lucide-react';

const API_BASE = 'https://edumetrics-api-kro4.onrender.com';

const INTERNAL_FIELDS = [
  { value: 'student_name', label: 'Student Name',      required: true  },
  { value: 'student_id',   label: 'Student ID',        required: false },
  { value: 'grade',        label: 'Grade / Score',     required: true  },
  { value: 'max_score',    label: 'Max Score / Out Of', required: false },
  { value: 'subject',      label: 'Subject',           required: false },
  { value: 'assessment',   label: 'Assessment',        required: false },
  { value: 'date',         label: 'Date',              required: false },
  { value: 'teacher',      label: 'Teacher',           required: false },
  { value: 'class',        label: 'Class / Group',     required: false },
  { value: 'notes',        label: 'Notes',             required: false },
];

function ConfidenceBadge({ confidence, source }) {
  if (!confidence) return null;
  const styles = {
    high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low:    'bg-red-100 text-red-700 border-red-200',
  };
  const labels  = { high: 'Auto', medium: 'Review', low: 'Manual' };
  const srcLabel = source === 'ai' ? 'AI' : source === 'template' ? 'Saved' : 'Smart';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${styles[confidence] || styles.low}`}>
      {labels[confidence] || 'Manual'} · {srcLabel}
    </span>
  );
}

const STEPS = ['Upload', 'Review Mapping', 'Import'];
function StepBar({ step }) {
  const idx = { uploading: 0, mapping: 1, importing: 2, done: 2 }[step] ?? 0;
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
              i <= idx ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-400'
            }`}>
              {i < idx ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest hidden sm:block ${i <= idx ? 'text-gray-800' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-3 ${i < idx ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function ImportFlow({ user, onClose, onImportComplete }) {
  const [step, setStep]         = useState('idle');
  const [dragOver, setDragOver] = useState(false);
  const [session, setSession]   = useState(null);
  const [mapping, setMapping]   = useState({});
  const [saveTemplate, setSave] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const fileInputRef            = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError(`"${file.name}" is not supported. Please upload a .csv, .xlsx, or .xls file.`);
      setStep('error');
      return;
    }
    setStep('uploading');
    setError('');

    const form = new FormData();
    form.append('file', file);
    form.append('userId', String(user.id));

    try {
      const res  = await fetch(`${API_BASE}/api/import/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setSession(data);

      // Pre-fill mapping dropdowns from AI/fuzzy suggestions
      const initial = {};
      for (const field of INTERNAL_FIELDS) {
        const s = data.mapping?.[field.value];
        if (s?.column) initial[field.value] = s.column;
      }
      setMapping(initial);
      setStep('mapping');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }, [user.id]);

  const onFileInput = (e) => { handleFile(e.target.files[0]); e.target.value = null; };
  const onDrop      = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const handleConfirm = async () => {
    setStep('importing');
    setError('');
    try {
      // Step 1: confirm mapping
      const cRes = await fetch(`${API_BASE}/api/import/${session.sessionId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping, saveTemplate, templateName: saveTemplate ? tmplName : undefined }),
      });
      const cData = await cRes.json();
      if (!cRes.ok) throw new Error(cData.error || 'Confirm failed');

      // Step 2: run import
      const rRes  = await fetch(`${API_BASE}/api/import/${session.sessionId}/run`, { method: 'POST' });
      const rData = await rRes.json();
      if (!rRes.ok) throw new Error(rData.error || 'Import failed');

      setResult(rData);
      setStep('done');
      if (onImportComplete) await onImportComplete();
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  const isValid = INTERNAL_FIELDS.filter(f => f.required).every(f => mapping[f.value]);

  const reset = () => {
    setStep('idle'); setSession(null); setMapping({});
    setResult(null); setError(''); setSave(false); setTmplName('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-8 pb-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2.5 rounded-xl">
              <FileSpreadsheet className="text-blue-600" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">Smart Import</h2>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-0.5">AI-Assisted Spreadsheet Import</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {['mapping', 'importing', 'done'].includes(step) && <StepBar step={step} />}

          {/* ── IDLE: drag-drop upload zone ── */}
          {step === 'idle' && (
            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
                ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-slate-50'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileInput} />
              <div className="mx-auto w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
                <UploadCloud className="text-blue-500" size={30} />
              </div>
              <p className="text-lg font-black text-gray-800 mb-2">Drop your spreadsheet here</p>
              <p className="text-gray-400 font-medium text-sm mb-6">
                .csv, .xlsx, .xls — any format from Canvas, SIMS, Arbor, Google Classroom and more
              </p>
              <span className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md">
                <UploadCloud size={16} /> Select File
              </span>
              <div className="mt-8 flex items-center justify-center gap-2 text-xs font-bold text-emerald-600">
                <Wand2 size={13} /> AI auto-detects columns — no formatting required
              </div>
              {/* ── Data Compliance Notice ───────────────────────────────────── */}
              <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-bold mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Privacy First: Student analytics are processed locally in your browser. Your data remains fully secure and confidential.
              </div>
            </div>
          )}

          {/* ── UPLOADING ── */}
          {step === 'uploading' && (
            <div className="py-20 text-center">
              <div className="mx-auto w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
                <Loader2 className="text-blue-600 animate-spin" size={28} />
              </div>
              <p className="font-black text-gray-800 text-lg mb-2">Analysing your file…</p>
              <p className="text-gray-400 font-medium text-sm">Detecting headers, scanning structure, mapping columns</p>
            </div>
          )}

          {/* ── MAPPING: review table ── */}
          {step === 'mapping' && session && (
            <div className="space-y-6">

              {session.templateName ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={18} />
                    <p className="text-emerald-800 font-bold text-sm">
                      Recognised format: <strong>{session.templateName}</strong> — mapping applied automatically.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!session.templateId) return;
                      await fetch(`${API_BASE}/api/import/templates/${session.templateId}`, {
                        method: 'DELETE',
                        headers: { 'x-user-id': String(user.id) },
                      });
                      reset();
                    }}
                    className="text-[10px] font-black text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all whitespace-nowrap flex-shrink-0"
                  >
                    Delete Template
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
                  <Sparkles className="text-blue-500 flex-shrink-0 mt-0.5" size={16} />
                  <p className="text-blue-800 font-bold text-sm leading-relaxed">
                    {session.mappingSource === 'ai' ? 'AI-assisted mapping applied.' : 'Smart mapping applied.'}
                    {' '}Check the columns below and fix any mismatches.{' '}
                    <span className="text-blue-600 font-medium">{session.rowCount} rows detected.</span>
                  </p>
                </div>
              )}

              {/* Mapping table */}
              <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-2/5">Internal Field</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Column</th>
                      <th className="px-5 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-28">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {INTERNAL_FIELDS.map(field => {
                      const suggestion = session.mapping?.[field.value];
                      const isMissing  = field.required && !mapping[field.value];
                      return (
                        <tr key={field.value} className={isMissing ? 'bg-red-50/60' : 'hover:bg-slate-50/50 transition-colors'}>
                          <td className="px-5 py-4">
                            <div className="font-black text-gray-800 text-sm">{field.label}</div>
                            {field.required && <div className="text-[9px] text-red-500 font-black uppercase tracking-widest mt-0.5">Required</div>}
                          </td>
                          <td className="px-5 py-4">
                            <div className="relative">
                              <select
                                value={mapping[field.value] || ''}
                                onChange={e => setMapping(prev => ({ ...prev, [field.value]: e.target.value || undefined }))}
                                className={`w-full appearance-none pl-3 pr-8 py-2.5 rounded-xl border text-sm font-medium
                                  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all
                                  ${isMissing ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-700'}`}
                              >
                                <option value="">— Do not import —</option>
                                {session.headers.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {suggestion && <ConfidenceBadge confidence={suggestion.confidence} source={suggestion.source} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Data preview */}
              {session.sampleRows?.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                    Data Preview — First {session.sampleRows.length} Rows
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-slate-50 border-b border-gray-100">
                        <tr>
                          {INTERNAL_FIELDS.filter(f => mapping[f.value]).map(f => (
                            <th key={f.value} className="px-4 py-3 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {session.sampleRows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            {INTERNAL_FIELDS.filter(f => mapping[f.value]).map(f => (
                              <td key={f.value} className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                                {row[mapping[f.value]] || <span className="text-gray-300">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Save template */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={saveTemplate} onChange={e => setSave(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-gray-800 text-sm">Save mapping as a template</p>
                    <p className="text-gray-400 text-xs font-medium mt-0.5">
                      Next upload with identical headers will be mapped automatically.
                    </p>
                  </div>
                </label>
                {saveTemplate && (
                  <input type="text" placeholder="e.g. SIMS Export, Canvas Gradebook…"
                    value={tmplName} onChange={e => setTmplName(e.target.value)}
                    className="mt-3 w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                )}
              </div>

              {!isValid && (
                <div className="flex items-center gap-2 text-orange-600 text-sm font-bold">
                  <AlertTriangle size={16} /> Student Name and Grade must be mapped before importing.
                </div>
              )}

              <button onClick={handleConfirm} disabled={!isValid}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed
                           text-white disabled:text-gray-400 font-black py-4 rounded-2xl transition-all shadow-md
                           text-sm flex items-center justify-center gap-2 uppercase tracking-widest">
                <CheckCircle2 size={18} />
                Confirm & Import {session.rowCount ? `(${session.rowCount} rows)` : ''}
              </button>
            </div>
          )}

          {/* ── IMPORTING ── */}
          {step === 'importing' && (
            <div className="py-20 text-center">
              <div className="mx-auto w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-5">
                <Loader2 className="text-purple-600 animate-spin" size={28} />
              </div>
              <p className="font-black text-gray-800 text-lg mb-2">Importing data…</p>
              <p className="text-gray-400 font-medium text-sm">Writing students, assessments, and scores to the database</p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && result && (
            <div className="space-y-6">
              <div className="text-center py-6">
                <div className="mx-auto w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-5">
                  <CheckCircle2 className="text-emerald-500" size={36} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">Import Complete!</h3>
                <p className="text-gray-400 font-medium">Your dashboard has been updated.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-emerald-700">{result.rowsImported}</p>
                  <p className="text-emerald-600 text-xs font-black uppercase tracking-widest mt-1">Rows Imported</p>
                </div>
                <div className={`border rounded-2xl p-5 text-center ${result.rowsSkipped > 0 ? 'bg-orange-50 border-orange-100' : 'bg-slate-50 border-slate-100'}`}>
                  <p className={`text-3xl font-black ${result.rowsSkipped > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{result.rowsSkipped}</p>
                  <p className={`text-xs font-black uppercase tracking-widest mt-1 ${result.rowsSkipped > 0 ? 'text-orange-500' : 'text-slate-400'}`}>Rows Skipped</p>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                  <p className="text-xs font-black text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle size={13} /> Skipped rows
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-xs text-orange-700 font-medium bg-white rounded-lg px-3 py-2 border border-orange-100">
                        <span className="font-black">Row {e.row}:</span> {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                  <RotateCcw size={15} /> Import Another
                </button>
                <button onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
                  View Dashboard <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="space-y-6 text-center py-6">
              <div className="mx-auto w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-5">
                <AlertTriangle className="text-red-500" size={36} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h3>
              <p className="text-red-600 font-medium text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
              <button onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm">
                <RotateCcw size={16} /> Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
