import React, { useEffect, useMemo, useState } from "react";
import { FiClock, FiPlus, FiXCircle } from "react-icons/fi";
import { FaUsers, FaCheckCircle } from "react-icons/fa";
import { db, storage } from "../Firebase";
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// The Candidate type reflects the data to be saved to Firestore
type Candidate = {
  name: string;
  position: string;
  termDuration: string;
  photoURL: string;
};

// Updated type for the data you want to display on the dashboard
type DisplayCandidate = {
  name: string;
  position: string;
  votes: number;
  photoURL: string; // Added photoURL here
};

// Type for election details
type ElectionDetails = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

type Election = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  candidates: Candidate[];
  // NEW: Add a server-side timestamp for the end time
  endTimestamp?: Timestamp;
};

// --- CORRECTED HELPER FUNCTION TO RESET THE FORM ---
const resetElectionForm = () => ({
  title: "",
  date: "",
  startTime: "",
  endTime: "",
});

const resetCandidateForm = () => ({
  name: "",
  position: "President",
  termDuration: "",
  imageFile: null as File | null, // <-- CORRECTED: Explicitly define the type
});

export default function ElectionDashboard() {
  const [year, setYear] = useState<number>(2025);
  const [votingActive, setVotingActive] = useState<boolean>(true);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Bagong State para sa logic na gusto mo
  const [electionAlreadyExists, setElectionAlreadyExists] =
    useState<boolean>(false);
  const [activePosition, setActivePosition] = useState<string>("President");

  // State to hold fetched election data
  const [allCandidatesFromFirestore, setAllCandidatesFromFirestore] = useState<
    Candidate[]
  >([]);

  // State for election details
  const [electionDetails, setElectionDetails] = useState<ElectionDetails>(
    resetElectionForm()
  );

  // State for the single candidate form
  const [currentCandidate, setCurrentCandidate] = useState<{
    name: string;
    position: string;
    termDuration: string;
    imageFile: File | null; // <-- CORRECTED: Ensure state type matches the reset function
  }>(resetCandidateForm());

  // Main state to hold the list of candidates added to the form
  const [candidatesList, setCandidatesList] = useState<Candidate[]>([]);

  // State for voter stats
  const [voterStats, setVoterStats] = useState({
    total: 0,
    voted: 0,
    notVoted: 0,
  });

  // Use the fetched election data for the main candidate list
  const allCandidates: DisplayCandidate[] = useMemo(() => {
    return allCandidatesFromFirestore.map((candidate) => ({
      name: candidate.name,
      position: candidate.position,
      votes: 0, // In a real app, this would be fetched from the votes subcollection
      photoURL: candidate.photoURL, // Pass the photoURL here
    }));
  }, [allCandidatesFromFirestore]);

  // Filter the candidates based on the active position
  const filteredCandidates = useMemo(() => {
    return allCandidates.filter((c) => c.position === activePosition);
  }, [allCandidates, activePosition]);

  // Create a list of all unique positions from the allCandidates array
  const allPositions = useMemo(() => {
    const positions = allCandidates.map((c) => c.position);
    return [...new Set(positions)];
  }, [allCandidates]);

  // NEW LOGIC: Fetch total voters directly from Firestore "members" collection
  useEffect(() => {
    const fetchTotalVoters = async () => {
      try {
        const membersSnapshot = await getDocs(collection(db, "members"));
        const totalMembers = membersSnapshot.docs.length;
        setVoterStats((prevStats) => ({
          ...prevStats,
          total: totalMembers,
          notVoted: totalMembers - prevStats.voted,
        }));
      } catch (error) {
        console.error("Failed to fetch total voters from Firestore:", error);
      }
    };

    fetchTotalVoters();
  }, []); // Run only once on component mount

  // Fetch all election data from Firestore and combine the candidates
  useEffect(() => {
    const q = query(collection(db, "elections"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let combinedCandidates: Candidate[] = [];
      let isElectionFound = false; // Add a flag to track if an election exists

      querySnapshot.forEach((doc) => {
        const electionData = doc.data() as Election;
        if (electionData.candidates) {
          combinedCandidates = [
            ...combinedCandidates,
            ...electionData.candidates,
          ];
        }

        // Check the expiration date from Firestore
        if (electionData.endTimestamp) {
          const now = new Date();
          const endTime = electionData.endTimestamp.toDate();
          const remainingTime = Math.max(
            0,
            Math.floor((endTime.getTime() - now.getTime()) / 1000)
          );

          if (remainingTime > 0) {
            isElectionFound = true; // An un-expired election was found
            setVotingActive(true);
            setElectionDetails({
              title: electionData.title,
              date: electionData.date,
              startTime: electionData.startTime,
              endTime: electionData.endTime,
            });
            setDurationSeconds(remainingTime);
          }
        }
      });
      setAllCandidatesFromFirestore(combinedCandidates);

      setElectionAlreadyExists(isElectionFound);
      if (!isElectionFound) {
        setElectionDetails(resetElectionForm());
        setCandidatesList([]);
      }

      // Set the active position to the first position available
      if (combinedCandidates.length > 0) {
        setActivePosition(combinedCandidates[0].position);
      }
    });

    // Clean up function for both listeners
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (durationSeconds <= 0) {
      setVotingActive(false);
      // PAG-TAPOS NA ANG VOTING DURATION, I-RESET ANG FORM AT ANG `electionAlreadyExists`
      setElectionAlreadyExists(false);
      setElectionDetails(resetElectionForm());
      setCandidatesList([]);
      setCurrentCandidate(resetCandidateForm());
      return;
    }

    const t = setInterval(() => {
      setDurationSeconds((s) => s - 1);
    }, 1000);
    return () => clearInterval(t);
  }, [durationSeconds]);

  const formatDuration = (s: number): string => {
    const hh = Math.floor(s / 3600)
      .toString()
      .padStart(2, "0");
    const mm = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const handleElectionChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setElectionDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleCandidateChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setCurrentCandidate((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentCandidate((prev) => ({ ...prev, imageFile: file }));
    }
  };

  const handleAddCandidateToList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !currentCandidate.name ||
      !currentCandidate.position ||
      !currentCandidate.imageFile
    ) {
      alert("Please fill out all candidate fields.");
      return;
    }

    setIsSubmitting(true);
    let photoURL = "";
    try {
      const storageRef = ref(
        storage,
        `candidates/${currentCandidate.imageFile.name}`
      );
      await uploadBytes(storageRef, currentCandidate.imageFile);
      photoURL = await getDownloadURL(storageRef);

      const newCandidate: Candidate = {
        name: currentCandidate.name,
        position: currentCandidate.position,
        termDuration: currentCandidate.termDuration,
        photoURL: photoURL,
      };

      setCandidatesList((prev) => [...prev, newCandidate]);

      setCurrentCandidate(resetCandidateForm());
    } catch (error) {
      console.error("Error uploading image: ", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveElection = async () => {
    if (!electionDetails.title || !candidatesList.length) {
      alert("Please provide an election title and at least one candidate.");
      return;
    }

    setIsSubmitting(true);
    try {
      const electionEndDate = new Date(
        `${electionDetails.date}T${electionDetails.endTime}`
      );
      const electionStartDate = new Date(
        `${electionDetails.date}T${electionDetails.startTime}`
      );

      const durationInSeconds = Math.max(
        0,
        Math.floor(
          (electionEndDate.getTime() - electionStartDate.getTime()) / 1000
        )
      );

      setDurationSeconds(durationInSeconds);

      const electionDocRef = await addDoc(collection(db, "elections"), {
        ...electionDetails,
        candidates: candidatesList,
        createdAt: new Date(),
        endTimestamp: Timestamp.fromDate(electionEndDate),
      });
      console.log("Election saved with ID: ", electionDocRef.id);

      setElectionDetails(resetElectionForm());
      setCandidatesList([]);
      setShowForm(false);
    } catch (error) {
      console.error("Error saving election: ", error);
      alert("Failed to save election. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top accent bar and header */}
      <div className="bg-emerald-800 h-20 flex items-center px-8">
        <h1 className="text-3xl font-extrabold text-white">Election Module</h1>
        <div className="ml-auto flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
            J
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Election Status card */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-gray-100 px-6 py-4 flex items-center justify-between">
            <div className="font-semibold">Election Status</div>
            <div className="flex items-center gap-3">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600"
              >
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
                <option value={2023}>2023</option>
              </select>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 bg-emerald-700 text-white px-3 py-1 rounded shadow"
                disabled={electionAlreadyExists}
              >
                <FiPlus /> New Election
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              <div className="relative bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                <div className="border-l-4 border-amber-400 pl-4">
                  <div className="text-sm text-amber-500">Total Voters</div>
                  <div className="text-2xl font-semibold">
                    {voterStats.total}
                  </div>
                </div>
                <div className="ml-auto text-3xl text-amber-400">
                  <FaUsers />
                </div>
              </div>

              <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                <div className="border-l-4 border-emerald-700 pl-4">
                  <div className="text-sm text-emerald-700">Voted</div>
                  <div className="text-2xl font-semibold">
                    {voterStats.voted}
                  </div>
                </div>
                <div className="ml-auto text-3xl text-emerald-700">
                  <FaCheckCircle />
                </div>
              </div>

              <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                <div className="border-l-4 border-red-500 pl-4">
                  <div className="text-sm text-red-500">Not Voted</div>
                  <div className="text-2xl font-semibold">
                    {voterStats.notVoted}
                  </div>
                </div>
                <div className="ml-auto text-3xl text-red-500">
                  <FiXCircle />
                </div>
              </div>

              <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                <div className="border-l-4 border-gray-400 pl-4">
                  <div className="text-sm text-gray-600">Voting Duration</div>
                  <div className="text-2xl font-semibold">
                    {formatDuration(durationSeconds)}
                  </div>
                </div>
                <div className="ml-auto text-3xl text-gray-600">
                  <FiClock />
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="mt-8 bg-white border rounded shadow-sm flex">
              <aside className="w-48 bg-gray-800 text-white p-6">
                <nav className="flex flex-col gap-6 text-sm">
                  {allPositions.map((position) => (
                    <button
                      key={position}
                      onClick={() => setActivePosition(position)}
                      className={`text-left ${
                        activePosition === position
                          ? "font-bold text-emerald-300"
                          : "text-white"
                      }`}
                    >
                      {position}
                    </button>
                  ))}
                </nav>
              </aside>

              <div className="flex-1 p-6">
                <div className="flex items-start justify-between">
                  <h2 className="text-xl font-semibold">
                    Voting Count Election {year}
                  </h2>
                  <div>
                    <button
                      onClick={() => setVotingActive(false)}
                      className="flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded"
                    >
                      <FiXCircle /> Stop Voting
                    </button>
                  </div>
                </div>

                <div className="mt-6 bg-gray-50 border rounded p-8 shadow-inner">
                  {filteredCandidates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 items-start text-center">
                      {filteredCandidates.map((c, index) => (
                        <div
                          key={index}
                          className="flex flex-col items-center gap-4"
                        >
                          {/* Updated Image Display */}
                          {c.photoURL ? (
                            <img
                              src={c.photoURL}
                              alt={c.name}
                              className="w-40 h-40 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-40 h-40 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-500">
                              No Image
                            </div>
                          )}
                          {/* End of Updated Image Display */}
                          <div className="text-lg font-semibold">{c.name}</div>
                          <div className="w-36 bg-gray-200 rounded-md py-3 text-2xl font-bold">
                            {c.votes}
                          </div>
                          <div className="text-sm text-gray-500">Votes</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      Walang kandidato para sa posisyon na ito.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 relative">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-2 right-2 text-gray-600 hover:text-black"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-6 border-b pb-2">
              Create New Election
            </h2>

            {/* Election Details */}
            <div className="mb-6">
              <h3 className="font-semibold mb-3">Election Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm">Election Title</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    name="title"
                    value={electionDetails.title}
                    onChange={handleElectionChange}
                    // Updated logic: if election already exists, disable the field
                    disabled={electionAlreadyExists}
                  />
                </div>
                <div>
                  <label className="block text-sm">Election Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 mt-1"
                    name="date"
                    value={electionDetails.date}
                    onChange={handleElectionChange}
                    // Updated logic: if election already exists, disable the field
                    disabled={electionAlreadyExists}
                  />
                </div>
                <div>
                  <label className="block text-sm">Voting Time Duration</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="time"
                      className="w-full border rounded px-3 py-2"
                      name="startTime"
                      value={electionDetails.startTime}
                      onChange={handleElectionChange}
                      // Updated logic: if election already exists, disable the field
                      disabled={electionAlreadyExists}
                    />
                    <span className="self-center">to</span>
                    <input
                      type="time"
                      className="w-full border rounded px-3 py-2"
                      name="endTime"
                      value={electionDetails.endTime}
                      onChange={handleElectionChange}
                      // Updated logic: if election already exists, disable the field
                      disabled={electionAlreadyExists}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Candidates */}
            <div>
              <h3 className="font-semibold mb-3">Candidates</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm">Candidate Name</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    name="name"
                    value={currentCandidate.name}
                    onChange={handleCandidateChange}
                  />
                </div>
                <div>
                  <label className="block text-sm">Position</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    name="position"
                    value={currentCandidate.position}
                    onChange={handleCandidateChange}
                  >
                    <option>President</option>
                    <option>Vice President</option>
                    <option>Treasurer</option>
                    <option>Secretary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Term Duration</label>
                  <input
                    type="text"
                    placeholder="00 Years"
                    className="w-full border rounded px-3 py-2 mt-1"
                    name="termDuration"
                    value={currentCandidate.termDuration}
                    onChange={handleCandidateChange}
                  />
                </div>
                <div className="relative flex items-center justify-center border-2 border-dashed rounded h-28">
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                  />
                  {currentCandidate.imageFile ? (
                    <img
                      src={URL.createObjectURL(currentCandidate.imageFile)}
                      alt="Preview"
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <span className="text-gray-500">+ Add Image</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddCandidateToList}
                disabled={isSubmitting}
                className="mt-4 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 disabled:bg-gray-400"
              >
                {isSubmitting ? "Uploading..." : "+ Add Candidate"}
              </button>
            </div>

            {/* Display added candidates */}
            {candidatesList.length > 0 && (
              <div className="mt-6 p-4 border rounded">
                <h4 className="font-semibold mb-2">Candidates to be Saved:</h4>
                <ul className="list-disc list-inside">
                  {candidatesList.map((c, index) => (
                    <li key={index}>
                      {c.name} - {c.position} ({c.termDuration || "N/A"})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Final Save Button */}
            <div className="mt-6 text-right">
              <button
                onClick={handleSaveElection}
                disabled={isSubmitting || !candidatesList.length}
                className="bg-emerald-700 text-white px-6 py-2 rounded-lg shadow hover:bg-emerald-800 disabled:bg-gray-400"
              >
                {isSubmitting ? "Saving Election..." : "Save Election"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}