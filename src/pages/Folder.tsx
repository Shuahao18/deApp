import React, { ReactNode, ButtonHTMLAttributes } from "react";
import {
  Download,
  File,
  MoreVertical,
  Search,
  Star,
  Trash2,
} from "lucide-react";

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

const FoldersPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gray-100">
        {/* Top Bar */}
        <div className="bg-[#006C5E] p-6">
          <h1 className="text-2xl text-white font-semibold">Folders</h1>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Control Panel */}
          <div className="bg-white shadow rounded-md p-4">
            <div className="flex justify-between items-center mb-4">
              {/* Buttons */}
              <div className="flex gap-2">
                <Button>+ Add</Button>
                <Button variant="outline">Type</Button>
                <Button variant="outline">Recent</Button>
                <Button variant="outline">Sort by</Button>
              </div>

              {/* Search */}
              <div className="flex items-center border rounded px-2 bg-white">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Find a file"
                  className="ml-2 outline-none text-sm bg-transparent"
                />
              </div>
            </div>

            {/* Folder Row */}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="min-w-[200px] bg-gray-100 p-3 rounded border text-sm"
                >
                  <div className="font-medium">Folder no. 1</div>
                  <div className="text-xs text-gray-500">June 20, 2025</div>
                  <div className="flex justify-end mt-2">
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              ))}
            </div>

            {/* File Table */}
            <div className="mt-6 border-t pt-4">
              <div className="grid grid-cols-4 font-semibold text-sm text-gray-700 border-b pb-2">
                <div>Name</div>
                <div>Last Access</div>
                <div>File size</div>
                <div className="text-right">Location</div>
              </div>

              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 items-center text-sm text-gray-600 py-2 border-b"
                >
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4 text-red-500" /> PDF file no. {i + 1}
                  </div>
                  <div>June 20, 2025</div>
                  <div>{i === 3 ? "1.23 gb" : i === 2 ? "2 mb" : "300 kb"}</div>
                  <div className="text-right flex items-center justify-end gap-2">
                    <span>Folder no. 1</span>
                    <Download className="w-4 h-4 cursor-pointer" />
                    <Star className="w-4 h-4 cursor-pointer" />
                    <Trash2 className="w-4 h-4 cursor-pointer" />
                    <MoreVertical className="w-4 h-4 cursor-pointer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FoldersPage;
