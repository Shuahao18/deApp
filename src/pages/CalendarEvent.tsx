import React, { useState, useEffect } from "react";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { dateFnsLocalizer } from "react-big-calendar";
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../Firebase";
import {
  UserCircleIcon,
  ShareIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

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

// Floating Input Component with success state
const FloatingInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
  disabled?: boolean;
  isValid?: boolean;
}> = ({
  id,
  label,
  required,
  value,
  onChange,
  type = "text",
  className = "",
  disabled = false,
  isValid = false,
}) => {
  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 px-4 pt-4 pb-2 outline-none transition ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
        } ${
          isValid && value
            ? "border-green-500"
            : "border-gray-400 focus:border-emerald-700"
        }`}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs ${
                   isValid && value
                     ? "text-green-700"
                     : "peer-focus:text-emerald-700"
                 } ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {isValid && value && (
        <CheckCircleIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
      )}
    </div>
  );
};

// Floating Textarea Component with success state
const FloatingTextarea: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  rows?: number;
  isValid?: boolean;
}> = ({
  id,
  label,
  required,
  value,
  onChange,
  className = "",
  disabled = false,
  rows = 3,
  isValid = false,
}) => {
  return (
    <div className={`relative ${className}`}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        disabled={disabled}
        rows={rows}
        className={`peer w-full rounded-xl border-2 px-4 pt-6 pb-2 outline-none transition resize-none ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
        } ${
          isValid && value
            ? "border-green-500"
            : "border-gray-400 focus:border-emerald-700"
        }`}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-4 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs ${
                   isValid && value
                     ? "text-green-700"
                     : "peer-focus:text-emerald-700"
                 } ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {isValid && value && (
        <CheckCircleIcon className="absolute right-3 top-6 h-5 w-5 text-green-500" />
      )}
    </div>
  );
};

// Floating Date Input Component with success state
const FloatingDateInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  isValid?: boolean;
}> = ({
  id,
  label,
  required,
  value,
  onChange,
  className = "",
  disabled = false,
  isValid = false,
}) => {
  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 px-4 pt-4 pb-2 outline-none transition ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
        } ${
          isValid && value
            ? "border-green-500"
            : "border-gray-400 focus:border-emerald-700"
        }`}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs ${
                   isValid && value
                     ? "text-green-700"
                     : "peer-focus:text-emerald-700"
                 } ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {isValid && value && (
        <CheckCircleIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
      )}
    </div>
  );
};

interface EventType {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  createdAt?: Date;
}

