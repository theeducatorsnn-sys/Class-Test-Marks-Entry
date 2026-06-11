
import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Selector } from './components/Selector';
import { MarksGrid } from './components/MarksGrid';
import { Dashboard } from './components/Dashboard';
import { ClassLevel, Student, Subject, SUBJECTS, ViewMode } from './types';
import { getTableName, getColumnName, supabase } from './services/supabase';
import { copyToClipboardSmart, exportToExcel, toTitleCase } from './utils/formatters';
import { Copy, Download, CheckCircle2, AlertTriangle, RefreshCw, FileCode, Database } from 'lucide-react';
import { INITIAL_ROSTERS } from './data/class_rosters';

const App: React.FC = () => {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('entry');
  const [selectedClass, setSelectedClass] = useState<ClassLevel>('3');
  const [selectedSubject, setSelectedSubject] = useState<Subject>(SUBJECTS[0]);
  const [selectedTest, setSelectedTest] = useState<number>(1);
  const [maxMarks, setMaxMarks] = useState<number>(10);
  
  // Initialize date with today, but we will try to load from local storage immediately
  const [testDate, setTestDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTableMissing, setIsTableMissing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isPromoting, setIsPromoting] = useState<boolean>(false);

  // Derived
  const tableName = getTableName(selectedClass);
  const columnKey = getColumnName(selectedSubject, selectedTest);

  // --- Automatic Date Persistence Logic ---
  useEffect(() => {
    const storageKey = `date_${selectedClass}_${selectedSubject}_${selectedTest}`;
    const savedDate = localStorage.getItem(storageKey);
    if (savedDate) {
      setTestDate(savedDate);
    } else {
      setTestDate(new Date().toISOString().split('T')[0]);
    }
  }, [selectedClass, selectedSubject, selectedTest]);

  const handleDateChange = (newDate: string) => {
    setTestDate(newDate);
    const storageKey = `date_${selectedClass}_${selectedSubject}_${selectedTest}`;
    localStorage.setItem(storageKey, newDate);
  };
  // ----------------------------------------

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setIsTableMissing(false);
    setFeedback(null);
    
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (error) throw error;

      const rawData = (data as unknown as Student[]) || [];

      // Client-side natural sort for roll numbers
      const sortedData = rawData.sort((a, b) => {
        const rollA = a.roll_no != null ? String(a.roll_no).trim() : '';
        const rollB = b.roll_no != null ? String(b.roll_no).trim() : '';
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setStudents(sortedData);
    } catch (err: any) {
      console.error("Error fetching data:", err);

      const isMissingTable = err?.code === '42P01' || err?.code === 'PGRST205';

      if (isMissingTable) {
         setStudents([]);
         setIsTableMissing(true);
      } else {
         let displayMessage = 'Failed to load class data.';
         
         // Handle common fetch/network errors specifically
         const errString = JSON.stringify(err);
         if (
           err?.message?.includes('Failed to fetch') || 
           err?.details?.includes('Failed to fetch') ||
           errString.includes('TypeError: Failed to fetch')
          ) {
            displayMessage = "Network Error: Please check your internet connection.";
         } else if (err?.message) {
            displayMessage = err.message;
         }
         
         setFeedback({ type: 'error', msg: displayMessage });
      }
    } finally {
      setLoading(false);
    }
  }, [tableName, selectedClass]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize Data
  const handleInitializeClass = async () => {
    if (isTableMissing) {
      setFeedback({ type: 'error', msg: 'Table missing. Please copy the schema and run it in Supabase.' });
      return;
    }
    
    setLoading(true);
    
    try {
      const roster = INITIAL_ROSTERS[selectedClass];
      if (!roster) throw new Error("No roster data available for this class.");

      const rows = roster.map((name, index) => ({
        roll_no: (index + 1).toString(),
        name: toTitleCase(name)
      }));

      const { error } = await supabase
        .from(tableName)
        .insert(rows);

      if (error) throw error;
      
      setFeedback({ type: 'success', msg: `Initialized Class ${selectedClass} with ${rows.length} students.` });
      await fetchData(); 
    } catch (err: any) {
      console.error("Initialization process failed:", err);
      let msg = err.message || 'Failed to initialize data.';
      if (err?.code === '42P01' || err?.code === 'PGRST205') {
        msg = `Table '${tableName}' does not exist.`;
        setIsTableMissing(true);
      }
      setFeedback({ type: 'error', msg: msg });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleBulkPromotion = async () => {
    // Detailed explanation of what is about to happen
    const message = `This will perform the School Year Transition:
1. Students currently in Class 3 will move to Class 4
2. Students currently in Class 4 will move to Class 5
...
9. Students currently in Class 9 will move to Class 10
10. Three NEW students (Insheerah, Hamza, Amna) will be added to Class 9
11. Class 10 students will be archived (removed from active list)
12. All current marks/scores will be WIPED for the new session.

Do you wish to proceed?`;

    const confirmed = window.confirm(message);
    if (!confirmed) return;
    
    const secondConfirm = window.confirm("FINAL WARNING: This action is irreversible and clears all database marks. Are you absolutely certain?");
    if (!secondConfirm) return;

    setIsPromoting(true);
    setLoading(true);
    setFeedback({ type: 'success', msg: 'Initiating full school roster promotion...' });

    try {
      const classes = ['3', '4', '5', '6', '7', '8', '9', '10'];
      
      // Parallel execution for faster results
      const promotionPromises = classes.map(async (cls) => {
        const tbl = getTableName(cls);
        const roster = INITIAL_ROSTERS[cls];
        
        // 1. Clear existing data in the table
        const { error: deleteError } = await supabase
          .from(tbl)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); 

        if (deleteError) throw new Error(`[Class ${cls}] Reset failed: ${deleteError.message}`);

        // 2. Insert the NEW session roster from class_rosters.ts
        if (roster && roster.length > 0) {
          const rows = roster.map((name, index) => ({
            roll_no: (index + 1).toString(),
            name: toTitleCase(name)
          }));

          const { error: insertError } = await supabase
            .from(tbl)
            .insert(rows);

          if (insertError) throw new Error(`[Class ${cls}] Import failed: ${insertError.message}`);
        }
        
        return cls;
      });

      await Promise.all(promotionPromises);
      
      setFeedback({ type: 'success', msg: 'New Session Initialized! All students promoted as per requirements.' });
      
      // Clear local storage to reset dates for the new year
      localStorage.clear(); 
      
      await fetchData();
    } catch (err: any) {
      console.error("Bulk promotion failed:", err);
      setFeedback({ type: 'error', msg: err.message || 'Promotion failed. Check your Supabase connection.' });
    } finally {
      setIsPromoting(false);
      setLoading(false);
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  const generateFullSessionSql = () => {
    let sql = `-- NEW SESSION DATA INITIALIZATION\n`;
    sql += `-- This script cleans the database and imports the promoted rosters\n\n`;

    const classes = ['3', '4', '5', '6', '7', '8', '9', '10'];
    
    classes.forEach(cls => {
      const tbl = getTableName(cls);
      const roster = INITIAL_ROSTERS[cls];
      
      sql += `-- --- Class ${cls} ---\n`;
      sql += `DELETE FROM public.${tbl};\n`;
      
      if (roster && roster.length > 0) {
        const values = roster.map((name, index) => {
          const escapedName = name.replace(/'/g, "''");
          return `  ('${(index + 1).toString()}', '${toTitleCase(escapedName)}')`;
        }).join(',\n');
        
        sql += `INSERT INTO public.${tbl} (roll_no, name)\nVALUES\n${values};\n\n`;
      }
    });
    
    return sql;
  };

  const handleCopySessionSql = async () => {
    const sql = generateFullSessionSql();
    try {
      await navigator.clipboard.writeText(sql);
      setFeedback({ type: 'success', msg: 'Full Session SQL copied! Paste this in Supabase SQL Editor.' });
      setTimeout(() => setFeedback(null), 5000);
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Failed to copy SQL.' });
    }
  };

  const generateSqlSchema = () => {
    const cols = SUBJECTS.map(s => s.toLowerCase().replace(/\s+/g, '_'))
      .flatMap(s => Array.from({length: 20}, (_, i) => `  ${s}_test_${i+1} text`));
    
    return `CREATE TABLE IF NOT EXISTS public.${tableName} (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  roll_no text,
${cols.join(',\n')}
);

-- Force enable RLS but allow everything (Fixes permissions issues)
ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable access" ON public.${tableName};
CREATE POLICY "Enable access" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);`;
  };

  const generateMasterSqlSchema = () => {
    const classes = ['3', '4', '5', '6', '7', '8', '9', '10'];
    const subjectCols = SUBJECTS.map(s => s.toLowerCase().replace(/\s+/g, '_'))
      .flatMap(s => Array.from({length: 20}, (_, i) => `  ${s}_test_${i+1} text`));
    const columnsSql = subjectCols.join(',\n');
    
    let masterSql = '-- Master Database Schema\n';
    classes.forEach(c => {
      const tbl = `students_class_${c}`;
      masterSql += `CREATE TABLE IF NOT EXISTS public.${tbl} (\n`;
      masterSql += `  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n`;
      masterSql += `  name text NOT NULL,\n`;
      masterSql += `  roll_no text,\n`;
      masterSql += columnsSql;
      masterSql += `\n);\n\n`;
      masterSql += `ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;\n`;
      masterSql += `DROP POLICY IF EXISTS "Enable access ${tbl}" ON public.${tbl};\n`;
      masterSql += `CREATE POLICY "Enable access ${tbl}" ON public.${tbl} FOR ALL USING (true) WITH CHECK (true);\n\n`;
    });
    return masterSql;
  };

  const handleCopySchema = async () => {
    const sql = generateSqlSchema();
    try {
      await navigator.clipboard.writeText(sql);
      setFeedback({ type: 'success', msg: 'SQL Schema copied!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Failed to copy SQL.' });
    }
  };

  const handleDownloadSchema = () => {
    const sql = generateSqlSchema();
    try {
      downloadStringAsFile(sql, `init_class_${selectedClass}_schema.sql`);
      setFeedback({ type: 'success', msg: 'SQL file downloaded.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Failed to download SQL.' });
    }
  };

  const handleDownloadMasterSchema = () => {
    const sql = generateMasterSqlSchema();
    try {
      downloadStringAsFile(sql, 'full_database_schema.sql');
      setFeedback({ type: 'success', msg: 'Full Database SQL downloaded.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ type: 'error', msg: 'Failed to download SQL.' });
    }
  };

  const downloadStringAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRepairNames = async () => {
    if (students.length === 0) return;
    
    setLoading(true);
    setFeedback({ type: 'success', msg: 'Restoring full student names from roster...' });
    
    try {
      const roster = INITIAL_ROSTERS[selectedClass];
      if (!roster) throw new Error("Roster not found for this class.");

      const updates = students.map(async (s) => {
        const rollIdx = parseInt(s.roll_no || '0') - 1;
        if (rollIdx >= 0 && rollIdx < roster.length) {
          const fullName = toTitleCase(roster[rollIdx]);
          // Only update if it's actually different (e.g. truncated)
          if (s.name !== fullName) {
            return supabase.from(tableName).update({ name: fullName }).eq('id', s.id);
          }
        }
        return null;
      });

      await Promise.all(updates);
      setFeedback({ type: 'success', msg: 'Student names repaired successfully!' });
      await fetchData();
    } catch (err: any) {
      console.error("Repair failed:", err);
      setFeedback({ type: 'error', msg: 'Failed to repair names.' });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleUpdateMark = async (studentId: string, value: string) => {
    setIsSaving(true);
    let valToSave: string | number | null = value;
    if (value === '' || value === '-') valToSave = null;
    else if (!isNaN(Number(value))) valToSave = Number(value);
    
    const storageKey = `date_${selectedClass}_${selectedSubject}_${selectedTest}`;
    localStorage.setItem(storageKey, testDate);
    
    try {
      const { error } = await supabase
        .from(tableName)
        .update({ [columnKey]: valToSave })
        .eq('id', studentId);

      if (error) throw error;

      setStudents(prev => prev.map(s => 
        s.id === studentId ? { ...s, [columnKey]: valToSave } : s
      ));

    } catch (err: any) {
      console.error("Error saving mark:", err);
      const isNetworkError = err?.message?.includes('Failed to fetch') || JSON.stringify(err).includes('Failed to fetch');
      const msg = isNetworkError ? "Network Error: Not Saved" : (err.message || 'Failed to save mark.');
      setFeedback({ type: 'error', msg: msg });
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartCopy = async () => {
    const success = await copyToClipboardSmart(
      students, 
      columnKey, 
      selectedClass, 
      selectedSubject, 
      selectedTest,
      maxMarks,
      testDate
    );
    if (success) {
      setFeedback({ type: 'success', msg: 'Copied! Ready for WhatsApp & Excel.' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleExport = () => {
    exportToExcel(students, selectedClass, selectedSubject, selectedTest, testDate);
    setFeedback({ type: 'success', msg: 'Excel report downloaded.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  const renderContent = () => {
    if (viewMode === 'dashboard') {
      return (
        <Dashboard 
          students={students}
          loading={loading}
          selectedSubject={selectedSubject}
          selectedClass={selectedClass}
          isTableMissing={isTableMissing}
        />
      );
    }

    return (
      <MarksGrid 
        students={students} 
        loading={loading} 
        columnKey={columnKey}
        onUpdateMark={handleUpdateMark}
        isSaving={isSaving}
        onInitialize={handleInitializeClass}
        canInitialize={!!INITIAL_ROSTERS[selectedClass]}
        isTableMissing={isTableMissing}
        onCopySchema={handleCopySchema}
        onDownloadSchema={handleDownloadSchema}
        onDownloadMasterSchema={handleDownloadMasterSchema}
        onRefresh={fetchData}
        classNameStr={selectedClass}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header currentView={viewMode} onViewChange={setViewMode} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {feedback && (
          <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in-down ${
            feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
            <span className="font-medium text-sm">{feedback.msg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
          
          <div className="lg:col-span-1">
            <Selector 
              selectedClass={selectedClass}
              setSelectedClass={setSelectedClass}
              selectedSubject={selectedSubject}
              setSelectedSubject={setSelectedSubject}
              selectedTest={selectedTest}
              setSelectedTest={setSelectedTest}
              maxMarks={maxMarks}
              setMaxMarks={setMaxMarks}
              testDate={testDate}
              setTestDate={handleDateChange}
              loading={loading}
              viewMode={viewMode}
            />

            {viewMode === 'entry' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3 sticky top-24 animate-fade-in">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Actions</h3>
                
                <button 
                  onClick={handleSmartCopy}
                  disabled={loading || students.length === 0 || isTableMissing}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-indigo-200"
                >
                  <Copy className="w-4 h-4" />
                  Smart Copy
                </button>
                <p className="text-[10px] text-gray-400 text-center px-2 leading-tight">
                  Copies ASCII for WhatsApp & HTML for Excel.
                </p>

                <hr className="border-gray-100 my-2" />

                <button 
                  onClick={handleExport}
                  disabled={loading || students.length === 0 || isTableMissing}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2.5 px-4 rounded-lg font-medium transition-all disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export Excel
                </button>

                <button 
                  onClick={handleRepairNames}
                  disabled={loading || students.length === 0}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-600 py-2 px-4 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Repair Student Names (Fix Cutting)
                </button>

                <hr className="border-gray-100 my-2" />
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2 flex items-center gap-2">
                   <Database className="w-3 h-3" /> Database Tools
                </h3>
                <button 
                  onClick={handleCopySchema}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 py-2 px-4 rounded-lg text-xs font-medium transition-colors"
                >
                  <FileCode className="w-3 h-3" />
                  Copy Table SQL (Structure)
                </button>

                <button 
                  onClick={handleCopySessionSql}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 py-2 px-4 rounded-lg text-xs font-medium transition-colors"
                >
                  <Database className="w-3 h-3" />
                  Copy Session SQL (Names)
                </button>

                <hr className="border-gray-100 my-2" />
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 mt-2 flex items-center gap-2">
                   <RefreshCw className="w-3 h-3" /> Danger Zone
                </h3>
                <button 
                  onClick={handleBulkPromotion}
                  disabled={loading || isPromoting}
                  className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 py-2 px-4 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                  title="Promotes all students and clears scores for the new session"
                >
                  {isPromoting ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> Promoting...</>
                  ) : (
                    <><RefreshCw className="w-3 h-3" /> Finalize & Promote All</>
                  )}
                </button>
                <p className="text-[9px] text-gray-400 text-center px-1 leading-tight mt-1">
                  Resets database for the new session. Increases class levels and clears marks.
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            {renderContent()}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
