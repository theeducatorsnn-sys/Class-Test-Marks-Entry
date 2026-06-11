import React, { useState } from 'react';
import { Student } from '../types';
import { CalendarDays, Download, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AttendanceSheetProps {
  students: Student[];
  selectedClass: string;
  isTableMissing: boolean;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  students,
  selectedClass,
  isTableMissing
}) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const months = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();
  const daysInMonth = getDaysInMonth(month, year);
  
  // Create array of days [1, 2, 3...]
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isSunday = (d: number) => {
    const date = new Date(year, month, d);
    return date.getDay() === 0; // 0 is Sunday
  };

  const handleExportAttendance = () => {
    // 1. Title Row
    const title = `Attendance Register - Class ${selectedClass} - ${months[month]} ${year}`;
    
    // 2. Header Row
    // Roll, Name, 1, 2, 3...
    const headers = ["Roll No", "Name", ...days.map(d => String(d)), "Total", "Rem"];

    // 3. Data Rows
    const dataRows = students.map(s => {
      // Create empty cells for days, but maybe mark 'S' for Sundays? 
      // For a blank sheet, usually better to leave empty or gray out in styling.
      const dayCells = days.map(d => isSunday(d) ? 'Sun' : '');
      
      return [
        s.roll_no,
        s.name,
        ...dayCells,
        '', // Total Present
        ''  // Remarks
      ];
    });

    // 4. Combine
    const wsData = [
      [title],
      headers,
      ...dataRows
    ];

    // 5. Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 6. Merge Title
    const lastCol = headers.length - 1;
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });

    // 7. Column Widths
    const cols = [
      { wch: 6 },  // Roll
      { wch: 25 }, // Name
    ];
    // Days columns (narrow)
    days.forEach(() => cols.push({ wch: 4 }));
    cols.push({ wch: 8 }); // Total
    cols.push({ wch: 10 }); // Rem

    ws['!cols'] = cols;

    // 8. Style Metadata (Colors) - SheetJS basic version doesn't export colors easily 
    // without Pro version, but we can content 'Sun' to help.

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_Class_${selectedClass}_${months[month]}_${year}.xlsx`);
  };

  if (isTableMissing || students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200 min-h-[400px]">
        <Database className="w-12 h-12 mb-4 text-gray-300" />
        <p className="font-medium text-lg text-gray-600">No Student Data</p>
        <p className="text-sm text-gray-400 mt-1">Initialize the class roster in Data Entry mode to generate sheets.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
      
      {/* Toolbar */}
      <div className="flex flex-col border-b border-gray-200 bg-gray-50/50">
        <div className="px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Attendance Sheet</h2>
              <p className="text-xs text-gray-500">Generate printable register</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <select 
              value={month} 
              onChange={(e) => setMonth(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            
            <select 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button 
              onClick={handleExportAttendance}
              className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Preview Grid */}
      <div className="overflow-auto flex-1 relative bg-white pb-4">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200 sticky top-0 z-30">
            <tr>
              <th className="px-4 py-3 font-semibold w-16 bg-gray-50 sticky left-0 z-40 border-r border-gray-200">Roll</th>
              <th className="px-4 py-3 font-semibold w-48 bg-gray-50 sticky left-16 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-200">Name</th>
              {days.map(d => {
                const sunday = isSunday(d);
                return (
                  <th key={d} className={`px-1 py-3 text-center border-r border-gray-100 min-w-[32px] ${sunday ? 'bg-red-50 text-red-600' : ''}`}>
                    {d}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-500 sticky left-0 bg-white z-20 border-r border-gray-100">
                  {student.roll_no}
                </td>
                <td className="px-4 py-2 font-medium text-gray-900 sticky left-16 bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-gray-100 truncate max-w-[192px]">
                  {student.name}
                </td>
                {days.map(d => {
                   const sunday = isSunday(d);
                   return (
                    <td key={d} className={`px-1 py-2 text-center border-r border-gray-100 text-[10px] text-gray-400 ${sunday ? 'bg-red-50 text-red-400 font-bold' : ''}`}>
                      {sunday ? 'S' : ''}
                    </td>
                   );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};