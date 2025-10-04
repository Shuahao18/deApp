import React, { useEffect, useState, ReactNode } from "react";
import { Search, Download, Pencil, Trash, MoreVertical, Plus, RotateCcw } from "lucide-react";
import { auth, db } from "../../Firebase"; // Assuming correct path to Firebase config
import { collection, getDocs, setDoc, doc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; 

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
    // Tiyakin na ang status ay isa sa mga ito
    status: "Active" | "Inactive" | "New" | "Deleted"; 
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
        
        // Iba ang logic sa nauna. Kukunin ang last accNo sa collection.
        // Hahanapin ang pinakamalaking integer accNo.
        let maxAccNo = 0;
        
        snapshot.docs.forEach(doc => {
            const accNo = doc.data().accNo;
            if (accNo) {
                // Tiyakin na num lang ang kinukuha, at hindi string + number
                const num = parseInt(accNo, 10); 
                if (!isNaN(num) && num > maxAccNo) {
                    maxAccNo = num;
                }
            }
        });

        const nextNumber = maxAccNo + 1;
        // Palitan ang 3 depende sa number of digits na kailangan
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
    
    // State for the PDF Export Modal (based on the image you provided)
    const [showExportModal, setShowExportModal] = useState(false); 
    const [selectedColumns, setSelectedColumns] = useState(
    COLUMN_KEYS.map(col => col.key) // Dito nagtatapos ang useState
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
                status: "Deleted", // 👈 Tiyakin na "Deleted" ang value na ginamit
            });

            alert(`${memberName}'s account has been successfully marked as Deleted.`);
            fetchMembers();
        } catch (error) {
            console.error("Error soft-deleting member:", error);
            // Sa puntong ito, ang error ay laging permissions.
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
                status: "Active", // 👈 Iba-balik sa "Active"
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
    
    // --- EDIT HANDLERS ---

    const handleEditClick = (member: MemberData) => {
        // Set form state from the member data (excluding password/confirm)
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
            status: member.status, // Kasama ang current status sa form para ma-edit
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

        // Collect ALL fields for Admin/Officer update (ito ang dapat na allowed ng isPrivileged() rules)
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
            status: form.status, // Kasama ang status sa update (critical)
        };

        try {
            const memberRef = doc(db, "members", currentMemberId);
            await updateDoc(memberRef, memberData);
            
            // Kuhanin ang existing accNo, dahil hindi ito kasama sa form
            const accNo = members.find(m => m.id === currentMemberId)?.accNo;

            // Update secondary collections
            if (form.role === "Admin") {
                await setDoc(doc(db, "admin", currentMemberId), { ...memberData, accNo }, { merge: true });
            } else if (form.role === "Officer") {
                await setDoc(doc(db, "elected_officials", currentMemberId), { ...memberData, accNo }, { merge: true });
            } else {
                 // Remove from secondary collections if role is reduced to Member
                 // Tiyakin lang na walang security rule error dito (optional: add delete logic if needed)
            }
            
            alert(`Account for ${form.firstname} ${form.surname} updated successfully!`);
            setShowModal(false);
            setIsEditing(false);
            setCurrentMemberId(null);
            setForm(defaultForm);
            fetchMembers(); // Re-fetch data
        } catch (err: any) {
            console.error("Error updating member:", err);
            setErrorMessage(err.message || "Failed to update account. Check console and Security Rules.");
        }
    };
    
    // --- CREATE HANDLER ---
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
                status: form.status || "New", // 👈 Tiyakin na "New" ang status
                accNo: newAccNo,
            };

            // STEP 2: PRIMARY SAVE (SA MEMBERS collection, using Auth UID as Document ID)
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
    
    // --- PDF EXPORT LOGIC ---
    // Define a type for the elements we are storing
interface HiddenElement {
    element: HTMLElement;
    originalDisplay: string;
} 


