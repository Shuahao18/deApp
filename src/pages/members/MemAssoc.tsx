import React, { useState, useEffect, ReactNode, ButtonHTMLAttributes } from "react";
import { FiSearch, FiDownload, FiEdit2, FiTrash2, FiMoreVertical, FiX, FiEye, FiEyeOff } from "react-icons/fi";
import { auth, db } from "../../Firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";

/* ---------------- Button ---------------- */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  children: ReactNode;
}
const Button: React.FC<ButtonProps> = ({ variant = "default", className = "", children, ...props }) => {
  const baseStyle = "px-4 py-2 rounded-md font-medium focus:outline-none text-sm transition";
  const variants: Record<string, string> = {
    ghost: "bg-transparent hover:bg-gray-200",
    outline: "border border-gray-400 hover:bg-gray-100",
    default: "bg-[#006C5E] text-white hover:bg-[#005248]",
  };
  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
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
const FloatingInput: React.FC<BaseFieldProps & { type?: string; right?: ReactNode }> = ({
  id, label, required, value, onChange, type = "text", right, className = "",
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
    {right && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">{right}</span>}
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all
                 top-2 text-xs
                 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base
                 peer-focus:top-2 peer-focus:text-xs peer-focus:text-[#006C5E]"
    >
      {label}{required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

const FloatingSelect: React.FC<BaseFieldProps & { options: string[] }> = ({
  id, label, required, value, onChange, options, className = "",
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
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all top-2 text-xs"
    >
      {label}{required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

/* ---------------- Page ---------------- */
const MemAssoc: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const statusColors: Record<string, string> = {
    Active: "bg-green-500 text-white",
    Inactive: "bg-red-500 text-white",
    New: "bg-yellow-400 text-black",
  };

  const [f, setF] = useState({
    surname: "", firstname: "", middlename: "",
    dob: "", address: "", contact: "", email: "",
    civilStatus: "Single", role: "Member",
    password: "", confirm: "",
  });

  // 🔹 Fetch members from Firestore
  const fetchMembers = async () => {
    const snapshot = await getDocs(collection(db, "members"));
    const data = snapshot.docs.map((docSnap, idx) => ({
      id: docSnap.id,
      no: idx + 1,
      ...docSnap.data(),
    }));
    setMembers(data);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  // 🔹 Create new member
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) {
      alert("Passwords do not match!");
      return;
    }

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, f.email, f.password);
      const user = userCredential.user;

      // 2. Save user info in Firestore
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
        createdAt: new Date(),
        createdBy: auth.currentUser?.uid,
      });

      alert("Member account created!");
      setShowModal(false);
      setF({
        surname: "", firstname: "", middlename: "",
        dob: "", address: "", contact: "", email: "",
        civilStatus: "Single", role: "Member",
        password: "", confirm: "",
      });

      fetchMembers(); // refresh list
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Bar */}
      <div className="bg-[#006C5E] px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl text-white font-semibold">List of Members</h1>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pink-500 rounded-full" />
          <div className="w-8 h-8 bg-purple-500 rounded-full" />
        </div>
      </div>

      {/* Card */}
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header controls */}
          <div className="flex justify-between items-center px-4 py-3 border-b">
            <h2 className="text-lg font-semibold">Members of association</h2>
            <div className="flex items-center gap-3">
              <Button variant="outline">Sort by</Button>
              <div className="flex items-center border rounded-md px-2 py-1 bg-gray-50">
                <FiSearch className="text-gray-500" />
                <input type="text" placeholder="Search" className="outline-none text-sm ml-2 bg-transparent" />
              </div>
              <Button variant="outline" className="flex items-center gap-1">
                <FiDownload /> Export
              </Button>
            </div>
          </div>

          {/* Table */}
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
              {members.map((m: any) => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{m.no}</td>
                  <td className="p-3">{m.surname}</td>
                  <td className="p-3">{m.firstname}</td>
                  <td className="p-3">{m.middlename}</td>
                  <td className="p-3">{m.address}</td>
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[m.status]}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="p-3 flex gap-2">
                    <button className="p-1 rounded hover:bg-gray-200 text-gray-600"><FiEdit2 size={14} /></button>
                    <button className="p-1 rounded hover:bg-gray-200 text-gray-600"><FiTrash2 size={14} /></button>
                    <button className="p-1 rounded hover:bg-gray-200 text-gray-600"><FiMoreVertical size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-4 py-3 border-t bg-gray-50">
            <Button variant="outline">Acc. details</Button>
            <Button variant="default" onClick={() => setShowModal(true)}>+ Create Acc.</Button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-[760px] rounded-lg shadow-lg p-6 relative">
            <button className="absolute top-3 right-3 text-gray-600 hover:text-black" onClick={() => setShowModal(false)}>
              <FiX size={20} />
            </button>

            <h2 className="text-xl font-semibold mb-4 text-center border-b pb-3">Create Account</h2>

            <form className="grid grid-cols-2 gap-4" onSubmit={handleCreateAccount}>
              <FloatingInput id="surname" label="Surname" required value={f.surname} onChange={(v) => setF({ ...f, surname: v })}/>
              <FloatingInput id="firstname" label="First Name" required value={f.firstname} onChange={(v) => setF({ ...f, firstname: v })}/>
              <FloatingInput id="middlename" label="Middle Name" value={f.middlename} onChange={(v) => setF({ ...f, middlename: v })}/>
              <FloatingInput id="dob" label="Date of Birth" value={f.dob} onChange={(v) => setF({ ...f, dob: v })} type="date"/>
              <FloatingInput id="address" label="Address" required value={f.address} onChange={(v) => setF({ ...f, address: v })} className="col-span-2"/>
              <FloatingInput id="contact" label="Contact Number" required value={f.contact} onChange={(v) => setF({ ...f, contact: v })}/>
              <FloatingInput id="email" label="Email Address" required value={f.email} onChange={(v) => setF({ ...f, email: v })} type="email"/>
              <FloatingSelect id="civil" label="Civil Status" required value={f.civilStatus} onChange={(v) => setF({ ...f, civilStatus: v })} options={["Single","Married","Widowed","Separated","Other"]}/>
              <FloatingSelect id="role" label="Role in HOA" required value={f.role} onChange={(v) => setF({ ...f, role: v })} options={["Member","President","Vice President","Treasurer","Secretary","Auditor","PRO"]}/>
              <FloatingInput id="password" label="Password" required value={f.password} onChange={(v) => setF({ ...f, password: v })} type={showPassword ? "text" : "password"} right={
                <button type="button" onClick={() => setShowPassword((p) => !p)}>
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              }/>
              <FloatingInput id="confirm" label="Confirm Password" required value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} type={showConfirmPassword ? "text" : "password"} right={
                <button type="button" onClick={() => setShowConfirmPassword((p) => !p)}>
                  {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              }/>
              <div className="col-span-2 flex justify-end gap-3 mt-2">
                <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button variant="default" type="submit">Create Acc.</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemAssoc;
