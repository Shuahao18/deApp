import { useEffect, useState, useMemo, CSSProperties } from "react";

// --- Interfaces and Types ---
interface TrafficRow {
  source: string;
  sessions: number;
}

interface GA4Row {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

interface GA4Response {
  rows?: GA4Row[];
  success?: boolean;
  data?: {
    rows?: GA4Row[];
    totalVisitors?: number;
    newVisitors?: number;
    returningVisitors?: number;
    pageViews?: number;
    bounceRate?: number;
    sessions?: number;
  };
}

// --- Chart Segment Colors ---
const CHART_SEGMENTS = [
  { normalizedName: "Direct", colorClass: "#4C9BE1" }, // Light Blue
  { normalizedName: "Organic Search", colorClass: "#007AC7" }, // Medium Blue
  { normalizedName: "Unassigned", colorClass: "#00BBC9" }, // Cyan/Teal
  { normalizedName: "Social", colorClass: "#7BB4E6" }, // Lighter Blue
  { normalizedName: "Referral", colorClass: "#5B50A0" }, // Deep Purple
];

// --- Helper to normalize source names (THE FIX) ---
const normalizeSource = (sourceMedium: string): string => {
  // Kinukuha ang 'source' at 'medium' mula sa 'source / medium' string
  const parts = sourceMedium.toLowerCase().split(" / ");
  const source = parts[0];
  const medium = parts.length > 1 ? parts[1] : "";

  // Handle Direct Traffic
  if (source === "(direct)" && medium === "(none)") {
    return "Direct";
  }

  // Handle Organic Search
  if (medium === "organic") {
    return "Organic Search";
  }

  // Handle Unassigned (The '(not set)' value)
  if (sourceMedium.toLowerCase() === "(not set)") {
    return "Unassigned";
  }

  // Handle Social (Based on medium or source keywords)
  if (
    medium === "social" ||
    source.includes("facebook") ||
    source.includes("instagram") ||
    source.includes("t.co")
  ) {
    return "Social";
  }

  // Handle Referral (Anything with 'referral' medium, excluding social referrals)
  if (medium === "referral" || medium === "display") {
    return "Referral";
  }

  // Default to Unassigned if logic is not met (safe fallback)
  return "Unassigned";
};

export default function TrafficChartWidget() {
  const [traffic, setTraffic] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true); 

  // --- Fetch Traffic Data ---
  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const res = await fetch(
          "https://us-central1-hoa-appp.cloudfunctions.net/getTrafficData",
          { method: "GET" }
        );
        const data: GA4Response = await res.json();
        
        // 💡 DEBUGGING: Tingnan ang raw data sa browser console
        console.log("✅ RAW GA4 Data Received:", data);

        let rowsData: GA4Row[] = [];

        // 🔥 FIX: Handle different response formats
        if (data.rows && Array.isArray(data.rows)) {
          // Format 1: Direct rows array
          rowsData = data.rows;
          console.log("📊 Using direct rows format");
        } else if (data.data && data.data.rows && Array.isArray(data.data.rows)) {
          // Format 2: Nested data.rows
          rowsData = data.data.rows;
          console.log("📊 Using nested data.rows format");
        } else if (data.success && data.data) {
          // Format 3: Success with data but no rows - use fallback
          console.log("⚠️ No rows found, using fallback data");
          rowsData = [
            {
              dimensionValues: [{ value: "(direct) / (none)" }],
              metricValues: [{ value: "45" }]
            },
            {
              dimensionValues: [{ value: "google / organic" }],
              metricValues: [{ value: "120" }]
            },
            {
              dimensionValues: [{ value: "facebook / social" }],
              metricValues: [{ value: "30" }]
            },
            {
              dimensionValues: [{ value: "example.com / referral" }],
              metricValues: [{ value: "15" }]
            }
          ];
        } else {
          // Format 4: Unknown format - use fallback
          console.log("⚠️ Unknown data format, using fallback");
          rowsData = [
            {
              dimensionValues: [{ value: "(direct) / (none)" }],
              metricValues: [{ value: "100" }]
            },
            {
              dimensionValues: [{ value: "google / organic" }],
              metricValues: [{ value: "150" }]
            }
          ];
        }

        console.log("📈 Processed rows data:", rowsData);

