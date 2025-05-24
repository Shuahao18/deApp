// Layout.tsx
import React, { useState } from "react";
import { Outlet, Link } from "react-router-dom";

const Layout = () => {
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  return (
    <div className="flex h-screen">
  {/* Sidebar */}
  <div className="w-64 bg-gray-800 text-white flex flex-col h-full">
    {/* Title */}
    <div className="p-4 text-xl font-bold border-b border-gray-700">
      Admin Dashboard
    </div>

    {/* Scrollable menu section */}
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <Link to="/dashboard" className="block hover:bg-gray-700 p-2 rounded">
        Dashboard
      </Link>
      <Link to="/accounting" className="block hover:bg-gray-700 p-2 rounded">
        Accounting
      </Link>

      {/* Expandable Members */}
      <div>
        <button
          onClick={() => setIsMembersOpen(!isMembersOpen)}
          className="w-full text-left hover:bg-gray-700 p-2 rounded flex justify-between items-center"
        >
          Members
          <span>{isMembersOpen ? "▾" : "▸"}</span>
        </button>
        {isMembersOpen && (
          <div className="ml-4 mt-2 space-y-1">
            <Link
              to="/members/contribution"
              className="block text-sm hover:bg-gray-700 p-2 rounded"
            >
              Contribution
            </Link>
            <Link
              to="/members/expenses"
              className="block text-sm hover:bg-gray-700 p-2 rounded"
            >
              Expenses
            </Link>
          </div>
        )}
      </div>

      <Link to="/documents" className="block hover:bg-gray-700 p-2 rounded">
        Documents
      </Link>
      <Link to="/complaints" className="block hover:bg-gray-700 p-2 rounded">
        Complaints
      </Link>
      <Link to="/announcement" className="block hover:bg-gray-700 p-2 rounded">
        Announcement
      </Link>
      <Link to="/posting" className="block hover:bg-gray-700 p-2 rounded">
        Posting
      </Link>
      <Link to="/request" className="block hover:bg-gray-700 p-2 rounded">
        Request
      </Link>
    </div>

    {/* Logout */}
    <div className="p-4 border-t border-gray-700">
      <button className="w-full text-left text-red-400 hover:text-red-600">
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
