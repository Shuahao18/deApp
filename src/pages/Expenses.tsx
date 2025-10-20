import React, { useEffect, useState, useMemo } from "react";
import { FiPlus, FiDownload, FiRefreshCw, FiEdit } from "react-icons/fi";
import { X } from 'lucide-react'; 
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { db, storage } from "../Firebase"; 
import { collection, query, getDocs, addDoc, Timestamp, where, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; 

// --- TYPES ---
type ExpenseRecord = {
  id?: string;
  purpose: string;
  amount: number;
  transactionDate: Timestamp;
  receiptUrl: string;
};

type ExpenseSummary = {
  totalExpenses: number;
  totalFunds: number;
  year: number;
}

// --- FIREBASE FUNCTIONS ---
const EXPENSES_COLLECTION = 'expenses';
const EXPENSES_STORAGE_PATH = 'expense_proofs/';
const CONTRIBUTIONS_COLLECTION = 'contributions';

// Add Expense
const addExpense = async (
  purpose: string, 
  amount: number, 
  date: Date, 
  receiptFile: File | null
): Promise<void> => {
  let proofURL = '';

  if (receiptFile) {
    const storageRef = ref(storage, `${EXPENSES_STORAGE_PATH}${Date.now()}_${receiptFile.name}`);
    await uploadBytes(storageRef, receiptFile);
    proofURL = await getDownloadURL(storageRef);
  }

  await addDoc(collection(db, EXPENSES_COLLECTION), {
    purpose: purpose,
    amount: parseFloat(amount.toString()),
    transactionDate: Timestamp.fromDate(date),
    receiptUrl: proofURL,
    createdAt: Timestamp.now(), 
  });
};

// Update Expense
const updateExpense = async (
  expenseId: string,
  purpose: string, 
  amount: number, 
  date: Date, 
  receiptFile: File | null,
  existingReceiptUrl: string
): Promise<void> => {
  let proofURL = existingReceiptUrl;

  if (receiptFile) {
    const storageRef = ref(storage, `${EXPENSES_STORAGE_PATH}${Date.now()}_${receiptFile.name}`);
    await uploadBytes(storageRef, receiptFile);
    proofURL = await getDownloadURL(storageRef);
  }

  await updateDoc(doc(db, EXPENSES_COLLECTION, expenseId), {
    purpose: purpose,
    amount: parseFloat(amount.toString()),
    transactionDate: Timestamp.fromDate(date),
    receiptUrl: proofURL,
    updatedAt: Timestamp.now(), 
  });
};

// Fetch Expenses by Year
const fetchExpensesByYear = async (year: number): Promise<ExpenseRecord[]> => {
  try {
    const startOfYear = Timestamp.fromDate(new Date(year, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(year + 1, 0, 1));

    const q = query(
      collection(db, EXPENSES_COLLECTION),
      where('transactionDate', '>=', startOfYear),
      where('transactionDate', '<', endOfYear)
    );
    
    const querySnapshot = await getDocs(q);

    const expenseList: ExpenseRecord[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        purpose: data.purpose,
        amount: data.amount,
        transactionDate: data.transactionDate as Timestamp,
        receiptUrl: data.receiptUrl,
      };
    });

    return expenseList;
  } catch (error) {
    console.error("Error fetching expenses for year", year, ":", error);
    return [];
  }
};

// Fetch Total Funds
const fetchTotalFundsByYear = async (year: number): Promise<number> => {
  try {
    const startOfYear = new Date(year, 0, 1); 
    const endOfYear = new Date(year + 1, 0, 1); 

    const startTimestamp = Timestamp.fromDate(startOfYear);
    const endTimestamp = Timestamp.fromDate(endOfYear);

    const q = query(
      collection(db, CONTRIBUTIONS_COLLECTION),
      where('transactionDate', '>=', startTimestamp),
      where('transactionDate', '<', endTimestamp)
    );

    const querySnapshot = await getDocs(q);
    
    let total = 0;
    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (typeof data.amount === 'number') {
        total += data.amount;
      } else if (typeof data.amount === 'string') {
        total += parseFloat(data.amount);
      }
    });

    return total;
  } catch (error) {
    console.error(`Error fetching total funds for ${year}:`, error);
    return 0.00;
  }
}

