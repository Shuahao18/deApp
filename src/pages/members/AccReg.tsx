import React, { useEffect, useState, ReactNode } from "react";
import { Search, Download, Pencil, Trash, MoreVertical, Plus } from "lucide-react";
import { auth, db } from "../../Firebase";
import { collection, getDocs, setDoc, doc, updateDoc, query, where, limit, orderBy } from "firebase/firestore"; // Added orderBy, limit for potential sorting
import { createUserWithEmailAndPassword } from "firebase/auth";

/* ---------------- Reusable Components ---------------- */

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
                <option key={opt} value={opt}>
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

/* ---------------- Types and Security Helper Functions ---------------- */

const statusColors: Record<string, string> = {
    Active: "bg-green-500 text-white",
    Inactive: "bg-red-600 text-white",
    New: "bg-yellow-400 text-black",
    Deleted: "bg-gray-400 text-white",
};

// 💡 ADJUSTED: Gamitin ang 'accNo' na galing sa Firestore
interface MemberData {
    id: string;
    accNo: string; // Permanent Account Number from Firestore
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
}

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

/* ---------------- New Helper Function for Acc. No. ---------------- */

// 💡 Function to find the highest existing Acc. No. and return the next one
const getNextAccNo = async (): Promise<string> => {
    const membersRef = collection(db, "members");
    try {
        // Para mas accurate, kunin ang lahat at hanapin ang pinakamalaking number
        const snapshot = await getDocs(membersRef);
        let maxAccNo = 0;

        snapshot.docs.forEach(doc => {
            const accNo = doc.data().accNo;
            if (accNo) {
                // Convert string '001', '010' to number
                const num = parseInt(accNo, 10); 
                if (!isNaN(num) && num > maxAccNo) {
                    maxAccNo = num;
                }
            }
        });

        const nextNumber = maxAccNo + 1; 
        
        // Gamitin ang padStart para maging "001", "010", "100", etc.
        return String(nextNumber).padStart(3, "0"); 
    } catch (error) {
        console.error("Error generating next account number:", error);
        // Fallback to a timestamp-based unique ID if fetching fails (less readable but safe)
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
    const membersPerPage = 10;

    // 💡 ADJUSTED: Kukunin na ang 'accNo' mula sa data
    const fetchMembers = async () => {
        try {
            const membersRef = collection(db, "members");
            const q = query(
                membersRef,
                where("status", "in", ["Active", "Inactive", "New"]) 
            );

            const snapshot = await getDocs(q); 
            const data = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    accNo: data.accNo || 'N/A', // Use saved accNo, default to 'N/A' if missing
                    ...data,
                };
            }) as MemberData[];
            
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
                `Are you sure you want to delete the account for ${memberName}? \n\nThis will mark the account as 'Deleted' and remove it from the main list, but their historical payment data will be preserved.`
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
            fetchMembers(); // Refresh the list
        } catch (error) {
            console.error("Error soft-deleting member:", error);
            alert("Failed to delete account. Please check the console for details.");
        }
    };
    // ---------------------------

    const filteredMembers = members.filter((m) => {
        const q = searchQuery.toLowerCase();
        return (
            m.surname?.toLowerCase().includes(q) ||
            m.firstname?.toLowerCase().includes(q) ||
            m.middlename?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.contact?.toLowerCase().includes(q) ||
            m.accNo?.toLowerCase().includes(q) || // Search by Acc. No.
            m.address?.toLowerCase().includes(q)
        );
    });

    const currentMembers = filteredMembers.slice(
        (currentPage - 1) * membersPerPage,
        currentPage * membersPerPage
    );

    const totalPages = Math.ceil(filteredMembers.length / membersPerPage);

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null); // Clear previous errors

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
            // 💡 STEP 1: GENERATE NEXT ACCOUNT NUMBER
            const newAccNo = await getNextAccNo(); 

            // STEP 2: Create user in Firebase Auth
            const userCred = await createUserWithEmailAndPassword(
                auth,
                form.email,
                form.password
            );

            // STEP 3: Store member data in Firestore
            await setDoc(doc(db, "members", userCred.user.uid), {
                surname: form.surname,
                firstname: form.firstname,
                middlename: form.middlename,
                dob: form.dob,
                address: form.address,
                contact: form.contact,
                email: form.email,
                civilStatus: form.civilStatus,
                role: form.role,
                status: "Active",
                // 💡 SAVE THE NEW UNIQUE ACCOUNT NUMBER
                accNo: newAccNo, 
            });
            
            alert(`Account created successfully! Account No: ${newAccNo} 🎉`); 
            setShowModal(false);
            setForm(defaultForm);
            setShowPasswordInfo(false); 
            fetchMembers();
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

    return (
        <div className=" bg-white rounded-lg shadow-md">
            {/* Header */}
            
            <div className="bg-teader h-20 flex justify-between items-center px-8">
                <h1 className="text-3xl font-extrabold text-white">Account Registry</h1>
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
                    <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 
                    border border-gray-300 rounded-full hover:bg-gray-200">
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-object text-white">
                        <tr>
                            {[
                                "No.", "Acc. No.", "Surname", "First Name", "Middle Name", "Date of Birth", 
                                "Address", "Contact No.", "Email Address", "Civil Status", "Role in HOA", 
                                "Password", "Status", "Actions",
                            ].map((h) => (
                                <th key={h} className="p-3 text-left border-b border-gray-600">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {currentMembers.length ? (
                            currentMembers.map((m, i) => (
                                <tr key={m.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3">{(currentPage - 1) * membersPerPage + i + 1}</td>
                                    {/* 💡 Use the new accNo field */}
                                    <td className="p-3">{m.accNo}</td> 
                                    <td className="p-3">{m.surname}</td>
                                    <td className="p-3">{m.firstname}</td>
                                    <td className="p-3">{m.middlename}</td>
                                    <td className="p-3">{m.dob}</td>
                                    <td className="p-3">{m.address}</td>
                                    <td className="p-3">{m.contact}</td>
                                    <td className="p-3">{m.email}</td>
                                    <td className="p-3">{m.civilStatus}</td>
                                    <td className="p-3">{m.role}</td>
                                    <td className="p-3">********</td>
                                    <td className="p-3">
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs ${
                                                statusColors[m.status] || "bg-gray-300 text-gray-700"
                                            }`}
                                        >
                                            {m.status || "Unknown"}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button className="text-blue-500 hover:text-blue-700">
                                                <Pencil size={16} />
                                            </button>
                                            <button 
                                                className="text-red-500 hover:text-red-700"
                                                onClick={() => handleDeleteMember(m.id, `${m.firstname} ${m.surname}`)} // Soft Delete Call
                                            >
                                                <Trash size={16} />
                                            </button>
                                            <button className="text-gray-500 hover:text-gray-700">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={14} className="p-4 text-center text-gray-500">
                                    No members found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination and Create Button */}
            <div className="flex justify-between items-center mt-4">
                <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="px-4 py-2 bg-object text-white rounded-lg disabled:opacity-50 "
                >
                    Back
                </button>
                <nav className="flex items-center space-x-2">
                    {[...Array(totalPages)].map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentPage(idx + 1)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                currentPage === idx + 1
                                    ? "bg-gray-800 text-white"
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                        >
                            {idx + 1}
                        </button>
                    ))}
                </nav>
                <button
                    onClick={() => {
                        setShowModal(true);
                        setErrorMessage(null); // Clear errors when opening modal
                        setForm(defaultForm); // Reset form when opening modal
                    }}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-lg flex items-center gap-2"
                >
                    <Plus size={16} /> Create Acc.
                </button>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 w-full max-w-3xl">
                        <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                            Create New Account
                        </h2>
                        <form onSubmit={handleCreateAccount} className="space-y-6">
                            
                            {/* --- Error Message Display --- */}
                            {errorMessage && (
                                <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700">
                                    <p className="font-semibold">Creation Failed:</p>
                                    <p className="text-sm">{errorMessage}</p>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <FloatingInput id="surname" label="Surname" required value={form.surname} onChange={(v) => setForm({ ...form, surname: v })} />
                                <FloatingInput id="firstname" label="First Name" required value={form.firstname} onChange={(v) => setForm({ ...form, firstname: v })} />
                                <FloatingInput id="middlename" label="Middle Name" value={form.middlename} onChange={(v) => setForm({ ...form, middlename: v })} />
                                <FloatingInput id="dob" label="Date of Birth" type="date" value={form.dob} onChange={(v) => setForm({ ...form, dob: v })} />
                                <FloatingInput id="address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="md:col-span-2" />
                                <FloatingInput id="contact" label="Contact Number" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} />
                                <FloatingInput id="email" label="Email Address" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                                <FloatingSelect id="civilStatus" label="Civil Status" value={form.civilStatus} onChange={(v) => setForm({ ...form, civilStatus: v })} options={["Single", "Married", "Divorced", "Widowed"]} />
                                <FloatingSelect id="role" label="Role in HOA" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={["Member", "Officer", "Admin"]} />
                                
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
                            </div>

                            {/* --- Conditional Password Requirements Display --- */}
                            {showPasswordInfo && (
                                <div className="password-strength-info p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-gray-700">
                                    <p className="font-semibold text-red-700 mb-1">Requirements:</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        <li>Minimum 8 characters.</li>
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
                                        setErrorMessage(null); // Clear error on close
                                        setForm(defaultForm); // Reset form data
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800"
                                >
                                    Create Acc.
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccReg;