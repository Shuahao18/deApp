// FILE: src/components/GATrafficCard.tsx
import { useState, useEffect } from 'react';

interface TrafficSource {
    source: string | null;
    users: number;
}

interface TrafficData {
    totalUsers: number;
    sources: TrafficSource[];
}

function GATrafficCard() {
    const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Add timestamp to prevent caching issues
                const response = await fetch(
                    `https://us-central1-hoa-appp.cloudfunctions.net/getGATraffic?t=${Date.now()}`
                );
                
                if (!response.ok) {
                    // Try to get more detailed error message
                    let errorDetail = `HTTP error! status: ${response.status}`;
                    try {
                        const errorData = await response.json();
                        errorDetail = errorData.error || errorData.message || errorDetail;
                    } catch {
                        // If response isn't JSON, use status text
                        errorDetail = `HTTP error! status: ${response.status} - ${response.statusText}`;
                    }
                    throw new Error(errorDetail);
                }

                const data = await response.json();
                
                if (data.success) {
                    setTrafficData(data);
                } else {
                    throw new Error(data.error || 'Failed to fetch traffic data');
                }
                
                setLoading(false);
            } catch (err: unknown) {
                console.error("❌ Error fetching traffic data:", err);
                
                let errorMessage = "Failed to fetch traffic data. Please check if the analytics service is running.";
                if (err instanceof Error) {
                    errorMessage = err.message;
                }
                
                setError(errorMessage);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleRetry = () => {
        setLoading(true);
        setError(null);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-xl border-t-4 border-indigo-500">
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-3"></div>
                    <span className="text-gray-600">Loading Google Analytics Data...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-xl border-t-4 border-red-500">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Website Traffic</h3>
                <div className="text-red-600 p-3 bg-red-50 rounded-lg text-sm">
                    <strong>Analytics Service Error:</strong> {error}
                </div>
                <div className="mt-3 text-xs text-gray-500">
                    <p>This might be due to:</p>
                    <ul className="list-disc list-inside mt-1">
                        <li>Google Analytics service not configured</li>
                        <li>Service account permissions issue</li>
                        <li>Temporary service outage</li>
                    </ul>
                </div>
                <button 
                    onClick={handleRetry}
                    className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                >
                    Retry
                </button>
            </div>
        );
    }
    
    if (!trafficData) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-xl border-t-4 border-yellow-500">
                <h3 className="text-xl font-bold text-gray-800 mb-2">Website Traffic</h3>
                <p className="text-gray-600">No traffic data available.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-xl border-t-4 border-indigo-500">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Website Traffic (Last 7 Days)</h3>
            
            <div className="text-4xl font-extrabold text-indigo-600 mb-2">
                {trafficData.totalUsers.toLocaleString()}
            </div>
            <p className="text-sm text-gray-500 mb-4">Total Users</p>

            <h4 className="font-semibold text-gray-700 mt-6 mb-2">Top Traffic Sources:</h4>
            <ul className="space-y-2 text-sm">
                {trafficData.sources.map((item: TrafficSource, index: number) => (
                    <li key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="font-medium text-gray-600">{item.source || 'Direct/None'}</span>
                        <span className="text-indigo-500 font-semibold">{item.users.toLocaleString()} users</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default GATrafficCard;