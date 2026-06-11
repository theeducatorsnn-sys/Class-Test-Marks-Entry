
import { Student } from '../types';
import * as XLSX from 'xlsx';
import { getColumnName } from '../services/supabase';

export const toTitleCase = (str: string) => {
  if (typeof str !== 'string') return '';
  // Remove double spaces first, then title case
  return str.replace(/\s+/g, ' ').trim().toLowerCase().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}-${month}-${year}`; // DD-MM-YYYY
};

// Helper: Abbreviate common long names for compact WhatsApp display
// Now exported for use in UI components
export const abbreviateName = (name: string | null | undefined): string => {
  if (!name) return '';
  
  let trimmed = name.trim();
  // Standardize spaces
  trimmed = trimmed.replace(/\s+/g, ' ');
  
  // Requirement: "If MUHAMMAD is written alone or single name then remain that same"
  // We check for exact match of variations including typos
  if (/^(Muhammad|Mohammad|Muhammed|Mohammed|Muhammd|M\.|M)$/i.test(trimmed)) {
    return trimmed;
  }

  // Replace variations of Muhammad/Mohammad with M in compound names
  // Added 'Mohd', 'Muhammd' (typo) coverage
  let processed = trimmed.replace(/\b(Muhammad|Mohammad|Muhammed|Mohammed|Muhammd|Mohd)\b/gi, 'M');

  // Mobile Optimization: Abbreviate common titles to save space
  processed = processed.replace(/\b(Syed|Syeda)\b/gi, 'S.');
  processed = processed.replace(/\b(Sheikh|Shaikh)\b/gi, 'Sh.');
  processed = processed.replace(/\b(Hafiz|Hafiza)\b/gi, 'Hfz.');
  
  return processed;
};

export const copyToClipboardSmart = async (
  students: Student[],
  columnKey: string,
  className: string,
  subject: string,
  testNo: number,
  maxMarks: number,
  testDate: string
) => {
  const formattedDate = formatDate(testDate);
  const title = `Class ${className} - ${subject} Test ${testNo} (${formattedDate})`;
  const headerSub = `(Out of ${maxMarks})`;
  
  // 1. Generate WhatsApp text (Ultra-Compact for Mobile Alignment)
  const W_NO = 2;    
  const W_MARK = 4;   // Reduced from 6, fits "Mks"

  const centerText = (text: string, width: number) => {
    const s = String(text).trim();
    const pad = width - s.length;
    if (pad <= 0) return s.substring(0, width);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return " ".repeat(left) + s + " ".repeat(right);
  };
  
  // Dynamic Name Width Calculation: Extra narrow to prevent ANY wrapping
  const displayNames = students.map(s => abbreviateName(s.name));
  const longestNameInRoster = Math.max(...displayNames.map(n => n.length), 4);
  const W_NAME = Math.min(longestNameInRoster, 19); 

  const shortMark = (mark: any) => {
    if (mark === null || mark === undefined || mark === '') return '-';
    const s = String(mark).toUpperCase();
    if (s === 'BIOLOGY') return 'BIO';
    if (s === 'ABSENT') return 'ABS';
    return s;
  };

  // Ultra-Compact Header Title (Single Line)
  const compactSub = subject.length > 8 ? subject.substring(0, 7) + '.' : subject;
  const singleLineHeader = `${className}-${toTitleCase(compactSub)} T${testNo} (${maxMarks}m) ${formattedDate}`;
  let textData = `*${singleLineHeader}*\n\n`;
  textData += "```\n"; 
  
  // Header: No|Name|Mks
  const hNo = centerText("No", W_NO);
  const hName = "Name".padEnd(W_NAME);
  const hMark = centerText("Mks", W_MARK);
  textData += `${hNo}|${hName}|${hMark}\n`;
  
  // Separator
  textData += `${"-".repeat(W_NO)}|${"-".repeat(W_NAME)}|${"-".repeat(W_MARK)}\n`;
  
  // Rows
  students.forEach(s => {
    const rVal = centerText(s.roll_no || '', W_NO);
    const nStr = abbreviateName(s.name);
    const nVal = nStr.substring(0, W_NAME).padEnd(W_NAME); 
    const mVal = centerText(shortMark(s[columnKey]), W_MARK);
    
    textData += `${rVal}|${nVal}|${mVal}\n`;
  });
  
  textData += "```"; 

  // 2. Generate HTML for Excel/Word
  const formatMarkForReport = (mark: any) => {
    if (mark === null || mark === undefined || mark === '') return '';
    const s = String(mark).toUpperCase();
    if (s === 'BIOLOGY') return 'BIO';
    if (s === 'ABSENT') return 'ABS';
    return s;
  };

  let htmlData = `
    <table border="1" style="border-collapse: collapse; font-family: 'Arial', sans-serif; width: 100%; max-width: 500px; margin: 0 auto; color: #000;">
      <thead>
        <tr>
          <th colspan="3" style="padding: 10px; text-align: center; font-size: 16pt; border: 1px solid #000;">
            ${toTitleCase(title)}
          </th>
        </tr>
        <tr>
          <th colspan="3" style="padding: 5px; text-align: center; font-size: 11pt; font-weight: bold; border: 1px solid #000; background-color: #f3f4f6;">
            (Out of ${maxMarks})
          </th>
        </tr>
        <tr style="background-color: #d1d5db;">
          <th style="padding: 8px; width: 60px; text-align: center; border: 1px solid #000; font-weight: bold;">Roll No</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">Name</th>
          <th style="padding: 8px; width: 100px; text-align: center; border: 1px solid #000; font-weight: bold;">Marks (/${maxMarks})</th>
        </tr>
      </thead>
      <tbody>
  `;

  students.forEach(s => {
    const mark = s[columnKey];
    let color = '#000000';
    if (mark === 'NA') color = '#d97706'; // Amber for NA as in image
    
    const displayMark = formatMarkForReport(mark);

    htmlData += `
      <tr>
        <td style="padding: 6px; text-align: center; border: 1px solid #000;">${s.roll_no}</td>
        <td style="padding: 6px 12px; text-align: left; border: 1px solid #000;">${s.name}</td>
        <td style="padding: 6px; text-align: center; border: 1px solid #000; color: ${color}; font-weight: bold;">
          ${displayMark}
        </td>
      </tr>
    `;
  });
  htmlData += `</tbody></table>`;

  // Execute Copy
  try {
    const blobText = new Blob([textData], { type: 'text/plain' });
    const blobHtml = new Blob([htmlData], { type: 'text/html' });
    
    const data = [new ClipboardItem({
      'text/plain': blobText,
      'text/html': blobHtml
    })];
    
    await navigator.clipboard.write(data);
    return true;
  } catch (err) {
    console.error('Clipboard write failed', err);
    return false;
  }
};

export const copyDashboardSmart = async (
  students: Student[],
  className: string,
  subject: string
) => {
  const title = `Class ${className} - ${subject} Master Sheet`;
  const allTests = Array.from({ length: 20 }, (_, i) => i + 1);

  // Identify which tests actually have data to keep the table clean
  const activeTests = allTests.filter(t => {
    const key = getColumnName(subject, t);
    return students.some(s => {
        const val = s[key];
        return val !== null && val !== undefined && val !== '';
    });
  });

  // 1. WhatsApp Data (ASCII)
  let textData = `*${title}*\n`;
  textData += "```\n";
  
  const centerTextDash = (text: string, width: number) => {
    const s = String(text).trim();
    const pad = width - s.length;
    if (pad <= 0) return s;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return " ".repeat(left) + s + " ".repeat(right);
  };
  
  // No truncation or abbreviation for Master Sheet names unless requested
  // We'll use abbreviateName here too for consistency with your preference
  const displayNamesDash = students.map(s => abbreviateName(s.name));
  const W_DASH_NAME = Math.max(...displayNamesDash.map(n => n.length), 4);
  
  const maxRollLen = Math.max(4, ...students.map(s => (s.roll_no || '').length));
  
  // Dynamic Headers for active tests only
  const testHeaders = activeTests.map(t => centerTextDash(`T${t}`, 3)).join(' | ');

  const hRoll = centerTextDash('No', maxRollLen);
  const hName = 'Name'.padEnd(W_DASH_NAME);
  
  textData += ` ${hRoll} | ${hName} | ${testHeaders} \n`;
  
  const testSeps = activeTests.map(() => '---').join('-|-');
  textData += `${'-'.repeat(maxRollLen + 2)}|${'-'.repeat(W_DASH_NAME + 2)}| ${testSeps} \n`;

  students.forEach(s => {
    const r = centerTextDash(s.roll_no || '', maxRollLen);
    const nStr = abbreviateName(s.name);
    const n = nStr.padEnd(W_DASH_NAME);
    
    const marks = activeTests.map(t => {
        const key = getColumnName(subject, t);
        const val = s[key];
        const markStr = (val !== null && val !== undefined && val !== '' ? String(val) : '-');
        return centerTextDash(markStr, 3);
    }).join(' | ');
    
    textData += ` ${r} | ${n} | ${marks} \n`;
  });
  textData += "```";

  // 2. HTML Data (Excel)
  // We also hide empty test columns here for a cleaner Master Sheet
  // But we KEEP Total and Avg as they are standard for Excel reports
  let htmlData = `
    <table border="1" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th colspan="${2 + activeTests.length + 2}" style="padding: 10px; text-align: center; font-size: 16px;">${title}</th>
        </tr>
        <tr style="background-color: #e0e0e0;">
          <th style="padding: 5px;">Roll</th>
          <th style="padding: 5px; text-align: left;">Name</th>
          ${activeTests.map(t => `<th style="padding: 2px; width: 30px;">T${t}</th>`).join('')}
          <th style="padding: 5px;">Total</th>
          <th style="padding: 5px;">Avg</th>
        </tr>
      </thead>
      <tbody>
  `;

  students.forEach(s => {
    let total = 0;
    let count = 0;
    
    // Calculate totals based on ALL valid numeric data
    allTests.forEach(t => {
        const key = getColumnName(subject, t);
        const val = s[key];
        const num = parseFloat(String(val));
        if (!isNaN(num)) {
            total += num;
            count++;
        }
    });
    
    const totStr = count > 0 ? total.toFixed(1).replace(/\.0$/, '') : '-';
    const avgStr = count > 0 ? (total / count).toFixed(1) : '-';

    htmlData += `<tr>`;
    htmlData += `<td style="padding: 5px;">${s.roll_no}</td>`;
    htmlData += `<td style="padding: 5px;">${s.name}</td>`;

    activeTests.forEach(t => {
        const key = getColumnName(subject, t);
        const val = s[key];
        let display = '';
        let color = '#000';
        if (val !== null && val !== undefined && val !== '') {
            display = String(val);
            const num = parseFloat(String(val));
            if (!isNaN(num)) {
                // Normal number
            } else {
                if (display.toUpperCase() === 'A') color = 'red';
                else if (display.toUpperCase() === 'NA') color = 'orange';
            }
        }
        htmlData += `<td style="padding: 5px; text-align: center; color: ${color};">${display}</td>`;
    });

    htmlData += `<td style="padding: 5px; text-align: center; font-weight: bold; background-color: #f9fafb;">${totStr}</td>`;
    htmlData += `<td style="padding: 5px; text-align: center; font-weight: bold; background-color: #f9fafb;">${avgStr}</td>`;
    htmlData += `</tr>`;
  });

  htmlData += `</tbody></table>`;

  try {
    const blobText = new Blob([textData], { type: 'text/plain' });
    const blobHtml = new Blob([htmlData], { type: 'text/html' });
    const data = [new ClipboardItem({ 'text/plain': blobText, 'text/html': blobHtml })];
    await navigator.clipboard.write(data);
    return true;
  } catch (e) {
    console.error('Clipboard write failed', e);
    return false;
  }
};

