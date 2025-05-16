// src/components/Sidebar.tsx
import React from "react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate }) => {
  const navItems = [
    { label: "Dashboard", page: "Dashboard" },
    { label: "Contribution", page: "Contribution" },
    { label: "Expenses", page: "Expenses" },
  ];

  return (
    <aside className="w-64 bg-green-700 text-white p-4 flex flex-col justify-between">
      <div>
        <div className="mb-10 text-center font-bold text-xl">Logo</div>
        <nav className="space-y-4">
          {navItems.map(({ label, page }) => (
            <div
              key={page}
              onClick={() => onNavigate(page)}
              className={`cursor-pointer font-semibold ${
                activePage === page ? "text-green-200" : ""
              }`}
            >
              {label}
            </div>
          ))}
        </nav>
      </div>
      <Button variant="ghost" className="text-white">
        Log Out
      </Button>
    </aside>
  );
};

export default Sidebar;
