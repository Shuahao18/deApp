import React, { useEffect, useState, ReactNode, ButtonHTMLAttributes } from "react";
import { Search, Download, Pencil, Trash, MoreVertical, Plus } from "lucide-react";
import { auth, db } from "../../Firebase";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

/* ---------------- Reusable Components with Correct Typing ---------------- */

interface BaseFieldProps {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  className?: string;
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
}) => (
  <div className={`relative ${className}`}>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700"
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
      className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none focus:border-emerald-700 appearance-none transition bg-white"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all top-2 text-xs"
    >
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

/* ---------------- Main AccReg Component ---------------- */

const statusColors: Record<string, string> = {
  Active: "bg-green-500 text-white",
  Inactive: "bg-red-600 text-white",
  New: "bg-yellow-400 text-black",
};

interface MemberData {
  id: string;
  no: string;
  surname: string;
  firstname: string;
  middlename?: string;
  dob?: string;
  address?: string;
  contact?: string;
  email: string;
  civilStatus?: string;
  role?: string;
  status: "Active" | "Inactive" | "New";
}

// Corrected interface for form state
interface NewMemberFormState {
  surname: string;
  firstname: string;
  middlename: string;
  dob: string;
  address: string;
  contact: string;
  email: string;
  civilStatus: string;
  role: string;
  password: string; // Changed from "" to string
  confirm: string; // Changed from "" to string
}

const AccReg = () => {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const membersPerPage = 10;
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [f, setF] = useState<NewMemberFormState>({
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
  });

  const fetchMembers = async () => {
    try {
      const snapshot = await getDocs(collection(db, "members"));
      const data = snapshot.docs.map((docSnap, idx) => ({
        id: docSnap.id,
        no: String(idx + 1).padStart(3, "0"),
        ...docSnap.data(),
      })) as MemberData[];
      setMembers(data);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const filteredMembers = members.filter((member) => {
    const searchString = searchQuery.toLowerCase();
    return (
      member.surname?.toLowerCase().includes(searchString) ||
      member.firstname?.toLowerCase().includes(searchString) ||
      member.middlename?.toLowerCase().includes(searchString) ||
      member.email?.toLowerCase().includes(searchString) ||
      member.contact?.toLowerCase().includes(searchString) ||
      member.address?.toLowerCase().includes(searchString)
    );
  });

  const indexOfLastMember = currentPage * membersPerPage;
  const indexOfFirstMember = indexOfLastMember - membersPerPage;
  const currentMembers = filteredMembers.slice(indexOfFirstMember, indexOfLastMember);
  const totalPages = Math.ceil(filteredMembers.length / membersPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) {
      alert("Passwords do not match!");
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        f.email,
        f.password
      );
      const user = userCredential.user;
      await setDoc(doc(db, "members", user.uid), {
        surname: f.surname,
        firstname: f.firstname,
        middlename: f.middlename,
        dob: f.dob,
        address: f.address,
        contact: f.contact,
        email: f.email,
        civilStatus: f.civilStatus,
        role: f.role,
        status: "Active",
      });
      alert("Account created successfully!");
      setShowModal(false);
      setF({
        surname: "", firstname: "", middlename: "", dob: "",
        address: "", contact: "", email: "", civilStatus: "Single",
        role: "Member", password: "", confirm: "",
      });
      fetchMembers();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      {/* Header and Controls */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Account Registry</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center relative">
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={16} className="absolute left-3 text-gray-400" />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 border border-gray-300 rounded-full hover:bg-gray-200">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-emerald-800 text-white">
            <tr>
              <th className="p-3 text-left border-b border-gray-600">No.</th>
              <th className="p-3 text-left border-b border-gray-600">Acc. No.</th>
              <th className="p-3 text-left border-b border-gray-600">Surname</th>
              <th className="p-3 text-left border-b border-gray-600">First Name</th>
              <th className="p-3 text-left border-b border-gray-600">Middle Name</th>
              <th className="p-3 text-left border-b border-gray-600">Date of Birth</th>
              <th className="p-3 text-left border-b border-gray-600">Address</th>
              <th className="p-3 text-left border-b border-gray-600">Contact No.</th>
              <th className="p-3 text-left border-b border-gray-600">Email Address</th>
              <th className="p-3 text-left border-b border-gray-600">Civil Status</th>
              <th className="p-3 text-left border-b border-gray-600">Role in HOA</th>
              <th className="p-3 text-left border-b border-gray-600">Password</th>
              <th className="p-3 text-left border-b border-gray-600">Status</th>
              <th className="p-3 text-left border-b border-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentMembers.length > 0 ? (
              currentMembers.map((m, i) => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{indexOfFirstMember + i + 1}</td>
                  <td className="p-3">{m.no}</td>
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
                      className={`px-2 py-1 rounded-full text-xs ${statusColors[m.status] || "bg-gray-300 text-gray-700"}`}
                    >
                      {m.status || "Unknown"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button className="text-blue-500 hover:text-blue-700 transition-colors">
                        <Pencil size={16} />
                      </button>
                      <button className="text-red-500 hover:text-red-700 transition-colors">
                        <Trash size={16} />
                      </button>
                      <button className="text-gray-500 hover:text-gray-700 transition-colors">
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

      {/* Pagination Controls */}
      <div className="flex justify-between items-center mt-4">
        <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2">
          Back
        </button>
        <nav className="flex items-center space-x-2">
          {[...Array(totalPages)].map((_, index) => (
            <button
              key={index + 1}
              onClick={() => paginate(index + 1)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                currentPage === index + 1
                  ? "bg-gray-800 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </nav>
        <button
          className="px-4 py-2 bg-emerald-700 text-white rounded-lg flex items-center gap-2"
          onClick={() => setShowModal(true)}
        >
          <Plus size={16} /> Create Acc.
        </button>
      </div>

      {/* Add Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-8 w-full max-w-3xl">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Create New Account</h2>
            <form onSubmit={handleCreateAccount} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <FloatingInput id="surname" label="Surname" required value={f.surname} onChange={(v) => setF({ ...f, surname: v })} />
                <FloatingInput id="firstname" label="First Name" required value={f.firstname} onChange={(v) => setF({ ...f, firstname: v })} />
                <FloatingInput id="middlename" label="Middle Name" value={f.middlename} onChange={(v) => setF({ ...f, middlename: v })} />
                <FloatingInput id="dob" label="Date of Birth" type="date" value={f.dob} onChange={(v) => setF({ ...f, dob: v })} />
                <FloatingInput id="address" label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} className="col-span-1 md:col-span-2" />
                <FloatingInput id="contact" label="Contact Number" value={f.contact} onChange={(v) => setF({ ...f, contact: v })} />
                <FloatingInput id="email" label="Email Address" type="email" required value={f.email} onChange={(v) => setF({ ...f, email: v })} />
                <FloatingSelect id="civilStatus" label="Civil Status" value={f.civilStatus} onChange={(v) => setF({ ...f, civilStatus: v })} options={["Single", "Married", "Divorced", "Widowed"]} />
                <FloatingSelect id="role" label="Role in HOA" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={["Member", "Officer", "Admin"]} />
                <FloatingInput id="password" label="Password" type="password" required value={f.password} onChange={(v) => setF({ ...f, password: v })} />
                <FloatingInput id="confirm" label="Confirm Password" type="password" required value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} />
              </div>
              <div className="text-xs text-gray-500">
                Password must have at least 8 characters.
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md font-medium text-sm transition bg-transparent hover:bg-gray-200"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md font-medium text-sm transition bg-emerald-700 text-white hover:bg-emerald-800"
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