export const exportToExcel = (
  students: Student[], 
  className: string, 
  subject?: string, 
  testNo?: number, 
  testDate?: string
) => {
  // 1. Prepare Metadata & Title
  const formattedDate = testDate ? formatDate(testDate) : '';
  let title = `Class ${className}`;
  let columnKey = '';
  
  if (subject && testNo) {
      title = `Class ${className} - ${subject} Test ${testNo}`;
      if (formattedDate) title += ` (${formattedDate})`;
      columnKey = getColumnName(subject, testNo);
  }

  // 2. Prepare Data Rows
  // We strictly want: Roll No | Name | Marks
  const headerRow = ["Roll No", "Name", "Marks"];
  
  const dataRows = students.map(s => {
      // Fix: Allow 0
      const mark = (columnKey && s[columnKey] !== null && s[columnKey] !== undefined) ? s[columnKey] : '';
      return [
          s.roll_no,
          s.name,
          mark
      ];
  });

  // 3. Combine into Array of Arrays for aoa_to_sheet
  // Row 0: Title (Merged later)
  // Row 1: Headers
  // Row 2+: Data
  const wsData = [
      [title], // Title row
      headerRow,
      ...dataRows
  ];

  // 4. Create Sheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // 5. Styling & Formatting
  // Merge the title across 3 columns (A1:C1)
  if(!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });

  // Set column widths
  ws['!cols'] = [
      { wch: 8 },  // Roll
      { wch: 25 }, // Name
      { wch: 10 }  // Marks
  ];

  // 6. Create Workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet Name max 31 chars
  let sheetName = subject ? `${subject} T${testNo}` : `Class ${className}`;
  if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
  
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // 7. Generate Filename
  let filename = `Class_${className}_Marks`;
  if (subject && testNo) {
    filename = `Class_${className}_${subject}_Test_${testNo}`;
    if (formattedDate) filename += `_(${formattedDate})`;
  }
  
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const getMarkStatus = (value: string | number | null): string => {
  if (value === null || value === '') return 'bg-gray-50';
  const valStr = String(value).toUpperCase();
  if (valStr === 'A') return 'bg-red-100 text-red-800 border-red-200';
  if (valStr === 'NA') return 'bg-amber-100 text-amber-800 border-amber-200';
  const num = parseFloat(valStr);
  if (!isNaN(num)) {
     if (num < 0 || num > 100) return 'bg-red-50 text-red-500 ring-2 ring-red-500'; // Warning
     return 'bg-green-50 text-green-800 border-green-200';
  }
  return 'bg-gray-50';
};
