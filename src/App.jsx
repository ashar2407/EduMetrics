import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Users, TrendingUp, TrendingDown, AlertTriangle, BookOpen, ChevronRight, ArrowLeft, Activity, Target, UploadCloud, FileSpreadsheet, Download, Printer, Lightbulb, ShieldAlert, Search, LogOut, Lock, BarChart3, Brain, FileText, CheckCircle2, Wand2, Sparkles } from 'lucide-react';

// ─── PREMIUM CONFIG ────────────────────────────────────────────────────────────
// Replace with your real Stripe Payment Link URL from dashboard.stripe.com
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/YOUR_PAYMENT_LINK_ID';
// Builds the Stripe URL with the username embedded so the webhook knows who to upgrade,
// and sets the success redirect back to the app with ?payment=success
const buildStripeUrl = (username) => {
  const successUrl = encodeURIComponent(`${window.location.origin}/?payment=success`);
  return `${STRIPE_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(username)}&success_url=${successUrl}`;
};
const FREE_CLASS_LIMIT = 2;
// ───────────────────────────────────────────────────────────────────────────────

// --- STATISTICAL ENGINE ---
const calcStats = (arr) => {
  if (!arr.length) return { mean: 0, median: 0, stdDev: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  const stdDev = Math.sqrt(variance);
  return { mean, median, stdDev };
};

const calcLinearRegression = (yValues) => {
  const n = yValues.length;
  if (n < 2) return { slope: 0, intercept: yValues[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += yValues[i];
    sumXY += (i * yValues[i]);
    sumXX += (i * i);
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

const parseGradeToNumber = (val, format = 'auto') => {
  if (val === undefined || val === null || val === '') return NaN;
  const cleanVal = String(val).toLowerCase().trim();

  const formatMaps = {
    'us_letter': { 'a+': 100, 'a': 95, 'a-': 90, 'b+': 85, 'b': 80, 'b-': 75, 'c+': 70, 'c': 65, 'c-': 60, 'd+': 55, 'd': 50, 'd-': 45, 'f': 0, 'e': 40 },
    'uk_gcse': { '9': 100, '8': 89, '7': 78, '6': 67, '5': 56, '4': 44, '3': 33, '2': 22, '1': 11, 'u': 0 },
    'uk_alevel': { 'a*': 100, 'a': 85, 'b': 70, 'c': 55, 'd': 40, 'e': 25, 'u': 0 },
    'ib': { '7': 100, '6': 85, '5': 70, '4': 55, '3': 40, '2': 25, '1': 10 },
    'uni_uk': { '1st': 85, 'first': 85, '2:1': 65, '2.1': 65, '2:2': 55, '2.2': 55, '3rd': 45, 'third': 45, 'fail': 0 }
  };

  if (format !== 'percentage' && format !== 'auto' && formatMaps[format]) {
    if (formatMaps[format][cleanVal] !== undefined) return formatMaps[format][cleanVal];
  }

  const num = parseFloat(val);
  
  if (format === 'auto') {
    if (!isNaN(num)) return num; 
    if (formatMaps['us_letter'][cleanVal] !== undefined) return formatMaps['us_letter'][cleanVal];
    if (formatMaps['uk_alevel'][cleanVal] !== undefined) return formatMaps['uk_alevel'][cleanVal];
  }

  return !isNaN(num) ? num : NaN;
};

const getRelativePerformanceLabel = (zScore) => {
  if (zScore >= 1) return { text: "Top Performer", color: "text-emerald-700 bg-emerald-100 border-emerald-200" };
  if (zScore > 0.2) return { text: "Above Average", color: "text-green-700 bg-green-50 border-green-200" };
  if (zScore >= -0.2) return { text: "Average", color: "text-slate-700 bg-slate-100 border-slate-200" };
  if (zScore > -1) return { text: "Below Average", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "Needs Support", color: "text-red-700 bg-red-50 border-red-200" };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState('landing');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const [view, setView] = useState({ type: 'home', id: null });
  const [gradeFormat, setGradeFormat] = useState('auto');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [scores, setScores] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showPaywall, setShowPaywall] = useState(null); // null | 'pdf' | 'ai' | 'classes'
  const [showPricingPage, setShowPricingPage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('gradelens_dark') === 'true');

  // Apply dark mode class to root whenever it changes
  React.useEffect(() => {
    localStorage.setItem('gradelens_dark', darkMode);
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [tourStep, setTourStep] = useState(-1); // -1 = tour not started

  // ── Premium status: backend (login) OR localStorage dev override ──
  // Dev override: in browser console run:
  //   localStorage.setItem('gradelens_dev_premium', 'true')  → unlock
  //   localStorage.removeItem('gradelens_dev_premium')        → relock
  const isPremium = user?.isPremium === true ||
    localStorage.getItem('gradelens_dev_premium') === 'true';

  const requirePremium = (feature, action) => {
    if (isPremium) { action(); return; }
    setShowPaywall(feature);
  };

  // After Stripe redirects back with ?payment=success, re-check premium status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success' && user) {
      fetch(`https://edumetrics-api-kro4.onrender.com/api/user/${encodeURIComponent(user.name)}/premium`)
        .then(r => r.json())
        .then(data => {
          if (data.isPremium) {
            setUser(prev => ({ ...prev, isPremium: true }));
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
          }
        })
        .catch(console.error);
    }
  }, [user?.name]);

  useEffect(() => {
    if (!user) return;
    
    // --- LOAD SAVED USER DATA ---
    const savedData = localStorage.getItem(`gradelens_data_${user.name}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setClasses(parsed.classes || []);
        setStudents(parsed.students || []);
        setAssessments(parsed.assessments || []);
        setScores(parsed.scores || []);
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/class/')) {
        setView({ type: 'class', id: hash.replace('#/class/', '') });
      } else if (hash.startsWith('#/student/')) {
        setView({ type: 'student', id: hash.replace('#/student/', '') });
      } else {
        setView({ type: 'home', id: null });
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user]);

  const navigateTo = (type, id = null) => {
    if (type !== 'home') setTourStep(-1); // pause tour when drilling into a page
    setShowSettings(false);
    if (type === 'home') window.location.hash = '#/';
    else if (type === 'class') window.location.hash = `#/class/${id}`;
    else if (type === 'student') window.location.hash = `#/student/${id}`;
  };

  useEffect(() => {
    if (!document.getElementById('xlsx-script')) {
      const xlsxScript = document.createElement('script');
      xlsxScript.id = 'xlsx-script';
      xlsxScript.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      xlsxScript.async = true;
      document.head.appendChild(xlsxScript);
    }
    if (!document.getElementById('pdf-script')) {
      const pdfScript = document.createElement('script');
      pdfScript.id = 'pdf-script';
      pdfScript.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      pdfScript.async = true;
      document.head.appendChild(pdfScript);
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    setClasses([]);
    setStudents([]);
    setAssessments([]);
    setScores([]);
    setAuthView('landing');
    setShowLogoutConfirm(false);
    window.location.hash = '';
  };

  const processCSV = (csvText, activeFormat = gradeFormat, silent = false, overrideUser = user) => {
    try {
      // 1. Clean and split lines, ignoring empty ones at the end
      let lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) { 
        if (!silent) alert("The file appears to be empty or invalid."); 
        return; 
      }

      // 2. SMART HEADER DETECTION (Finds the row with actual headers, skipping titles)
      let headerRowIndex = 0;
      let maxScoreFound = -1;
      
      for (let i = 0; i < Math.min(20, lines.length); i++) {
        const cols = lines[i].toLowerCase().split(',');
        // Score this row based on how many "school data" keywords it contains
        let rowScore = cols.filter(c => c.includes('name') || c.includes('id') || c.includes('score') || c.includes('grade') || c.includes('subject') || c.includes('test') || c.includes('date')).length;
        if (rowScore > maxScoreFound && cols.length >= 3) {
          maxScoreFound = rowScore;
          headerRowIndex = i;
        }
      }

      const rawHeaders = lines[headerRowIndex].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const dataLines = lines.slice(headerRowIndex + 1);
      
      const aliases = {
        studentId: ['studentid', 'student_id', 'id', 'upn', 'urn', 'code', 'ref', 'number', 'learnerid', 'identifier'],
        firstName: ['first', 'forename', 'given'],
        lastName: ['last', 'surname', 'family'],
        studentName: ['studentname', 'student_name', 'name', 'fullname', 'pupil', 'learner', 'student'],
        subject: ['subject', 'class', 'course', 'module', 'program', 'branch'],
        topic: ['testname', 'test_name', 'test', 'assessment', 'topic', 'unit', 'chapter', 'concept', 'assignment'],
        date: ['testdate', 'test_date', 'date', 'time', 'timestamp', 'semester', 'term', 'week'],
        percentage: ['percentage', 'pct', '%', 'percent'],
        maxScore: ['max', 'outof', 'total', 'max_score', 'maxscore', 'possible'],
        score: ['score', 'raw_score', 'grade', 'mark', 'result', 'points']
      };

      const headerMap = { studentId: null, firstName: null, lastName: null, studentName: null, subject: null, topic: null, date: null, percentage: null, maxScore: null, score: null };
      
      // Pass 1: Strict ID
      rawHeaders.forEach(h => {
          let n = h.toLowerCase().replace(/[^a-z]/g, '');
          if (!headerMap.studentId && aliases.studentId.some(kw => n === kw || n.endsWith('id') || n === 'code')) headerMap.studentId = h;
      });

      // Pass 2: Names (First/Last split or Full Name)
      rawHeaders.forEach(h => {
          if (h === headerMap.studentId) return;
          let n = h.toLowerCase().replace(/[^a-z]/g, '');
          if (!headerMap.firstName && aliases.firstName.some(kw => n.includes(kw))) headerMap.firstName = h;
          else if (!headerMap.lastName && aliases.lastName.some(kw => n.includes(kw))) headerMap.lastName = h;
          else if (!headerMap.studentName && aliases.studentName.some(kw => n === kw || n.includes(kw))) headerMap.studentName = h;
      });

      // Pass 3: Scores, Subjects, Dates
      rawHeaders.forEach(h => {
          if ([headerMap.studentId, headerMap.studentName, headerMap.firstName, headerMap.lastName].includes(h)) return;
          let n = h.toLowerCase().replace(/[^a-z]/g, '');

          if (!headerMap.maxScore && aliases.maxScore.some(kw => n.includes(kw))) headerMap.maxScore = h;
          else if (!headerMap.percentage && aliases.percentage.some(kw => n.includes(kw))) headerMap.percentage = h;
          else if (!headerMap.score && aliases.score.some(kw => n === kw || n.includes(kw))) headerMap.score = h;
          else if (!headerMap.subject && aliases.subject.some(kw => n.includes(kw))) headerMap.subject = h;
          else if (!headerMap.topic && aliases.topic.some(kw => n.includes(kw))) headerMap.topic = h;
          else if (!headerMap.date && aliases.date.some(kw => n.includes(kw))) headerMap.date = h;
      });

      if (!headerMap.score && !headerMap.percentage) {
        if (!silent) alert("Grade Lens AI could not automatically locate a 'Score' or 'Percentage' column. Please check your file headers."); 
        return;
      }

      const newClassesMap = {};
      const newStudentsMap = {};
      const newAssessmentsMap = {};
      const newScores = [];
      let fallbackCounter = 1;

      for (let i = 0; i < dataLines.length; i++) {
        if (!dataLines[i].trim()) continue;
        // Parse CSV line handling commas inside quotes
        let values = [];
        let inQuotes = false;
        let currentValue = "";
        for (let char of dataLines[i]) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(currentValue.trim()); currentValue = ""; }
            else currentValue += char;
        }
        values.push(currentValue.trim());

        const row = {};
        rawHeaders.forEach((header, index) => { row[header] = values[index] !== undefined ? values[index] : ''; });

        // Build Name smartly
        let nameVal = headerMap.studentName ? row[headerMap.studentName] : '';
        if (!nameVal && headerMap.firstName && headerMap.lastName) {
            nameVal = `${row[headerMap.firstName]} ${row[headerMap.lastName]}`.trim();
        } else if (!nameVal && (headerMap.firstName || headerMap.lastName)) {
            nameVal = (row[headerMap.firstName] || row[headerMap.lastName]).trim();
        }

        const idVal = headerMap.studentId && row[headerMap.studentId] ? row[headerMap.studentId] : 'N/A';
        
        // Smart Score Calculation
        let rawScore = NaN;
        if (headerMap.percentage && row[headerMap.percentage]) {
            rawScore = parseFloat(row[headerMap.percentage].replace(/[^0-9.-]/g, ''));
        } else if (headerMap.score && row[headerMap.score]) {
            let scoreStr = String(row[headerMap.score]);
            // Handle fractional inputs like "45/50" natively
            if (scoreStr.includes('/')) {
                let parts = scoreStr.split('/');
                let s = parseFloat(parts[0]);
                let m = parseFloat(parts[1]);
                if (!isNaN(s) && !isNaN(m) && m > 0) rawScore = (s/m)*100;
            } else {
                rawScore = parseGradeToNumber(scoreStr, activeFormat);
                if (headerMap.maxScore && row[headerMap.maxScore] && !isNaN(rawScore) && activeFormat === 'auto') {
                    let max = parseFloat(row[headerMap.maxScore]);
                    if (!isNaN(max) && max > 0) rawScore = (rawScore / max) * 100;
                }
            }
        }

        if (!nameVal || isNaN(rawScore)) continue;

        const rawSubject = headerMap.subject && row[headerMap.subject] ? row[headerMap.subject] : 'General Classroom';
        let rawDate = headerMap.date && row[headerMap.date] ? row[headerMap.date] : `Assessment ${fallbackCounter++}`;
        if (!isNaN(rawDate)) rawDate = `Semester ${rawDate}`;

        const rawTopic = headerMap.topic && row[headerMap.topic] ? row[headerMap.topic] : '';
        const assessmentName = rawTopic ? rawTopic : (rawDate.includes('Semester') || rawDate.includes('Test') ? rawDate : `Test: ${rawDate}`);

        const subjectId = rawSubject.toLowerCase().replace(/\s+/g, '-');
        const studentKey = `${subjectId}-${String(nameVal).toLowerCase().replace(/\s+/g, '-')}-${String(idVal).toLowerCase().replace(/\s+/g, '-')}`;
        const assessmentId = `${subjectId}-${assessmentName.toLowerCase().replace(/\s+/g, '-')}`;

        if (!newClassesMap[subjectId]) newClassesMap[subjectId] = { id: subjectId, name: rawSubject };
        if (!newStudentsMap[studentKey]) newStudentsMap[studentKey] = { id: studentKey, classId: subjectId, name: nameVal, externalId: idVal };
        if (!newAssessmentsMap[assessmentId]) newAssessmentsMap[assessmentId] = { id: assessmentId, classId: subjectId, name: assessmentName, date: rawDate, topic: rawTopic };
        
        newScores.push({ studentId: studentKey, assessmentId, score: rawScore });
      }

      if (Object.keys(newClassesMap).length > 0) {
        const finalClasses = Object.values(newClassesMap);
        const finalStudents = Object.values(newStudentsMap);
        const finalAssessments = Object.values(newAssessmentsMap).sort((a, b) => a.date.localeCompare(b.date));
        
        setClasses(finalClasses);
        setStudents(finalStudents);
        setAssessments(finalAssessments);
        setScores(newScores);
        
        // --- SAVE NEW DATA TO THIS USER'S ACCOUNT ---
        const activeUser = overrideUser || user;
        if (activeUser) {
           localStorage.setItem(`gradelens_data_${activeUser.name}`, JSON.stringify({
              classes: finalClasses,
              students: finalStudents,
              assessments: finalAssessments,
              scores: newScores
           }));
        }

        navigateTo('home');
      } else {
        if (!silent) alert("No valid rows of data were found. Please ensure grades are recognizable.");
      }
    } catch (err) {
      console.error("Data Parse Error", err);
      if (!silent) alert("An error occurred while parsing the file. Please ensure it is a valid CSV/Excel file.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          if (!window.XLSX) { 
            alert("Excel parser engine is still loading. Please wait a second and try again."); 
            setIsLoading(false); 
            return; 
          }
          const workbook = window.XLSX.read(bstr, { type: 'binary' });
          processCSV(window.XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]));
        } else {
          processCSV(bstr);
        }
      } catch (err) {
        alert("Failed to read file data. Check if the document is encrypted or corrupted.");
      } finally {
        setIsLoading(false);
        e.target.value = null;
      }
    };
    
    file.name.endsWith('.csv') ? reader.readAsText(file) : reader.readAsBinaryString(file);
  };

  const downloadCSV = () => {
    let csv = "Student Name,Student ID,Subject,Date,Score\n";
    scores.forEach(s => {
      const student = students.find(st => st.id === s.studentId);
      const assessment = assessments.find(a => a.id === s.assessmentId);
      if (student && assessment) {
        const subject = classes.find(c => c.id === assessment.classId);
        csv += `${student.name},${student.externalId},${subject ? subject.name : 'Unknown'},${assessment.date},${s.score}\n`;
      }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gradelens_export.csv";
    link.click();
  };

  const downloadPDF = (fileName) => {
    if (!window.html2pdf) {
      console.warn("html2pdf library could not be loaded. Falling back to native print.");
      window.print();
      return;
    }

    setIsGeneratingPDF(true);
    
    setTimeout(() => {
      const element = document.getElementById('report-container');
      const opt = {
        margin:       [0.5, 0.5, 0.5, 0.5],
        filename:     `${fileName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      
      window.html2pdf().set(opt).from(element).save().then(() => {
        setIsGeneratingPDF(false);
      }).catch((err) => {
        console.error("PDF generation failed:", err);
        setIsGeneratingPDF(false);
        window.print(); 
      });
    }, 400);
  };

  // --- MOCK DATA FOR DEMO MODE ---
  const triggerDemoMode = () => {
    setIsLoading(true);
    const demoUser = { name: "Demo Educator", role: "Teacher" };
    setUser(demoUser);
    
    let seed = 12345;
    const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

    const firstNames = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Oliver", "Isabella", "Elijah", "Sophia", "James", "Charlotte", "William"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
    
    const uniqueStudents = [];
    for(let i = 0; i < firstNames.length; i++) {
      for(let j = 0; j < 3; j++) {
         uniqueStudents.push({ name: `${firstNames[i]} ${lastNames[(i + j) % lastNames.length]}`, id: `STU-${1000 + (i * 3 + j)}` });
      }
    }

    const subjects = [
      { name: "AP Calculus AB", topics: ["Limits", "Derivatives", "Integrals", "Applications", "Differential Eq"] },
      { name: "Physics 101", topics: ["Kinematics", "Dynamics", "Energy", "Momentum", "Rotational Motion"] }
    ];

    const dates = ["2025-09-15", "2025-10-20", "2025-11-18", "2026-01-15", "2026-02-28"];
    let csv = "Student Name,Student ID,Subject,Test Name,Date,Score\n";

    subjects.forEach(sub => {
      const enrolled = [...uniqueStudents].sort(() => 0.5 - random()).slice(0, 25);
      enrolled.forEach(student => {
        let baseScore = 60 + random() * 30;
        let trend = (random() - 0.5) * 6;

        if (student.name.includes("Smith")) { trend = -6 - (random() * 4); baseScore = 95; } // Ensure a struggling student
        if (student.name.includes("Emma")) { trend = 5 + (random() * 3); baseScore = 50; }   // Ensure an improving student

        sub.topics.forEach((topic, idx) => {
           let score = baseScore + (trend * idx) + (random() * 10 - 5);
           if (sub.name === "AP Calculus AB" && topic === "Integrals") score -= 25; // Hard test
           score = Math.max(0, Math.min(100, score));
           csv += `${student.name},${student.id},${sub.name},${topic},${dates[idx]},${Math.round(score)}\n`;
        });
      });
    });

    setTimeout(() => {
      processCSV(csv, 'percentage', true, demoUser);
      setIsLoading(false);
      setIsDemoMode(true);
      setTourStep(0); // auto-start the guided tour
    }, 1200);
  };

  const classData = useMemo(() => {
    const activeClassId = view.type === 'class' ? view.id : (view.type === 'student' ? students.find(s=>s.id===view.id)?.classId : classes[0]?.id);
    if (!activeClassId) return { alerts: [], assessmentStats: [], studentStats: [], assessments: [], autoInsights: [] };
    
    const classAssessments = assessments.filter(a => a.classId === activeClassId);
    const classStudents = students.filter(s => s.classId === activeClassId);
    const autoInsights = [];
    
    const assessmentStats = classAssessments.map(ass => {
      const assScores = scores.filter(s => s.assessmentId === ass.id).map(s => s.score);
      const stats = calcStats(assScores);
      return { ...ass, ...stats, scoreCount: assScores.length };
    });

    if (assessmentStats.length >= 2) {
      const latest = assessmentStats[assessmentStats.length - 1];
      const previous = assessmentStats[assessmentStats.length - 2];
      
      if (latest.mean < previous.mean - 5) {
        autoInsights.push(`Class average dropped significantly from ${previous.mean.toFixed(1)}% to ${latest.mean.toFixed(1)}% on ${latest.name}. Consider reviewing this material.`);
      } else if (latest.mean > previous.mean + 5) {
        autoInsights.push(`Great job! Class average improved by ${(latest.mean - previous.mean).toFixed(1)}% on ${latest.name}.`);
      }

      if (latest.stdDev > 15) {
        autoInsights.push(`High score variation detected on ${latest.name} (Spread: ${latest.stdDev.toFixed(1)}). Some students mastered it, while others struggled heavily.`);
      }
    }

    const studentStats = classStudents.map(stu => {
      const sScores = scores.filter(s => s.studentId === stu.id)
        .sort((a, b) => {
          const d1 = classAssessments.find(ax => ax.id === a.assessmentId)?.date || '';
          const d2 = classAssessments.find(ax => ax.id === b.assessmentId)?.date || '';
          return d1.localeCompare(d2);
        });
      
      const scoreVals = sScores.map(s => s.score);
      const { slope, intercept } = calcLinearRegression(scoreVals);
      const { mean } = calcStats(scoreVals);
      const lastScore = scoreVals[scoreVals.length - 1] || 0;

      const zScores = sScores.map(s => {
        const testStats = assessmentStats.find(ast => ast.id === s.assessmentId);
        if (!testStats || testStats.stdDev === 0) return 0;
        return (s.score - testStats.mean) / testStats.stdDev;
      });
      const avgZScore = zScores.length ? zScores.reduce((a, b) => a + b, 0) / zScores.length : 0;
      
      let lastPercentile = 50;
      if (sScores.length > 0) {
        const lastTestId = sScores[sScores.length - 1].assessmentId;
        const allScoresForTest = scores.filter(s => s.assessmentId === lastTestId).map(s => s.score).sort((a,b)=>a-b);
        const rank = allScoresForTest.indexOf(lastScore) + 1;
        lastPercentile = allScoresForTest.length ? (rank / allScoresForTest.length) * 100 : 50;
      }

      let riskScoreValue = 0;
      if (slope < -0.5) riskScoreValue += Math.abs(slope) * 2; 
      if (lastScore < mean * 0.9) riskScoreValue += (mean - lastScore) * 0.5; 
      if (lastPercentile < 30) riskScoreValue += (30 - lastPercentile) * 0.3; 

      let riskLevel = 'Low';
      let riskColor = 'text-green-600 bg-green-50';
      if (riskScoreValue > 15) { riskLevel = 'High'; riskColor = 'text-red-600 bg-red-50 font-bold'; }
      else if (riskScoreValue > 7) { riskLevel = 'Medium'; riskColor = 'text-orange-600 bg-orange-50'; }

      return { ...stu, scores: sScores, scoreVals, slope, intercept, mean, lastScore, riskLevel, riskColor, avgZScore };
    });

    studentStats.sort((a, b) => b.slope - a.slope);

    return { assessmentStats, studentStats, assessments: classAssessments, autoInsights, activeClassId };
  }, [classes, students, assessments, scores, view]);

  // --- COMPONENTS ---

  // ── DARK MODE CSS ─────────────────────────────────────────────────────────────
  const DarkModeStyles = () => darkMode ? (
    <style>{`
      [data-theme="dark"] { color-scheme: dark; }
      [data-theme="dark"] body,
      [data-theme="dark"] .min-h-screen { background-color: #0f172a !important; color: #e2e8f0 !important; }
      [data-theme="dark"] .bg-white { background-color: #1e293b !important; }
      [data-theme="dark"] .bg-slate-50, [data-theme="dark"] .bg-gray-50 { background-color: #0f172a !important; }
      [data-theme="dark"] .bg-gray-100 { background-color: #1e293b !important; }
      [data-theme="dark"] .border-gray-100, [data-theme="dark"] .border-gray-200 { border-color: #334155 !important; }
      [data-theme="dark"] .text-gray-900, [data-theme="dark"] .text-gray-800 { color: #f1f5f9 !important; }
      [data-theme="dark"] .text-gray-700, [data-theme="dark"] .text-gray-600 { color: #cbd5e1 !important; }
      [data-theme="dark"] .text-gray-500, [data-theme="dark"] .text-gray-400 { color: #94a3b8 !important; }
      [data-theme="dark"] .bg-slate-50\/50, [data-theme="dark"] .bg-gray-50\/50 { background-color: #1e293b !important; }
      [data-theme="dark"] input, [data-theme="dark"] textarea, [data-theme="dark"] select {
        background-color: #0f172a !important; color: #e2e8f0 !important; border-color: #334155 !important;
      }
      [data-theme="dark"] .shadow-sm { box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important; }
      [data-theme="dark"] .divide-y > * { border-color: #1e293b !important; }
      [data-theme="dark"] .hover\:bg-blue-50\/30:hover { background-color: rgba(30,58,138,0.2) !important; }
    `}</style>
  ) : null;

  // ── SETTINGS PAGE ─────────────────────────────────────────────────────────────
  const SettingsPage = () => {
    const [notifStatus, setNotifStatus] = useState('');

    const sendAtRiskNotifications = async () => {
      if (!user.email) { setShowEmailModal(true); return; }
      setNotifStatus('sending');
      try {
        const res = await fetch('https://edumetrics-api-kro4.onrender.com/api/notify/at-risk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });
        const data = await res.json();
        setNotifStatus(res.ok ? `sent:${data.sent || 0}` : 'error');
      } catch { setNotifStatus('error'); }
    };

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setShowSettings(false)} className="flex items-center text-gray-400 hover:text-gray-900 font-black text-xs uppercase tracking-widest transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </button>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Settings</h1>
        </div>

        {/* Dark Mode */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
          <h2 className="font-black text-gray-900 text-lg mb-1">Appearance</h2>
          <p className="text-gray-400 text-sm font-medium mb-6">Adjust how Grade Lens looks on your device.</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-gray-800 text-sm">Dark Mode</p>
              <p className="text-gray-400 text-xs font-medium mt-0.5">Easier on the eyes in low-light environments</p>
            </div>
            <button
              onClick={() => setDarkMode(d => !d)}
              className={`relative w-14 h-7 rounded-full transition-all duration-300 ${darkMode ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${darkMode ? 'left-7' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Email Notifications */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
          <h2 className="font-black text-gray-900 text-lg mb-1">At-Risk Notifications</h2>
          <p className="text-gray-400 text-sm font-medium mb-6">Send an email summary of all high-risk students across your classrooms.</p>
          {(() => {
            const [emailInput, setEmailInput] = React.useState('');
            const [emailSaveStatus, setEmailSaveStatus] = React.useState('');
            const [editing, setEditing] = React.useState(false);

            const saveEmail = async () => {
              if (!emailInput || !/^[^@]+@[^@]+\.[^@]+$/.test(emailInput)) {
                setEmailSaveStatus('invalid');
                return;
              }
              setEmailSaveStatus('saving');
              try {
                const res = await fetch('https://edumetrics-api-kro4.onrender.com/api/user/email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: user.id, email: emailInput })
                });
                if (res.ok) {
                  setUser(prev => ({ ...prev, email: emailInput }));
                  setEmailSaveStatus('saved');
                  setEditing(false);
                  setTimeout(() => setEmailSaveStatus(''), 2500);
                } else { setEmailSaveStatus('error'); }
              } catch { setEmailSaveStatus('error'); }
            };

            return user.email && !editing ? (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-500 text-xl">✉</span>
                    <div>
                      <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Notifications sent to</p>
                      <p className="font-black text-blue-900 text-sm mt-0.5">{user.email}</p>
                    </div>
                  </div>
                  <button onClick={() => { setEditing(true); setEmailInput(user.email); }}
                    className="text-xs font-black text-blue-500 hover:text-blue-700 uppercase tracking-widest transition-colors">
                    Change
                  </button>
                </div>
                <button onClick={sendAtRiskNotifications} disabled={notifStatus === 'sending'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-3.5 rounded-2xl text-sm uppercase tracking-widest transition-all shadow-sm">
                  {notifStatus === 'sending' ? 'Sending...' :
                   notifStatus.startsWith('sent:') ? `✓ Sent to ${notifStatus.split(':')[1]} students` :
                   notifStatus === 'error' ? '✕ Failed — try again' : 'Send At-Risk Report Now'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {!user.email && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3 mb-4">
                    <span className="text-amber-500 text-lg mt-0.5">⚠</span>
                    <p className="text-amber-700 text-xs font-medium leading-relaxed">
                      No email on file. Add one below to enable at-risk notifications.
                    </p>
                  </div>
                )}
                <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                  placeholder="you@school.edu"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium text-sm transition-all" />
                {emailSaveStatus === 'invalid' && <p className="text-red-500 text-xs font-bold">Please enter a valid email address.</p>}
                {emailSaveStatus === 'error' && <p className="text-red-500 text-xs font-bold">Failed to save — try again.</p>}
                {emailSaveStatus === 'saved' && <p className="text-emerald-500 text-xs font-bold">✓ Email saved!</p>}
                <div className="flex gap-3">
                  <button onClick={saveEmail} disabled={emailSaveStatus === 'saving'}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all">
                    {emailSaveStatus === 'saving' ? 'Saving...' : 'Save Email'}
                  </button>
                  {editing && (
                    <button onClick={() => { setEditing(false); setEmailSaveStatus(''); }}
                      className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Account Info */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
          <h2 className="font-black text-gray-900 text-lg mb-6">Account</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-gray-400 font-black text-xs uppercase tracking-widest">Username</span>
              <span className="font-black text-gray-800 text-sm">{user.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-50">
              <span className="text-gray-400 font-black text-xs uppercase tracking-widest">Plan</span>
              <span className={`font-black text-xs px-3 py-1.5 rounded-lg border uppercase tracking-widest ${isPremium ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-600 bg-gray-50 border-gray-200'}`}>
                {isPremium ? '✦ Premium' : 'Free'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400 font-black text-xs uppercase tracking-widest">Email</span>
              <span className="font-black text-gray-800 text-sm">{user.email || 'Not set'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── EMAIL MODAL ───────────────────────────────────────────────────────────────
  const EmailModal = () => {
    const [emailInput, setEmailInput] = React.useState('');
    const [status, setStatus] = React.useState(''); // '' | 'saving' | 'saved' | 'error' | 'invalid'

    if (!showEmailModal) return null;

    const save = async () => {
      if (!emailInput || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailInput)) {
        setStatus('invalid'); return;
      }
      setStatus('saving');
      try {
        const res = await fetch('https://edumetrics-api-kro4.onrender.com/api/user/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email: emailInput })
        });
        if (res.ok) {
          setUser(prev => ({ ...prev, email: emailInput }));
          setStatus('saved');
          setTimeout(() => setShowEmailModal(false), 1200);
        } else { setStatus('error'); }
      } catch { setStatus('error'); }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowEmailModal(false)}>
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-7 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{backgroundImage:'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize:'20px 20px'}} />
            <div className="relative">
              <div className="text-4xl mb-2">✉</div>
              <h2 className="text-xl font-black text-white">Add Your Email</h2>
              <p className="text-blue-100 text-xs font-medium mt-1">Required for at-risk notifications</p>
            </div>
          </div>
          {/* Body */}
          <div className="p-7">
            <p className="text-gray-500 font-medium text-sm leading-relaxed mb-5">
              To use email notifications, add your email address below. You can update this any time from <strong>Settings</strong>.
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="you@school.edu"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium text-sm mb-3 transition-all"
              autoFocus
            />
            {status === 'invalid' && <p className="text-red-500 text-xs font-bold mb-3">Please enter a valid email address.</p>}
            {status === 'error'   && <p className="text-red-500 text-xs font-bold mb-3">Failed to save — try again.</p>}
            {status === 'saved'   && <p className="text-emerald-500 text-xs font-bold mb-3">✓ Email saved! Closing...</p>}
            <button onClick={save} disabled={status === 'saving' || status === 'saved'}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-3.5 rounded-xl text-sm uppercase tracking-widest transition-all shadow-sm mb-3">
              {status === 'saving' ? 'Saving...' : 'Save Email'}
            </button>
            <button onClick={() => setShowEmailModal(false)}
              className="w-full text-gray-400 hover:text-gray-600 font-bold text-sm py-2 transition-colors">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── GUIDED DEMO TOUR ──────────────────────────────────────────────────────────
  const TOUR_STEPS = [
    {
      id: 'import-panel',
      title: '📂 Smart Data Import',
      body: 'In the real app, you can drag-and-drop any CSV or Excel grading sheet from Canvas, SIMS, Arbor, or Google Classroom. The AI engine auto-detects headers and calculates percentages — zero prep needed.',
      position: 'bottom',
      targetId: 'demo-import-panel',
    },
    {
      id: 'classroom-cards',
      title: '🏫 Your Active Classrooms',
      body: 'Each card represents a subject. Click any classroom to dive into its full analytics dashboard — trends, score distributions, and a ranked student roster.',
      position: 'bottom',
      targetId: 'demo-classroom-cards',
    },
    {
      id: 'ai-insights',
      title: '🧠 AI-Powered Insights',
      body: 'Grade Lens automatically detects class-wide patterns — sudden drops, high variance tests, and improving trends — so you never miss a signal buried in the data.',
      position: 'bottom',
      targetId: 'demo-ai-insights',
    },
    {
      id: 'risk-table',
      title: '⚠️ Risk Prediction Table',
      body: 'Every student is scored by our risk algorithm. It factors in declining trajectory, recent performance vs. class average, and percentile rank to flag who needs your attention most.',
      position: 'top',
      targetId: 'demo-risk-table',
    },
    {
      id: 'student-profile',
      title: '📈 Student Profile & Charts',
      body: 'Click any student to see their full longitudinal profile — actual scores, a regression trendline, class average comparison, and an AI-generated forecast for their next assessment.',
      position: 'top',
      targetId: 'demo-risk-table',
    },
    {
      id: 'pdf-export',
      title: '📄 One-Click PDF Reports',
      body: 'Generate a polished, parent-ready PDF report for any student or class in seconds. Premium feature — upgrade to unlock.',
      position: 'top',
      targetId: 'demo-pdf-btn',
    },
  ];

  const TourOverlay = () => {
    if (!isDemoMode || tourStep < 0 || tourStep >= TOUR_STEPS.length) return null;
    const step = TOUR_STEPS[tourStep];
    const total = TOUR_STEPS.length;

    return (
      <>
        {/* Dark backdrop */}
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px] pointer-events-none" />

        {/* Floating tooltip card */}
        <div className="fixed z-50 bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pointer-events-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                style={{ width: `${((tourStep + 1) / total) * 100}%` }}
              />
            </div>
            <div className="p-6">
              {/* Step counter */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Step {tourStep + 1} of {total}
                </span>
                <button
                  onClick={() => setTourStep(-1)}
                  className="text-gray-300 hover:text-gray-600 text-lg font-bold leading-none transition-colors"
                >✕</button>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-2">{step.title}</h3>
              <p className="text-gray-500 font-medium text-sm leading-relaxed mb-5">{step.body}</p>
              {/* Nav buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setTourStep(s => s - 1)}
                  disabled={tourStep === 0}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-black text-gray-600 text-xs uppercase tracking-widest transition-all"
                >
                  ← Prev
                </button>
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setTourStep(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === tourStep ? 'bg-blue-500 w-5' : 'bg-gray-200 hover:bg-gray-400'}`}
                    />
                  ))}
                </div>
                {tourStep < total - 1 ? (
                  <button
                    onClick={() => setTourStep(s => s + 1)}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest transition-all shadow-sm shadow-blue-200"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => setTourStep(-1)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black text-xs uppercase tracking-widest transition-all shadow-sm"
                  >
                    Done ✓
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pulsing target indicator — shown above the card */}
          <div className="flex justify-center -mt-2 mb-2 order-first">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping opacity-75" />
          </div>
        </div>

        {/* Highlight ring around the targeted element */}
        {step.targetId && <TargetHighlight targetId={step.targetId} />}
      </>
    );
  };

  const TargetHighlight = ({ targetId }) => {
    const [rect, setRect] = React.useState(null);

    React.useEffect(() => {
      const el = document.getElementById(targetId);
      if (!el) return;
      const update = () => {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height });
      };
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update);
      return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update); };
    }, [targetId]);

    if (!rect) return null;
    return (
      <div
        className="rounded-2xl pointer-events-none"
        style={{
          position: 'fixed',
          top: rect.top - window.scrollY - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          boxShadow: '0 0 0 4px #3b82f6, 0 0 0 8px rgba(59,130,246,0.2)',
          zIndex: 45,
        }}
      />
    );
  };

  // ── PAYWALL MODAL ─────────────────────────────────────────────────────────────
  const paywallCopy = {
    pdf:     { icon: '📄', title: 'PDF Reports are Premium',      desc: 'Generate beautiful, parent-ready PDF progress reports for every student with one click.' },
    ai:      { icon: '🧠', title: 'AI Insights are Premium',      desc: 'Unlock algorithmic class insights, trend detection, and automated risk commentary.' },
    classes: { icon: '🏫', title: 'Unlimited Classes are Premium', desc: `Free accounts are limited to ${FREE_CLASS_LIMIT} classrooms. Go Premium to import as many subjects as you need.` },
  };

  const PaywallModal = () => {
    if (!showPaywall) return null;
    const copy = paywallCopy[showPaywall] || paywallCopy.ai;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowPaywall(null)}>
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{backgroundImage:'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize:'30px 30px'}} />
            <div className="relative">
              <div className="text-5xl mb-3">{copy.icon}</div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-white text-xs font-black uppercase tracking-widest mb-3">
                ✦ Grade Lens Premium
              </div>
              <h2 className="text-2xl font-black text-white leading-tight">{copy.title}</h2>
            </div>
          </div>
          {/* Body */}
          <div className="p-8">
            <p className="text-gray-600 font-medium text-center leading-relaxed mb-6">{copy.desc}</p>
            <div className="space-y-2.5 mb-8">
              {[
                'Unlimited classes & student rosters',
                'AI-powered class & student insights',
                'One-click PDF report generation',
                'Priority support from our team',
              ].map(f => (
                <div key={f} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  {f}
                </div>
              ))}
            </div>
            <a href={user ? buildStripeUrl(user.name) : STRIPE_PAYMENT_LINK} target="_blank" rel="noreferrer"
              className="block w-full text-center bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 transition-all text-sm uppercase tracking-widest mb-3">
              Upgrade to Premium — $9.99/mo
            </a>
            <button onClick={() => { setShowPaywall(null); setShowPricingPage(true); }}
              className="block w-full text-center text-gray-400 hover:text-gray-700 font-bold text-sm py-2 transition-colors">
              See full plan comparison →
            </button>
            <button onClick={() => setShowPaywall(null)} className="absolute top-4 right-4 text-white/70 hover:text-white text-xl font-bold leading-none">✕</button>
          </div>
        </div>
      </div>
    );
  };

  // ── PRICING PAGE ──────────────────────────────────────────────────────────────
  const PricingPage = () => (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 py-4 px-8 flex justify-between items-center">
        <div className="flex items-center text-blue-600">
          <Activity className="h-8 w-8 mr-3" strokeWidth={3} />
          <span className="text-2xl font-black tracking-tight uppercase italic">Grade<span className="text-gray-400 font-light not-italic">Lens</span></span>
        </div>
        <button onClick={() => setShowPricingPage(false)} className="text-gray-500 hover:text-gray-900 font-bold text-sm uppercase tracking-widest flex items-center gap-2">
          <ArrowLeft size={16}/> Back
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-700 text-sm font-black mb-6 border border-amber-200 uppercase tracking-widest">
            ✦ Simple, Transparent Pricing
          </div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tight mb-4">Choose your plan</h1>
          <p className="text-xl text-gray-500 font-medium max-w-xl mx-auto">Start free. Upgrade when you're ready to unlock the full power of Grade Lens.</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free */}
          <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Free Forever</p>
              <div className="text-5xl font-black text-gray-900">$0</div>
              <p className="text-gray-500 font-medium mt-1">No credit card needed</p>
            </div>
            <div className="space-y-3 mb-8">
              {[
                [`Up to ${FREE_CLASS_LIMIT} classrooms`, true],
                ['Basic student roster & scores', true],
                ['Performance trend charts', true],
                ['CSV data export', true],
                ['AI-powered class insights', false],
                ['PDF report generation', false],
                ['Unlimited classrooms', false],
                ['Priority support', false],
              ].map(([label, included]) => (
                <div key={label} className="flex items-center gap-3 text-sm font-medium">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${included ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                    {included
                      ? <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                  </div>
                  <span className={included ? 'text-gray-800' : 'text-gray-400'}>{label}</span>
                </div>
              ))}
            </div>
            <div className="w-full text-center bg-gray-100 text-gray-500 font-black py-3.5 rounded-2xl text-sm uppercase tracking-widest">
              {isPremium ? 'Your Previous Plan' : 'Current Plan'}
            </div>
          </div>

          {/* Premium */}
          <div className="bg-gradient-to-br from-gray-900 to-slate-800 rounded-3xl p-8 shadow-2xl shadow-gray-900/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full -translate-y-32 translate-x-32" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/10 rounded-full translate-y-24 -translate-x-24" />
            <div className="relative">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-400 mb-2">✦ Premium</p>
                  <div className="text-5xl font-black text-white">$9.99</div>
                  <p className="text-gray-400 font-medium mt-1">per month</p>
                </div>
                <div className="bg-amber-400/20 border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                  Most Popular
                </div>
              </div>
              <div className="space-y-3 mb-8">
                {[
                  'Everything in Free',
                  'Unlimited classrooms',
                  'AI-powered class insights',
                  'PDF report generation',
                  'Priority support',
                  'Early access to new features',
                ].map(label => (
                  <div key={label} className="flex items-center gap-3 text-sm font-medium text-gray-200">
                    <div className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    {label}
                  </div>
                ))}
              </div>
              {isPremium ? (
                <div className="w-full text-center bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-black py-3.5 rounded-2xl text-sm uppercase tracking-widest">
                  ✓ Active Plan
                </div>
              ) : (
                <a href={user ? buildStripeUrl(user.name) : STRIPE_PAYMENT_LINK} target="_blank" rel="noreferrer"
                  className="block w-full text-center bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-amber-900/30 transition-all text-sm uppercase tracking-widest">
                  Upgrade Now →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              ['Can I cancel any time?', 'Yes — cancel from your Stripe billing portal with one click. No questions asked.'],
              ['Is my data safe?', 'All data is stored securely. Your student records never leave your account.'],
              ['What happens when I upgrade?', 'After payment, your account is instantly upgraded. Refresh the page if needed.'],
              ['Do you offer school-wide discounts?', 'Yes! Email us for district and school pricing.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <p className="font-black text-gray-900 mb-2">{q}</p>
                <p className="text-gray-500 font-medium text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );

  const LandingPage = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4 px-8 flex justify-between items-center">
        <div className="flex items-center text-blue-600">
          <Activity className="h-8 w-8 mr-3" strokeWidth={3} />
          <span className="text-2xl font-black tracking-tight uppercase italic">Grade<span className="text-gray-400 font-light not-italic">Lens</span></span>
        </div>
        <div className="space-x-4">
          <button onClick={() => setShowPricingPage(true)} className="text-gray-600 font-bold hover:text-blue-600 transition-colors">Pricing</button>
          <button onClick={() => setAuthView('login')} className="text-gray-600 font-bold hover:text-blue-600 transition-colors">Log In</button>
          <button onClick={() => setAuthView('signup')} className="text-gray-600 font-bold hover:text-blue-600 transition-colors">Create Account</button>
          <button onClick={triggerDemoMode} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all shadow-blue-200">Try Interactive Demo</button>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-bold mb-8 border border-blue-100">
          <Sparkles size={16} /> AI-Powered Student Analytics
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight max-w-4xl leading-tight mb-6">
          Transform Student Data into <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Actionable Insights</span>
        </h1>
        <p className="text-xl text-gray-500 font-medium max-w-2xl mb-12 leading-relaxed">
          Predictive analytics, automated risk detection, and longitudinal performance tracking built specifically for modern educators and school leaders.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md">
          <button onClick={() => setAuthView('signup')} className="flex-1 bg-gray-900 hover:bg-black text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex items-center justify-center">
             Create Account <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <button onClick={triggerDemoMode} className="flex-1 bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-100 px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center shadow-sm">
             View Demo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mt-24 text-left">
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="bg-purple-100 w-12 h-12 rounded-xl flex items-center justify-center text-purple-600 mb-6"><Brain size={24} /></div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Predictive Modeling</h3>
            <p className="text-gray-500 font-medium">Advanced linear regression algorithms forecast future student performance based on historical trajectory.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="bg-amber-100 w-12 h-12 rounded-xl flex items-center justify-center text-amber-600 mb-6"><AlertTriangle size={24} /></div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Automated Risk Detection</h3>
            <p className="text-gray-500 font-medium">Instantly identify students who are statistically falling behind peers to enable proactive intervention.</p>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="bg-emerald-100 w-12 h-12 rounded-xl flex items-center justify-center text-emerald-600 mb-6"><FileText size={24} /></div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">One-Click PDF Reports</h3>
            <p className="text-gray-500 font-medium">Generate beautiful, parent-ready PDF reports highlighting student progress, strengths, and goals in seconds.</p>
          </div>
        </div>
      </main>
      <footer className="py-8 text-center text-gray-400 font-medium text-sm">
        &copy; {new Date().getFullYear()} Grade Lens Analytics. Designed for Educators.
      </footer>
    </div>
  );

  const ArrowRight = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;

  const SignupPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');

    const handleSignup = async (e) => {
      e.preventDefault();
      setError('');

      if (password.length < 6 || !/\d/.test(password)) {
        setError('Password must be at least 6 characters and contain a number.');
        return;
      }

      try {
        const response = await fetch('https://edumetrics-api-kro4.onrender.com/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email: email || null })
        });

        const data = await response.json();

        if (response.ok) {
          // Success! The database saved them. Log them in.
          setUser({ name: data.user.username, role: 'Teacher', id: data.user.id, isPremium: false });
        } else {
          // Server caught an error (like username already taken)
          setError(data.error || 'Failed to create account.');
        }
      } catch (err) {
        console.error(err);
        setError('Could not connect to the database. Is the server running?');
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 text-center bg-gray-50/50">
            <div className="flex justify-center items-center text-blue-600 mb-4">
              <Activity className="h-10 w-10 mr-2" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Create Account</h2>
            <p className="text-sm text-gray-500 font-medium">Set up your Educator profile</p>
          </div>
          <form onSubmit={handleSignup} className="p-8 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold border border-red-100 flex items-center">
                <ShieldAlert size={16} className="mr-2 flex-shrink-0" /> {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Choose Username</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium transition-all" placeholder="e.g. Mr. Smith" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Create Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium transition-all" placeholder="••••••••" />
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-2">Must be at least 6 characters and include a number.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Email Address</label>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">Optional</span>
              </div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium transition-all" placeholder="you@school.edu" />
              <div className="mt-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                <span className="text-blue-500 text-base mt-0.5">✉</span>
                <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                  Adding your email unlocks <strong>at-risk student email notifications</strong>. You can also add or update this later in <strong>Settings</strong>.
                </p>
              </div>
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex justify-center items-center">
              <Lock size={18} className="mr-2" /> Create Secure Account
            </button>
          </form>
          <div className="p-6 pt-0 text-center space-y-3 flex flex-col">
            <button onClick={() => setAuthView('login')} className="text-blue-600 hover:text-blue-800 text-sm font-bold transition-colors">
              Already have an account? Log In
            </button>
            <button onClick={() => setAuthView('landing')} className="text-gray-400 hover:text-gray-600 text-sm font-bold transition-colors">
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  };

  const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
      e.preventDefault();
      setError('');

      try {
        // Check credentials against the AWS database (Note the /login URL!)
        const response = await fetch('https://edumetrics-api-kro4.onrender.com/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
          // Success! Credentials match.
          setUser({ name: data.user.username, role: 'Teacher', id: data.user.id, isPremium: data.user.isPremium ?? false });
        } else {
          // Wrong password or username
          setError(data.error || 'Invalid login details.');
        }
      } catch (err) {
        console.error(err);
        setError('Could not connect to the database. Is the server running?');
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 text-center bg-gray-50/50">
            <div className="flex justify-center items-center text-blue-600 mb-4">
              <Activity className="h-10 w-10 mr-2" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Welcome Back</h2>
            <p className="text-sm text-gray-500 font-medium">Log in to your Educator profile</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold border border-red-100 flex items-center">
                <ShieldAlert size={16} className="mr-2 flex-shrink-0" /> {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Username</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium transition-all" placeholder="e.g. Mr. Smith" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium transition-all" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex justify-center items-center">
              <Lock size={18} className="mr-2" /> Secure Log In
            </button>
          </form>
          <div className="p-6 pt-0 text-center space-y-3 flex flex-col">
            <button onClick={() => setAuthView('signup')} className="text-blue-600 hover:text-blue-800 text-sm font-bold transition-colors">
              Don't have an account? Create one
            </button>
            <button onClick={() => setAuthView('landing')} className="text-gray-400 hover:text-gray-600 text-sm font-bold transition-colors">
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  };

  const TeacherHome = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showAtRisk, setShowAtRisk] = useState(false); // collapsed by default
    const filteredClasses = classes.filter(cls => cls.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // Compute summary stats for the header row
    const totalStudents = students.length;
    const atRiskAll = classes.flatMap(cls => {
      const classStudents = students.filter(s => s.classId === cls.id);
      return classStudents.flatMap(stu => {
        const sScores = scores.filter(sc => sc.studentId === stu.id);
        if (sScores.length < 2) return [];
        const vals = sScores.map(s => s.score);
        const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
        const last = vals[vals.length-1];
        const n = vals.length;
        let sumX=0,sumY=0,sumXY=0,sumXX=0;
        vals.forEach((v,i)=>{sumX+=i;sumY+=v;sumXY+=i*v;sumXX+=i*i;});
        const slope = n>1?(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX):0;
        let riskScore=0;
        if(slope<-0.5) riskScore+=Math.abs(slope)*2;
        if(last<mean*0.9) riskScore+=(mean-last)*0.5;
        const riskLevel=riskScore>15?'High':riskScore>7?'Medium':null;
        if(!riskLevel) return [];
        return [{id:stu.id,name:stu.name,subject:cls.name,classId:cls.id,mean,last,slope,riskLevel}];
      });
    }).sort((a,b)=>(b.riskLevel==='High'?1:0)-(a.riskLevel==='High'?1:0)||a.mean-b.mean);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Dashboard Overview</h1>
            <p className="text-gray-500 mt-1 font-medium">Welcome back, <span className="capitalize">{user.name}</span></p>
          </div>
          {isLoading && <span className="text-blue-600 font-bold animate-pulse flex items-center"><Activity className="mr-2 h-4 w-4 animate-spin"/> Processing Data...</span>}
        </div>

        {/* ── FREE TIER UPSELL BANNER ── */}
        {!isPremium && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap shadow-sm">
            <div className="flex items-center gap-3">
              <div className="text-2xl">✦</div>
              <div>
                <p className="font-black text-amber-900 text-sm">You're on the Free Plan</p>
                <p className="text-amber-700 text-xs font-medium mt-0.5">Upgrade to unlock AI insights, PDF reports, and unlimited classrooms.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPricingPage(true)} className="text-amber-700 font-black text-xs uppercase tracking-widest hover:text-amber-900 transition-colors">
                See plans →
              </button>
              <a href={user ? buildStripeUrl(user.name) : STRIPE_PAYMENT_LINK} target="_blank" rel="noreferrer"
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-sm hover:from-amber-600 hover:to-orange-600 transition-all whitespace-nowrap">
                Upgrade — $9.99/mo
              </a>
            </div>
          </div>
        )}
        {isPremium && (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="text-xl">✦</div>
            <p className="font-black text-emerald-800 text-sm">Premium Plan Active — All features unlocked.</p>
          </div>
        )}

        {/* ── IMPORT PANEL ── */}
        <div id="demo-import-panel" className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center">
              <FileSpreadsheet className="mr-2 text-blue-500 h-5 w-5" /> {isDemoMode ? 'Demo Data' : 'Import & Export Data'}
            </h2>
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold flex items-center">
              <Wand2 size={14} className="mr-2"/> {isDemoMode ? 'Demo Mode Active' : 'Zero-Prep Smart Engine Active'}
            </div>
          </div>
          {isDemoMode ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 font-medium mb-5">
                You're viewing a pre-loaded demo dataset with 2 subjects and 25 students each.
                In the full app, you can upload any Excel or CSV grading sheet and the AI parses it instantly.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={() => setTourStep(0)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm">
                  ▶ Restart Guided Tour
                </button>
                <button onClick={downloadCSV} disabled={scores.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors text-sm shadow-sm">
                  <Download size={16} /> Export Demo CSV
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 font-medium mb-6">Upload raw grading sheets directly from your school's system (Canvas, Google Classroom, SIMS, Arbor, etc.). The AI automatically parses headers, stitches split names, and calculates percentages regardless of column order.</p>
              <div className="flex flex-wrap items-end gap-5 border-t border-gray-100 pt-5">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Scoring Format</label>
                  <select value={gradeFormat} onChange={(e) => setGradeFormat(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto">
                    <option value="auto">Auto-Detect</option>
                    <option value="percentage">Percentage (0-100)</option>
                    <option value="uk_gcse">UK GCSE (9-1)</option>
                    <option value="uk_alevel">UK A-Level (A*-U)</option>
                    <option value="us_letter">US Letter (A+ to F)</option>
                    <option value="ib">IB Diploma (7-1)</option>
                    <option value="uni_uk">UK Degree (1st, 2:1, 2:2...)</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Upload Any File</label>
                  <div className="relative">
                    <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" id="file-upload" />
                    <label htmlFor="file-upload" className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors cursor-pointer text-sm shadow-sm">
                      <UploadCloud size={18} /> Select Excel / CSV
                    </label>
                  </div>
                </div>
                <div className="flex flex-col ml-auto">
                  <button onClick={downloadCSV} disabled={scores.length === 0} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors text-sm shadow-sm">
                    <Download size={16} /> Export Master CSV
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── SUBJECT COMPARISON + AT-RISK SIDE BY SIDE ── */}
        {classes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Left: Subject overview */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="font-black text-gray-900 text-sm">Subject Overview</h2>
                <p className="text-gray-400 text-xs font-medium mt-0.5">At-risk students per class</p>
              </div>
              <div className="divide-y divide-gray-50">
                {classes.map(cls => {
                  const enrolled = students.filter(s => s.classId === cls.id).length;
                  const atRiskCount = atRiskAll.filter(s => s.classId === cls.id).length;
                  const highCount = atRiskAll.filter(s => s.classId === cls.id && s.riskLevel === 'High').length;
                  return (
                    <div key={cls.id}
                      className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                      onClick={() => navigateTo('class', cls.id)}>
                      <span className="font-black text-gray-800 text-sm truncate group-hover:text-blue-600 transition-colors">{cls.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {atRiskCount > 0 ? (
                          <>
                            <span className="text-xs font-bold text-gray-400">{atRiskCount}/{enrolled} at risk</span>
                            {highCount > 0 && (
                              <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-100 px-2 py-1 rounded-lg">
                                {highCount} high
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                            {enrolled} enrolled · all clear
                          </span>
                        )}
                        <ChevronRight size={13} className="text-gray-300 group-hover:text-blue-400 transition-colors"/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Students needing attention — toggleable */}
            <div className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${atRiskAll.length > 0 ? 'border-red-100' : 'border-gray-100'}`}>
              {/* Header — always visible, click to toggle */}
              <button
                onClick={() => setShowAtRisk(v => !v)}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors hover:bg-gray-50/50 ${showAtRisk && atRiskAll.length > 0 ? 'border-b border-red-50' : ''}`}
              >
                <div className="text-left">
                  <h2 className="font-black text-gray-900 text-sm">Students Needing Attention</h2>
                  <p className="text-gray-400 text-xs font-medium mt-0.5">
                    {atRiskAll.length > 0
                      ? `${atRiskAll.length}/${totalStudents} flagged · ${atRiskAll.filter(s=>s.riskLevel==='High').length} high priority`
                      : 'No students flagged — all clear'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {atRiskAll.length > 0 && (
                    <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500"/>
                    </div>
                  )}
                  <ChevronRight size={16} className={`text-gray-300 transition-transform duration-200 ${showAtRisk ? 'rotate-90' : ''}`}/>
                </div>
              </button>

              {/* Body — only shown when open */}
              {showAtRisk && (
                atRiskAll.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {atRiskAll.slice(0, 5).map(s => (
                      <div key={s.id} className="px-6 py-3 flex items-center gap-3 hover:bg-red-50/20 transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.riskLevel==='High'?'bg-red-500':'bg-orange-400'}`}/>
                        <div className="flex-1 min-w-0">
                          <span className="font-black text-gray-900 text-sm truncate block">{s.name}</span>
                          <span className="text-[11px] text-gray-400 font-medium">{s.subject}</span>
                        </div>
                        <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ${s.slope>0?'text-emerald-600':'text-red-500'}`}>
                          {s.slope>0?<TrendingUp size={11}/>:<TrendingDown size={11}/>}
                          {s.slope>0?'+':''}{s.slope.toFixed(1)}
                        </span>
                        <button onClick={()=>navigateTo('student',s.id)}
                          className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shrink-0">
                          View
                        </button>
                      </div>
                    ))}
                    {atRiskAll.length > 5 && (
                      <div className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        +{atRiskAll.length-5} more — open a classroom to see all
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-center border-t border-gray-50">
                    <p className="text-2xl mb-1.5">✓</p>
                    <p className="font-black text-emerald-700 text-sm">All students on track</p>
                    <p className="text-gray-400 text-xs font-medium mt-1">No risk flags across any of your classes</p>
                  </div>
                )
              )}
            </div>

          </div>
        )}

        <div className="flex justify-between items-center mb-4 mt-6">
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Active Classrooms ({filteredClasses.length})</h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input type="text" placeholder="Search classrooms..." className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 bg-white shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={classes.length === 0} />
          </div>
        </div>

        <div id="demo-classroom-cards" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {classes.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-300">
              <div className="mx-auto w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                <UploadCloud className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No Class Data Found</h3>
              <p className="text-gray-500 font-medium">Upload any Excel or CSV grading sheet above to generate predictive analytics.</p>
            </div>
          ) : filteredClasses.length > 0 ? (
            filteredClasses.map((cls, idx) => {
              const isLocked = !isPremium && idx >= FREE_CLASS_LIMIT;
              const classStudentCount = students.filter(s => s.classId === cls.id).length;
              const classAtRisk = atRiskAll.filter(s => s.classId === cls.id).length;
              return (
                <div key={cls.id}
                  className={`bg-white p-8 rounded-3xl shadow-sm border transition-all cursor-pointer group relative overflow-hidden
                    ${isLocked ? 'border-gray-200 opacity-70 hover:shadow-md' : 'border-gray-100 hover:shadow-lg hover:-translate-y-1'}`}
                  onClick={() => isLocked ? setShowPaywall('classes') : navigateTo('class', cls.id)}>
                  {isLocked && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 rounded-3xl">
                      <div className="text-3xl mb-2">🔒</div>
                      <p className="font-black text-gray-700 text-sm mb-1">Premium Only</p>
                      <button onClick={e => { e.stopPropagation(); setShowPaywall('classes'); }}
                        className="text-xs font-black text-amber-600 uppercase tracking-widest hover:text-amber-800 transition-colors">
                        Upgrade to unlock →
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-black text-gray-800 leading-tight">{cls.name}</h2>
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <BarChart3 size={20} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-gray-500 font-medium flex items-center">
                      <Users size={16} className="mr-2"/> {classStudentCount} Students Enrolled
                    </span>
                    {classAtRisk > 0 ? (
                      <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">
                        {classAtRisk} at risk
                      </span>
                    ) : classStudentCount > 0 ? (
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                        All on track
                      </span>
                    ) : null}
                  </div>
                  <button className="flex items-center text-blue-600 font-bold hover:text-blue-800 uppercase tracking-widest text-xs">
                    View Classroom Analytics <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-dashed border-gray-200 font-medium">
              No subjects found matching "{searchQuery}"
            </div>
          )}
        </div>

      </div>
    );
  };

  const ClassDashboard = () => {
    const activeClass = classes.find(c => c.id === view.id) || classes.find(c => c.id === classData.activeClassId);
    const [studentSearch, setStudentSearch] = useState('');
    const [sortKey, setSortKey] = useState('slope');   // default: sorted by trajectory
    const [sortDir, setSortDir] = useState('desc');    // 'asc' | 'desc'

    if(!activeClass) return <TeacherHome />;

    const handleSort = (key) => {
      if (sortKey === key) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    };

    const riskOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };

    const sortedStudents = [...classData.studentStats].sort((a, b) => {
      let aVal, bVal;
      if (sortKey === 'name')       { aVal = a.name; bVal = b.name; }
      else if (sortKey === 'mean')  { aVal = a.mean; bVal = b.mean; }
      else if (sortKey === 'zScore'){ aVal = a.avgZScore; bVal = b.avgZScore; }
      else if (sortKey === 'slope') { aVal = a.slope; bVal = b.slope; }
      else if (sortKey === 'risk')  { aVal = riskOrder[a.riskLevel] || 0; bVal = riskOrder[b.riskLevel] || 0; }
      else { aVal = a.mean; bVal = b.mean; }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const filteredStudents = sortedStudents.filter(stu =>
      stu.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      String(stu.externalId).toLowerCase().includes(studentSearch.toLowerCase())
    );
    
    return (
      <div id="report-container" className={`space-y-6 w-full ${isGeneratingPDF ? 'bg-white p-8' : ''}`}>
        {!isGeneratingPDF && (
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => navigateTo('home')} className="flex items-center text-gray-500 hover:text-gray-900 font-bold text-sm transition-colors uppercase tracking-widest">
              <ArrowLeft className="h-4 w-4 mr-2" /> Return to Dashboard
            </button>
            <button id="demo-pdf-btn" onClick={() => requirePremium('pdf', () => downloadPDF(`Class_Report_${activeClass?.name.replace(/\s+/g, '_')}`))} className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors text-sm uppercase tracking-wide">
              <Printer size={16} /> {isPremium ? 'Download Class Report (PDF)' : '🔒 Download PDF (Premium)'}
            </button>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="mb-8 border-b-2 border-gray-800 pb-4">
             <div className="flex justify-between items-end">
               <div>
                 <h1 className="text-3xl font-bold uppercase tracking-widest text-gray-900">Class Performance Summary</h1>
                 <p className="text-lg text-gray-600 mt-2">Grade Lens Official Report</p>
               </div>
               <div className="text-right">
                 <p className="font-bold text-xl text-gray-800">{activeClass?.name}</p>
                 <p className="text-gray-600">{new Date().toLocaleDateString()}</p>
               </div>
             </div>
          </div>
        )}

        {!isGeneratingPDF && (
          <div className="flex justify-between items-end mb-8">
            <div>
                <h1 className="text-4xl font-black text-gray-800 leading-tight tracking-tight">{activeClass?.name}</h1>
                <p className="text-gray-400 font-bold text-sm mt-2 uppercase tracking-widest">Collective Performance Overview</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                  type="text" 
                  placeholder="Search Name or ID..." 
                  className="pl-12 pr-4 py-3 border border-gray-200 rounded-2xl text-sm font-medium w-64 outline-none focus:ring-4 focus:ring-blue-50 transition-all bg-white shadow-sm"
                  value={studentSearch} 
                  onChange={e => setStudentSearch(e.target.value)} 
              />
            </div>
          </div>
        )}

        <div id="demo-ai-insights">
        {classData.autoInsights.length > 0 && (
          isPremium ? (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-3xl shadow-sm mb-8">
            <div className="flex items-center text-blue-800 font-black uppercase tracking-widest text-xs mb-4">
              <Lightbulb className="mr-2 h-4 w-4 text-amber-500" /> Automated Algorithmic Insights
            </div>
            <ul className="space-y-3">
              {classData.autoInsights.map((insight, idx) => (
                <li key={idx} className="text-sm text-slate-700 font-medium flex items-start bg-white/80 p-3.5 rounded-xl border border-blue-100/50 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
                  <span className="leading-relaxed">{insight}</span>
                </li>
              ))}
            </ul>
          </div>
          ) : (
          <div className="relative bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-3xl shadow-sm mb-8 overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-[3px] bg-white/60 flex flex-col items-center justify-center z-10 rounded-3xl">
              <div className="text-3xl mb-2">🔒</div>
              <p className="font-black text-gray-800 text-sm mb-1">AI Insights — Premium Feature</p>
              <button onClick={() => setShowPaywall('ai')} className="text-xs font-black text-amber-600 uppercase tracking-widest hover:text-amber-800 transition-colors">
                Upgrade to unlock →
              </button>
            </div>
            {/* Blurred preview */}
            <div className="flex items-center text-blue-800 font-black uppercase tracking-widest text-xs mb-4">
              <Lightbulb className="mr-2 h-4 w-4 text-amber-500" /> Automated Algorithmic Insights
            </div>
            <ul className="space-y-3 blur-sm">
              {classData.autoInsights.map((insight, idx) => (
                <li key={idx} className="text-sm text-slate-700 font-medium flex items-start bg-white/80 p-3.5 rounded-xl border border-blue-100/50 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0" />
                  <span className="leading-relaxed">{insight}</span>
                </li>
              ))}
            </ul>
          </div>
          )
        )}
        </div>

        {/* ── AT-RISK PANEL (Classroom) ── */}
        {(() => {
          const atRisk = classData.studentStats.filter(s => s.riskLevel === 'High' || s.riskLevel === 'Medium')
            .sort((a,b) => (b.riskLevel==='High'?1:0)-(a.riskLevel==='High'?1:0));
          if (!atRisk.length) return null;
          return (
            <div className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden">
              <div className="px-8 py-5 border-b border-red-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 text-sm">Students Needing Attention</h3>
                    <p className="text-gray-400 text-xs font-medium">{atRisk.length} student{atRisk.length!==1?'s':''} flagged in this class</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl uppercase tracking-widest">
                  {atRisk.filter(s=>s.riskLevel==='High').length} High · {atRisk.filter(s=>s.riskLevel==='Medium').length} Medium
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-50">
                {atRisk.map(s => (
                  <div key={s.id} className="px-6 py-4 hover:bg-red-50/20 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-black text-gray-900 text-sm leading-tight">{s.name}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-widest shrink-0 ${s.riskLevel==='High' ? 'text-red-600 bg-red-50 border-red-200' : 'text-orange-600 bg-orange-50 border-orange-200'}`}>
                        {s.riskLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold text-gray-500">Avg: <span className="text-gray-800">{s.mean.toFixed(1)}%</span></span>
                      <span className={`text-xs font-bold flex items-center gap-0.5 ${s.slope > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {s.slope > 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
                        {s.slope > 0 ? '+' : ''}{s.slope.toFixed(1)}
                      </span>
                    </div>
                    <button onClick={() => navigateTo('student', s.id)}
                      className="w-full text-[10px] font-black text-blue-600 bg-blue-50 py-1.5 rounded-lg uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">
                      View Profile →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 w-full h-80">
            <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 tracking-widest">Mean Achievement Progress</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={classData.assessmentStats} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} angle={-35} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="mean" name="Class Average" stroke="#3b82f6" strokeWidth={4} dot={{r: 5}} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 w-full h-80">
            <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 tracking-widest">Score Distribution (Difficulty Variance)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={classData.assessmentStats} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} angle={-35} textAnchor="end" height={60} />
                <YAxis domain={[0, 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="stdDev" name="Std Deviation" stroke="#f59e0b" strokeWidth={4} dot={{r: 5}} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div id="demo-risk-table" className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm mt-8">
          <div className="p-8 border-b border-gray-100 flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-xl font-black text-gray-800 tracking-tight">Student Roster & Risk Prediction</h3>
            {!isGeneratingPDF && (
              <button
                onClick={() => {
                  // Build one personalised message per student and download as CSV
                  const rows = [['Student Name', 'Student ID', 'Message']];
                  classData.studentStats.forEach(s => {
                    const trend = s.slope > 1 ? 'showing great improvement' : s.slope < -1 ? 'showing a declining trend' : 'maintaining a steady performance';
                    const risk = s.riskLevel === 'High' ? ' We would welcome the opportunity to discuss additional support.' : '';
                    const msg = `Dear Parent/Guardian of ${s.name}, I wanted to share a brief update on ${s.name}'s progress in ${activeClass?.name}. Their current average is ${s.mean.toFixed(1)}% and they are ${trend} over recent assessments.${risk} Please don't hesitate to get in touch if you have any questions. Kind regards, ${user.name}.`;
                    rows.push([s.name, s.externalId, `"${msg.replace(/"/g, '""')}"`]);
                  });
                  const csv = rows.map(r => r.join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `Parent_Messages_${activeClass?.name.replace(/\s+/g, '_')}.csv`;
                  link.click();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-sm border border-emerald-100"
              >
                <Download size={14} /> Export Parent Messages (CSV)
              </button>
            )}
          </div>
          
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-[10px] text-gray-400 uppercase font-black tracking-widest border-b border-gray-100">
              <tr>
                {/* Helper to render a sortable column header */}
                {(() => {
                  const SortTh = ({ label, col, align = 'left' }) => {
                    const active = sortKey === col;
                    const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕';
                    return (
                      <th
                        className={`px-8 py-4 cursor-pointer select-none whitespace-nowrap hover:text-blue-500 transition-colors ${active ? 'text-blue-500' : ''} ${align === 'right' ? 'text-right' : ''}`}
                        onClick={() => !isGeneratingPDF && handleSort(col)}
                      >
                        {label}<span className={`ml-1 ${active ? 'text-blue-400' : 'text-gray-300'}`}>{arrow}</span>
                      </th>
                    );
                  };
                  return (
                    <>
                      <SortTh label="Student Identity" col="name" />
                      <SortTh label="Mean Score"       col="mean" />
                      <SortTh label="Relative Standing" col="zScore" />
                      <SortTh label="Trajectory"       col="slope" />
                      <SortTh label="Risk Profile"     col="risk" />
                      {!isGeneratingPDF && <th className="px-8 py-4 text-right">Actions</th>}
                    </>
                  );
                })()}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.length > 0 ? (
                filteredStudents.map(s => (
                  <tr key={s.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="font-black text-gray-900 text-sm">{s.name}</div>
                      <div className="font-mono text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">ID: {s.externalId}</div>
                    </td>
                    <td className="px-8 py-5 text-base font-black text-gray-700">{s.mean.toFixed(1)}%</td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] border font-black uppercase tracking-tighter ${getRelativePerformanceLabel(s.avgZScore).color}`}>
                        {getRelativePerformanceLabel(s.avgZScore).text}
                      </span>
                    </td>
                    <td className="px-8 py-5 font-black text-sm">
                      <div className={`flex items-center ${s.slope > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {!isGeneratingPDF && (s.slope > 0 ? <TrendingUp className="h-4 w-4 mr-1.5" /> : <TrendingDown className="h-4 w-4 mr-1.5" />)}
                        {s.slope > 0 ? '+' : ''}{s.slope.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] border font-black uppercase tracking-tighter ${s.riskColor}`}>{s.riskLevel} Risk</span>
                    </td>
                    {!isGeneratingPDF && (
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => navigateTo('student', s.id)} className="text-blue-600 bg-blue-50 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm">View Profile</button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-500 bg-gray-50/50 font-medium">
                    No students found matching "{studentSearch}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isGeneratingPDF && (
          <div className="mt-12 pt-4 border-t border-gray-300 text-center text-gray-500 text-sm">
            Generated automatically by Grade Lens Predictive Analytics
          </div>
        )}
      </div>
    );
  };

  const StudentDashboard = () => {
    const student = classData.studentStats.find(s => s.id === view.id);
    if (!student) return <TeacherHome />; // Fallback

    const [note, setNote] = useState('');
    const [noteStatus, setNoteStatus] = useState('');  // '' | 'saving' | 'saved' | 'error'
    const [goal, setGoal] = useState('');
    const [goalStatus, setGoalStatus] = useState('');
    const [savedGoal, setSavedGoal] = useState(null);

    // Load existing note + goal from backend on mount
    React.useEffect(() => {
      if (!user?.id) return;
      fetch(`https://edumetrics-api-kro4.onrender.com/api/notes/${user.id}/${encodeURIComponent(student.id)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setNote(data.note || '');
            setGoal(data.goal != null ? String(data.goal) : '');
            setSavedGoal(data.goal != null ? data.goal : null);
          }
        })
        .catch(() => {});
    }, [student.id, user?.id]);

    const saveNote = async () => {
      setNoteStatus('saving');
      try {
        const res = await fetch('https://edumetrics-api-kro4.onrender.com/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, studentId: student.id, note, goal: goal !== '' ? parseFloat(goal) : null })
        });
        setNoteStatus(res.ok ? 'saved' : 'error');
        if (res.ok && goal !== '') setSavedGoal(parseFloat(goal));
        setTimeout(() => setNoteStatus(''), 2500);
      } catch { setNoteStatus('error'); setTimeout(() => setNoteStatus(''), 2500); }
    };

    const chartData = classData.assessments.map((ass, i) => {
      const scoreObj = student.scores.find(s => s.assessmentId === ass.id);
      const score = scoreObj ? scoreObj.score : null;
      let ma = null; if (i >= 2) ma = (student.scoreVals[i] + student.scoreVals[i-1] + student.scoreVals[i-2]) / 3;
      const rawTrend = student.slope * i + student.intercept;
      const trend = Math.min(100, Math.max(0, rawTrend)); 
      const allScoresForTest = scores.filter(s => s.assessmentId === ass.id).map(s => s.score).sort((a,b)=>a-b);
      const rank = allScoresForTest.indexOf(score) + 1;
      const percentile = allScoresForTest.length ? (rank / allScoresForTest.length) * 100 : 0;
      const classAvg = Number(classData.assessmentStats[i]?.mean.toFixed(1) || 0);

      return {
        name: ass.name,
        score,
        ma: ma ? Number(ma.toFixed(1)) : null,
        trend: Number(trend.toFixed(1)),
        percentile: Number(percentile.toFixed(0)),
        classAvg,
        diff: score !== null ? Number((score - classAvg).toFixed(1)) : 0
      };
    });

    const lastScore = student.scoreVals[student.scoreVals.length - 1];
    const rawTrendPrediction = student.slope * student.scoreVals.length + student.intercept;
    const trendPrediction = Math.min(100, Math.max(0, rawTrendPrediction)); 
    const movingAvgPrediction = chartData[chartData.length - 1]?.ma || lastScore;
    const predictedNextScore = Math.min(100, Math.max(0, (rawTrendPrediction + movingAvgPrediction) / 2));

    const latestTestStats = classData.assessmentStats[classData.assessmentStats.length - 1] || { mean: 50, stdDev: 15 };
    const projectedZScore = latestTestStats.stdDev !== 0 ? (predictedNextScore - latestTestStats.mean) / latestTestStats.stdDev : 0;
    const projectedPeerComparison = getRelativePerformanceLabel(projectedZScore);

    const extendedChartData = chartData.map((d, i) => ({
      ...d,
      predictedScore: i === chartData.length - 1 ? d.score : null 
    }));

    extendedChartData.push({
      name: "Next Test (Est.)",
      score: null,
      predictedScore: Number(predictedNextScore.toFixed(1)),
      ma: null,
      trend: Number(trendPrediction.toFixed(1)),
      percentile: null,
      classAvg: null,
      diff: 0
    });

    return (
      <div id="report-container" className={`space-y-6 w-full ${isGeneratingPDF ? 'bg-white p-8' : 'bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl'}`}>
        {!isGeneratingPDF && (
          <div className="flex justify-between items-center mb-8">
            <button onClick={() => navigateTo('class', student.classId)} className="flex items-center text-gray-400 hover:text-gray-900 font-black text-xs uppercase tracking-widest transition-colors">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Roster
            </button>
            <button onClick={() => requirePremium('pdf', () => downloadPDF(`Student_Report_${student.name.replace(/\s+/g, '_')}`))} className="flex items-center gap-2 px-6 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-black uppercase tracking-widest hover:bg-blue-100 transition-colors text-xs shadow-sm">
              <Printer size={16} /> {isPremium ? 'Export Profile PDF' : '🔒 Export PDF (Premium)'}
            </button>
          </div>
        )}
        
        {isGeneratingPDF && (
          <div className="mb-10 border-b-2 border-gray-900 pb-6">
             <div className="flex justify-between items-end">
               <div>
                 <h1 className="text-4xl font-black uppercase tracking-widest text-gray-900">Student Progress Report</h1>
                 <p className="text-xl text-gray-500 font-bold mt-2">Official Parent-Teacher Document</p>
               </div>
               <div className="text-right">
                 <p className="font-black text-2xl text-gray-900">{classes.find(c => c.id === student.classId)?.name}</p>
                 <p className="text-gray-500 font-bold text-lg">{new Date().toLocaleDateString()}</p>
               </div>
             </div>
          </div>
        )}

        <div className={`flex justify-between items-start pb-8 ${isGeneratingPDF ? '' : 'border-b border-gray-100'}`}>
          <div>
            <div className="flex items-center gap-4 mb-2">
               <h1 className="text-5xl font-black text-gray-900 tracking-tight leading-none">{student.name}</h1>
               <span className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-500 font-black uppercase tracking-widest border border-slate-200">ID: {student.externalId}</span>
            </div>
            {!isGeneratingPDF && <p className="text-gray-400 mt-3 font-bold text-base tracking-wide uppercase">Longitudinal Academic Profile • {classes.find(c => c.id === student.classId)?.name}</p>}
          </div>
          <div className={`text-right p-6 rounded-3xl shadow-sm min-w-[200px] ${isGeneratingPDF ? 'bg-white border-2 border-gray-200' : 'bg-purple-50 border border-purple-100'}`}>
            <p className="text-[10px] text-purple-600 uppercase font-black tracking-widest mb-1">Algorithmic Forecast</p>
            <p className="text-5xl font-black mt-1 text-purple-900">
              {predictedNextScore.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className={`p-8 rounded-[2rem] mb-8 ${isGeneratingPDF ? 'bg-white border-2 border-gray-300' : 'bg-slate-50 border border-slate-200/60 shadow-inner'}`}>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center">
            <Lightbulb className="mr-2 h-5 w-5 text-amber-500" /> Educator Summary
          </h3>
          <p className="text-slate-700 leading-relaxed text-base font-medium">
            <strong>{student.name}</strong> is currently holding an overall average of <strong>{student.mean.toFixed(1)}%</strong> in this subject. 
            When assessing their scores against the difficulty of the material (relative to the rest of the cohort), their performance is classified as <strong>{getRelativePerformanceLabel(student.avgZScore).text}</strong>. 
            Historically, their scores are trending <strong>{student.slope > 0 ? 'upwards' : 'downwards'}</strong> at a rate of {Math.abs(student.slope).toFixed(1)} points per test.
          </p>
          <div className="mt-5 pt-5 border-t border-slate-200/80">
            <p className="text-slate-800 font-bold text-sm leading-relaxed">
              <TrendingUp className="inline-block h-5 w-5 text-purple-500 mr-2 align-middle" />
              Trajectory Forecast: 
              <span className="font-medium text-slate-600 ml-1">
                Based on current momentum, the predictive model estimates a score of <strong>{predictedNextScore.toFixed(1)}%</strong> on the next assessment.
                This indicates a future peer-standing of <strong>{projectedPeerComparison.text}</strong>.
                {predictedNextScore < student.mean - 2 ? " This downward projection suggests they may fall further behind peers without targeted intervention." :
                 predictedNextScore > student.mean + 2 ? " This upward projection suggests their understanding is actively improving relative to the class." :
                 " They are on track to maintain their current performance level relative to their peers."}
              </span>
            </p>
          </div>
        </div>

        <div className={`rounded-[2rem] p-8 w-full ${isGeneratingPDF ? '' : 'bg-white border border-gray-100 shadow-sm'}`}>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-8 flex items-center print:mb-4">
            {!isGeneratingPDF && <Activity className="h-5 w-5 mr-2 text-blue-500" />} Longitudinal Performance Tracking
          </h3>
          <div className="h-[400px] w-full print:h-[350px] print:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={extendedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} angle={-35} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px', fontWeight: 'black', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                <Line type="monotone" dataKey="score" name="Actual Score" stroke="#3b82f6" strokeWidth={4} dot={{r: 6}} activeDot={{r: 8}} isAnimationActive={false} />
                <Line type="monotone" dataKey="predictedScore" name="Projected Trajectory" stroke="#a855f7" strokeWidth={4} strokeDasharray="8 8" dot={{r: 6}} activeDot={{r: 8}} isAnimationActive={false} />
                <Line type="monotone" dataKey="classAvg" name="Class Average" stroke="#cbd5e1" strokeWidth={2} dot={false} strokeDasharray="4 4" isAnimationActive={false} />
                <Line type="monotone" dataKey="trend" name="Performance Trendline" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="2 2" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full print:flex print:flex-col print:gap-6 print:break-inside-avoid">
          <div className={`p-8 rounded-[2rem] w-full h-[380px] ${isGeneratingPDF ? 'bg-white border-2 border-gray-200 print:p-6' : 'bg-white border border-gray-100 shadow-sm'}`}>
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center print:mb-4">
              {!isGeneratingPDF && <Target className="h-5 w-5 mr-2 text-blue-500" />} Performance vs. Class Average
            </h3>
            <div className="h-[260px] w-full print:h-[250px] print:block">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} angle={-35} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip cursor={{fill: 'transparent'}} formatter={(value) => [`${value > 0 ? '+' : ''}${value} points`, 'vs Average']} />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={2} />
                  <Bar dataKey="diff" isAnimationActive={false} radius={[6, 6, 6, 6]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.diff >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className={`p-8 rounded-[2rem] w-full h-[380px] ${isGeneratingPDF ? 'bg-white border-2 border-gray-200' : 'bg-white border border-gray-100 shadow-sm'}`}>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Statistical Profile</h3>
            <div className="space-y-4">
              <div className={`flex justify-between items-center py-2 ${isGeneratingPDF ? 'bg-white border-b-2 border-gray-100 rounded-none' : 'border-b border-gray-50'}`}>
                <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Overall Average</span>
                <span className="font-black text-xl text-gray-900">{student.mean.toFixed(1)}%</span>
              </div>
              <div className={`flex justify-between items-center py-2 ${isGeneratingPDF ? 'bg-white border-b-2 border-gray-100 rounded-none' : 'border-b border-gray-50'}`}>
                <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Historical Trend</span>
                <span className={`font-black text-xl ${student.slope > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {student.slope > 0 ? '+' : ''}{student.slope.toFixed(2)} pts / test
                </span>
              </div>
              <div className={`flex justify-between items-center py-2 ${isGeneratingPDF ? 'bg-white border-b-2 border-gray-100 rounded-none' : 'border-b border-gray-50'}`}>
                <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Relative Standing</span>
                <span className={`font-black text-[10px] px-3 py-1.5 rounded-lg border uppercase tracking-widest ${getRelativePerformanceLabel(student.avgZScore).color}`}>
                  {getRelativePerformanceLabel(student.avgZScore).text}
                </span>
              </div>
              <div className={`flex justify-between items-center py-2 ${isGeneratingPDF ? 'bg-white border-b-2 border-gray-100 rounded-none' : 'border-b border-gray-50'}`}>
                <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Projected Result</span>
                <div className="text-right">
                  <div className={`font-black text-xl leading-none ${predictedNextScore >= student.mean ? 'text-green-600' : 'text-orange-500'}`}>
                    {predictedNextScore.toFixed(1)}%
                  </div>
                  <div className={`mt-1.5 text-[9px] uppercase font-black px-2 py-0.5 rounded-md border inline-block tracking-tighter ${projectedPeerComparison.color}`}>
                    {projectedPeerComparison.text} Est.
                  </div>
                </div>
              </div>
              <div className={`flex justify-between items-center py-2 ${isGeneratingPDF ? 'bg-white rounded-none' : ''}`}>
                <span className="text-gray-400 font-black uppercase text-[10px] tracking-widest">Algorithmic Risk</span>
                <span className={`font-black text-[10px] px-3 py-1.5 rounded-lg border uppercase tracking-widest ${student.riskColor}`}>
                  {student.riskLevel} Priority
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── DETAILED CHARTS ── */}
        {!isGeneratingPDF && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-2">

            {/* Percentile Rank Over Time */}
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm h-80">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Percentile Rank Over Time</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} angle={-35} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => [`${v}th percentile`, 'Class Rank']} />
                  <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: 'Median', position: 'right', fontSize: 9, fill: '#94a3b8' }} />
                  <Line type="monotone" dataKey="percentile" name="Percentile" stroke="#8b5cf6" strokeWidth={3} dot={{r: 5}} isAnimationActive={false} />
                  {chartData.some(d => d.ma !== null) && (
                    <Line type="monotone" dataKey="ma" name="3-Test Moving Avg" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Subject Breakdown */}
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm h-80">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Subject Performance Breakdown</h3>
              <div className="space-y-3 overflow-y-auto max-h-52">
                {classes.map(cls => {
                  const stuInClass = students.find(st => st.name === student.name && st.classId === cls.id);
                  if (!stuInClass) return null;
                  const stuScores = scores.filter(sc => sc.studentId === stuInClass.id).map(sc => sc.score);
                  if (!stuScores.length) return null;
                  const avg = stuScores.reduce((a, b) => a + b, 0) / stuScores.length;
                  const barColor = avg >= 75 ? 'bg-emerald-500' : avg >= 55 ? 'bg-blue-500' : 'bg-orange-500';
                  return (
                    <div key={cls.id}>
                      <div className="flex justify-between text-xs font-black text-gray-600 mb-1">
                        <span className="truncate max-w-[160px]">{cls.name}</span>
                        <span>{avg.toFixed(1)}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{width: `${avg}%`}} />
                      </div>
                    </div>
                  );
                })}
                {classes.filter(cls => students.find(st => st.name === student.name && st.classId === cls.id)).length === 0 && (
                  <p className="text-gray-400 text-sm font-medium text-center py-8">Student only enrolled in one subject</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── NOTES & GOALS ── */}
        {!isGeneratingPDF && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-2">

            {/* Teacher Notes */}
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" /> Teacher Notes
              </h3>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add private notes about this student — visible only to you..."
                className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
              />
              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs font-bold transition-all ${
                  noteStatus === 'saved' ? 'text-emerald-500' :
                  noteStatus === 'saving' ? 'text-blue-400 animate-pulse' :
                  noteStatus === 'error' ? 'text-red-500' : 'text-transparent'
                }`}>
                  {noteStatus === 'saved' ? '✓ Saved' : noteStatus === 'saving' ? 'Saving...' : noteStatus === 'error' ? '✕ Error saving' : '.'}
                </span>
                <button onClick={saveNote} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm">
                  Save Note
                </button>
              </div>
            </div>

            {/* Goal Setting */}
            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-500" /> Score Goal
              </h3>
              <div className="flex items-center gap-3 mb-5">
                <input
                  type="number"
                  min="0" max="100"
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-28 px-4 py-3 rounded-xl border border-gray-200 text-lg font-black text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-center"
                />
                <span className="text-2xl font-black text-gray-300">%</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium">Set a target score for this student</p>
                  {savedGoal !== null && (
                    <p className="text-xs font-black mt-1 text-purple-600">Current goal: {savedGoal}%</p>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              {savedGoal !== null && (
                <div className="mb-5">
                  <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    <span>Current avg</span><span>Goal</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${student.mean >= savedGoal ? 'bg-emerald-500' : 'bg-purple-500'}`}
                      style={{ width: `${Math.min(100, (student.mean / savedGoal) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs font-black mt-1.5">
                    <span className="text-gray-600">{student.mean.toFixed(1)}%</span>
                    <span className={student.mean >= savedGoal ? 'text-emerald-600' : 'text-purple-600'}>
                      {student.mean >= savedGoal ? '✓ Goal reached!' : `${(savedGoal - student.mean).toFixed(1)}% to go`}
                    </span>
                    <span className="text-gray-400">{savedGoal}%</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold transition-all ${
                  goalStatus === 'saved' ? 'text-emerald-500' :
                  goalStatus === 'saving' ? 'text-blue-400 animate-pulse' :
                  goalStatus === 'error' ? 'text-red-500' : 'text-transparent'
                }`}>
                  {goalStatus === 'saved' ? '✓ Saved' : goalStatus === 'saving' ? 'Saving...' : goalStatus === 'error' ? '✕ Error' : '.'}
                </span>
                <button onClick={saveNote} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm">
                  Save Goal
                </button>
              </div>
            </div>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="mt-20 pt-10 border-t-2 border-gray-900">
             <div className="flex justify-between items-end">
               <p className="text-gray-500 font-bold text-sm">Powered by Grade Lens Analytics Engine</p>
               <div className="text-center">
                 <div className="w-72 border-b-2 border-gray-900 mb-2"></div>
                 <p className="text-gray-900 font-black uppercase tracking-widest text-sm">Official Educator Signature</p>
               </div>
             </div>
          </div>
        )}
      </div>
    );
  };

  // --- TOP LEVEL RENDER LOGIC ---
  if (!user) {
    if (showPricingPage) return <><PricingPage /><PaywallModal /></>;
    if (authView === 'landing') return <LandingPage />;
    if (authView === 'signup') return <SignupPage />;
    if (authView === 'login') return <LoginPage />;
  }

  if (showPricingPage) return <><PricingPage /><PaywallModal /></>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 print:p-0 relative">
      <DarkModeStyles />
      <div className="max-w-7xl mx-auto">
        {!isGeneratingPDF && (
          <header className="mb-10 flex items-center justify-between pb-6 border-b border-gray-200">
            <div className="flex items-center text-blue-600">
              <Activity className="h-10 w-10 mr-4" strokeWidth={3} />
              <span className="text-3xl font-black tracking-tight uppercase italic">Grade<span className="text-gray-400 font-light not-italic">Lens</span></span>
            </div>
            <div className="flex items-center space-x-6">
              {!isPremium && (
                <button onClick={() => setShowPricingPage(true)}
                  className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-xs uppercase tracking-widest shadow-sm hover:from-amber-500 hover:to-orange-600 transition-all">
                  ✦ Upgrade
                </button>
              )}
              {isPremium && (
                <div className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-xs uppercase tracking-widest">
                  ✦ Premium
                </div>
              )}
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-gray-900 leading-tight">{user.name}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{user.role}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-black shadow-sm">
                {user.name.charAt(0)}
              </div>
              <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button onClick={() => setShowLogoutConfirm(true)} className="text-gray-400 hover:text-red-500 transition-colors" title="Sign Out">
                 <LogOut size={24} />
              </button>
            </div>
          </header>
        )}
        
        <main>
          <TourOverlay />
          <PaywallModal />
          <EmailModal />
          {showLogoutConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-gray-100 text-center">
                <div className="mx-auto w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                   <LogOut className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">Sign Out?</h3>
                <p className="text-gray-500 font-medium mb-8">Are you sure you want to sign out of your educator account? Your current session data will be cleared.</p>
                <div className="flex flex-col gap-3">
                  <button onClick={handleLogout} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm">
                    Yes, Sign Out
                  </button>
                  <button onClick={() => setShowLogoutConfirm(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSettings ? <SettingsPage /> : (
            <>
              {view.type === 'home' && <TeacherHome />}
              {view.type === 'class' && (classes.length > 0 ? <ClassDashboard /> : <TeacherHome />)}
              {view.type === 'student' && (classes.length > 0 ? <StudentDashboard /> : <TeacherHome />)}
            </>
          )}
        </main>
      </div>
    </div>
  );
}