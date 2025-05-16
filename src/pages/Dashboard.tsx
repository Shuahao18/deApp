import React, { useState } from "react";

const Dashboard = () => {
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  return (
    
    
    <div className="flex h-screen bg-gray-100">
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        {/* Title */}
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          Admin Dashboard
        </div>

        {/* Scrollable menu section */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Accounting
          </button>

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
                <button className="block w-full text-left text-sm hover:bg-gray-700 p-2 rounded">
                  Contribution
                </button>
                <button className="block w-full text-left text-sm hover:bg-gray-700 p-2 rounded">
                  Expenses
                </button>
              </div>
            )}
          </div>

          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Documents
          </button>
          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Complaints
          </button>
          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Announcement
          </button>
          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Posting
          </button>
          <button className="w-full text-left hover:bg-gray-700 p-2 rounded">
            Request
          </button>
        </div>

        {/* Logout at the bottom */}
        <div className="p-4 border-t border-gray-700">
          <button className="w-full text-left text-red-400 hover:text-red-600">
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 grid grid-cols-3 gap-4 overflow-y-auto">
        {/* Left Column (2 rows) */}
        <div className="col-span-2 grid grid-rows-2 gap-4">
          {/* Top-left: HOA Member Stats */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-bold mb-4">HOA Member Stats</h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="bg-blue-100 text-blue-800 p-4 rounded-lg">
                <p className="text-sm">Total</p>
                <p className="text-2xl font-semibold">200</p>
              </div>
              <div className="bg-green-100 text-green-800 p-4 rounded-lg">
                <p className="text-sm">Active</p>
                <p className="text-2xl font-semibold">150</p>
              </div>
              <div className="bg-red-100 text-red-800 p-4 rounded-lg">
                <p className="text-sm">Inactive</p>
                <p className="text-2xl font-semibold">30</p>
              </div>
              <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg">
                <p className="text-sm">New</p>
                <p className="text-2xl font-semibold">20</p>
              </div>
            </div>
          </div>

          {/* Bottom-left: Placeholder */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-bold"></h3>
            <p>Event List</p>
          </div>
        </div>

        {/* Right Column: Full height box */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4"></h3>
          <p>Event Calendar</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
