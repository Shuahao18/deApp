import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../Firebase";
import Sidebar from "../components/Layout";

interface EventType {
  id?: string;
  title: string;
  start: Date;
  end: Date;
}

export default function Dashboard() {
  const [events, setEvents] = useState<EventType[]>([]);

  // Fetch events on mount
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            start: new Date(data.start.seconds * 500),
            end: new Date(data.end.seconds * 500),
          };
        });
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    };
    fetchEvents();
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Main Content */}
      <div className="flex-1 p-6 grid grid-cols-3 gap-4 overflow-y-auto">
        <div className="col-span-2 grid grid-rows-2 gap-4">
          {/* HOA Stats */}
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

          {/* Event List */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-bold mb-4">Event List</h3>
            
              <p>No events available.</p>
  
          </div>
        </div>

        {/* Calendar Box */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4">Event Calendar</h3>
          {events.length === 0 ? (
              <p>No events available.</p>
            ) : (
              <ul className="list-disc pl-4">
                {events.map((event) => (
                  <p key={event.id} className="mb-2">
                    <span className="font-semibold">{event.title}</span> —{" "}
                    <span className="text-gray-600">
                      {event.start.toLocaleString()} to {event.end.toLocaleString()}
                    </span>
                  </p>
                ))}
              </ul>
            )}
        </div>
        
      </div>
    </div>
  );
}
