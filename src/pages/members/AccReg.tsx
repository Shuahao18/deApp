import React, { useEffect, useState, ReactNode } from "react";
import { Search, Download, Pencil, Trash, MoreVertical, Plus, RotateCcw } from "lucide-react";
import { auth, db } from "../../Firebase"; // Assuming correct path to Firebase config
import { collection, getDocs, setDoc, doc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import html2canvas from 'html2canvas';

// --- JSDPF IMPORTS: I-COMMENT OUT PARA GAMITIN ANG require() SA LOOB NG FUNCTION ---
// import 'jspdf-autotable'; 
// import { jsPDF } from 'jspdf'; 

/* ---------------- Reusable Components (Keep as is) ---------------- */

interface BaseFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    className?: string;
    onFocus?: () => void;
    onBlur?: () => void;
}

interface FloatingInputProps extends BaseFieldProps {
    type?: string;
    right?: ReactNode;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
    id,
    label,
    required,
    value,
    onChange,
    type = "text",
    right,
    className = "",
    onFocus,
    onBlur,
}) => (
    <div className={`relative ${className}`}>
        <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder=" "
            className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none focus:border-emerald-700 transition"
        />
        {right && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                {right}
            </span>
        )}
        <label
            htmlFor={id}
            className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all 
            top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
            peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700"
        >
            {label}
            {required && <span className="text-red-600"> *</span>}
        </label>
    </div>
);

interface FloatingSelectProps extends BaseFieldProps {
    options: string[];
}

const FloatingSelect: React.FC<FloatingSelectProps> = ({
    id,
    label,
    required,
    value,
    onChange,
    options,
    className = "",
}) => (
    <div className={`relative ${className}`}>
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none 
            focus:border-emerald-700 appearance-none transition bg-white"
        >
            {options.map((opt) => (
                // Added a check for empty options which can cause issues
                <option key={opt || 'empty'} value={opt}>
                    {opt}
                </option>
            ))}
        </select>
        <label
            htmlFor={id}
            className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 top-2 text-xs"
        >
            {label}
            {required && <span className="text-red-600"> *</span>}
        </label>
    </div>
);

/* ---------------- Types and Constants ---------------- */

// Ang mga ito ay ginagamit para sa Table display
const statusColors: Record<string, string> = {
    Active: "bg-green-500 text-white",
    Inactive: "bg-red-600 text-white",
    New: "bg-yellow-400 text-black",
    Deleted: "bg-gray-400 text-white", // Ito ang status para sa soft delete
};

interface MemberData {
    id: string;
    accNo: string;
    surname: string;
    firstname: string;
    middlename?: string;
    dob?: string;
    address?: string;
    contact?: string;
    email: string;
    civilStatus?: string;
    role?: string;
    status: "Active" | "Inactive" | "New" | "Deleted"; 
    // IDAGDAG ITO PARA MA-RESOLVE ANG TS7053 ERROR (para sa dynamic key access)
    [key: string]: any; 
}

interface NewMemberForm {
    surname: string;
    firstname: string;
    middlename: string;
    dob: string;
    address: string;
    contact: string;
    email: string;
    civilStatus: string;
    role: string;
    password: string;
    confirm: string;
    status: string; // Ito ay gagamitin para sa Edit
}

// Ilagay ito DITO (bago mag-start ang AccReg component)
const COLUMN_KEYS = [
    { label: "Acc. No.", key: 'accNo' },
    { label: "Surname", key: 'surname' },
    { label: "First Name", key: 'firstname' },
    { label: "Middle Name", key: 'middlename' },
    { label: "Date of Birth", key: 'dob' },
    { label: "House Address", key: 'address' },
    { label: "Contact No.", key: 'contact' },
    { label: "Email Address", key: 'email' },
    { label: "Civil Status", key: 'civilStatus' },
    { label: "Role in HOA", key: 'role' },
    { label: "Status", key: 'status' },
    { label: "Password", key: 'password' }, 
];

const defaultForm: NewMemberForm = {
    surname: "",
    firstname: "",
    middlename: "",
    dob: "",
    address: "",
    contact: "",
    email: "",
    civilStatus: "Single",
    role: "Member",
    password: "",
    confirm: "",
    status: "New", // Default status para sa bagong gawang account
};

