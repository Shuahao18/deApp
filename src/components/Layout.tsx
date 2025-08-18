// Layout.tsx
import React, { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../Firebase"; // Adjust the path based on your project structure

const Layout = () => {
  const [isAccountingOpen, setIsAccountingOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/"); // Redirect to login page after logout
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-mainColor text-white flex flex-col h-full">
        {/* Title */}
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          Admin Dashboard
        </div>

        {/* Scrollable menu section */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <Link to="/dashboard" className="block hover:bg-green-800 p-2 rounded">
            Dashboard
          </Link>
          <Link to="/calendarEvent" className="block hover:bg-green-800 p-2 rounded">
            Calendar
          </Link>

          {/* Accounting Dropdown */}
          <div>
            <button
              onClick={() => setIsAccountingOpen(!isAccountingOpen)}
              className="w-full text-left hover:bg-green-800 p-2 rounded flex justify-between items-center"
            >
              Accounting
              <span>{isAccountingOpen ? "▾" : "▸"}</span>
            </button>
            {isAccountingOpen && (
              <div className="ml-4 mt-2 space-y-1">
                <Link
                  to="/members/contribution"
                  className="block text-sm hover:bg-green-800 p-2 rounded"
                >
                  Contribution
                </Link>
                <Link
                  to="/members/expenses"
                  className="block text-sm hover:bg-green-800 p-2 rounded"
                >
                  Expenses
                </Link>
              </div>
            )}
          </div>

          {/* Members Dropdown */}
          <div>
            <button
              onClick={() => setIsMembersOpen(!isMembersOpen)}
              className="w-full text-left hover:bg-green-800 p-2 rounded flex justify-between items-center"
            >
              Members
              <span>{isMembersOpen ? "▾" : "▸"}</span>
            </button>
            {isMembersOpen && (
              <div className="ml-4 mt-2 space-y-1">
                <Link
                  to="/members/memAssoc"
                  className="block text-sm hover:bg-green-800 p-2 rounded"
                >
                  Member Association
                </Link>
                <Link
                  to="/members/accReg"
                  className="block text-sm hover:bg-green-800 p-2 rounded"
                >
                  Account Registration
                </Link>
                
              </div>
            )}
          </div>

          {/* Static Links */}
          <Link to="/folder" className="block hover:bg-green-800 p-2 rounded">
            Folder
          </Link>
          <Link to="/complaints" className="block hover:bg-green-800 p-2 rounded">
            Complaints
          </Link>
          <Link to="/posting" className="block hover:bg-green-800 p-2 rounded">
            Posting
          </Link>
          <Link to="/announcement" className="block hover:bg-green-800 p-2 rounded">
            Announcement
          </Link>
          <Link to="/request" className="block hover:bg-green-800 p-2 rounded">
            Request
          </Link>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-red-400 hover:text-red-600"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 bg-gray-100 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
