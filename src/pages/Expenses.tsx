import React from "react";
import Sidebar from "../components/Layout";
import { Download } from "lucide-react";

const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }
> = ({ variant, className = "", children, ...props }) => {
  const baseStyle = "px-3 py-1 rounded-md font-medium focus:outline-none";
  const variants: Record<string, string> = {
    ghost: "bg-transparent hover:bg-gray-200",
    outline: "border border-gray-400 hover:bg-gray-100",
    default: "bg-blue-600 text-white hover:bg-blue-700",
  };

  const appliedStyle = variants[variant || "default"] || variants.default;

  return (
    <button className={`${baseStyle} ${appliedStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Expenses: React.FC = () => {
  return (
    <div className="bg-white min-h-screen">
        <div className="bg-mainColor"> 
      <h1 className="text-2xl text-white font-semibold p-6">Expenses</h1>
        </div>
      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 bg-gray-100 p-6 space-y-6 overflow-auto">
          {/* Header Box */}
          <div className="bg-white rounded-lg shadow p-4 flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-600">Total Remaining Funds</span>
              <div className="mt-2 text-2xl font-bold">₱0.00</div>
            </div>
            <Button variant="ghost">
              <Download className="mr-2 h-4 w-4 inline" /> Export
            </Button>
          </div>

          {/* Filters */}
          <div className="flex justify-end gap-2">
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Date filter"
            />
            <Button variant="default">New Expenses</Button>
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-md shadow overflow-hidden">
            <div className="grid grid-cols-4 bg-gray-200 p-2 text-sm font-semibold text-center">
              <div>Purpose</div>
              <div>Amount</div>
              <div>Date</div>
              <div>Receipt</div>
            </div>
            <div className="max-h-72 overflow-auto">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 p-2 border-t text-sm text-gray-600 text-center"
                >
                  <div>--</div>
                  <div>₱0.00</div>
                  <div>--/--/----</div>
                  <div>None</div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Expenses;
