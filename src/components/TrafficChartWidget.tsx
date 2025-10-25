import {
  useEffect,
  useState,
  useMemo,
  CSSProperties,
  useCallback,
} from "react";

// --- Interfaces and Types ---
interface TrafficRow {
  source: string;
  sessions: number;
}

interface GA4Response {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>; // sessionSourceMedium
    metricValues: Array<{ value: string }>; // sessions
  }>;
}

// --- Chart Segment Colors ---
const CHART_SEGMENTS = [
  { normalizedName: "Direct", colorClass: "#8481db" },
  { normalizedName: "Organic Search", colorClass: "#007AC7" },
  { normalizedName: "Unassigned", colorClass: "#00BBC9" },
  { normalizedName: "Organic Social", colorClass: "#7BB4E6" },
  { normalizedName: "Referral", colorClass: "#5B50A0" },
];

// --- Helper to normalize source names ---
const normalizeSource = (sourceMedium: string): string => {
  if (!sourceMedium) return "Unassigned";

  const source = sourceMedium.toLowerCase().trim();

  if (source === "(direct) / (none)") return "Direct";
  if (source.includes("google") || source.includes("organic"))
    return "Organic Search";
  if (
    source.includes("facebook") ||
    source.includes("instagram") ||
    source.includes("twitter") ||
    source.includes("linkedin") ||
    source.includes("social")
  )
    return "Organic Social";
  if (source.includes("referral")) return "Referral";
  if (source === "(not set)" || source === "null") return "Unassigned";

  return "Unassigned";
};

export default function TrafficChartWidget() {
  const [traffic, setTraffic] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch Traffic Data ---
  const fetchTraffic = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const res = await fetch(
        "https://us-central1-hoa-appp.cloudfunctions.net/getTrafficData",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data: GA4Response = await res.json();
      console.log("✅ RAW GA4 Data Received:", data);

      if (!data.rows || data.rows.length === 0) {
        setTraffic([]);
        setError("No traffic data available from Google Analytics");
        return;
      }

      const processedTraffic = data.rows.map((row) => {
        const source = row.dimensionValues[0]?.value || "Unknown";
        const sessions = Number(row.metricValues[0]?.value) || 0;
        return { source, sessions };
      });

      console.log("📊 Processed Traffic Data:", processedTraffic);
      setTraffic(processedTraffic);
    } catch (err) {
      console.error("❌ Error fetching GA4 traffic data", err);
      setError(
        err instanceof Error ? err.message : "Failed to load traffic data"
      );
      setTraffic([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTraffic();
  }, [fetchTraffic, refreshKey]);

  // --- Compute chart data ---
  const chartData = useMemo(() => {
    const groupedData: Record<string, number> = {};
    const totalSessions = traffic.reduce((sum, t) => sum + t.sessions, 0);

    traffic.forEach((row) => {
      const groupName = normalizeSource(row.source);
      groupedData[groupName] = (groupedData[groupName] || 0) + row.sessions;
    });

    if (totalSessions === 0) return [];

    return CHART_SEGMENTS.map((segment) => {
      const sessions = groupedData[segment.normalizedName] || 0;
      const percentage = (sessions / totalSessions) * 100;

      return {
        ...segment,
        sessions,
        percentage: parseFloat(percentage.toFixed(1)),
      };
    }).filter((d) => d.sessions > 0);
  }, [traffic]);

  // --- Conic gradient style for chart ---
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

  // --- Label position logic ---
  const getLabelPosition = (
    dataName: string,
    percentage: number
  ): CSSProperties => {
    const positions: Record<string, CSSProperties> = {
      Unassigned:
        percentage > 50
          ? { top: "50%", left: "70%", textAlign: "left" }
          : { bottom: "5%", left: "15%", textAlign: "left" },
      Direct:
        percentage > 20
          ? { top: "30%", right: "10%", textAlign: "right" }
          : { top: "35%", right: "10%", textAlign: "right" },
      "Organic Social":
        percentage > 20
          ? { top: "20%", left: "10%", textAlign: "left" }
          : { top: "50%", left: "10%", textAlign: "left" },
      "Organic Search": { bottom: "25%", left: "30%", textAlign: "left" },
      Referral: { top: "15%", left: "15%", textAlign: "left" },
    };
    return positions[dataName] || {
      top: "50%",
      left: "50%",
      textAlign: "center",
    };
  };

  const totalSessions = traffic.reduce((sum, t) => sum + t.sessions, 0);

  return (
    <div className="bg-white rounded-lg shadow-md flex flex-col h-full min-h-[350px]">
      {/* Header */}
      <div className="p-4 bg-object rounded-t-lg border-b border-gray-200">
        <h2 className="text-lg font-semibold text-white">
          Traffic Acquisition
        </h2>
        <p className="text-gray-100 text-sm">Last 7 days</p>
      </div>

      {/* Chart Content */}
      <div className="flex-1 p-4 pb-2">
        {error && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#9a7e6f]"></div>
          </div>
        ) : totalSessions === 0 ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center text-gray-500">
              <p>No traffic data available</p>
              <p className="text-sm">Check Google Analytics setup</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="flex justify-center relative w-full aspect-square max-w-[280px] mx-auto">
              <div className="relative w-full h-full flex items-center justify-center">
                <div
                  className="absolute w-full h-full rounded-full"
                  style={conicGradientStyle}
                ></div>

                {/* Inner Circle */}
                <div className="absolute w-[45%] h-[45%] rounded-full bg-white shadow-inner flex flex-col items-center justify-center text-center">
                  <p className="text-lg font-bold text-gray-800">
                    {totalSessions.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Total Sessions</p>
                </div>

                {/* Labels */}
                {chartData.map((data, i) => (
                  <div
                    key={i}
                    className="absolute text-xs font-semibold z-10 bg-white/80 px-2 py-1 rounded shadow-sm"
                    style={getLabelPosition(data.normalizedName, data.percentage)}
                  >
                    <p className="text-gray-900 leading-none whitespace-nowrap">
                      {data.normalizedName}
                    </p>
                    <p className="text-gray-500 leading-none">
                      {data.percentage.toFixed(1)}% ({data.sessions})
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {chartData.map((data, index) => (
                <div key={index} className="flex items-center text-xs">
                  <div
                    className="w-3 h-3 rounded-full mr-1"
                    style={{ backgroundColor: data.colorClass }}
                  ></div>
                  <span className="text-gray-700">{data.normalizedName}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-center items-center">
        <button
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={loading}
          className="flex items-center text-sm font-semibold text-[#9a7e6f] hover:text-[#7f6b5f] transition duration-150 disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.988 8.988 0 0112 21a9 9 0 01-8.625-12.775M16 4h4.582V9"
            />
          </svg>
          {loading ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>
    </div>
  );
}
