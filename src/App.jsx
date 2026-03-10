import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Users, TrendingUp, TrendingDown, AlertTriangle, BookOpen, ChevronRight, ArrowLeft, Activity, Target, UploadCloud, FileSpreadsheet, Download, Printer, Lightbulb, ShieldAlert, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

  // Maps that convert specific grading systems to a 100-point equivalent scale for statistical modeling
  const formatMaps = {
    'us_letter': { 'a+': 100, 'a': 95, 'a-': 90, 'b+': 85, 'b': 80, 'b-': 75, 'c+': 70, 'c': 65, 'c-': 60, 'd+': 55, 'd': 50, 'd-': 45, 'f': 0, 'e': 40 },
    'uk_gcse': { '9': 100, '8': 89, '7': 78, '6': 67, '5': 56, '4': 44, '3': 33, '2': 22, '1': 11, 'u': 0 },
    'uk_alevel': { 'a*': 100, 'a': 85, 'b': 70, 'c': 55, 'd': 40, 'e': 25, 'u': 0 },
    'ib': { '7': 100, '6': 85, '5': 70, '4': 55, '3': 40, '2': 25, '1': 10 },
    'uni_uk': { '1st': 85, 'first': 85, '2:1': 65, '2.1': 65, '2:2': 55, '2.2': 55, '3rd': 45, 'third': 45, 'fail': 0 }
  };

  if (format !== 'percentage' && format !== 'auto' && formatMaps[format]) {
    if (formatMaps[format][cleanVal] !== undefined) {
      return formatMaps[format][cleanVal];
    }
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

const exportPDF = async () => {
  const element = document.getElementById('dashboard-content'); // The part you want to save
  const canvas = await html2canvas(element, { scale: 2 }); // Scale 2 makes it look sharp
  const imgData = canvas.toDataURL('image/png');
  
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save("Teacher_Dashboard_Report.pdf");
};

export default function App() {
  const [view, setView] = useState({ type: 'home', id: null });
  const [gradeFormat, setGradeFormat] = useState('auto');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [scores, setScores] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    const xlsxScript = document.createElement('script');
    xlsxScript.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    xlsxScript.async = true;
    document.body.appendChild(xlsxScript);

    const pdfScript = document.createElement('script');
    pdfScript.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    pdfScript.async = true;
    document.body.appendChild(pdfScript);

    return () => {
      if (document.body.contains(xlsxScript)) document.body.removeChild(xlsxScript);
      if (document.body.contains(pdfScript)) document.body.removeChild(pdfScript);
    };
  }, []);

  const processCSV = (csvText, activeFormat = gradeFormat) => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) { alert("The file appears to be empty or invalid."); return; }

    const rawHeaders = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    const aliases = {
      student: ['student', 'name', 'pupil', 'learner', 'first'],
      subject: ['subject', 'class', 'course', 'module', 'program', 'branch'],
      topic: ['topic', 'unit', 'chapter', 'concept'],
      date: ['date', 'time', 'timestamp', 'day', 'week', 'semester', 'term'],
      score: ['score', 'grade', 'mark', 'result', 'percentage', 'points', 'pct']
    };

    const headerMap = { student: null, subject: null, topic: null, date: null, score: null };

    rawHeaders.forEach(header => {
      const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
      for (const [key, keywords] of Object.entries(aliases)) {
        if (!headerMap[key] && keywords.some(kw => normalized.includes(kw))) {
          headerMap[key] = header;
          break;
        }
      }
    });

    if (!headerMap.student || !headerMap.score) {
      alert("Could not automatically detect 'Student Name' or 'Score' columns."); return;
    }

    const newClassesMap = {};
    const newStudentsMap = {};
    const newAssessmentsMap = {};
    const newScores = [];
    let fallbackTestCounter = 1;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
      const row = {};
      rawHeaders.forEach((header, index) => { row[header] = values[index] !== undefined ? values[index] : ''; });

      const rawStudent = row[headerMap.student];
      const rawScore = parseGradeToNumber(row[headerMap.score], activeFormat);
      if (!rawStudent || isNaN(rawScore)) continue;

      const rawSubject = headerMap.subject && row[headerMap.subject] ? row[headerMap.subject] : 'General Class';
      let rawDate = headerMap.date && row[headerMap.date] ? row[headerMap.date] : `Test ${fallbackTestCounter++}`;
      if (!isNaN(rawDate)) rawDate = `Semester ${rawDate}`;

      const rawTopic = headerMap.topic && row[headerMap.topic] ? row[headerMap.topic] : '';
      const assessmentName = rawTopic ? `${rawDate} (${rawTopic})` : (rawDate.includes('Semester') || rawDate.includes('Test') ? rawDate : `Test: ${rawDate}`);

      const subjectId = rawSubject.toLowerCase().replace(/\s+/g, '-');
      const studentId = `${subjectId}-${rawStudent.toLowerCase().replace(/\s+/g, '-')}`;
      const assessmentId = `${subjectId}-${assessmentName.toLowerCase().replace(/\s+/g, '-')}`;

      if (!newClassesMap[subjectId]) newClassesMap[subjectId] = { id: subjectId, name: rawSubject };
      if (!newStudentsMap[studentId]) newStudentsMap[studentId] = { id: studentId, classId: subjectId, name: rawStudent };
      if (!newAssessmentsMap[assessmentId]) newAssessmentsMap[assessmentId] = { id: assessmentId, classId: subjectId, name: assessmentName, date: rawDate, topic: rawTopic };

      newScores.push({ studentId, assessmentId, score: rawScore });
    }

    if (Object.keys(newClassesMap).length > 0) {
      setClasses(Object.values(newClassesMap));
      setStudents(Object.values(newStudentsMap));
      setAssessments(Object.values(newAssessmentsMap).sort((a, b) => a.date.localeCompare(b.date)));
      setScores(newScores);
      setView({ type: 'home', id: null });
    } else {
      alert("No valid rows of data found. Please check your file format.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        if (!window.XLSX) { alert("Parser loading, please try again."); setIsLoading(false); return; }
        const workbook = window.XLSX.read(bstr, { type: 'binary' });
        processCSV(window.XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]));
      } else {
        processCSV(bstr);
      }
      setIsLoading(false);
    };
    file.name.endsWith('.csv') ? reader.readAsText(file) : reader.readAsBinaryString(file);
  };

  const loadSampleData = () => {
    setIsLoading(true);

    let seed = 12345;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const firstNames = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Oliver", "Isabella", "Elijah", "Sophia", "James", "Charlotte", "William", "Amelia", "Benjamin", "Mia", "Lucas", "Harper", "Henry", "Evelyn", "Alexander"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"];

    const uniqueStudents = [];
    for(let i = 0; i < firstNames.length; i++) {
      for(let j = 0; j < 5; j++) {
         uniqueStudents.push(`${firstNames[i]} ${lastNames[(i + j) % lastNames.length]}`);
      }
    }

    const subjects = [
      { name: "AP Calculus AB", topics: ["Limits", "Derivatives", "Integrals", "Applications", "Differential Eq"] },
      { name: "Physics 101", topics: ["Kinematics", "Dynamics", "Energy", "Momentum", "Rotational Motion"] },
      { name: "World History", topics: ["Ancient Rome", "Middle Ages", "Renaissance", "Industrial Rev", "Modern Era"] },
      { name: "Biology", topics: ["Cells", "Genetics", "Evolution", "Ecology", "Human Body"] },
      { name: "Chemistry", topics: ["Atomic Structure", "Bonds", "Reactions", "Stoichiometry", "Acids & Bases"] }
    ];

    const dates = ["2025-01-15", "2025-02-15", "2025-03-15", "2025-04-15", "2025-05-15"];
    let csv = "Student,Subject,Date,Topic,Score\n";

    subjects.forEach(sub => {
      const enrolled = [...uniqueStudents].sort(() => 0.5 - random()).slice(0, 30);

      enrolled.forEach(student => {
        let baseScore = 60 + random() * 30;
        let trend = (random() - 0.5) * 6;

        if (student.includes("Smith")) {
           trend = -6 - (random() * 4);
           baseScore = 95;
        }

        sub.topics.forEach((topic, idx) => {
           let score = baseScore + (trend * idx) + (random() * 10 - 5);
           if (sub.name === "AP Calculus AB" && topic === "Integrals") score -= 25;
           if (sub.name === "Physics 101" && topic === "Energy") score += (random() > 0.5 ? 20 : -20);
           if (sub.name === "World History" && topic === "Renaissance") score += 18;

           score = Math.max(0, Math.min(100, score));
           csv += `${student},${sub.name},${dates[idx]},${topic},${Math.round(score)}\n`;
        });
      });
    });

    setTimeout(() => {
      processCSV(csv, 'percentage');
      setIsLoading(false);
    }, 1200);
  };

  const downloadCSV = () => {
    let csv = "Student,Subject,Date,Score\n";
    scores.forEach(s => {
      const student = students.find(st => st.id === s.studentId);
      const assessment = assessments.find(a => a.id === s.assessmentId);
      if (student && assessment) {
        const subject = classes.find(c => c.id === assessment.classId);
        csv += `${student.name},${subject ? subject.name : 'Unknown'},${assessment.date},${s.score}\n`;
      }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "student_analytics_export.csv";
    link.click();
  };

  const downloadPDF = (fileName) => {
    if (!window.html2pdf) {
      alert("PDF rendering engine is still loading. Please try again in a few seconds.");
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
        alert("Failed to generate PDF.");
      });
    }, 300);
  };

  const activeClassId = view.type === 'class' ? view.id : (view.type === 'student' ? students.find(s=>s.id===view.id)?.classId : classes[0]?.id);

  const classData = useMemo(() => {
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

    return { assessmentStats, studentStats, assessments: classAssessments, autoInsights };
  }, [classes, students, assessments, scores, activeClassId]);

  const TeacherHome = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const filteredClasses = classes.filter(cls => cls.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h1 className="text-3xl font-bold text-gray-800">Teacher Dashboard</h1>
          {isLoading && <span className="text-blue-600 font-medium animate-pulse">Processing data...</span>}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
            <FileSpreadsheet className="mr-2 text-blue-500 h-5 w-5" /> Data Management
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Grade Format</label>
              <select value={gradeFormat} onChange={(e) => setGradeFormat(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto h-[38px]">
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
              <label className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Upload Data</label>
              <div className="relative">
                <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" id="file-upload" />
                <label htmlFor="file-upload" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors cursor-pointer text-sm h-[38px]">
                  <UploadCloud size={18} /> Choose Excel / CSV
                </label>
              </div>
            </div>

            <div className="flex flex-col ml-auto">
              <button onClick={loadSampleData} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm h-[38px]">
                Load Sample Data
              </button>
            </div>
            <div className="flex flex-col">
              <button onClick={downloadCSV} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition-colors text-sm h-[38px]">
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4 mt-8">
          <h2 className="text-xl font-bold text-gray-800">Your Classes ({filteredClasses.length})</h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input type="text" placeholder="Search subjects..." className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={classes.length === 0} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classes.length === 0 ? (
            <div className="col-span-full py-16 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
              <BookOpen className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700">No Data Loaded</h3>
              <p className="mt-2 text-sm">Upload an Excel/CSV file or click "Load Sample Data" to begin.</p>
            </div>
          ) : filteredClasses.length > 0 ? (
            filteredClasses.map(cls => {
              const classStudentCount = students.filter(s => s.classId === cls.id).length;
              return (
                <div key={cls.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView({ type: 'class', id: cls.id })}>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-700">{cls.name}</h2>
                    <BookOpen className="text-blue-500" />
                  </div>
                  <p className="text-gray-500 mb-4">{classStudentCount} Students Enrolled</p>
                  <button className="flex items-center text-blue-600 font-medium hover:text-blue-800">
                    View Class Analytics <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
              No subjects found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    );
  };

  const ClassDashboard = () => {
    const activeClass = classes.find(c => c.id === view.id);
    const [studentSearch, setStudentSearch] = useState('');
    const filteredStudents = classData.studentStats.filter(stu => stu.name.toLowerCase().includes(studentSearch.toLowerCase()));

    return (
      <div id="report-container" className={`space-y-6 w-full ${isGeneratingPDF ? 'bg-white p-8' : ''}`}>
        {!isGeneratingPDF && (
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => setView({ type: 'home', id: null })} className="flex items-center text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Home
            </button>
            <button onClick={() => downloadPDF(`Class_Report_${activeClass?.name.replace(/\s+/g, '_')}`)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors text-sm">
              <Printer size={16} /> Download Class Report (PDF)
            </button>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="mb-8 border-b-2 border-gray-800 pb-4">
             <div className="flex justify-between items-end">
               <div>
                 <h1 className="text-3xl font-bold uppercase tracking-widest text-gray-900">Class Performance Summary</h1>
                 <p className="text-lg text-gray-600 mt-2">EduMetrics Pro Official Report</p>
               </div>
               <div className="text-right">
                 <p className="font-bold text-xl text-gray-800">{activeClass?.name}</p>
                 <p className="text-gray-600">{new Date().toLocaleDateString()}</p>
               </div>
             </div>
          </div>
        )}

        {!isGeneratingPDF && <h1 className="text-3xl font-bold text-gray-800">{activeClass?.name} Analytics</h1>}

        {classData.autoInsights.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl shadow-sm mb-6">
            <div className="flex items-center text-blue-800 font-semibold mb-3">
              <Lightbulb className="mr-2 h-5 w-5 text-blue-500" /> Automated Class Insights
            </div>
            <ul className="space-y-2">
              {classData.autoInsights.map((insight, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex items-start bg-white/60 p-2.5 rounded-lg border border-blue-50/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 mr-2.5 flex-shrink-0"></span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Class Average Over Time</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={classData.assessmentStats} margin={{ bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{fontSize: 11}} angle={-35} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px' }} />
                  <Line type="monotone" dataKey="mean" name="Class Average" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Score Spread (Difficulty Indicator)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={classData.assessmentStats} margin={{ bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{fontSize: 11}} angle={-35} textAnchor="end" height={60} />
                  <YAxis domain={[0, 'auto']} />
                  <Tooltip />
                  <Line type="monotone" dataKey="stdDev" name="Std Deviation" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Student Roster & Risk Prediction</h3>
            {!isGeneratingPDF && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input type="text" placeholder="Search students..." className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 text-gray-600 text-sm">
                  <th className="pb-3 pl-2">Student</th>
                  <th className="pb-3">Average</th>
                  <th className="pb-3">Relative Performance</th>
                  <th className="pb-3">Trend</th>
                  <th className="pb-3">Risk Level</th>
                  {!isGeneratingPDF && <th className="pb-3">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((stu) => (
                    <tr key={stu.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 pl-2 font-medium text-gray-800">{stu.name}</td>
                      <td className="py-3 text-gray-600">{stu.mean.toFixed(1)}%</td>
                      <td className="py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs border ${getRelativePerformanceLabel(stu.avgZScore).color}`}>
                          {getRelativePerformanceLabel(stu.avgZScore).text}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className={`flex items-center ${stu.slope > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {!isGeneratingPDF && (stu.slope > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />)}
                          {stu.slope > 0 ? '+' : ''}{stu.slope.toFixed(1)}
                        </div>
                      </td>
                      <td className="py-3">
                         <span className={`px-2.5 py-1 rounded-md text-xs border ${stu.riskColor} border-current`}>
                           {stu.riskLevel} Risk
                         </span>
                      </td>
                      {!isGeneratingPDF && (
                        <td className="py-3">
                          <button onClick={() => setView({ type: 'student', id: stu.id })} className="text-blue-500 hover:text-blue-700 text-sm font-medium">
                            View Report
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500 bg-gray-50/50">
                      No students found matching "{studentSearch}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isGeneratingPDF && (
          <div className="mt-12 pt-4 border-t border-gray-300 text-center text-gray-500 text-sm">
            Generated automatically by EduMetrics Pro Analytics Engine
          </div>
        )}
      </div>
    );
  };

  const StudentDashboard = () => {
    const student = classData.studentStats.find(s => s.id === view.id);
    if (!student) return null;

    const chartData = classData.assessments.map((ass, i) => {
      const scoreObj = student.scores.find(s => s.assessmentId === ass.id);
      const score = scoreObj ? scoreObj.score : null;
      let ma = null; if (i >= 2) ma = (student.scoreVals[i] + student.scoreVals[i-1] + student.scoreVals[i-2]) / 3;
      const trend = student.slope * i + student.intercept;
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
    const trendPrediction = student.slope * classData.assessments.length + student.intercept;
    const movingAvgPrediction = chartData[chartData.length - 1]?.ma || lastScore;
    const predictedNextScore = Math.min(100, Math.max(0, (trendPrediction + movingAvgPrediction) / 2));

    // Calculate Projected Z-Score to compare with peers in the future
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
      <div id="report-container" className={`space-y-6 w-full ${isGeneratingPDF ? 'bg-white p-8' : 'bg-white p-8 rounded-xl'}`}>
        {!isGeneratingPDF && (
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => setView({ type: 'class', id: student.classId })} className="flex items-center text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Class
            </button>
            <button onClick={() => downloadPDF(`Student_Report_${student.name.replace(/\s+/g, '_')}`)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors text-sm">
              <Printer size={16} /> Download Report (PDF)
            </button>
          </div>
        )}

        {isGeneratingPDF && (
          <div className="mb-8 border-b-2 border-gray-800 pb-4">
             <div className="flex justify-between items-end">
               <div>
                 <h1 className="text-3xl font-bold uppercase tracking-widest text-gray-900">Student Progress Report</h1>
                 <p className="text-lg text-gray-600 mt-2">Parent-Teacher Conference</p>
               </div>
               <div className="text-right">
                 <p className="font-bold text-xl text-gray-800">{classes.find(c => c.id === student.classId)?.name}</p>
                 <p className="text-gray-600">{new Date().toLocaleDateString()}</p>
               </div>
             </div>
          </div>
        )}

        <div className={`flex justify-between items-start pb-6 ${isGeneratingPDF ? '' : 'border-b border-gray-100'}`}>
          <div>
            <h1 className="text-4xl font-bold text-gray-800">{student.name}</h1>
            {!isGeneratingPDF && <p className="text-gray-500 mt-1">Official Progress Report • {classes.find(c => c.id === student.classId)?.name}</p>}
          </div>
          <div className={`text-right p-4 rounded-xl ${isGeneratingPDF ? 'bg-white border border-gray-200' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Model Prediction (Next Test)</p>
            <p className={`text-3xl font-black mt-1 ${predictedNextScore >= student.mean ? 'text-green-600' : 'text-orange-500'}`}>
              {predictedNextScore.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className={`p-6 rounded-xl mb-6 ${isGeneratingPDF ? 'bg-white border-gray-300 border' : 'bg-slate-50 border-slate-100 border'}`}>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center">
            <Lightbulb className="mr-2 h-4 w-4 text-amber-500" /> Educator Summary
          </h3>
          <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
            <strong>{student.name}</strong> is currently holding an overall average of <strong>{student.mean.toFixed(1)}%</strong> in this subject.
            When assessing their scores against the difficulty of the material (relative to the rest of the cohort), their performance is classified as <strong>{getRelativePerformanceLabel(student.avgZScore).text}</strong>.
            Historically, their scores are trending <strong>{student.slope > 0 ? 'upwards' : 'downwards'}</strong> at a rate of {Math.abs(student.slope).toFixed(1)} points per test.
          </p>
          <div className="mt-3 pt-3 border-t border-slate-200/60">
            <p className="text-slate-800 font-medium text-sm">
              <TrendingUp className="inline-block h-4 w-4 text-purple-500 mr-1 mb-0.5" />
              Trajectory Forecast:
              <span className="font-normal text-slate-600 ml-1">
                Based on current momentum, the predictive model estimates a score of <strong>{predictedNextScore.toFixed(1)}%</strong> on the next assessment.
                This indicates a future peer-standing of <strong>{projectedPeerComparison.text}</strong>.
                {predictedNextScore < student.mean - 2 ? " This downward projection suggests they may fall further behind peers without targeted intervention." :
                 predictedNextScore > student.mean + 2 ? " This upward projection suggests their understanding is actively improving relative to the class." :
                 " They are on track to maintain their current performance level relative to their peers."}
              </span>
            </p>
          </div>
        </div>

        <div className={`rounded-xl p-4 w-full ${isGeneratingPDF ? '' : 'bg-white border border-gray-100'}`}>
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center print:mb-2">
            {!isGeneratingPDF && <Activity className="h-5 w-5 mr-2 text-blue-500" />} Longitudinal Performance Tracking
          </h3>
          <div className="h-80 w-full print:h-[300px] print:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={extendedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" tick={{fontSize: 11}} angle={-35} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px' }} />
                <Line type="monotone" dataKey="score" name="Actual Score" stroke="#3b82f6" strokeWidth={3} dot={{r: 6}} activeDot={{r: 8}} isAnimationActive={false} />
                <Line type="monotone" dataKey="predictedScore" name="Projected Trajectory" stroke="#a855f7" strokeWidth={3} strokeDasharray="6 6" dot={{r: 6}} activeDot={{r: 8}} isAnimationActive={false} />
                <Line type="monotone" dataKey="classAvg" name="Class Average" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" isAnimationActive={false} />
                <Line type="monotone" dataKey="trend" name="Performance Trendline" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="3 3" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full print:flex print:flex-col print:gap-4 print:break-inside-avoid">
          <div className={`p-6 rounded-xl w-full ${isGeneratingPDF ? 'bg-white border-gray-300 border print:p-4' : 'bg-white border-gray-100 border'}`}>
             <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center print:mb-2">
              {!isGeneratingPDF && <Target className="h-5 w-5 mr-2 text-blue-500" />} Performance vs. Class Average
            </h3>
            <div className="h-64 w-full print:h-[250px] print:block">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{fontSize: 11}} angle={-35} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip
                    cursor={{fill: 'transparent'}}
                    formatter={(value) => [`${value > 0 ? '+' : ''}${value} points`, 'vs Average']}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={2} />
                  <Bar dataKey="diff" isAnimationActive={false} radius={[4, 4, 4, 4]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.diff >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-gray-500 mt-2">
              Green bars pointing up show tests where the student scored above the class average. Red bars show below-average scores.
            </p>
          </div>

          <div className={`p-6 rounded-xl w-full ${isGeneratingPDF ? 'bg-white border-gray-300 border' : 'bg-white border-gray-100 border'}`}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Statistical Profile</h3>
            <div className="space-y-3">
              <div className={`flex justify-between items-center p-3 ${isGeneratingPDF ? 'bg-white border-b rounded-none' : 'bg-slate-50 rounded-lg'}`}>
                <span className="text-slate-600 font-medium">Overall Average</span>
                <span className="font-bold text-lg text-slate-800">{student.mean.toFixed(1)}%</span>
              </div>
              <div className={`flex justify-between items-center p-3 ${isGeneratingPDF ? 'bg-white border-b rounded-none' : 'bg-slate-50 rounded-lg'}`}>
                <span className="text-slate-600 font-medium">Historical Trend</span>
                <span className={`font-bold text-lg ${student.slope > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {student.slope > 0 ? '+' : ''}{student.slope.toFixed(2)} pts / test
                </span>
              </div>
              <div className={`flex justify-between items-center p-3 ${isGeneratingPDF ? 'bg-white border-b rounded-none' : 'bg-slate-50 rounded-lg'}`}>
                <span className="text-slate-600 font-medium flex flex-col">
                  Relative Performance
                  <span className="text-xs text-slate-400 font-normal">Compared to peers</span>
                </span>
                <span className={`font-bold text-sm px-2.5 py-1 rounded-md border ${getRelativePerformanceLabel(student.avgZScore).color}`}>
                  {getRelativePerformanceLabel(student.avgZScore).text}
                </span>
              </div>
              <div className={`flex justify-between items-center p-3 ${isGeneratingPDF ? 'bg-white border-b rounded-none' : 'bg-slate-50 rounded-lg'}`}>
                <span className="text-slate-600 font-medium flex flex-col">
                  Projected Performance
                  <span className="text-xs text-slate-400 font-normal">Est. Peer Comparison included</span>
                </span>
                <div className="text-right">
                  <div className={`font-bold text-lg leading-none ${predictedNextScore >= student.mean ? 'text-green-600' : 'text-orange-500'}`}>
                    {predictedNextScore.toFixed(1)}%
                  </div>
                  <div className={`mt-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border inline-block ${projectedPeerComparison.color}`}>
                    {projectedPeerComparison.text}
                  </div>
                </div>
              </div>
              <div className={`flex justify-between items-center p-3 ${isGeneratingPDF ? 'bg-white rounded-none' : 'bg-slate-50 rounded-lg'}`}>
                <span className="text-slate-600 font-medium">Algorithmic Risk Level</span>
                <span className={`font-bold text-sm px-2 py-1 rounded ${student.riskColor}`}>
                  {student.riskLevel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isGeneratingPDF && (
          <div className="mt-16 pt-8 border-t border-gray-800">
             <div className="flex justify-between items-end">
               <p className="text-gray-500 text-sm">Generated by EduMetrics Pro Analytics Engine</p>
               <div className="text-center">
                 <div className="w-64 border-b border-gray-800 mb-2"></div>
                 <p className="text-gray-800 font-bold uppercase tracking-wider text-sm">Teacher Signature</p>
               </div>
             </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 relative">
      <div className="max-w-6xl mx-auto">
        {!isGeneratingPDF && (
          <header className="mb-8 flex items-center justify-between pb-4 border-b border-gray-200">
            <div className="flex items-center text-blue-600">
              <Activity className="h-8 w-8 mr-3" />
              <span className="text-2xl font-black tracking-tight">EduMetrics<span className="text-gray-400 font-light">Pro</span></span>
            </div>
            <div className="flex space-x-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                T
              </div>
            </div>
          </header>
        )}

        <main>
          {view.type === 'home' && <TeacherHome />}
          {view.type === 'class' && <ClassDashboard />}
          {view.type === 'student' && <StudentDashboard />}
        </main>
      </div>
    </div>
  );
}