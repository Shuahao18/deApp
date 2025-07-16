import React, { ReactNode, ButtonHTMLAttributes } from "react";

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
  const baseStyle = "px-3 py-1 rounded-md font-medium focus:outline-none";
  const variants: Record<string, string> = {
    ghost: "bg-transparent hover:bg-gray-200",
    outline: "border border-gray-400 hover:bg-gray-100",
    default: "bg-blue-600 text-white hover:bg-blue-700",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Complaints: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gray-100">
        {/* Top Bar */}
        <div className="bg-[#006C5E] p-6">
          <h1 className="text-2xl text-white font-semibold">Complaints</h1>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
            {["Total Complaints", "New Complaints", "Pending Complaints", "Complaints Solve", "Rejected Complaints"].map((label, index) => {
              const colors = ["bg-sky-500", "bg-green-500", "bg-yellow-400", "bg-gray-500", "bg-red-500"];
              return (
                <div key={index} className={`${colors[index]} text-white p-4 rounded-md shadow flex flex-col justify-between`}>
                  <div className="text-lg font-bold">10</div>
                  <div className="text-sm">{label}</div>
                  <button className="text-xs underline mt-2 text-white/90 hover:text-white">View More</button>
                </div>
              );
            })}
          </div>

          {/* Complaint Cards */}
          <div className="bg-white rounded-md shadow divide-y">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="text-sm font-semibold">From: Freddie L. Allen</div>
                <div className="text-sm">Date: March 6, 2025</div>
                <div className="text-sm">Address: 2436 Main Street, Springfield, IL 62704, United States</div>
                <div className="text-sm">Contact no#: 704-727-8314</div>
                <div className="text-sm">
                  Complaint: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="px-3 py-1 text-xs font-medium text-white bg-yellow-500 rounded">Pending</span>
                  <div className="space-x-2">
                    <Button variant="default">Solve</Button>
                    <Button variant="outline">Reject</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Complaints;
