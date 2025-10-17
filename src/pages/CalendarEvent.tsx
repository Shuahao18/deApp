import React, { useState, useEffect } from "react";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { dateFnsLocalizer } from "react-big-calendar";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../Firebase";
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const locales = {
  "en-US": require("date-fns/locale/en-US"),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

// Update Interface: Add createdAt as optional
interface EventType {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  createdAt?: Date; // Added createdAt field
}

export default function CalendarEvent() {
  const [events, setEvents] = useState<EventType[]>([]);
  
  // New Event State: Only need 'start' from the user input
  const [newEvent, setNewEvent] = useState<{
    title: string;
    start: string;
    description: string; 
  }>({ title: "", start: "", description: "" });
  const [showModal, setShowModal] = useState(false);

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate('/EditModal');
  };

  const handleDashboardClick = () => {
    navigate('/Dashboard');
  };

  useEffect(() => {
    async function fetchEvents() {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          
          // FIX: Safely handle Firestore Timestamp (or missing data) for start date
          const startDate = data.start && typeof data.start.toDate === 'function' 
            ? data.start.toDate() 
            : new Date();

          // Safely handle Firestore Timestamp (or missing data) for end date
          let endDate = data.end && typeof data.end.toDate === 'function' 
            ? data.end.toDate() 
            : null;

          // If 'end' is missing (e.g., from old data or a newly created point event), 
          // set it to 1 minute after 'start' to satisfy react-big-calendar
          if (!endDate || isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
            endDate = new Date(startDate.getTime() + 60000); // 1 minute later
          }

          // Handle createdAt field
          let createdAt = data.createdAt && typeof data.createdAt.toDate === 'function' 
            ? data.createdAt.toDate() 
            : new Date(); // Fallback to current date if not available

          return {
            id: doc.id,
            title: data.title,
            start: startDate,
            end: endDate,
            description: data.description || "",
            createdAt: createdAt, // Add createdAt to the event object
          };
        }) as EventType[];
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    fetchEvents();
  }, []);

  const handleAddEvent = async () => {
    // Check if required fields are filled
    if (!newEvent.title || !newEvent.start ) {
      alert("Please fill in the Event Title and Date/Time.");
      return;
    }

    const startDate = new Date(newEvent.start);

    if (isNaN(startDate.getTime())) {
      alert("Invalid date format. Please use the date/time picker.");
      return;
    }
    
    // Calculate the 'end' date as 1 minute after the 'start' date
    const endDate = new Date(startDate.getTime() + 60000); // + 60,000 milliseconds = 1 minute

    const eventToAdd: EventType = {
      title: newEvent.title,
      start: startDate,
      end: endDate, // Include the calculated 'end' date
      description: newEvent.description, 
    };

    try {
      // Include 'end' date, 'description', and 'createdAt' in Firestore
      const docRef = await addDoc(collection(db, "events"), {
        title: eventToAdd.title,
        start: startDate,
        end: endDate, 
        description: eventToAdd.description,
        createdAt: serverTimestamp(), // Add server timestamp
      });

      // For the local state, we can use current date since serverTimestamp will be set on server
      setEvents((prev) => [...prev, { 
        ...eventToAdd, 
        id: docRef.id,
        createdAt: new Date() // Local timestamp until server syncs
      }]);
      
      // Reset newEvent state
      setNewEvent({ title: "", start: "", description: "" });
      setShowModal(false);
    } catch (e) {
      console.error("Error adding event:", e);
      alert("Failed to add event. Check console for details.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* TOP HEADER - Calendar Events Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        
        {/* Calendar Events Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">Calendar Events</h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <ShareIcon className="h-5 w-5" /> 
          </button>

          {/* ADMIN BUTTON: Navigation Handler */}
          <div 
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick} 
          >
            <UserCircleIcon className="h-8 w-8 text-white" />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Header Stats and Add Button */}
          <div className="flex justify-between items-center">
            <div className="text-center text-gray-700 border border-gray-700 px-4 py-2 rounded">
              Total Events:
              <div className="font-bold">{events.length}</div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              + Add Event
            </button>
          </div>

          {/* Main Content */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Event List */}
            <div className="lg:w-1/3 w-full bg-white rounded-lg shadow-md p-4">
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {events.map((event, index) => {
                  const day = event.start.toLocaleDateString("en-US", {
                    day: "2-digit",
                  });
                  const month = event.start
                    .toLocaleDateString("en-US", { month: "short" })
                    .toUpperCase();

                  return (
                    // START of Event Item
                    <div
                      key={event.id || index}
                      className="flex items-center gap-4 border-b pb-4"
                    >
                      {/* Date Box */}
                      <div className="w-20 h-24 rounded-md border border-gray-400 overflow-hidden shadow-md">
                        <div className="h-1/2 bg-[#1e4643] text-white flex items-center justify-center text-sm font-bold uppercase">
                          {month}
                        </div>
                        <div className="h-1/2 bg-white text-gray-800 flex items-center justify-center text-2xl font-bold">
                          {day}
                        </div>
                      </div>

                      {/* Event Info */}
                      <div className="flex-1">
                        <div className="font-medium text-base">
                          {event.title}
                        </div>
                        {/* Display description in the list (shortened) */}
                        {event.description && (
                          <div className="text-xs text-gray-400 italic">
                            {event.description.substring(0, 50)}
                            {event.description.length > 50 ? '...' : ''}
                          </div>
                        )}
                        <div className="text-sm text-gray-600">
                          {event.start.toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                        
                        {/* Display the event time */}
                        <div className="text-xs text-gray-500">
                          {event.start.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>

                        {/* Display created date if available */}
                        {event.createdAt && (
                          <div className="text-xs text-gray-400 mt-1">
                            Created: {event.createdAt.toLocaleDateString()} at{' '}
                            {event.createdAt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </div> 
                    </div> 
                    // END of Event Item
                  );
                })}
              </div>
            </div>

            {/* Calendar */}
            <div className="lg:w-2/3 w-full bg-white p-4 rounded-lg shadow-md">
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end" // IMPORTANT: Tells the calendar how long the event lasts
                style={{ height: 500 }}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowModal(false)}
            >
              ✕
            </button>
            <h3 className="text-xl font-semibold mb-4">Add New Event</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Event Title"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, title: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
              
              {/* Description Input */}
              <textarea
                placeholder="Event Description (Optional)"
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 resize-none"
              />
              
              <label className="block text-sm font-medium text-gray-700">
                Event Date and Time
              </label>
              <input
                type="datetime-local"
                value={newEvent.start}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, start: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
              
              <div className="flex justify-end">
                <button
                  onClick={handleAddEvent}
                  className="bg-[#007963] text-white px-4 py-2 rounded-md hover:bg-[#005a4a]"
                >
                  Add Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}