// --- EDIT EXPENSE MODAL ---
const EditExpenseModal = ({ 
  show, 
  onClose, 
  onSave, 
  record 
}: { 
  show: boolean; 
  onClose: () => void; 
  onSave: () => void; 
  record: ExpenseRecord | null;
}) => {
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setPurpose(record.purpose);
      setAmount(record.amount.toString());
      setDate(record.transactionDate.toDate().toISOString().substring(0, 10));
      setImageFile(null);
    }
  }, [record]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageFile(e.target.files ? e.target.files[0] : null);
  };

  const handleClearFile = () => {
    setImageFile(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!record?.id || !purpose || !amount || !date) {
      alert("Please fill out all required fields.");
      return;
    }

    setIsSaving(true);
    try {
      await updateExpense(
        record.id,
        purpose, 
        parseFloat(amount), 
        new Date(date), 
        imageFile,
        record.receiptUrl
      );

      onSave();
      onClose();
      
    } catch (error) {
      console.error("Error updating expense:", error);
      alert("Failed to update expense.");
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!show || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold mb-1 text-center">Edit Expense Details</h2>
        <p className="text-sm text-gray-500 mb-4 text-center border-b pb-4">Update the expense information below</p>
        
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Purpose</label>
            <input 
              type="text" 
              value={purpose} 
              onChange={e => setPurpose(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
              disabled={isSaving}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium">Amount</label>
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
              disabled={isSaving}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-white focus:ring-[#125648] focus:border-[#125648]"
              disabled={isSaving}
            />
          </div>
          
          <div className="pt-2">
            <label className="block text-sm font-medium mb-1">Proof of expenses</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition cursor-pointer">
              {imageFile ? (
                <div className="flex justify-between items-center">
                  <p className="text-sm text-green-600">New file: {imageFile.name}</p>
                  <button 
                    type="button" 
                    onClick={handleClearFile} 
                    className="text-red-500 hover:text-red-700 text-sm font-semibold ml-4"
                    disabled={isSaving}
                  >
                    Remove
                  </button>
                </div>
              ) : record.receiptUrl ? (
                <div className="flex justify-between items-center">
                  <p className="text-sm text-blue-600">Current receipt uploaded</p>
                  <button 
                    type="button" 
                    onClick={handleClearFile} 
                    className="text-red-500 hover:text-red-700 text-sm font-semibold ml-4"
                    disabled={isSaving}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-3xl">🖼️</p>
                  <p className="text-gray-500 text-sm">Upload an image or drag and drop</p>
                </>
              )}
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileChange} 
                className="opacity-0 absolute inset-0 cursor-pointer" 
                disabled={isSaving}
              />
            </div>
            {record.receiptUrl && !imageFile && (
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to keep current receipt
              </p>
            )}
          </div>
          
          <div className="mt-6 pt-4 border-t flex justify-center gap-3">
            <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 font-semibold" disabled={isSaving}>
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving} 
              className="bg-[#125648] text-white px-6 py-2 rounded-lg hover:bg-[#0d3d33] font-semibold disabled:bg-gray-400"
            >
              {isSaving ? "Updating..." : "Update Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- EXPORT MODAL (Keep existing) ---
const ExportExpensesModal = ({ show, onClose, records, summary }: { 
  show: boolean, 
  onClose: () => void, 
  records: ExpenseRecord[], 
  summary: ExpenseSummary 
}) => {
  const initialFileName = `Expenses_Report_${summary.year}`;
  const [fileName, setFileName] = useState(initialFileName);
  
  const [selectedColumns, setSelectedColumns] = useState(['purpose', 'amount', 'transactionDate', 'receiptUrl']);
  const [isExporting, setIsExporting] = useState(false);

  const ALL_COLUMNS = [
    { key: 'purpose', label: 'Purpose' },
    { key: 'amount', label: 'Amount (P)' },
    { key: 'transactionDate', label: 'Date' },
    { key: 'receiptUrl', label: 'Receipt Link' },
  ];

  const handleToggleColumn = (key: string) => {
    setSelectedColumns(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key) 
        : [...prev, key]
    );
  };

  const handleExportPDF = () => {
    if (selectedColumns.length === 0 || !fileName.trim()) return;

    setIsExporting(true);

    try {
      const { applyPlugin } = require('jspdf-autotable');
      applyPlugin(jsPDF);
    } catch (e) {
      console.error("Failed to apply jspdf-autotable plugin:", e);
    }

    if (records.length === 0) {
      alert('Walang nakitang records para i-export.');
      setIsExporting(false);
      onClose();
      return;
    }
    
    const columns = ALL_COLUMNS.filter(col => selectedColumns.includes(col.key));
    const headers = columns.map(col => col.label);

    const data = records.map(record => {
      const row: string[] = [];
      columns.forEach(col => {
        let value: string = '';

        switch(col.key) {
          case 'purpose':
            value = record.purpose || 'N/A';
            break;
          case 'amount':
            value = record.amount !== undefined && record.amount !== null 
              ? `P ${record.amount.toFixed(2)}`
              : 'P 0.00'; 
            break;
          case 'transactionDate':
            value = record.transactionDate 
              ? record.transactionDate.toDate().toLocaleDateString('en-US') 
              : 'N/A';
            break;
          case 'receiptUrl':
            value = record.receiptUrl ? 'Available (Link Not Included)' : 'No Proof';
            break;
          default:
            value = 'N/A';
        }
        row.push(value);
      });
      return row;
    });

    const doc = new jsPDF(); 
    
    // @ts-ignore
    (doc as any).autoTable({ 
      startY: 35, 
      head: [headers],
      body: data,
    });

    doc.save(`${fileName}.pdf`);
    
    setIsExporting(false);
    onClose();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">Export Expense Records</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">File Name</label>
            <input 
              type="text" 
              value={fileName} 
              onChange={e => setFileName(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-[#125648] focus:border-[#125648]" 
              disabled={isExporting}
            />
          </div>
          
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3">Select Columns to Include</h3>
            <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto p-3 border rounded-lg bg-gray-50">
              {ALL_COLUMNS.map(col => (
                <div key={col.key} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`exp-col-${col.key}`}
                    checked={selectedColumns.includes(col.key)}
                    onChange={() => handleToggleColumn(col.key)}
                    className="h-4 w-4 text-[#125648] border-gray-300 rounded focus:ring-[#125648]"
                    disabled={isExporting}
                  />
                  <label htmlFor={`exp-col-${col.key}`} className="ml-2 text-sm text-gray-700 cursor-pointer">
                    {col.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300" disabled={isExporting}>
            Cancel
          </button>
          <button 
            onClick={handleExportPDF} 
            disabled={isExporting || selectedColumns.length === 0 || !fileName.trim()} 
            className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
          >
            {isExporting ? (
              <>
                <FiRefreshCw className="animate-spin w-4 h-4"/> Exporting...
              </>
            ) : (
              <>
                <FiDownload className="w-4 h-4" /> Export to PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- STAT BOX ---
const StatBox = ({ title, value, colorKey }: 
  { title: string, value: string, isPrimary: boolean, isLarge: boolean, colorKey: 'blue' | 'red' }) => {

  const borderColor = colorKey === 'blue' ? 'border-blue-500' : 'border-red-500';

  return (
    <div className={`bg-white p-5 rounded-lg shadow-md w-1/2 border-l-4 ${borderColor}`}>
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
};

// --- EXPENSE FORM MODAL (Keep existing) ---
const ExpenseFormModal = ({ show, onClose, onSave }: { show: boolean, onClose: () => void, onSave: () => void }) => {
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!show) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageFile(e.target.files ? e.target.files[0] : null);
  };

  const handleClearFile = () => {
    setImageFile(null);
    const fileInput = document.getElementById('receipt-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!purpose || !amount || !date) {
      alert("Please fill out all required fields.");
      return;
    }

    setIsSaving(true);
    try {
      await addExpense(
        purpose, 
        parseFloat(amount), 
        new Date(date), 
        imageFile
      );

      onSave();
      setPurpose('');
      setAmount('');
      setDate(new Date().toISOString().substring(0, 10));
      setImageFile(null);
      
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to submit expense.");
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold mb-1 text-center">Expenses Details</h2>
        <p className="text-sm text-gray-500 mb-4 text-center border-b pb-4">Please fill out the form below</p>
        
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Purpose</label>
            <input 
              type="text" 
              value={purpose} 
              onChange={e => setPurpose(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
              placeholder="Enter the purpose of expenses, e.g. food"
              disabled={isSaving}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium">Amount of expenses</label>
            <input 
              type="number" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
              placeholder="Enter the payment value"
              disabled={isSaving}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-white focus:ring-[#125648] focus:border-[#125648]"
              disabled={isSaving}
            />
          </div>
          
          <div className="pt-2">
            <label className="block text-sm font-medium mb-1">Proof of expenses</label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition cursor-pointer">
              {imageFile ? (
                <div className="flex justify-between items-center">
                  <p className="text-sm text-green-600">File selected: **{imageFile.name}**</p>
                  <button 
                    type="button" 
                    onClick={handleClearFile} 
                    className="text-red-500 hover:text-red-700 text-sm font-semibold ml-4"
                    disabled={isSaving}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-3xl">🖼️</p>
                  <p className="text-gray-500 text-sm">Upload an image or drag and drop</p>
                </>
              )}
              <input 
                id="receipt-upload"
                type="file" 
                accept="image/*"
                onChange={handleFileChange} 
                className="opacity-0 absolute inset-0 cursor-pointer" 
                disabled={isSaving}
              />
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t flex justify-center gap-3">
            <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 font-semibold" disabled={isSaving}>
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving} 
              className="bg-[#125648] text-white px-6 py-2 rounded-lg hover:bg-[#0d3d33] font-semibold disabled:bg-gray-400"
            >
              {isSaving ? "Submitting..." : "Submit Expenses"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN EXPENSES COMPONENT ---
export default function Expenses() {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [totalFunds, setTotalFunds] = useState<number>(0.00); 
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFunds, setIsLoadingFunds] = useState(false); 
  const [showAddModal, setShowAddModal] = useState(false); 
  const [showExportModal, setShowExportModal] = useState(false); 
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ExpenseRecord | null>(null);
  
  const currentYear = new Date().getFullYear(); 

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate('/EditModal');
  };

  const handleDashboardClick = () => {
    navigate('/Dashboard');
  };

  const fetchExpensesData = async () => {
    setIsLoading(true);
    try {
      const expenseList = await fetchExpensesByYear(currentYear); 
      setRecords(expenseList);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFundsData = async () => {
    setIsLoadingFunds(true);
    try {
      const funds = await fetchTotalFundsByYear(currentYear);
      setTotalFunds(funds);
    } catch (error) {
      console.error("Error fetching funds:", error);
    } finally {
      setIsLoadingFunds(false);
    }
  };

  useEffect(() => {
    fetchExpensesData();
    fetchFundsData(); 
  }, [currentYear]); 

  const totalExpensesThisYear = useMemo(() => {
    return records.reduce((sum, record) => sum + record.amount, 0);
  }, [records]);
  
  const expenseSummary: ExpenseSummary = useMemo(() => ({
    totalExpenses: totalExpensesThisYear,
    totalFunds: totalFunds,
    year: currentYear
  }), [totalExpensesThisYear, totalFunds, currentYear]);

  const handleSuccess = () => {
    setShowAddModal(false);
    fetchExpensesData(); 
    fetchFundsData(); 
  }

  const handleEditClick = (record: ExpenseRecord) => {
    setSelectedRecord(record);
    setShowEditModal(true);
  };

  const handleEditSave = () => {
    fetchExpensesData();
    fetchFundsData();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* TOP HEADER - Expenses Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        
        {/* Expenses Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">Expenses</h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <ShareIcon className="h-5 w-5" /> 
          </button>

          {/* ADMIN BUTTON: Navigation Handler */}
          <div 
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick} 
          >
            <UserCircleIcon className="h-8 w-8 text-white" />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-8">
        <div className="bg-white shadow-xl rounded-lg p-6"> 
          <div className="flex space-x-4 mb-6 border-b pb-6">
            <StatBox 
              title={`Total Funds ${currentYear}`} 
              value={isLoadingFunds ? "Loading..." : `P ${totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              isPrimary={false} 
              isLarge={true} 
              colorKey="blue"
            /> 
            <StatBox 
              title="Total Expenses this year" 
              value={isLoading ? "Loading..." : `P ${totalExpensesThisYear.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              isPrimary={false} 
              isLarge={true} 
              colorKey="red"
            /> 
          </div>
          
          <div className="flex justify-end items-center pb-4 mb-4 space-x-3">
            <button 
              onClick={() => setShowExportModal(true)} 
              disabled={isLoading || records.length === 0} 
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 shadow-sm disabled:opacity-50"
            >
              <FiDownload className="w-4 h-4" /> Export PDF
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:bg-[#0d3d33]"
            >
              <FiPlus /> Add Expenses
            </button>
          </div>

          {/* FIXED TABLE STRUCTURE */}
          <div className="overflow-x-auto border rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-object"> 
                <tr>
                  {['Purpose', 'Amount', 'Date', 'Receipt', 'Actions'].map((header) => (
                    <th key={header} className="px-6 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-gray-500">
                      Loading expenses...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-gray-500">
                      No expenses recorded.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {record.purpose}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                        {`P ${record.amount.toFixed(2)}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {record.transactionDate.toDate().toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {record.receiptUrl ? (
                          <a 
                            href={record.receiptUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-500 hover:underline"
                          >
                            View Receipt
                          </a>
                        ) : (
                          <span className="text-gray-400">-----</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <button
                          onClick={() => handleEditClick(record)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          title="Edit expense"
                        >
                          <FiEdit className="w-3 h-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <ExpenseFormModal 
          show={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          onSave={handleSuccess}
        />

        <EditExpenseModal 
          show={showEditModal} 
          onClose={() => {
            setShowEditModal(false);
            setSelectedRecord(null);
          }} 
          onSave={handleEditSave}
          record={selectedRecord}
        />

        <ExportExpensesModal 
          show={showExportModal}
          onClose={() => setShowExportModal(false)}
          records={records}
          summary={expenseSummary}
        />
      </main>
    </div>
  );
}