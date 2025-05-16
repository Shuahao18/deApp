import React from "react";
import { Download, } from "lucide-react";

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }> = ({
  variant,
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

  const appliedStyle = variants[variant || "default"] || variants.default;

  return (
    <button className={`${baseStyle} ${appliedStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", ...props }) => (
  <div className={`bg-white rounded-lg shadow ${className}`} {...props} />
);

const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", ...props }) => (
  <div className={`p-4 ${className}`} {...props} />
);

const ScrollArea: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", ...props }) => (
  <div className={`overflow-auto ${className}`} {...props} />
);

const ContributionPage: React.FC = () => {
  return (
    <div className="flex h-screen">

     

      {/* Main Content */}
      <main className="flex-1 bg-gray-100 p-6 overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">Contribution</h1>
          <Button variant="ghost">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {["Total Funds", "Total Invoice", "Paid Amount", "Unpaid Amount"].map((label) => (
            <Card key={label} className="shadow-md">
              <CardContent className="p-4 text-center text-sm font-medium">
                {label}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters & Actions */}
        <div className="flex justify-between items-center mb-2">
          <div className="space-x-2">
            <Button variant="outline">All</Button>
            <Button variant="outline">Fully Paid</Button>
            <Button variant="outline">Delinquent</Button>
          </div>
          <div className="space-x-2">
            <Button>Add Payment</Button>
            <Button variant="outline">Payment Log</Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-md shadow overflow-hidden">
          <div className="grid grid-cols-4 bg-gray-200 p-2 text-sm font-semibold">
            <div>Acc. No.</div>
            <div>Name</div>
            <div>Unpaid Amount</div>
            <div>Status</div>
          </div>
          <ScrollArea className="h-48">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-4 p-2 border-t text-sm text-gray-600">
                <div> - </div>
                <div> - </div>
                <div> - </div>
                <div> - </div>
              </div>
            ))}
          </ScrollArea>
        </div>
      </main>
    </div>
  );
};

export default ContributionPage;
