import React, { useEffect, useState, useMemo } from "react";
import { FiPlus, FiDownload } from "react-icons/fi";
// 💡 I-ASSUME NA TAMA ANG PATH MO DITO:
import { db, storage } from "../Firebase"; 
import { collection, query, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// --- TYPES ---
type ExpenseRecord = {
  id?: string;
  purpose: string;
  amount: number;
  transactionDate: Timestamp;
  receiptUrl: string; // Proof of expenses URL
};

// --- FIREBASE EXPENSE SERVICE LOGIC (Merged) ---
const EXPENSES_COLLECTION = 'expenses';
const EXPENSES_STORAGE_PATH = 'expense_proofs/';

// 1. ADD NEW EXPENSE (Create)
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

// 2. FETCH ALL EXPENSES (Read)
const fetchAllExpenses = async (): Promise<ExpenseRecord[]> => {
  try {
    const q = query(collection(db, EXPENSES_COLLECTION));
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
    console.error("Error fetching expenses:", error);
    return [];
  }
};


// --- MAIN EXPENSES COMPONENT ---

export default function Expenses() {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // --- Data Fetching ---
  const fetchExpensesData = async () => {
    setIsLoading(true);
    try {
      const expenseList = await fetchAllExpenses();
      setRecords(expenseList);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpensesData();
  }, []);

  // --- Aggregate Totals (from the image design) ---
  const totalFundsThisYear = 50000.00; 
  const totalExpensesThisYear = useMemo(() => {
    return records.reduce((sum, record) => sum + record.amount, 0);
  }, [records]);

  // --- UI Handlers ---
  const handleSuccess = () => {
    setShowModal(false);
    fetchExpensesData(); // Refresh data after saving
  }

  // --- Rendering ---
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Expenses</h1>
      </div>

      <div className="bg-white shadow-xl rounded-lg p-6"> 
        
        {/* Summary Boxes */}
        <div className="flex space-x-4 mb-6 border-b pb-6">
          <StatBox 
            title="Total Funds this year" 
            value={`P ${totalFundsThisYear.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
            isPrimary={false} 
            isLarge={true} 
            colorKey="blue"
          /> 
          <StatBox 
            title="Total Expenses this year" 
            value={`P ${totalExpensesThisYear.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
            isPrimary={false} 
            isLarge={true} 
            colorKey="red"
          /> 
        </div>
        
        {/* Controls and Export/Add Buttons */}
        <div className="flex justify-end items-center pb-4 mb-4 space-x-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 shadow-sm">
            <FiDownload className="w-4 h-4" /> Export
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:bg-[#0d3d33]"
          >
            <FiPlus /> Add Expenses
          </button>
        </div>

        {/* Expenses Table */}
        <div className="overflow-x-auto border rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-700"> 
              <tr>
                {['Purpose', 'Amount', 'Date', 'Receipt'].map((header) => (
                  <th key={header} className="px-6 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-500">Loading expenses...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-500">No expenses recorded.</td></tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.purpose}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{`P ${record.amount.toFixed(2)}`}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {record.transactionDate.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {record.receiptUrl ? (
                        <a href={record.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          View Receipt
                        </a>
                      ) : (
                        <span className="text-gray-400">-----</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Expense Form Modal */}
      <ExpenseFormModal 
        show={showModal} 
        onClose={() => setShowModal(false)} 
        onSave={handleSuccess}
      />
      
    </div>
  );
}


// ----------------------------------------------------
// --- SEPARATE COMPONENTS ---
// ----------------------------------------------------

// Simplified Stat Box Component for Expenses Page
const StatBox = ({ title, value, colorKey }: 
    { title: string, value: string, isPrimary: boolean, isLarge: boolean, colorKey: 'blue' | 'red' }) => {

    // Styling to match the design (Blue for Funds, Red for Expenses)
    const borderColor = colorKey === 'blue' ? 'border-blue-500' : 'border-red-500';

    return (
        <div className={`bg-white p-5 rounded-lg shadow-md w-1/2 border-l-4 ${borderColor}`}>
            <p className="text-sm text-gray-600 mb-1">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    );
};


// Expense Form Modal Component 
const ExpenseFormModal = ({ show, onClose, onSave }: { show: boolean, onClose: () => void, onSave: () => void }) => {
    const [purpose, setPurpose] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    if (!show) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        // Simple validation
        if (!purpose || !amount || !date) {
            alert("Please fill out all required fields.");
            return;
        }

        setIsSaving(true);
        try {
            // Calls the merged addExpense function
            await addExpense(
                purpose, 
                parseFloat(amount), 
                new Date(date), 
                imageFile
            );

            // Cleanup
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
                <h2 className="text-xl font-bold mb-1 text-center">Expenses Details</h2>
                <p className="text-sm text-gray-500 mb-4 text-center border-b pb-4">Please fill out the form below</p>
                
                <form onSubmit={handleSave} className="space-y-4">
                    {/* Purpose */}
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
                    
                    {/* Amount */}
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
                    
                    {/* Date */}
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
                    
                    {/* Proof of expenses (Drag and Drop Area) */}
                    <div className="pt-2">
                        <label className="block text-sm font-medium mb-1">Proof of expenses</label>
                        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition cursor-pointer">
                            {imageFile ? (
                                <p className="text-sm text-green-600">File selected: {imageFile.name}</p>
                            ) : (
                                <>
                                    <p className="text-3xl">🖼️</p>
                                    <p className="text-gray-500 text-sm">Upload on image or drag and drop</p>
                                </>
                            )}
                            <input 
                                type="file" 
                                onChange={e => setImageFile(e.target.files ? e.target.files[0] : null)} 
                                className="opacity-0 absolute inset-0 cursor-pointer" 
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    
                    {/* Footer Buttons */}
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