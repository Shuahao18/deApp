import React, { useEffect, useState, useMemo } from "react";
import { FiPlus, FiChevronLeft, FiChevronRight, FiDownload, FiRefreshCw } from "react-icons/fi";
// 💡 I-ASSUME NA TAMA ANG PATH MO DITO:
import { db, storage } from "../Firebase"; 
import { collection, query, where, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- TYPES ---
type ContributionRecord = {
  id: string;
  accNo: string;
  name: string;
  amount: number;
  recipient: string;
  transactionDate: Timestamp;
  proofURL: string;
};

type ContributionSummary = {
  totalFunds: number; // Total Funds for the *Current Year*
  totalMembers: number;
  paidMembers: number;
  unpaidMembers: number;
  contributionAmount: number; // The standard monthly fee (P 30.00)
};

// --- HELPER FUNCTIONS ---
const fetchTotalMembers = async (): Promise<number> => {
    // NOTE: Only counts members where status is not 'Deleted' (Active Members)
    try {
        const membersSnapshot = await getDocs(
            query(collection(db, "members"), where("status", "!=", "Deleted"))
        );
        return membersSnapshot.docs.length;
    } catch (error) {
        console.error("Error fetching total members:", error);
        return 0; // Fallback to 0 or handle error appropriately
    }
};

const formatMonthYear = (date: Date) => {
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};


// ----------------------------------------------------
// --- SEPARATE COMPONENTS ---
// ----------------------------------------------------

/**
 * Reusable Stat Box component for dashboard summaries.
 */
const StatBox = ({ title, value, isPrimary, isRed, isLarge, isMinimal }: 
    { title: string, value: string, isPrimary: boolean, isRed?: boolean, isLarge?: boolean, isMinimal?: boolean }) => {

    const colorClass = isRed 
        ? "bg-red-100 text-red-700" 
        : isPrimary 
          ? "bg-[#125648] text-white" 
          : "bg-gray-100 text-gray-800"; 

    const sizeClass = isLarge ? "p-5 rounded-lg shadow-lg w-1/3" : "p-0";
    const titleSize = isLarge ? "text-sm font-medium uppercase opacity-90" : "text-sm text-gray-600";
    const valueSize = isLarge ? "text-3xl font-bold mt-1" : isRed ? "text-xl font-bold text-red-700" : "text-xl font-bold text-gray-900";
    
    if (isMinimal) {
        return (
            <div className="flex flex-col">
                <div className={`${titleSize}`}>{title}</div>
                <div className={`${valueSize}`}>{value}</div>
            </div>
        );
    }
          
    return (
        <div className={`rounded-lg transition duration-150 ${sizeClass} ${colorClass}`}>
            <div className={titleSize}>{title}</div>
            <div className={`${valueSize} ${isPrimary ? 'text-white' : 'text-gray-900'}`}>{value}</div>
        </div>
    );
};


/**
 * Modal for adding a new contribution payment.
 */
const AddPaymentModal = ({ show, onClose, onSave, monthYear }: { show: boolean, onClose: () => void, onSave: () => void, monthYear: string }) => {
    const [formData, setFormData] = useState({
        accNo: '',
        name: '', 
        amount: 30.00,
        paymentMethod: 'Cash Payment',
        recipient: '',
        transactionDate: new Date().toISOString().substring(0, 10), // Default to today in YYYY-MM-DD format
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [memberError, setMemberError] = useState(''); 

    // Function to lookup member details in Firestore (Debounced logic omitted for brevity, but functional)
    const fetchMemberDetails = async (accNo: string) => {
        if (accNo.length < 3) { 
            setFormData(prev => ({ ...prev, name: '' }));
            setMemberError('');
            return;
        }

        setIsSearching(true);
        setMemberError('');
        try {
            const membersRef = collection(db, "members");
            const q = query(
                membersRef, 
                where("accNo", "==", accNo),
                where("status", "!=", "Deleted") 
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setMemberError(`Account No. ${accNo} not found or is inactive/deleted.`);
                setFormData(prev => ({ ...prev, name: '' }));
            } else {
                const memberData = querySnapshot.docs[0].data();
                const fullName = [
                    memberData.surname,
                    memberData.firstname,
                    memberData.middlename,
                ].filter(Boolean).join(' ');
                
                setFormData(prev => ({ 
                    ...prev, 
                    name: fullName || 'N/A', 
                    amount: memberData.default_dues || 30.00 
                }));
                setMemberError('');
            }
        } catch (error) {
            console.error("Error searching member:", error);
            setMemberError("An error occurred during lookup.");
        } finally {
            setIsSearching(false);
        }
    };

    // Debounce effect for automatic lookup when accNo changes
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchMemberDetails(formData.accNo);
        }, 500); 

        return () => {
            clearTimeout(handler);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.accNo]);


    if (!show) return null;

    const handleSave = async () => {
        // Validation check
        if (memberError || !formData.name || isSearching) {
             alert("Please enter a valid Account No. and ensure the Member Name is found.");
             return;
        }
        if (!formData.amount || !formData.recipient || !formData.transactionDate) {
             alert("Please fill in all required payment details.");
             return;
        }

        setIsSaving(true);
        let proofURL = '';

        try {
            // 1. Upload Image to Firebase Storage
            if (imageFile) {
                const storageRef = ref(storage, `contributions/${formData.accNo}/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                proofURL = await getDownloadURL(storageRef);
            }

            // 2. Save Data to Firestore 
            const dateToSave = new Date(formData.transactionDate);
            
            await addDoc(collection(db, "contributions"), {
                accNo: formData.accNo, 
                name: formData.name,
                amount: parseFloat(formData.amount.toString()),
                paymentMethod: formData.paymentMethod,
                recipient: formData.recipient,
                monthYear: monthYear, 
                transactionDate: Timestamp.fromDate(dateToSave),
                proofURL: proofURL, 
            });

            // 3. Cleanup and Refresh
            onSave();
            setFormData({
                accNo: '',
                name: '',
                amount: 30.00,
                paymentMethod: 'Cash Payment',
                recipient: '',
                transactionDate: new Date().toISOString().substring(0, 10),
            });
            setImageFile(null);
            setMemberError('');
            
        } catch (error) {
            console.error("Error saving contribution:", error);
            alert("Failed to save payment. Please check console for details.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
                <h2 className="text-xl font-bold mb-4 border-b pb-2">Payment Details Form</h2>
                <p className="text-sm text-gray-500 mb-4">Please fill out the form below to complete the transaction.</p>
                
                {/* Form Fields */}
                <div className="space-y-4">
                    {/* Account Number Lookup Field */}
                    <div>
                        <label className="block text-sm font-medium">Account Number</label>
                        <input 
                            type="text" 
                            value={formData.accNo} 
                            onChange={e => setFormData({...formData, accNo: e.target.value})} 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
                            placeholder="Enter member's account number"
                            disabled={isSaving}
                        />
                         {memberError && <p className="text-xs text-red-600 mt-1">{memberError}</p>}
                         {isSearching && (
                            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                <FiRefreshCw className="animate-spin w-3 h-3"/> Searching for member...
                            </p>
                           )}
                    </div>

                    {/* Member Name (Auto-populated/Read-only) */}
                    <div>
                        <label className="block text-sm font-medium">Member Name</label>
                        <input 
                            type="text" 
                            value={formData.name} 
                            readOnly 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-gray-100 focus:outline-none" 
                            placeholder={formData.name || (memberError ? 'Name not found' : 'Awaiting account number...')}
                            disabled={true}
                        />
                    </div>

                    {/* Recipient Name (Collector) */}
                    <div>
                        <label className="block text-sm font-medium">Name of Recipient</label>
                        <input 
                            type="text" 
                            value={formData.recipient} 
                            onChange={e => setFormData({...formData, recipient: e.target.value})} 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
                            placeholder="Enter recipient's name"
                            disabled={isSaving}
                        />
                    </div>
                    
                    {/* Date and Payment Method Row */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Transaction Date */}
                        <div>
                            <label className="block text-sm font-medium">Date of Transaction</label>
                            <input 
                                type="date" 
                                value={formData.transactionDate} 
                                onChange={e => setFormData({...formData, transactionDate: e.target.value})} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-white focus:ring-[#125648] focus:border-[#125648]"
                                disabled={isSaving}
                            />
                        </div>
                        {/* Amount */}
                        <div>
                            <label className="block text-sm font-medium">Amount of Payment</label>
                            <input 
                                type="number" 
                                value={formData.amount} 
                                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value) || 0})} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]" 
                                placeholder="Enter the payment value"
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    
                    {/* Proof of Payment (Drag and Drop Area) */}
                    <div className="border-t pt-4">
                        <label className="block text-sm font-medium mb-1">Proof of Payment (Optional)</label>
                        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition cursor-pointer">
                            {imageFile ? (
                                <p className="text-sm text-green-600">File selected: {imageFile.name}</p>
                            ) : (
                                <p className="text-gray-500">Upload an image or drag and drop</p>
                            )}
                            <input 
                                type="file" 
                                onChange={e => setImageFile(e.target.files ? e.target.files[0] : null)} 
                                className="opacity-0 absolute inset-0 cursor-pointer" 
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    
                </div>
                
                {/* Footer Buttons */}
                <div className="mt-6 pt-4 border-t flex justify-end gap-3">
                    <button onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300" disabled={isSaving}>
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving || memberError !== '' || !formData.name || isSearching} 
                        className="bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
                    >
                        {isSaving ? "Submitting..." : "Submit Payment"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ----------------------------------------------------
// --- MAIN COMPONENT ---
// ----------------------------------------------------

export default function Contribution() {
  const [currentMonth, setCurrentMonth] = useState(new Date('2025-06-01')); // June 2025
  const [records, setRecords] = useState<ContributionRecord[]>([]);
  const [summary, setSummary] = useState<ContributionSummary>({
    totalFunds: 0, 
    totalMembers: 0, 
    paidMembers: 0, 
    unpaidMembers: 0, 
    contributionAmount: 30, // P 30.00
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // --- Functions to Handle Data ---
  const fetchContributionData = async (month: Date) => {
    setIsLoading(true);
    const monthYearString = formatMonthYear(month);
    const currentYear = month.getFullYear();
    
    // Define the start and end of the current fiscal year (Jan 1 to Dec 31)
    const startOfYear = Timestamp.fromDate(new Date(currentYear, 0, 1)); // Jan 1st
    const endOfYear = Timestamp.fromDate(new Date(currentYear + 1, 0, 1)); // Jan 1st of next year (exclusive)

    try {
      const totalMembers = await fetchTotalMembers();

      // 1. Query all records for the *Current Year* for Total Funds calculation
      const yearQuery = query(
        collection(db, "contributions"),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );
      const yearSnapshot = await getDocs(yearQuery);
      
      const totalFundsOfYear = yearSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);


      // 2. Query records for the *Selected Month* for the table and summary stats
      const monthQuery = query(
        collection(db, "contributions"),
        where("monthYear", "==", monthYearString)
      );
      const monthQuerySnapshot = await getDocs(monthQuery);

      const contributionList: ContributionRecord[] = monthQuerySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          accNo: data.accNo, 
          name: data.name,   
          amount: data.amount,
          recipient: data.recipient,
          transactionDate: data.transactionDate as Timestamp,
          proofURL: data.proofURL,
        };
      });

      // Tally Totals for the Current Month (counting unique members)
      const paidMembers = new Set(contributionList.map(r => r.accNo)).size;
      const unpaidMembers = Math.max(0, totalMembers - paidMembers);
      
      setRecords(contributionList);
      setSummary(prev => ({
        ...prev,
        totalFunds: totalFundsOfYear, 
        paidMembers,
        unpaidMembers,
        totalMembers,
      }));

    } catch (error) {
      console.error("Error fetching contributions:", error);
      // Optionally set a user-visible error here
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContributionData(currentMonth);
  }, [currentMonth]);

  // --- UI Handlers ---
  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getTime());
      newMonth.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newMonth;
    });
  };

  const currentMonthDisplay = useMemo(() => formatMonthYear(currentMonth), [currentMonth]);
  // Sum of payments FOR THE CURRENT MONTH
  const totalFundsDisplay = records.reduce((sum, r) => sum + r.amount, 0).toFixed(2);
  
  // --- Rendering ---
  
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-gray-800">Contribution Dashboard</h1>
      </div>

      <div className="bg-white shadow-xl rounded-lg p-6"> 
        
        {/* Summary Boxes */}
        <div className="flex space-x-4 mb-6 border-b pb-6">
          <StatBox 
              title={`Total Funds ${currentMonth.getFullYear()}`} 
              value={`P ${summary.totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              isPrimary={true} 
              isLarge={true} 
          /> 
          <StatBox title="Monthly Dues" value={`P ${summary.contributionAmount.toFixed(2)}`} isPrimary={false} isLarge={true} /> 
        </div>

        <div className="flex items-center space-x-12 mb-6">
            <StatBox title="Contribution this month" value={`P ${totalFundsDisplay}`} isPrimary={false} isMinimal={true} />
            <StatBox title="Total members" value={summary.totalMembers.toString()} isPrimary={false} isMinimal={true} />
            <StatBox title="Paid Members" value={summary.paidMembers.toString()} isPrimary={false} isMinimal={true} />
            <StatBox title="Unpaid Members" value={summary.unpaidMembers.toString()} isPrimary={false} isRed={true} isMinimal={true} />
        </div>
        
        {/* Controls and Export */}
        <div className="flex justify-between items-center pb-4 mb-4">
          <div className="flex items-center space-x-2 border rounded-lg overflow-hidden shadow-sm">
            <button 
              onClick={() => handleMonthChange('prev')} 
              className="p-3 bg-gray-50 hover:bg-gray-100 border-r"
              aria-label="Previous Month"
            >
              <FiChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-lg font-semibold w-40 text-center text-gray-800">{currentMonthDisplay}</div>
            <button 
              onClick={() => handleMonthChange('next')} 
              className="p-3 bg-gray-50 hover:bg-gray-100 border-l"
              aria-label="Next Month"
            >
              <FiChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 shadow-sm">
              <FiDownload className="w-4 h-4" /> Export
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:bg-[#0d3d33]"
            >
              <FiPlus /> Add Payment
            </button>
          </div>
        </div>

        {/* Contribution Table */}
        <div className="overflow-x-auto border rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Acc. No.', 'Name', 'P Amount', 'Recipient', 'Transaction Date', 'Proof of Payment'].map((header) => (
                  <th key={header} className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                    <td colSpan={7} className="text-center py-6 text-gray-500">
                        <FiRefreshCw className="animate-spin inline-block mr-2 w-4 h-4 text-[#125648]"/> Loading records...
                    </td>
                </tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-gray-500">No records found for this month.</td></tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-900">{record.accNo}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">{record.name}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700 font-medium">{`P ${record.amount.toFixed(2)}`}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">{record.recipient}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                      {record.transactionDate.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-sm">
                      {record.proofURL ? (
                        <a href={record.proofURL} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          Image no. {record.id.substring(0, 4)}
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
      
      {/* Add Payment Modal */}
      <AddPaymentModal 
        show={showModal} 
        onClose={() => setShowModal(false)} 
        onSave={() => {
            setShowModal(false);
            fetchContributionData(currentMonth); // Refresh data after saving
        }}
        monthYear={currentMonthDisplay}
      />
      
    </div>
  );
}