import React from "react";
import Sidebar from "../components/Layout";

export default function Dashboard () {
  return (
    <div className="flex h-screen bg-gray-100">

      {/* Main Content */}
      <div className="flex-1 p-6 grid grid-cols-3 gap-4 overflow-y-auto">
        <div className="col-span-2 grid grid-rows-2 gap-4">
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

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-bold"></h3>
            <p>Event List</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4"></h3>
          <p>Event Calendar</p>
        </div>
      </div>
    </div>
  );
};