const handleExportPDF = async () => {
    // Tiyakin na ang container ng inyong table ay may id="members-table-container"
    const input = document.getElementById('members-table-container');

    if (!input) {
        alert('Error: Table element not found for PDF export.');
        return;
    }

    const table = input.querySelector('table');
    if (!table) {
        alert('Error: Table element not found for PDF export.');
        return;
    }
    
    // Ang mga columns na itatago (1-based index):
    const columnsToHide = [12, 14]; 
    
    // Explicitly define the type of hideStyles as the interface we created
    const hideStyles: HiddenElement[] = []; 

    // Temporary hiding the columns
    try {
        columnsToHide.forEach(index => {
            // Itago ang header (th)
            // Use 'querySelector' at i-cast sa 'HTMLTableCellElement' o 'HTMLElement'
            const th = table.querySelector(`thead tr th:nth-child(${index})`) as HTMLTableCellElement | null;
            if (th) {
                hideStyles.push({ 
                    element: th, 
                    originalDisplay: th.style.display 
                });
                th.style.display = 'none';
            }

            // Itago ang lahat ng body cells (td)
            const tds = table.querySelectorAll(`tbody tr td:nth-child(${index})`);
            tds.forEach(element => {
                // Type-cast the generic Element to an HTMLElement
                const td = element as HTMLTableCellElement;
                if (td) {
                    hideStyles.push({ 
                        element: td, 
                        originalDisplay: td.style.display 
                    });
                    td.style.display = 'none';
                }
            });
        });

        // Capture the table content
        const canvas = await html2canvas(input, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        
        // Generate the PDF (Multi-page logic remains the same)
        const pdf = new jsPDF('l', 'mm', 'a4'); 
        const imgWidth = 297; 
        const pageHeight = 210; 
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        pdf.save('HOA_Members_Registry.pdf');
        
    } catch (error) {
        console.error("PDF Export Error:", error);
        alert("Failed to export PDF. Check console for details.");
    } finally {
        // ALWAYS restore the hidden columns
        hideStyles.forEach(({ element, originalDisplay }) => {
            element.style.display = originalDisplay;
        });
    }
};
    // --- Filtering and Pagination Logic ---
    const activeMembers = members.filter(m => m.status !== 'Deleted');
    const deletedMembers = members.filter(m => m.status === 'Deleted');
    const membersToFilter = viewMode === 'active' ? activeMembers : deletedMembers;

    const filteredMembers = membersToFilter.filter((m) => {
        const q = searchQuery.toLowerCase();
        // The optional chaining (?.) helps prevent runtime errors if a field is null/undefined
        return (
            m.surname?.toLowerCase().includes(q) ||
            m.firstname?.toLowerCase().includes(q) ||
            m.middlename?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.contact?.toLowerCase().includes(q) ||
            m.accNo?.toLowerCase().includes(q) ||
            m.address?.toLowerCase().includes(q)
        );
    });

    // Ensure we start from page 1 if the filter changes significantly
    useEffect(() => {
        if (currentPage > Math.ceil(filteredMembers.length / membersPerPage) && filteredMembers.length > 0) {
            setCurrentPage(1);
        }
    }, [searchQuery, viewMode]);

    const currentMembers = filteredMembers.slice(
        (currentPage - 1) * membersPerPage,
        currentPage * membersPerPage
    );

    const totalPages = Math.ceil(filteredMembers.length / membersPerPage);


    return (
        <div className="bg-white rounded-lg shadow-md">
            {/* Header (Changed bg-teader to a placeholder background) */}
            <div className="bg-emerald-800 h-20 flex justify-between items-center px-8">
                <h1 className="text-3xl font-extrabold text-white">
                    Account Registry
                    <span className="text-xl ml-3 font-normal">
                        ({viewMode === 'active' ? 'Active Accounts' : 'Deleted Accounts'})
                    </span>
                </h1>
                <div className="flex items-center gap-4">
                    <div className="flex items-center relative">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="pl-10 pr-4 py-2 border rounded-full text-sm focus:outline-none 
                            focus:ring-2 focus:ring-emerald-500 w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Search size={16} className="absolute left-3 text-gray-400" />
                    </div>
                    <button 
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-600 
                        border border-emerald-700 rounded-full hover:bg-emerald-700" 
                        title="Export Data"
                    >
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>
            
            {/* Table Container with ID for PDF Export */}
            <div id="members-table-container" className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                    {/* Assuming bg-object is a dark color for the table header, using a dark gray */}
                    <thead className="bg-gray-800 text-white"> 
                        <tr>
                            {[
                                "No.", "Acc. No.", "Surname", "First Name", "Middle Name", "Date of Birth",
                                "Address", "Contact No.", "Email Address", "Civil Status", "Role in HOA",
                                "Password", "Status", "Actions",
                            ].map((h) => (
                                <th key={h} className="p-3 text-left border-b border-gray-600 whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {currentMembers.length > 0 ? (
                            currentMembers.map((m, i) => (
                                <tr key={m.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3">{(currentPage - 1) * membersPerPage + i + 1}</td>
                                    <td className="p-3 whitespace-nowrap">{m.accNo}</td>
                                    <td className="p-3 whitespace-nowrap">{m.surname}</td>
                                    <td className="p-3 whitespace-nowrap">{m.firstname}</td>
                                    <td className="p-3 whitespace-nowrap">{m.middlename}</td>
                                    <td className="p-3 whitespace-nowrap">{m.dob}</td>
                                    <td className="p-3">{m.address}</td>
                                    <td className="p-3 whitespace-nowrap">{m.contact}</td>
                                    <td className="p-3 whitespace-nowrap">{m.email}</td>
                                    <td className="p-3 whitespace-nowrap">{m.civilStatus}</td>
                                    <td className="p-3 whitespace-nowrap">{m.role}</td>
                                    <td className="p-3">********</td>
                                    <td className="p-3">
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                statusColors[m.status] || "bg-gray-300 text-gray-700"
                                            }`}
                                        >
                                            {m.status || "Unknown"}
                                        </span>
                                    </td>
                                    <td className="p-3 w-[120px] whitespace-nowrap">
                                        <div className="flex gap-2">
                                            {/* ACTIVE VIEW ACTIONS */}
                                            {viewMode === 'active' && (
                                                <>
                                                    <button 
                                                        className="text-blue-500 hover:text-blue-700" 
                                                        title="Edit Account" 
                                                        aria-label="Edit Account"
                                                        onClick={() => handleEditClick(m)}
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        className="text-red-500 hover:text-red-700"
                                                        onClick={() => handleDeleteMember(m.id, `${m.firstname} ${m.surname}`)}
                                                        title="Soft Delete Account"
                                                        aria-label="Soft Delete Account"
                                                    >
                                                        <Trash size={16} />
                                                    </button>
                                                </>
                                            )}

                                            {/* DELETED VIEW ACTIONS */}
                                            {viewMode === 'deleted' && (
                                                <>
                                                    <button
                                                        className="text-green-500 hover:text-green-700"
                                                        onClick={() => handleRestoreMember(m.id, `${m.firstname} ${m.surname}`)}
                                                        title="Restore Account"
                                                        aria-label="Restore Account"
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                    {/* Placeholder for permanent delete */}
                                                </>
                                            )}
                                            
                                            <button className="text-gray-500 hover:text-gray-700" title="More Options" aria-label="More Options">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={14} className="p-4 text-center text-gray-500">
                                    {viewMode === 'active'
                                        ? "No active members found."
                                        : "No deleted accounts found."
                                    }
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination and Create Button / View Toggler */}
            <div className="flex justify-between items-center mt-4 p-4">
                
                {/* View Toggler Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={() => { setViewMode('active'); setCurrentPage(1); }}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                            viewMode === 'active' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        title="View Active Accounts"
                    >
                        Active Accounts ({activeMembers.length})
                    </button>
                    <button
                        onClick={() => { setViewMode('deleted'); setCurrentPage(1); }}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                            viewMode === 'deleted' ? 'bg-red-700 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        title="View Deleted Accounts"
                    >
                        Deleted Accounts ({deletedMembers.length})
                    </button>
                </div>
                
                {/* Pagination Controls */}
                <nav className="flex items-center space-x-2">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        // Using a standard dark color for bg-object
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 " 
                        title="Previous Page"
                    >
                        Back
                    </button>
                    {/* Paginating by numbers (simplified approach) */}
                    {[...Array(totalPages)].map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentPage(idx + 1)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                currentPage === idx + 1
                                    ? "bg-gray-800 text-white"
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                            title={`Go to page ${idx + 1}`}
                        >
                            {idx + 1}
                        </button>
                    ))}
                    <button
                        disabled={currentPage === totalPages || totalPages === 0}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 "
                        title="Next Page"
                    >
                        Next
                    </button>
                </nav>
                
                {/* Create Button */}
                <button
                    onClick={() => {
                        setShowModal(true);
                        setErrorMessage(null);
                        setForm(defaultForm);
                        setIsEditing(false);
                    }}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-lg flex items-center gap-2"
                    disabled={viewMode === 'deleted'}
                    title="Create New Account"
                >
                    <Plus size={16} /> Create Acc.
                </button>
            </div>

            {/* --- CREATE / EDIT MODAL --- */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                            {isEditing ? 'Edit Existing Account' : 'Create New Account'}
                        </h2>
                        <form onSubmit={isEditing ? handleUpdateAccount : handleCreateAccount} className="space-y-6">
    
                            {/* --- Error Message Display --- */}
                            {errorMessage && (
                                <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700">
                                    <p className="font-semibold">Operation Failed:</p>
                                    <p className="text-sm">{errorMessage}</p>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {/* ROW 1: Name Fields */}
                                <FloatingInput id="surname" label="Surname" required value={form.surname} onChange={(v) => setForm({ ...form, surname: v })} />
                                <FloatingInput id="firstname" label="First Name" required value={form.firstname} onChange={(v) => setForm({ ...form, firstname: v })} />
                                
                                {/* ROW 2: Middle Name & DOB */}
                                <FloatingInput id="middlename" label="Middle Name" value={form.middlename} onChange={(v) => setForm({ ...form, middlename: v })} />
                                <FloatingInput id="dob" label="Date of Birth" type="date" value={form.dob} onChange={(v) => setForm({ ...form, dob: v })} />

                                {/* ROW 3: Address at Account Status */}
                                <FloatingInput id="address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
                                
                                {/* ACCOUNT STATUS: Visible only when editing */}
                                {isEditing ? (
                                    <FloatingSelect 
                                        id="status" 
                                        label="Account Status" 
                                        value={form.status} 
                                        onChange={(v) => setForm({ ...form, status: v })} 
                                        options={["New", "Active", "Inactive"]} // Exclude "Deleted" from dropdown edit
                                    />
                                ) : (
                                    // Hidden status input for creation (always "New")
                                    // The HiddenInput is not actually needed since it's hardcoded on creation.
                                    <div className="h-16"></div> // To maintain grid layout spacing
                                )}
                                
                                {/* ROW 4: Contact & Email */}
                                <FloatingInput id="contact" label="Contact Number" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} />
                                <FloatingInput id="email" label="Email Address" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                                
                                {/* ROW 5: Civil Status & Role */}
                                <FloatingSelect id="civilStatus" label="Civil Status" value={form.civilStatus} onChange={(v) => setForm({ ...form, civilStatus: v })} options={["Single", "Married", "Divorced", "Widowed"]} />
                                <FloatingSelect id="role" label="Role in HOA" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={["Member", "Officer", "Admin"]} />

                                {/* Conditional Password Fields (Only show for Creation) */}
                                {!isEditing && (
                                    <>
                                        <FloatingInput 
                                            id="password" 
                                            label="Password" 
                                            type="password" 
                                            required 
                                            value={form.password} 
                                            onChange={(v) => setForm({ ...form, password: v })} 
                                            onFocus={() => setShowPasswordInfo(true)} 
                                            onBlur={() => setShowPasswordInfo(false)} 
                                        />
                                        <FloatingInput 
                                            id="confirm" 
                                            label="Confirm Password" 
                                            type="password" 
                                            required 
                                            value={form.confirm} 
                                            onChange={(v) => setForm({ ...form, confirm: v })} 
                                            onFocus={() => setShowPasswordInfo(true)} 
                                            onBlur={() => setShowPasswordInfo(false)}
                                        />
                                    </>
                                )}
                            </div>

                            {/* Conditional Password Requirements Display */}
                            {showPasswordInfo && !isEditing && (
                                <div className="password-strength-info p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-gray-700">
                                    <p className="font-semibold text-red-700 mb-1">Requirements:</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        <li>Minimum **8 characters**.</li>
                                        <li>Must contain at least one **uppercase letter** (A-Z).</li>
                                        <li>Must contain at least one **number** (0-9).</li>
                                        <li>Must contain at least one **special character** (e.g., !@#$%^&*).</li>
                                    </ul>
                                    <p className="mt-2 text-xs text-gray-500">
                                        <span className="font-semibold text-red-700">Email:</span> Must be a valid format (e.g., name@domain.com).
                                    </p>
                                </div>
                            )}
                            
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-md text-sm hover:bg-gray-200"
                                    onClick={() => {
                                        setShowModal(false);
                                        setShowPasswordInfo(false); 
                                        setErrorMessage(null);
                                        setForm(defaultForm);
                                        setIsEditing(false);
                                        setCurrentMemberId(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800"
                                >
                                    {isEditing ? 'Save Changes' : 'Create Acc.'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* --- PDF EXPORT MODAL (Simplified based on the image) --- */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 w-full max-w-lg">
                        <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
                            Export to PDF
                        </h2>
                        <div className="space-y-4">
                            <FloatingInput 
                                id="file-name" 
                                label="File Name" 
                                required 
                                value="HOA_Members_Registry" 
                                onChange={() => {}} // Placeholder: You can add state for custom file name
                                className="mb-6"
                            />
                            
                            <h3 className="font-medium text-gray-700">Columns to Include</h3>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                {/* Sample checkboxes based on your image */}
                                {["Acc. No.", "Surname", "First Name", "Middle Name", "Date of Birth", "Contact No.", "Email Address", "Civil Status", "Role in HOA", "Status", "House Address"].map(col => (
                                    <div key={col} className="flex items-center">
                                        <input type="checkbox" id={`col-${col}`} name="columns" defaultChecked className="mr-2 text-emerald-600 focus:ring-emerald-500" />
                                        <label htmlFor={`col-${col}`}>{col}</label>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <button className="text-sm text-blue-600 hover:text-blue-800" onClick={() => { /* Toggle All Logic Here */ }}>
                                    Select All / Deselect All
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
                                onClick={handleExportPDF} // Use the PDF export function
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