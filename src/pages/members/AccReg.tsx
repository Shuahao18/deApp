import React from "react";
import { Search, Download, Pencil, Trash, MoreVertical } from "lucide-react";

const data = [
  {
    no: "001",
    surname: "Freddie L. Allen",
    first: "Freddie L. Allen",
    middle: "Freddie L. Allen",
    dob: "05/08/1942",
    address: "2436 Main Street, Springfield, IL 62704, United States",
    contact: "704-727-8314",
    email: "PerryMilBridges@jourrapide.com",
    marital: "Single",
    role: "Member",
    password: "********",
    status: "Active",
  },
  {
    no: "002",
    surname: "Freddie L. Allen",
    first: "Freddie L. Allen",
    middle: "Freddie L. Allen",
    dob: "05/08/1942",
    address: "2436 Main Street, Springfield, IL 62704, United States",
    contact: "704-727-8314",
    email: "PerryMilBridges@jourrapide.com",
    marital: "Married",
    role: "President",
    password: "********",
    status: "Active",
  },
  {
    no: "003",
    surname: "Freddie L. Allen",
    first: "Freddie L. Allen",
    middle: "Freddie L. Allen",
    dob: "05/08/1942",
    address: "2436 Main Street, Springfield, IL 62704, United States",
    contact: "704-727-8314",
    email: "PerryMilBridges@jourrapide.com",
    marital: "Widowed",
    role: "Vice President",
    password: "********",
    status: "Inactive",
  },
];

const statusColors: Record<string, string> = {
  Active: "bg-green-500 text-white",
  Inactive: "bg-red-600 text-white",
  New: "bg-yellow-400 text-black",
};

const AccReg = () => {
  return (
    <div className="p-6 bg-white rounded-lg shadow">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Account Registry</h2>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-gray-200 rounded-lg">Back</button>
          <button className="px-4 py-2 bg-emerald-700 text-white rounded-lg">
            + Create Acc.
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Sort by</label>
          <input
            type="text"
            placeholder="Search..."
            className="border px-3 py-1 rounded-md text-sm"
          />
        </div>
        <button className="flex items-center gap-2 border px-3 py-1 rounded-md">
          <Download size={16} /> Export
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-2 border">No.</th>
              <th className="p-2 border">Acc. No.</th>
              <th className="p-2 border">Surname</th>
              <th className="p-2 border">First Name</th>
              <th className="p-2 border">Middle Name</th>
              <th className="p-2 border">Date of Birth</th>
              <th className="p-2 border">Address</th>
              <th className="p-2 border">Contact No.</th>
              <th className="p-2 border">Email Address</th>
              <th className="p-2 border">Civil Status</th>
              <th className="p-2 border">Role in HOA</th>
              <th className="p-2 border">Password</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="text-gray-700">
                <td className="p-2 border">{i + 1}</td>
                <td className="p-2 border">{row.no}</td>
                <td className="p-2 border">{row.surname}</td>
                <td className="p-2 border">{row.first}</td>
                <td className="p-2 border">{row.middle}</td>
                <td className="p-2 border">{row.dob}</td>
                <td className="p-2 border">{row.address}</td>
                <td className="p-2 border">{row.contact}</td>
                <td className="p-2 border">{row.email}</td>
                <td className="p-2 border">{row.marital}</td>
                <td className="p-2 border">{row.role}</td>
                <td className="p-2 border">{row.password}</td>
                <td className="p-2 border">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${statusColors[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="p-2 border">
                  <div className="flex gap-2">
                    <button className="text-blue-500">
                      <Pencil size={16} />
                    </button>
                    <button className="text-red-500">
                      <Trash size={16} />
                    </button>
                    <button className="text-gray-500">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccReg;