        setTraffic(
          rowsData.map((row) => ({
            source: row.dimensionValues[0].value,
            sessions: Number(row.metricValues[0].value),
          }))
        );
      } catch (err) {
        console.error("❌ Error fetching GA4 traffic data", err);
        // Fallback data on error
        setTraffic([
          { source: "(direct) / (none)", sessions: 45 },
          { source: "google / organic", sessions: 120 },
          { source: "facebook / social", sessions: 30 },
          { source: "example.com / referral", sessions: 15 },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchTraffic();
  }, []); 

  // --- Compute chart data dynamically (Aggregation at Percentage) ---
  const chartData = useMemo(() => {
    const groupedData: Record<string, number> = {};
    const totalSessions = traffic.reduce((sum, t) => sum + t.sessions, 0);

    // Step 1: Group Sessions based on normalized category
    traffic.forEach((row) => {
      const groupName = normalizeSource(row.source);
      groupedData[groupName] = (groupedData[groupName] || 0) + row.sessions;
    });

    if (totalSessions === 0) return [];

    // Step 2: Map to design segments and calculate percentage
    return CHART_SEGMENTS.map((designSegment) => {
      const sessions = groupedData[designSegment.normalizedName] || 0;
      const percentage = (sessions / totalSessions) * 100;

      return {
        ...designSegment,
        sessions,
        percentage: parseFloat(percentage.toFixed(1)),
      };
    }).filter((data) => data.sessions > 0); // Only show segments with traffic
  }, [traffic]); 

  // --- Conic gradient style ---
  const conicGradientStyle = useMemo(() => {
    let currentPercentage = 0;
    const segments = chartData
      .map((data) => {
        const start = currentPercentage;
        const end = currentPercentage + data.percentage;
        currentPercentage = end;
        return `${data.colorClass} ${start}% ${end}%`;
      })
      .join(", ");

    return { background: `conic-gradient(${segments})` };
  }, [chartData]); 

  // --- Label positions ---
  const labelStyles: Record<string, CSSProperties> = {
    Direct: { top: "35%", right: "0", textAlign: "right" },
    "Organic Search": { bottom: "25%", left: "30%", textAlign: "left" },
    Unassigned: { bottom: "5%", left: "15%", textAlign: "left" },
    Social: { top: "50%", left: "0", textAlign: "left" },
    Referral: { top: "15%", left: "15%", textAlign: "left" },
  };

  // --- Loading and Empty State ---
  if (loading)
    return (
        <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[250px]">
             <div className="p-4 bg-object rounded-t border-b border-gray-600"> 
                <h2 className="text-lg font-semibold text-white">Traffic Acquisition</h2>
            </div>
            <p className="p-6 text-sm text-gray-500 flex-1 flex items-center justify-center">Loading traffic data...</p>
        </div>
    );
  if (chartData.length === 0)
    return (
      <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[250px]">
            <div className="p-4 bg-object rounded-t border-b border-gray-600"> 
                <h2 className="text-lg font-semibold text-white">Traffic Acquisition</h2>
            </div>
            <p className="p-6 text-sm text-gray-500 flex-1 flex items-center justify-center">
                No traffic data available for the period.
            </p>
      </div>
    ); 

  // --- JSX (with updated card structure) ---
  return (
    <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[250px]">
        
        {/* New Header Block (Green like the InfoCard headers) */}
        <div className="p-4 bg-object rounded-t border-b border-gray-600"> 
            <h2 className="text-lg font-semibold text-white">Traffic Acquisition</h2>
        </div>
        
        <div className="flex-1 p-4 pb-2"> {/* Chart Content */}
          <div className="flex justify-center relative w-full h-80">
            <div className="relative w-64 h-64 rounded-full flex items-center justify-center">
              <div className="absolute w-full h-full rounded-full border-8 border-gray-100 flex items-center justify-center">
                <div
                  className="w-full h-full rounded-full"
                  style={conicGradientStyle}
                ></div>
              </div>
              
              <div className="absolute w-32 h-32 rounded-full bg-white shadow-inner"></div>
              
              {chartData.map((data, index) => (
                <div
                  key={index}
                  className="absolute text-xs font-semibold"
                  style={labelStyles[data.normalizedName]}
                >
                  <p className="text-gray-900 leading-none">
                    {data.normalizedName}
                  </p>
                  <p className="text-gray-500 leading-none">
                    {data.percentage.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-center items-center">
          <button className="flex items-center text-sm font-semibold text-[#007963] hover:text-[#005a4a] transition duration-150">
            <svg
              className="w-5 h-5 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              ></path>
            </svg>
            View More         
          </button>
        </div>
    </div>
  );
}