export default function CalendarEvent() {
  const [events, setEvents] = useState<EventType[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form states - gaya ng AccReg
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");

  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  const handleDashboardClick = () => {
    navigate("/Dashboard");
  };

  useEffect(() => {
    async function fetchEvents() {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => {
          const data = doc.data();

          const startDate =
            data.start && typeof data.start.toDate === "function"
              ? data.start.toDate()
              : new Date();

          let endDate =
            data.end && typeof data.end.toDate === "function"
              ? data.end.toDate()
              : null;

          if (
            !endDate ||
            isNaN(endDate.getTime()) ||
            endDate.getTime() <= startDate.getTime()
          ) {
            endDate = new Date(startDate.getTime() + 60000);
          }

          let createdAt =
            data.createdAt && typeof data.createdAt.toDate === "function"
              ? data.createdAt.toDate()
              : new Date();

          return {
            id: doc.id,
            title: data.title,
            start: startDate,
            end: endDate,
            description: data.description || "",
            createdAt: createdAt,
          };
        }) as EventType[];
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    fetchEvents();
  }, []);

  // Reset form function - gaya ng AccReg
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStart("");
    setSelectedEvent(null);
    setIsEditing(false);
    setIsProcessing(false);
    setShowSuccess(false);
    setShowDeleteConfirm(false);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  // Handle event selection from calendar - DIRECT EDIT/DELETE
  const handleSelectEvent = (event: EventType) => {
    setSelectedEvent(event);
    setShowDeleteConfirm(false);
  };

  // Handle event selection from list - DIRECT EDIT/DELETE
  const handleEventItemClick = (event: EventType) => {
    setSelectedEvent(event);
    setShowDeleteConfirm(false);
  };

  // Edit event - DIRECT OPEN MODAL
  const handleEditEvent = () => {
    if (selectedEvent) {
      setIsEditing(true);
      setTitle(selectedEvent.title);
      setDescription(selectedEvent.description || "");
      setStart(selectedEvent.start.toISOString().slice(0, 16));
      setShowModal(true);
    }
  };

  // Show delete confirmation
  const handleShowDeleteConfirm = () => {
    setShowDeleteConfirm(true);
  };

  // Cancel delete
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // Delete event - DIRECT DELETE
  const handleDeleteEvent = async () => {
    if (selectedEvent && selectedEvent.id) {
      try {
        await deleteDoc(doc(db, "events", selectedEvent.id));
        setEvents(events.filter((event) => event.id !== selectedEvent.id));
        setSelectedEvent(null);
        setShowDeleteConfirm(false);
        console.log("Event deleted successfully!");
      } catch (error) {
        console.error("Error deleting event:", error);
      }
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    if (!title || !start) {
      console.log("Please fill in the Event Title and Date/Time.");
      setIsProcessing(false);
      return;
    }

    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) {
      console.log("Invalid date format. Please use the date/time picker.");
      setIsProcessing(false);
      return;
    }

    // Calculate end date automatically as 1 hour after start
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    try {
      if (isEditing && selectedEvent && selectedEvent.id) {
        // Update existing event
        const eventRef = doc(db, "events", selectedEvent.id);
        await updateDoc(eventRef, {
          title: title,
          start: startDate,
          end: endDate,
          description: description,
        });

        setEvents(
          events.map((event) =>
            event.id === selectedEvent.id
              ? {
                  ...event,
                  title: title,
                  start: startDate,
                  end: endDate,
                  description: description,
                }
              : event
          )
        );

        // Show success state
        setShowSuccess(true);
        setTimeout(() => {
          handleCloseModal();
        }, 1500);
      } else {
        // Add new event
        const docRef = await addDoc(collection(db, "events"), {
          title: title,
          start: startDate,
          end: endDate,
          description: description,
          createdAt: serverTimestamp(),
        });

        setEvents((prev) => [
          ...prev,
          {
            title: title,
            start: startDate,
            end: endDate,
            description: description,
            id: docRef.id,
            createdAt: new Date(),
          },
        ]);

        // Show success state
        setShowSuccess(true);
        setTimeout(() => {
          handleCloseModal();
        }, 1500);
      }
    } catch (e) {
      console.error("Error saving event:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Check if form is valid
  const isFormValid = title.trim() !== "" && start.trim() !== "";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* TOP HEADER - Calendar Events Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        {/* Calendar Events Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">
            Calendar Events
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
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
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-700 rounded-full hover:bg-emerald-800"
              disabled={isProcessing}
            >
              <PlusIcon className="h-4 w-4" /> Add Event
            </button>
          </div>

          {/* Selected Event Actions */}
          {selectedEvent && (
            <div className="bg-white p-4 rounded-lg shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">{selectedEvent.title}</h3>
                  {selectedEvent.description && (
                    <p className="text-gray-600">{selectedEvent.description}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    {selectedEvent.start.toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEditEvent}
                    className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </button>

                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md p-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-700 font-medium">
                        Delete this event?
                      </span>
                      <button
                        onClick={handleDeleteEvent}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Yes
                      </button>
                      <button
                        onClick={handleCancelDelete}
                        className="text-xs bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleShowDeleteConfirm}
                      className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

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
                      className={`flex items-center gap-4 border-b pb-4 cursor-pointer transition-colors ${
                        selectedEvent?.id === event.id
                          ? "bg-blue-50 border-blue-300"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => handleEventItemClick(event)}
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
                        <div className="font-bold text-lg font-montserrat">
                          {event.title}
                        </div>
                        {/* Display description in the list (shortened) */}
                        {event.description && (
                          <div className="text-sm text-gray-500 italic">
                            {event.description.substring(0, 50)}
                            {event.description.length > 50 ? "..." : ""}
                          </div>
                        )}
                        <div className="text-sm text-gray-600 mt-5">
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
                endAccessor="end"
                style={{ height: 500 }}
                onSelectEvent={handleSelectEvent}
                eventPropGetter={(event) => ({
                  style: {
                    backgroundColor:
                      selectedEvent?.id === event.id ? "#1e40af" : "#1e4643",
                    border:
                      selectedEvent?.id === event.id
                        ? "2px solid #3b82f6"
                        : "1px solid #1e4643",
                  },
                })}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Create/Edit Event Modal - GAYA NG AccReg STYLE */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {showSuccess ? (
              <div className="text-center py-8">
                <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                  {isEditing
                    ? "Event Updated Successfully!"
                    : "Event Created Successfully!"}
                </h2>
                <p className="text-gray-600">
                  The event has been saved successfully.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
                  {isEditing ? `Edit Event: ${title}` : "Create New Event"}
                </h2>
                <form onSubmit={handleAddEvent}>
                  <div className="grid grid-cols-1 gap-4">
                    <FloatingInput
                      id="title"
                      label="Event Title"
                      required
                      value={title}
                      onChange={setTitle}
                      disabled={isProcessing}
                      isValid={title.trim() !== ""}
                    />

                    <FloatingTextarea
                      id="description"
                      label="Event Description (Optional)"
                      value={description}
                      onChange={setDescription}
                      disabled={isProcessing}
                      rows={3}
                      isValid={description.trim() !== ""}
                    />

                    <FloatingDateInput
                      id="start"
                      label="Event Date and Time"
                      required
                      value={start}
                      onChange={setStart}
                      disabled={isProcessing}
                      isValid={start.trim() !== ""}
                    />
                  </div>

                  {/* Form validation status */}
                  <div className="mt-4 p-3 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Form Status:</span>
                      {isFormValid ? (
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          <CheckCircleIcon className="h-4 w-4" />
                          Ready to {isEditing ? "update" : "create"}
                        </span>
                      ) : (
                        <span className="text-yellow-600 font-medium">
                          Fill in required fields
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-md text-sm hover:bg-gray-200"
                      onClick={handleCloseModal}
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2"
                      disabled={isProcessing || !isFormValid}
                    >
                      {isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          {isEditing ? "Update Event" : "Create Event"}
                          {isFormValid && (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