const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const isStrongPassword = (password: string): boolean => {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    return (
        password.length >= minLength &&
        hasUppercase &&
        hasNumber &&
        hasSpecialChar
    );
};

// Ginagamit ito para sa pag-generate ng next sequential account number
const getNextAccNo = async (): Promise<string> => {
    const membersRef = collection(db, "members");
    try {
        const q = query(membersRef, orderBy("accNo", "desc"));
        const snapshot = await getDocs(q);
        
        // Hahanapin ang pinakamalaking integer accNo.
        let maxAccNo = 0;
        
        snapshot.docs.forEach(doc => {
            const accNo = doc.data().accNo;
            if (accNo) {
                // Tiyakin na num lang ang kinukuha
                const num = parseInt(accNo, 10); 
                if (!isNaN(num) && num > maxAccNo) {
                    maxAccNo = num;
                }
            }
        });

        const nextNumber = maxAccNo + 1;
        // Palitan ang 4 depende sa number of digits na kailangan
        return String(nextNumber).padStart(4, "0"); 
    } catch (error) {
        console.error("Error generating next account number:", error);
        // Fallback or unique ID on error
        return `E${Date.now().toString().slice(-4)}`; 
    }
};

/* ---------------- Main Component ---------------- */

const AccReg = () => {
    const [members, setMembers] = useState<MemberData[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<NewMemberForm>(defaultForm);
    const [currentPage, setCurrentPage] = useState(1);
    const [showPasswordInfo, setShowPasswordInfo] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active');
    
    const [isEditing, setIsEditing] = useState(false); 
    const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
    
    // STATES PARA SA PDF EXPORT:
    const [showExportModal, setShowExportModal] = useState(false); 
    const [exportFileName, setExportFileName] = useState('HOA_Members_Registry');
    const [selectedColumns, setSelectedColumns] = useState(
        COLUMN_KEYS.map(col => col.key)
    );

    const membersPerPage = 10;

    const fetchMembers = async () => {
        try {
            const membersRef = collection(db, "members");
            const snapshot = await getDocs(membersRef);

            const data = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    accNo: data.accNo || 'N/A',
                    surname: data.surname || '',
                    firstname: data.firstname || '',
                    middlename: data.middlename || '',
                    dob: data.dob || '',
                    address: data.address || '',
                    contact: data.contact || '',
                    email: data.email || '',
                    civilStatus: data.civilStatus || '',
                    role: data.role || '',
                    status: data.status as MemberData['status'] || 'New',
                };
            }) as MemberData[];

            // Ginagamit ang statusColors keys para filter out ang documents na walang status
            setMembers(data.filter((m) => m.status && statusColors[m.status])); 
        } catch (error) {
            console.error("Error fetching members:", error);
        }
    };

    useEffect(() => {
        fetchMembers();
    }, []);
    
    // --- FILTERS/PAGINATION ---
    const filteredMembers = members
        .filter(member => {
            const targetStatus = viewMode === 'active' ? 'Deleted' : '';
            return viewMode === 'active' ? member.status !== targetStatus : member.status === 'Deleted';
        })
        .filter(member =>
            member.firstname.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.surname.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.accNo.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const activeCount = members.filter(m => m.status !== 'Deleted').length;
    const deletedCount = members.filter(m => m.status === 'Deleted').length;
    
    const totalPages = Math.ceil(filteredMembers.length / membersPerPage);
    const startIndex = (currentPage - 1) * membersPerPage;
    const currentMembers = filteredMembers.slice(startIndex, startIndex + membersPerPage);

    // --- SOFT DELETE FUNCTION ---
    const handleDeleteMember = async (memberId: string, memberName: string) => {
        if (
            !window.confirm(
                `Are you sure you want to soft-delete the account for ${memberName}? \n\nThis will mark the account as 'Deleted' and remove it from the main list, but their historical data will be preserved and can be restored.`
            )
        ) {
            return;
        }

        try {
            const memberRef = doc(db, "members", memberId);
            await updateDoc(memberRef, {
                status: "Deleted", 
            });

            alert(`${memberName}'s account has been successfully marked as Deleted.`);
            fetchMembers();
        } catch (error) {
            console.error("Error soft-deleting member:", error);
            alert("Failed to soft-delete account. Check console and Firebase Security Rules. (Permissions Issue)");
        }
    };

    // --- RESTORE FUNCTION ---
    const handleRestoreMember = async (memberId: string, memberName: string) => {
        if (
            !window.confirm(
                `Are you sure you want to RESTORE the account for ${memberName}?`
            )
        ) {
            return;
        }

        try {
            const memberRef = doc(db, "members", memberId);
            await updateDoc(memberRef, {
                status: "Active", 
            });

            alert(`${memberName}'s account has been successfully Restored.`);
            fetchMembers();
            setCurrentPage(1);
            setViewMode('active');
        } catch (error) {
            console.error("Error restoring member:", error);
            alert("Failed to restore account. Check console and Firebase Security Rules. (Permissions Issue)");
        }
    };
    
    // --- EDIT HANDLERS (Same as before) ---

    const handleEditClick = (member: MemberData) => {
        setForm({
            surname: member.surname || '',
            firstname: member.firstname || '',
            middlename: member.middlename || '',
            dob: member.dob || '',
            address: member.address || '',
            contact: member.contact || '',
            email: member.email || '',
            civilStatus: member.civilStatus || 'Single',
            role: member.role || 'Member',
            password: '', 
            confirm: '', 
            status: member.status,
        } as NewMemberForm); 

        setCurrentMemberId(member.id);
        setIsEditing(true);
        setShowModal(true);
        setErrorMessage(null);
        setShowPasswordInfo(false); 
    };

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!currentMemberId) {
            setErrorMessage("Error: No member selected for update.");
            return;
        }

        const memberData = {
            surname: form.surname,
            firstname: form.firstname,
            middlename: form.middlename,
            dob: form.dob,
            address: form.address,
            contact: form.contact,
            email: form.email,
            civilStatus: form.civilStatus,
            role: form.role,
            status: form.status, 
        };

        try {
            const memberRef = doc(db, "members", currentMemberId);
            await updateDoc(memberRef, memberData);
            
            const accNo = members.find(m => m.id === currentMemberId)?.accNo;

            if (form.role === "Admin") {
                await setDoc(doc(db, "admin", currentMemberId), { ...memberData, accNo }, { merge: true });
            } else if (form.role === "Officer") {
                await setDoc(doc(db, "elected_officials", currentMemberId), { ...memberData, accNo }, { merge: true });
            }
            
            alert(`Account for ${form.firstname} ${form.surname} updated successfully!`);
            setShowModal(false);
            setIsEditing(false);
            setCurrentMemberId(null);
            setForm(defaultForm);
            fetchMembers();
        } catch (err: any) {
            console.error("Error updating member:", err);
            setErrorMessage(err.message || "Failed to update account. Check console and Security Rules.");
        }
    };
    
    // --- CREATE HANDLER (Same as before) ---
    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (form.password !== form.confirm) {
            setShowPasswordInfo(true);
            setErrorMessage("Passwords do not match! Please check and try again.");
            return;
        }

        if (!isStrongPassword(form.password)) {
            setShowPasswordInfo(true);
            setErrorMessage(
                "Password is not strong enough. It must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character."
            );
            return;
        }

        if (!isValidEmail(form.email)) {
            setErrorMessage(
                "Please enter a valid and acceptable email address (e.g., user@domain.com)."
            );
            return;
        }

        try {
            const newAccNo = await getNextAccNo();

            // STEP 1: Create user in Firebase Auth
            const userCred = await createUserWithEmailAndPassword(
                auth,
                form.email,
                form.password
            );
            const uid = userCred.user.uid;

            const memberData = {
                surname: form.surname,
                firstname: form.firstname,
                middlename: form.middlename,
                dob: form.dob,
                address: form.address,
                contact: form.contact,
                email: form.email,
                civilStatus: form.civilStatus,
                role: form.role,
                status: form.status || "New",
                accNo: newAccNo,
            };

            // STEP 2: PRIMARY SAVE 
            await setDoc(doc(db, "members", uid), memberData);

            // STEP 3: SECONDARY SAVE 
            if (form.role === "Admin") {
                await setDoc(doc(db, "admin", uid), memberData);
            } else if (form.role === "Officer") {
                await setDoc(doc(db, "elected_officials", uid), memberData);
            }
            
            // --- Success and Cleanup ---
            alert(`Account created successfully! Role: ${form.role} Account No: ${newAccNo} 🎉`);
            setShowModal(false);
            setForm(defaultForm);
            setShowPasswordInfo(false);
            fetchMembers();
            setViewMode('active');
        } catch (err: any) {
            console.error(err);
            let errorText = "An unknown error occurred.";
            if (err.code === 'auth/email-already-in-use') {
                errorText = "Error: The email address is already in use by another account.";
            } else if (err.code === 'auth/invalid-email') {
                errorText = "Error: The email address is not valid.";
            } else if (err.message) {
                errorText = err.message;
            }
            setErrorMessage(errorText);
            setShowPasswordInfo(true);
        }
    };
    
    // --- PDF EXPORT LOGIC FUNCTIONS ---
    
    // Function 1: I-toggle ang isang column
    const handleToggleColumn = (key: string) => {
        setSelectedColumns(prev => 
            prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
        );
    };

    // Function 2: Select All / Deselect All
    const handleToggleAllColumns = () => {
        const totalColumns = COLUMN_KEYS.length; 
        
        if (selectedColumns.length === totalColumns) {
            setSelectedColumns([]); // Deselect All
        } else {
            setSelectedColumns(COLUMN_KEYS.map(col => col.key)); // Select All
        }
    };

    // Function 3: Ang Pinalitan na handleExportPDF (FINAL VERSION - using require)
    const handleExportPDF = () => {
        setShowExportModal(false);

        // Filter members based on the current view mode/search query
        const dataToExport = filteredMembers; // Gamitin ang pre-filtered data
        
        if (dataToExport.length === 0) {
            alert('No data to export based on current filter/view mode!');
            return;
        }

        // --- PINAKA-FINAL FIX PARA SA 'doc.autoTable is not a function' ---
        // Piliting i-require ang autotable plugin bago i-initialize ang jsPDF.
        try {
            // Gumamit ng klasiko at "unsafe" require para pilitin ang side effect
            (window as any).jspdf = require('jspdf');
            require('jspdf-autotable');
        } catch (e) {
            // Fallback: Ito ang logic na ginamit natin kanina
            require('jspdf-autotable');
        }
        
        // I-require ang jsPDF object mula sa core library
        const { jsPDF } = require('jspdf');
        const doc = new jsPDF('landscape'); 
        // ----------------------------------------------------


        // 1. I-FILTER ang COLUMN_KEYS gamit ang selectedColumns state!
        const columns = COLUMN_KEYS.filter(col => selectedColumns.includes(col.key));
        const headers = columns.map(col => col.label);

        // 2. I-MAP ang data para sa autoTable
        const body = dataToExport.map((member, index) => {
            const row = [];
            row.push(index + 1); // Row Number

            // Kunin lang ang value ng MGA NAPILING COLUMN
            columns.forEach(col => {
                // Gumamit ng (member as any) para ma-access ang dynamic key (col.key)
                let value = (member as any)[col.key] || ''; 
                if (col.key === 'password') {
                    value = '********'; // Mask
                }
                row.push(value);
            });
            return row;
        });

        headers.unshift('No.'); // Idagdag ang 'No.' sa Headers
        
        // 4. Tawagin ang autoTable (Gamit ang Type Assertion)
        (doc as any).autoTable({
            head: [headers],
            body: body,
            startY: 20,
            theme: 'striped',
            headStyles: { fillColor: [30, 64, 52] },
            styles: { fontSize: 8 },
            // Manual Type Assertion para sa data parameter (didDrawPage)
            didDrawPage: function (data: { pageNumber: number, settings: any, table: any }) { 
                // Header
                doc.setFontSize(14);
                doc.setTextColor(40);
                doc.text(`Account Registry - ${viewMode === 'active' ? 'Active Accounts' : 'Deleted Accounts'}`, 14, 15);
                
                // Footer (Pilitin din ang paggamit ng internal method)
                doc.setFontSize(8);
                const pageCount = (doc.internal as any).getNumberOfPages();
                doc.text(`Page ${data.pageNumber} of ${pageCount}`, data.settings.margin.left, (doc.internal as any).pageSize.height - 10);
            }
        });

        // 5. Save the PDF
        doc.save(`${exportFileName}.pdf`);
    };

    // --- JSX RENDER ---
    return (
        <div className="">
            {/* Header and Search */}
             <div className="bg-teader h-20  flex justify-between items-center px-8">
                <h1 className="text-3xl font-bold text-white">
                    Account Registry ({viewMode === 'active' ? 'Active Accounts' : 'Deleted Accounts'})
                </h1>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-emerald-700"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    </div>
                    {/* EXPORT BUTTON: Tumatawag sa setShowExportModal */}
                    <button 
                        onClick={() => setShowExportModal(true)} 
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-600 
                        border border-emerald-700 rounded-full hover:bg-emerald-700" 
                        title="Export Data"
                    >
                        <Download size={16} /> Export
                    </button>
                    <button
                        onClick={() => {
                            setForm(defaultForm);
                            setIsEditing(false);
                            setShowModal(true);
                            setErrorMessage(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-700 rounded-full hover:bg-emerald-800"
                    >
                        <Plus size={16} /> Create Acc.
                    </button>
                </div>
            </div>
            
            {/* View Mode Tabs */}
            <div className="flex space-x-4 mb-6 border-b border-gray-200">
                <button
                    onClick={() => { setViewMode('active'); setCurrentPage(1); }}
                    className={`py-2 px-4 font-medium transition-colors ${
                        viewMode === 'active' ? 'text-emerald-700 border-b-2 border-emerald-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Active Accounts ({activeCount})
                </button>
                <button
                    onClick={() => { setViewMode('deleted'); setCurrentPage(1); }}
                    className={`py-2 px-4 font-medium transition-colors ${
                        viewMode === 'deleted' ? 'text-emerald-700 border-b-2 border-emerald-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Deleted Accounts ({deletedCount})
                </button>
            </div>


            {/* Table */}
            <div id="members-table-container" className="overflow-x-auto bg-white rounded-lg shadow-md">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-object text-white">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">No.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Acc. No.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Surname</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">First Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Middle Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date of Birth</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Address</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Contact No.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Email Address</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Civil Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Role in HOA</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Password</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {currentMembers.length > 0 ? (
                            currentMembers.map((member, index) => (
                                <tr key={member.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {startIndex + index + 1}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {member.accNo}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm  text-gray-900">
                                        {member.surname}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.firstname}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.middlename || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.dob || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.address || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.contact || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.email}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.civilStatus || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {member.role || 'Member'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ********
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[member.status]}`}
                                        >
                                            {member.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                        {viewMode === 'active' ? (
                                            <div className="flex items-center justify-center space-x-2">
                                                <button
                                                    onClick={() => handleEditClick(member)}
                                                    className="text-emerald-600 hover:text-emerald-900"
                                                    title="Edit Account"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteMember(member.id, `${member.firstname} ${member.surname}`)}
                                                    className="text-red-600 hover:text-red-900"
                                                    title="Soft Delete Account"
                                                >
                                                    <Trash size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleRestoreMember(member.id, `${member.firstname} ${member.surname}`)}
                                                className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                                                title="Restore Account"
                                            >
                                                <RotateCcw size={18} /> Restore
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={14} className="px-6 py-4 text-center text-gray-500">
                                    {viewMode === 'active' ? 'No active accounts found.' : 'No deleted accounts found.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
                <span className="text-sm text-gray-700">
                    Showing {Math.min(startIndex + 1, filteredMembers.length)} to {Math.min(startIndex + membersPerPage, filteredMembers.length)} of {filteredMembers.length} entries
                </span>
                <div className="flex space-x-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-sm font-medium text-gray-700">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || filteredMembers.length === 0}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* --- CREATE/EDIT MODAL --- */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 w-full max-w-2xl">
                        <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
                            {isEditing ? `Edit Account: ${form.firstname} ${form.surname}` : "Create New Account"}
                        </h2>
                        <form onSubmit={isEditing ? handleUpdateAccount : handleCreateAccount}>
                            {errorMessage && (
                                <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                                    {errorMessage}
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <FloatingInput id="surname" label="Surname" required value={form.surname} onChange={(v) => setForm({ ...form, surname: v })} />
                                <FloatingInput id="firstname" label="First Name" required value={form.firstname} onChange={(v) => setForm({ ...form, firstname: v })} />
                                <FloatingInput id="middlename" label="Middle Name" value={form.middlename} onChange={(v) => setForm({ ...form, middlename: v })} />
                                <FloatingInput id="dob" label="Date of Birth (YYYY-MM-DD)" value={form.dob} onChange={(v) => setForm({ ...form, dob: v })} />
                                <FloatingInput id="address" label="House Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
                                <FloatingInput id="contact" label="Contact No." value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} />
                                <FloatingInput id="email" label="Email Address" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
                                <FloatingSelect
                                    id="civilStatus"
                                    label="Civil Status"
                                    required
                                    value={form.civilStatus}
                                    onChange={(v) => setForm({ ...form, civilStatus: v })}
                                    options={["Single", "Married", "Divorced", "Widowed"]}
                                />
                                <FloatingSelect
                                    id="role"
                                    label="Role in HOA"
                                    required
                                    value={form.role}
                                    onChange={(v) => setForm({ ...form, role: v })}
                                    options={["Member", "Officer", "Admin"]}
                                />
                                {isEditing && (
                                    <FloatingSelect
                                        id="status"
                                        label="Status"
                                        required
                                        value={form.status}
                                        onChange={(v) => setForm({ ...form, status: v })}
                                        options={["Active", "Inactive", "New", "Deleted"]}
                                    />
                                )}
                                {!isEditing && (
                                    <>
                                        <FloatingInput
                                            id="password"
                                            label="Password"
                                            required
                                            value={form.password}
                                            onChange={(v) => setForm({ ...form, password: v })}
                                            type="password"
                                            onFocus={() => setShowPasswordInfo(true)}
                                            onBlur={() => setShowPasswordInfo(false)}
                                        />
                                        <FloatingInput
                                            id="confirm"
                                            label="Confirm Password"
                                            required
                                            value={form.confirm}
                                            onChange={(v) => setForm({ ...form, confirm: v })}
                                            type="password"
                                        />
                                    </>
                                )}
                            </div>

                            {showPasswordInfo && !isEditing && (
                                <p className="mt-3 text-xs text-gray-600 p-2 bg-yellow-50 rounded">
                                    Password must be 8+ chars, with an uppercase letter, a number, and a special character.
                                </p>
                            )}
                            
                            <div className="flex justify-end gap-3 mt-8">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-md text-sm hover:bg-gray-200"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800"
                                >
                                    {isEditing ? "Update Account" : "Create Account"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* --- PDF EXPORT MODAL (Dynamic Column Selection) --- */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 w-full max-w-lg">
                        <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
                            Export to PDF
                        </h2>
                        <div className="space-y-4">
                            {/* File Name Input */}
                            <FloatingInput 
                                id="file-name" 
                                label="File Name" 
                                required 
                                value={exportFileName} 
                                // Gumagamit ng setExportFileName state function
                                onChange={setExportFileName} 
                                className="mb-6"
                            />
                            
                            <h3 className="font-medium text-gray-700">Columns to Include</h3>
                            
                            {/* DYNAMIC CHECKBOX GRID */}
                            <div className="grid grid-cols-3 gap-2 text-sm max-h-60 overflow-y-auto p-2 border rounded">
                                {COLUMN_KEYS.map(col => (
                                    <div key={col.key} className="flex items-center">
                                        <input 
                                            type="checkbox" 
                                            id={`col-${col.key}`} 
                                            name="columns" 
                                            // Tinitingnan kung kasama sa selectedColumns state
                                            checked={selectedColumns.includes(col.key)}
                                            // Tumatawag sa handleToggleColumn function
                                            onChange={() => handleToggleColumn(col.key)}
                                            className="mr-2 text-emerald-600 focus:ring-emerald-500" 
                                        />
                                        <label htmlFor={`col-${col.key}`} className="truncate">{col.label}</label>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="flex justify-end">
                                <button 
                                    className="text-sm text-blue-600 hover:text-blue-800" 
                                    onClick={handleToggleAllColumns} // Select All/Deselect All
                                    type="button"
                                >
                                    {selectedColumns.length === COLUMN_KEYS.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md text-sm hover:bg-gray-200"
                                onClick={() => setShowExportModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800"
                                onClick={handleExportPDF} 
                                // I-disable kung walang naka-check
                                disabled={selectedColumns.length === 0} 
                            >
                                Export and Save to device
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default AccReg;