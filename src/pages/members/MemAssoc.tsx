import React, {
  useState,
  useEffect,
  ReactNode,
  ButtonHTMLAttributes,
} from "react";
import {
  FiSearch,
  FiDownload,
  FiEdit2,
  FiTrash2,
  FiMoreVertical,
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import { auth, db } from "../../Firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, setDoc, getDoc, getDocs } from "firebase/firestore";

/* ---------------- Button ---------------- */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  children: ReactNode;
}
const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className = "",
  children,
  ...props
}) => {
  const baseStyle =
    "px-4 py-2 rounded-md font-medium focus:outline-none text-sm transition";
  const variants: Record<string, string> = {
    ghost: "bg-transparent hover:bg-gray-200",
    outline: "border border-gray-400 hover:bg-gray-100",
    default: "bg-[#006C5E] text-white hover:bg-[#005248]",
  };
  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/* ------------- Floating Input ------------- */
type BaseFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  className?: string;
};
const FloatingInput: React.FC<
  BaseFieldProps & { type?: string; right?: ReactNode }
> = ({
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
      className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none
                  focus:border-[#006C5E] transition"
    />
    {right && (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
        {right}
      </span>
    )}
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all
                  top-2 text-xs
                  peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base
                  peer-focus:top-2 peer-focus:text-xs peer-focus:text-[#006C5E]"
    >
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

const FloatingSelect: React.FC<BaseFieldProps & { options: string[] }> = ({
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
                  focus:border-[#006C5E] appearance-none transition bg-white"
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

/* ---------------- Page ---------------- */
const MemAssoc: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortFilter, setSortFilter] = useState("View All");
  const [searchQuery, setSearchQuery] = useState("");

  const statusColors: Record<string, string> = {
    Active: "bg-green-500 text-white",
    Inactive: "bg-red-500 text-white",
    Removed: "bg-gray-400 text-white",
    New: "bg-yellow-400 text-black",
  };

  const [f, setF] = useState({
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

  /* --- Fetch Members --- */
  const fetchAllMembers = async () => {
    try {
      setLoading(true);
      const membersCollectionRef = collection(db, "members");
      const querySnapshot = await getDocs(membersCollectionRef);
      const data = querySnapshot.docs.map((docSnap, idx) => ({
        id: docSnap.id,
        no: idx + 1,
        ...docSnap.data(),
      }));
      setMembers(data);
    } catch (error) {
      console.error("Error fetching members:", error);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  /* --- Auth Check --- */
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const adminDocRef = doc(db, "admin", user.uid);
        const adminSnap = await getDoc(adminDocRef);
        if (adminSnap.exists() && adminSnap.data()?.accountRole === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (authReady && isAdmin) {
      fetchAllMembers();
    }
  }, [authReady, isAdmin]);

  /* --- Sort + Search combined --- */
  const filteredMembers = React.useMemo(() => {
    let list = [...members];

    if (sortFilter === "Active") list = list.filter((m) => m.status === "Active");
    if (sortFilter === "Inactive")
      list = list.filter((m) => m.status === "Inactive");
    if (sortFilter === "New member" || sortFilter === "New")
      list = list.filter((m) => m.status === "New");
    if (sortFilter === "Form A-Z")
      list = list.sort((a, b) => a.surname.localeCompare(b.surname));

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.surname?.toLowerCase().includes(q) ||
          m.firstname?.toLowerCase().includes(q) ||
          m.middlename?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.address?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [members, sortFilter, searchQuery]);

  /* --- Create Account --- */
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
      await fetchAllMembers();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  /* --- Edit Member --- */
  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    try {
      const ref = doc(db, "members", editData.id);
      await setDoc(ref, editData, { merge: true });
      alert("Member updated successfully!");
      setShowEditModal(false);
      setEditData(null);
      await fetchAllMembers();
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  /* --- Soft Delete Member --- */
  const handleDeleteMember = async (id: string, email: string) => {
    if (
      !window.confirm(
        `Are you sure you want to remove ${email}? This will disable their login.`
      )
    ) {
      return;
    }
    try {
      const ref = doc(db, "members", id);
      await setDoc(ref, { status: "Removed" }, { merge: true });
      alert(`Member ${email} marked as Removed.`);
      await fetchAllMembers();
    } catch (err: any) {
      console.error("Error marking as removed:", err);
      alert(`Failed to remove member: ${err.message}`);
    }
  };

  /* --- Guards --- */
  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p>Verifying permissions...</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p>Loading members...</p>
      </div>
    );
  }

  /* --- Render --- */
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-[#006C5E] px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl text-white font-semibold">List of Members</h1>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pink-500 rounded-full" />
          <div className="w-8 h-8 bg-purple-500 rounded-full" />
        </div>
      </div>

      {/* Table */}
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b">
            <h2 className="text-lg font-semibold">Members of association</h2>
            <div className="flex items-center gap-3 relative">
              {/* Sort Dropdown */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowSortMenu((p) => !p)}
                  className="flex items-center gap-1"
                >
                  {sortFilter}
                </Button>
                {showSortMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border rounded-md shadow-md z-10">
                    {["View All", "Form A-Z", "Active", "Inactive", "New member"].map(
                      (option) => (
                        <button
                          key={option}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                            sortFilter === option ? "bg-gray-100 font-medium" : ""
                          }`}
                          onClick={() => {
                            setSortFilter(option);
                            setShowSortMenu(false);
                          }}
                        >
                          {option}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex items-center border rounded-md px-2 py-1 bg-gray-50">
                <FiSearch className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="outline-none text-sm ml-2 bg-transparent"
                />
              </div>

              <Button variant="outline" className="flex items-center gap-1">
                <FiDownload /> Export
              </Button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-3">No.</th>
                <th className="p-3">Surname</th>
                <th className="p-3">First Name</th>
                <th className="p-3">Middle</th>
                <th className="p-3">Address</th>
                <th className="p-3">Email</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No members found.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m: any) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{m.no}</td>
                    <td className="p-3">{m.surname}</td>
                    <td className="p-3">{m.firstname}</td>
                    <td className="p-3">{m.middlename}</td>
                    <td className="p-3">{m.address}</td>
                    <td className="p-3">{m.email}</td>
                    <td className="p-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          statusColors[m.status] || "bg-gray-300 text-gray-700"
                        }`}
                      >
                        {m.status || "Unknown"}
                      </span>
                    </td>
                    <td className="p-3 flex gap-2">
                      <button
                        className="p-1 rounded hover:bg-gray-200 text-gray-600"
                        onClick={() => {
                          setEditData(m);
                          setShowEditModal(true);
                        }}
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-gray-200 text-gray-600"
                        onClick={() => handleDeleteMember(m.id, m.email)}
                      >
                        <FiTrash2 size={14} />
                      </button>
                      <button className="p-1 rounded hover:bg-gray-200 text-gray-600">
                        <FiMoreVertical size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-4 py-3 border-t bg-gray-50">
            <Button variant="outline">Acc. details</Button>
            <Button variant="default" onClick={() => setShowModal(true)}>
              + Create Acc.
            </Button>
          </div>
        </div>
      </div>

      {/* ---------------- Create Modal ---------------- */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-lg font-semibold mb-6">Create Account</h2>
            <form onSubmit={handleCreateAccount}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FloatingInput
                  id="surname"
                  label="Surname"
                  required
                  value={f.surname}
                  onChange={(v) => setF({ ...f, surname: v })}
                />
                <FloatingInput
                  id="firstname"
                  label="First Name"
                  required
                  value={f.firstname}
                  onChange={(v) => setF({ ...f, firstname: v })}
                />
                <FloatingInput
                  id="middlename"
                  label="Middle Name"
                  value={f.middlename}
                  onChange={(v) => setF({ ...f, middlename: v })}
                />
                <FloatingInput
                  id="dob"
                  label="Date of Birth"
                  type="date"
                  value={f.dob}
                  onChange={(v) => setF({ ...f, dob: v })}
                />
                <FloatingInput
                  id="address"
                  label="Address"
                  value={f.address}
                  onChange={(v) => setF({ ...f, address: v })}
                  className="col-span-1 md:col-span-2"
                />
                <FloatingInput
                  id="contact"
                  label="Contact Number"
                  value={f.contact}
                  onChange={(v) => setF({ ...f, contact: v })}
                />
                <FloatingInput
                  id="email"
                  label="Email Address"
                  type="email"
                  required
                  value={f.email}
                  onChange={(v) => setF({ ...f, email: v })}
                />
                <FloatingSelect
                  id="civilStatus"
                  label="Civil Status"
                  value={f.civilStatus}
                  onChange={(v) => setF({ ...f, civilStatus: v })}
                  options={["Single", "Married", "Divorced", "Widowed"]}
                />
                <FloatingSelect
                  id="role"
                  label="Role in HOA"
                  value={f.role}
                  onChange={(v) => setF({ ...f, role: v })}
                  options={["Member", "Officer", "Admin"]}
                />
                <div className="space-y-1">
                  <FloatingInput
                    id="password"
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={f.password}
                    onChange={(v) => setF({ ...f, password: v })}
                    right={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Password must have at least 8 character, including UPPR and
                    lowercase and numbers
                  </p>
                </div>
                <FloatingInput
                  id="confirm"
                  label="Confirm Password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={f.confirm}
                  onChange={(v) => setF({ ...f, confirm: v })}
                  right={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  }
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit">Create Acc.</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Edit Modal ---------------- */}
      {showEditModal && editData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Edit Member</h2>
            <form onSubmit={handleEditMember} className="space-y-4">
              <FloatingInput
                id="edit-surname"
                label="Surname"
                required
                value={editData.surname}
                onChange={(v) => setEditData({ ...editData, surname: v })}
              />
              <FloatingInput
                id="edit-firstname"
                label="First Name"
                required
                value={editData.firstname}
                onChange={(v) => setEditData({ ...editData, firstname: v })}
              />
              <FloatingInput
                id="edit-email"
                label="Email"
                type="email"
                required
                value={editData.email}
                onChange={(v) => setEditData({ ...editData, email: v })}
              />
              <FloatingSelect
                id="edit-status"
                label="Status"
                value={editData.status || "Active"}
                onChange={(v) => setEditData({ ...editData, status: v })}
                options={["Active", "Inactive", "Removed", "New"]}
              />

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => setShowEditModal(false)}
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemAssoc;